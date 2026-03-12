import { create } from 'zustand'
import type { Project, DocumentFile, Folder, AppSettings, Draft } from '@/types'
import { db, getSettings, updateSettings } from '@/services/db'

interface AppState {
  // Settings
  settings: AppSettings | null
  loadSettings: () => Promise<void>
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>

  // Projects
  projects: Project[]
  selectedProjectId: string | null
  loadProjects: () => Promise<void>
  addProject: (project: Project) => Promise<void>
  deleteProject: (id: string, deleteFromDisk?: boolean) => Promise<void>
  selectProject: (id: string | null) => void

  // Files
  files: DocumentFile[]
  selectedFileId: string | null
  loadFiles: (projectId: string) => Promise<void>
  addFile: (file: DocumentFile) => Promise<void>
  deleteFile: (id: string) => Promise<void>
  selectFile: (id: string | null) => void
  renameFile: (id: string, newName: string) => Promise<void>
  moveFile: (fileId: string, targetFolderId: string | undefined) => Promise<void>

  // Recent Files
  recentFiles: string[]
  addRecentFile: (fileId: string) => void

  // Folders
  folders: Folder[]
  loadFolders: (projectId: string) => Promise<void>
  addFolder: (folder: Folder) => Promise<void>
  deleteFolder: (id: string) => Promise<void>

  // Drafts
  drafts: Draft[]
  loadDrafts: () => Promise<void>
  saveDraft: (draft: Draft) => Promise<void>
  updateDraft: (id: string, patch: Partial<Draft>) => Promise<void>
  deleteDraft: (id: string) => Promise<void>
  openDraft: (draft: Draft) => void

  // Search
  searchQuery: string
  searchResults: DocumentFile[]
  setSearchQuery: (query: string) => void
  clearSearch: () => void

  // UI
  sidebarOpen: boolean
  toggleSidebar: () => void
  activeView: 'browser' | 'editor' | 'ai' | 'settings' | 'ppt-editor' | 'drafts' | 'viewer' | 'dashboard'
  setActiveView: (view: 'browser' | 'editor' | 'ai' | 'settings' | 'ppt-editor' | 'drafts' | 'viewer' | 'dashboard') => void
  viewerFileId: string | null
  openFileViewer: (fileId: string) => void
  showNewDocDialog: boolean
  setShowNewDocDialog: (open: boolean) => void

  // Editor shared state
  editorContent: string
  editorFileName: string
  editingDraftId: string | null
  setEditorContent: (content: string, fileName?: string) => void
  openNewDocument: () => void
  openPptEditor: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Settings
  settings: null,
  loadSettings: async () => {
    const settings = await getSettings()
    set({ settings })
  },
  saveSettings: async (partial) => {
    await updateSettings(partial)
    const settings = await getSettings()
    set({ settings })
  },

  // Projects
  projects: [],
  selectedProjectId: null,
  loadProjects: async () => {
    const projects = await db.projects.orderBy('createdAt').reverse().toArray()
    set({ projects })
  },
  addProject: async (project) => {
    await db.projects.put(project)
    await get().loadProjects()
  },
  deleteProject: async (id, deleteFromDisk) => {
    const project = await db.projects.get(id)
    // 디스크 파일/폴더 삭제
    if (deleteFromDisk && project?.path) {
      try {
        const { remove, exists } = await import('@tauri-apps/plugin-fs')
        const pathExists = await exists(project.path)
        if (pathExists) {
          await remove(project.path, { recursive: true })
        }
      } catch (e) {
        console.warn('프로젝트 디스크 폴더 삭제 실패:', e)
      }
    }
    await db.projects.delete(id)
    await db.files.where('projectId').equals(id).delete()
    await db.folders.where('projectId').equals(id).delete()
    const state = get()
    if (state.selectedProjectId === id) {
      set({ selectedProjectId: null, files: [], folders: [] })
    }
    await get().loadProjects()
  },
  selectProject: (id) => {
    set({ selectedProjectId: id, selectedFileId: null })
    if (id) {
      get().loadFiles(id)
      get().loadFolders(id)
    }
  },

