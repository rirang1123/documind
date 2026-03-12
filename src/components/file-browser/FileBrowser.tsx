import { useEffect, useState, useRef, useCallback } from 'react'
import {
  FolderPlus,
  Upload,
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  FileSpreadsheet,
  Presentation,
  File,
  Trash2,
  Loader2,
  ArrowUpDown,
  Check,
  FolderDown,
  FolderUp,
} from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { generateId } from '@/utils/id'
import type { DocumentFile, FileType, Folder as FolderType, FolderCategory } from '@/types'
import { FOLDER_CATEGORY_LABELS } from '@/types'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { createSubFolderOnDisk } from '@/services/document/exportService'
import { smartClassify, ensureCategoryFolder, extractTextFromBinary } from '@/services/document/classifyService'
import DriveImportDialog from '@/components/cloud/DriveImportDialog'
import DriveExportDialog from '@/components/cloud/DriveExportDialog'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { readFile, readTextFile, stat, writeFile as tauriWriteFile, exists, mkdir, copyFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'

/** 분류 확인 대기 중인 파일 항목 */
interface PendingFile {
  id: string
  fileName: string
  fileType: FileType
  fileSize: number
  suggestedCategory: FolderCategory
  selectedCategory: FolderCategory
  tags: string[]
  content?: string
  blobData?: ArrayBuffer
  sourcePath?: string       // Tauri 파일 경로 (있으면 Tauri 소스)
}

const FILE_ICONS: Record<FileType, typeof FileText> = {
  docx: FileText,
  xlsx: FileSpreadsheet,
  pptx: Presentation,
  hwp: FileText,
  pdf: File,
  txt: FileText,
  md: FileText,
  unknown: File,
}

function getFileType(name: string): FileType {
  const ext = name.split('.').pop()?.toLowerCase()
  const map: Record<string, FileType> = {
    docx: 'docx', doc: 'docx',
    xlsx: 'xlsx', xls: 'xlsx',
    pptx: 'pptx', ppt: 'pptx',
    hwp: 'hwp',
    pdf: 'pdf',
    txt: 'txt',
    md: 'md',
  }
  return map[ext || ''] || 'unknown'
}

type SortBy = 'name' | 'date' | 'type'
type SortOrder = 'asc' | 'desc'

function sortFiles(files: DocumentFile[], sortBy: SortBy, sortOrder: SortOrder): DocumentFile[] {
  const sorted = [...files].sort((a, b) => {
    let cmp = 0
    switch (sortBy) {
      case 'name':
        cmp = a.name.localeCompare(b.name, 'ko')
        break
      case 'date':
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
        break
      case 'type':
        cmp = a.type.localeCompare(b.type)
        break
    }
    return sortOrder === 'asc' ? cmp : -cmp
  })
  return sorted
}

export function FileBrowser() {
  const {
    selectedProjectId,
    projects,
    files,
    folders,
    selectedFileId,
    selectFile,
    addFile,
    addFolder,
    deleteFile,
    deleteFolder,
    openFileViewer,
    renameFile,
    moveFile,
    settings,
  } = useAppStore()

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderCategory, setNewFolderCategory] = useState<FolderCategory>('other')
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null)

  // D1: Rename state
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // D2: Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fileId: string } | null>(null)
  const [moveTarget, setMoveTarget] = useState<{ fileId: string } | null>(null)

  // D3: Sort state
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  // D4: 분류 확인 대기열
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [showClassifyConfirm, setShowClassifyConfirm] = useState(false)

  // D5: Cloud (Drive) 가져오기/내보내기
  const [showDriveImport, setShowDriveImport] = useState(false)
  const [showDriveExport, setShowDriveExport] = useState(false)
  const [exportTarget, setExportTarget] = useState<{
    files?: DocumentFile[]
    folder?: { folder: FolderType; files: DocumentFile[] }
  } | null>(null)

  // 활성 클라우드 제공자 ID (Google Drive 연결됨일 때)
  const activeCloudProvider = settings?.cloudProviders?.find(
    (p) => p.id === settings.activeCloudProviderId && p.email
  )
  const cloudProviderId = activeCloudProvider?.id

  const project = projects.find((p) => p.id === selectedProjectId)

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !selectedProjectId) return

    // Create folder on disk if the project has a path
    if (project?.path) {
      try {
        await createSubFolderOnDisk(project.path, newFolderName.trim())
      } catch (err) {
        console.error('디스크 폴더 생성 실패:', err)
      }
    }

    const folder: FolderType = {
      id: generateId(),
      name: newFolderName.trim(),
      projectId: selectedProjectId,
      parentId: null,
      category: newFolderCategory,
      createdAt: new Date(),
    }
    await addFolder(folder)
    setNewFolderName('')
    setShowNewFolder(false)
  }

  const handleSortClick = (newSortBy: SortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(newSortBy)
      setSortOrder('asc')
    }
  }

  // D1: Rename handlers
  const handleStartRename = (file: DocumentFile) => {
    setRenamingFileId(file.id)
    setRenameValue(file.name)
  }

  const handleFinishRename = async () => {
    if (renamingFileId && renameValue.trim()) {
      await renameFile(renamingFileId, renameValue.trim())
    }
    setRenamingFileId(null)
    setRenameValue('')
  }

  const handleCancelRename = () => {
    setRenamingFileId(null)
    setRenameValue('')
  }

  // D2: Context menu handler
  const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, fileId })
  }

  const handleMoveFile = async (targetFolderId: string | undefined) => {
    if (moveTarget) {
      await moveFile(moveTarget.fileId, targetFolderId)
      setMoveTarget(null)
    }
  }

  /** 웹 File 객체 → 분류만 수행, pending에 추가 */
  const classifyWebFile = async (f: globalThis.File): Promise<PendingFile> => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    const isTextFile = ['txt', 'md', 'html', 'htm', 'csv'].includes(ext || '')

    let textContent = ''
    let content: string | undefined
    let blobData: ArrayBuffer | undefined

    const fileType = getFileType(f.name)

    if (isTextFile) {
      try {
        const text = await f.text()
        textContent = text.slice(0, 2000)
        content = text
      } catch { /* ignore */ }
    } else {
      try {
        blobData = await f.arrayBuffer()
        if (blobData && ['docx', 'xlsx', 'pptx'].includes(fileType)) {
          textContent = await extractTextFromBinary(blobData, fileType)
        }
      } catch { /* ignore */ }
    }

    const { category, tags } = await smartClassify(f.name, textContent)

    return {
      id: generateId(),
      fileName: f.name,
      fileType,
      fileSize: f.size,
      suggestedCategory: category,
      selectedCategory: category,
      tags,
      content,
      blobData,
    }
  }

  /** Tauri 파일 경로 → 분류만 수행, pending에 추가 */
  const classifyTauriFile = async (filePath: string): Promise<PendingFile> => {
    const fileName = filePath.split(/[/\\]/).pop() || filePath
    const ext = fileName.split('.').pop()?.toLowerCase()
    const isTextFile = ['txt', 'md', 'html', 'htm', 'csv'].includes(ext || '')
    const fileType = getFileType(fileName)

    let textContent = ''
    let content: string | undefined
    let blobData: ArrayBuffer | undefined
    let fileSize = 0

    try {
      const fileStat = await stat(filePath)
      fileSize = fileStat.size
    } catch { /* ignore */ }

    if (isTextFile) {
      try {
        const text = await readTextFile(filePath)
        textContent = text.slice(0, 2000)
        content = text
        fileSize = fileSize || new Blob([text]).size
      } catch (err) {
        console.error('텍스트 파일 읽기 실패:', err)
      }
    } else {
      try {
        const bytes = await readFile(filePath)
        blobData = bytes.buffer as ArrayBuffer
        fileSize = fileSize || bytes.byteLength
        if (blobData && ['docx', 'xlsx', 'pptx'].includes(fileType)) {
          textContent = await extractTextFromBinary(blobData, fileType)
        }
      } catch (err) {
        console.error('바이너리 파일 읽기 실패:', err)
      }
    }

    const { category, tags } = await smartClassify(fileName, textContent)

    return {
      id: generateId(),
      fileName,
      fileType,
      fileSize: fileSize,
      suggestedCategory: category,
      selectedCategory: category,
      tags,
      content,
      blobData,
      sourcePath: filePath,
    }
  }

  /** 확인된 pending 파일들을 실제로 저장 */
  const commitPendingFiles = useCallback(async (filesToCommit: PendingFile[]) => {
    if (!selectedProjectId) return

    for (const pf of filesToCommit) {
      const category = pf.selectedCategory
      const currentProject = projects.find((p) => p.id === selectedProjectId)
      const currentFolders = useAppStore.getState().folders

      const folderId = await ensureCategoryFolder(
        selectedProjectId,
        currentProject?.path || '',
        category,
        currentFolders,
        addFolder,
      )

      // 프로젝트 디스크 폴더에 파일 복사
      let savedPath = pf.sourcePath || pf.fileName
      if (currentProject?.path) {
        try {
          const categoryLabel = FOLDER_CATEGORY_LABELS[category]
          const targetDir = await join(currentProject.path, categoryLabel)
          if (!(await exists(targetDir))) {
            await mkdir(targetDir, { recursive: true })
          }
          const safeName = pf.fileName.replace(/[<>:"/\\|?*]/g, '_')
          const targetPath = await join(targetDir, safeName)
          const shouldCopy = !pf.sourcePath || pf.sourcePath !== targetPath
          if (shouldCopy) {
            if (pf.blobData) {
              await tauriWriteFile(targetPath, new Uint8Array(pf.blobData))
            } else if (pf.content) {
              const { writeTextFile: wtf } = await import('@tauri-apps/plugin-fs')
              await wtf(targetPath, pf.content)
            } else if (pf.sourcePath) {
              // blobData/content가 없으면 원본 파일을 직접 복사
              await copyFile(pf.sourcePath, targetPath)
            }
          }
          savedPath = targetPath
        } catch (err) {
          console.error('디스크 파일 복사 실패:', err)
        }
      }

      const docFile: DocumentFile = {
        id: pf.id,
        name: pf.fileName,
        path: savedPath,
        projectId: selectedProjectId,
        folderId,
        type: pf.fileType,
        size: pf.fileSize,
        tags: pf.tags,
        aiCategory: category,
        createdAt: new Date(),
        updatedAt: new Date(),
        content: pf.content,
        blobData: pf.blobData,
      }
      await addFile(docFile)
    }
  }, [selectedProjectId, projects, addFolder, addFile])

  /** Tauri 드래그앤드롭 이벤트 리스너 등록 */
  useEffect(() => {
    let unlisten: (() => void) | undefined

    const setup = async () => {
      const appWindow = getCurrentWindow()
      unlisten = await appWindow.onDragDropEvent(async (event) => {
        const projectId = useAppStore.getState().selectedProjectId
        if (!projectId) return

        if (event.payload.type === 'over') {
          setDragOver(true)
        } else if (event.payload.type === 'leave') {
          setDragOver(false)
        } else if (event.payload.type === 'drop') {
          setDragOver(false)
          const paths = event.payload.paths
          if (!paths || paths.length === 0) return

          setUploading(true)
          setUploadProgress({ current: 0, total: paths.length })

          const classified: PendingFile[] = []
          for (let i = 0; i < paths.length; i++) {
            setUploadProgress({ current: i + 1, total: paths.length })
            classified.push(await classifyTauriFile(paths[i]))
          }

          setUploading(false)
          setUploadProgress({ current: 0, total: 0 })
          setPendingFiles(classified)
          setShowClassifyConfirm(true)
        }
      })
    }

    setup()
    return () => { unlisten?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, addFile, addFolder, projects])

  /** 파일 선택 다이얼로그 (input[type=file]) */
  const handleFileSelect = async () => {
    if (!selectedProjectId) return
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = async () => {
      const fileList = Array.from(input.files || [])
      if (fileList.length === 0) return

      setUploading(true)
      setUploadProgress({ current: 0, total: fileList.length })

      const classified: PendingFile[] = []
      for (let i = 0; i < fileList.length; i++) {
        setUploadProgress({ current: i + 1, total: fileList.length })
        classified.push(await classifyWebFile(fileList[i]))
      }

      setUploading(false)
      setUploadProgress({ current: 0, total: 0 })
      setPendingFiles(classified)
      setShowClassifyConfirm(true)
    }
    input.click()
  }

  /** 모든 파일을 뷰어로 열기 (편집은 뷰어에서 외부 앱으로) */
  const handleOpenFile = (file: DocumentFile) => {
    selectFile(file.id)
    openFileViewer(file.id)
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Folder className="mx-auto h-12 w-12 opacity-30" />
          <p className="mt-3 text-sm">사이드바에서 프로젝트를 선택하거나 새 프로젝트를 만드세요.</p>
        </div>
      </div>
    )
  }

  const rootFolders = folders.filter((f) => f.parentId === null)
  const rootFiles = files.filter((f) => f.folderId === null)

  // Apply sorting
  const sortedRootFiles = sortFiles(rootFiles, sortBy, sortOrder)

  return (
    <div
      className={cn('h-full p-4', dragOver && 'bg-primary/5 ring-2 ring-primary/30 ring-inset')}
    >
      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-lg font-semibold">{project.name}</h2>
        <div className="ml-auto flex gap-1">
          <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)}>
            <FolderPlus className="mr-1 h-3.5 w-3.5" />
            폴더
          </Button>
          <Button variant="outline" size="sm" onClick={handleFileSelect} disabled={uploading}>
            <Upload className="mr-1 h-3.5 w-3.5" />
            파일 추가
          </Button>
          {cloudProviderId && (
            <Button variant="outline" size="sm" onClick={() => setShowDriveImport(true)}>
              <FolderDown className="mr-1 h-3.5 w-3.5" />
              Drive 가져오기
            </Button>
          )}
        </div>
      </div>

      {/* Sort Controls (D3) */}
      <div className="mb-2 flex items-center gap-1 text-xs">
        <ArrowUpDown className="h-3 w-3 text-muted-foreground mr-1" />
        <span className="text-muted-foreground mr-1">정렬:</span>
        {([['name', '이름'], ['date', '날짜'], ['type', '유형']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => handleSortClick(key)}
            className={cn(
              'px-2 py-0.5 rounded text-xs transition-colors',
              sortBy === key
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            {label}
            {sortBy === key && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
          </button>
        ))}
      </div>

      {/* Upload Progress */}
      {uploading && (
        <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-primary font-medium">
              업로드 중... ({uploadProgress.current}/{uploadProgress.total})
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-primary/20">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${uploadProgress.total ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* File Tree */}
      <div className="rounded-lg border border-border">
        {rootFolders.map((folder) => {
          const folderFiles = sortFiles(
            files.filter((f) => f.folderId === folder.id),
            sortBy,
            sortOrder
          )
          const isExpanded = expandedFolders.has(folder.id)

          return (
            <div key={folder.id}>
              <div className="flex items-center gap-1 px-3 py-1.5 hover:bg-accent group">
                <button onClick={() => toggleFolder(folder.id)} className="cursor-pointer">
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                <Folder className="h-4 w-4 text-yellow-500" />
                <span className="text-sm flex-1">{folder.name}</span>
                {folder.category && (
                  <span className="text-xs text-muted-foreground">
                    {FOLDER_CATEGORY_LABELS[folder.category]}
                  </span>
                )}
                {cloudProviderId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const folderFiles = files.filter((f) => f.folderId === folder.id)
                      setExportTarget({ folder: { folder, files: folderFiles } })
                      setShowDriveExport(true)
                    }}
                    className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-primary"
                    title="Drive로 내보내기"
                  >
                    <FolderUp className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name })}
                  className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {isExpanded &&
                folderFiles.map((file) => {
                  const Icon = FILE_ICONS[file.type]
                  return (
                    <FileRow
                      key={file.id}
                      file={file}
                      Icon={Icon}
                      isSelected={selectedFileId === file.id}
                      onSelect={() => handleOpenFile(file)}
                      onDelete={() => setDeleteTarget({ type: 'file', id: file.id, name: file.name })}
                      onContextMenu={(e) => handleContextMenu(e, file.id)}
                      isRenaming={renamingFileId === file.id}
                      renameValue={renameValue}
                      onRenameChange={setRenameValue}
                      onRenameFinish={handleFinishRename}
                      onRenameCancel={handleCancelRename}
                      onDoubleClickName={() => handleStartRename(file)}
                      indent
                    />
                  )
                })}
            </div>
          )
        })}

        {sortedRootFiles.map((file) => {
          const Icon = FILE_ICONS[file.type]
          return (
            <FileRow
              key={file.id}
              file={file}
              Icon={Icon}
              isSelected={selectedFileId === file.id}
              onSelect={() => handleOpenFile(file)}
              onDelete={() => setDeleteTarget({ type: 'file', id: file.id, name: file.name })}
              onContextMenu={(e) => handleContextMenu(e, file.id)}
              isRenaming={renamingFileId === file.id}
              renameValue={renameValue}
              onRenameChange={setRenameValue}
              onRenameFinish={handleFinishRename}
              onRenameCancel={handleCancelRename}
              onDoubleClickName={() => handleStartRename(file)}
            />
          )
        })}

        {rootFolders.length === 0 && rootFiles.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            파일을 드래그하여 추가하거나 "파일 추가" 버튼을 클릭하세요.
          </div>
        )}
      </div>

      {/* Context Menu (D2) */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-32 rounded-md border border-border bg-popover shadow-md py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            onClick={() => {
              setMoveTarget({ fileId: contextMenu.fileId })
              setContextMenu(null)
            }}
          >
            이동
          </button>
          {cloudProviderId && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              onClick={() => {
                const f = files.find((fl) => fl.id === contextMenu.fileId)
                if (f) {
                  setExportTarget({ files: [f] })
                  setShowDriveExport(true)
                }
                setContextMenu(null)
              }}
            >
              Drive로 내보내기
            </button>
          )}
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            onClick={() => {
              const f = files.find((fl) => fl.id === contextMenu.fileId)
              if (f) handleStartRename(f)
              setContextMenu(null)
            }}
          >
            이름 변경
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent text-destructive transition-colors"
            onClick={() => {
              const f = files.find((fl) => fl.id === contextMenu.fileId)
              if (f) setDeleteTarget({ type: 'file', id: f.id, name: f.name })
              setContextMenu(null)
            }}
          >
            삭제
          </button>
        </div>
      )}

      {/* Move Dialog (D2) */}
      {moveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold mb-3">파일 이동</h3>
            <p className="text-sm text-muted-foreground mb-3">이동할 폴더를 선택하세요.</p>
            <div className="flex flex-col gap-1 max-h-60 overflow-y-auto mb-4">
              <button
                className="text-left px-3 py-2 rounded hover:bg-accent text-sm flex items-center gap-2"
                onClick={() => handleMoveFile(undefined)}
              >
                <Folder className="h-4 w-4 text-muted-foreground" />
                루트 (폴더 없음)
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  className="text-left px-3 py-2 rounded hover:bg-accent text-sm flex items-center gap-2"
                  onClick={() => handleMoveFile(folder.id)}
                >
                  <Folder className="h-4 w-4 text-yellow-500" />
                  {folder.name}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setMoveTarget(null)}>
                취소
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Dialog */}
      <Dialog open={showNewFolder} onClose={() => setShowNewFolder(false)} title="새 폴더">
        <div className="flex flex-col gap-3">
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="폴더 이름"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
          />
          <select
            value={newFolderCategory}
            onChange={(e) => setNewFolderCategory(e.target.value as FolderCategory)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            {Object.entries(FOLDER_CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNewFolder(false)}>
              취소
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              생성
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold mb-2">삭제 확인</h3>
            <p className="text-sm text-muted-foreground mb-4">
              &quot;{deleteTarget.name}&quot;을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                취소
              </Button>
              <Button
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (deleteTarget.type === 'file') {
                    deleteFile(deleteTarget.id)
                  } else {
                    deleteFolder(deleteTarget.id)
                  }
                  setDeleteTarget(null)
                }}
              >
                삭제
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 분류 확인 다이얼로그 (D4) */}
      {showClassifyConfirm && pendingFiles.length > 0 && (
        <ClassifyConfirmDialog
          pendingFiles={pendingFiles}
          onUpdateCategory={(id, category) => {
            setPendingFiles((prev) =>
              prev.map((pf) => (pf.id === id ? { ...pf, selectedCategory: category } : pf))
            )
          }}
          onConfirm={async () => {
            setShowClassifyConfirm(false)
            await commitPendingFiles(pendingFiles)
            setPendingFiles([])
          }}
          onCancel={() => {
            setShowClassifyConfirm(false)
            setPendingFiles([])
          }}
        />
      )}

      {/* Drive 가져오기 다이얼로그 (D5) */}
      {cloudProviderId && (
        <DriveImportDialog
          open={showDriveImport}
          onClose={() => setShowDriveImport(false)}
          providerId={cloudProviderId}
        />
      )}

      {/* Drive 내보내기 다이얼로그 (D5) */}
      {cloudProviderId && exportTarget && (
        <DriveExportDialog
          open={showDriveExport}
          onClose={() => {
            setShowDriveExport(false)
            setExportTarget(null)
          }}
          providerId={cloudProviderId}
          exportFiles={exportTarget.files}
          exportFolder={exportTarget.folder}
        />
      )}
    </div>
  )
}

