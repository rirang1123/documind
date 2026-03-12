# DocuMind — 통합 API 관리 + Google Drive 연동 설계 문서

**버전**: 1.0
**작성일**: 2026-03-11
**대상 버전**: v0.4.0
**상태**: 설계 확정

---

## 1. 개요

### 1.1 목적
- 설정 화면의 API 관리를 통합 구조로 재편
- Google Drive 연동으로 클라우드 파일 가져오기/내보내기/웹 편집 지원
- 기존 AI API 키 포함 모든 credential을 OS Keychain으로 마이그레이션

### 1.2 범위
- OS Keychain 연동 (보안 기반)
- 설정 UI 재구조화
- Google Drive OAuth 인증 (Loopback + PKCE)
- Drive 파일 브라우저 + 가져오기/내보내기
- 뷰어 "웹에서 편집" 버튼

### 1.3 범위 외 (명시적 제외)
- 양방향 실시간 동기화 (v0.5+ 으로 연기)
- OneDrive/Dropbox 연동 (인터페이스만 선정의, 구현은 향후)
- 파일 충돌 자동 해결

---

## 2. 아키텍처

### 2.1 전체 구조

```
┌─────────────────────────────────────────────────────┐
│ UI Layer                                            │
│  ├── Settings/ApiManagement.tsx (통합 API 관리)      │
│  ├── Settings/GoogleDriveGuide.tsx (설정 가이드)     │
│  ├── Cloud/DriveFileBrowser.tsx (Drive 탐색기)       │
│  └── Viewer/FileViewer.tsx ("웹에서 편집" 버튼)      │
├─────────────────────────────────────────────────────┤
│ Service Layer                                       │
│  ├── credential/keychainService.ts (OS Keychain)    │
│  ├── credential/tokenManager.ts (토큰 갱신 관리)     │
│  ├── cloud/cloudProvider.ts (추상 인터페이스)         │
│  ├── cloud/googleDriveProvider.ts (Google 구현체)    │
│  └── cloud/googleAuth.ts (OAuth Loopback + PKCE)    │
├─────────────────────────────────────────────────────┤
│ Data Layer                                          │
│  ├── Dexie IndexedDB (메타데이터만)                   │
│  ├── OS Keychain (API키, OAuth 토큰)                 │
│  └── Tauri FS (Drive 다운로드 파일 → 디스크 저장)     │
├─────────────────────────────────────────────────────┤
│ Tauri (Rust)                                        │
│  ├── tauri-plugin-opener (브라우저 열기)              │
│  ├── tauri-plugin-fs (파일 I/O)                     │
│  └── OAuth Loopback HTTP Server (localhost 콜백)     │
└─────────────────────────────────────────────────────┘
```

### 2.2 파일 구조

```
src/
  services/
    credential/
      keychainService.ts     # OS Keychain CRUD (Tauri invoke)
      tokenManager.ts        # OAuth 토큰 갱신/만료 관리
    cloud/
      cloudProvider.ts        # CloudStorageProvider 인터페이스
      googleDriveProvider.ts  # Google Drive API 구현체
      googleAuth.ts           # OAuth Loopback + PKCE 흐름
  components/
    settings/
      ApiManagement.tsx       # 통합 API 관리 (AI + Cloud)
      AiProviderForm.tsx      # AI 서비스 추가/편집 폼
      CloudProviderForm.tsx   # 클라우드 추가/편집 폼
      GoogleDriveGuide.tsx    # 단계별 설정 가이드
    cloud/
      DriveFileBrowser.tsx    # Drive 파일 목록 탐색
      DriveImportDialog.tsx   # 파일 가져오기 다이얼로그
      DriveUploadDialog.tsx   # 파일 업로드 다이얼로그

src-tauri/
  src/
    keychain.rs              # OS Keychain 커맨드
    oauth_server.rs          # Loopback HTTP 서버
```

---

## 3. 보안 설계

### 3.1 OS Keychain 연동

**문제**: 현재 AI API 키가 IndexedDB에 평문 저장됨. OAuth 토큰 추가 시 보안 위험 증가.

**해결**: 모든 credential을 Windows Credential Store에 저장.

