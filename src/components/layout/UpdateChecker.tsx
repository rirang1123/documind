import { useEffect, useState } from 'react'
import { Download, X, RefreshCw, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

type UpdateState = 'checking' | 'available' | 'downloading' | 'ready' | 'idle'

interface UpdateInfo {
  version: string
  notes: string
  date: string
}

export function UpdateChecker() {
  const [state, setState] = useState<UpdateState>('idle')
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    checkForUpdate()
  }, [])

  async function checkForUpdate() {
    setState('checking')
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const result = await check()
      if (result) {
        setUpdate({
          version: result.version,
          notes: result.body || '새로운 업데이트가 있습니다.',
          date: result.date || '',
        })
        setState('available')
      } else {
        setState('idle')
      }
    } catch {
      setState('idle')
    }
  }

  async function installUpdate() {
    setState('downloading')
    setProgress(0)
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const result = await check()
      if (!result) return

      let totalBytes = 0
      let downloadedBytes = 0

      await result.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          totalBytes = event.data.contentLength
        }
        if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength
          if (totalBytes > 0) {
            setProgress(Math.round((downloadedBytes / totalBytes) * 100))
          }
        }
        if (event.event === 'Finished') {
          setProgress(100)
          setState('ready')
        }
      })

      setState('ready')
    } catch (err) {
      console.error('Update failed:', err)
      setState('available')
    }
  }

  async function relaunchApp() {
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch {
      // Fallback message if relaunch fails
    }
  }

  if (state === 'idle' || dismissed) return null
  if (state === 'checking') return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-primary/30 bg-background shadow-lg">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {state === 'ready' ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <Download className="h-4 w-4 text-primary" />
        )}
        <span className="text-sm font-semibold">
          {state === 'available' && '새 업데이트'}
          {state === 'downloading' && '다운로드 중...'}
          {state === 'ready' && '업데이트 완료'}
        </span>
        {state === 'available' && (
          <button
            onClick={() => setDismissed(true)}
            className="ml-auto text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {update && (
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              v{update.version}
            </span>
          </div>
        )}

        {state === 'downloading' && (
          <div className="mt-2">
            <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground text-right">{progress}%</p>
          </div>
        )}

        {state === 'available' && update && (
          <p className="text-sm text-muted-foreground line-clamp-3">{update.notes}</p>
        )}

        {state === 'ready' && (
          <p className="text-sm text-muted-foreground">
            업데이트가 설치되었습니다. 앱을 재시작하면 적용됩니다.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-border px-4 py-3">
        {state === 'available' && (
          <>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setDismissed(true)}>
              나중에
            </Button>
            <Button size="sm" className="flex-1" onClick={installUpdate}>
              <Download className="mr-1 h-3 w-3" />
              지금 업데이트
            </Button>
          </>
        )}
        {state === 'downloading' && (
          <Button size="sm" className="flex-1" disabled>
            <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
            다운로드 중...
          </Button>
        )}
        {state === 'ready' && (
          <Button size="sm" className="flex-1" onClick={relaunchApp}>
            <RefreshCw className="mr-1 h-3 w-3" />
            지금 재시작
          </Button>
        )}
      </div>
    </div>
  )
}
