import Dexie, { type EntityTable } from 'dexie'
import type { Project, DocumentFile, Folder, AppSettings, Draft, LearnedRule } from '@/types'
import { DEFAULT_AI_BEHAVIOR } from '@/types'

export interface AIUsageRecord {
  id: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  timestamp: Date
  feature: string // 'chat' | 'generate' | 'analyze' | 'summarize' | 'rewrite'
}

export interface Template {
  id: string
  name: string
  category: string
  content: string
  createdAt: Date
}

class AppDatabase extends Dexie {
  projects!: EntityTable<Project, 'id'>
  files!: EntityTable<DocumentFile, 'id'>
  folders!: EntityTable<Folder, 'id'>
  settings!: EntityTable<AppSettings & { id: string }, 'id'>
  drafts!: EntityTable<Draft, 'id'>
  aiUsage!: EntityTable<AIUsageRecord, 'id'>
  templates!: EntityTable<Template, 'id'>
  learnedRules!: EntityTable<LearnedRule, 'id'>

  constructor() {
    super('DocManagerDB')
    this.version(1).stores({
      projects: 'id, name, createdAt',
      files: 'id, name, projectId, folderId, type, *tags, createdAt',
      folders: 'id, name, projectId, parentId',
      settings: 'id',
    })
    this.version(2).stores({
      projects: 'id, name, createdAt',
      files: 'id, name, projectId, folderId, type, *tags, createdAt',
      folders: 'id, name, projectId, parentId',
      settings: 'id',
      drafts: 'id, title, updatedAt',
    })
    this.version(3).stores({
      projects: 'id, name, createdAt',
      files: 'id, name, projectId, folderId, type, *tags, createdAt',
      folders: 'id, name, projectId, parentId',
      settings: 'id',
      drafts: 'id, title, updatedAt',
    })
    this.version(4).stores({
      projects: 'id, name, createdAt',
      files: 'id, name, projectId, folderId, type, *tags, createdAt',
      folders: 'id, name, projectId, parentId',
      settings: 'id',
      drafts: 'id, title, updatedAt',
      aiUsage: 'id, provider, model, timestamp',
    })
    this.version(5).stores({
      projects: 'id, name, createdAt',
      files: 'id, name, projectId, folderId, type, *tags, createdAt',
      folders: 'id, name, projectId, parentId',
      settings: 'id',
      drafts: 'id, title, updatedAt',
      aiUsage: 'id, provider, model, timestamp',
      templates: 'id, name, category, createdAt',
    })
    // v6: API 키를 Keychain으로 마이그레이션, cloudProviders 추가
    this.version(6).stores({
      projects: 'id, name, createdAt',
      files: 'id, name, projectId, folderId, type, *tags, createdAt',
      folders: 'id, name, projectId, parentId',
      settings: 'id',
      drafts: 'id, title, updatedAt',
      aiUsage: 'id, provider, model, timestamp',
      templates: 'id, name, category, createdAt',
    }).upgrade(async (tx) => {
      const settingsTable = tx.table('settings')
      const settings = await settingsTable.get('app')
      if (settings) {
        // apiKey 마이그레이션은 앱 초기화 시 keychainMigration()에서 처리
        // (Dexie upgrade는 동기적 환경이라 Tauri invoke 불가)
        // 여기서는 cloudProviders 필드 초기화만 수행
        if (!settings.cloudProviders) {
          settings.cloudProviders = []
          settings.activeCloudProviderId = null
          await settingsTable.put(settings)
        }
      }
    })
    // v7: 분류 자가학습 규칙 테이블
    this.version(7).stores({
      projects: 'id, name, createdAt',
      files: 'id, name, projectId, folderId, type, *tags, createdAt',
      folders: 'id, name, projectId, parentId',
      settings: 'id',
      drafts: 'id, title, updatedAt',
      aiUsage: 'id, provider, model, timestamp',
      templates: 'id, name, category, createdAt',
      learnedRules: 'id, type, folderId, projectId, fromCategory, toCategory, *titlePatterns, *keywords, createdAt',
    })
  }
}

export const db = new AppDatabase()

/**
 * 앱 시작 시 호출: 기존 AI API 키를 Keychain으로 마이그레이션
 * (Dexie upgrade 내에서는 Tauri invoke를 사용할 수 없으므로 별도 함수로 분리)
 */
export async function migrateApiKeysToKeychain(): Promise<void> {
  const settings = await db.settings.get('app')
  if (!settings?.aiProviders) return

  // apiKey 필드가 남아있는 provider가 있는지 확인 (v0.3.x 이하 데이터)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawProviders = settings.aiProviders as any[]
  const providersWithKey = rawProviders.filter(
    (p) => p.apiKey && typeof p.apiKey === 'string' && p.apiKey.length > 0
  )

  if (providersWithKey.length === 0) return

  // Keychain에 저장
  const { keychain } = await import('./credential/keychainService')
  for (const provider of providersWithKey) {
    await keychain.setAiApiKey(provider.id, provider.apiKey)
  }

  // DB에서 apiKey 필드 제거
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const cleanedProviders = rawProviders.map(({ apiKey, ...rest }) => rest)

  await db.settings.put({
    ...settings,
    aiProviders: cleanedProviders as unknown as AppSettings['aiProviders'],
  })

  console.log(`[Migration] ${providersWithKey.length}개 AI API 키를 Keychain으로 마이그레이션 완료`)
}

