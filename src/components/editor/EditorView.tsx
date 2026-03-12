import { useState, useRef, useMemo, useEffect, lazy, Suspense } from 'react'
import { FileText, FilePlus, Download, Shield, Save, Check, Pencil, List, LayoutTemplate } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'
import { DocumentEditor } from './document/DocumentEditor'
import { ExportDialog } from './ExportDialog'
import { AutoSaveIndicator } from './AutoSaveIndicator'
import { ReviewPanel } from './ReviewPanel'
import { SaveToProjectDialog } from './SaveToProjectDialog'
import TableOfContents from './TableOfContents'
import { useAutoSave } from '@/hooks/useAutoSave'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Editor } from '@tiptap/react'
import type { DocumentFile } from '@/types'

const TemplateManager = lazy(() => import('./TemplateManager'))

function stripHtmlTags(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html || '', 'text/html')
  return doc.body.textContent || ''
}

function EditorStatusBar({ html }: { html: string }) {
  const stats = useMemo(() => {
    const text = stripHtmlTags(html)
    const charCount = text.length
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0)
    const wordCount = words.length
    const readingMinutes = Math.max(1, Math.ceil(wordCount / 200))
    return { charCount, wordCount, readingMinutes }
  }, [html])

  return (
    <div className="flex items-center justify-end gap-3 border-t border-border px-4 py-1 text-xs text-muted-foreground bg-muted/20">
      <span>글자 수: {stats.charCount}</span>
      <span>|</span>
      <span>단어 수: {stats.wordCount}</span>
      <span>|</span>
      <span>읽기 시간: ~{stats.readingMinutes}분</span>
    </div>
  )
}

/**
 * EditorView — AI 생성 새 문서 전용 에디터
 * 저장된 파일은 FileViewer에서 열람하고, 외부 앱으로 편집합니다.
 */
