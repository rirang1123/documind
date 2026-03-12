import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  FolderOpen,
  FolderPlus,
  ChevronRight,
  FileText,
  X,
  Save,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getExportBaseDir,
  ensureExportDir,
  listFolderContents,
  createFolder,
  type FolderEntry,
} from '@/services/document/exportService'
import { useAppStore } from '@/stores/useAppStore'
import { join } from '@tauri-apps/api/path'

interface Props {
  fileName: string
  onSelect: (targetDir: string) => void
  onClose: () => void
}

interface BreadcrumbItem {
  name: string
  path: string
}

export function ExportLocationDialog({ fileName, onSelect, onClose }: Props) {
  const [baseDir, setBaseDir] = useState('')
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<FolderEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [error, setError] = useState('')
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])
  const pathHistoryRef = useRef<BreadcrumbItem[]>([])

  const buildBreadcrumbs = useCallback(async (base: string, current: string) => {
    const relative = current.replace(base, '').replace(/^[\\/]/, '')
    const crumbs: BreadcrumbItem[] = [{ name: 'DocuMind', path: base }]

    if (relative) {
      const segments = relative.split(/[\\/]/)
      let accumulated = base
      for (const seg of segments) {
        accumulated = await join(accumulated, seg)
        crumbs.push({ name: seg, path: accumulated })
      }
    }

    pathHistoryRef.current = crumbs
    setBreadcrumbs(crumbs)
  }, [])

  const loadContents = useCallback(async (path: string, base?: string) => {
    setLoading(true)
    setError('')
    try {
      await ensureExportDir(path)
      const items = await listFolderContents(path)
      setEntries(items)
      setCurrentPath(path)
      const effectiveBase = base || baseDir
      if (effectiveBase) {
        await buildBreadcrumbs(effectiveBase, path)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`폴더를 열 수 없습니다: ${msg}`)
      console.error('[ExportLocationDialog] loadContents failed:', err)
    } finally {
      setLoading(false)
    }
  }, [baseDir, buildBreadcrumbs])

  useEffect(() => {
    ;(async () => {
      try {
        const base = await getExportBaseDir()
        setBaseDir(base)

        // If a project is selected and has a path, start in the project folder
        const state = useAppStore.getState()
        const project = state.projects.find((p) => p.id === state.selectedProjectId)
        const startDir = project?.path || base

        await loadContents(startDir, base)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(`DocuMind 폴더를 초기화할 수 없습니다: ${msg}`)
        console.error('[ExportLocationDialog] init failed:', err)
        setLoading(false)
      }
    })()
  }, [loadContents])

  const navigateTo = async (path: string) => {
    await loadContents(path)
  }

  const openFolder = async (folderName: string) => {
    try {
      const newPath = await join(currentPath, folderName)
      await loadContents(newPath)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`폴더를 열 수 없습니다: ${msg}`)
      console.error('[ExportLocationDialog] openFolder failed:', err)
    }
  }

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim()
    if (!trimmed) return
    setError('')
    try {
      const newPath = await createFolder(currentPath, trimmed)
      setNewFolderName('')
      setCreating(false)
      await loadContents(newPath)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`폴더 생성 실패: ${msg}`)
      console.error('[ExportLocationDialog] createFolder failed:', err)
    }
  }

  const handleSave = () => {
    if (!currentPath) {
      setError('저장 경로가 설정되지 않았습니다.')
      return
    }
    onSelect(currentPath)
  }

  const folders = entries.filter((e) => e.isDirectory)
  const files = entries.filter((e) => !e.isDirectory)

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[480px] max-h-[600px] rounded-lg bg-background border border-border shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">저장 위치 선택</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Current path display */}
        <div className="px-4 py-1.5 border-b border-border bg-muted/30">
          <span className="text-[10px] text-muted-foreground font-mono truncate block">
            {currentPath || '경로 로드 중...'}
          </span>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-muted/20 overflow-x-auto">
          {breadcrumbs.map((crumb, idx) => (
            <div key={idx} className="flex items-center gap-1 shrink-0">
              {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              <button
                onClick={() => navigateTo(crumb.path)}
                className={`text-xs px-1.5 py-0.5 rounded hover:bg-accent cursor-pointer transition-colors ${
                  idx === breadcrumbs.length - 1
                    ? 'font-semibold text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                {crumb.name}
              </button>
            </div>
          ))}
        </div>

        {/* File name display */}
        <div className="px-4 py-2 border-b border-border bg-primary/5">
          <span className="text-xs text-muted-foreground">저장할 파일: </span>
          <span className="text-xs font-medium">{fileName}</span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[320px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">폴더 로드 중...</span>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {folders.length === 0 && files.length === 0 && !error && (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  빈 폴더입니다. 여기에 저장하거나 새 폴더를 만드세요.
                </div>
              )}
              {folders.map((folder) => (
                <button
                  key={folder.name}
                  onClick={() => openFolder(folder.name)}
                  className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-accent cursor-pointer transition-colors"
                >
                  <FolderOpen className="h-4 w-4 text-yellow-500 shrink-0" />
                  <span className="text-xs truncate">{folder.name}</span>
                </button>
              ))}
              {files.map((file) => (
                <div
                  key={file.name}
                  className="w-full flex items-center gap-2 rounded-md px-3 py-2 opacity-50"
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs truncate text-muted-foreground">{file.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New folder inline */}
        {creating && (
          <div className="flex items-center gap-2 px-4 py-2 border-t border-border bg-muted/20">
            <FolderPlus className="h-4 w-4 text-primary shrink-0" />
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder()
                if (e.key === 'Escape') { setCreating(false); setNewFolderName('') }
              }}
              placeholder="새 폴더 이름"
              className="h-7 text-xs flex-1"
              autoFocus
            />
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleCreateFolder}>
              만들기
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => { setCreating(false); setNewFolderName('') }}
            >
              취소
            </Button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 px-4 py-2 text-xs text-destructive bg-destructive/5 border-t border-destructive/20">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setCreating(true); setNewFolderName('') }}
            disabled={creating}
          >
            <FolderPlus className="mr-1 h-3 w-3" />
            새 폴더
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              취소
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!currentPath}>
              <Save className="mr-1 h-3 w-3" />
              여기에 저장
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
