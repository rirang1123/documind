import { useEffect, useMemo, useRef, useState } from 'react'
import { Settings, Key, Palette, Globe, Plus, Trash2, Bot, FolderOpen, Download, Upload, Cloud, ChevronDown, ChevronRight, ExternalLink, Info, Loader2, CheckCircle2, LinkIcon, Unlink } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AIProvider, AIBehavior, CloudProvider } from '@/types'
import { DEFAULT_AI_BEHAVIOR } from '@/types'
import { generateId } from '@/utils/id'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { exportDatabaseToJSON, importDatabaseFromJSON, getAllAIUsage } from '@/services/db'
import { keychain } from '@/services/credential/keychainService'
import { UpdateSection } from '@/components/settings/UpdateSection'
import { startGoogleOAuth, disconnectGoogle } from '@/services/cloud/googleAuth'

export function SettingsView() {
  const { settings, loadSettings } = useAppStore()
  const [activeTab, setActiveTab] = useState<'general' | 'api' | 'ai-behavior' | 'appearance'>('general')

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  if (!settings) return null

  return (
    <div className="h-full p-6">
      <h2 className="mb-6 text-xl font-semibold flex items-center gap-2">
        <Settings className="h-5 w-5" />
        설정
      </h2>

      <div className="flex gap-6">
        {/* Tabs */}
        <nav className="flex w-48 flex-col gap-1">
          {[
            { id: 'general' as const, label: '일반', icon: Globe },
            { id: 'api' as const, label: 'API 관리', icon: Key },
            { id: 'ai-behavior' as const, label: 'AI 동작', icon: Bot },
            { id: 'appearance' as const, label: '외관', icon: Palette },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 max-w-xl">
          {activeTab === 'general' && <GeneralSettings />}
          {activeTab === 'api' && <ApiManagement />}
          {activeTab === 'ai-behavior' && <AIBehaviorSettings />}
          {activeTab === 'appearance' && <AppearanceSettings />}
        </div>
      </div>
    </div>
  )
}

function GeneralSettings() {
  const { settings, saveSettings } = useAppStore()
  const [storagePath, setStoragePath] = useState(settings?.storagePath || '')

  const handleBrowse = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: '프로젝트 저장소 폴더 선택',
      })
      if (selected && typeof selected === 'string') {
        setStoragePath(selected)
        await saveSettings({ storagePath: selected })
      }
    } catch (err) {
      console.error('폴더 선택 실패:', err)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 소프트웨어 업데이트 */}
      <UpdateSection />

      <div>
        <h3 className="mb-1 font-medium">저장소 경로</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          프로젝트와 문서가 저장되는 기본 폴더를 설정합니다.
          <br />
          <span className="text-xs">설정하지 않으면 기본값: 내 문서/DocuMind</span>
        </p>
        <div className="flex gap-2">
          <Input
            value={storagePath}
            onChange={(e) => setStoragePath(e.target.value)}
            placeholder="내 문서/DocuMind (기본값)"
            className="flex-1"
          />
          <Button variant="outline" onClick={handleBrowse}>
            <FolderOpen className="mr-1 h-3.5 w-3.5" />
            찾아보기
          </Button>
          <Button
            variant="outline"
            onClick={() => saveSettings({ storagePath })}
          >
            저장
          </Button>
        </div>
        {storagePath && (
          <p className="mt-1 text-xs text-muted-foreground font-mono">{storagePath}</p>
        )}
      </div>

      {/* Backup / Restore */}
      <BackupRestoreSection />

      {/* 데이터 전체 초기화 */}
      <DataResetSection storagePath={storagePath} />

      <div>
        <h3 className="mb-1 font-medium">언어</h3>
        <select
          value={settings?.language || 'ko'}
          onChange={(e) => saveSettings({ language: e.target.value as 'ko' | 'en' })}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="ko">한국어</option>
          <option value="en">English</option>
        </select>
      </div>
    </div>
  )
}

