import { invoke } from '@tauri-apps/api/core'

const SERVICE = 'DocuMind'

export const keychain = {
  async set(key: string, value: string): Promise<void> {
    await invoke('keychain_set', { service: SERVICE, key, value })
  },

  async get(key: string): Promise<string | null> {
    return invoke<string | null>('keychain_get', { service: SERVICE, key })
  },

  async delete(key: string): Promise<void> {
    await invoke('keychain_delete', { service: SERVICE, key })
  },

  // AI API 키 전용 헬퍼
  async getAiApiKey(providerId: string): Promise<string | null> {
    return this.get(`ai:${providerId}:apiKey`)
  },

  async setAiApiKey(providerId: string, apiKey: string): Promise<void> {
    await this.set(`ai:${providerId}:apiKey`, apiKey)
  },

  async deleteAiApiKey(providerId: string): Promise<void> {
    await this.delete(`ai:${providerId}:apiKey`)
  },

  // Cloud 토큰 전용 헬퍼
  async getCloudAccessToken(providerId: string): Promise<string | null> {
    return this.get(`cloud:${providerId}:accessToken`)
  },

  async setCloudAccessToken(providerId: string, token: string): Promise<void> {
    await this.set(`cloud:${providerId}:accessToken`, token)
  },

  async getCloudRefreshToken(providerId: string): Promise<string | null> {
    return this.get(`cloud:${providerId}:refreshToken`)
  },

  async setCloudRefreshToken(providerId: string, token: string): Promise<void> {
    await this.set(`cloud:${providerId}:refreshToken`, token)
  },

  async deleteCloudTokens(providerId: string): Promise<void> {
    await this.delete(`cloud:${providerId}:accessToken`)
    await this.delete(`cloud:${providerId}:refreshToken`)
  },
}
