/**
 * 인앱 업데이트 서비스
 * Tauri v2 updater 플러그인을 사용하여 업데이트 확인/설치
 */
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export interface UpdateInfo {
  version: string
  body: string | null
  date: string | null
}

/**
 * 업데이트 확인
 * @returns UpdateInfo if update available, null if up to date
 */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  try {
    const update = await check()
    if (!update) return null

    return {
      version: update.version,
      body: update.body ?? null,
      date: update.date ?? null,
    }
  } catch (e) {
    console.warn('[updateService] 업데이트 확인 실패:', e)
    return null
  }
}

/**
 * 업데이트 다운로드 및 설치
 * 성공 시 앱이 자동 재시작됨
 */
export async function downloadAndInstallUpdate(
  onProgress?: (percent: number) => void
): Promise<void> {
  const update = await check()
  if (!update) throw new Error('업데이트를 찾을 수 없습니다.')

  let downloaded = 0
  let contentLength = 0

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        contentLength = event.data.contentLength ?? 0
        break
      case 'Progress':
        downloaded += event.data.chunkLength
        if (contentLength > 0 && onProgress) {
          onProgress(Math.round((downloaded / contentLength) * 100))
        }
        break
      case 'Finished':
        break
    }
  })

  await relaunch()
}
