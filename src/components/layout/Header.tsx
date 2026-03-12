import { useEffect, useRef } from 'react'
import { Menu, Search } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function Header() {
  const {
    toggleSidebar, selectedProjectId, projects, activeView,
    searchQuery, searchResults, setSearchQuery, clearSearch,
    setActiveView, selectFile, selectProject,
  } = useAppStore()
  const currentProject = projects.find((p) => p.id === selectedProjectId)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        clearSearch()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [clearSearch])

  const handleResultClick = (file: typeof searchResults[0]) => {
    if (file.projectId) {
      selectProject(file.projectId)
    }
    selectFile(file.id)

    // Binary file types → open in viewer instead of editor
    const binaryTypes = ['pdf', 'docx', 'xlsx', 'pptx']
    if (binaryTypes.includes(file.type)) {
      useAppStore.getState().openFileViewer(file.id)
    } else {
      useAppStore.setState({
        editorContent: file.content || '',
        editorFileName: file.name,
        selectedFileId: file.id,
      })
      setActiveView('editor')
    }
    clearSearch()
  }

  return (
    <header className="flex h-12 items-center gap-3 border-b border-border bg-background px-4">
      <Button variant="ghost" size="icon" onClick={toggleSidebar}>
        <Menu className="h-4 w-4" />
      </Button>

      {activeView === 'browser' && currentProject && (
        <span className="text-sm font-medium text-foreground">{currentProject.name}</span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <div className="relative" ref={dropdownRef}>
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="문서 검색..."
            className="h-8 w-56 pl-8 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                clearSearch()
                inputRef.current?.blur()
              }
            }}
          />
          {searchResults.length > 0 && searchQuery && (
            <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-md border border-border bg-background shadow-lg max-h-64 overflow-y-auto">
              {searchResults.map((file) => {
                const project = projects.find((p) => p.id === file.projectId)
                return (
                  <button
                    key={file.id}
                    className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted/50 border-b border-border last:border-b-0"
                    onClick={() => handleResultClick(file)}
                  >
                    <span className="text-sm font-medium text-foreground truncate w-full">
                      {file.name}
                    </span>
                    {project && (
                      <span className="text-xs text-muted-foreground truncate w-full">
                        {project.name}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
