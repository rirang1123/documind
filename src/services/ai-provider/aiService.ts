import type { AIProvider } from '@/types'
import { keychain } from '@/services/credential/keychainService'
import { recordAIUsage } from '../db'
import { generateId } from '@/utils/id'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

function estimateTokens(text: string): number {
  // Rough estimate: 1 token ~ 4 characters for English, 2 characters for Korean
  return Math.ceil(text.length / 3)
}

/** Keychain에서 AI API 키를 가져옴 */
async function getApiKey(provider: AIProvider): Promise<string> {
  const apiKey = await keychain.getAiApiKey(provider.id)
  if (!apiKey) {
    throw new Error(`[${provider.name}] API 키가 설정되지 않았습니다.\n설정에서 API 키를 등록해주세요.`)
  }
  return apiKey
}

class AIService {
  private extractRetrySeconds(message: string): number | null {
    const match = message.match(/retry\s+in\s+([\d.]+)s/i)
    return match ? Math.ceil(parseFloat(match[1])) : null
  }

  private formatError(provider: AIProvider, status: number, errorBody: Record<string, unknown>): Error {
    const rawMessage = (errorBody as { error?: { message?: string } }).error?.message || ''

    // Rate limit (429) - 사용량 한도 도달
    if (status === 429 || rawMessage.includes('rate')) {
      const retrySec = this.extractRetrySeconds(rawMessage)
      return new Error(
        `[${provider.name}] 요청 한도에 도달했습니다.\n\n` +
        (retrySec
          ? `약 ${retrySec}초 후에 다시 시도해주세요.`
          : `잠시 후 다시 시도해주세요.`)
      )
    }

    // Quota exceeded - 무료 한도 소진 (일일/월간)
    if (rawMessage.includes('quota') || rawMessage.includes('limit')) {
      const isFreeTier = rawMessage.includes('free_tier')
      return new Error(
        `[${provider.name}] ${isFreeTier ? '무료 티어' : 'API'} 사용량 한도 도달\n\n` +
        `${isFreeTier
          ? '무료 API의 일일 사용 한도에 도달했습니다.\n' +
            '해결 방법:\n' +
            '• 일일 한도가 초기화될 때까지 대기\n' +
            '• 설정에서 다른 AI 제공자로 변경\n' +
            '• 유료 플랜으로 업그레이드'
          : 'API 사용량 한도에 도달했습니다. 잠시 후 다시 시도해주세요.'
        }`
      )
    }

    // Invalid API key
    if (rawMessage.includes('invalid') || rawMessage.includes('Incorrect') || status === 401) {
      return new Error(
        `[${provider.name}] API 키가 유효하지 않습니다.\n` +
        `설정에서 API 키를 다시 확인해주세요.`
      )
    }

    return new Error(`[${provider.name}] API 오류 (${status}): ${rawMessage || '알 수 없는 오류'}`)
  }

  async chat(provider: AIProvider, messages: ChatMessage[], feature: string = 'chat'): Promise<string> {
    const apiKey = await getApiKey(provider)

    let result: string
    switch (provider.type) {
      case 'openai':
        result = await this.chatOpenAI(provider, apiKey, messages)
        break
      case 'anthropic':
        result = await this.chatAnthropic(provider, apiKey, messages)
        break
      case 'google':
        result = await this.chatGoogle(provider, apiKey, messages)
        break
      default:
        throw new Error(`지원하지 않는 AI 제공자: ${provider.type}`)
    }

    try {
      await recordAIUsage({
        id: generateId(),
        provider: provider.type,
        model: provider.model,
        inputTokens: estimateTokens(messages.map(m => m.content).join('')),
        outputTokens: estimateTokens(result),
        timestamp: new Date(),
        feature,
      })
    } catch (e) {
      console.error('Failed to record AI usage:', e)
    }

    return result
  }

