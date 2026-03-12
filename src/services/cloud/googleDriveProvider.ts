import { tokenManager } from '@/services/credential/tokenManager'
import type { CloudFile, CloudFileList, StorageQuota } from './cloudProvider'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'

const FILE_FIELDS = 'id, name, mimeType, size, modifiedTime, webViewLink, webContentLink'

// Google Workspace MIME type -> export format mapping
const EXPORT_MIME_MAP: Record<string, { mimeType: string; ext: string }> = {
  'application/vnd.google-apps.document': {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: '.docx',
  },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: '.xlsx',
  },
  'application/vnd.google-apps.presentation': {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ext: '.pptx',
  },
}

function mapToCloudFile(item: any): CloudFile {
  return {
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    size: parseInt(item.size || '0', 10),
    modifiedTime: new Date(item.modifiedTime),
    isFolder: item.mimeType === 'application/vnd.google-apps.folder',
    webViewLink: item.webViewLink,
    webEditLink: item.webViewLink,
  }
}

async function authHeaders(providerId: string): Promise<Record<string, string>> {
  const token = await tokenManager.getAccessToken(providerId)
  return { Authorization: `Bearer ${token}` }
}

export async function listFiles(
  providerId: string,
  folderId?: string,
  pageToken?: string
): Promise<CloudFileList> {
  const headers = await authHeaders(providerId)

  const q = folderId
    ? `'${folderId}' in parents and trashed=false`
    : `'root' in parents and trashed=false`

  const params = new URLSearchParams({
    q,
    fields: `nextPageToken, files(${FILE_FIELDS})`,
    pageSize: '100',
  })
  if (pageToken) {
    params.set('pageToken', pageToken)
  }

  const response = await fetch(`${DRIVE_API}/files?${params.toString()}`, { headers })

  if (!response.ok) {
    throw new Error(`Failed to list files: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  return {
    files: (data.files || []).map(mapToCloudFile),
    nextPageToken: data.nextPageToken,
  }
}

export async function searchFiles(
  providerId: string,
  query: string
): Promise<CloudFileList> {
  const headers = await authHeaders(providerId)

  const q = `fullText contains '${query.replace(/'/g, "\\'")}' and trashed=false`

  const params = new URLSearchParams({
    q,
    fields: `nextPageToken, files(${FILE_FIELDS})`,
    pageSize: '100',
  })

  const response = await fetch(`${DRIVE_API}/files?${params.toString()}`, { headers })

  if (!response.ok) {
    throw new Error(`Failed to search files: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  return {
    files: (data.files || []).map(mapToCloudFile),
    nextPageToken: data.nextPageToken,
  }
}

export async function getFile(providerId: string, fileId: string): Promise<CloudFile> {
  const headers = await authHeaders(providerId)

  const params = new URLSearchParams({
    fields: FILE_FIELDS,
  })

  const response = await fetch(`${DRIVE_API}/files/${fileId}?${params.toString()}`, { headers })

  if (!response.ok) {
    throw new Error(`Failed to get file: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return mapToCloudFile(data)
}

export async function downloadFile(
  providerId: string,
  fileId: string,
  mimeType: string
): Promise<ArrayBuffer> {
  const headers = await authHeaders(providerId)

  let url: string

  if (isGoogleWorkspaceFile(mimeType)) {
    const exportInfo = getExportInfo(mimeType)
    if (!exportInfo) {
      throw new Error(`Unsupported Google Workspace MIME type for export: ${mimeType}`)
    }
    const params = new URLSearchParams({ mimeType: exportInfo.mimeType })
    url = `${DRIVE_API}/files/${fileId}/export?${params.toString()}`
  } else {
    url = `${DRIVE_API}/files/${fileId}?alt=media`
  }

  const response = await fetch(url, { headers })

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`)
  }

  return response.arrayBuffer()
}

export async function uploadFile(
  providerId: string,
  name: string,
  data: ArrayBuffer,
  folderId?: string,
  mimeType?: string
): Promise<CloudFile> {
  const headers = await authHeaders(providerId)

  const metadata: Record<string, any> = { name }
  if (folderId) {
    metadata.parents = [folderId]
  }
  if (mimeType) {
    metadata.mimeType = mimeType
  }

  const boundary = '---documind_upload_boundary'
  const metadataJson = JSON.stringify(metadata)

  const encoder = new TextEncoder()
  const metaPart = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataJson}\r\n`
  )
  const dataPreamble = encoder.encode(
    `--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`
  )
  const closing = encoder.encode(`\r\n--${boundary}--`)

  const body = new Uint8Array(metaPart.byteLength + dataPreamble.byteLength + data.byteLength + closing.byteLength)
  body.set(metaPart, 0)
  body.set(dataPreamble, metaPart.byteLength)
  body.set(new Uint8Array(data), metaPart.byteLength + dataPreamble.byteLength)
  body.set(closing, metaPart.byteLength + dataPreamble.byteLength + data.byteLength)

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=' +
      encodeURIComponent(FILE_FIELDS),
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: body.buffer,
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to upload file: ${response.status} ${response.statusText}`)
  }

  const result = await response.json()
  return mapToCloudFile(result)
}

export async function createFolder(
  providerId: string,
  name: string,
  parentId?: string
): Promise<CloudFile> {
  const headers = await authHeaders(providerId)

  const metadata: Record<string, any> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  }
  if (parentId) {
    metadata.parents = [parentId]
  }

  const params = new URLSearchParams({ fields: FILE_FIELDS })

  const response = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  })

  if (!response.ok) {
    throw new Error(`Failed to create folder: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return mapToCloudFile(data)
}

export async function getStorageQuota(providerId: string): Promise<StorageQuota> {
  const headers = await authHeaders(providerId)

  const params = new URLSearchParams({
    fields: 'storageQuota',
  })

  const response = await fetch(`${DRIVE_API}/about?${params.toString()}`, { headers })

  if (!response.ok) {
    throw new Error(`Failed to get storage quota: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const quota = data.storageQuota

  return {
    used: parseInt(quota.usage || '0', 10),
    total: parseInt(quota.limit || '0', 10),
  }
}

export async function listAllFilesInFolder(
  providerId: string,
  folderId: string
): Promise<{ file: CloudFile; relativePath: string }[]> {
  const results: { file: CloudFile; relativePath: string }[] = []

  async function traverse(currentFolderId: string, currentPath: string): Promise<void> {
    let pageToken: string | undefined

    do {
      const listing = await listFiles(providerId, currentFolderId, pageToken)

      for (const file of listing.files) {
        if (file.isFolder) {
          const subPath = currentPath ? `${currentPath}/${file.name}` : file.name
          await traverse(file.id, subPath)
        } else {
          results.push({
            file,
            relativePath: currentPath ? `${currentPath}/${file.name}` : file.name,
          })
        }
      }

      pageToken = listing.nextPageToken
    } while (pageToken)
  }

  await traverse(folderId, '')

  return results
}

export function isGoogleWorkspaceFile(mimeType: string): boolean {
  return mimeType in EXPORT_MIME_MAP
}

export function getExportInfo(mimeType: string): { mimeType: string; ext: string } | null {
  return EXPORT_MIME_MAP[mimeType] || null
}