function FileRow({
  file,
  Icon,
  isSelected,
  onSelect,
  onDelete,
  onContextMenu,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameFinish,
  onRenameCancel,
  onDoubleClickName,
  indent,
}: {
  file: DocumentFile
  Icon: typeof FileText
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  onContextMenu: (e: React.MouseEvent) => void
  isRenaming: boolean
  renameValue: string
  onRenameChange: (val: string) => void
  onRenameFinish: () => void
  onRenameCancel: () => void
  onDoubleClickName: () => void
  indent?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 cursor-pointer group',
        indent && 'pl-9',
        isSelected ? 'bg-primary/10' : 'hover:bg-accent'
      )}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      {isRenaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameFinish}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameFinish()
            if (e.key === 'Escape') onRenameCancel()
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 text-sm bg-background border border-border rounded px-1 py-0 outline-none focus:ring-1 focus:ring-primary"
        />
      ) : (
        <span
          className="flex-1 truncate text-sm"
          onDoubleClick={(e) => {
            e.stopPropagation()
            onDoubleClickName()
          }}
        >
          {file.name}
        </span>
      )}
      <span className="text-xs text-muted-foreground">
        {(file.size / 1024).toFixed(1)}KB
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// 분류 확인 다이얼로그 (드래그앤드롭 지원)
// ─────────────────────────────────────────────