  // Files
  files: [],
  selectedFileId: null,
  loadFiles: async (projectId) => {
    const files = await db.files.where('projectId').equals(projectId).toArray()
    set({ files })
  },
  addFile: async (file) => {
    await db.files.put(file)
    if (file.projectId === get().selectedProjectId) {
      await get().loadFiles(file.projectId)
    }
  },
  deleteFile: async (id) => {
    const file = await db.files.get(id)
    if (file?.path) {
      // 실제 디스크 파일도 삭제 시도
      try {
        const { remove } = await import('@tauri-apps/plugin-fs')
        await remove(file.path)
      } catch (e) {
        console.warn('디스크 파일 삭제 실패 (이미 없거나 권한 없음):', e)
      }
    }
    await db.files.delete(id)
    if (file && file.projectId === get().selectedProjectId) {
      await get().loadFiles(file.projectId)
    }
    if (get().selectedFileId === id) {
      set({ selectedFileId: null })
    }
  },
  selectFile: (id) => {
    set({ selectedFileId: id })
    if (id) {
      get().addRecentFile(id)
    }
  },
  renameFile: async (id, newName) => {
    const file = await db.files.get(id)
    if (file) {
      await db.files.put({ ...file, name: newName, updatedAt: new Date() })
      if (file.projectId === get().selectedProjectId) {
        await get().loadFiles(file.projectId)
      }
    }
  },
  moveFile: async (fileId, targetFolderId) => {
    const file = await db.files.get(fileId)
    if (file) {
      const oldFolderId = file.folderId
      await db.files.put({ ...file, folderId: targetFolderId ?? null, updatedAt: new Date() })
      if (file.projectId === get().selectedProjectId) {
        await get().loadFiles(file.projectId)
      }

      // ── 분류 자가학습: 폴더 이동 시 AI 분석 트리거 ──
      if (targetFolderId && oldFolderId !== targetFolderId) {
        const newFolder = await db.folders.get(targetFolderId)
        if (newFolder) {
          const oldFolder = oldFolderId ? await db.folders.get(oldFolderId) : null
          // 대상 폴더의 기존 파일명 목록 수집
          const folderFiles = await db.files
            .where('folderId').equals(targetFolderId)
            .toArray()
          const existingTitles = folderFiles
            .filter(f => f.id !== fileId)
            .map(f => f.name)
            .slice(0, 10)

          // 비동기로 학습 실행 (UI 블로킹 없이)
          import('@/services/document/classifyService').then(({ learnFromUserCorrection }) => {
            learnFromUserCorrection(
              file.name,
              file.content || '',
              oldFolder || null,
              newFolder,
              existingTitles,
            )
          })
        }
      }
    }
  },

  // Recent Files
  recentFiles: [],
  addRecentFile: (fileId) => {
    const current = get().recentFiles
    const updated = [fileId, ...current.filter((id) => id !== fileId)].slice(0, 10)
    set({ recentFiles: updated })
  },

  // Folders
  folders: [],
  loadFolders: async (projectId) => {
    const folders = await db.folders.where('projectId').equals(projectId).toArray()
    set({ folders })
  },
  addFolder: async (folder) => {
    await db.folders.put(folder)
    if (folder.projectId === get().selectedProjectId) {
      await get().loadFolders(folder.projectId)
    }
  },
  deleteFolder: async (id) => {
    const folder = await db.folders.get(id)
    // 폴더 내 파일들을 루트로 이동 (고아 파일 방지)
    const childFiles = await db.files.where('folderId').equals(id).toArray()
    for (const file of childFiles) {
      await db.files.put({ ...file, folderId: null, updatedAt: new Date() })
    }
    await db.folders.delete(id)
    if (folder && folder.projectId === get().selectedProjectId) {
      await get().loadFolders(folder.projectId)
      await get().loadFiles(folder.projectId)
    }
  },

  // Drafts
  drafts: [],
  loadDrafts: async () => {
    const drafts = await db.drafts.orderBy('updatedAt').reverse().toArray()
    set({ drafts })
  },
  saveDraft: async (draft) => {
    await db.drafts.put(draft)
    await get().loadDrafts()
  },
  updateDraft: async (id, patch) => {
    const existing = await db.drafts.get(id)
    if (existing) {
      await db.drafts.put({ ...existing, ...patch, updatedAt: new Date() })
      await get().loadDrafts()
    }
  },
  deleteDraft: async (id) => {
    await db.drafts.delete(id)
    if (get().editingDraftId === id) {
      set({ editingDraftId: null })
    }
    await get().loadDrafts()
  },
  openDraft: (draft) => {
    set({
      editorContent: draft.content,
      editorFileName: draft.title,
      editingDraftId: draft.id,
      selectedFileId: null,
      activeView: 'editor',
    })
  },

  // Search
  searchQuery: '',
  searchResults: [],
  setSearchQuery: async (query: string) => {
    set({ searchQuery: query })
    if (!query.trim()) {
      set({ searchResults: [] })
      return
    }
    const lowerQuery = query.toLowerCase()
    const allFiles = await db.files.toArray()
    const results = allFiles.filter(
      (f) =>
        f.name.toLowerCase().includes(lowerQuery) ||
        (f.content && f.content.toLowerCase().includes(lowerQuery))
    )
    set({ searchResults: results })
  },
  clearSearch: () => set({ searchQuery: '', searchResults: [] }),

  // UI
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  activeView: 'browser',
  setActiveView: (view) => set({ activeView: view }),
  viewerFileId: null,
  openFileViewer: (fileId) => set({ viewerFileId: fileId, activeView: 'viewer' }),
  showNewDocDialog: false,
  setShowNewDocDialog: (open) => set({ showNewDocDialog: open }),

  // Editor shared state
  editorContent: '',
  editorFileName: '새 문서',
  editingDraftId: null,
  setEditorContent: (content, fileName) => {
    if (content === get().editorContent && !fileName) return
    set({ editorContent: content, ...(fileName ? { editorFileName: fileName } : {}) })
  },
  openNewDocument: () =>
    set({
      editorContent: '',
      editorFileName: '새 문서',
      selectedFileId: null,
      editingDraftId: null,
      activeView: 'editor',
    }),
  openPptEditor: () =>
    set({
      activeView: 'ppt-editor',
    }),
}))
