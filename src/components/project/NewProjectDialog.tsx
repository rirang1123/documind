import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/stores/useAppStore'
import { generateId } from '@/utils/id'
import { createProjectFolder } from '@/services/document/exportService'
import type { Project } from '@/types'

const PROJECT_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#be185d', '#4f46e5']

interface Props {
  open: boolean
  onClose: () => void
}

export function NewProjectDialog({ open, onClose }: Props) {
  const { addProject } = useAppStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PROJECT_COLORS[0])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) return

    setCreating(true)
    setError('')

    try {
      // Create actual folder on disk
      const projectPath = await createProjectFolder(name.trim())

      const project: Project = {
        id: generateId(),
        name: name.trim(),
        description: description.trim(),
        path: projectPath,
        createdAt: new Date(),
        updatedAt: new Date(),
        color,
        icon: '📁',
      }

      await addProject(project)
      setName('')
      setDescription('')
      setColor(PROJECT_COLORS[0])
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`프로젝트 생성 실패: ${msg}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="새 프로젝트">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">프로젝트 이름</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="프로젝트 이름을 입력하세요"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">설명 (선택)</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="프로젝트에 대한 간단한 설명"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">색상</label>
          <div className="flex gap-2">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full transition-transform cursor-pointer ${
                  color === c ? 'scale-125 ring-2 ring-primary ring-offset-2' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Show the path that will be created */}
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            프로젝트 폴더가 DocuMind 저장소 내에 생성됩니다.
          </span>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || creating}>
            {creating ? '생성 중...' : '생성'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
