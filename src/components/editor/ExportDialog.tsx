import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, X, FileText, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { exportDocument, type ExportFormat } from '@/services/document/exportService'
import { ExportLocationDialog } from './ExportLocationDialog'
import type { SheetData } from '@/services/document/excelService'

interface Props {
  html: string
  fileName: string
  onClose: () => void
  spreadsheetSheets?: SheetData[] | null
}

const FORMAT_OPTIONS: { id: ExportFormat; label: string; desc: string; icon: typeof FileText }[] = [
  { id: 'docx', label: 'Word (.docx)', desc: 'Microsoft Word 문서', icon: FileText },
  { id: 'xlsx', label: 'Excel (.xlsx)', desc: 'Microsoft Excel 스프레드시트', icon: FileSpreadsheet },
  { id: 'pdf', label: 'PDF (.pdf)', desc: 'PDF 문서', icon: FileText },
  { id: 'txt', label: '텍스트 (.txt)', desc: '일반 텍스트', icon: FileText },
  { id: 'html', label: 'HTML (.html)', desc: 'HTML 웹 문서', icon: FileText },
]

export function ExportDialog({ html, fileName, onClose, spreadsheetSheets }: Props) {
  const hasSpreadsheet = spreadsheetSheets && spreadsheetSheets.length > 0
  const [format, setFormat] = useState<ExportFormat>(hasSpreadsheet ? 'xlsx' : 'docx')
  const [name, setName] = useState(fileName.replace(/\.[^.]+$/, '') || '문서')
  const [exporting, setExporting] = useState(false)
  const [showLocationPicker, setShowLocationPicker] = useState(false)

  const fullFileName = `${name}.${format}`

  const handleNext = () => {
    if (!name.trim()) return
    setShowLocationPicker(true)
  }

  const handleLocationSelect = async (targetDir: string) => {
    setShowLocationPicker(false)
    setExporting(true)
    try {
      await exportDocument(html, name, format, targetDir, spreadsheetSheets || undefined)
      onClose()
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  if (showLocationPicker) {
    return (
      <ExportLocationDialog
        fileName={fullFileName}
        onSelect={handleLocationSelect}
        onClose={() => setShowLocationPicker(false)}
      />
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-96 rounded-lg bg-background border border-border shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">문서 내보내기</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">파일 이름</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">파일 형식</label>
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setFormat(opt.id)}
                  className={`flex items-center gap-2 rounded-lg border-2 p-3 text-left cursor-pointer transition-colors ${
                    format === opt.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  <opt.icon className={`h-4 w-4 ${format === opt.id ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div>
                    <div className="text-xs font-medium">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button size="sm" onClick={handleNext} disabled={exporting || !name.trim()}>
            <Download className="mr-1 h-3 w-3" />
            {exporting ? '내보내는 중...' : '저장 위치 선택'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