```
저장 위치별 데이터:
├── OS Keychain
│   ├── documind:ai:{providerId}:apiKey
│   ├── documind:cloud:{providerId}:accessToken
│   └── documind:cloud:{providerId}:refreshToken
│
└── IndexedDB (메타데이터만)
    ├── AIProvider: { id, name, type, model, isActive }  ← apiKey 제거
    └── CloudProvider: { id, name, type, clientId, email, isActive, tokenExpiry }
```

**Tauri Rust 커맨드**:

```rust
// src-tauri/src/keychain.rs

#[tauri::command]
fn keychain_set(service: String, key: String, value: String) -> Result<(), String>

#[tauri::command]
fn keychain_get(service: String, key: String) -> Result<Option<String>, String>

#[tauri::command]
fn keychain_delete(service: String, key: String) -> Result<(), String>
```

**프론트엔드 서비스**:

```typescript
// src/services/credential/keychainService.ts

import { invoke } from '@tauri-apps/api/core'

const SERVICE = 'DocuMind'

export const keychain = {
  async set(key: string, value: string): Promise<void> {
    await invoke('keychain_set', { service: SERVICE, key, value })
  },
  async get(key: string): Promise<string | null> {
    return invoke('keychain_get', { service: SERVICE, key })
  },
  async delete(key: string): Promise<void> {
    await invoke('keychain_delete', { service: SERVICE, key })
  },
}
```

**마이그레이션**: DB version 6 업그레이드 시 기존 AIProvider.apiKey를 Keychain으로 이동 후 DB에서 제거.

### 3.2 백업 시 credential 제외

```
현재: exportDatabaseToJSON()에 apiKey 포함
변경: 백업 시 AIProvider.apiKey, CloudProvider 토큰 필드 제외
복원: credential은 사용자가 재입력 안내
```

### 3.3 CSP 업데이트

```json
// src-tauri/capabilities/default.json에 추가 필요
// (실제 CSP는 tauri.conf.json 또는 meta 태그에서 설정)

connect-src 추가 도메인:
- https://www.googleapis.com
- https://oauth2.googleapis.com
- https://accounts.google.com
```

---

## 4. OAuth 인증 설계

### 4.1 인증 방식: Loopback + PKCE

Google은 데스크톱 앱에 대해 `urn:ietf:wg:oauth:2.0:oob` 방식을 deprecated 처리.
Loopback redirect (`http://localhost:{port}`)가 권장 방식.

**사용자 입력**: Client ID만 (Client Secret 불필요 — PKCE가 대체)

### 4.2 인증 흐름

```
1. 사용자가 "Google 계정 연결" 클릭
2. [프론트엔드] PKCE code_verifier (랜덤 43~128자) 생성
3. [프론트엔드] code_challenge = BASE64URL(SHA256(code_verifier))
4. [Rust] localhost:{random_port}에 임시 HTTP 서버 시작
5. [프론트엔드] 브라우저 열기:
   https://accounts.google.com/o/oauth2/v2/auth?
     client_id={사용자입력}&
     redirect_uri=http://localhost:{port}&
     response_type=code&
     scope=https://www.googleapis.com/auth/drive&
     code_challenge={code_challenge}&
     code_challenge_method=S256&
     access_type=offline&
     prompt=consent
6. [브라우저] 사용자가 Google 로그인 + 권한 허용
7. [브라우저] Google이 http://localhost:{port}?code=AUTH_CODE 로 리다이렉트
8. [Rust] HTTP 서버가 code 수신 → "인증 성공" 페이지 표시 → 서버 종료
9. [Rust → 프론트엔드] authorization code 전달
10. [프론트엔드] POST https://oauth2.googleapis.com/token
      grant_type=authorization_code&
      code={AUTH_CODE}&
      redirect_uri=http://localhost:{port}&
      client_id={client_id}&
      code_verifier={code_verifier}
11. 응답: { access_token, refresh_token, expires_in }
12. access_token, refresh_token → OS Keychain에 저장
13. tokenExpiry → IndexedDB에 저장
```

### 4.3 Rust Loopback 서버

