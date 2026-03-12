import DOMPurify from 'dompurify'
import type { AIProvider } from '@/types'
import { aiService } from '@/services/ai-provider/aiService'

export interface ReviewSuggestion {
  id: string
  type: 'spelling' | 'grammar' | 'style' | 'structure'
  original: string
  suggestion: string
  explanation: string
  position?: { from: number; to: number }
}

const TYPE_LABELS: Record<ReviewSuggestion['type'], string> = {
  spelling: '맞춤법',
  grammar: '문법',
  style: '문체',
  structure: '구조',
}

export { TYPE_LABELS as REVIEW_TYPE_LABELS }

export async function reviewDocument(
  provider: AIProvider,
  html: string
): Promise<ReviewSuggestion[]> {
  // Strip HTML for analysis
  const div = document.createElement('div')
  div.innerHTML = DOMPurify.sanitize(html)
  const text = div.textContent || ''

  if (!text.trim() || text.trim().length < 5) return []

  const response = await aiService.chat(provider, [
    {
      role: 'system',
      content: `당신은 한국어 맞춤법·문법 교정 전문가입니다.

## 역할
주어진 문서의 모든 텍스트를 꼼꼼히 검토하여 아래 유형의 오류를 **반드시 찾아내세요**.

## 검토 항목 (우선순위 순)
1. **맞춤법(spelling)**: 오타, 잘못된 철자, 띄어쓰기 오류 (예: "됬다"→"됐다", "안됩니다"→"안 됩니다", "할수있다"→"할 수 있다")
2. **문법(grammar)**: 조사 오류, 어미 오류, 주술 호응 불일치, 피동·사동 혼동 (예: "를 위해서"→"을 위해서", "입니다니다"→"입니다")
3. **문체(style)**: 일관되지 않은 어투(존댓말/반말 혼용), 불필요한 반복, 어색한 표현
4. **구조(structure)**: 문장이 너무 길거나 의미가 불명확한 경우

## 응답 규칙
- 반드시 JSON 배열만 출력하세요. 다른 텍스트나 마크다운 없이 순수 JSON만 응답하세요.
- 실제 오류나 개선점이 없으면 빈 배열 []을 응답하세요. 억지로 만들어내지 마세요.
- original은 원문에 있는 정확한 텍스트를 그대로 사용해야 합니다.
- 최대 20개까지 제안합니다.

## JSON 형식
[{"type":"spelling","original":"원문","suggestion":"수정안","explanation":"이유"}]`,
    },
    {
      role: 'user',
      content: `다음 한국어 문서를 검토하고 맞춤법·문법·문체·구조 오류를 찾아주세요. 문제가 없으면 빈 배열로 응답하세요:\n\n${text.slice(0, 6000)}`,
    },
  ])

  try {
    // Try to extract JSON array - handle markdown wrapping too
    let jsonStr = ''
    const fencedMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fencedMatch) {
      jsonStr = fencedMatch[1].trim()
    } else {
      const arrayMatch = response.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        jsonStr = arrayMatch[0]
      }
    }

    if (jsonStr) {
      const raw = JSON.parse(jsonStr) as Omit<ReviewSuggestion, 'id'>[]
      if (Array.isArray(raw) && raw.length > 0) {
        return raw
          .filter((item) => item.original && item.suggestion && item.type)
          .map((item, i) => ({
            ...item,
            id: `review-${i}`,
          }))
      }
    }
  } catch (err) {
    console.error('[ReviewService] JSON 파싱 실패:', err, '\nAI 응답:', response.slice(0, 500))
  }

  return []
}
