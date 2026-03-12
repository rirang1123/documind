import { writeFile, writeTextFile, mkdir, readDir, exists } from '@tauri-apps/plugin-fs'
import { documentDir, join } from '@tauri-apps/api/path'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from 'docx'
import { jsPDF } from 'jspdf'
import DOMPurify from 'dompurify'
import { generateExcelBuffer, type SheetData } from './excelService'

export type ExportFormat = 'docx' | 'pdf' | 'txt' | 'html' | 'xlsx'

export interface FolderEntry {
  name: string
  isDirectory: boolean
}

/** HTML string → plain text */
function htmlToText(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = DOMPurify.sanitize(html)
  return div.textContent || div.innerText || ''
}

/** Parse HTML into structured blocks for docx conversion */
function parseHtmlBlocks(html: string): { type: string; text: string; level?: number }[] {
  const div = document.createElement('div')
  div.innerHTML = DOMPurify.sanitize(html)
  const blocks: { type: string; text: string; level?: number }[] = []

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim()
      if (text) blocks.push({ type: 'paragraph', text })
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()

    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1])
      blocks.push({ type: 'heading', text: el.textContent || '', level })
    } else if (tag === 'p') {
      blocks.push({ type: 'paragraph', text: el.textContent || '' })
    } else if (tag === 'li') {
      blocks.push({ type: 'list', text: el.textContent || '' })
    } else if (tag === 'blockquote') {
      blocks.push({ type: 'quote', text: el.textContent || '' })
    } else {
      el.childNodes.forEach(walk)
    }
  }

  div.childNodes.forEach(walk)
  return blocks
}

/** Get the base storage directory.
 *  Priority: settings.storagePath > {documentDir}/DocuMind/ */
export async function getExportBaseDir(): Promise<string> {
  try {
    // Check if user has configured a custom storage path
    const { getSettings } = await import('@/services/db')
    const settings = await getSettings()
    if (settings.storagePath && settings.storagePath.trim()) {
      return settings.storagePath.trim()
    }

    const docDir = await documentDir()
    // 테스트 빌드는 별도 폴더 사용 (메인과 데이터 격리)
    const { isTestBuild } = await import('@/utils/buildEnv')
    const isTest = await isTestBuild()
    const folderName = isTest ? 'DocuMind-Test' : 'DocuMind'
    const base = await join(docDir, folderName)
    return base
  } catch (err) {
    console.error('[exportService] 기본 경로 가져오기 실패:', err)
    throw new Error(`문서 폴더 경로를 가져올 수 없습니다: ${err}`)
  }
}

/** Create a project folder on disk under the base storage directory.
 *  Returns the created folder path. */