```rust
// src-tauri/src/oauth_server.rs

use std::net::TcpListener;
use std::io::{Read, Write};

#[tauri::command]
async fn start_oauth_server() -> Result<OAuthResult, String> {
    // 1. 랜덤 포트로 TCP 리스너 시작
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();

    // 2. 단일 요청 대기 (타임아웃 120초)
    // 3. GET /?code=xxx 에서 code 추출
    // 4. "인증 완료" HTML 응답 후 서버 종료
    // 5. OAuthResult { port, code } 반환
}
```

### 4.4 토큰 갱신 관리

```typescript
// src/services/credential/tokenManager.ts

export class TokenManager {
  private refreshPromise: Promise<string> | null = null

  /** 유효한 access token 반환. 만료 시 자동 갱신 */
  async getAccessToken(providerId: string): Promise<string> {
    const expiry = await getTokenExpiry(providerId)

    // 만료 5분 전이면 갱신
    if (expiry && expiry.getTime() - Date.now() < 5 * 60 * 1000) {
      return this.refresh(providerId)
    }

    const token = await keychain.get(`cloud:${providerId}:accessToken`)
    if (!token) throw new Error('토큰이 없습니다. 재인증이 필요합니다.')
    return token
  }

  /** 동시 refresh 요청 방지 (mutex) */
  private async refresh(providerId: string): Promise<string> {
    if (this.refreshPromise) return this.refreshPromise

    this.refreshPromise = this.doRefresh(providerId)
    try {
      return await this.refreshPromise
    } finally {
      this.refreshPromise = null
    }
  }

  private async doRefresh(providerId: string): Promise<string> {
    const refreshToken = await keychain.get(`cloud:${providerId}:refreshToken`)
    if (!refreshToken) throw new Error('Refresh token이 없습니다. 재인증이 필요합니다.')

    const clientId = await getClientId(providerId)

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      }),
    })

    if (!res.ok) {
      // Refresh token도 만료 → 재인증 필요
      throw new Error('토큰 갱신 실패. Google 계정을 다시 연결해주세요.')
    }

    const data = await res.json()
    await keychain.set(`cloud:${providerId}:accessToken`, data.access_token)
    await updateTokenExpiry(providerId, data.expires_in)
    return data.access_token
  }
}
```

---

## 5. Cloud Provider 추상화

### 5.1 인터페이스

```typescript
// src/services/cloud/cloudProvider.ts

export interface CloudFile {
  id: string
  name: string
  mimeType: string
  size: number
  modifiedTime: Date
  isFolder: boolean
  webViewLink?: string    // 브라우저에서 보기 URL
  webEditLink?: string    // 웹 오피스 편집 URL
}

export interface CloudFileList {
  files: CloudFile[]
  nextPageToken?: string
}

export interface StorageQuota {
  used: number    // bytes
  total: number   // bytes
}

export interface CloudStorageProvider {
  // 인증
  authenticate(): Promise<void>
  refreshToken(): Promise<void>
  disconnect(): Promise<void>
  isAuthenticated(): boolean

  // 파일 조회
  listFiles(folderId?: string, pageToken?: string): Promise<CloudFileList>
  searchFiles(query: string): Promise<CloudFileList>
  getFile(fileId: string): Promise<CloudFile>

  // 파일 다운로드 (디스크에 직접 저장)
  downloadFile(fileId: string, destPath: string): Promise<void>

  // 파일 업로드
  uploadFile(name: string, localPath: string, folderId?: string): Promise<CloudFile>

  // 메타데이터
  getStorageQuota(): Promise<StorageQuota>

  // 웹 편집 URL (null이면 웹 편집 미지원)
  getWebEditUrl(file: CloudFile): string | null
}
```

### 5.2 Google Drive 구현체

