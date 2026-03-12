import { useState, useEffect } from 'react'
import { FileText, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BUILTIN_TEMPLATES } from '@/services/document/builtinTemplates'
import { getTemplates, addTemplate, deleteTemplate } from '@/services/db'
import type { Template } from '@/services/db'
import { generateId } from '@/utils/id'

interface Props {
  onSelect: (content: string, name: string) => void
  currentContent?: string
  onClose: () => void
}

export default function TemplateManager({ onSelect, currentContent, onClose }: Props) {
  const [userTemplates, setUserTemplates] = useState<Template[]>([])
  const [showSave, setShowSave] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveCategory, setSaveCategory] = useState('사용자')

  useEffect(() => {
    getTemplates().then(setUserTemplates)
  }, [])

  const handleSaveAsTemplate = async () => {
    if (!saveName.trim() || !currentContent) return
    const tpl: Template = {
      id: generateId(),
      name: saveName.trim(),
      category: saveCategory.trim() || '사용자',
      content: currentContent,
      createdAt: new Date(),
    }
    await addTemplate(tpl)
    setUserTemplates(await getTemplates())
    setShowSave(false)
    setSaveName('')
  }

  const handleDelete = async (id: string) => {
    await deleteTemplate(id)
    setUserTemplates(await getTemplates())
  }

  const allTemplates = [
    ...BUILTIN_TEMPLATES.map(t => ({ ...t, isBuiltin: true, createdAt: new Date() })),
    ...userTemplates.map(t => ({ ...t, isBuiltin: false })),
  ]

  const categories = [...new Set(allTemplates.map(t => t.category))]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl max-h-[80vh] rounded-lg border border-border bg-background shadow-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            문서 템플릿
          </h2>
          <div className="flex gap-2">
            {currentContent && (
              <Button size="sm" variant="outline" onClick={() => setShowSave(true)}>
                <Plus className="mr-1 h-3 w-3" />
                현재 문서를 템플릿으로 저장
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Save form */}
        {showSave && (
          <div className="border-b border-border px-4 py-3 bg-muted/20">
            <div className="flex gap-2">
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="템플릿 이름"
                className="flex-1"
              />
              <Input
                value={saveCategory}
                onChange={(e) => setSaveCategory(e.target.value)}
                placeholder="카테고리"
                className="w-32"
              />
              <Button onClick={handleSaveAsTemplate} disabled={!saveName.trim()}>저장</Button>
              <Button variant="ghost" onClick={() => setShowSave(false)}>취소</Button>
            </div>
          </div>
        )}

        {/* Template List */}
        <div className="flex-1 overflow-auto p-4">
          {categories.map(category => (
            <div key={category} className="mb-4">
              <h3 className="text-xs font-medium text-muted-foreground uppercase mb-2">{category}</h3>
              <div className="grid grid-cols-2 gap-2">
                {allTemplates
                  .filter(t => t.category === category)
                  .map(tpl => (
                    <div
                      key={tpl.id}
                      className="flex items-center gap-2 rounded-lg border border-border p-3 hover:bg-accent transition-colors"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{tpl.name}</p>
                        {!tpl.isBuiltin && (
                          <p className="text-xs text-muted-foreground">사용자 템플릿</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => onSelect(tpl.content, tpl.name)}
                        >
                          사용
                        </Button>
                        {!tpl.isBuiltin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive"
                            onClick={() => handleDelete(tpl.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