export async function getSettings(): Promise<AppSettings> {
  const settings = await db.settings.get('app')
  if (settings) {
    const { id: _, ...rest } = settings
    return {
      ...rest,
      aiBehavior: rest.aiBehavior || DEFAULT_AI_BEHAVIOR,
      cloudProviders: rest.cloudProviders || [],
      activeCloudProviderId: rest.activeCloudProviderId || null,
    }
  }
  const defaults: AppSettings = {
    storagePath: '',
    theme: 'light',
    language: 'ko',
    aiProviders: [],
    activeProviderId: null,
    cloudProviders: [],
    activeCloudProviderId: null,
    aiBehavior: DEFAULT_AI_BEHAVIOR,
  }
  await db.settings.put({ id: 'app', ...defaults })
  return defaults
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ id: 'app', ...current, ...settings })
}

export async function exportDatabaseToJSON(): Promise<string> {
  const projects = await db.projects.toArray();
  const files = await db.files.toArray();
  const folders = await db.folders.toArray();
  const drafts = await db.drafts.toArray();
  const aiUsage = await db.table('aiUsage').toArray();
  const templates = await db.table('templates').toArray();
  const learnedRules = await db.learnedRules.toArray();
  const rawSettings = await db.settings.toArray();

  // credential 제외: aiProviders에서 apiKey 제거 (v0.3.x 잔류 데이터 대비)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = rawSettings.map((s: any) => {
    const cleaned = { ...s }
    if (cleaned.aiProviders) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      cleaned.aiProviders = cleaned.aiProviders.map(({ apiKey, ...rest }: any) => rest)
    }
    if (cleaned.cloudProviders) {
      cleaned.cloudProviders = cleaned.cloudProviders.map((p: any) => ({
        ...p,
        tokenExpiry: undefined,
      }))
    }
    return cleaned
  })

  const backup = {
    version: 7,
    exportedAt: new Date().toISOString(),
    data: { projects, files, folders, drafts, aiUsage, templates, learnedRules, settings }
  };

  return JSON.stringify(backup, null, 2);
}

export async function recordAIUsage(record: AIUsageRecord): Promise<void> {
  await db.table('aiUsage').put(record)
}

export async function getAIUsageByMonth(year: number, month: number): Promise<AIUsageRecord[]> {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59)
  return await db.table('aiUsage')
    .where('timestamp')
    .between(start, end)
    .toArray()
}

export async function getAllAIUsage(): Promise<AIUsageRecord[]> {
  return await db.table('aiUsage').orderBy('timestamp').reverse().toArray()
}

export async function getTemplates(): Promise<Template[]> {
  return await db.table('templates').orderBy('createdAt').reverse().toArray()
}

export async function addTemplate(template: Template): Promise<void> {
  await db.table('templates').put(template)
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.table('templates').delete(id)
}

// ── Learned Rules CRUD ──

export async function getLearnedRules(): Promise<LearnedRule[]> {
  return await db.learnedRules.orderBy('createdAt').reverse().toArray()
}

export async function addLearnedRule(rule: LearnedRule): Promise<void> {
  await db.learnedRules.put(rule)
}

export async function incrementRuleHitCount(ruleId: string): Promise<void> {
  const rule = await db.learnedRules.get(ruleId)
  if (rule) {
    await db.learnedRules.put({ ...rule, hitCount: rule.hitCount + 1 })
  }
}

export async function deleteLearnedRule(id: string): Promise<void> {
  await db.learnedRules.delete(id)
}

export async function importDatabaseFromJSON(jsonString: string): Promise<void> {
  const backup = JSON.parse(jsonString);

  if (!backup.data) {
    throw new Error('유효하지 않은 백업 파일입니다.');
  }

  const aiUsageTable = db.table('aiUsage')
  const templatesTable = db.table('templates')

  await db.transaction('rw', [db.projects, db.files, db.folders, db.drafts, db.settings, aiUsageTable, templatesTable, db.learnedRules], async () => {
    await db.projects.clear();
    await db.files.clear();
    await db.folders.clear();
    await db.drafts.clear();
    await db.settings.clear();
    await aiUsageTable.clear();
    await templatesTable.clear();
    await db.learnedRules.clear();

    if (backup.data.projects?.length) await db.projects.bulkAdd(backup.data.projects);
    if (backup.data.files?.length) await db.files.bulkAdd(backup.data.files);
    if (backup.data.folders?.length) await db.folders.bulkAdd(backup.data.folders);
    if (backup.data.drafts?.length) await db.drafts.bulkAdd(backup.data.drafts);
    if (backup.data.settings?.length) await db.settings.bulkAdd(backup.data.settings);
    if (backup.data.aiUsage?.length) await aiUsageTable.bulkAdd(backup.data.aiUsage);
    if (backup.data.templates?.length) await templatesTable.bulkAdd(backup.data.templates);
    if (backup.data.learnedRules?.length) await db.learnedRules.bulkAdd(backup.data.learnedRules);
  });
}
