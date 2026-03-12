import JSZip from 'jszip'

export interface SlideData {
  index: number
  texts: string[]
}

/** Parse PPTX ArrayBuffer and extract text content from each slide */
export async function parsePptxFromArrayBuffer(buffer: ArrayBuffer): Promise<SlideData[]> {
  const zip = await JSZip.loadAsync(buffer)
  const slides: SlideData[] = []

  // Find all slide XML files (ppt/slides/slide1.xml, slide2.xml, ...)
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0')
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0')
      return numA - numB
    })

  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async('text')
    const texts = extractTextsFromSlideXml(xml)
    slides.push({ index: i + 1, texts })
  }

  return slides
}

/** Extract all text runs (<a:t>) from slide XML */
function extractTextsFromSlideXml(xml: string): string[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')

  // <a:t> tags contain text content in OOXML
  const textNodes = doc.getElementsByTagNameNS(
    'http://schemas.openxmlformats.org/drawingml/2006/main',
    't'
  )

  // Group by paragraph: collect text runs, join by newlines between paragraphs
  const paragraphs: string[] = []
  let currentParagraph = ''

  // Walk through all <a:p> elements to get paragraph structure
  const pNodes = doc.getElementsByTagNameNS(
    'http://schemas.openxmlformats.org/drawingml/2006/main',
    'p'
  )

  if (pNodes.length > 0) {
    for (let i = 0; i < pNodes.length; i++) {
      const tNodes = pNodes[i].getElementsByTagNameNS(
        'http://schemas.openxmlformats.org/drawingml/2006/main',
        't'
      )
      let line = ''
      for (let j = 0; j < tNodes.length; j++) {
        line += tNodes[j].textContent || ''
      }
      if (line.trim()) {
        paragraphs.push(line.trim())
      }
    }
  } else {
    // Fallback: just grab all <a:t> nodes
    for (let i = 0; i < textNodes.length; i++) {
      currentParagraph = textNodes[i].textContent?.trim() || ''
      if (currentParagraph) paragraphs.push(currentParagraph)
    }
  }

  return paragraphs
}

/** Convert parsed slides to HTML for preview */
export function slidesToHtml(slides: SlideData[]): string {
  if (slides.length === 0) return '<p>슬라이드가 없습니다.</p>'

  return slides.map((slide) => {
    const content = slide.texts.length > 0
      ? slide.texts.map((t, i) => {
          // First text is likely the title
          if (i === 0) return `<h4 style="margin:0 0 8px;font-size:15px;font-weight:600;">${escapeHtml(t)}</h4>`
          return `<p style="margin:2px 0;font-size:13px;color:#444;">${escapeHtml(t)}</p>`
        }).join('')
      : '<p style="color:#999;font-size:13px;">(빈 슬라이드)</p>'

    return `<div style="border:1px solid #ddd;border-radius:8px;padding:16px 20px;margin-bottom:12px;background:#fafafa;">
      <div style="font-size:11px;color:#999;margin-bottom:8px;">슬라이드 ${slide.index}</div>
      ${content}
    </div>`
  }).join('')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
