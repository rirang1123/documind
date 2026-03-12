import { useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S: Save (prevent default browser save)
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        // Dispatch custom event for EditorView to handle
        window.dispatchEvent(new CustomEvent('shortcut:save'));
      }

      // Ctrl+N: New document
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        const store = useAppStore.getState();
        store.setActiveView('editor');
        store.selectFile(null);
        store.setEditorContent('');
        useAppStore.setState({ editorFileName: '새 문서', editingDraftId: null, selectedFileId: null });
      }

      // Escape: Close dialogs / clear search
      if (e.key === 'Escape') {
        const store = useAppStore.getState();
        if (store.searchQuery) {
          store.clearSearch();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
