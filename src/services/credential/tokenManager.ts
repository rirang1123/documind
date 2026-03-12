import { keychain } from './keychainService'
import { getSettings, updateSettings } from '../db'

export class TokenManager {
  private refreshPromises = new Map<string, Promise<string>>()

  /** 유효한 access token 반환. 만료 임박 시 자동 갱신 */
  async getAccessToken(providerId: string): Promise<string> {
    const settings = await getSettings()
    const provider = settings.cloudProviders?.find((p) => p.id === providerId)
    if (!provider) throw new Error('클라우드 제공자를 찾을 수 없습니다.')

    // 만료 5분 전이면 갱신
    if (provider.tokenExpiry && new Date(provider.tokenExpiry).getTime() - Date.now() < 5 * 60 * 1000) {
      return this.refresh(providerId)
    }

    const token = await keychain.getCloudAccessToken(providerId)
    if (!token) throw new Error('토큰이 없습니다. 재인증이 필요합니다.')
    return token
  }

  /** 토큰 강제 갱신 */
  async refreshToken(providerId: string): Promise<string> {
    return this.refresh(providerId)
  }

  /** 동시 refresh 요청 방지 (per-provider mutex) */
  private async refresh(providerId: string): Promise<string> {
    const existing = this.refreshPromises.get(providerId)
    if (existing) return existing

    const promise = this.doRefresh(providerId)
    this.refreshPromises.set(providerId, promise)
    try {
      return await promise
    } finally {
      this.refreshPromises.delete(providerId)
    }
  }

  private async doRefresh(providerId: string): Promise<string> {
    const refreshToken = await keychain.getCloudRefreshToken(providerId)
    if (!refreshToken) throw new Error('Refresh token이 없습니다. 재인증이 필요합니다.')

    const settings = await getSettings()
    const provider = settings.cloudProviders?.find((p) => p.id === providerId)
    if (!provider) throw new Error('클라우드 제공자를 찾을 수 없습니다.')

    // Provider type에 따라 적절한 토큰 엔드포인트 사용
    let tokenUrl: string
    let errorMessage: string
    if (provider.type === 'onedrive') {
      tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
      errorMessage = '토큰 갱신 실패. Microsoft 계정을 다시 연결해주세요.'
    } else {
      tokenUrl = 'https://oauth2.googleapis.com/token'
      errorMessage = '토큰 갱신 실패. Google 계정을 다시 연결해주세요.'
    }

    // Google Desktop OAuth requires client_secret for token refresh
    const clientSecret = await keychain.getCloudClientSecret(providerId)
    const bodyParams: Record<string, string> = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: provider.clientId,
    }
    if (clientSecret) {
      bodyParams.client_secret = clientSecret
    }

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(bodyParams),
    })

    if (!res.ok) {
      throw new Error(errorMessage)
    }

    const data = await res.json()
    await keychain.setCloudAccessToken(providerId, data.access_token)

    // tokenExpiry 업데이트
    const expiry = new Date(Date.now() + data.expires_in * 1000)
    const updatedProviders = (settings.cloudProviders || []).map((p) =>
      p.id === providerId ? { ...p, tokenExpiry: expiry } : p
    )
    await updateSettings({ cloudProviders: updatedProviders })

    return data.access_token
  }
}

export const tokenManager = new TokenManager()
