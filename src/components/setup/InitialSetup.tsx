import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { mkdir, exists } from '@tauri-apps/plugin-fs'
import { useAppStore } from '@/stores/useAppStore'
import { FolderOpen } from 'lucide-react'

interface InitialSetupProps {
  onComplete: () => Promise<void>
}

export function InitialSetup({ onComplete }: InitialSetupProps) {
  const { saveSettings } = useAppStore()
  const [selectedPath, setSelectedPath] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleBrowse = async () => {
    try {
      const selected = await open({ directory: true, multiple: false })
      if (selected && typeof selected === 'string') {
        setSelectedPath(selected)
        setError('')
      }
    } catch (err) {
      console.error('폴더 선택 실패:', err)
    }
  }

  const handleConfirm = async () => {
    if (!selectedPath) {
      setError('저장소 폴더를 선택해주세요.')
      return
    }

    setSaving(true)
    try {
      const dirExists = await exists(selectedPath)
      if (!dirExists) {
        await mkdir(selectedPath, { recursive: true })
      }
      await saveSettings({ storagePath: selectedPath })
      await onComplete()
    } catch (err) {
      console.error('저장소 설정 실패:', err)
      setError('저장소 설정에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4">
            <FolderOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            DocuMind
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            문서를 저장할 폴더를 선택해주세요
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleBrowse}
            className="w-full flex items-center gap-3 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer"
          >
            <FolderOpen className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {selectedPath || '폴더 선택...'}
            </span>
          </button>

          {selectedPath && (
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono px-1 break-all">
              {selectedPath}
            </p>
          )}

          {error && (
            <p className="text-xs text-red-500 px-1">{error}</p>
          )}

          <button
            onClick={handleConfirm}
            disabled={!selectedPath || saving}
            className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium rounded-xl hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {saving ? '설정 중...' : '시작하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
