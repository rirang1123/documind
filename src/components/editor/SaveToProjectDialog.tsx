import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Save, X, Check, Loader2, FileText, FileType2, File } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/stores/useAppStore'
import { generateId } from '@/utils/id'
import { exportDocument, type ExportFormat } from '@/services/document/exportService'
import { detectCategory, htmlToPlainText, ensureCategoryFolder, smartClassify } from '@/services/document/classifyService'
import { join } from '@tauri-apps/api/path'
import type { DocumentFile } from '@/types'
import { FOLDER_CATEGORY_LABELS } from '@/types'

interface Props {
  content: string
  fileName: string
  onSaved: (file: DocumentFile) => void
  onClose: () => void
  existingFileId?: string | null
}

export function SaveToProjectDialog({ content, fileName, onSaved, onClose, existingFileId }: Props) {
  const { projects, folders, files, loadProjects, loadFolders, addFile, addFolder } = useAppStore()

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    useAppStore.getState().selectedProjectId
  )
  const [docName, setDocName] = useState(fileName.replace(/\.[^.]+$/, '') || '새 문서')
  const [saveFormat, setSaveFormat] = useState<ExportFormat>('docx')
  const formatOptions: { id: ExportFormat; label: string; icon: typeof FileText }[] = [
    { id: 'docx', label: 'DOCX', icon: FileText },
    { id: 'pdf', label: 'PDF', icon: FileType2 },
    { id: 'txt', label: 'TXT', icon: File },
  ]
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { category: detectedCategory } = detectCategory(docName, htmlToPlainText(content))
  const detectedLabel = FOLDER_CATEGORY_LABELS[detectedCategory]

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    if (selectedProjectId) {
      loadFolders(selectedProjectId)
    }
  }, [selectedProjectId, loadFolders])

  const handleSave = async () => {
    if (!selectedProjectId) {
      setError('프로젝트를 선택하세요.')
      return
    }
    if (!docName.trim()) {
      setError('문서 이름을 입력하세요.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const project = projects.find((p) => p.id === selectedProjectId)
      const { category, tags } = await smartClassify(docName.trim(), htmlToPlainText(content))

      // Auto-find or create category folder
      const folderId = await ensureCategoryFolder(
        selectedProjectId,
        project?.path || '',
        category,
        folders,
        addFolder,
      )

      const fileTypeMap: Record<ExportFormat, DocumentFile['type']> = {
        docx: 'docx', pdf: 'pdf', txt: 'txt', html: 'unknown', xlsx: 'xlsx',
      }

      // 디스크에 파일 저장 + 경로 계산
      let savedPath = docName.trim()
      if (project?.path) {
        try {
          const categoryLabel = FOLDER_CATEGORY_LABELS[category]
          const targetDir = await join(project.path, categoryLabel)
          await exportDocument(content, docName.trim(), saveFormat, targetDir)
          const baseName = docName.trim().replace(/\.[^.]+$/, '') || 'document'
          savedPath = await join(targetDir, `${baseName}.${saveFormat}`)
        } catch (diskErr) {
          console.error('로컬 디스크 저장 실패:', diskErr)
        }
      }

      let savedFile: DocumentFile

      if (existingFileId) {
        const existingFile = files.find((f) => f.id === existingFileId)
        if (existingFile) {
          savedFile = {
            ...existingFile,
            name: docName.trim(),
            path: savedPath,
            content,
            updatedAt: new Date(),
            folderId,
            aiCategory: category,
            tags: [...new Set([...(existingFile.tags || []), ...tags])],
            type: fileTypeMap[saveFormat],
          }
          await addFile(savedFile)
          onSaved(savedFile)
        } else {
          throw new Error('기존 파일을 찾을 수 없습니다.')
        }
      } else {
        savedFile = {
          id: generateId(),
          name: docName.trim(),
          path: savedPath,
          projectId: selectedProjectId,
          folderId,
          type: fileTypeMap[saveFormat],
          size: new Blob([content]).size,
          tags,
          aiCategory: category,
          createdAt: new Date(),
          updatedAt: new Date(),
          content,
        }
        await addFile(savedFile)
        onSaved(savedFile)
      }
    } catch (err) {
      setError(`저장 실패: ${err instanceof Error ? err.message : String(err)}`)
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[420px] rounded-lg bg-background border border-border shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Save className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">문서 저장</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Document name */}
        <div className="px-4 py-3 border-b border-border">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">문서 이름</label>
          <Input
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="문서 이름을 입력하세요"
          />
        </div>

        {/* File format selection */}
        <div className="px-4 py-2 border-b border-border">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">저장 형식</label>
          <div className="flex gap-1.5">
            {formatOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSaveFormat(opt.id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                  saveFormat === opt.id
                    ? 'bg-primary/10 text-primary ring-1 ring-primary/30 font-medium'
                    : 'bg-secondary hover:bg-accent text-secondary-foreground'
                }`}
              >
                <opt.icon className="h-3 w-3" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-classification preview */}
        <div className="px-4 py-2 border-b border-border bg-muted/30">
          <span className="text-xs text-muted-foreground">자동 분류: </span>
          <span className="text-xs font-medium text-primary">{detectedLabel}</span>
          <span className="text-xs text-muted-foreground"> 폴더에 저장됩니다</span>
        </div>

        {/* Project selection */}
        <div className="flex-1 overflow-y-auto min-h-[120px] max-h-[280px]">
          <div className="px-4 py-2">
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              프로젝트 선택
            </label>
          </div>

          {projects.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              프로젝트가 없습니다. 먼저 프로젝트를 만드세요.
            </div>
          ) : (
            <div className="px-2 space-y-0.5">
              {projects.map((project) => {
                const isSelected = selectedProjectId === project.id
                return (
                  <button
                    key={project.id}
                    onClick={() => setSelectedProjectId(project.id)}
                    className={`w-full flex items-center gap-2 rounded-md px-3 py-2.5 text-left cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="text-sm font-medium truncate">{project.name}</span>
                    {project.description && (
                      <span className="text-[10px] text-muted-foreground truncate ml-auto max-w-[120px]">
                        {project.description}
                      </span>
                    )}
                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 text-xs text-destructive bg-destructive/5 border-t border-destructive/20">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !selectedProjectId || !docName.trim()}
          >
            {saving ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                저장 중...
              </>
            ) : (
              <>
                <Save className="mr-1 h-3 w-3" />
                저장
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
