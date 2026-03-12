import { useEffect, useState, useCallback } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { useAppStore } from '@/stores/useAppStore'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { migrateApiKeysToKeychain } from '@/services/db'
import { validateAndRepairProjectPaths } from '@/services/dataIntegrity'

export default function App() {
  const { loadSettings, loadProjects, loadDrafts } = useAppStore()
  const settings = useAppStore((s) => s.settings)
  useKeyboardShortcuts()
  const [initError, setInitError] = useState<string | null>(null)

  const initialize = useCallback(async () => {
    try {
      setInitError(null)
      await loadSettings()
      await migrateApiKeysToKeychain()
      await loadSettings() // 마이그레이션 후 재로드
      await validateAndRepairProjectPaths() // 프로젝트 경로 유효성 검증 + 복구
      await loadProjects()
      await loadDrafts()
    } catch (error) {
      console.error('Initialization failed:', error)
      setInitError(error instanceof Error ? error.message : '초기화 중 알 수 없는 오류가 발생했습니다.')
    }
  }, [loadSettings, loadProjects, loadDrafts])

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    const theme = settings?.theme
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.classList.toggle('dark', prefersDark)
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [settings?.theme])

  if (initError) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center p-8 max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">초기화 실패</h1>
          <p className="text-gray-600 mb-4">
            앱 초기화 중 오류가 발생했습니다. 다시 시도해 주세요.
          </p>
          <details className="mb-4 text-left">
            <summary className="text-sm text-gray-500 cursor-pointer">오류 상세</summary>
            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs text-red-600 overflow-auto max-h-32">
              {initError}
            </pre>
          </details>
          <button
            onClick={initialize}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <MainLayout />
    </ErrorBoundary>
  )
}
