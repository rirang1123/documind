export interface CloudFile {
  id: string
  name: string
  mimeType: string
  size: number
  modifiedTime: Date
  isFolder: boolean
  webViewLink?: string
  webEditLink?: string
}

export interface CloudFileList {
  files: CloudFile[]
  nextPageToken?: string
}

export interface StorageQuota {
  used: number
  total: number
}

export interface CloudStorageProvider {
  // 인증
  authenticate(): Promise<void>
  disconnect(): Promise<void>
  isAuthenticated(): boolean

  // 파일 조회
  listFiles(folderId?: string, pageToken?: string): Promise<CloudFileList>
  searchFiles(query: string): Promise<CloudFileList>
  getFile(fileId: string): Promise<CloudFile>

  // 파일 다운로드
  downloadFile(fileId: string, destPath: string): Promise<void>

  // 파일 업로드
  uploadFile(name: string, localPath: string, folderId?: string): Promise<CloudFile>

  // 메타데이터
  getStorageQuota(): Promise<StorageQuota>

  // 웹 편집 URL
  getWebEditUrl(file: CloudFile): string | null
}
