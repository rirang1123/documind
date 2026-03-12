import { useState, useEffect, useRef } from 'react'
import DOMPurify from 'dompurify'
import { Bot, Send, Sparkles, FileSearch, Tags, RefreshCw, PenTool, Loader2, FileSpreadsheet } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { aiService } from '@/services/ai-provider/aiService'
import { documentAI, type DocumentQuestion, generateOutline } from '@/services/ai-provider/documentAI'
import { generateExcelBuffer } from '@/services/document/excelService'
import { generateId } from '@/utils/id'
import type { DocumentFile } from '@/types'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

type AIMode = 'chat' | 'generate' | 'spreadsheet' | 'analyze' | 'summarize' | 'tags'
type GenStep = 'topic' | 'asking' | 'confirm' | 'outline' | 'generating'

export function AIAssistant() {
  const { settings, setEditorContent, setActiveView } = useAppStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<AIMode>('chat')
  const [docType, setDocType] = useState<'report' | 'proposal' | 'meeting' | 'email' | 'general'>('general')

  // 문서 생성 대화 흐름
  const [genStep, setGenStep] = useState<GenStep>('topic')
  const [genTopic, setGenTopic] = useState('')
  const [genQuestions, setGenQuestions] = useState<DocumentQuestion[]>([])
  const [genQuestionIdx, setGenQuestionIdx] = useState(0)
  const [genAnswers, setGenAnswers] = useState<Record<string, string>>({})
  const [skippedKeys, setSkippedKeys] = useState<string[]>([])
  const [outlineStep, setOutlineStep] = useState(false)
  const [outline, setOutline] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, genStep, genQuestionIdx])

  const activeProvider = settings?.aiProviders.find(
    (p) => p.id === settings.activeProviderId
  )

  const resetGenState = () => {
    setGenStep('topic')
    setGenTopic('')
    setGenQuestions([])
    setGenQuestionIdx(0)
    setGenAnswers({})
    setSkippedKeys([])
    setOutlineStep(false)
    setOutline('')
  }

  /** 현재 질문 */
  const currentQuestion = genQuestions[genQuestionIdx] || null

  /** 주제가 모호한지 판별 */
  const isTopicVague = (topic: string): boolean => {
    const typeLabels = { report: '보고서', proposal: '기획서', meeting: '회의록', email: '이메일', general: '문서' }
    const label = typeLabels[docType] || '문서'
    // 주제가 문서 유형 이름만 포함하거나 너무 짧으면 모호하다고 판단
    const normalized = topic.replace(/\s+/g, '').replace(/를?|을?|좀|해줘|작성|생성|만들어/g, '')
    if (normalized.length <= 3) return true
    const vaguePhrases = [label, '문서', '보고서', '기획서', '회의록', '이메일']
    if (vaguePhrases.some((p) => normalized === p)) return true
    return false
  }

  /** 주제 입력 → AI가 맥락에 맞는 질문 생성 → 첫 질문 시작 */
  const handleTopicSubmit = async () => {
    if (!input.trim()) return
    const topic = input.trim()
    setMessages((prev) => [...prev, { role: 'user', content: topic }])
    setInput('')

    // 주제가 모호하면 다시 물어보기
    if (isTopicVague(topic)) {
      const typeLabels = { report: '보고서', proposal: '기획서', meeting: '회의록', email: '이메일', general: '문서' }
      const label = typeLabels[docType] || '문서'
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `어떤 내용에 대한 ${label}인가요? 구체적인 주제를 알려주세요.\n\n예) "2024년 상반기 영업 실적 보고서", "신규 모바일 앱 서비스 기획서"` },
      ])
      return
    }

    setGenTopic(topic)

    if (!activeProvider) return

    // AI가 주제에 맞는 질문을 동적으로 생성
    setLoading(true)
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '주제를 분석하고 있습니다...' },
    ])

    try {
      const questions = await documentAI.generateQuestions(activeProvider, docType, topic)
      setGenQuestions(questions)
      setGenQuestionIdx(0)
      setGenAnswers({})

      // 첫 질문을 메시지로 추가
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: questions[0].question },
      ])
      setGenStep('asking')
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `질문 생성 중 오류: ${(err as Error).message}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  /** 질문에 답변 → 다음 질문 or 추가 질문 확인 or 생성 */
  const handleAnswerSubmit = async () => {
    const answer = input.trim()
    const q = currentQuestion
    if (!q) return

    // 답변 저장 (빈 답변도 허용 - 건너뛰기)
    setMessages((prev) => [...prev, { role: 'user', content: answer || '(건너뜀)' }])
    const updatedAnswers = answer ? { ...genAnswers, [q.key]: answer } : { ...genAnswers }
    const updatedSkipped = answer ? skippedKeys : [...skippedKeys, q.key]
    if (answer) {
      setGenAnswers(updatedAnswers)
    } else {
      setSkippedKeys(updatedSkipped)
    }
    setInput('')

    const nextIdx = genQuestionIdx + 1
    if (nextIdx < genQuestions.length) {
      // 다음 질문
      setGenQuestionIdx(nextIdx)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: genQuestions[nextIdx].question },
      ])
    } else {
      // 모든 질문 완료 → 수집 정보 요약 후 확인 단계
      showConfirmStep(updatedAnswers)
    }
  }

  /** 수집된 정보를 요약하여 확인 단계로 전환 */
  const showConfirmStep = (answers: Record<string, string>) => {
    const entries = Object.entries(answers).filter(([, v]) => v?.trim())
    let summary = '📋 지금까지 수집된 정보를 정리하면:\n\n'
    if (entries.length > 0) {
      summary += entries.map(([k, v]) => `• ${k}: ${v}`).join('\n')
    } else {
      summary += '(제공된 정보 없음)'
    }
    summary += '\n\n추가로 반영하고 싶은 내용이 있으면 자유롭게 입력해주세요.\n바로 문서를 생성하려면 "생성" 버튼을 누르세요.'

    setGenStep('confirm')
    setGenAnswers(answers)
    setMessages((prev) => [...prev, { role: 'assistant', content: summary }])
  }

  /** 확인 단계에서 추가 정보 입력 처리 */
  const handleConfirmSubmit = () => {
    const extra = input.trim()
    if (!extra) {
      // 빈 입력 = 아웃라인 생성
      startOutline(genAnswers)
      return
    }
    // 추가 정보를 answers에 병합
    setMessages((prev) => [...prev, { role: 'user', content: extra }])
    const updatedAnswers = { ...genAnswers, additionalInfo: extra }
    setGenAnswers(updatedAnswers)
    setInput('')
    startOutline(updatedAnswers)
  }

  /** 아웃라인 생성 → 미리보기 단계 */
  const startOutline = async (answers: Record<string, string>) => {
    if (!activeProvider) return
    const currentSettings = useAppStore.getState().settings
    if (!currentSettings) return
    setGenStep('outline')
    setOutlineStep(true)
    setLoading(true)
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '아웃라인을 생성하고 있습니다...' },
    ])

    try {
      const answerValues = Object.values(answers).filter(v => v?.trim())
      const typeLabels = { report: '보고서', proposal: '기획서', meeting: '회의록', email: '이메일', general: '일반 문서' }
      const label = typeLabels[docType] || '문서'
      const outlineHtml = await generateOutline(genTopic, label, answerValues, currentSettings)
      setOutline(outlineHtml)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '📋 아웃라인 미리보기가 준비되었습니다. 아래에서 확인하세요.' },
      ])
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `아웃라인 생성 오류: ${(err as Error).message}` }])
      setGenStep('confirm')
      setOutlineStep(false)
    } finally {
      setLoading(false)
    }
  }

  /** 아웃라인 다시 생성 */
  const regenerateOutline = () => {
    setOutline('')
    startOutline(genAnswers)
  }

  /** 문서 생성 실행 */
  const startGenerate = async (answers: Record<string, string>) => {
    if (!activeProvider) return
    setGenStep('generating')
    setOutlineStep(false)
    setOutline('')
    setLoading(true)
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '입력하신 정보를 종합하여 문서를 작성하고 있습니다...' },
    ])

    try {
      const behavior = useAppStore.getState().settings?.aiBehavior
      const response = await documentAI.generateDocument(activeProvider, genTopic, docType, answers, behavior)
      setEditorContent(response, genTopic.slice(0, 30))
      setActiveView('editor')
      setMessages((prev) => [...prev, { role: 'assistant', content: '문서가 생성되어 에디터에 열렸습니다.' }])
      resetGenState()
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `오류: ${(err as Error).message}` }])
      setGenStep('confirm') // 확인 단계로 돌아가기
    } finally {
      setLoading(false)
    }
  }

  /** 남은 질문 건너뛰고 확인 단계로 */
  const handleSkipRemaining = () => {
    showConfirmStep(genAnswers)
  }

  const handleSend = async () => {
    if (!input.trim() && !(mode === 'generate' && (genStep === 'asking' || genStep === 'confirm'))) return
    if (!activeProvider) return

    // 스프레드시트 생성 모드
    if (mode === 'spreadsheet') {
      return handleSpreadsheetGenerate()
    }

    // 문서 생성 모드: 주제 입력 단계
    if (mode === 'generate' && genStep === 'topic') {
      if (!input.trim()) return
      return handleTopicSubmit()
    }

    // 문서 생성 모드: 질문 답변 단계
    if (mode === 'generate' && genStep === 'asking') {
      return handleAnswerSubmit()
    }

    // 문서 생성 모드: 확인 단계
    if (mode === 'generate' && genStep === 'confirm') {
      return handleConfirmSubmit()
    }

    if (!input.trim()) return

    const userMessage: Message = { role: 'user', content: input }
    setMessages((prev) => [...prev, userMessage])
    const currentInput = input
    setInput('')
    setLoading(true)

    try {
      let response: string

      switch (mode) {
        case 'analyze':
          response = await documentAI.analyzeDocument(activeProvider, currentInput)
          break
        case 'summarize':
          response = await documentAI.summarizeDocument(activeProvider, currentInput)
          break
        case 'tags': {
          const tags = await documentAI.suggestTags(activeProvider, currentInput)
          response = `추천 태그:\n${tags.map((t) => `• ${t}`).join('\n')}`
          break
        }
        default: {
          const beh = useAppStore.getState().settings?.aiBehavior
          const toneMap = { formal: '격식체로', casual: '편한 톤으로', concise: '간결하게' }
          const styleMap = { professional: '비즈니스 문체', friendly: '친근한 문체', academic: '학술적 문체' }
          const sysContent = beh
            ? `한국어로 응답하는 어시스턴트입니다. ${toneMap[beh.tone]} ${styleMap[beh.writingStyle]}로 답변합니다.${beh.customInstructions ? ` 추가 지시: ${beh.customInstructions}` : ''}`
            : '한국어로 응답하는 어시스턴트입니다.'
          response = await aiService.chat(activeProvider, [
            { role: 'system', content: sysContent },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: currentInput },
          ])
        }
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: response }])
    } catch (err) {
      const errorMsg = (err as Error).message
      const isRateLimit = errorMsg.includes('한도') || errorMsg.includes('rate') || errorMsg.includes('429')
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: isRateLimit
            ? `${errorMsg}\n\n잠시 후 다시 시도해주세요.`
            : `오류가 발생했습니다:\n${errorMsg}`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  /** 스프레드시트 생성 */
  const handleSpreadsheetGenerate = async () => {
    if (!input.trim() || !activeProvider) return
    const topic = input.trim()
    setMessages((prev) => [...prev, { role: 'user', content: topic }])
    setInput('')
    setLoading(true)

    try {
      const behavior = useAppStore.getState().settings?.aiBehavior
      const sheets = await documentAI.generateSpreadsheet(activeProvider, topic, undefined, behavior)

      // Save as xlsx file in current project
      const { selectedProjectId, addFile, openFileViewer } = useAppStore.getState()
      const buffer = generateExcelBuffer(sheets)
      const xlsxFile: DocumentFile = {
        id: generateId(),
        name: `${topic.slice(0, 30)}.xlsx`,
        path: `${topic.slice(0, 30)}.xlsx`,
        projectId: selectedProjectId || '',
        folderId: null,
        type: 'xlsx',
        size: buffer.byteLength,
        tags: [],
        aiCategory: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        blobData: buffer,
      }

      if (selectedProjectId) {
        await addFile(xlsxFile)
        openFileViewer(xlsxFile.id)
        setMessages((prev) => [...prev, { role: 'assistant', content: `스프레드시트가 생성되어 "${xlsxFile.name}"으로 저장되었습니다. 뷰어에서 확인하세요.` }])
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: '프로젝트를 먼저 선택해주세요. 스프레드시트가 생성되었지만 저장할 프로젝트가 없습니다.' }])
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `스프레드시트 생성 오류: ${(err as Error).message}` }])
    } finally {
      setLoading(false)
    }
  }

  const modes: { id: AIMode; label: string; icon: typeof Bot }[] = [
    { id: 'chat', label: '채팅', icon: Bot },
    { id: 'generate', label: '문서 생성', icon: PenTool },
    { id: 'spreadsheet', label: '스프레드시트', icon: FileSpreadsheet },
    { id: 'analyze', label: '분석', icon: FileSearch },
    { id: 'summarize', label: '요약', icon: RefreshCw },
    { id: 'tags', label: '태그 제안', icon: Tags },
  ]

  if (!activeProvider) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Bot className="mx-auto h-12 w-12 opacity-30" />
          <p className="mt-3 text-sm">AI 기능을 사용하려면 설정에서 API 키를 등록하세요.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => useAppStore.getState().setActiveView('settings')}
          >
            설정으로 이동
          </Button>
        </div>
      </div>
    )
  }

  // 질문 답변 단계의 placeholder
  const askingPlaceholder = currentQuestion?.placeholder || '답변을 입력하세요...'

  // 질문 진행 상황
  const questionProgress = genStep === 'asking'
    ? `(${genQuestionIdx + 1}/${genQuestions.length})`
    : ''

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">AI 어시스턴트</h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {activeProvider.name} ({activeProvider.model})
          </span>
        </div>
        <div className="mt-2 flex gap-1">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); if (m.id !== 'generate') resetGenState() }}
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs cursor-pointer ${
                mode === m.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              <m.icon className="h-3 w-3" />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Document Type Selector */}
      {mode === 'generate' && genStep === 'topic' && (
        <div className="border-b border-border px-4 py-2 bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">문서 유형:</span>
            {(['general', 'report', 'proposal', 'meeting', 'email'] as const).map((t) => {
              const labels = { general: '일반', report: '보고서', proposal: '기획서', meeting: '회의록', email: '이메일' }
              return (
                <button
                  key={t}
                  onClick={() => setDocType(t)}
                  className={`rounded px-2 py-0.5 text-xs cursor-pointer ${
                    docType === t ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent'
                  }`}
                >
                  {labels[t]}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick Prompts */}
      {messages.length === 0 && (
        <div className="p-4">
          <p className="mb-3 text-sm text-muted-foreground">
            {mode === 'chat' && '무엇이든 물어보세요.'}
            {mode === 'generate' && '생성할 문서의 주제를 입력하세요.'}
            {mode === 'spreadsheet' && '생성할 스프레드시트의 주제를 입력하세요.'}
            {mode === 'analyze' && '분석할 문서 내용을 붙여넣으세요.'}
            {mode === 'summarize' && '요약할 문서 내용을 붙여넣으세요.'}
            {mode === 'tags' && '태그를 추천받을 문서 내용을 붙여넣으세요.'}
          </p>
          {mode === 'generate' && (
            <div className="grid grid-cols-2 gap-2">
              {[
                '2024년 연간 사업 보고서',
                '신규 프로젝트 기획서',
                '주간 팀 회의록',
                '고객 제안서',
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => setInput(example)}
                  className="rounded-lg border border-border p-2 text-left text-xs hover:bg-accent cursor-pointer"
                >
                  <Sparkles className="mb-1 h-3 w-3 text-primary" />
                  {example}
                </button>
              ))}
            </div>
          )}
          {mode === 'spreadsheet' && (
            <div className="grid grid-cols-2 gap-2">
              {[
                '월별 매출 데이터',
                '직원 근태 관리표',
                '프로젝트 일정표',
                '제품 재고 현황',
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => setInput(example)}
                  className="rounded-lg border border-border p-2 text-left text-xs hover:bg-accent cursor-pointer"
                >
                  <FileSpreadsheet className="mb-1 h-3 w-3 text-primary" />
                  {example}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && genStep === 'generating' && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              문서를 작성하고 있습니다...
            </div>
          </div>
        )}

        {loading && mode !== 'generate' && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-secondary px-4 py-2.5 text-sm text-muted-foreground animate-pulse">
              AI가 처리 중입니다...
            </div>
          </div>
        )}

        {/* 아웃라인 미리보기 */}
        {outlineStep && outline && genStep === 'outline' && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h4 className="text-sm font-semibold mb-2">아웃라인 미리보기</h4>
            <div
              className="text-sm prose prose-sm max-w-none mb-3"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(outline) }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => startGenerate(genAnswers)}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 cursor-pointer"
              >
                이대로 생성
              </button>
              <button
                onClick={regenerateOutline}
                className="rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 cursor-pointer"
              >
                다시 생성
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      {genStep !== 'generating' && genStep !== 'outline' && (
        <div className="border-t border-border p-4">
          {/* 질문 단계일 때 진행 상황 + 건너뛰기 */}
          {mode === 'generate' && genStep === 'asking' && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">
                질문 {questionProgress} — 모르면 비워두고 Enter를 눌러 건너뛸 수 있습니다.
              </span>
              <button
                onClick={handleSkipRemaining}
                className="text-xs text-primary hover:underline cursor-pointer"
              >
                나머지 건너뛰고 바로 생성
              </button>
            </div>
          )}
          {/* 확인 단계: 추가 정보 or 바로 생성 */}
          {mode === 'generate' && genStep === 'confirm' && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">
                추가 정보를 입력하거나 바로 생성하세요.
              </span>
              <button
                onClick={() => startOutline(genAnswers)}
                className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 cursor-pointer"
              >
                문서 생성
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                mode === 'generate' && genStep === 'topic'
                  ? '문서 주제를 입력하세요...'
                  : mode === 'generate' && genStep === 'asking'
                    ? askingPlaceholder
                    : mode === 'generate' && genStep === 'confirm'
                      ? '추가 반영할 내용이 있으면 입력하세요...'
                      : mode === 'spreadsheet'
                        ? '스프레드시트 주제를 입력하세요... (예: 월별 매출 데이터)'
                        : mode === 'analyze'
                          ? '문서 내용을 붙여넣으세요...'
                          : 'AI에게 질문하세요...'
              }
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              disabled={loading}
            />
            <Button onClick={handleSend} disabled={loading || (!input.trim() && !(mode === 'generate' && (genStep === 'asking' || genStep === 'confirm')))}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
