import { useMemo, useState, useEffect } from 'react'
import DOMPurify from 'dompurify'
import { FileText, ArrowLeft, Download, ExternalLink, Loader2 } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'
import { Button } from '@/components/ui/button'
import { parseExcelFromArrayBuffer, sheetToHtmlTable } from '@/services/document/excelService'
import { openPath } from '@tauri-apps/plugin-opener'
import { writeFile } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'
import mammoth from 'mammoth'
import { parsePptxFromArrayBuffer, slidesToHtml } from '@/services/document/pptxService'

/** Write blobData to a temp file and open it with OS default app */
async function openFileExternally(
  fileName: string,
  blobData?: ArrayBuffer,
  content?: string,
  filePath?: string
): Promise<void> {
  // If we have the original file path on disk, try opening directly
  if (filePath && filePath.length > 5) {
    try {
      await openPath(filePath)
      return
    } catch {
      // Fall through to temp file approach
    }
  }

  // Write to temp location and open
  const tempDir = await appDataDir()
  const safeName = fileName.replace(/[<>:"/\\|?*]/g, '_')
  const tempPath = await join(tempDir, 'temp', safeName)

  const { mkdir, exists } = await import('@tauri-apps/plugin-fs')
  const tempFolder = await join(tempDir, 'temp')
  if (!(await exists(tempFolder))) {
    await mkdir(tempFolder, { recursive: true })
  }

  if (blobData) {
    await writeFile(tempPath, new Uint8Array(blobData))
  } else if (content) {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    await writeTextFile(tempPath, content)
  } else {
    throw new Error('파일 데이터가 없습니다.')
  }

  await openPath(tempPath)
}

export function FileViewer() {
  const { viewerFileId, files, setActiveView } = useAppStore()
  const file = files.find((f) => f.id === viewerFileId)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)

  // Docx → HTML conversion
  const [docxHtml, setDocxHtml] = useState<string | null>(null)
  const [docxLoading, setDocxLoading] = useState(false)

  useEffect(() => {
    setDocxHtml(null)
    if (file?.type === 'docx' && file.blobData) {
      setDocxLoading(true)
      mammoth.convertToHtml({ arrayBuffer: file.blobData })
        .then((result) => {
          setDocxHtml(result.value)
        })
        .catch((err) => {
          console.error('DOCX 파싱 실패:', err)
          setDocxHtml(null)
        })
        .finally(() => setDocxLoading(false))
    }
  }, [file?.id, file?.type, file?.blobData])

  // PPTX → HTML conversion
  const [pptxHtml, setPptxHtml] = useState<string | null>(null)
  const [pptxLoading, setPptxLoading] = useState(false)

  useEffect(() => {
    setPptxHtml(null)
    if (file?.type === 'pptx' && file.blobData) {
      setPptxLoading(true)
      parsePptxFromArrayBuffer(file.blobData)
        .then((slides) => {
          setPptxHtml(slidesToHtml(slides))
        })
        .catch((err) => {
          console.error('PPTX 파싱 실패:', err)
          setPptxHtml(null)
        })
        .finally(() => setPptxLoading(false))
    }
  }, [file?.id, file?.type, file?.blobData])

  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file?.blobData) {
      setBlobUrl(null)
      return
    }
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }
    const mime = mimeMap[file.type] || 'application/octet-stream'
    const blob = new Blob([file.blobData], { type: mime })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.blobData, file?.type])

  // Parse xlsx for HTML table preview
  const xlsxHtml = useMemo(() => {
    if (file?.type !== 'xlsx' || !file.blobData) return null
    try {
      const parsed = parseExcelFromArrayBuffer(file.blobData)
      if (parsed.sheets.length === 0) return null
      return parsed.sheets.map((sheet) => {
        const tableHtml = sheetToHtmlTable(sheet.data)
        return `<h3 style="margin:16px 0 8px;font-size:14px;">${DOMPurify.sanitize(sheet.name)}</h3>${tableHtml}`
      }).join('')
    } catch {
      return null
    }
  }, [file?.type, file?.blobData])

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 opacity-30" />
          <p className="mt-3 text-sm">파일을 찾을 수 없습니다.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setActiveView('browser')}>
            파일 탐색으로 돌아가기
          </Button>
        </div>
      </div>
    )
  }

  const handleDownload = () => {
    if (!blobUrl) return
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = file.name
    a.click()
  }

  const handleOpenExternal = async () => {
    setOpening(true)
    setOpenError(null)
    try {
      await openFileExternally(file.name, file.blobData, file.content, file.path)
    } catch (err) {
      console.error('외부 앱 열기 실패:', err)
      setOpenError(`외부 앱을 열 수 없습니다: ${(err as Error).message}`)
    } finally {
      setOpening(false)
    }
  }

  // PDF는 편집 버튼 없음
  const canEditExternally = file.type !== 'pdf'
  const hasData = !!(file.blobData || file.content)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Button variant="ghost" size="sm" onClick={() => setActiveView('browser')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <FileText className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm truncate">{file.name}</span>
        <span className="text-xs text-muted-foreground ml-1">
          ({(file.size / 1024).toFixed(1)} KB)
        </span>
        <div className="ml-auto flex gap-1">
          {canEditExternally && hasData && (
            <Button
              variant="default"
              size="sm"
              onClick={handleOpenExternal}
              disabled={opening}
            >
              {opening ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  여는 중...
                </>
              ) : (
                <>
                  <ExternalLink className="mr-1 h-3.5 w-3.5" />
                  편집하기
                </>
              )}
            </Button>
          )}
          {blobUrl && (
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="mr-1 h-3.5 w-3.5" />
              다운로드
            </Button>
          )}
        </div>
      </div>

      {/* Error message */}
      {openError && (
        <div className="px-4 py-2 bg-destructive/10 text-destructive text-xs border-b border-border">
          {openError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {/* DOCX: mammoth HTML preview */}
        {file.type === 'docx' && docxLoading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span className="text-sm">문서를 불러오는 중...</span>
          </div>
        ) : file.type === 'docx' && docxHtml ? (
          <div className="h-full overflow-auto p-6">
            <div
              className="prose max-w-none text-sm"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(docxHtml) }}
            />
          </div>

        /* DOCX with content (saved from AI editor) */
        ) : file.type === 'docx' && file.content ? (
          <div className="h-full overflow-auto p-6">
            <div
              className="prose max-w-none text-sm"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(file.content) }}
            />
          </div>

        /* XLSX: HTML table preview */
        ) : file.type === 'xlsx' && xlsxHtml ? (
          <div className="h-full overflow-auto p-6">
            <div
              className="prose max-w-none text-sm"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(xlsxHtml) }}
            />
          </div>

        /* PPTX: slide text preview */
        ) : file.type === 'pptx' && pptxLoading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span className="text-sm">프레젠테이션을 불러오는 중...</span>
          </div>
        ) : file.type === 'pptx' && pptxHtml ? (
          <div className="h-full overflow-auto p-6">
            <div
              className="max-w-2xl mx-auto"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(pptxHtml) }}
            />
          </div>

        /* PDF: iframe preview */
        ) : file.type === 'pdf' && blobUrl ? (
          <iframe
            src={blobUrl}
            className="h-full w-full border-0"
            title={file.name}
          />

        /* Text/Markdown: plain text preview */
        ) : file.type === 'txt' || file.type === 'md' ? (
          <div className="h-full overflow-auto p-6">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground">
              {file.content || '(내용 없음)'}
            </pre>
          </div>

        /* HTML content (other types saved from editor) */
        ) : file.content ? (
          <div className="h-full overflow-auto p-6">
            <div
              className="prose max-w-none text-sm"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(file.content) }}
            />
          </div>

        /* Binary file with blob: generic preview */
        ) : blobUrl ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FileText className="mx-auto h-16 w-16 opacity-30" />
              <p className="mt-4 text-sm font-medium">{file.name}</p>
              <p className="mt-1 text-xs">이 파일 형식은 미리보기를 지원하지 않습니다.</p>
              <div className="mt-4 flex gap-2 justify-center">
                {canEditExternally && (
                  <Button variant="default" size="sm" onClick={handleOpenExternal} disabled={opening}>
                    <ExternalLink className="mr-1 h-3.5 w-3.5" />
                    편집하기
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  파일 다운로드
                </Button>
              </div>
            </div>
          </div>

        /* No data */
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FileText className="mx-auto h-16 w-16 opacity-30" />
              <p className="mt-4 text-sm">파일 데이터가 없습니다.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