export async function createProjectFolder(projectName: string): Promise<string> {
  try {
    const base = await getExportBaseDir()
    await ensureExportDir(base)

    // Sanitize project name for filesystem
    const safeName = projectName.replace(/[<>:"/\\|?*]/g, '_').trim()
    const projectPath = await join(base, safeName)
    const pathExists = await exists(projectPath)
    if (!pathExists) {
      await mkdir(projectPath, { recursive: true })
    }
    return projectPath
  } catch (err) {
    console.error('[exportService] createProjectFolder 실패:', err)
    throw new Error(`프로젝트 폴더 생성 실패: ${err}`)
  }
}

/** Create a sub-folder inside a project folder on disk */
export async function createSubFolderOnDisk(projectPath: string, folderName: string): Promise<string> {
  try {
    const safeName = folderName.replace(/[<>:"/\\|?*]/g, '_').trim()
    const folderPath = await join(projectPath, safeName)
    const pathExists = await exists(folderPath)
    if (!pathExists) {
      await mkdir(folderPath, { recursive: true })
    }
    return folderPath
  } catch (err) {
    console.error('[exportService] createSubFolderOnDisk 실패:', err)
    throw new Error(`하위 폴더 생성 실패: ${err}`)
  }
}

/** Ensure the export base directory exists */
export async function ensureExportDir(path?: string): Promise<void> {
  try {
    const dir = path || await getExportBaseDir()
    const dirExists = await exists(dir)
    if (!dirExists) {
      await mkdir(dir, { recursive: true })
    }
  } catch (err) {
    console.error('[exportService] ensureExportDir 실패:', err)
    throw new Error(`폴더 생성 실패: ${err}`)
  }
}

/** List folder contents (folders first, then files) */
export async function listFolderContents(path: string): Promise<FolderEntry[]> {
  try {
    const entries = await readDir(path)
    const sorted = entries
      .map((e) => ({ name: e.name, isDirectory: e.isDirectory }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    return sorted
  } catch (err) {
    console.error('[exportService] readDir 실패:', path, err)
    throw new Error(`폴더 내용을 읽을 수 없습니다: ${err}`)
  }
}

/** Create a new folder inside parentPath */
export async function createFolder(parentPath: string, name: string): Promise<string> {
  try {
    const newPath = await join(parentPath, name)
    await mkdir(newPath, { recursive: true })
    return newPath
  } catch (err) {
    console.error('[exportService] createFolder 실패:', parentPath, name, err)
    throw new Error(`폴더 "${name}" 생성 실패: ${err}`)
  }
}

/** Export document to the specified target directory */
export async function exportDocument(
  html: string,
  fileName: string,
  format: ExportFormat,
  targetDir: string,
  spreadsheetSheets?: SheetData[]
): Promise<void> {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'document'
  const ext = format
  const filePath = await join(targetDir, `${baseName}.${ext}`)

  await ensureExportDir(targetDir)

  switch (format) {
    case 'docx':
      return exportDocx(html, filePath)
    case 'pdf':
      return exportPdf(html, filePath)
    case 'txt':
      return exportTxt(html, filePath)
    case 'html':
      return exportHtml(html, filePath, baseName)
    case 'xlsx':
      return exportXlsx(spreadsheetSheets || [], filePath)
  }
}

async function exportDocx(html: string, filePath: string) {
  const blocks = parseHtmlBlocks(html)

  const HEADING_MAP: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
  }

  const children: Paragraph[] = blocks.map((block) => {
    if (block.type === 'heading' && block.level) {
      return new Paragraph({
        text: block.text,
        heading: HEADING_MAP[block.level] || HeadingLevel.HEADING_3,
      })
    }
    if (block.type === 'list') {
      return new Paragraph({
        children: [new TextRun(block.text)],
        bullet: { level: 0 },
      })
    }
    if (block.type === 'quote') {
      return new Paragraph({
        children: [new TextRun({ text: block.text, italics: true })],
        indent: { left: 720 },
      })
    }
    return new Paragraph({
      children: [new TextRun(block.text)],
    })
  })

  if (children.length === 0) {
    children.push(new Paragraph({ text: '' }))
  }

  const doc = new Document({
    sections: [{ children }],
  })

  const blob = await Packer.toBlob(doc)
  const arrayBuffer = await blob.arrayBuffer()
  await writeFile(filePath, new Uint8Array(arrayBuffer))
}

async function exportPdf(html: string, filePath: string) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const container = document.createElement('div')
  container.innerHTML = DOMPurify.sanitize(html)
  container.style.cssText = 'width:170mm;font-family:sans-serif;font-size:11px;line-height:1.6;'

  document.body.appendChild(container)
  await pdf.html(container, {
    x: 20,
    y: 20,
    width: 170,
    windowWidth: 650,
  })
  document.body.removeChild(container)

  const arrayBuffer = pdf.output('arraybuffer')
  await writeFile(filePath, new Uint8Array(arrayBuffer))
}

async function exportTxt(html: string, filePath: string) {
  const text = htmlToText(html)
  await writeTextFile(filePath, text)
}

async function exportHtml(html: string, filePath: string, baseName: string) {
  const safeTitle = baseName.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c))
  const fullHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${safeTitle}</title>
<style>body{font-family:'Malgun Gothic',sans-serif;max-width:800px;margin:40px auto;line-height:1.8;padding:0 20px;}h1,h2,h3{color:#333;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid #ddd;padding:8px;}</style>
</head>
<body>${DOMPurify.sanitize(html)}</body>
</html>`
  await writeTextFile(filePath, fullHtml)
}

async function exportXlsx(sheets: SheetData[], filePath: string) {
  const buffer = generateExcelBuffer(
    sheets.length > 0 ? sheets : [{ name: 'Sheet1', data: [['데이터가 없습니다.']] }]
  )
  await writeFile(filePath, new Uint8Array(buffer))
}