const ALL_CATEGORIES: FolderCategory[] = [
  'planning', 'meeting', 'report', 'evaluation', 'reference', 'contract', 'finance', 'other',
]

const CATEGORY_COLORS: Record<FolderCategory, string> = {
  planning: 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950',
  meeting: 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950',
  report: 'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-950',
  evaluation: 'border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-950',
  reference: 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-900',
  contract: 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950',
  finance: 'border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950',
  other: 'border-border bg-muted/30',
}

const CATEGORY_DROP_HIGHLIGHT: Record<FolderCategory, string> = {
  planning: 'ring-2 ring-blue-400 bg-blue-100 dark:ring-blue-500 dark:bg-blue-900',
  meeting: 'ring-2 ring-green-400 bg-green-100 dark:ring-green-500 dark:bg-green-900',
  report: 'ring-2 ring-orange-400 bg-orange-100 dark:ring-orange-500 dark:bg-orange-900',
  evaluation: 'ring-2 ring-purple-400 bg-purple-100 dark:ring-purple-500 dark:bg-purple-900',
  reference: 'ring-2 ring-gray-400 bg-gray-100 dark:ring-gray-500 dark:bg-gray-800',
  contract: 'ring-2 ring-red-400 bg-red-100 dark:ring-red-500 dark:bg-red-900',
  finance: 'ring-2 ring-yellow-400 bg-yellow-100 dark:ring-yellow-500 dark:bg-yellow-900',
  other: 'ring-2 ring-border bg-muted/50',
}

