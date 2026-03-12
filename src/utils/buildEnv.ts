/**
 * 빌드 환경 감지
 * 앱 이름(productName)으로 테스트 빌드인지 판별
 */

let _isTestBuild: boolean | null = null

export async function isTestBuild(): Promise<boolean> {
  if (_isTestBuild !== null) return _isTestBuild

  try {
    const { getName } = await import('@tauri-apps/api/app')
    const appName = await getName()
    _isTestBuild = appName.includes('Test')
  } catch {
    // Tauri API 불가 시 (dev 환경 등) false
    _isTestBuild = false
  }
  return _isTestBuild
}

export async function getAppVersion(): Promise<string> {
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    return await getVersion()
  } catch {
    return '0.0.0'
  }
}
