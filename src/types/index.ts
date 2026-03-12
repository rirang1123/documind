export interface Project {
  id: string
  name: string
  description: string
  path: string
  createdAt: Date
  updatedAt: Date
  color: string
  icon: string
}

export interface DocumentFile {
  id: string
  name: string
  path: string
  projectId: string
  folderId: string | null
  type: FileType
  size: number
  tags: string[]
  aiCategory: string | null
  createdAt: Date
  updatedAt: Date
  content?: string
  blobData?: ArrayBuffer
  cloudFileId?: string
}

export interface Folder {
  id: string
  name: string
  projectId: string
  parentId: string | null
  category: FolderCategory | null
  createdAt: Date
}

export type FileType = 'docx' | 'xlsx' | 'pptx' | 'hwp' | 'pdf' | 'txt' | 'md' | 'unknown'

export type FolderCategory =
  | 'planning'    // 기획
  | 'evaluation'  // 평가
  | 'report'      // 보고
  | 'reference'   // 참고
  | 'meeting'     // 회의
  | 'contract'    // 계약
  | 'finance'     // 재무
  | 'other'       // 기타

export const FOLDER_CATEGORY_LABELS: Record<FolderCategory, string> = {
  planning: '기획',
  evaluation: '평가',
  report: '보고',
  reference: '참고자료',
  meeting: '회의',
  contract: '계약',
  finance: '재무',
  other: '기타',
}

export interface Draft {
  id: string
  title: string
  content: string
  createdAt: Date
  updatedAt: Date
}

export interface AIProvider {
  id: string
  name: string
  type: 'openai' | 'anthropic' | 'google'
  // apiKey는 OS Keychain에 저장 (v0.4.0~)
  model: string
  isActive: boolean
}

export interface CloudProvider {
  id: string
  name: string
  type: 'google-drive' | 'onedrive'
  clientId: string
  email?: string
  tokenExpiry?: Date
  isActive: boolean
  connectedAt?: Date
}

export interface AIBehavior {
  tone: 'formal' | 'casual' | 'concise'
  detailLevel: 'brief' | 'moderate' | 'detailed'
  writingStyle: 'professional' | 'friendly' | 'academic'
  customInstructions: string
}

export const DEFAULT_AI_BEHAVIOR: AIBehavior = {
  tone: 'formal',
  detailLevel: 'moderate',
  writingStyle: 'professional',
  customInstructions: '',
}

export interface AppSettings {
  storagePath: string
  theme: 'light' | 'dark' | 'system'
  language: 'ko' | 'en'
  aiProviders: AIProvider[]
  activeProviderId: string | null
  cloudProviders: CloudProvider[]
  activeCloudProviderId: string | null
  aiBehavior: AIBehavior
}

/**
 * 사용자 피드백으로 학습된 분류 규칙
 *
 * 두 가지 학습 유형을 하나의 타입으로 통합:
 *
 * type='correction' — 오분류 교정 규칙
 *   카테고리 폴더 간 이동 시 생성. fromCategory→toCategory 매핑.
 *   예: 보고→기획 오분류 교정 → 키워드 "리스크 분석"이면 report로 분류
 *
 * type='folder-pattern' — 커스텀 폴더 패턴 규칙
 *   사용자 커스텀 폴더로 이동 시 생성. folderId 직접 매핑.
 *   예: "2024년 월간보고" 폴더 → titlePatterns: ["월간", "2024"]
 */
export interface LearnedRule {
  id: string
  type: 'correction' | 'folder-pattern'
  // ── 오분류 교정 (type='correction') ──
  fromCategory: FolderCategory | null  // 원래 분류된 카테고리
  toCategory: FolderCategory | null    // 사용자가 교정한 카테고리
  // ── 커스텀 폴더 패턴 (type='folder-pattern') ──
  folderId: string | null       // 매칭 시 이 폴더로 분류
  folderName: string | null     // 폴더 표시명
  projectId: string | null      // 소속 프로젝트
  // ── 공통 매칭 기준 ──
  titlePatterns: string[]       // 파일명에서 매칭할 패턴
  keywords: string[]            // 본문 내용에서 매칭할 키워드
  weight: number                // 매칭 가중치 (기본 8)
  // ── 학습 맥락 (모델 독립 — AI 교체 시에도 재학습 가능) ──
  reason: string                // AI가 분석한 패턴/오분류 설명
  sampleTitles: string[]        // 해당 폴더의 파일명 샘플 (최대 5개)
  sourceTitle: string           // 학습 트리거 문서 제목
  sourceContentSnippet: string  // 학습 트리거 문서 내용 발췌 (500자)
  analysisPrompt: string        // AI에게 보낸 분석 프롬프트
  analysisResponse: string      // AI 원본 응답
  // ── 통계 ──
  hitCount: number
  createdAt: Date
}

export interface TreeNode {
  id: string
  name: string
  type: 'project' | 'folder' | 'file'
  children?: TreeNode[]
  data?: Project | Folder | DocumentFile
  isExpanded?: boolean
}
