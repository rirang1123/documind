import { useState, type MutableRefObject } from 'react'
import {
  Shield,
  X,
  Loader2,
  Check,
  XCircle,
  Filter,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import {
  reviewDocument,
  REVIEW_TYPE_LABELS,
  type ReviewSuggestion,
} from '@/services/document/reviewService'
import type { Editor } from '@tiptap/react'

interface Props {
  html: string
  editorRef: MutableRefObject<Editor | null>
  onClose: () => void
}

const TYPE_COLORS: Record<ReviewSuggestion['type'], string> = {
  spelling: 'text-red-600 bg-red-50',
  grammar: 'text-orange-600 bg-orange-50',
  style: 'text-blue-600 bg-blue-50',
  structure: 'text-purple-600 bg-purple-50',
}

export function ReviewPanel({ html, editorRef, onClose }: Props) {
  const { settings } = useAppStore()
  const [suggestions, setSuggestions] = useState<ReviewSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<ReviewSuggestion['type'] | 'all'>('all')
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [hasReviewed, setHasReviewed] = useState(false)
  const [appliedCount, setAppliedCount] = useState(0)

  const activeProvider = settings?.aiProviders.find(
    (p) => p.id === settings.activeProviderId
  )

  const handleReview = async () => {
    if (!activeProvider) {
      setError('AI 제공자가 설정되지 않았습니다.')
      return
    }
    setLoading(true)
    setError('')
    setDismissed(new Set())
    setAppliedCount(0)
    try {
      const results = await reviewDocument(activeProvider, html)
      setSuggestions(results)
      setHasReviewed(true)
    } catch (err) {
      setError((err as Error).message || '검토 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleApply = (suggestion: ReviewSuggestion) => {
    const editor = editorRef.current
    if (!editor) return

    const currentHtml = editor.getHTML()
    if (currentHtml.includes(suggestion.original)) {
      const newHtml = currentHtml.replace(suggestion.original, suggestion.suggestion)
      editor.commands.setContent(newHtml)
      setAppliedCount((c) => c + 1)
    }
    setDismissed((prev) => new Set(prev).add(suggestion.id))
  }

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id))
  }

  const filtered = suggestions.filter(
    (s) => !dismissed.has(s.id) && (filter === 'all' || s.type === filter)
  )

  const typeCounts = suggestions.reduce(
    (acc, s) => {
      if (!dismissed.has(s.id)) acc[s.type] = (acc[s.type] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const totalRemaining = Object.values(typeCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="w-80 flex-shrink-0 border-l border-border bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">AI 검수</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Run button */}
      <div className="border-b border-border px-3 py-2">
        <Button
          size="sm"
          className="w-full"
          onClick={handleReview}
          disabled={loading || !activeProvider}
        >
          {loading ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              검토 중... (AI 분석 진행 중)
            </>
          ) : hasReviewed ? (
            <>
              <RefreshCw className="mr-1 h-3 w-3" />
              다시 검토하기
            </>
          ) : (
            <>
              <Shield className="mr-1 h-3 w-3" />
              문서 검토 시작
            </>
          )}
        </Button>
        {!activeProvider && (
          <p className="mt-1 text-[10px] text-muted-foreground">AI 제공자를 먼저 설정하세요.</p>
        )}
      </div>

      {/* Review complete summary */}
      {hasReviewed && !loading && (
        <div className={`px-3 py-2 border-b border-border text-xs ${
          suggestions.length === 0
            ? 'bg-green-50 text-green-700'
            : 'bg-amber-50 text-amber-700'
        }`}>
          {suggestions.length === 0 ? (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>검토 완료 — 발견된 문제가 없습니다.</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>
                총 {suggestions.length}건 발견
                {appliedCount > 0 && ` · ${appliedCount}건 수정됨`}
                {totalRemaining > 0 && ` · ${totalRemaining}건 남음`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Filter */}
      {suggestions.length > 0 && (
        <div className="flex gap-1 border-b border-border px-3 py-2 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`rounded px-2 py-0.5 text-[10px] cursor-pointer ${
              filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            전체 ({totalRemaining})
          </button>
          {(Object.keys(REVIEW_TYPE_LABELS) as ReviewSuggestion['type'][]).map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`rounded px-2 py-0.5 text-[10px] cursor-pointer ${
                filter === type ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {REVIEW_TYPE_LABELS[type]} ({typeCounts[type] || 0})
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-3 rounded-lg bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {!loading && !hasReviewed && !error && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
            <Filter className="h-8 w-8 opacity-30 mb-2" />
            <p className="text-xs text-center">"문서 검토 시작" 버튼을 눌러 AI 검수를 시작하세요.</p>
            <p className="text-[10px] text-center mt-1 opacity-60">맞춤법, 문법, 문체, 구조를 AI가 분석합니다.</p>
          </div>
        )}

        {/* All items processed */}
        {filtered.length === 0 && suggestions.length > 0 && !loading && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            <Check className="mx-auto h-6 w-6 text-green-500 mb-1" />
            모든 항목이 처리되었습니다.
            {appliedCount > 0 && (
              <p className="mt-1 text-green-600">{appliedCount}건의 수정이 적용되었습니다.</p>
            )}
          </div>
        )}

        {/* No issues found after review */}
        {hasReviewed && suggestions.length === 0 && !loading && !error && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
            <CheckCircle2 className="h-10 w-10 text-green-500 mb-2" />
            <p className="text-sm font-medium text-green-700">문서가 양호합니다</p>
            <p className="text-xs text-center mt-1">
              AI가 문서를 검토한 결과, 맞춤법·문법·문체·구조상 문제를 발견하지 못했습니다.
            </p>
            <p className="text-[10px] text-center mt-2 opacity-50">
              문서 수정 후 "다시 검토하기"로 재검토할 수 있습니다.
            </p>
          </div>
        )}

        <div className="p-2 space-y-2">
          {filtered.map((s) => (
            <div key={s.id} className={`rounded-lg border p-3 text-xs ${TYPE_COLORS[s.type]}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{REVIEW_TYPE_LABELS[s.type]}</span>
              </div>
              <div className="mb-1">
                <span className="line-through opacity-60">{s.original}</span>
                <span className="mx-1">&rarr;</span>
                <span className="font-medium">{s.suggestion}</span>
              </div>
              <p className="text-[10px] opacity-80 mb-2">{s.explanation}</p>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-5 text-[10px] px-2"
                  onClick={() => handleApply(s)}
                >
                  <Check className="mr-0.5 h-2.5 w-2.5" />
                  수정
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 text-[10px] px-2"
                  onClick={() => handleDismiss(s.id)}
                >
                  <XCircle className="mr-0.5 h-2.5 w-2.5" />
                  무시
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
