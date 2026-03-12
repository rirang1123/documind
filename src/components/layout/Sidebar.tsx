import {
  FolderOpen,
  FileText,
  FileEdit,
  Bot,
  Settings,
  BarChart3,
  Plus,
  ChevronRight,
  ChevronDown,
  FilePlus,
  Clock,
  Trash2,
} from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/button'
import { useState, useRef, useEffect } from 'react'
import { NewProjectDialog } from '@/components/project/NewProjectDialog'
import type { FileType } from '@/types'
import { isTestBuild, getAppVersion } from '@/utils/buildEnv'

export function Sidebar() {
  const {
    sidebarOpen,
    activeView,
    setActiveView,
    projects,
    selectedProjectId,
    selectProject,
    deleteProject,
    recentFiles,
    files,
    selectFile,
  } = useAppStore()
  const [showNewProject, setShowNewProject] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: string; projectName: string } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // 컨텍스트 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenu])

  const [testMode, setTestMode] = useState(false)
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    isTestBuild().then(setTestMode)
    getAppVersion().then(setAppVersion)
  }, [])

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

  const toggleProject = (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!sidebarOpen) return null

  const navItems = [
    { id: 'browser' as const, label: '파일 탐색', icon: FolderOpen },
    { id: 'editor' as const, label: '에디터', icon: FileText },
    { id: 'drafts' as const, label: '임시 저장', icon: FileEdit },
    { id: 'dashboard' as const, label: '통계', icon: BarChart3 },
    { id: 'ai' as const, label: 'AI 어시스턴트', icon: Bot },
    { id: 'settings' as const, label: '설정', icon: Settings },
  ]

  return (
    <aside className="flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* App Logo */}
      <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-3">
        <FileText className="h-6 w-6 text-primary" />
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-bold">DocuMind</span>
            {testMode && (
              <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                TEST
              </span>
            )}
          </div>
          {appVersion && (
            <span className="text-[10px] text-muted-foreground">v{appVersion}</span>
          )}
        </div>
      </div>

      {/* New Document Button */}
      <div className="px-2 pt-2">
        <Button
          size="sm"
          className="w-full gap-1.5"
          onClick={() => useAppStore.getState().setShowNewDocDialog(true)}
        >
          <FilePlus className="h-3.5 w-3.5" />
          새 문서 작성
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 px-2 py-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors cursor-pointer',
              activeView === item.id
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Recent Files (D5) */}
      {recentFiles.length > 0 && (
        <div className="border-t border-sidebar-border px-2 py-2">
          <div className="flex items-center gap-1.5 px-2 py-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase text-muted-foreground">최근 파일</span>
          </div>
          <div className="mt-1 flex flex-col gap-0.5">
            {recentFiles.map((fileId) => {
              const recentFile = files.find((f) => f.id === fileId)
              if (!recentFile) return null
              return (
                <button
                  key={fileId}
                  onClick={() => {
                    selectFile(recentFile.id)
                    const editableTypes: FileType[] = ['txt', 'md', 'unknown']
                    if (recentFile.content && (editableTypes.includes(recentFile.type) || recentFile.type === 'docx')) {
                      useAppStore.getState().setEditorContent(recentFile.content, recentFile.name)
                      setActiveView('editor')
                    } else {
                      useAppStore.getState().openFileViewer(recentFile.id)
                    }
                  }}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors truncate cursor-pointer"
                >
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="truncate">{recentFile.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Projects */}
      <div className="flex-1 overflow-y-auto border-t border-sidebar-border px-2 py-2">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-xs font-semibold uppercase text-muted-foreground">프로젝트</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowNewProject(true)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-1 flex flex-col gap-0.5">
          {projects.map((project) => (
            <div key={project.id}>
              <button
                onClick={() => {
                  selectProject(project.id)
                  toggleProject(project.id)
                  setActiveView('browser')
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, projectId: project.id, projectName: project.name })
                }}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors cursor-pointer',
                  selectedProjectId === project.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground hover:bg-accent'
                )}
              >
                {expandedProjects.has(project.id) ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                )}
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: project.color }}
                />
                <span className="truncate">{project.name}</span>
              </button>
            </div>
          ))}

          {projects.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              프로젝트가 없습니다.
              <br />
              새 프로젝트를 만들어보세요.
            </p>
          )}
        </div>
      </div>

      <NewProjectDialog open={showNewProject} onClose={() => setShowNewProject(false)} />

      {/* 프로젝트 컨텍스트 메뉴 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 rounded-md border border-border bg-popover shadow-md py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-accent cursor-pointer"
            onClick={() => {
              setDeleteTarget({ id: contextMenu.projectId, name: contextMenu.projectName })
              setContextMenu(null)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            프로젝트 삭제
          </button>
        </div>
      )}

      {/* 프로젝트 삭제 확인 다이얼로그 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-96 rounded-lg border border-border bg-background p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold">프로젝트 삭제</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              <strong>"{deleteTarget.name}"</strong> 프로젝트를 삭제합니다.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="destructive"
                className="w-full"
                onClick={async () => {
                  await deleteProject(deleteTarget.id, true)
                  setDeleteTarget(null)
                }}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                전부 삭제 (DB + 저장소 폴더)
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  await deleteProject(deleteTarget.id, false)
                  setDeleteTarget(null)
                }}
              >
                DB만 삭제 (저장소 폴더 유지)
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setDeleteTarget(null)}
              >
                취소
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
