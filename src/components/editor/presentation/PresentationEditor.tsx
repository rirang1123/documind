import { useState } from 'react'
import { Plus, Trash2, ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

interface Slide {
  id: string
  title: string
  content: string
  notes: string
}

interface Props {
  initialSlides?: Slide[]
  onChange?: (slides: Slide[]) => void
}

function createSlide(index: number): Slide {
  return {
    id: crypto.randomUUID(),
    title: index === 0 ? '제목을 입력하세요' : `슬라이드 ${index + 1}`,
    content: index === 0 ? '부제목' : '내용을 입력하세요',
    notes: '',
  }
}

export function PresentationEditor({ initialSlides, onChange }: Props) {
  const [slides, setSlides] = useState<Slide[]>(initialSlides || [createSlide(0)])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPresenting, setIsPresenting] = useState(false)

  const currentSlide = slides[currentIndex]

  const updateSlide = (field: keyof Slide, value: string) => {
    setSlides((prev) => {
      const updated = [...prev]
      updated[currentIndex] = { ...updated[currentIndex], [field]: value }
      onChange?.(updated)
      return updated
    })
  }

  const addSlide = () => {
    setSlides((prev) => {
      const updated = [...prev, createSlide(prev.length)]
      onChange?.(updated)
      setCurrentIndex(updated.length - 1)
      return updated
    })
  }

  const deleteSlide = () => {
    if (slides.length <= 1) return
    setSlides((prev) => {
      const updated = prev.filter((_, i) => i !== currentIndex)
      onChange?.(updated)
      setCurrentIndex(Math.min(currentIndex, updated.length - 1))
      return updated
    })
  }

  if (isPresenting) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black"
        onClick={() => {
          if (currentIndex < slides.length - 1) {
            setCurrentIndex(currentIndex + 1)
          } else {
            setIsPresenting(false)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setIsPresenting(false)
          if (e.key === 'ArrowRight' && currentIndex < slides.length - 1)
            setCurrentIndex(currentIndex + 1)
          if (e.key === 'ArrowLeft' && currentIndex > 0)
            setCurrentIndex(currentIndex - 1)
        }}
        tabIndex={0}
      >
        <div className="w-full max-w-4xl aspect-video bg-white rounded-lg flex flex-col items-center justify-center p-16">
          <h1 className="text-4xl font-bold mb-4 text-gray-900">{currentSlide.title}</h1>
          <p className="text-xl text-gray-600 whitespace-pre-wrap">{currentSlide.content}</p>
        </div>
        <div className="absolute bottom-4 right-4 text-white/50 text-sm">
          {currentIndex + 1} / {slides.length} (ESC 종료)
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Slide Panel (Left) */}
      <div className="w-48 border-r border-border bg-muted/30 overflow-y-auto p-2 flex flex-col gap-1.5">
        {slides.map((slide, i) => (
          <button
            key={slide.id}
            onClick={() => setCurrentIndex(i)}
            className={cn(
              'w-full aspect-video rounded border bg-white p-2 text-left cursor-pointer',
              i === currentIndex ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50'
            )}
          >
            <div className="text-[8px] font-bold truncate">{slide.title}</div>
            <div className="text-[7px] text-muted-foreground truncate mt-0.5">{slide.content}</div>
          </button>
        ))}
        <Button variant="outline" size="sm" onClick={addSlide} className="w-full mt-1">
          <Plus className="mr-1 h-3 w-3" />
          슬라이드
        </Button>
      </div>

      {/* Main Editor */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 bg-muted/30">
          <Button variant="outline" size="sm" onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {currentIndex + 1} / {slides.length}
          </span>
          <Button variant="outline" size="sm" onClick={() => setCurrentIndex(Math.min(slides.length - 1, currentIndex + 1))} disabled={currentIndex === slides.length - 1}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>

          <div className="ml-auto flex gap-1">
            <Button variant="outline" size="sm" onClick={deleteSlide} disabled={slides.length <= 1}>
              <Trash2 className="mr-1 h-3 w-3" />삭제
            </Button>
            <Button size="sm" onClick={() => setIsPresenting(true)}>
              <Play className="mr-1 h-3 w-3" />발표
            </Button>
          </div>
        </div>

        {/* Slide Canvas */}
        <div className="flex-1 flex items-center justify-center p-8 bg-muted/20">
          <div className="w-full max-w-3xl aspect-video bg-white rounded-lg shadow-lg border border-border flex flex-col items-center justify-center p-12">
            <input
              className="text-3xl font-bold text-center w-full bg-transparent outline-none border-b border-transparent hover:border-border focus:border-primary pb-2 mb-4"
              value={currentSlide.title}
              onChange={(e) => updateSlide('title', e.target.value)}
              placeholder="제목"
            />
            <textarea
              className="text-lg text-center w-full flex-1 bg-transparent outline-none resize-none text-muted-foreground"
              value={currentSlide.content}
              onChange={(e) => updateSlide('content', e.target.value)}
              placeholder="내용을 입력하세요"
            />
          </div>
        </div>

        {/* Speaker Notes */}
        <div className="border-t border-border p-3">
          <div className="text-xs font-medium text-muted-foreground mb-1">발표자 노트</div>
          <textarea
            className="w-full h-16 text-xs bg-transparent outline-none resize-none border rounded-md border-border p-2"
            value={currentSlide.notes}
            onChange={(e) => updateSlide('notes', e.target.value)}
            placeholder="발표 시 참고할 노트를 입력하세요..."
          />
        </div>
      </div>
    </div>
  )
}