```typescript
// src/services/cloud/googleDriveProvider.ts

const API_BASE = 'https://www.googleapis.com/drive/v3'

// Google Workspace MIME 타입 → export 변환 매핑
const GOOGLE_EXPORT_MAP: Record<string, { mimeType: string; ext: string }> = {
  'application/vnd.google-apps.document':     { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
  'application/vnd.google-apps.spreadsheet':  { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  'application/vnd.google-apps.presentation': { mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' },
}

// 웹 편집 URL 매핑
const WEB_EDIT_URLS: Record<string, string> = {
  'application/vnd.google-apps.document':     'https://docs.google.com/document/d/{id}/edit',
  'application/vnd.google-apps.spreadsheet':  'https://docs.google.com/spreadsheets/d/{id}/edit',
  'application/vnd.google-apps.presentation': 'https://docs.google.com/presentation/d/{id}/edit',
  // 일반 Office 파일도 Google에서 열기 가능
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':    'https://docs.google.com/document/d/{id}/edit',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':         'https://docs.google.com/spreadsheets/d/{id}/edit',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'https://docs.google.com/presentation/d/{id}/edit',
}

export class GoogleDriveProvider implements CloudStorageProvider {
  constructor(
    private providerId: string,
    private tokenManager: TokenManager,
  ) {}

  // 인증된 fetch wrapper
  private async apiFetch(url: string, init?: RequestInit): Promise<Response> {
    const token = await this.tokenManager.getAccessToken(this.providerId)
    const res = await fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${token}`,
      },
    })

    // 401 → 토큰 갱신 후 1회 재시도
    if (res.status === 401) {
      await this.tokenManager.refreshToken(this.providerId)
      const newToken = await this.tokenManager.getAccessToken(this.providerId)
      return fetch(url, {
        ...init,
        headers: {
          ...init?.headers,
          Authorization: `Bearer ${newToken}`,
        },
      })
    }

    return res
  }

  async listFiles(folderId?: string, pageToken?: string): Promise<CloudFileList> {
    const q = folderId ? `'${folderId}' in parents and trashed=false` : `'root' in parents and trashed=false`
    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)',
      pageSize: '50',
      orderBy: 'folder,name',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const res = await this.apiFetch(`${API_BASE}/files?${params}`)
    const data = await res.json()

    return {
      files: data.files.map(mapGoogleFile),
      nextPageToken: data.nextPageToken,
    }
  }

  async downloadFile(fileId: string, destPath: string): Promise<void> {
    // Google Workspace 파일은 export, 일반 파일은 직접 다운로드
    const meta = await this.getFile(fileId)
    const exportInfo = GOOGLE_EXPORT_MAP[meta.mimeType]

    let res: Response
    if (exportInfo) {
      // Google Docs/Sheets/Slides → export 변환
      res = await this.apiFetch(
        `${API_BASE}/files/${fileId}/export?mimeType=${encodeURIComponent(exportInfo.mimeType)}`
      )
    } else {
      // 일반 파일 → 직접 다운로드
      res = await this.apiFetch(`${API_BASE}/files/${fileId}?alt=media`)
    }

    const buffer = await res.arrayBuffer()
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    await writeFile(destPath, new Uint8Array(buffer))
  }

  getWebEditUrl(file: CloudFile): string | null {
    const template = WEB_EDIT_URLS[file.mimeType]
    if (!template) return null
    return template.replace('{id}', file.id)
  }

  // ... (authenticate, uploadFile, searchFiles 등)
}
```

---

## 6. 타입 및 DB 스키마

### 6.1 타입 변경

```typescript
// src/types/index.ts 변경

// AIProvider — apiKey 제거 (Keychain으로 이동)
export interface AIProvider {
  id: string
  name: string
  type: 'openai' | 'anthropic' | 'google'
  // apiKey: string  ← 삭제, Keychain으로 이동
  model: string
  isActive: boolean
}

// 신규
export interface CloudProvider {
  id: string
  name: string
  type: 'google-drive' | 'onedrive'
  clientId: string
  // clientSecret 불필요 (PKCE 사용)
  email?: string           // 연결된 Google 계정
  tokenExpiry?: Date
  isActive: boolean
  connectedAt?: Date
}

// AppSettings 변경
export interface AppSettings {
  storagePath: string
  theme: 'light' | 'dark' | 'system'
  language: 'ko' | 'en'
  aiProviders: AIProvider[]
  activeProviderId: string | null
  cloudProviders: CloudProvider[]           // 신규
  activeCloudProviderId: string | null      // 신규
  aiBehavior: AIBehavior
}
```

### 6.2 DB 마이그레이션 (version 5 → 6)

```typescript
// src/services/db.ts