function ClassifyConfirmDialog({
  pendingFiles,
  onUpdateCategory,
  onConfirm,
  onCancel,
}: {
  pendingFiles: PendingFile[]
  onUpdateCategory: (id: string, category: FolderCategory) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [dragFileId, setDragFileId] = useState<string | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<FolderCategory | null>(null)

  const changedCount = pendingFiles.filter(
    (pf) => pf.selectedCategory !== pf.suggestedCategory
  ).length

  // 파일이 있는 카테고리만 + 빈 카테고리는 드롭 존으로만
  const usedCategories = new Set(pendingFiles.map((pf) => pf.selectedCategory))
  const grouped = ALL_CATEGORIES.filter(
    (cat) => usedCategories.has(cat) || cat === dragOverCategory
  )

  const handleConfirm = async () => {
    setSaving(true)
    await onConfirm()
    setSaving(false)
  }

  // ── 드래그 핸들러 ──
  const handleDragStart = (e: React.DragEvent, fileId: string) => {
    setDragFileId(fileId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', fileId)
  }

  const handleDragEnd = () => {
    setDragFileId(null)
    setDragOverCategory(null)
  }

  const handleCategoryDragOver = (e: React.DragEvent, cat: FolderCategory) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverCategory !== cat) setDragOverCategory(cat)
  }

  const handleCategoryDragLeave = (e: React.DragEvent, cat: FolderCategory) => {
    // relatedTarget이 자식이면 무시
    const related = e.relatedTarget as Node | null
    if (related && (e.currentTarget as Node).contains(related)) return
    if (dragOverCategory === cat) setDragOverCategory(null)
  }

  const handleCategoryDrop = (e: React.DragEvent, cat: FolderCategory) => {
    e.preventDefault()
    const fileId = e.dataTransfer.getData('text/plain') || dragFileId
    if (fileId) {
      onUpdateCategory(fileId, cat)
    }
    setDragFileId(null)
    setDragOverCategory(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-background shadow-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold">분류 확인</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {pendingFiles.length}개 파일의 분류 결과를 확인해주세요.
            파일을 드래그하여 다른 카테고리로 이동할 수 있습니다.
          </p>
        </div>

        {/* Category Groups */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          <div className="flex flex-col gap-3">
            {grouped.map((cat) => {
              const filesInCat = pendingFiles.filter((pf) => pf.selectedCategory === cat)
              const isDragOver = dragOverCategory === cat
              const isEmpty = filesInCat.length === 0

              return (
                <div
                  key={cat}
                  onDragOver={(e) => handleCategoryDragOver(e, cat)}
                  onDragLeave={(e) => handleCategoryDragLeave(e, cat)}
                  onDrop={(e) => handleCategoryDrop(e, cat)}
                  className={cn(
                    'rounded-lg border-2 border-dashed transition-all',
                    isDragOver
                      ? CATEGORY_DROP_HIGHLIGHT[cat]
                      : CATEGORY_COLORS[cat],
                    isEmpty && !isDragOver && 'hidden',
                    isEmpty && isDragOver && 'py-6',
                  )}
                >
                  {/* Category Header */}
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Folder className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                    <span className="text-sm font-semibold">
                      {FOLDER_CATEGORY_LABELS[cat]}
                    </span>
                    {filesInCat.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ({filesInCat.length}개)
                      </span>
                    )}
                  </div>

                  {/* Files */}
                  {filesInCat.length > 0 && (
                    <div className="px-2 pb-2 flex flex-col gap-1">
                      {filesInCat.map((pf) => {
                        const Icon = FILE_ICONS[pf.fileType]
                        const wasChanged = pf.selectedCategory !== pf.suggestedCategory
                        const isDragging = dragFileId === pf.id

                        return (
                          <div
                            key={pf.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, pf.id)}
                            onDragEnd={handleDragEnd}
                            className={cn(
                              'flex items-center gap-2.5 rounded-md border bg-background px-3 py-2',
                              'cursor-grab active:cursor-grabbing select-none',
                              'hover:shadow-sm transition-all',
                              isDragging && 'opacity-40 scale-95',
                              wasChanged
                                ? 'border-primary/40'
                                : 'border-border',
                            )}
                          >
                            <div className="text-muted-foreground shrink-0 cursor-grab">
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                                <circle cx="3.5" cy="2.5" r="1" />
                                <circle cx="8.5" cy="2.5" r="1" />
                                <circle cx="3.5" cy="6" r="1" />
                                <circle cx="8.5" cy="6" r="1" />
                                <circle cx="3.5" cy="9.5" r="1" />
                                <circle cx="8.5" cy="9.5" r="1" />
                              </svg>
                            </div>
                            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm flex-1 truncate">{pf.fileName}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {(pf.fileSize / 1024).toFixed(1)}KB
                            </span>
                            {wasChanged && (
                              <span className="text-[10px] text-primary font-medium shrink-0 px-1.5 py-0.5 rounded-full bg-primary/10">
                                변경됨
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Empty drop zone hint */}
                  {isEmpty && isDragOver && (
                    <p className="text-center text-sm text-muted-foreground">
                      여기에 놓으면 <strong>{FOLDER_CATEGORY_LABELS[cat]}</strong>(으)로 분류됩니다
                    </p>
                  )}
                </div>
              )
            })}

            {/* 비어있는 카테고리 드롭 존 (드래그 중일 때만 표시) */}
            {dragFileId && (
              <div className="flex flex-wrap gap-2 mt-1">
                {ALL_CATEGORIES.filter((cat) => !usedCategories.has(cat)).map((cat) => (
                  <div
                    key={cat}
                    onDragOver={(e) => handleCategoryDragOver(e, cat)}
                    onDragLeave={(e) => handleCategoryDragLeave(e, cat)}
                    onDrop={(e) => handleCategoryDrop(e, cat)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border-2 border-dashed px-3 py-2 text-xs transition-all',
                      dragOverCategory === cat
                        ? CATEGORY_DROP_HIGHLIGHT[cat]
                        : 'border-border/50 text-muted-foreground hover:border-border',
                    )}
                  >
                    <Folder className="h-3.5 w-3.5" />
                    {FOLDER_CATEGORY_LABELS[cat]}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {changedCount > 0
              ? `${changedCount}개 파일의 분류가 변경되었습니다.`
              : '분류를 확인하고 저장하세요.'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel} disabled={saving}>
              취소
            </Button>
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  확인 및 저장
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
