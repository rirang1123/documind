import type { AIProvider } from '@/types'
import type { SlideData } from './pptService'
import { aiService } from '@/services/ai-provider/aiService'

/** AI가 슬라이드 내용을 다듬기 */
export async function refineSlideContent(
  provider: AIProvider,
  slide: SlideData
): Promise<SlideData> {
  const response = await aiService.chat(provider, [
    {
      role: 'system',
      content: `프레젠테이션 내용 전문가입니다. 슬라이드 내용을 더 명확하고 간결하게 다듬어주세요.
JSON으로만 응답하세요: {"title": "...", "bullets": ["...", "..."], "notes": "...", "layout": "..."}`,
    },
    {
      role: 'user',
      content: `다음 슬라이드 내용을 다듬어주세요:\n${JSON.stringify(slide)}`,
    },
  ])

  try {
    const match = response.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch {}
  return slide
}

/** AI가 전체 슬라이드 구성을 추천 */
export async function suggestStructure(
  provider: AIProvider,
  slides: SlideData[]
): Promise<SlideData[]> {
  const response = await aiService.chat(provider, [
    {
      role: 'system',
      content: `프레젠테이션 구조 전문가입니다. 기존 슬라이드 구성을 분석하여 개선된 구조를 제안합니다.
JSON 배열로만 응답하세요. 각 항목: {"title": "...", "bullets": ["..."], "notes": "...", "layout": "title|content|section"}`,
    },
    {
      role: 'user',
      content: `현재 슬라이드 구성을 개선해주세요:\n${JSON.stringify(slides)}`,
    },
  ])

  try {
    const match = response.match(/\[[\s\S]*\]/)
    if (match) return JSON.parse(match[0])
  } catch {}
  return slides
}

/** AI가 추가 슬라이드를 제안 */
export async function suggestAdditionalSlides(
  provider: AIProvider,
  slides: SlideData[]
): Promise<SlideData[]> {
  const response = await aiService.chat(provider, [
    {
      role: 'system',
      content: `프레젠테이션 전문가입니다. 기존 슬라이드를 보고 빠진 내용이나 추가하면 좋을 슬라이드를 제안합니다.
추가할 슬라이드만 JSON 배열로 응답하세요: [{"title": "...", "bullets": ["..."], "layout": "content"}]`,
    },
    {
      role: 'user',
      content: `현재 슬라이드:\n${JSON.stringify(slides)}\n\n추가하면 좋을 슬라이드를 제안해주세요.`,
    },
  ])

  try {
    const match = response.match(/\[[\s\S]*\]/)
    if (match) return JSON.parse(match[0])
  } catch {}
  return []
}