db.version(6).stores({
  // 기존 테이블 유지
  // ...
}).upgrade(async (tx) => {
  // 1. 기존 AI API 키를 Keychain으로 마이그레이션
  const settings = await tx.table('settings').get('app')
  if (settings?.aiProviders) {
    for (const provider of settings.aiProviders) {
      if (provider.apiKey) {
        await keychain.set(`ai:${provider.id}:apiKey`, provider.apiKey)
        delete provider.apiKey
      }
    }
    // cloudProviders 초기화
    settings.cloudProviders = []
    settings.activeCloudProviderId = null
    await tx.table('settings').put(settings)
  }
})
```

---

## 7. 설정 UI 설계

### 7.1 설정 화면 구조

```
설정
├── API 관리
│   ├── AI 서비스
│   │   ├── [등록된 AI 서비스 목록]
│   │   │   ├── ☑ OpenAI — gpt-4o            [편집] [삭제]
│   │   │   └── ☐ Anthropic — claude-3-opus   [편집] [삭제]
│   │   └── [+ AI 서비스 추가]
│   │
│   └── 클라우드 스토리지
│       ├── [등록된 클라우드 목록]
│       │   └── ☑ Google Drive — user@gmail.com (연결됨) [연결 해제]
│       └── [+ 클라우드 추가]
│
├── AI 동작 설정
│   ├── 톤: 격식체 / 편한 톤 / 간결
│   ├── 분량: 간략 / 적절 / 상세
│   ├── 문체: 비즈니스 / 친근 / 학술
│   └── 커스텀 지시사항
│
├── 저장소
│   └── 로컬 저장 경로
│
└── 외관
    ├── 테마: 라이트 / 다크 / 시스템
    └── 언어: 한국어 / English
```

### 7.2 Google Drive 설정 가이드 UI

```
┌───────────────────────────────────────────────────┐
│ Google Drive 연결                                  │
├───────────────────────────────────────────────────┤
│                                                   │
│ ▼ Step 1. Google Cloud 프로젝트 생성               │
│   ┌─────────────────────────────────────────────┐ │
│   │ 1. Google Cloud Console에 접속합니다          │ │
│   │ 2. 상단 프로젝트 선택 → "새 프로젝트"         │ │
│   │ 3. 프로젝트 이름 입력 (예: DocuMind) → 만들기  │ │
│   │                                             │ │
│   │ [Google Cloud Console 열기 →]                │ │
│   └─────────────────────────────────────────────┘ │
│                                                   │
│ ▼ Step 2. Google Drive API 활성화                  │
│   ┌─────────────────────────────────────────────┐ │
│   │ 1. 좌측 메뉴 "API 및 서비스" → "라이브러리"   │ │
│   │ 2. "Google Drive API" 검색                   │ │
│   │ 3. "사용" 버튼 클릭                           │ │
│   │                                             │ │
│   │ [API 라이브러리 바로가기 →]                    │ │
│   └─────────────────────────────────────────────┘ │
│                                                   │
│ ▼ Step 3. OAuth 동의 화면 설정                     │
│   ┌─────────────────────────────────────────────┐ │
│   │ 1. "API 및 서비스" → "OAuth 동의 화면"        │ │
│   │ 2. 사용자 유형: "외부" 선택 → 만들기           │ │
│   │ 3. 앱 이름, 사용자 지원 이메일 입력 → 저장     │ │
│   │ 4. 범위: 추가 없이 → 저장 및 계속              │ │
│   │ 5. 테스트 사용자: 본인 Gmail 추가 → 저장       │ │
│   │                                             │ │
│   │ [OAuth 동의 화면 바로가기 →]                   │ │
│   └─────────────────────────────────────────────┘ │
│                                                   │
│ ▼ Step 4. OAuth 클라이언트 ID 발급                  │
│   ┌─────────────────────────────────────────────┐ │
│   │ 1. "API 및 서비스" → "사용자 인증 정보"        │ │
│   │ 2. "+ 사용자 인증 정보 만들기"                  │ │
│   │    → "OAuth 클라이언트 ID" 선택                │ │
│   │ 3. 애플리케이션 유형: "데스크톱 앱"             │ │
│   │ 4. 이름: DocuMind → 만들기                    │ │
│   │ 5. 표시된 "클라이언트 ID"를 아래에 붙여넣기     │ │
│   │                                             │ │
│   │ [사용자 인증 정보 바로가기 →]                   │ │
│   └─────────────────────────────────────────────┘ │
│                                                   │
│ ──────────────────────────────────────────────── │
│                                                   │
│ 클라이언트 ID                                      │
│ [____________________________________________]    │
│                                                   │
│              [Google 계정 연결하기]                  │
│                                                   │
│ 상태: ⚪ 연결되지 않음                              │
│                                                   │
│ ──────────────────────────────────────────────── │
│ 연결 완료 후:                                      │
│ ✅ user@gmail.com 연결됨                           │
│ 저장 용량: 3.2GB / 15GB                           │
│ [연결 해제]                                        │
└───────────────────────────────────────────────────┘