function BackupRestoreSection() {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleBackup = async () => {
    try {
      const json = await exportDatabaseToJSON()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const date = new Date().toISOString().slice(0, 10)
      const a = document.createElement('a')
      a.href = url
      a.download = `documind-backup-${date}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setMessage({ type: 'success', text: '백업 파일이 다운로드되었습니다. (API 키/토큰은 보안상 제외됩니다)' })
    } catch (err) {
      console.error('백업 실패:', err)
      setMessage({ type: 'error', text: '백업에 실패했습니다.' })
    }
  }

  const handleRestore = () => {
    if (!window.confirm('복원하면 현재 데이터가 모두 대체됩니다. API 키는 별도로 재입력해야 합니다. 계속하시겠습니까?')) return
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      await importDatabaseFromJSON(text)
      setMessage({ type: 'success', text: '복원이 완료되었습니다. 페이지를 새로고침합니다.' })
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      console.error('복원 실패:', err)
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '복원에 실패했습니다.' })
    }
    // reset input
    e.target.value = ''
  }

  return (
    <div>
      <h3 className="mb-1 font-medium">데이터 백업 / 복원</h3>
      <p className="mb-3 text-sm text-muted-foreground">
        프로젝트, 문서, 설정 등 모든 데이터를 JSON 파일로 백업하거나 복원합니다.
        <br />
        <span className="text-xs">API 키와 인증 토큰은 보안상 백업에 포함되지 않습니다.</span>
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={handleBackup}>
          <Download className="mr-1 h-3.5 w-3.5" />
          백업
        </Button>
        <Button variant="outline" onClick={handleRestore}>
          <Upload className="mr-1 h-3.5 w-3.5" />
          복원
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
      {message && (
        <p className={`mt-2 text-sm ${message.type === 'success' ? 'text-green-600' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}

function DataResetSection({ storagePath }: { storagePath: string }) {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirmText, setConfirmText] = useState('')

  const handleReset = async () => {
    if (confirmText !== '초기화') return

    try {
      // 1) 저장소 디스크 폴더 삭제
      const basePath = storagePath || ''
      if (basePath) {
        try {
          const { remove, exists } = await import('@tauri-apps/plugin-fs')
          const pathExists = await exists(basePath)
          if (pathExists) {
            await remove(basePath, { recursive: true })
          }
        } catch (e) {
          console.warn('저장소 폴더 삭제 실패:', e)
        }
      } else {
        // storagePath가 비어있으면 기본 경로(문서/DocuMind) 삭제 시도
        try {
          const { remove, exists } = await import('@tauri-apps/plugin-fs')
          const { documentDir, join } = await import('@tauri-apps/api/path')
          const docDir = await documentDir()
          const defaultPath = await join(docDir, 'DocuMind')
          const pathExists = await exists(defaultPath)
          if (pathExists) {
            await remove(defaultPath, { recursive: true })
          }
        } catch (e) {
          console.warn('기본 저장소 폴더 삭제 실패:', e)
        }
      }

      // 2) IndexedDB 전체 삭제
      const { db } = await import('@/services/db')
      await db.delete()

      setMessage({ type: 'success', text: '모든 데이터가 초기화되었습니다. 앱을 재시작합니다.' })
      setTimeout(async () => {
        try {
          const { relaunch } = await import('@tauri-apps/plugin-process')
          await relaunch()
        } catch {
          window.location.reload()
        }
      }, 1500)
    } catch (err) {
      console.error('데이터 초기화 실패:', err)
      setMessage({ type: 'error', text: '데이터 초기화에 실패했습니다.' })
    }
  }

  return (
    <div>
      <h3 className="mb-1 font-medium text-destructive">데이터 전체 초기화</h3>
      <p className="mb-3 text-sm text-muted-foreground">
        모든 프로젝트, 문서, 설정을 삭제하고 저장소 폴더도 제거합니다.
        <br />
        <span className="text-xs text-destructive">소프트웨어 재설치 시 깨끗한 상태로 시작하려면 이 기능을 사용하세요.</span>
      </p>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">
            확인을 위해 <strong>"초기화"</strong>를 입력하세요
          </label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="초기화"
            className="max-w-48"
          />
        </div>
        <Button
          variant="destructive"
          disabled={confirmText !== '초기화'}
          onClick={handleReset}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          전체 초기화
        </Button>
      </div>
      {message && (
        <p className={`mt-2 text-sm ${message.type === 'success' ? 'text-green-600' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}

/** 통합 API 관리 (AI 서비스 + 클라우드 스토리지) */
function ApiManagement() {
  const [section, setSection] = useState<'ai' | 'cloud'>('ai')

  return (
    <div className="flex flex-col gap-4">
      {/* 섹션 토글 */}
      <div className="flex gap-2 border-b border-border pb-2">
        <button
          onClick={() => setSection('ai')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md cursor-pointer ${
            section === 'ai' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          <Key className="h-3.5 w-3.5" />
          AI 서비스
        </button>
        <button
          onClick={() => setSection('cloud')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md cursor-pointer ${
            section === 'cloud' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          <Cloud className="h-3.5 w-3.5" />
          클라우드 스토리지
        </button>
      </div>

      {section === 'ai' && <AISettings />}
      {section === 'cloud' && <CloudSettings />}
    </div>
  )
}

function AISettings() {
  const { settings, saveSettings } = useAppStore()
  const providers = settings?.aiProviders || []
  const [editing, setEditing] = useState<(AIProvider & { apiKeyInput?: string }) | null>(null)
  const [loadingKey, setLoadingKey] = useState(false)

  const addProvider = () => {
    setEditing({
      id: generateId(),
      name: '',
      type: 'openai',
      model: MODEL_OPTIONS.openai[0].id,
      isActive: true,
      apiKeyInput: '',
    })
  }

  const editProvider = async (provider: AIProvider) => {
    setLoadingKey(true)
    try {
      const existingKey = await keychain.getAiApiKey(provider.id)
      setEditing({
        ...provider,
        apiKeyInput: existingKey || '',
      })
    } catch {
      setEditing({ ...provider, apiKeyInput: '' })
    }
    setLoadingKey(false)
  }

  const saveProvider = async () => {
    if (!editing || !editing.name || !editing.apiKeyInput) return

    // API 키를 Keychain에 저장
    await keychain.setAiApiKey(editing.id, editing.apiKeyInput)

    // DB에는 apiKey 없이 저장
    const { apiKeyInput: _, ...providerData } = editing
    const updated = providers.filter((p) => p.id !== editing.id)
    updated.push(providerData)
    await saveSettings({ aiProviders: updated, activeProviderId: editing.id })
    setEditing(null)
  }

  const removeProvider = async (id: string) => {
    // Keychain에서도 삭제
    await keychain.deleteAiApiKey(id)
    await saveSettings({
      aiProviders: providers.filter((p) => p.id !== id),
      activeProviderId: settings?.activeProviderId === id ? null : settings?.activeProviderId,
    })
  }

  const MODEL_OPTIONS: Record<string, { id: string; label: string }[]> = {
    openai: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    ],
    anthropic: [
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    ],
    google: [
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
      { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite (Preview)' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
    ],
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">AI 제공자</h3>
          <p className="text-sm text-muted-foreground">API 키는 OS 자격 증명 저장소에 안전하게 보관됩니다.</p>
        </div>
        <Button size="sm" onClick={addProvider}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          추가
        </Button>
      </div>

      {/* Provider List */}
      {providers.map((provider) => (
        <div
          key={provider.id}
          className="flex items-center justify-between rounded-lg border border-border p-3"
        >
          <div className="flex items-center gap-3">
            <input
              type="radio"
              name="activeProvider"
              checked={settings?.activeProviderId === provider.id}
              onChange={() => saveSettings({ activeProviderId: provider.id })}
              className="cursor-pointer"
            />
            <div>
              <div className="font-medium text-sm">{provider.name}</div>
              <div className="text-xs text-muted-foreground">
                {provider.type.toUpperCase()} · {provider.model}
              </div>
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => editProvider(provider)} disabled={loadingKey}>
              편집
            </Button>
            <Button variant="ghost" size="icon" onClick={() => removeProvider(provider.id)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      ))}

      {providers.length === 0 && !editing && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          AI 기능을 사용하려면 API 키를 등록하세요.
        </p>
      )}

      {/* Edit Form */}
      {editing && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex flex-col gap-3">
          <Input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="이름 (예: My OpenAI)"
          />
          <select
            value={editing.type}
            onChange={(e) =>
              setEditing({
                ...editing,
                type: e.target.value as AIProvider['type'],
                model: MODEL_OPTIONS[e.target.value][0].id,
              })
            }
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="google">Google (Gemini)</option>
          </select>
          <select
            value={editing.model}
            onChange={(e) => setEditing({ ...editing, model: e.target.value })}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            {MODEL_OPTIONS[editing.type].map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <Input
            type="password"
            value={editing.apiKeyInput || ''}
            onChange={(e) => setEditing({ ...editing, apiKeyInput: e.target.value })}
            placeholder="API Key"
          />
          <p className="text-xs text-muted-foreground">
            API 키는 Windows 자격 증명 관리자에 암호화되어 저장됩니다.
          </p>
          <AiApiKeyGuide type={editing.type} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
              취소
            </Button>
            <Button size="sm" onClick={saveProvider} disabled={!editing.name || !editing.apiKeyInput}>
              저장
            </Button>
          </div>
        </div>
      )}

      {/* AI Usage Section */}
      <div className="mt-6 border-t border-border pt-6">
        <AIUsageSection />
      </div>
    </div>
  )
}

/** AI API 키 발급 가이드 (접이식) */
function AiApiKeyGuide({ type }: { type: AIProvider['type'] }) {
  const [open, setOpen] = useState(false)

  const guides: Record<AIProvider['type'], { title: string; steps: string[]; url: string; urlLabel: string }> = {
    openai: {
      title: 'OpenAI API 키 발급 방법',
      steps: [
        'OpenAI Platform에 로그인합니다.',
        '좌측 메뉴에서 "API keys"를 클릭합니다.',
        '"Create new secret key" 버튼을 클릭합니다.',
        '키 이름을 입력하고 "Create secret key"를 클릭합니다.',
        '표시된 API 키를 복사하여 위에 붙여넣습니다.',
        '(키는 한 번만 표시되므로 바로 복사하세요)',
      ],
      url: 'https://platform.openai.com/api-keys',
      urlLabel: 'OpenAI API Keys 페이지 열기',
    },
    anthropic: {
      title: 'Anthropic API 키 발급 방법',
      steps: [
        'Anthropic Console에 로그인합니다.',
        '좌측 메뉴에서 "API Keys"를 클릭합니다.',
        '"Create Key" 버튼을 클릭합니다.',
        '키 이름을 입력하고 생성합니다.',
        '표시된 API 키를 복사하여 위에 붙여넣습니다.',
      ],
      url: 'https://console.anthropic.com/settings/keys',
      urlLabel: 'Anthropic Console 열기',
    },
    google: {
      title: 'Google Gemini API 키 발급 방법',
      steps: [
        'Google AI Studio에 접속합니다.',
        '좌측 메뉴에서 "Get API key"를 클릭합니다.',
        '"Create API key" 버튼을 클릭합니다.',
        '프로젝트를 선택하거나 새 프로젝트를 생성합니다.',
        '표시된 API 키를 복사하여 위에 붙여넣습니다.',
      ],
      url: 'https://aistudio.google.com/apikey',
      urlLabel: 'Google AI Studio 열기',
    },
  }

  const guide = guides[type]

  return (
    <div className="rounded-md border border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Info className="h-3 w-3" />
        {guide.title}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
            {guide.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <button
            onClick={() => window.open(guide.url, '_blank')}
            className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
          >
            <ExternalLink className="h-3 w-3" />
            {guide.urlLabel}
          </button>
        </div>
      )}
    </div>
  )
}

function CloudSettings() {
  const { settings, saveSettings } = useAppStore()
  const providers = settings?.cloudProviders || []
  const [showSetup, setShowSetup] = useState<'google-drive' | 'onedrive' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const removeProvider = async (id: string) => {
    await keychain.deleteCloudTokens(id)
    await saveSettings({
      cloudProviders: providers.filter((p) => p.id !== id),
      activeCloudProviderId: settings?.activeCloudProviderId === id ? null : settings?.activeCloudProviderId,
    })
    if (editingId === id) setEditingId(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">클라우드 스토리지</h3>
          <p className="text-sm text-muted-foreground">클라우드 파일 가져오기/내보내기를 위해 연결합니다.</p>
        </div>
      </div>

      {/* 등록된 클라우드 목록 */}
      {providers.map((provider) => (
        <div key={provider.id}>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              <Cloud className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium text-sm">{provider.name}</div>
                <div className="text-xs text-muted-foreground">
                  {provider.email ? `${provider.email} (연결됨)` : provider.clientId ? 'Client ID 등록됨 — 계정 연결 필요' : '설정 필요'}
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditingId(editingId === provider.id ? null : provider.id)}>
                설정
              </Button>
              <Button variant="ghost" size="icon" onClick={() => removeProvider(provider.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
          {editingId === provider.id && (
            provider.type === 'onedrive' ? (
              <OneDriveSetupGuide
                provider={provider}
                onSave={async (updated) => {
                  const updatedProviders = providers.map((p) => p.id === updated.id ? updated : p)
                  await saveSettings({ cloudProviders: updatedProviders, activeCloudProviderId: updated.id })
                  setEditingId(null)
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <GoogleDriveSetupGuide
                provider={provider}
                onSave={async (updated) => {
                  const updatedProviders = providers.map((p) => p.id === updated.id ? updated : p)
                  await saveSettings({ cloudProviders: updatedProviders, activeCloudProviderId: updated.id })
                  setEditingId(null)
                }}
                onCancel={() => setEditingId(null)}
              />
            )
          )}
        </div>
      ))}

      {/* 클라우드 서비스 선택 카드 (추가 모드가 아닐 때만) */}
      {!showSetup && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">클라우드 서비스 추가</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setShowSetup('google-drive')}
              className="flex items-center gap-3 rounded-lg border-2 border-border p-3 text-left hover:border-primary/40 cursor-pointer transition-colors"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                  <path d="M4.433 22l3.52-6.1h12.614l-3.52 6.1z" fill="#4285F4"/>
                  <path d="M14.55 8L8 2h8.067l6.5 6z" fill="#0F9D58"/>
                  <path d="M1.467 15.9L8 2l3.52 6.1-6.567 11.367z" fill="#FBBC04"/>
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium">Google Drive</div>
                <div className="text-[10px] text-muted-foreground">Docs, Sheets, Slides</div>
              </div>
            </button>
            <button
              onClick={() => setShowSetup('onedrive')}
              className="flex items-center gap-3 rounded-lg border-2 border-border p-3 text-left hover:border-primary/40 cursor-pointer transition-colors"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-50 dark:bg-sky-950">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                  <path d="M14.5 15.5H20a3.5 3.5 0 000-7c-.17 0-.34.01-.5.04A5.5 5.5 0 009 7.5c0 .28.02.56.07.83A4.5 4.5 0 005 13a4.5 4.5 0 004.5 4.5h5z" fill="#0078D4"/>
                  <path d="M10 17h10a3 3 0 000-6 5 5 0 00-9.5-1.5A4 4 0 004 13.5 4 4 0 008 17h2z" fill="#50E6FF" opacity=".6"/>
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium">OneDrive</div>
                <div className="text-[10px] text-muted-foreground">Word, Excel, PowerPoint</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* 새 클라우드 추가 가이드 */}
      {showSetup === 'google-drive' && (
        <GoogleDriveSetupGuide
          onSave={async (provider) => {
            await saveSettings({
              cloudProviders: [...providers, provider],
              activeCloudProviderId: provider.id,
            })
            setShowSetup(null)
          }}
          onCancel={() => setShowSetup(null)}
        />
      )}
      {showSetup === 'onedrive' && (
        <OneDriveSetupGuide
          onSave={async (provider) => {
            await saveSettings({
              cloudProviders: [...providers, provider],
              activeCloudProviderId: provider.id,
            })
            setShowSetup(null)
          }}
          onCancel={() => setShowSetup(null)}
        />
      )}
    </div>
  )
}

/** Google Drive 설정 단계별 가이드 */
function GoogleDriveSetupGuide({
  provider,
  onSave,
  onCancel,
}: {
  provider?: CloudProvider
  onSave: (provider: CloudProvider) => Promise<void>
  onCancel: () => void
}) {
  const [expandedStep, setExpandedStep] = useState<number>(provider?.clientId ? 0 : 1)
  const [clientId, setClientId] = useState(provider?.clientId || '')
  const [clientSecret, setClientSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  // Load client secret from keychain on mount
  useEffect(() => {
    if (provider?.id) {
      keychain.getCloudClientSecret(provider.id).then(s => {
        if (s) setClientSecret(s)
      })
    }
  }, [provider?.id])

  const isConnected = !!provider?.email

  const toggleStep = (step: number) => {
    setExpandedStep(expandedStep === step ? 0 : step)
  }

  const handleSave = async () => {
    if (!clientId.trim() || !clientSecret.trim()) return
    setSaving(true)
    try {
      const data: CloudProvider = provider
        ? { ...provider, clientId: clientId.trim() }
        : {
            id: generateId(),
            name: 'Google Drive',
            type: 'google-drive',
            clientId: clientId.trim(),
            isActive: true,
          }
      // Client Secret은 Keychain에 안전하게 저장
      await keychain.setCloudClientSecret(data.id, clientSecret.trim())
      await onSave(data)
    } finally {
      setSaving(false)
    }
  }

  /** Google 계정 연결 (OAuth PKCE) */
  const handleConnect = async () => {
    if (!provider?.clientId) return
    setConnecting(true)
    setConnectError(null)
    try {
      const result = await startGoogleOAuth(provider.clientId, provider.id)
      // 연결 성공 → provider 업데이트
      await onSave({
        ...provider,
        email: result.email,
        tokenExpiry: result.tokenExpiry,
        connectedAt: new Date(),
      })
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : '연결에 실패했습니다.')
    } finally {
      setConnecting(false)
    }
  }

  /** Google 계정 연결 해제 */
  const handleDisconnect = async () => {
    if (!provider) return
    setDisconnecting(true)
    try {
      await disconnectGoogle(provider.id)
      await onSave({
        ...provider,
        email: undefined,
        tokenExpiry: undefined,
        connectedAt: undefined,
      })
    } catch (err) {
      console.warn('연결 해제 실패:', err)
    } finally {
      setDisconnecting(false)
    }
  }

  const steps = [
    {
      num: 1,
      title: 'Google Cloud 프로젝트 생성',
      content: (
        <>
          <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
            <li>Google Cloud Console에 접속합니다.</li>
            <li>상단의 프로젝트 선택 드롭다운을 클릭합니다.</li>
            <li>"새 프로젝트"를 선택합니다.</li>
            <li>프로젝트 이름을 입력합니다 (예: DocuMind).</li>
            <li>"만들기" 버튼을 클릭합니다.</li>
          </ol>
          <button
            onClick={() => window.open('https://console.cloud.google.com/projectcreate', '_blank')}
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
          >
            <ExternalLink className="h-3 w-3" />
            Google Cloud Console 열기
          </button>
        </>
      ),
    },
    {
      num: 2,
      title: 'Google Drive API 활성화',
      content: (
        <>
          <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
            <li>좌측 메뉴에서 "API 및 서비스" → "라이브러리"를 선택합니다.</li>
            <li>"Google Drive API"를 검색합니다.</li>
            <li>검색 결과에서 "Google Drive API"를 클릭합니다.</li>
            <li>"사용" 버튼을 클릭하여 API를 활성화합니다.</li>
          </ol>
          <button
            onClick={() => window.open('https://console.cloud.google.com/apis/library/drive.googleapis.com', '_blank')}
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
          >
            <ExternalLink className="h-3 w-3" />
            Drive API 라이브러리 바로가기
          </button>
        </>
      ),
    },
    {
      num: 3,
      title: 'OAuth 동의 화면 설정',
      content: (
        <>
          <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
            <li>"API 및 서비스" → "OAuth 동의 화면"으로 이동합니다.</li>
            <li>사용자 유형: "외부"를 선택하고 "만들기"를 클릭합니다.</li>
            <li>앱 이름 (예: DocuMind)과 사용자 지원 이메일을 입력합니다.</li>
            <li>"저장 및 계속"을 클릭합니다 (범위는 추가하지 않아도 됩니다).</li>
            <li>테스트 사용자에 본인 Gmail 주소를 추가하고 "저장"합니다.</li>
          </ol>
          <button
            onClick={() => window.open('https://console.cloud.google.com/apis/credentials/consent', '_blank')}
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
          >
            <ExternalLink className="h-3 w-3" />
            OAuth 동의 화면 바로가기
          </button>
        </>
      ),
    },
    {
      num: 4,
      title: 'OAuth 클라이언트 ID 발급',
      content: (
        <>
          <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
            <li>"API 및 서비스" → "사용자 인증 정보"로 이동합니다.</li>
            <li>"+ 사용자 인증 정보 만들기" → "OAuth 클라이언트 ID"를 선택합니다.</li>
            <li>애플리케이션 유형: "데스크톱 앱"을 선택합니다.</li>
            <li>이름을 입력합니다 (예: DocuMind).</li>
            <li>"만들기"를 클릭합니다.</li>
            <li>표시된 "클라이언트 ID"와 "클라이언트 보안 비밀번호(Secret)"를 복사하여 아래에 붙여넣습니다.</li>
          </ol>
          <button
            onClick={() => window.open('https://console.cloud.google.com/apis/credentials', '_blank')}
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
          >
            <ExternalLink className="h-3 w-3" />
            사용자 인증 정보 바로가기
          </button>
        </>
      ),
    },
  ]

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 mt-2 space-y-3">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <Cloud className="h-4 w-4" />
        Google Drive 연결 설정
      </h4>

      {/* 단계별 가이드 (아코디언) */}
      <div className="space-y-1">
        {steps.map((step) => (
          <div key={step.num} className="rounded-md border border-border overflow-hidden">
            <button
              onClick={() => toggleStep(step.num)}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-accent/50 cursor-pointer"
            >
              {expandedStep === step.num ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
              <span className="flex items-center justify-center h-4 w-4 rounded-full bg-primary/20 text-[10px] text-primary font-bold">
                {step.num}
              </span>
              {step.title}
            </button>
            {expandedStep === step.num && (
              <div className="px-3 pb-3 pt-1 border-t border-border/50">
                {step.content}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Client ID + Secret 입력 */}
      <div className="border-t border-border pt-3 space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium">클라이언트 ID</label>
          <Input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">클라이언트 Secret</label>
          <Input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="font-mono text-xs"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          위 Step 4에서 발급받은 클라이언트 ID와 Secret을 붙여넣으세요. Secret은 OS Keychain에 안전하게 저장됩니다.
        </p>
      </div>

      {/* 버튼 */}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>
          취소
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!clientId.trim() || !clientSecret.trim() || saving}>
          {saving ? '저장 중...' : '저장'}
        </Button>
      </div>

      {/* 계정 연결 / 연결 상태 */}
      {provider?.clientId && (
        <div className="border-t border-border pt-3 space-y-2">
          {isConnected ? (
            <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                {provider.email} (연결됨)
              </div>
              {provider.connectedAt && (
                <p className="text-xs text-muted-foreground">
                  연결일: {new Date(provider.connectedAt).toLocaleDateString('ko-KR')}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-destructive hover:text-destructive"
              >
                {disconnecting ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 해제 중...</>
                ) : (
                  <><Unlink className="h-3 w-3 mr-1" /> 연결 해제</>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                onClick={handleConnect}
                disabled={connecting}
                className="w-full"
                size="sm"
              >
                {connecting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> 브라우저에서 인증 중...</>
                ) : (
                  <><LinkIcon className="h-4 w-4 mr-2" /> Google 계정 연결하기</>
                )}
              </Button>
              {connecting && (
                <p className="text-xs text-muted-foreground text-center">
                  브라우저에서 Google 로그인을 완료해주세요. (120초 제한)
                </p>
              )}
              {connectError && (
                <p className="text-xs text-destructive">{connectError}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** OneDrive 설정 단계별 가이드 */
function OneDriveSetupGuide({
  provider,
  onSave,
  onCancel,
}: {
  provider?: CloudProvider
  onSave: (provider: CloudProvider) => Promise<void>
  onCancel: () => void
}) {
  const [expandedStep, setExpandedStep] = useState<number>(1)
  const [clientId, setClientId] = useState(provider?.clientId || '')
  const [saving, setSaving] = useState(false)

  const toggleStep = (step: number) => {
    setExpandedStep(expandedStep === step ? 0 : step)
  }

  const handleSave = async () => {
    if (!clientId.trim()) return
    setSaving(true)
    try {
      const data: CloudProvider = provider
        ? { ...provider, clientId: clientId.trim() }
        : {
            id: generateId(),
            name: 'OneDrive',
            type: 'onedrive',
            clientId: clientId.trim(),
            isActive: true,
          }
      await onSave(data)
    } finally {
      setSaving(false)
    }
  }

  const steps = [
    {
      num: 1,
      title: 'Microsoft Entra ID 앱 등록',
      content: (
        <>
          <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
            <li>Azure Portal에 Microsoft 계정으로 로그인합니다.</li>
            <li>"Microsoft Entra ID" (구 Azure AD)로 이동합니다.</li>
            <li>좌측 메뉴에서 "앱 등록"을 클릭합니다.</li>
            <li>"+ 새 등록"을 클릭합니다.</li>
            <li>이름을 입력합니다 (예: DocuMind).</li>
            <li>지원되는 계정 유형: "모든 조직 디렉터리의 계정 및 개인 Microsoft 계정"을 선택합니다.</li>
            <li>리디렉션 URI는 "퍼블릭 클라이언트/네이티브" → <code className="bg-muted px-1 rounded">http://localhost</code> 을 입력합니다.</li>
            <li>"등록"을 클릭합니다.</li>
          </ol>
          <button
            onClick={() => window.open('https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade', '_blank')}
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
          >
            <ExternalLink className="h-3 w-3" />
            Azure 앱 등록 페이지 열기
          </button>
        </>
      ),
    },
    {
      num: 2,
      title: 'API 권한 추가',
      content: (
        <>
          <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
            <li>등록한 앱의 "API 사용 권한" 메뉴로 이동합니다.</li>
            <li>"+ 권한 추가"를 클릭합니다.</li>
            <li>"Microsoft Graph"를 선택합니다.</li>
            <li>"위임된 권한"을 선택합니다.</li>
            <li>다음 권한을 검색하여 추가합니다:</li>
          </ol>
          <div className="mt-1 ml-4 space-y-0.5">
            <p className="text-xs font-mono text-muted-foreground">Files.ReadWrite</p>
            <p className="text-xs font-mono text-muted-foreground">User.Read</p>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">"권한 추가"를 클릭하여 저장합니다.</p>
        </>
      ),
    },
    {
      num: 3,
      title: 'PKCE 설정 확인',
      content: (
        <>
          <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
            <li>"인증" 메뉴로 이동합니다.</li>
            <li>"퍼블릭 클라이언트 흐름 허용"이 "예"로 설정되어 있는지 확인합니다.</li>
            <li>(이 설정이 있어야 Client Secret 없이 PKCE로 인증할 수 있습니다)</li>
          </ol>
          <button
            onClick={() => window.open('https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade', '_blank')}
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
          >
            <ExternalLink className="h-3 w-3" />
            Azure 앱 등록 목록 열기
          </button>
        </>
      ),
    },
    {
      num: 4,
      title: '클라이언트 ID 복사',
      content: (
        <>
          <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
            <li>앱 등록 페이지의 "개요" 탭으로 이동합니다.</li>
            <li>"애플리케이션(클라이언트) ID"를 찾습니다.</li>
            <li>해당 값을 복사하여 아래에 붙여넣습니다.</li>
            <li>(Client Secret은 필요하지 않습니다 — PKCE 방식 사용)</li>
          </ol>
        </>
      ),
    },
  ]

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 mt-2 space-y-3">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <Cloud className="h-4 w-4" />
        OneDrive 연결 설정
      </h4>

      {/* 단계별 가이드 (아코디언) */}
      <div className="space-y-1">
        {steps.map((step) => (
          <div key={step.num} className="rounded-md border border-border overflow-hidden">
            <button
              onClick={() => toggleStep(step.num)}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-accent/50 cursor-pointer"
            >
              {expandedStep === step.num ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
              <span className="flex items-center justify-center h-4 w-4 rounded-full bg-primary/20 text-[10px] text-primary font-bold">
                {step.num}
              </span>
              {step.title}
            </button>
            {expandedStep === step.num && (
              <div className="px-3 pb-3 pt-1 border-t border-border/50">
                {step.content}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Client ID 입력 */}
      <div className="border-t border-border pt-3 space-y-2">
        <label className="text-xs font-medium">애플리케이션(클라이언트) ID</label>
        <Input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          위 Step 4에서 복사한 애플리케이션 ID를 붙여넣으세요. Client Secret은 필요하지 않습니다.
        </p>
      </div>

      {/* 버튼 */}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>
          취소
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!clientId.trim() || saving}>
          {saving ? '저장 중...' : '저장'}
        </Button>
      </div>

      {/* 저장 후 안내 */}
      {provider?.clientId && (
        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-1">다음 단계</p>
          <p>Client ID 저장 후, Microsoft 계정 연결 기능은 다음 업데이트에서 제공됩니다.</p>
          <p>연결이 완료되면 OneDrive 파일을 가져오거나 웹에서 편집할 수 있습니다.</p>
        </div>
      )}
    </div>
  )
}

function AIUsageSection() {
  const [usage, setUsage] = useState<{ provider: string; model: string; inputTokens: number; outputTokens: number; timestamp: Date; feature: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllAIUsage().then(data => {
      setUsage(data)
      setLoading(false)
    })
  }, [])

  const currentMonth = useMemo(() => {
    const now = new Date()
    return usage.filter(u => {
      const d = new Date(u.timestamp)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
  }, [usage])

  const totalTokens = currentMonth.reduce((sum, u) => sum + u.inputTokens + u.outputTokens, 0)

  const byProvider = useMemo(() => {
    const map: Record<string, number> = {}
    currentMonth.forEach(u => {
      map[u.provider] = (map[u.provider] || 0) + u.inputTokens + u.outputTokens
    })
    return Object.entries(map)
  }, [currentMonth])

  const byFeature = useMemo(() => {
    const map: Record<string, number> = {}
    currentMonth.forEach(u => {
      map[u.feature] = (map[u.feature] || 0) + u.inputTokens + u.outputTokens
    })
    return Object.entries(map)
  }, [currentMonth])

  if (loading) return <p className="text-sm text-muted-foreground">로딩 중...</p>

  const featureLabels: Record<string, string> = {
    chat: '채팅', generate: '문서 생성', analyze: '분석', summarize: '요약', rewrite: 'AI 수정',
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">이번 달 AI 사용량</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">총 토큰</p>
          <p className="text-xl font-bold">{totalTokens.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">요청 수</p>
          <p className="text-xl font-bold">{currentMonth.length}</p>
        </div>
      </div>

      {byProvider.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">제공자별</h4>
          {byProvider.map(([provider, tokens]) => (
            <div key={provider} className="flex items-center justify-between text-sm py-1">
              <span className="capitalize">{provider}</span>
              <span className="text-muted-foreground">{tokens.toLocaleString()} tokens</span>
            </div>
          ))}
        </div>
      )}

      {byFeature.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">기능별</h4>
          {byFeature.map(([feature, tokens]) => (
            <div key={feature} className="flex items-center justify-between text-sm py-1">
              <span>{featureLabels[feature] || feature}</span>
              <span className="text-muted-foreground">{tokens.toLocaleString()} tokens</span>
            </div>
          ))}
        </div>
      )}

      {currentMonth.length === 0 && (
        <p className="text-sm text-muted-foreground">이번 달 사용 기록이 없습니다.</p>
      )}
    </div>
  )
}

function AIBehaviorSettings() {
  const { settings, saveSettings } = useAppStore()
  const behavior = settings?.aiBehavior || DEFAULT_AI_BEHAVIOR
  const [customText, setCustomText] = useState(behavior.customInstructions)
  const isFocusedRef = useRef(false)

  // 외부에서 변경된 경우에만 동기화 (포커스 중이면 무시)
  useEffect(() => {
    if (!isFocusedRef.current) {
      setCustomText(behavior.customInstructions)
    }
  }, [behavior.customInstructions])

  const update = (patch: Partial<AIBehavior>) => {
    saveSettings({ aiBehavior: { ...behavior, ...patch } })
  }

  const saveCustomInstructions = () => {
    if (customText !== behavior.customInstructions) {
      update({ customInstructions: customText })
    }
  }

  const toneOptions = [
    { value: 'formal' as const, label: '격식체', desc: '~습니다, ~입니다' },
    { value: 'casual' as const, label: '편한 톤', desc: '~해요, ~이에요' },
    { value: 'concise' as const, label: '간결체', desc: '핵심만 짧게' },
  ]

  const detailOptions = [
    { value: 'brief' as const, label: '간략', desc: '핵심만 요약' },
    { value: 'moderate' as const, label: '보통', desc: '적절한 분량' },
    { value: 'detailed' as const, label: '상세', desc: '자세한 설명 포함' },
  ]

  const styleOptions = [
    { value: 'professional' as const, label: '비즈니스', desc: '업무용 전문 문체' },
    { value: 'friendly' as const, label: '친근한', desc: '부드럽고 읽기 쉬운 문체' },
    { value: 'academic' as const, label: '학술적', desc: '논문/연구 스타일' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="font-medium">AI 동작 설정</h3>
        <p className="text-sm text-muted-foreground">AI가 문서를 작성하고 응답하는 방식을 조정합니다.</p>
      </div>

      {/* 응답 톤 */}
      <div>
        <h4 className="mb-2 text-sm font-medium">응답 톤</h4>
        <div className="flex gap-2">
          {toneOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update({ tone: opt.value })}
              className={`flex-1 rounded-lg border-2 p-3 text-left cursor-pointer transition-colors ${
                behavior.tone === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40'
              }`}
            >
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 상세도 */}
      <div>
        <h4 className="mb-2 text-sm font-medium">문서 상세도</h4>
        <div className="flex gap-2">
          {detailOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update({ detailLevel: opt.value })}
              className={`flex-1 rounded-lg border-2 p-3 text-left cursor-pointer transition-colors ${
                behavior.detailLevel === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40'
              }`}
            >
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 문체 */}
      <div>
        <h4 className="mb-2 text-sm font-medium">문서 스타일</h4>
        <div className="flex gap-2">
          {styleOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update({ writingStyle: opt.value })}
              className={`flex-1 rounded-lg border-2 p-3 text-left cursor-pointer transition-colors ${
                behavior.writingStyle === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40'
              }`}
            >
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 커스텀 지시사항 */}
      <div>
        <h4 className="mb-1 text-sm font-medium">커스텀 지시사항</h4>
        <p className="mb-2 text-xs text-muted-foreground">
          AI에게 항상 적용할 추가 지시사항을 자유롭게 입력하세요.
        </p>
        <textarea
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onFocus={() => { isFocusedRef.current = true }}
          onBlur={() => { isFocusedRef.current = false; saveCustomInstructions() }}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-y"
          placeholder="예: 항상 불릿 포인트를 사용해줘, 영어 전문용어는 한글 병기해줘, 표를 적극 활용해줘"
        />
      </div>

      {/* 초기화 버튼 */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => saveSettings({ aiBehavior: DEFAULT_AI_BEHAVIOR })}
        >
          기본값으로 초기화
        </Button>
      </div>
    </div>
  )
}

function AppearanceSettings() {
  const { settings, saveSettings } = useAppStore()

  return (
    <div>
      <h3 className="mb-1 font-medium">테마</h3>
      <p className="mb-3 text-sm text-muted-foreground">앱의 외관을 선택합니다.</p>
      <div className="flex gap-3">
        {(['light', 'dark', 'system'] as const).map((theme) => (
          <button
            key={theme}
            onClick={() => saveSettings({ theme })}
            className={`rounded-lg border-2 px-6 py-3 text-sm cursor-pointer ${
              settings?.theme === theme
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            {theme === 'light' ? '라이트' : theme === 'dark' ? '다크' : '시스템'}
          </button>
        ))}
      </div>
    </div>
  )
}
