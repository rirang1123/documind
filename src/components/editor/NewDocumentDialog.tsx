import { createPortal } from 'react-dom'
import { FileText, Presentation, X, LayoutTemplate } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'
import { BUILTIN_TEMPLATES } from '@/services/document/builtinTemplates'

const POPULAR_TEMPLATES = BUILTIN_TEMPLATES.slice(0, 4)

interface Props {
  open: boolean
  onClose: () => void
}

export function NewDocumentDialog({ open, onClose }: Props) {
  if (!open) return null

  const handleDocument = () => {
    useAppStore.getState().openNewDocument()
    onClose()
  }

  const handlePpt = () => {
    useAppStore.getState().openPptEditor()
    onClose()
  }

  const handleTemplate = (content: string, name: string) => {
    const store = useAppStore.getState()
    store.setEditorContent(content, name)
    store.setActiveView('editor')
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[480px] rounded-lg bg-background border border-border shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="font-semibold text-sm">새 문서 만들기</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          <p className="text-sm text-muted-foreground mb-4">어떤 유형의 문서를 만드시겠습니까?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleDocument}
              className="flex flex-col items-center gap-3 rounded-lg border-2 border-border p-6 hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer"
            >
              <FileText className="h-10 w-10 text-blue-500" />
              <div className="text-center">
                <div className="text-sm font-medium">문서 작성</div>
                <div className="text-xs text-muted-foreground mt-1">리치 텍스트 에디터로 문서 작성</div>
              </div>
            </button>

            <button
              onClick={handlePpt}
              className="flex flex-col items-center gap-3 rounded-lg border-2 border-border p-6 hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer"
            >
              <Presentation className="h-10 w-10 text-orange-500" />
              <div className="text-center">
                <div className="text-sm font-medium">AI PPT 생성</div>
                <div className="text-xs text-muted-foreground mt-1">슬라이드별 편집 후 PPT 생성</div>
              </div>
            </button>
          </div>

          {/* 템플릿에서 시작 */}
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">템플릿에서 시작</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {POPULAR_TEMPLATES.map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => handleTemplate(tpl.content, tpl.name)}
                  className="flex items-center gap-2 rounded-lg border border-border p-2.5 hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer text-left"
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{tpl.name}</div>
                    <div className="text-[10px] text-muted-foreground">{tpl.category}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
