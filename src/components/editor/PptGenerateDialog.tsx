import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Presentation, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/stores/useAppStore'
import { generatePptFromDocument } from '@/services/document/pptService'
import { ExportLocationDialog } from './ExportLocationDialog'

interface Props {
  content: string
  fileName: string
  onClose: () => void
}

export function PptGenerateDialog({ content, fileName, onClose }: Props) {
  const { settings } = useAppStore()
  const [name, setName] = useState(fileName.replace(/\.[^.]+$/, '') || 'presentation')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [showLocationPicker, setShowLocationPicker] = useState(false)

  const activeProvider = settings?.aiProviders.find(
    (p) => p.id === settings.activeProviderId
  )

  // Strip HTML tags for plain text content
  const plainContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  const handleNext = () => {
    if (!activeProvider) {
      setError('AI 제공자가 설정되지 않았습니다. 설정에서 API 키를 등록하세요.')
      return
    }
    if (!plainContent) {
      setError('문서 내용이 비어있습니다. 에디터에 내용을 작성한 후 PPT를 생성하세요.')
      return
    }
    setShowLocationPicker(true)
  }

  const handleLocationSelect = async (targetDir: string) => {
    setShowLocationPicker(false)
    if (!activeProvider) return

    setGenerating(true)
    setError('')
    try {
      await generatePptFromDocument(activeProvider, plainContent, name, targetDir)
      onClose()
    } catch (err) {
      setError((err as Error).message || 'PPT 생성 중 오류가 발생했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  if (showLocationPicker) {
    return (
      <ExportLocationDialog
        fileName={`${name}.pptx`}
        onSelect={handleLocationSelect}
        onClose={() => setShowLocationPicker(false)}
      />
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-[420px] rounded-lg bg-background border border-border shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Presentation className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">AI PPT 생성</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            현재 에디터의 문서 내용을 AI가 분석하여 PPT 슬라이드를 자동으로 구성합니다.
          </p>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">PPT 파일 이름</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="rounded-lg bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground mb-1">문서 미리보기</div>
            <p className="text-xs text-muted-foreground line-clamp-4">
              {plainContent ? plainContent.slice(0, 300) + (plainContent.length > 300 ? '...' : '') : '(내용 없음)'}
            </p>
          </div>

          {!activeProvider && (
            <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              AI 제공자가 설정되지 않았습니다. 설정 &gt; AI 설정에서 API 키를 등록하세요.
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button
            size="sm"
            onClick={handleNext}
            disabled={generating || !name.trim() || !activeProvider}
          >
            {generating ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                AI가 생성 중...
              </>
            ) : (
              <>
                <Presentation className="mr-1 h-3 w-3" />
                저장 위치 선택
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
