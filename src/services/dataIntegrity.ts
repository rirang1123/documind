/**
 * 데이터 무결성 검증 서비스
 * 앱 시작 시 IndexedDB의 프로젝트/파일 경로가 디스크에 실제 존재하는지 검증하고,
 * 경로가 변경되었으면 자동으로 복구한다.
 */
import { db, getSettings } from '@/services/db'
import { exists, mkdir, readDir } from '@tauri-apps/plugin-fs'
import { documentDir, join } from '@tauri-apps/api/path'

/** 저장소 기본 경로를 반환 (설정 > 기본값: Documents/DocuMind) */
async function getBaseDir(): Promise<string> {
  const settings = await getSettings()
  if (settings.storagePath && settings.storagePath.trim()) {
    return settings.storagePath.trim()
  }
  const docDir = await documentDir()
  return await join(docDir, 'DocuMind')
}

/**
 * 앱 시작 시 호출: 프로젝트 경로 유효성 검증 및 자동 복구
 *
 * 1. 각 프로젝트의 path가 디스크에 존재하는지 확인
 * 2. 존재하지 않으면 현재 저장소 경로 기준으로 재매핑 시도
 * 3. 재매핑도 실패하면 새로 폴더 생성
 */
export async function validateAndRepairProjectPaths(): Promise<void> {
  const projects = await db.projects.toArray()
  if (projects.length === 0) return

  const baseDir = await getBaseDir()

  for (const project of projects) {
    if (!project.path) continue

    try {
      const pathExists = await exists(project.path)
      if (pathExists) continue // 경로가 유효하면 스킵

      // 경로가 없음 → 현재 baseDir 기준으로 같은 이름의 폴더 탐색
      const safeName = project.name.replace(/[<>:"/\\|?*]/g, '_').trim()
      const newPath = await join(baseDir, safeName)
      const newPathExists = await exists(newPath)

      if (newPathExists) {
        // 기존 폴더가 baseDir 아래에 있음 → 경로 업데이트
        await db.projects.update(project.id, { path: newPath, updatedAt: new Date() })
        console.log(`[dataIntegrity] 프로젝트 "${project.name}" 경로 복구: ${newPath}`)
      } else {
        // 폴더도 없음 → 새로 생성
        await mkdir(newPath, { recursive: true })
        await db.projects.update(project.id, { path: newPath, updatedAt: new Date() })
        console.log(`[dataIntegrity] 프로젝트 "${project.name}" 폴더 재생성: ${newPath}`)
      }

      // 해당 프로젝트의 파일 경로도 업데이트
      await repairFilePathsForProject(project.id, project.path, newPath)
    } catch (e) {
      console.warn(`[dataIntegrity] 프로젝트 "${project.name}" 경로 검증 실패:`, e)
    }
  }
}

/** 프로젝트의 파일들의 경로를 새 프로젝트 경로에 맞게 업데이트 */
async function repairFilePathsForProject(projectId: string, oldBasePath: string, newBasePath: string): Promise<void> {
  const files = await db.files.where('projectId').equals(projectId).toArray()

  for (const file of files) {
    if (!file.path || !file.path.startsWith(oldBasePath)) continue

    try {
      const relativePath = file.path.slice(oldBasePath.length)
      const newFilePath = newBasePath + relativePath
      await db.files.update(file.id, { path: newFilePath, updatedAt: new Date() })
    } catch (e) {
      console.warn(`[dataIntegrity] 파일 "${file.name}" 경로 복구 실패:`, e)
    }
  }
}

/**
 * 디스크의 기존 DocuMind 폴더를 스캔하여
 * IndexedDB에 없는 프로젝트 폴더를 발견하면 반환
 */
export async function discoverOrphanedFolders(): Promise<string[]> {
  try {
    const baseDir = await getBaseDir()
    const baseDirExists = await exists(baseDir)
    if (!baseDirExists) return []

    const entries = await readDir(baseDir)
    const projects = await db.projects.toArray()
    const knownPaths = new Set(projects.map((p) => p.path))

    const orphaned: string[] = []
    for (const entry of entries) {
      if (!entry.isDirectory) continue
      const fullPath = await join(baseDir, entry.name)
      if (!knownPaths.has(fullPath)) {
        orphaned.push(entry.name)
      }
    }

    return orphaned
  } catch (e) {
    console.warn('[dataIntegrity] 고아 폴더 탐색 실패:', e)
    return []
  }
}
