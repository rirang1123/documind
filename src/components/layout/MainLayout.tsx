import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { FileBrowser } from '@/components/file-browser/FileBrowser'
import { SettingsView } from '@/components/settings/SettingsView'
import { AIAssistant } from '@/components/ai/AIAssistant'
import { EditorView } from '@/components/editor/EditorView'
import { PptSlideEditor } from '@/components/editor/ppt/PptSlideEditor'
import { DraftsView } from '@/components/drafts/DraftsView'
import { FileViewer } from '@/components/viewer/FileViewer'
import ProjectDashboard from '@/components/project/ProjectDashboard'
import { NewDocumentDialog } from '@/components/editor/NewDocumentDialog'

import { useAppStore } from '@/stores/useAppStore'

export function MainLayout() {
  const { activeView, showNewDocDialog, setShowNewDocDialog } = useAppStore()

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto">
          {activeView === 'browser' && <FileBrowser />}
          {activeView === 'editor' && <EditorView />}
          {activeView === 'drafts' && <DraftsView />}
          {activeView === 'ai' && <AIAssistant />}
          {activeView === 'settings' && <SettingsView />}
          {activeView === 'ppt-editor' && <PptSlideEditor />}
          {activeView === 'viewer' && <FileViewer />}
          {activeView === 'dashboard' && <ProjectDashboard />}
        </main>
      </div>
      <NewDocumentDialog open={showNewDocDialog} onClose={() => setShowNewDocDialog(false)} />
    </div>
  )
}
