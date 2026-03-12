import { useEffect, useState } from 'react'
import {
  FileEdit,
  Trash2,
  Clock,
  FileText,
  Search,
  Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/stores/useAppStore'
import { ExportDialog } from '@/components/editor/ExportDialog'

export function DraftsView() {
  const { drafts, loadDrafts, openDraft, deleteDraft } = useAppStore()
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [exportDraft, setExportDraft] = useState<{ html: string; title: string } | null>(null)

  useEffect(() => {
    loadDrafts()
  }, [loadDrafts])

  const filtered = drafts.filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async (id: string) => {
    await deleteDraft(id)
    setDeleteTarget(null)
  }

  const formatDate = (date: Date) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '방금 전'
    if (mins < 60) return `${mins}분 전`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}시간 전`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}일 전`
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const getPreviewText = (html: string) => {
    const div = document.createElement('div')
    div.innerHTML = html
    const text = div.textContent || ''
    return text.slice(0, 120) + (text.length > 120 ? '...' : '')
  }

  if (drafts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <FileEdit className="mx-auto h-12 w-12 opacity-30" />
          <p className="mt-3 text-sm">임시 저장된 문서가 없습니다.</p>
          <p className="mt-1 text-xs">에디터에서 "임시 저장" 버튼으로 문서를 저장하세요.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <FileEdit className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">임시 저장 문서</span>
        <span className="text-xs text-muted-foreground">({drafts.length})</span>
        <div className="ml-auto relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="검색..."
            className="h-7 w-48 pl-7 text-xs"
          />
        </div>
      </div>

      {/* Draft list */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-3">
          {filtered.map((draft) => (
            <div
              key={draft.id}
              className="group rounded-lg border border-border p-4 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium truncate">{draft.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {getPreviewText(draft.content)}
                  </p>
                  <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{formatDate(draft.updatedAt)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 mt-3 pt-2 border-t border-border">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => openDraft(draft)}
                >
                  <FileText className="mr-1 h-3 w-3" />
                  열기
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setExportDraft({ html: draft.content, title: draft.title })}
                >
                  <Download className="mr-1 h-3 w-3" />
                  내보내기
                </Button>
                {deleteTarget === draft.id ? (
                  <div className="ml-auto flex gap-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      onClick={() => handleDelete(draft.id)}
                    >
                      삭제 확인
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setDeleteTarget(null)}
                    >
                      취소
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs ml-auto text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(draft.id)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    삭제
                  </Button>
                )}
              </div>
            </div>
          ))}

          {filtered.length === 0 && search && (
            <div className="text-center py-8 text-xs text-muted-foreground">
              "{search}" 검색 결과가 없습니다.
            </div>
          )}
        </div>
      </div>

      {exportDraft && (
        <ExportDialog
          html={exportDraft.html}
          fileName={exportDraft.title}
          onClose={() => setExportDraft(null)}
        />
      )}
    </div>
  )
}