※ 가이드 각 Step은 Accordion(접이식) — 완료한 단계는 접어둠
※ 연결 완료 후 가이드 숨기고 계정 정보만 표시
```

---

## 8. Drive 파일 브라우저

### 8.1 UI 구성

```
┌───────────────────────────────────────────────────┐
│ Google Drive에서 가져오기                     [X]   │
├───────────────────────────────────────────────────┤
│ [🔍 파일 검색...]          필터: [전체 ▾]          │
├───────────────────────────────────────────────────┤
│ 📁 내 드라이브                                     │
│   📁 업무 문서                                     │
│     📄 2024 실적 보고서.docx         2.3MB  3/10  │
│     📊 매출 데이터.xlsx              156KB  3/9   │
│   📁 회의록                                       │
│   📄 프로젝트 기획서.docx            1.1MB  3/8   │
│   📊 재무 현황.gsheet               --     3/7   │
│                                                   │
│ ☑ 선택한 파일 3개 (3.6MB)                          │
│                                                   │
│          [취소]  [선택한 파일 가져오기]               │
├───────────────────────────────────────────────────┤
│ 저장 용량: 3.2GB / 15GB ████████░░ 21%            │
└───────────────────────────────────────────────────┘
```

### 8.2 기능 명세

| 기능 | 설명 |
|------|------|
| 폴더 탐색 | 클릭으로 하위 폴더 진입, 뒤로가기 |
| 파일 검색 | Google Drive API `q` 파라미터 (서버 사이드) |
| 타입 필터 | mimeType 기반 필터 (문서/스프레드시트/프레젠테이션/전체) |
| 다중 선택 | 체크박스로 여러 파일 선택 |
| 페이지네이션 | pageToken으로 50개씩 lazy loading, "더 불러오기" 버튼 |
| Google 파일 변환 | Google Docs → docx, Sheets → xlsx, Slides → pptx 자동 변환 |
| 가져오기 | 선택한 파일 → 로컬 디스크 저장 → DocuMind 프로젝트에 자동 분류 |
| 용량 표시 | 하단에 Drive 저장 용량 표시 |

### 8.3 파일 가져오기 흐름

```
1. 사용자가 파일 선택 → "가져오기" 클릭
2. 각 파일에 대해:
   a. Google Workspace 파일? → export API로 변환 다운로드
   b. 일반 파일? → 직접 다운로드
   c. Tauri FS로 로컬 디스크에 저장 ($DOCUMENT/DocuMind/imports/)
   d. DocumentFile 생성 (path = 디스크 경로, blobData는 저장하지 않음)
   e. classifyService로 자동 분류 → 프로젝트 폴더에 배치
3. 진행률 표시 (파일별 progress bar)
4. 완료 후 파일 브라우저에서 확인
```

---

## 9. 뷰어 "웹에서 편집" 버튼

### 9.1 동작

```
FileViewer 헤더:
[← 뒤로] 📄 보고서.docx (2.3MB)     [웹에서 편집] [편집하기] [다운로드]
                                      ↑ 신규       ↑ 기존(로컬 앱)
```

| 버튼 | 동작 |
|------|------|
| 웹에서 편집 | 파일을 Drive에 업로드 (없으면) → Google Docs/Sheets/Slides URL → 브라우저 열기 |
| 편집하기 | 기존: 로컬 OS 기본 앱으로 열기 |

### 9.2 "웹에서 편집" 흐름

```
1. 파일이 이미 Drive에 있는지 확인 (cloudFileId 메타데이터)
   a. 있으면 → 바로 웹 편집 URL 열기
   b. 없으면 → Drive에 업로드 → cloudFileId 저장 → 웹 편집 URL 열기
