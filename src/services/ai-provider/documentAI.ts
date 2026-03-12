import type { AIProvider, AIBehavior, AppSettings } from '@/types'
import { DEFAULT_AI_BEHAVIOR } from '@/types'
import { aiService } from './aiService'
import type { SheetData } from '@/services/document/excelService'

export async function generateOutline(
  topic: string,
  docType: string,
  answers: string[],
  settings: AppSettings
): Promise<string> {
  const activeProvider = settings.aiProviders.find(p => p.id === settings.activeProviderId)
  if (!activeProvider) throw new Error('활성화된 AI 제공자가 없습니다.')

  const behavior = settings.aiBehavior || DEFAULT_AI_BEHAVIOR

  const prompt = `주제: ${topic}
문서 유형: ${docType}
추가 정보: ${answers.join(', ')}

위 정보를 바탕으로 문서의 아웃라인(목차 구조)만 생성해주세요.
- H1, H2, H3 수준의 제목 계층으로 구성
- 각 섹션에 한 줄 설명 포함
- HTML 형식으로 반환 (h1, h2, h3 태그와 p 태그 사용)
- 톤: ${behavior.tone}, 상세도: ${behavior.detailLevel}, 스타일: ${behavior.writingStyle}`

  return await aiService.chat(activeProvider, [{ role: 'user', content: prompt }])
}

export async function rewriteText(
  selectedText: string,
  instruction: 'rewrite' | 'elaborate' | 'simplify' | 'formal' | 'casual',
  settings: AppSettings
): Promise<string> {
  const activeProvider = settings.aiProviders.find(p => p.id === settings.activeProviderId)
  if (!activeProvider) throw new Error('활성화된 AI 제공자가 없습니다.')

  const instructionMap = {
    rewrite: '다음 텍스트를 다시 작성해주세요. 의미는 유지하되 표현을 개선해주세요.',
    elaborate: '다음 텍스트를 더 자세하고 풍부하게 확장해주세요.',
    simplify: '다음 텍스트를 더 간결하고 명확하게 줄여주세요.',
    formal: '다음 텍스트를 격식체/공식적인 톤으로 변환해주세요.',
    casual: '다음 텍스트를 친근하고 캐주얼한 톤으로 변환해주세요.',
  }

  const result = await aiService.chat(
    activeProvider,
    [{ role: 'user', content: `${instructionMap[instruction]}\n\n원본 텍스트:\n${selectedText}\n\n수정된 텍스트만 반환해주세요. 추가 설명은 불필요합니다.` }]
  )

  return result
}

function buildBehaviorPrompt(behavior?: AIBehavior): string {
  const b = behavior || DEFAULT_AI_BEHAVIOR
  const parts: string[] = []

  const toneMap = { formal: '격식체(~습니다, ~입니다)로', casual: '편한 톤(~해요, ~이에요)으로', concise: '간결하게 핵심만' }
  parts.push(`- 톤: ${toneMap[b.tone]} 작성`)

  const detailMap = { brief: '핵심만 간략하게', moderate: '적절한 분량으로', detailed: '상세하고 자세하게' }
  parts.push(`- 분량: ${detailMap[b.detailLevel]}`)

  const styleMap = { professional: '비즈니스 전문 문체', friendly: '친근하고 부드러운 문체', academic: '학술적이고 논리적인 문체' }
  parts.push(`- 문체: ${styleMap[b.writingStyle]}`)

  if (b.customInstructions.trim()) {
    parts.push(`- 추가 지시: ${b.customInstructions.trim()}`)
  }

  return parts.join('\n')
}