export function EditorView() {
  const {
    editorContent, editorFileName,
    setEditorContent, setShowNewDocDialog, activeView,
    files, addFile,
  } = useAppStore()
  const [showExport, setShowExport] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [currentHtml, setCurrentHtml] = useState('')
  const [savedToProject, setSavedToProject] = useState(false)
  const [savedFileId, setSavedFileId] = useState<string | null>(null)
  const [showToc, setShowToc] = useState(false)
  const editorRef = useRef<Editor | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const isNew = activeView === 'editor'

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Listen for Ctrl+S shortcut
  const handleQuickSaveRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    const handler = () => handleQuickSaveRef.current?.()
    window.addEventListener('shortcut:save', handler)
    return () => window.removeEventListener('shortcut:save', handler)
  }, [])

  // Auto-save for new document mode
  const { saveStatus, restore, clearSaved } = useAutoSave(
    isNew ? currentHtml : null,
    'documind-autosave-new'
  )

  // Check for restorable draft (only once)
  const [dismissed, setDismissed] = useState(false)
  const restoredDraft = useMemo(
    () => (!dismissed && isNew && !editorContent ? restore() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dismissed, isNew]
  )

  const handleSaveToProject = () => {
    setShowSaveDialog(true)
  }

  const handleSaved = (savedFile: DocumentFile) => {
    setSavedFileId(savedFile.id)
    setSavedToProject(true)
    setShowSaveDialog(false)
    setTimeout(() => setSavedToProject(false), 2000)
    useAppStore.setState({
      editorFileName: savedFile.name,
    })
  }

  const handleTemplateSelect = (content: string, name: string) => {
    setEditorContent(content, name)
    setCurrentHtml(content)
    setShowTemplates(false)
  }

  const DEFAULT_DOC_NAMES = ['새 문서', '제목 없음', '']

  /** Quick save */
  const handleQuickSave = async () => {
    const html = currentHtml || editorContent
    if (!html || html === '<p></p>') return

    if (DEFAULT_DOC_NAMES.includes(editorFileName.trim())) {
      setShowSaveDialog(true)
      return
    }

    const fileIdToUpdate = savedFileId
    if (fileIdToUpdate) {
      const existingFile = files.find((f) => f.id === fileIdToUpdate)
      if (existingFile) {
        const updated: DocumentFile = {
          ...existingFile,
          content: html,
          name: editorFileName,
          size: new Blob([html]).size,
          updatedAt: new Date(),
        }
        await addFile(updated)
        setSavedToProject(true)
        setTimeout(() => setSavedToProject(false), 2000)
        return
      }
    }
    setShowSaveDialog(true)
  }
  handleQuickSaveRef.current = handleQuickSave

  // No content → show landing
  if (!editorContent && !isNew) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 opacity-30" />
          <p className="mt-3 text-sm">파일을 선택하거나 새 문서를 만드세요.</p>
          <p className="mt-1 text-xs">파일 탐색기에서 문서를 클릭하거나 아래 버튼으로 새 문서를 작성하세요.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button size="sm" onClick={() => setShowNewDocDialog(true)}>
              <FilePlus className="mr-1 h-3.5 w-3.5" />
              새 문서 작성
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // New document / AI-generated document editor
  return (
    <div className="flex h-full flex-col">
      {/* Restore banner */}
      {restoredDraft && (
        <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm">
          <span className="text-amber-700">이전에 작성 중이던 임시 저장 문서가 있습니다.</span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs"
            onClick={() => {
              setEditorContent(restoredDraft)
              setCurrentHtml(restoredDraft)
              setDismissed(true)
            }}
          >
            복원
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs"
            onClick={() => {
              clearSaved()
              setDismissed(true)
            }}
          >
            삭제
          </Button>
        </div>
      )}
      <EditorHeader
        name={editorFileName}
        type="docx"
        isNew
        saveStatus={saveStatus}
        onExport={() => setShowExport(true)}
        onReview={() => setShowReview(!showReview)}
        showReview={showReview}
        onSave={handleQuickSave}
        onSaveAs={handleSaveToProject}
        savedToProject={savedToProject}
        editable
        onNameChange={(newName) => {
          useAppStore.setState({ editorFileName: newName })
        }}
        showToc={showToc}
        onToggleToc={() => setShowToc(!showToc)}
        onTemplate={() => setShowTemplates(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-hidden">
            <DocumentEditor
              content={editorContent}
              onChange={(html) => {
                setCurrentHtml(html)
                if (debounceRef.current) clearTimeout(debounceRef.current)
                debounceRef.current = setTimeout(() => {
                  setEditorContent(html)
                }, 300)
              }}
              editorRef={editorRef}
            />
          </div>
          <EditorStatusBar html={currentHtml || editorContent} />
        </div>
        {showReview && (
          <ReviewPanel
            html={currentHtml}
            editorRef={editorRef}
            onClose={() => setShowReview(false)}
          />
        )}
        <TableOfContents
          content={currentHtml || editorContent}
          visible={showToc}
          onToggle={() => setShowToc(false)}
        />
      </div>
      {showExport && (
        <ExportDialog
          html={currentHtml}
          fileName={editorFileName}
          onClose={() => setShowExport(false)}
        />
      )}
      {showSaveDialog && (
        <SaveToProjectDialog
          content={currentHtml || editorContent}
          fileName={editorFileName}
          existingFileId={savedFileId}
          onSaved={handleSaved}
          onClose={() => setShowSaveDialog(false)}
        />
      )}
      {showTemplates && (
        <Suspense fallback={null}>
          <TemplateManager
            onSelect={handleTemplateSelect}
            currentContent={currentHtml || editorContent}
            onClose={() => setShowTemplates(false)}
          />
        </Suspense>
      )}
    </div>
  )
}

function EditorHeader({
  name,
  type,
  isNew,
  saveStatus,
  onExport,
  onReview,
  showReview,
  onSave,
  onSaveAs,
  savedToProject,
  editable,
  onNameChange,
  showToc,
  onToggleToc,
  onTemplate,
}: {
  name: string
  type: string
  isNew?: boolean
  saveStatus?: 'idle' | 'saving' | 'saved'
  onExport: () => void
  onReview: () => void
  showReview: boolean
  onSave: () => void
  onSaveAs: () => void
  savedToProject: boolean
  editable?: boolean
  onNameChange?: (name: string) => void
  showToc?: boolean
  onToggleToc?: () => void
  onTemplate?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(name)

  const handleStartEdit = () => {
    if (!editable) return
    setEditName(name)
    setEditing(true)
  }

  const handleFinishEdit = () => {
    setEditing(false)
    if (editName.trim() && editName.trim() !== name) {
      onNameChange?.(editName.trim())
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2 bg-muted/20">
      <FileText className="h-4 w-4 text-primary" />

      {editing ? (
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleFinishEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleFinishEdit()
            if (e.key === 'Escape') { setEditing(false); setEditName(name) }
          }}
          className="h-6 w-48 text-sm font-medium px-1"
          autoFocus
        />
      ) : (
        <button
          onClick={handleStartEdit}
          className={`text-sm font-medium flex items-center gap-1 ${
            editable ? 'hover:text-primary cursor-pointer' : ''
          }`}
          title={editable ? '클릭하여 이름 변경' : undefined}
        >
          {name}
          {editable && <Pencil className="h-3 w-3 text-muted-foreground" />}
        </button>
      )}

      {!isNew && !editing && (
        <span className="text-xs text-muted-foreground uppercase ml-1">({type})</span>
      )}
      {isNew && !editing && (
        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary ml-1">새 문서</span>
      )}
      {isNew && saveStatus && <AutoSaveIndicator status={saveStatus} />}

      <div className="ml-auto flex gap-1">
        {onTemplate && (
          <Button variant="outline" size="sm" onClick={onTemplate}>
            <LayoutTemplate className="mr-1 h-3 w-3" />
            템플릿
          </Button>
        )}
        <Button
          variant={showToc ? 'default' : 'outline'}
          size="sm"
          onClick={onToggleToc}
        >
          <List className="mr-1 h-3 w-3" />
          목차
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={onSave}
        >
          {savedToProject ? (
            <>
              <Check className="mr-1 h-3 w-3" />
              저장됨
            </>
          ) : (
            <>
              <Save className="mr-1 h-3 w-3" />
              저장
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onSaveAs}
        >
          다른 위치에 저장
        </Button>
        <Button
          variant={showReview ? 'default' : 'outline'}
          size="sm"
          onClick={onReview}
        >
          <Shield className="mr-1 h-3 w-3" />
          AI 검수
        </Button>
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="mr-1 h-3 w-3" />
          내보내기
        </Button>
      </div>
    </div>
  )
}
