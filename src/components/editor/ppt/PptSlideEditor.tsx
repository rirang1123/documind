import { useState } from 'react'
import {
  Presentation,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Loader2,
  ArrowLeft,
  Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/stores/useAppStore'
import { buildPptx, type SlideData } from '@/services/document/pptService'
import { generateId } from '@/utils/id'
import { ExportLocationDialog } from '@/components/editor/ExportLocationDialog'

interface SlideWithId extends SlideData {
  _id: string
}
import {
  refineSlideContent,
  suggestStructure,
  suggestAdditionalSlides,
} from '@/services/document/pptAIService'

const mkSlide = (data: SlideData): SlideWithId => ({ ...data, _id: generateId() })

export function PptSlideEditor() {
  const { settings, setActiveView } = useAppStore()
  const [slides, setSlides] = useState<SlideWithId[]>([
    mkSlide({ title: '프레젠테이션 제목', bullets: ['부제목을 입력하세요'], layout: 'title' }),
    mkSlide({ title: '슬라이드 1', bullets: ['항목 1', '항목 2', '항목 3'], layout: 'content' }),
  ])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [fileName, setFileName] = useState('presentation')
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [showLocationPicker, setShowLocationPicker] = useState(false)

  const activeProvider = settings?.aiProviders.find(
    (p) => p.id === settings.activeProviderId
  )

  const selected = slides[selectedIdx]

  const updateSlide = (idx: number, patch: Partial<SlideData>) => {
    setSlides((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  const addSlide = () => {
    const newSlides = [...slides]
    newSlides.splice(selectedIdx + 1, 0, mkSlide({ title: '새 슬라이드', bullets: ['내용을 입력하세요'], layout: 'content' }))
    setSlides(newSlides)
    setSelectedIdx(selectedIdx + 1)
  }

  const removeSlide = (idx: number) => {
    if (slides.length <= 1) return
    const newSlides = slides.filter((_, i) => i !== idx)
    setSlides(newSlides)
    if (selectedIdx >= newSlides.length) setSelectedIdx(newSlides.length - 1)
    else if (selectedIdx === idx) setSelectedIdx(Math.max(0, idx - 1))
  }

  const moveSlide = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= slides.length) return
    const newSlides = [...slides]
    ;[newSlides[idx], newSlides[target]] = [newSlides[target], newSlides[idx]]
    setSlides(newSlides)
    setSelectedIdx(target)
  }

  const handleAI = async (action: 'refine' | 'structure' | 'suggest') => {
    if (!activeProvider) {
      setError('AI 제공자가 설정되지 않았습니다.')
      return
    }
    setAiLoading(action)
    setError('')
    try {
      if (action === 'refine') {
        const refined = await refineSlideContent(activeProvider, selected)
        updateSlide(selectedIdx, refined)
      } else if (action === 'structure') {
        const improved = await suggestStructure(activeProvider, slides)
        setSlides(improved.map((s) => mkSlide(s)))
        setSelectedIdx(0)
      } else {
        const additional = await suggestAdditionalSlides(activeProvider, slides)
        if (additional.length > 0) {
          setSlides([...slides, ...additional.map((s) => mkSlide(s))])
        }
      }
    } catch (err) {
      setError((err as Error).message || 'AI 처리 중 오류')
    } finally {
      setAiLoading(null)
    }
  }

  const handleBuild = () => {
    setShowLocationPicker(true)
  }

  const handleLocationSelect = async (targetDir: string) => {
    setShowLocationPicker(false)
    try {
      await buildPptx(slides, fileName, targetDir)
    } catch (err) {
      setError((err as Error).message || 'PPT 생성 실패')
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 bg-muted/20">
        <Button variant="ghost" size="sm" onClick={() => setActiveView('editor')}>
          <ArrowLeft className="mr-1 h-3 w-3" />
          뒤로
        </Button>
        <Presentation className="h-4 w-4 text-orange-500" />
        <span className="text-sm font-medium">PPT 슬라이드 에디터</span>
        <div className="ml-auto flex items-center gap-2">
          <Input
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            className="h-7 w-40 text-xs"
            placeholder="파일 이름"
          />
          <Button size="sm" onClick={handleBuild}>
            <Download className="mr-1 h-3 w-3" />
            PPT 생성
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Slide list */}
        <div className="w-56 flex-shrink-0 border-r border-border bg-muted/10 flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground">슬라이드 ({slides.length})</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={addSlide}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {slides.map((slide, idx) => (
              <div
                key={slide._id}
                onClick={() => setSelectedIdx(idx)}
                className={`group flex items-center gap-2 rounded-md px-2 py-2 text-xs cursor-pointer transition-colors ${
                  idx === selectedIdx
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'hover:bg-accent border border-transparent'
                }`}
              >
                <span className="text-[10px] text-muted-foreground w-4 shrink-0">{idx + 1}</span>
                <span className="truncate flex-1">{slide.title}</span>
                <div className="hidden group-hover:flex items-center gap-0.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); moveSlide(idx, -1) }}
                    className="p-0.5 hover:bg-accent rounded cursor-pointer"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); moveSlide(idx, 1) }}
                    className="p-0.5 hover:bg-accent rounded cursor-pointer"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSlide(idx) }}
                    className="p-0.5 hover:bg-destructive/10 rounded text-destructive cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Slide editor */}
        <div className="flex-1 overflow-y-auto p-6">
          {selected && (
            <div className="mx-auto max-w-[700px] space-y-4">
              {/* Layout selector */}
              <div className="flex gap-2">
                {(['title', 'content', 'section'] as const).map((layout) => (
                  <button
                    key={layout}
                    onClick={() => updateSlide(selectedIdx, { layout })}
                    className={`rounded-md px-3 py-1 text-xs transition-colors cursor-pointer ${
                      selected.layout === layout
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {layout === 'title' ? '제목' : layout === 'section' ? '섹션' : '내용'}
                  </button>
                ))}
              </div>

              {/* Title */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">슬라이드 제목</label>
                <Input
                  value={selected.title}
                  onChange={(e) => updateSlide(selectedIdx, { title: e.target.value })}
                  className="text-lg font-semibold"
                />
              </div>

              {/* Bullets */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">내용 항목</label>
                <div className="space-y-2">
                  {(selected.bullets || []).map((bullet, bIdx) => (
                    <div key={bIdx} className="flex gap-2">
                      <span className="text-xs text-muted-foreground mt-2.5 w-4">{bIdx + 1}.</span>
                      <Input
                        value={bullet}
                        onChange={(e) => {
                          const newBullets = [...(selected.bullets || [])]
                          newBullets[bIdx] = e.target.value
                          updateSlide(selectedIdx, { bullets: newBullets })
                        }}
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => {
                          const newBullets = (selected.bullets || []).filter((_, i) => i !== bIdx)
                          updateSlide(selectedIdx, { bullets: newBullets })
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      updateSlide(selectedIdx, {
                        bullets: [...(selected.bullets || []), ''],
                      })
                    }}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    항목 추가
                  </Button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">발표자 노트</label>
                <textarea
                  value={selected.notes || ''}
                  onChange={(e) => updateSlide(selectedIdx, { notes: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
                  placeholder="발표 시 참고할 노트..."
                />
              </div>

              {/* AI Buttons */}
              <div className="border-t border-border pt-4">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">AI 도우미</label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!aiLoading || !activeProvider}
                    onClick={() => handleAI('refine')}
                  >
                    {aiLoading === 'refine' ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1 h-3 w-3" />
                    )}
                    내용 다듬기
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!aiLoading || !activeProvider}
                    onClick={() => handleAI('structure')}
                  >
                    {aiLoading === 'structure' ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1 h-3 w-3" />
                    )}
                    구성 추천
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!aiLoading || !activeProvider}
                    onClick={() => handleAI('suggest')}
                  >
                    {aiLoading === 'suggest' ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1 h-3 w-3" />
                    )}
                    슬라이드 추가 제안
                  </Button>
                </div>
                {!activeProvider && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    AI 기능을 사용하려면 설정에서 AI 제공자를 등록하세요.
                  </p>
                )}
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showLocationPicker && (
        <ExportLocationDialog
          fileName={`${fileName}.pptx`}
          onSelect={handleLocationSelect}
          onClose={() => setShowLocationPicker(false)}
        />
      )}
    </div>
  )
}