function cleanHtmlResponse(raw: string): string {
  let html = raw.trim()
  html = html.replace(/^```(?:html)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
  html = html.replace(/```(?:html)?\s*\n/gi, '').replace(/\n?```/g, '')
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  if (bodyMatch) {
    html = bodyMatch[1].trim()
  } else {
    html = html
      .replace(/<!DOCTYPE[^>]*>/gi, '')
      .replace(/<\/?html[^>]*>/gi, '')
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/<\/?body[^>]*>/gi, '')
      .trim()
  }
  return html
}

export interface DocumentQuestion {
  key: string
  question: string
  placeholder: string
}

const TYPE_LABELS: Record<string, string> = {
  report: '보고서',
  proposal: '기획서',
  meeting: '회의록',
  email: '이메일',
  general: '일반 문서',
}

/** 문서 유형별 기본 틀(템플릿 구조) */
const DOCUMENT_TEMPLATES: Record<string, string> = {
  report: `[보고서 기본 구조]
1. 제목
2. 개요 - 보고서의 목적과 배경 요약
3. 현황/배경 - 관련 현황, 배경 정보, 이전 경과
4. 주요 내용 - 핵심 데이터, 분석 결과, 조사 내용
5. 분석/평가 - 현황에 대한 분석과 평가
6. 결론 - 핵심 요약과 시사점
7. 향후 계획/제언 - 다음 단계, 개선 방안`,

  proposal: `[기획서 기본 구조]
1. 제목
2. 기획 배경 - 왜 이 기획이 필요한지 (문제 인식, 기회 요인)
3. 목적 및 목표 - 달성하려는 구체적 목표
4. 대상 및 범위 - 누구를 위한 것이며 범위는 어디까지인지
5. 핵심 내용/전략 - 구체적 실행 방안, 핵심 기능, 주요 전략
6. 추진 일정 - 단계별 일정 (표 형태 권장)
7. 예상 비용/자원 - 필요 자원과 예산
8. 기대 효과 - 예상되는 성과와 효과
9. 리스크 및 대응방안 - 예상 문제점과 해결 방안`,

  meeting: `[회의록 기본 구조]
1. 회의 정보 - 일시, 장소, 참석자
2. 회의 목적/안건 - 이번 회의에서 다룰 주제
3. 논의 내용 - 안건별 논의된 내용 상세
4. 결정 사항 - 합의된 결정 사항 목록
5. 후속 조치 - 담당자, 기한이 포함된 Action Item 목록
6. 다음 회의 - 다음 회의 일정, 예정 안건`,

  email: `[이메일 기본 구조]
1. 인사말
2. 목적/배경 - 이메일을 보내는 이유
3. 본문 - 전달할 핵심 내용
4. 요청 사항 - 상대방에게 부탁하는 내용 (있는 경우)
5. 마무리 인사`,

  general: `[문서 기본 구조]
1. 제목
2. 개요 - 문서의 목적과 요약
3. 본문 - 주제에 맞는 핵심 내용 (적절히 소제목으로 구분)
4. 정리/마무리`,
}

export const documentAI = {
  /** AI가 주제와 문서 유형을 분석하여 맥락에 맞는 질문을 동적 생성 */
  async generateQuestions(
    provider: AIProvider,
    type: 'report' | 'proposal' | 'meeting' | 'email' | 'general',
    topic: string
  ): Promise<DocumentQuestion[]> {
    const label = TYPE_LABELS[type] || '문서'

    const response = await aiService.chat(provider, [
      {
        role: 'system',
        content: `당신은 ${label} 작성을 돕는 어시스턴트입니다.
사용자가 "${topic}"이라는 주제로 ${label}를 작성하려 합니다.

이 주제와 문서 유형에 맞춰, 좋은 문서를 작성하기 위해 사용자에게 물어봐야 할 질문들을 생성하세요.

규칙:
- 3~5개의 질문을 JSON 배열로 응답
- 주제의 맥락에 맞는 구체적인 질문을 하세요 (모든 문서에 공통으로 쓸 수 있는 뻔한 질문 금지)
- 사용자가 이미 주제에서 언급한 정보는 다시 묻지 마세요
- 답변하기 쉽도록 질문은 명확하고 구체적으로
- placeholder는 이 주제에 맞는 실제적인 예시 답변으로
- 모르면 건너뛸 수 있으니 꼭 필요한 것만 질문
- JSON 배열만 응답하세요. 다른 텍스트 금지.

형식:
[{"key": "고유키(영문)", "question": "질문 내용", "placeholder": "이 주제에 맞는 예시 답변"}]`,
      },
      {
        role: 'user',
        content: `문서 유형: ${label}\n주제: ${topic}`,
      },
    ])

    try {
      const match = response.match(/\[[\s\S]*\]/)
      if (match) {
        const parsed = JSON.parse(match[0]) as DocumentQuestion[]
        const valid = parsed.filter((q) => q.key && q.question)
        if (valid.length > 0) return valid
      }
    } catch {
      console.error('[documentAI] 질문 생성 파싱 실패')
    }

    // AI 응답 실패 시 최소한의 일반 질문
    return [
      { key: 'detail', question: '이 문서에 어떤 내용을 담고 싶으신가요?', placeholder: '핵심 내용을 알려주세요' },
      { key: 'audience', question: '이 문서를 읽을 대상은 누구인가요?', placeholder: '예: 팀원, 고객, 경영진' },
    ]
  },

  /** 수집된 정보를 바탕으로 추가 질문이 필요한지 AI가 판단 */
  async getFollowUpQuestions(
    provider: AIProvider,
    type: 'report' | 'proposal' | 'meeting' | 'email' | 'general',
    topic: string,
    answers: Record<string, string>,
    skippedKeys?: string[]
  ): Promise<DocumentQuestion[]> {
    const label = TYPE_LABELS[type] || '일반 문서'
    const collected = Object.entries(answers)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n')

    const skippedNote = skippedKeys && skippedKeys.length > 0
      ? `\n\n사용자가 건너뛴 질문 주제 (다시 묻지 마세요): ${skippedKeys.join(', ')}`
      : ''

    const response = await aiService.chat(provider, [
      {
        role: 'system',
        content: `당신은 ${label} 작성을 돕는 어시스턴트입니다.
사용자가 제공한 정보를 분석하여, 더 좋은 문서를 작성하기 위해 추가로 필요한 정보가 있는지 판단하세요.

추가 질문이 필요하면 JSON 배열로 응답하세요:
[{"key": "고유키", "question": "질문 내용", "placeholder": "예시 답변"}]

추가 질문이 필요 없으면 빈 배열 []로 응답하세요.

규칙:
- 최대 2개까지만 질문
- 이미 수집된 정보를 다시 묻지 마세요
- 사용자가 건너뛴 질문과 같은 주제는 절대 다시 묻지 마세요
- 문서 완성도를 높이는 데 진짜 도움이 되는 질문만
- 너무 세부적이거나 불필요한 질문은 하지 마세요
- JSON 배열만 응답하세요. 다른 텍스트 금지.`,
      },
      {
        role: 'user',
        content: `문서 유형: ${label}
주제: ${topic}

수집된 정보:
${collected || '(없음)'}${skippedNote}`,
      },
    ])

    try {
      const match = response.match(/\[[\s\S]*\]/)
      if (match) {
        const parsed = JSON.parse(match[0]) as DocumentQuestion[]
        return parsed.filter((q) => q.key && q.question)
      }
    } catch {}
    return []
  },

  async generateDocument(
    provider: AIProvider,
    topic: string,
    type: 'report' | 'proposal' | 'meeting' | 'email' | 'general',
    answers?: Record<string, string>,
    behavior?: AIBehavior
  ): Promise<string> {
    let collectedInfo = ''
    if (answers) {
      const entries = Object.entries(answers)
        .filter(([, v]) => v?.trim())
        .map(([k, v]) => `- ${k}: ${v.trim()}`)
      if (entries.length > 0) {
        collectedInfo = `\n\n사용자가 제공한 정보:\n${entries.join('\n')}`
      }
    }

    const behaviorBlock = buildBehaviorPrompt(behavior)
    const label = TYPE_LABELS[type] || '일반 문서'
    const template = DOCUMENT_TEMPLATES[type] || DOCUMENT_TEMPLATES['general']

    const prompt = `다음 주제로 ${label}를 작성해주세요.

주제: ${topic}${collectedInfo}

문서 유형별 기본 구조 (반드시 이 틀을 따르세요):
${template}

사용자 스타일 설정:
${behaviorBlock}

작성 지침:
- 위 기본 구조를 반드시 따라서 완성된 문서를 작성하세요.
- 각 섹션에 실질적인 내용을 채워 넣으세요.
- 사용자가 제공한 정보가 있는 섹션은 해당 정보를 중심으로 풍부하게 작성하세요.
- 사용자가 정보를 제공하지 않은 섹션은 문서에서 완전히 생략하세요. "추후 보완", "미정", "TBD" 같은 빈 자리표시를 절대 쓰지 마세요.
- 사용자가 제공하지 않은 구체적 수치, 이름, 날짜 등은 지어내지 마세요.
- AI의 의견, 제안, 코멘트는 절대 넣지 마세요.
- 제목은 <h1>으로 하나만, 소제목은 <h2>, <h3>를 활용하세요.
- 내용이 바뀌는 지점에서 새 <p> 태그로 문단을 분리하세요.
- <hr> 구분선은 사용하지 마세요.
- 핵심 키워드는 <strong>으로 강조하세요.
- 나열 항목은 <ul>/<ol> 목록을 사용하세요.
- 필요하면 <table>로 정보를 정리하세요.

출력 규칙:
- 순수 HTML 태그만 사용하세요.
- 코드 블록(\`\`\`)으로 절대 감싸지 마세요.
- <!DOCTYPE>, <html>, <head>, <body>, <style> 태그를 포함하지 마세요.
- 인라인 style 속성을 사용하지 마세요.
- HTML 본문 내용만 바로 출력하세요.`

    const response = await aiService.chat(provider, [
      {
        role: 'system',
        content: `전문 ${label} 작성 어시스턴트입니다. ${label}의 표준 구조와 틀을 갖춘 완성도 높은 한국어 문서를 순수 HTML 태그로만 작성합니다. 사용자가 제공한 정보를 기반으로 각 섹션을 충실히 채우되, 정보가 없는 섹션은 통째로 생략합니다. 사용자의 스타일 설정(톤, 분량, 문체, 커스텀 지시)을 반드시 따릅니다. AI의 의견이나 부가 코멘트는 포함하지 않습니다. 코드 블록이나 DOCTYPE, html, body, style 태그/속성은 절대 사용하지 않습니다.`,
      },
      { role: 'user', content: prompt },
    ])

    return cleanHtmlResponse(response)
  },

  async analyzeDocument(
    provider: AIProvider,
    content: string
  ): Promise<string> {
    return aiService.chat(provider, [
      { role: 'system', content: '문서 분석 전문가입니다. 한국어로 응답합니다.' },
      {
        role: 'user',
        content: `다음 문서를 분석해주세요. 핵심 내용, 주요 포인트, 개선 제안을 포함해주세요.

문서 내용:
${content.slice(0, 3000)}`,
      },
    ])
  },

  async summarizeDocument(
    provider: AIProvider,
    content: string,
    length: 'short' | 'medium' | 'long' = 'medium'
  ): Promise<string> {
    const lengthGuide = {
      short: '2-3문장',
      medium: '5-7문장',
      long: '상세하게 (10문장 이상)',
    }

    return aiService.chat(provider, [
      { role: 'system', content: '문서 요약 전문가입니다. 한국어로 응답합니다.' },
      {
        role: 'user',
        content: `다음 문서를 ${lengthGuide[length]}으로 요약해주세요.

문서 내용:
${content.slice(0, 3000)}`,
      },
    ])
  },

  async suggestTags(
    provider: AIProvider,
    content: string
  ): Promise<string[]> {
    const response = await aiService.chat(provider, [
      { role: 'system', content: '문서 태깅 전문가입니다. JSON 배열만 응답합니다.' },
      {
        role: 'user',
        content: `다음 문서에 적절한 태그를 5-10개 제안해주세요. JSON 문자열 배열로만 응답하세요.

문서 내용:
${content.slice(0, 2000)}`,
      },
    ])

    try {
      const match = response.match(/\[[\s\S]*\]/)
      if (match) return JSON.parse(match[0])
    } catch {}
    return []
  },

  async convertFormat(
    provider: AIProvider,
    content: string,
    fromFormat: string,
    toFormat: string
  ): Promise<string> {
    return aiService.chat(provider, [
      { role: 'system', content: '문서 포맷 변환 전문가입니다. 한국어로 응답합니다.' },
      {
        role: 'user',
        content: `다음 ${fromFormat} 형식의 내용을 ${toFormat} 형식으로 변환해주세요.

내용:
${content.slice(0, 3000)}`,
      },
    ])
  },

  async generateSpreadsheet(
    provider: AIProvider,
    topic: string,
    requirements?: string,
    behavior?: AIBehavior
  ): Promise<SheetData[]> {
    const b = behavior || DEFAULT_AI_BEHAVIOR
    const reqText = requirements ? `\n추가 요구사항: ${requirements}` : ''

    const response = await aiService.chat(provider, [
      {
        role: 'system',
        content: `스프레드시트 데이터 전문가입니다. 요청에 맞는 스프레드시트 데이터를 JSON으로만 생성합니다.
반드시 다음 JSON 형식으로만 응답하세요. 다른 텍스트 금지:
[{"sheetName": "시트명", "headers": ["열1", "열2", ...], "rows": [["값1", "값2", ...], ...]}]
- 톤: ${b.tone}, 스타일: ${b.writingStyle}
- 숫자 데이터는 문자열이 아닌 숫자로
- 현실적이고 의미 있는 샘플 데이터를 생성하세요`,
      },
      {
        role: 'user',
        content: `다음 주제로 스프레드시트를 만들어주세요.\n\n주제: ${topic}${reqText}`,
      },
    ])

    try {
      const match = response.match(/\[[\s\S]*\]/)
      if (match) {
        const parsed = JSON.parse(match[0]) as {
          sheetName: string
          headers: string[]
          rows: (string | number)[][]
        }[]

        return parsed.map((s) => ({
          name: s.sheetName,
          data: [s.headers, ...s.rows],
        }))
      }
    } catch (err) {
      console.error('[documentAI] 스프레드시트 생성 파싱 실패:', err)
    }

    // Fallback: return empty sheet
    return [{ name: 'Sheet1', data: [['생성 실패 - 다시 시도해주세요.']] }]
  },
}
