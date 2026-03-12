import PptxGenJS from 'pptxgenjs'
import { writeFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import type { AIProvider } from '@/types'
import { aiService } from '@/services/ai-provider/aiService'
import { ensureExportDir } from './exportService'

export interface SlideData {
  title: string
  bullets?: string[]
  notes?: string
  layout?: 'title' | 'content' | 'section' | 'blank'
}

/**
 * AI에게 문서 내용을 보내서 PPT 슬라이드 구조를 JSON으로 받아온 뒤 생성
 */
export async function generatePptFromDocument(
  provider: AIProvider,
  documentContent: string,
  fileName: string,
  targetDir: string
): Promise<void> {
  const slides = await getSlideStructure(provider, documentContent)
  await buildPptx(slides, fileName, targetDir)
}

async function getSlideStructure(
  provider: AIProvider,
  content: string
): Promise<SlideData[]> {
  const response = await aiService.chat(provider, [
    {
      role: 'system',
      content: `프레젠테이션 구성 전문가입니다.
주어진 문서 내용을 분석하여 PPT 슬라이드 구조를 JSON 배열로 응답합니다.
JSON 배열만 응답하세요. 다른 텍스트는 포함하지 마세요.

각 슬라이드 형식:
{"title": "슬라이드 제목", "bullets": ["항목1", "항목2"], "notes": "발표자 노트", "layout": "title|content|section"}

- 첫 슬라이드는 layout: "title" (제목 슬라이드)
- 섹션 구분은 layout: "section"
- 나머지는 layout: "content"
- 슬라이드당 bullet은 3~5개가 적절`,
    },
    {
      role: 'user',
      content: `다음 문서 내용으로 PPT 슬라이드를 구성해주세요:\n\n${content.slice(0, 4000)}`,
    },
  ])

  try {
    const match = response.match(/\[[\s\S]*\]/)
    if (match) {
      return JSON.parse(match[0])
    }
  } catch {}

  // Fallback: 단일 슬라이드
  return [
    { title: '프레젠테이션', bullets: ['내용을 확인해주세요'], layout: 'title' },
  ]
}

export async function buildPptx(slides: SlideData[], fileName: string, targetDir: string) {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'DocuMind'

  // Define master slides
  pptx.defineSlideMaster({
    title: 'TITLE_SLIDE',
    background: { color: '1a365d' },
    objects: [],
  })
  pptx.defineSlideMaster({
    title: 'SECTION_SLIDE',
    background: { color: '2b6cb0' },
    objects: [],
  })
  pptx.defineSlideMaster({
    title: 'CONTENT_SLIDE',
    background: { color: 'FFFFFF' },
    objects: [
      {
        rect: { x: 0, y: 0, w: '100%', h: 0.6, fill: { color: '1a365d' } },
      },
    ],
  })

  for (const slideData of slides) {
    let slide: ReturnType<typeof pptx.addSlide>

    if (slideData.layout === 'title') {
      slide = pptx.addSlide({ masterName: 'TITLE_SLIDE' })
      slide.addText(slideData.title, {
        x: 0.5,
        y: 2.0,
        w: '90%',
        h: 1.5,
        fontSize: 36,
        fontFace: 'Malgun Gothic',
        color: 'FFFFFF',
        bold: true,
        align: 'center',
        valign: 'middle',
      })
      if (slideData.bullets?.[0]) {
        slide.addText(slideData.bullets[0], {
          x: 0.5,
          y: 3.8,
          w: '90%',
          h: 0.8,
          fontSize: 18,
          fontFace: 'Malgun Gothic',
          color: 'CBD5E0',
          align: 'center',
        })
      }
    } else if (slideData.layout === 'section') {
      slide = pptx.addSlide({ masterName: 'SECTION_SLIDE' })
      slide.addText(slideData.title, {
        x: 0.5,
        y: 2.5,
        w: '90%',
        h: 1.2,
        fontSize: 32,
        fontFace: 'Malgun Gothic',
        color: 'FFFFFF',
        bold: true,
        align: 'center',
        valign: 'middle',
      })
    } else {
      slide = pptx.addSlide({ masterName: 'CONTENT_SLIDE' })
      slide.addText(slideData.title, {
        x: 0.3,
        y: 0.05,
        w: '90%',
        h: 0.5,
        fontSize: 16,
        fontFace: 'Malgun Gothic',
        color: 'FFFFFF',
        bold: true,
      })
      if (slideData.bullets?.length) {
        const bulletText = slideData.bullets.map((b) => ({
          text: b,
          options: {
            fontSize: 16,
            fontFace: 'Malgun Gothic',
            color: '2D3748',
            bullet: { code: '2022' },
            paraSpaceAfter: 8,
          },
        }))
        slide.addText(bulletText, {
          x: 0.5,
          y: 1.0,
          w: '85%',
          h: 4.0,
          valign: 'top',
          lineSpacingMultiple: 1.5,
        })
      }
    }

    if (slideData.notes) {
      slide.addNotes(slideData.notes)
    }
  }

  const baseName = fileName.replace(/\.[^.]+$/, '') || 'presentation'

  await ensureExportDir(targetDir)
  const filePath = await join(targetDir, `${baseName}.pptx`)

  const blob = await pptx.write({ outputType: 'blob' }) as Blob
  const arrayBuffer = await blob.arrayBuffer()
  await writeFile(filePath, new Uint8Array(arrayBuffer))
}
