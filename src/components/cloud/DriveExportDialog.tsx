import { useState, useEffect, useCallback } from 'react'
import {
  Folder,
  ChevronRight,
  Loader2,
  Check,
  FolderPlus,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/utils/cn'
import type { DocumentFile, Folder as FolderType } from '@/types'
import type { CloudFile } from '@/services/cloud/cloudProvider'
import * as drive from '@/services/cloud/googleDriveProvider'
import { readFile } from '@tauri-apps/plugin-fs'

interface DriveExportDialogProps {
  open: boolean
  onClose: () => void
  providerId: string
  exportFiles?: DocumentFile[]
  exportFolder?: { folder: FolderType; files: DocumentFile[] }
}

type ExportStep = 'options' | 'uploading' | 'done'

async function readLocalFile(file: DocumentFile): Promise<ArrayBuffer> {
  if (file.blobData) return file.blobData
  if (file.content) return new TextEncoder().encode(file.content).buffer as ArrayBuffer
  const bytes = await readFile(file.path)
  return bytes.buffer as ArrayBuffer
}

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const mimeMap: Record<string, string> = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    hwp: 'application/x-hwp',
  }
  return mimeMap[ext || ''] || 'application/octet-stream'
}

export default function DriveExportDialog({
  open,
  onClose,
  providerId,
  exportFiles,
  exportFolder,
}: DriveExportDialogProps) {
  const [step, setStep] = useState<ExportStep>('options')
  const [keepStructure, setKeepStructure] = useState(true)
  const [progress, setProgress] = useState({ current: 0, total: 0, fileName: '' })
  const [error, setError] = useState<string | null>(null)

  // Drive folder browser state
  const [destFolderId, setDestFolderId] = useState<string | null>(null)
  const [destBreadcrumb, setDestBreadcrumb] = useState<
    { id: string | null; name: string }[]
  >([{ id: null, name: 'My Drive' }])
  const [destFolders, setDestFolders] = useState<CloudFile[]>([])
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)

  const files = exportFiles ?? exportFolder?.files ?? []

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep('options')
      setKeepStructure(true)
      setProgress({ current: 0, total: 0, fileName: '' })
      setError(null)
      setDestFolderId(null)
      setDestBreadcrumb([{ id: null, name: 'My Drive' }])
      setDestFolders([])
      setShowNewFolder(false)
      setNewFolderName('')
    }
  }, [open])

  const loadDriveFolders = useCallback(
    async (folderId: string | null) => {
      setLoadingFolders(true)
      try {
        const result = await drive.listFiles(providerId, folderId || undefined)
        const folders = result.files.filter(
          (f) => f.mimeType === 'application/vnd.google-apps.folder'
        )
        folders.sort((a, b) => a.name.localeCompare(b.name))
        setDestFolders(folders)
      } catch (err) {
        console.error('Failed to load Drive folders:', err)
        setDestFolders([])
      } finally {
        setLoadingFolders(false)
      }
    },
    [providerId]
  )

  // Load folders when dialog opens or destination changes
  useEffect(() => {
    if (open) {
      loadDriveFolders(destFolderId)
    }
  }, [open, destFolderId, loadDriveFolders])

  function handleNavigateFolder(folder: CloudFile) {
    setDestFolderId(folder.id)
    setDestBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }])
    setShowNewFolder(false)
    setNewFolderName('')
  }

  function handleBreadcrumbClick(index: number) {
    const target = destBreadcrumb[index]
    setDestFolderId(target.id)
    setDestBreadcrumb((prev) => prev.slice(0, index + 1))
    setShowNewFolder(false)
    setNewFolderName('')
  }

  async function handleCreateDriveFolder() {
    if (!newFolderName.trim() || creatingFolder) return
    setCreatingFolder(true)
    try {
      await drive.createFolder(providerId, newFolderName.trim(), destFolderId || undefined)
      await loadDriveFolders(destFolderId)
      setShowNewFolder(false)
      setNewFolderName('')
    } catch (err) {
      console.error('Failed to create folder:', err)
    } finally {
      setCreatingFolder(false)
    }
  }

  async function handleExport() {
    setStep('uploading')
    setError(null)

    try {
      if (exportFolder && keepStructure) {
        // Create root folder on Drive, then upload files into it
        const rootFolder = await drive.createFolder(
          providerId,
          exportFolder.folder.name,
          destFolderId || undefined
        )

        setProgress({ current: 0, total: files.length, fileName: '' })

        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          setProgress({ current: i, total: files.length, fileName: file.name })

          const data = await readLocalFile(file)
          const mimeType = getMimeType(file.name)
          await drive.uploadFile(providerId, file.name, data, rootFolder.id, mimeType)
        }

        setProgress({ current: files.length, total: files.length, fileName: '' })
      } else {
        // Flat upload into destFolderId
        setProgress({ current: 0, total: files.length, fileName: '' })

        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          setProgress({ current: i, total: files.length, fileName: file.name })

          const data = await readLocalFile(file)
          const mimeType = getMimeType(file.name)
          await drive.uploadFile(
            providerId,
            file.name,
            data,
            destFolderId || undefined,
            mimeType
          )
        }

        setProgress({ current: files.length, total: files.length, fileName: '' })
      }

      setStep('done')
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'
      setError(message)
      setStep('options')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg border border-border bg-background shadow-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">Drive로 내보내기</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {step === 'options' && (
            <div className="space-y-4">
              {/* Export summary */}
              <div className="rounded-md border border-border bg-muted/30 p-3">
                {exportFolder ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Folder className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{exportFolder.folder.name}</span>
                    <span className="text-muted-foreground">
                      ({files.length}개 파일)
                    </span>
                  </div>
                ) : (
                  <div className="text-sm">
                    <span className="font-medium">{files.length}개 파일</span>
                    <span className="text-muted-foreground"> 선택됨</span>
                    {files.length <= 5 && (
                      <ul className="mt-1 space-y-0.5 text-muted-foreground">
                        {files.map((f) => (
                          <li key={f.id} className="truncate">
                            {f.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* Keep structure checkbox (folder export only) */}
              {exportFolder && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keepStructure}
                    onChange={(e) => setKeepStructure(e.target.checked)}
                    className="rounded border-border"
                  />
                  폴더 구조 유지하기
                </label>
              )}

              {/* Drive destination browser */}
              <div>
                <p className="text-sm font-medium mb-2">저장 위치</p>

                {/* Breadcrumb */}
                <div className="flex items-center gap-1 text-sm mb-2 flex-wrap">
                  {destBreadcrumb.map((crumb, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                      <button
                        onClick={() => handleBreadcrumbClick(i)}
                        className={cn(
                          'hover:underline',
                          i === destBreadcrumb.length - 1
                            ? 'font-medium text-foreground'
                            : 'text-muted-foreground'
                        )}
                      >
                        {crumb.name}
                      </button>
                    </span>
                  ))}
                </div>

                {/* Folder list */}
                <div className="rounded-md border border-border max-h-48 overflow-y-auto">
                  {loadingFolders ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : destFolders.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      하위 폴더 없음
                    </div>
                  ) : (
                    <ul>
                      {destFolders.map((folder) => (
                        <li key={folder.id}>
                          <button
                            onClick={() => handleNavigateFolder(folder)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                          >
                            <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{folder.name}</span>
                            <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Back button */}
                {destBreadcrumb.length > 1 && (
                  <button
                    onClick={() => handleBreadcrumbClick(destBreadcrumb.length - 2)}
                    className="flex items-center gap-1 mt-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    상위 폴더로
                  </button>
                )}

                {/* New folder */}
                <div className="mt-2">
                  {showNewFolder ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="새 폴더 이름"
                        className="text-sm h-8"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateDriveFolder()
                          if (e.key === 'Escape') {
                            setShowNewFolder(false)
                            setNewFolderName('')
                          }
                        }}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCreateDriveFolder}
                        disabled={!newFolderName.trim() || creatingFolder}
                        className="h-8 shrink-0"
                      >
                        {creatingFolder ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          '만들기'
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowNewFolder(false)
                          setNewFolderName('')
                        }}
                        className="h-8 shrink-0"
                      >
                        취소
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNewFolder(true)}
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <FolderPlus className="h-4 w-4" />
                      새 폴더 만들기
                    </button>
                  )}
                </div>
              </div>

              {/* Error message */}
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          )}

          {step === 'uploading' && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{
                      width:
                        progress.total > 0
                          ? `${(progress.current / progress.total) * 100}%`
                          : '0%',
                    }}
                  />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  {progress.current}/{progress.total} 파일 업로드 중...
                </p>
                {progress.fileName && (
                  <p className="text-xs text-muted-foreground text-center truncate">
                    {progress.fileName}
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium">
                {progress.total}개 파일을 Drive에 내보냈습니다.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-3 flex justify-end gap-2">
          {step === 'options' && (
            <>
              <Button variant="outline" size="sm" onClick={onClose}>
                취소
              </Button>
              <Button
                size="sm"
                onClick={handleExport}
                disabled={files.length === 0}
              >
                내보내기 시작
              </Button>
            </>
          )}

          {step === 'uploading' && (
            <Button variant="outline" size="sm" disabled>
              업로드 중...
            </Button>
          )}

          {step === 'done' && (
            <Button size="sm" onClick={onClose}>
              닫기
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