  private async chatOpenAI(provider: AIProvider, apiKey: string, messages: ChatMessage[]): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: 0.7,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw this.formatError(provider, res.status, err)
    }

    const data = await res.json()
    return data.choices[0].message.content
  }

  private async chatAnthropic(provider: AIProvider, apiKey: string, messages: ChatMessage[]): Promise<string> {
    const systemMsg = messages.find((m) => m.role === 'system')
    const nonSystemMessages = messages.filter((m) => m.role !== 'system')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 4096,
        system: systemMsg?.content,
        messages: nonSystemMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw this.formatError(provider, res.status, err)
    }

    const data = await res.json()
    return data.content[0].text
  }

  private async chatGoogle(provider: AIProvider, apiKey: string, messages: ChatMessage[]): Promise<string> {
    const systemMsg = messages.find((m) => m.role === 'system')
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))

    const body: Record<string, unknown> = { contents }
    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] }
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw this.formatError(provider, res.status, err)
    }

    const data = await res.json()
    return data.candidates[0].content.parts[0].text
  }

  async classifyDocument(
    provider: AIProvider,
    documentContent: string,
    _existingProjects: string[],
    existingCategories: string[]
  ): Promise<{ project: string; category: string; tags: string[] }> {
    const prompt = `다음 문서의 **구조와 내용**을 분석하여 문서 유형을 분류해주세요.

## 분류 카테고리
${existingCategories.join(', ') || 'planning(기획), evaluation(평가), report(보고), reference(참고자료), meeting(회의), contract(계약), finance(재무), other(기타)'}

## 분류 기준 (우선순위 순)
1. **문서 구조**: 참석자/안건/논의사항 → 회의, 제1조/갑을/계약기간 → 계약, 합계/소계/금액 → 재무
2. **본문 내용의 성격**: 실제 본문이 다루는 주제와 목적
3. **제목**: 구조와 내용이 불분명할 때만 참고 (제목은 오해의 소지가 있음)

⚠️ 주의: 제목에 "기획"이 있어도 본문이 회의 내용이면 → meeting
⚠️ 주의: 제목에 "보고"가 있어도 본문이 계획서 구조면 → planning

## 문서
${documentContent.slice(0, 2000)}

## 응답 (JSON만, 설명 없이)
{"category": "카테고리 key (예: meeting, planning 등)", "tags": ["태그1", "태그2", "태그3"]}`

    const response = await this.chat(provider, [
      {
        role: 'system',
        content: '당신은 문서 구조 분석 전문가입니다. 문서의 제목이 아닌 본문의 구조와 내용을 기반으로 문서 유형을 정확히 판별합니다. 반드시 JSON만 응답합니다.',
      },
      { role: 'user', content: prompt },
    ], 'classify')

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch {}

    return { project: '미분류', category: '기타', tags: [] }
  }

  /**
   * AI 2차 검증 분류 (규칙 엔진 결과를 힌트로 제공)
   *
   * 규칙 엔진이 1차 분류한 결과(카테고리, 점수 분포)를 AI에게 제공하여
   * 동의/교정 판단을 받는다. AI는 규칙 결과를 참고하되 독립적으로 판단.
   */
  async validateClassification(
    provider: AIProvider,
    documentContent: string,
    ruleResult: {
      category: string
      confidence: number
      topScores: { category: string; label: string; score: number }[]
    },
    existingCategories: string[]
  ): Promise<{ category: string; tags: string[]; agreed: boolean }> {
    const scoresText = ruleResult.topScores
      .map((s, i) => `${i + 1}. ${s.label}(${s.category}) — ${s.score.toFixed(1)}점`)
      .join('\n')

    const prompt = `다음 문서의 분류를 검증해주세요.

## 규칙 엔진 1차 분류 결과
- **분류**: ${ruleResult.category} (신뢰도: ${(ruleResult.confidence * 100).toFixed(0)}%)
- **점수 분포**:
${scoresText}

## 분류 카테고리
${existingCategories.join(', ') || 'planning(기획), evaluation(평가), report(보고), reference(참고자료), meeting(회의), contract(계약), finance(재무), other(기타)'}

## 검증 기준
1. 규칙 엔진의 1차 결과가 맞는지 **문서 구조와 내용**으로 판단
2. 점수 분포에서 2위 카테고리가 더 적합하지 않은지 검토
3. 문서의 "형식(format)"이 분류 기준 (주제가 아닌 문서 유형)
   - "예산 분석 보고서" → report (재무가 아닌 보고서 형식)
   - "채용 결과 보고" → report (평가가 아닌 보고서 형식)
   - "위탁 전환 검토서" → evaluation (계약이 아닌 평가 형식)

## 문서
${documentContent.slice(0, 2000)}

## 응답 (JSON만, 설명 없이)
{"category": "최종 카테고리 key", "tags": ["태그1", "태그2", "태그3"], "agreed": true/false}`

    const response = await this.chat(provider, [
      {
        role: 'system',
        content: '당신은 문서 분류 검증 전문가입니다. 규칙 엔진의 1차 분류 결과를 검토하고, 문서의 구조와 내용을 기반으로 동의 또는 교정합니다. 반드시 JSON만 응답합니다.',
      },
      { role: 'user', content: prompt },
    ], 'classify')

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch {}

    // 파싱 실패 시 규칙 결과 동의로 처리
    return { category: ruleResult.category, tags: [], agreed: true }
  }

  /**
   * 오분류 원인 분석 및 학습 규칙 생성
   *
   * 사용자가 분류를 수정했을 때 호출. AI가 원인을 분석하고
   * 향후 동일 패턴에 적용할 키워드 규칙을 생성한다.
   *
   * 프롬프트와 응답을 함께 반환하여 DB에 저장 → AI provider 교체 시에도 학습 유지
   */
  async analyzeMisclassification(
    provider: AIProvider,
    documentTitle: string,
    documentContent: string,
    originalCategory: string,
    correctedCategory: string,
    existingCategories: string[]
  ): Promise<{
    keywords: string[]
    reason: string
    prompt: string
    response: string
  }> {
    const prompt = `사용자가 문서 분류를 수정했습니다. 오분류 원인을 분석하고 학습 규칙을 생성해주세요.

## 상황
- **문서 제목**: ${documentTitle}
- **시스템 분류**: ${originalCategory}
- **사용자 교정**: ${correctedCategory}

## 분류 카테고리
${existingCategories.join(', ')}

## 문서 내용 (발췌)
${documentContent.slice(0, 1500)}

## 분석 요청
1. **오분류 원인**: 왜 시스템이 "${originalCategory}"로 분류했는지 (어떤 키워드/구조가 오해를 유발했는지)
2. **교정 근거**: 왜 "${correctedCategory}"가 올바른지 (문서의 핵심 구조/형식 기준)
3. **학습 키워드**: 향후 유사 문서를 "${correctedCategory}"로 분류하기 위해 감지해야 할 핵심 키워드 3~7개
   - 이 문서에만 특수한 단어가 아닌, 같은 유형의 문서에서 공통으로 나타나는 패턴
   - 가능하면 2어절 이상의 복합 키워드 포함 (예: "타당성 분석", "도입 검토")

## 응답 (JSON만, 설명 없이)
{"keywords": ["키워드1", "키워드2", ...], "reason": "오분류 원인 1~2문장"}`

    const response = await this.chat(provider, [
      {
        role: 'system',
        content: '당신은 문서 분류 시스템의 학습 전문가입니다. 오분류 원인을 정확히 진단하고, 재발 방지를 위한 일반화된 키워드 규칙을 생성합니다. 반드시 JSON만 응답합니다.',
      },
      { role: 'user', content: prompt },
    ], 'classify')

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          keywords: parsed.keywords || [],
          reason: parsed.reason || '',
          prompt,    // 프롬프트 원본 저장 (모델 독립)
          response,  // AI 응답 원본 저장 (추후 재학습용)
        }
      }
    } catch {}

    return { keywords: [], reason: '분석 실패', prompt, response }
  }

  /**
   * 커스텀 폴더 패턴 분석
   *
   * 사용자가 파일을 커스텀 폴더로 이동했을 때 호출.
   * 해당 폴더에 이미 있는 파일명들 + 새로 넣은 파일을 보고
   * 폴더의 정리 기준(파일명 패턴, 내용 키워드)을 추론한다.
   */
  async analyzeFolderPattern(
    provider: AIProvider,
    folderName: string,
    existingFileTitles: string[],
    newFileTitle: string,
    newFileContent: string,
  ): Promise<{
    titlePatterns: string[]
    keywords: string[]
    reason: string
    prompt: string
    response: string
  }> {
    const fileList = [...existingFileTitles, newFileTitle]
      .map((t, i) => `${i + 1}. ${t}`)
      .join('\n')

    const prompt = `사용자가 파일을 특정 폴더로 정리했습니다. 이 폴더의 파일 분류 기준을 분석해주세요.

## 폴더 정보
- **폴더명**: "${folderName}"
- **폴더 내 파일 목록**:
${fileList}

## 새로 추가된 파일
- **제목**: ${newFileTitle}
- **내용 발췌**: ${newFileContent.slice(0, 1000)}

## 분석 요청
이 폴더에 들어가는 파일들의 공통 패턴을 찾아주세요:

1. **titlePatterns**: 파일명에서 반복되는 패턴 (예: "월간", "2024", "Q1", "김팀장" 등)
   - 이 폴더에 새 파일이 들어올 때 파일명만으로 매칭할 수 있는 핵심 단어 1~5개
   - 너무 일반적인 단어("문서", "파일") 제외, 이 폴더에 특화된 패턴만

2. **keywords**: 파일 내용에서 반복되는 주제 키워드 (예: "마케팅 예산", "월간 보고" 등)
   - 파일명으로 판단이 어려울 때 내용으로 매칭할 수 있는 핵심 키워드 2~5개

3. **reason**: 이 폴더의 정리 기준을 1~2문장으로 요약
   (예: "2024년도 월간 마케팅 보고서를 모아두는 폴더")

## 응답 (JSON만, 설명 없이)
{"titlePatterns": ["패턴1", ...], "keywords": ["키워드1", ...], "reason": "폴더 정리 기준 요약"}`

    const response = await this.chat(provider, [
      {
        role: 'system',
        content: '당신은 파일 정리 패턴 분석 전문가입니다. 사용자의 폴더 구조와 파일명을 보고 정리 기준을 정확히 추론합니다. 반드시 JSON만 응답합니다.',
      },
      { role: 'user', content: prompt },
    ], 'classify')

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          titlePatterns: parsed.titlePatterns || [],
          keywords: parsed.keywords || [],
          reason: parsed.reason || '',
          prompt,
          response,
        }
      }
    } catch {}

    return { titlePatterns: [], keywords: [], reason: '분석 실패', prompt, response }
  }
}

export const aiService = new AIService()