2. openUrl()로 브라우저에서 Google Docs/Sheets/Slides 열기
3. 사용자가 브라우저에서 편집 후 DocuMind으로 돌아오면
   → 상단에 "클라우드에서 변경된 내용이 있을 수 있습니다. [새로고침]" 배너 표시
```

---

## 10. 에러 처리

### 10.1 네트워크 에러

| 상황 | 처리 |
|------|------|
| 인터넷 연결 없음 | Drive 기능 비활성화, 로컬 기능 정상 동작, 상태바에 "오프라인" 표시 |
| 다운로드 중 끊김 | 에러 표시 + "다시 시도" 버튼 |
| 업로드 중 끊김 | 에러 표시 + "다시 시도" 버튼 |

### 10.2 인증 에러

| 상황 | 처리 |
|------|------|
| Access token 만료 | 자동 refresh (TokenManager) |
| Refresh token 만료 | "Google 계정을 다시 연결해주세요" 다이얼로그 |
| Client ID 유효하지 않음 | 설정 화면으로 이동 안내 |
| 권한 부족 (scope) | 재인증 유도 |

### 10.3 API 쿼터

| 상황 | 처리 |
|------|------|
| 일일 쿼터 초과 (403) | "오늘 API 사용량을 초과했습니다. 내일 다시 시도해주세요." |
| Rate limit (429) | 지수 백오프로 자동 재시도 (최대 3회) |

---

## 11. 구현 단계

### Phase 0: 보안 기반 (선행 필수)
- [ ] Rust keychain 커맨드 구현 (Windows Credential Store)
- [ ] keychainService.ts 프론트엔드 서비스
- [ ] 기존 AI API Key → Keychain 마이그레이션
- [ ] DB version 6 스키마 업그레이드
- [ ] 백업 내보내기에서 credential 제외

### Phase 1: 기반 구조
- [ ] CloudProvider, CloudStorageProvider 타입/인터페이스 정의
- [ ] AppSettings에 cloudProviders 필드 추가
- [ ] TokenManager 서비스 구현

### Phase 2: 설정 UI 재구조화
- [ ] ApiManagement.tsx — 통합 API 관리 탭
- [ ] AiProviderForm.tsx — AI 서비스 폼 (Keychain 연동)
- [ ] CloudProviderForm.tsx — 클라우드 폼
- [ ] 기존 설정 화면 탭 구조 변경

### Phase 3: OAuth 연동
- [ ] Rust oauth_server.rs — Loopback HTTP 서버
- [ ] googleAuth.ts — PKCE 생성 + 인증 흐름
- [ ] GoogleDriveGuide.tsx — 단계별 가이드 UI
- [ ] 연결 테스트 + 상태 표시
- [ ] CSP 업데이트

### Phase 4: Drive 파일 기능
- [ ] googleDriveProvider.ts — API 구현체
- [ ] DriveFileBrowser.tsx — 파일 목록 탐색 (페이지네이션, 검색, 필터)
- [ ] DriveImportDialog.tsx — 파일 가져오기 (변환 + 다운로드 + 분류)
- [ ] DriveUploadDialog.tsx — 파일 업로드

### Phase 5: 뷰어 통합
- [ ] FileViewer에 "웹에서 편집" 버튼 추가
- [ ] 업로드 → 웹 편집 URL → 브라우저 열기 흐름
- [ ] 클라우드 변경 감지 배너
- [ ] 파일 브라우저에 "Drive에서 가져오기" 버튼

---

## 12. 검증 체크리스트

- [ ] Keychain에 저장된 API 키로 AI 기능 정상 동작
- [ ] IndexedDB 백업에 credential 미포함 확인
- [ ] Google OAuth 인증 → 토큰 발급 → Keychain 저장
- [ ] 토큰 만료 시 자동 갱신 동작
- [ ] Drive 파일 목록 조회 (폴더 탐색, 검색, 필터)
- [ ] Google Docs → docx 변환 다운로드
- [ ] 로컬 파일 → Drive 업로드 → 웹 편집 URL 열기
- [ ] 인터넷 끊김 시 로컬 기능 정상 동작
- [ ] 연결 해제 시 토큰 revoke + Keychain 정리
- [ ] `npx tsc --noEmit` 통과
- [ ] `npx tauri build` 빌드 성공
