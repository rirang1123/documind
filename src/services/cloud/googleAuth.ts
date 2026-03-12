import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { keychain } from '@/services/credential/keychainService'

interface OAuthTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
}

interface GoogleAuthResult {
  email: string
  tokenExpiry: Date
}

/** Generate a cryptographically random code_verifier for PKCE */
function generateCodeVerifier(): string {
  const array = new Uint8Array(64)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

/** SHA-256 hash and base64url encode for code_challenge */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(hash))
}

/** Base64 URL encoding (no padding, URL-safe chars) */
function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Start the Google OAuth PKCE flow.
 *
 * 1. Generate PKCE verifier/challenge
 * 2. Start loopback server (Rust)
 * 3. Open Google OAuth in browser
 * 4. Wait for callback with auth code
 * 5. Exchange code for tokens
 * 6. Save tokens to Keychain
 * 7. Get user email
 *
 * @param clientId - Google OAuth Client ID
 * @param providerId - CloudProvider ID for keychain storage
 * @returns GoogleAuthResult with email and token expiry
 */
export async function startGoogleOAuth(
  clientId: string,
  providerId: string,
): Promise<GoogleAuthResult> {
  // 1. Generate PKCE
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  // 2. Start loopback server to get random port
  const port = await invoke<number>('oauth_get_port')

  const redirectUri = `http://localhost:${port}`

  try {
    // 3. Open Google OAuth in browser
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email')
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')

    await openUrl(authUrl.toString())

    // 4. Wait for OAuth callback (blocks until code received or 120s timeout)
    const result = await invoke<{ code: string }>('oauth_wait_callback', { port })

    // 5. Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: result.code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier,
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}))
      const msg = (err as { error_description?: string }).error_description || '토큰 교환 실패'
      throw new Error(msg)
    }

    const tokenData: OAuthTokenResponse = await tokenRes.json()

    // 6. Save tokens to Keychain
    await keychain.setCloudAccessToken(providerId, tokenData.access_token)
    if (tokenData.refresh_token) {
      await keychain.setCloudRefreshToken(providerId, tokenData.refresh_token)
    }

    // 7. Get user email
    const email = await fetchUserEmail(tokenData.access_token)

    const tokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000)

    return { email, tokenExpiry }
  } catch (err) {
    // Cancel the server if still running
    await invoke('oauth_cancel', { port }).catch(() => {})
    throw err
  }
}

/** Fetch the authenticated user's email from Google */
async function fetchUserEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    return '(이메일 확인 불가)'
  }

  const data: { email?: string } = await res.json()
  return data.email || '(이메일 확인 불가)'
}

/** Disconnect: revoke tokens and clear from Keychain */
export async function disconnectGoogle(providerId: string): Promise<void> {
  // Try to revoke the access token
  const accessToken = await keychain.getCloudAccessToken(providerId)
  if (accessToken) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
      method: 'POST',
    }).catch(() => {})
  }

  // Clear tokens from Keychain
  await keychain.deleteCloudTokens(providerId)
}
