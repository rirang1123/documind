import { useState, useEffect, useCallback } from 'react'
import {
  Folder,
  FileText,
  FileSpreadsheet,
  Presentation,
  File,
  ChevronRight,
  Loader2,
  Check,
  ArrowLeft,
  Plus,
  FolderDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/utils/cn'
import { useAppStore } from '@/stores/useAppStore'
import { generateId } from '@/utils/id'
import type { CloudFile } from '@/services/cloud/cloudProvider'
import type {
  DocumentFile,
  FileType,
  Folder as FolderType,
  Project,
} from '@/types'
import { FOLDER_CATEGORY_LABELS } from '@/types'
import * as drive from '@/services/cloud/googleDriveProvider'
import {
  smartClassify,
  ensureCategoryFolder,
  extractTextFromBinary,
} from '@/services/document/classifyService'
import { writeFile as tauriWriteFile, mkdir, exists } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'

// ─── Types ────────────────────────────────────────────────────

interface DriveImportDialogProps {
  open: boolean
  onClose: () => void
  providerId: string
}

type ImportStep = 'browse' | 'options' | 'importing' | 'done'

// ─── Helpers ──────────────────────────────────────────────────

function getFileTypeFromMime(mimeType: string, name: string): FileType {
  if (mimeType.includes('word') || mimeType === 'application/vnd.google-apps.document')
    return 'docx'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'xlsx'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'pptx'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('text/')) return 'txt'
  const ext = name.split('.').pop()?.toLowerCase()
  const extMap: Record<string, FileType> = {
    docx: 'docx',
    doc: 'docx',
    xlsx: 'xlsx',
    xls: 'xlsx',
    pptx: 'pptx',
    ppt: 'pptx',
    pdf: 'pdf',
    txt: 'txt',
    md: 'md',
    hwp: 'hwp',
  }
  return extMap[ext || ''] || 'unknown'
}

function getFileIcon(file: CloudFile) {
  if (file.isFolder) return <Folder className="h-4 w-4 text-blue-500" />
  const ft = getFileTypeFromMime(file.mimeType, file.name)
  switch (ft) {
    case 'docx':
      return <FileText className="h-4 w-4 text-blue-600" />
    case 'xlsx':
      return <FileSpreadsheet className="h-4 w-4 text-green-600" />
    case 'pptx':
      return <Presentation className="h-4 w-4 text-orange-500" />
    case 'pdf':
      return <File className="h-4 w-4 text-red-500" />
    default:
      return <File className="h-4 w-4 text-muted-foreground" />
  }
}

function formatSize(bytes: number): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

/** Resolve the actual file name after potential Google Workspace export */
function resolveFileName(file: CloudFile): string {
  if (drive.isGoogleWorkspaceFile(file.mimeType)) {
    const exportInfo = drive.getExportInfo(file.mimeType)
    if (exportInfo && !file.name.endsWith(exportInfo.ext)) {
      return file.name + exportInfo.ext
    }
  }
  return file.name
}

// ─── Component ────────────────────────────────────────────────

