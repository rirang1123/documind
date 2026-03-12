import { useState } from 'react'
import { RefreshCw, Download, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { checkForUpdates, downloadAndInstallUpdate, type UpdateInfo } from '@/services/updateService'

export function UpdateSection() {
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState(0)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [status, setStatus] = useState<'idle' | 'latest' | 'available' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleCheck = async () => {
    setChecking(true)
    setStatus('idle')
    setErrorMsg('')
    try {
      const info = await checkForUpdates()
      if (info) {
        setUpdateInfo(info)
        setStatus('available')
      } else {
        setStatus('latest')
      }
    } catch (e) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : '업데이트 확인에 실패했습니다.')
    } finally {
      setChecking(false)
    }
  }

  const handleInstall = async () => {
    setInstalling(true)
    setProgress(0)
    try {
      await downloadAndInstallUpdate((p) => setProgress(p))
    } catch (e) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : '업데이트 설치에 실패했습니다.')
      setInstalling(false)
    }
  }

  return (
    <div>
      <h3 className="mb-1 font-medium">소프트웨어 업데이트</h3>
      <p className="mb-3 text-sm text-muted-foreground">
        최신 버전을 확인하고 바로 업데이트할 수 있습니다.
      </p>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={handleCheck} disabled={checking || installing}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
          {checking ? '확인 중...' : '업데이트 확인'}
        </Button>
      </div>

      {/* 최신 버전 */}
      {status === 'latest' && (
        <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" />
          현재 최신 버전입니다.
        </div>
      )}

      {/* 업데이트 가능 */}
      {status === 'available' && updateInfo && (
        <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              v{updateInfo.version} 업데이트 가능
            </span>
            <Button size="sm" onClick={handleInstall} disabled={installing}>
              <Download className="mr-1 h-3.5 w-3.5" />
              {installing ? `설치 중... ${progress}%` : '업데이트 설치'}
            </Button>
          </div>
          {updateInfo.body && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{updateInfo.body}</p>
          )}
          {installing && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* 에러 */}
      {status === 'error' && (
        <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {errorMsg || '업데이트 확인에 실패했습니다. 네트워크 연결을 확인하세요.'}
        </div>
      )}
    </div>
  )
}