export default function DriveImportDialog({
  open,
  onClose,
  providerId,
}: DriveImportDialogProps) {
  // ── Drive browsing state ──
  const [, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumb, setBreadcrumb] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: 'My Drive' },
  ])
  const [driveFiles, setDriveFiles] = useState<CloudFile[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<CloudFile[]>([])
  const [selectedFolder, setSelectedFolder] = useState<CloudFile | null>(null)

  // ── Step management ──
  const [step, setStep] = useState<ImportStep>('browse')

  // ── Import options ──
  const [folderImportMode, setFolderImportMode] = useState<'structure' | 'classify'>(
    'structure',
  )
  const [targetProjectId, setTargetProjectId] = useState<string | null>(null)
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewProject, setShowNewProject] = useState(false)

  // ── Progress ──
  const [progress, setProgress] = useState({ current: 0, total: 0, fileName: '' })
  const [importedCount, setImportedCount] = useState(0)
  const [cancelled, setCancelled] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Store ──
  const projects = useAppStore((s) => s.projects)
  const addFile = useAppStore((s) => s.addFile)
  const addFolder = useAppStore((s) => s.addFolder)

  // ── Reset state on close / open ──
  useEffect(() => {
    if (open) {
      resetState()
      loadDriveFiles(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function resetState() {
    setCurrentFolderId(null)
    setBreadcrumb([{ id: null, name: 'My Drive' }])
    setDriveFiles([])
    setSelectedFiles([])
    setSelectedFolder(null)
    setStep('browse')
    setFolderImportMode('structure')
    setTargetProjectId(null)
    setNewProjectName('')
    setShowNewProject(false)
    setProgress({ current: 0, total: 0, fileName: '' })
    setImportedCount(0)
    setCancelled(false)
    setError(null)
    setLoading(false)
  }

  // ── Load Drive files ──
  const loadDriveFiles = useCallback(
    async (folderId: string | null) => {
      setLoading(true)
      try {
        const result = await drive.listFiles(providerId, folderId ?? undefined)
        // Sort: folders first, then by name
        const sorted = [...result.files].sort((a, b) => {
          if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        setDriveFiles(sorted)
      } catch (err) {
        console.error('Drive 파일 목록 로드 실패:', err)
        setError('Drive 파일을 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    },
    [providerId],
  )

  // ── Navigation ──
  function navigateToFolder(folder: CloudFile) {
    setCurrentFolderId(folder.id)
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }])
    setSelectedFiles([])
    setSelectedFolder(null)
    loadDriveFiles(folder.id)
  }

  function navigateToBreadcrumb(index: number) {
    const target = breadcrumb[index]
    setCurrentFolderId(target.id)
    setBreadcrumb((prev) => prev.slice(0, index + 1))
    setSelectedFiles([])
    setSelectedFolder(null)
    loadDriveFiles(target.id)
  }

  // ── Selection ──
  function toggleFileSelection(file: CloudFile) {
    if (file.isFolder) {
      // Selecting a folder deselects files
      if (selectedFolder?.id === file.id) {
        setSelectedFolder(null)
      } else {
        setSelectedFolder(file)
        setSelectedFiles([])
      }
    } else {
      // Selecting files deselects folder
      setSelectedFolder(null)
      setSelectedFiles((prev) => {
        const exists = prev.find((f) => f.id === file.id)
        if (exists) return prev.filter((f) => f.id !== file.id)
        return [...prev, file]
      })
    }
  }

  // ── Create project helper ──
  async function createProject(name: string): Promise<Project> {
    const settings = useAppStore.getState().settings
    const projectPath = settings?.storagePath
      ? await join(settings.storagePath, name)
      : ''
    if (projectPath) {
      const pathExists = await exists(projectPath)
      if (!pathExists) await mkdir(projectPath, { recursive: true })
    }
    const project: Project = {
      id: generateId(),
      name,
      description: '',
      path: projectPath,
      createdAt: new Date(),
      updatedAt: new Date(),
      color: '#6366f1',
      icon: 'folder',
    }
    await useAppStore.getState().addProject(project)
    return project
  }

  // ── Get or create target project ──
  async function resolveTargetProject(fallbackName: string): Promise<Project> {
    if (showNewProject && newProjectName.trim()) {
      return createProject(newProjectName.trim())
    }
    if (targetProjectId) {
      const found = projects.find((p) => p.id === targetProjectId)
      if (found) return found
    }
    return createProject(fallbackName)
  }

  // ── Proceed to options ──
  function handleProceedToOptions() {
    if (selectedFiles.length === 0 && !selectedFolder) return
    setStep('options')
  }

  // ── Start import ──
  async function handleStartImport() {
    setStep('importing')
    setCancelled(false)
    setError(null)

    try {
      if (selectedFolder) {
        await importFolder()
      } else {
        await importFiles()
      }
    } catch (err: any) {
      if (!cancelled) {
        console.error('가져오기 실패:', err)
        setError(err.message || '가져오기 중 오류가 발생했습니다.')
      }
    }

    setStep('done')
  }

  // ── Import selected files ──
  async function importFiles() {
    const fallbackName = `Drive 가져오기 ${new Date().toLocaleDateString('ko-KR')}`
    const project = await resolveTargetProject(fallbackName)
    const currentFolders = useAppStore.getState().folders

    setProgress({ current: 0, total: selectedFiles.length, fileName: '' })
    let count = 0

    for (const file of selectedFiles) {
      if (cancelled) break

      const fileName = resolveFileName(file)
      setProgress({ current: count + 1, total: selectedFiles.length, fileName })

      try {
        // Download
        const data = await drive.downloadFile(providerId, file.id, file.mimeType)
        const fileType = getFileTypeFromMime(file.mimeType, fileName)

        // Classify
        let textContent = ''
        try {
          textContent = await extractTextFromBinary(data, fileType)
        } catch {
          // Some file types may not support text extraction
        }

        const classification = await smartClassify(fileName, textContent, project.id)
        const folderId = await ensureCategoryFolder(
          project.id,
          project.path,
          classification.category,
          currentFolders,
          addFolder,
        )
        // Refresh folders reference
        currentFolders.push(
          ...useAppStore.getState().folders.filter(
            (f) => !currentFolders.find((cf) => cf.id === f.id),
          ),
        )

        // Save to disk
        const categoryLabel = FOLDER_CATEGORY_LABELS[classification.category]
        const filePath = project.path
          ? await join(project.path, categoryLabel, fileName)
          : ''
        if (filePath) {
          await tauriWriteFile(filePath, new Uint8Array(data))
        }

        // Create DB entry
        const docFile: DocumentFile = {
          id: generateId(),
          name: fileName,
          path: filePath,
          projectId: project.id,
          folderId,
          type: fileType,
          size: data.byteLength,
          tags: [],
          aiCategory: classification.category,
          createdAt: new Date(),
          updatedAt: new Date(),
          cloudFileId: file.id,
        }
        await addFile(docFile)
        count++
      } catch (err) {
        console.error(`파일 가져오기 실패: ${fileName}`, err)
      }
    }

    setImportedCount(count)
  }

  // ── Import folder ──
  async function importFolder() {
    if (!selectedFolder) return

    const project = await resolveTargetProject(selectedFolder.name)

    // Get all files in folder recursively
    const allFiles = await drive.listAllFilesInFolder(providerId, selectedFolder.id)
    setProgress({ current: 0, total: allFiles.length, fileName: '' })

    let count = 0
    const currentFolders = [...useAppStore.getState().folders]

    if (folderImportMode === 'structure') {
      // ── Structure mode: maintain folder hierarchy ──
      const folderIdMap = new Map<string, string>() // relativeDirPath -> DB folder ID

      for (const { file, relativePath } of allFiles) {
        if (cancelled) break

        const fileName = resolveFileName(file)
        const pathParts = relativePath.split('/')
        const dirParts = pathParts.slice(0, -1) // Folder parts only

        setProgress({ current: count + 1, total: allFiles.length, fileName })

        try {
          // Ensure folder hierarchy exists
          let parentFolderId: string | null = null
          for (let i = 0; i < dirParts.length; i++) {
            const dirPath = dirParts.slice(0, i + 1).join('/')
            if (!folderIdMap.has(dirPath)) {
              const folderName = dirParts[i]
              const parentPath = i > 0 ? dirParts.slice(0, i).join('/') : null
              const parentId = parentPath ? folderIdMap.get(parentPath) ?? null : null

              const folder: FolderType = {
                id: generateId(),
                name: folderName,
                projectId: project.id,
                parentId,
                category: null,
                createdAt: new Date(),
              }
              await addFolder(folder)
              currentFolders.push(folder)
              folderIdMap.set(dirPath, folder.id)

              // Create disk folder
              if (project.path) {
                const diskPath = await join(project.path, ...dirParts.slice(0, i + 1))
                const pathExists = await exists(diskPath)
                if (!pathExists) await mkdir(diskPath, { recursive: true })
              }
            }
            parentFolderId = folderIdMap.get(dirPath) ?? null
          }

          // Download file
          const data = await drive.downloadFile(providerId, file.id, file.mimeType)
          const fileType = getFileTypeFromMime(file.mimeType, fileName)

          // Save to disk
          const filePath = project.path
            ? await join(project.path, ...dirParts, fileName)
            : ''
          if (filePath) {
            await tauriWriteFile(filePath, new Uint8Array(data))
          }

          // Create DB entry
          const docFile: DocumentFile = {
            id: generateId(),
            name: fileName,
            path: filePath,
            projectId: project.id,
            folderId: parentFolderId,
            type: fileType,
            size: data.byteLength,
            tags: [],
            aiCategory: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            cloudFileId: file.id,
          }
          await addFile(docFile)
          count++
        } catch (err) {
          console.error(`파일 가져오기 실패: ${relativePath}`, err)
        }
      }
    } else {
      // ── Classify mode: AI classification, ignore folder structure ──
      for (const { file } of allFiles) {
        if (cancelled) break

        const fileName = resolveFileName(file)
        setProgress({ current: count + 1, total: allFiles.length, fileName })

        try {
          const data = await drive.downloadFile(providerId, file.id, file.mimeType)
          const fileType = getFileTypeFromMime(file.mimeType, fileName)

          let textContent = ''
          try {
            textContent = await extractTextFromBinary(data, fileType)
          } catch {
            // Ignore extraction failures
          }

          const classification = await smartClassify(fileName, textContent, project.id)
          const folderId = await ensureCategoryFolder(
            project.id,
            project.path,
            classification.category,
            currentFolders,
            addFolder,
          )
          currentFolders.push(
            ...useAppStore.getState().folders.filter(
              (f) => !currentFolders.find((cf) => cf.id === f.id),
            ),
          )

          const categoryLabel = FOLDER_CATEGORY_LABELS[classification.category]
          const filePath = project.path
            ? await join(project.path, categoryLabel, fileName)
            : ''
          if (filePath) {
            await tauriWriteFile(filePath, new Uint8Array(data))
          }

          const docFile: DocumentFile = {
            id: generateId(),
            name: fileName,
            path: filePath,
            projectId: project.id,
            folderId,
            type: fileType,
            size: data.byteLength,
            tags: [],
            aiCategory: classification.category,
            createdAt: new Date(),
            updatedAt: new Date(),
            cloudFileId: file.id,
          }
          await addFile(docFile)
          count++
        } catch (err) {
          console.error(`파일 가져오기 실패: ${fileName}`, err)
        }
      }
    }

    setImportedCount(count)
  }

  // ── Cancel import ──
  function handleCancel() {
    setCancelled(true)
  }

  // ── Close dialog ──
  function handleClose() {
    resetState()
    onClose()
  }

  // ── Don't render if not open ──
  if (!open) return null

  const hasSelection = selectedFiles.length > 0 || selectedFolder !== null

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-background shadow-lg">
        {/* ── Header ── */}
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          {step === 'options' && (
            <button
              onClick={() => setStep('browse')}
              className="rounded p-1 hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <FolderDown className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">
            {step === 'browse' && 'Google Drive에서 가져오기'}
            {step === 'options' && '가져오기 옵션'}
            {step === 'importing' && '가져오는 중...'}
            {step === 'done' && '가져오기 완료'}
          </h2>
        </div>

        {/* ── Content ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {step === 'browse' && renderBrowseStep()}
          {step === 'options' && renderOptionsStep()}
          {step === 'importing' && renderImportingStep()}
          {step === 'done' && renderDoneStep()}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          {step === 'browse' && (
            <>
              <Button variant="outline" size="sm" onClick={handleClose}>
                취소
              </Button>
              <Button
                size="sm"
                disabled={!hasSelection}
                onClick={handleProceedToOptions}
              >
                {selectedFolder
                  ? '폴더 가져오기'
                  : `선택한 파일 가져오기 (${selectedFiles.length})`}
              </Button>
            </>
          )}
          {step === 'options' && (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep('browse')}>
                뒤로
              </Button>
              <Button
                size="sm"
                onClick={handleStartImport}
                disabled={!targetProjectId && !showNewProject}
              >
                가져오기 시작
              </Button>
            </>
          )}
          {step === 'importing' && (
            <Button variant="outline" size="sm" onClick={handleCancel}>
              취소
            </Button>
          )}
          {step === 'done' && (
            <Button size="sm" onClick={handleClose}>
              닫기
            </Button>
          )}
        </div>
      </div>
    </div>
  )

  // ─── Step Renderers ─────────────────────────────────────────

  function renderBrowseStep() {
    return (
      <div className="px-5 py-3">
        {/* Breadcrumb */}
        <div className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              <button
                onClick={() => navigateToBreadcrumb(i)}
                className={cn(
                  'rounded px-1 py-0.5 hover:bg-muted',
                  i === breadcrumb.length - 1
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* File list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">불러오는 중...</span>
          </div>
        ) : driveFiles.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            파일이 없습니다.
          </div>
        ) : (
          <div className="space-y-0.5">
            {driveFiles.map((file) => {
              const isFileSelected = selectedFiles.some((f) => f.id === file.id)
              const isFolderSelected = selectedFolder?.id === file.id

              return (
                <div
                  key={file.id}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    'hover:bg-muted/60 cursor-pointer',
                    (isFileSelected || isFolderSelected) && 'bg-primary/10',
                  )}
                  onClick={() => {
                    if (file.isFolder && !isFolderSelected) {
                      navigateToFolder(file)
                    } else {
                      toggleFileSelection(file)
                    }
                  }}
                >
                  {/* Checkbox */}
                  <div
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      isFileSelected || isFolderSelected
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/40',
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFileSelection(file)
                    }}
                  >
                    {(isFileSelected || isFolderSelected) && (
                      <Check className="h-3 w-3 text-primary-foreground" />
                    )}
                  </div>

                  {/* Icon */}
                  {getFileIcon(file)}

                  {/* Name */}
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>

                  {/* Size */}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {file.isFolder ? '' : formatSize(file.size)}
                  </span>

                  {/* Date */}
                  <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                    {formatDate(file.modifiedTime)}
                  </span>

                  {/* Folder nav arrow */}
                  {file.isFolder && (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>
    )
  }

  function renderOptionsStep() {
    return (
      <div className="space-y-5 px-5 py-4">
        {/* ── Selection summary ── */}
        {selectedFolder ? (
          <div>
            <h3 className="mb-2 text-sm font-medium">선택한 폴더</h3>
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
              <Folder className="h-4 w-4 text-blue-500" />
              <span>{selectedFolder.name}</span>
            </div>

            {/* Folder import mode */}
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-medium">가져오기 방식</h3>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/30">
                <input
                  type="radio"
                  name="folderMode"
                  checked={folderImportMode === 'structure'}
                  onChange={() => setFolderImportMode('structure')}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium">폴더 구조 그대로 가져오기</div>
                  <div className="text-xs text-muted-foreground">
                    Drive의 폴더 계층 구조를 그대로 유지합니다.
                  </div>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/30">
                <input
                  type="radio"
                  name="folderMode"
                  checked={folderImportMode === 'classify'}
                  onChange={() => setFolderImportMode('classify')}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium">폴더 내 파일 자동 분류하기</div>
                  <div className="text-xs text-muted-foreground">
                    AI가 파일 내용을 분석하여 카테고리별로 자동 분류합니다.
                  </div>
                </div>
              </label>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="mb-2 text-sm font-medium">
              선택한 파일 ({selectedFiles.length}개)
            </h3>
            <div className="max-h-32 space-y-1 overflow-y-auto">
              {selectedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-sm"
                >
                  {getFileIcon(file)}
                  <span className="truncate">{file.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {formatSize(file.size)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Target project ── */}
        <div>
          <h3 className="mb-2 text-sm font-medium">대상 프로젝트</h3>

          {!showNewProject ? (
            <div className="space-y-2">
              <select
                value={targetProjectId ?? ''}
                onChange={(e) => setTargetProjectId(e.target.value || null)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">프로젝트를 선택하세요</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <button
                onClick={() => {
                  setShowNewProject(true)
                  setTargetProjectId(null)
                  setNewProjectName(
                    selectedFolder?.name ??
                      `Drive 가져오기 ${new Date().toLocaleDateString('ko-KR')}`,
                  )
                }}
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                새 프로젝트 만들기
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="프로젝트 이름"
                className="text-sm"
              />
              <button
                onClick={() => {
                  setShowNewProject(false)
                  setNewProjectName('')
                }}
                className="text-sm text-muted-foreground hover:underline"
              >
                기존 프로젝트 선택
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderImportingStep() {
    const pct =
      progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

    return (
      <div className="space-y-4 px-5 py-8">
        <div className="text-center text-sm text-muted-foreground">
          {progress.current}/{progress.total} 파일 다운로드 중...
        </div>

        {/* Progress bar */}
        <div className="mx-auto h-2 w-full max-w-md overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Current file */}
        {progress.fileName && (
          <div className="text-center text-xs text-muted-foreground">
            {progress.fileName}
          </div>
        )}
      </div>
    )
  }

  function renderDoneStep() {
    return (
      <div className="space-y-3 px-5 py-8 text-center">
        {error ? (
          <>
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <File className="h-5 w-5 text-destructive" />
            </div>
            <div className="text-sm font-medium">가져오기 중 오류가 발생했습니다</div>
            <div className="text-xs text-muted-foreground">{error}</div>
            {importedCount > 0 && (
              <div className="text-xs text-muted-foreground">
                {importedCount}개 파일은 성공적으로 가져왔습니다.
              </div>
            )}
          </>
        ) : cancelled ? (
          <>
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <File className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-sm font-medium">가져오기가 취소되었습니다</div>
            {importedCount > 0 && (
              <div className="text-xs text-muted-foreground">
                {importedCount}개 파일이 가져와졌습니다.
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-5 w-5 text-primary" />
            </div>
            <div className="text-sm font-medium">
              {importedCount}개 파일을 성공적으로 가져왔습니다
            </div>
          </>
        )}
      </div>
    )
  }
}
