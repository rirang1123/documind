import { useState, useRef, useEffect, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Quote,
  Code,
  Minus,
  Undo,
  Redo,
  Highlighter,
  TableIcon,
  ImageIcon,
  Link as LinkIcon,
  Unlink,
  Subscript,
  Superscript,
  ListChecks,
  Palette,
  Type,
  ChevronDown,
  Rows3,
  Columns3,
  Trash2,
  MergeIcon,
  SplitIcon,
  Search,
  Replace,
  X,
  Printer,
} from 'lucide-react'
import { cn } from '@/utils/cn'

interface Props {
  editor: Editor
}

export function DocumentToolbar({ editor }: Props) {
  const [showFontMenu, setShowFontMenu] = useState(false)
  const [showSizeMenu, setShowSizeMenu] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showHighlightPicker, setShowHighlightPicker] = useState(false)
  const [showTableMenu, setShowTableMenu] = useState(false)
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')

  // Close all dropdowns when clicking outside
  const toolbarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowFontMenu(false)
        setShowSizeMenu(false)
        setShowColorPicker(false)
        setShowHighlightPicker(false)
        setShowTableMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const ToolButton = ({
    onClick,
    isActive,
    disabled,
    children,
    title,
  }: {
    onClick: () => void
    isActive?: boolean
    disabled?: boolean
    children: React.ReactNode
    title: string
  }) => (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'rounded p-1.5 hover:bg-accent cursor-pointer transition-colors',
        isActive && 'bg-accent text-primary',
        disabled && 'opacity-30 cursor-not-allowed hover:bg-transparent'
      )}
    >
      {children}
    </button>
  )

  const Separator = () => <div className="mx-1 h-5 w-px bg-border shrink-0" />
  const iconSize = 'h-4 w-4'

  // Font families
  const fonts = [
    { label: 'Malgun Gothic', value: 'Malgun Gothic' },
    { label: '맑은 고딕', value: 'Malgun Gothic' },
    { label: '바탕', value: 'Batang' },
    { label: '돋움', value: 'Dotum' },
    { label: '굴림', value: 'Gulim' },
    { label: 'Arial', value: 'Arial' },
    { label: 'Times New Roman', value: 'Times New Roman' },
    { label: 'Georgia', value: 'Georgia' },
    { label: 'Verdana', value: 'Verdana' },
    { label: 'Courier New', value: 'Courier New' },
  ]

  // Font sizes (using heading levels + paragraph styles)
  const fontSizes = [
    { label: '9pt', value: '9px' },
    { label: '10pt', value: '10px' },
    { label: '11pt', value: '11px' },
    { label: '12pt', value: '12px' },
    { label: '14pt', value: '14px' },
    { label: '16pt', value: '16px' },
    { label: '18pt', value: '18px' },
    { label: '20pt', value: '20px' },
    { label: '24pt', value: '24px' },
    { label: '28pt', value: '28px' },
    { label: '36pt', value: '36px' },
    { label: '48pt', value: '48px' },
  ]

  const textColors = [
    '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC', '#D9D9D9', '#FFFFFF',
    '#FF0000', '#FF4D00', '#FF9900', '#FFD700', '#00B050', '#0070C0', '#002060', '#7030A0',
    '#C00000', '#E65100', '#BF8F00', '#538135', '#2E75B6', '#1F4E79', '#4A148C', '#BF4080',
  ]

  const highlightColors = [
    '#FFFF00', '#00FF00', '#00FFFF', '#FF00FF', '#FF6600', '#FFB3B3',
    '#CCFF66', '#66FFCC', '#66B2FF', '#CC99FF', '#FF99CC', '#FFFFCC',
  ]

  // Find & Replace
  const handleFind = useCallback(() => {
    if (!findText) return
    const { doc } = editor.state
    let found = false
    doc.descendants((node, nodePos) => {
        if (found) return false
        if (node.isText) {
          const nodeText = node.text || ''
          const localIdx = nodeText.toLowerCase().indexOf(findText.toLowerCase())
          if (localIdx >= 0) {
            const from = nodePos + localIdx
            const to = from + findText.length
            editor.chain().focus().setTextSelection({ from, to }).run()
            found = true
            return false
          }
        }
    })
    if (!found) window.alert('찾을 수 없습니다.')
  }, [editor, findText])

  const handleReplace = useCallback(() => {
    if (!findText) return
    const { from, to } = editor.state.selection
    if (from === to) {
      handleFind()
      return
    }
    editor.chain().focus().insertContentAt({ from, to }, replaceText).run()
    handleFind()
  }, [editor, findText, replaceText, handleFind])

  const handleReplaceAll = useCallback(() => {
    if (!findText) return
    const html = editor.getHTML()
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    const newHtml = html.replace(regex, replaceText)
    editor.commands.setContent(newHtml)
  }, [editor, findText, replaceText])

  // Image: file input
  const imageInputRef = useRef<HTMLInputElement>(null)
  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        editor.chain().focus().setImage({ src: reader.result }).run()
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Link
  const handleLink = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const url = window.prompt('링크 URL을 입력하세요:', 'https://')
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }

  // Print
  const handlePrint = () => {
    window.print()
  }

  // Current font detection
  const currentFont = editor.getAttributes('textStyle').fontFamily || 'Malgun Gothic'
  const currentFontSize = editor.getAttributes('textStyle').fontSize || ''

  return (
    <div ref={toolbarRef} className="border-b border-border bg-muted/30">
      {/* Row 1: Font, Size, Colors */}
      <div className="flex flex-wrap items-center gap-0.5 px-3 py-1 border-b border-border/50">
        {/* Font Family Dropdown */}
        <div className="relative">
          <button
            onClick={() => { setShowFontMenu(!showFontMenu); setShowSizeMenu(false); setShowColorPicker(false); setShowHighlightPicker(false) }}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent cursor-pointer min-w-[100px] border border-border/50"
          >
            <Type className="h-3 w-3" />
            <span className="truncate">{currentFont}</span>
            <ChevronDown className="h-3 w-3 ml-auto" />
          </button>
          {showFontMenu && (
            <div className="absolute top-full left-0 z-50 mt-1 w-48 rounded-md border border-border bg-background shadow-lg max-h-60 overflow-y-auto">
              {fonts.map((f) => (
                <button
                  key={f.label}
                  onClick={() => {
                    editor.chain().focus().setFontFamily(f.value).run()
                    setShowFontMenu(false)
                  }}
                  className={cn(
                    'w-full px-3 py-1.5 text-left text-xs hover:bg-accent cursor-pointer',
                    currentFont === f.value && 'bg-accent text-primary'
                  )}
                  style={{ fontFamily: f.value }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Font Size Dropdown */}
        <div className="relative">
          <button
            onClick={() => { setShowSizeMenu(!showSizeMenu); setShowFontMenu(false); setShowColorPicker(false); setShowHighlightPicker(false) }}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent cursor-pointer min-w-[60px] border border-border/50"
          >
            <span>{currentFontSize || '12pt'}</span>
            <ChevronDown className="h-3 w-3 ml-auto" />
          </button>
          {showSizeMenu && (
            <div className="absolute top-full left-0 z-50 mt-1 w-24 rounded-md border border-border bg-background shadow-lg max-h-60 overflow-y-auto">
              {fontSizes.map((s) => (
                <button
                  key={s.value}
                  onClick={() => {
                    editor.chain().focus().setFontSize(s.value).run()
                    setShowSizeMenu(false)
                  }}
                  className={cn(
                    'w-full px-3 py-1.5 text-left text-xs hover:bg-accent cursor-pointer',
                    currentFontSize === s.value && 'bg-accent text-primary'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Text Color */}
        <div className="relative">
          <button
            onClick={() => { setShowColorPicker(!showColorPicker); setShowHighlightPicker(false); setShowFontMenu(false); setShowSizeMenu(false) }}
            title="글자 색"
            className="flex flex-col items-center rounded p-1 hover:bg-accent cursor-pointer"
          >
            <Palette className="h-3.5 w-3.5" />
            <div className="h-0.5 w-3.5 rounded-full mt-0.5" style={{ backgroundColor: editor.getAttributes('textStyle').color || '#000000' }} />
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 z-50 mt-1 w-52 rounded-md border border-border bg-background shadow-lg p-2">
              <div className="text-[10px] font-medium text-muted-foreground mb-1">글자 색</div>
              <div className="grid grid-cols-8 gap-1">
                {textColors.map((c) => (
                  <button
                    key={c}
                    onClick={() => { editor.chain().focus().setColor(c).run(); setShowColorPicker(false) }}
                    className="h-5 w-5 rounded border border-border/50 cursor-pointer hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
              <button
                onClick={() => { editor.chain().focus().unsetColor().run(); setShowColorPicker(false) }}
                className="mt-2 w-full text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                색상 초기화
              </button>
            </div>
          )}
        </div>

        {/* Highlight Color */}
        <div className="relative">
          <button
            onClick={() => { setShowHighlightPicker(!showHighlightPicker); setShowColorPicker(false); setShowFontMenu(false); setShowSizeMenu(false) }}
            title="형광펜"
            className="flex flex-col items-center rounded p-1 hover:bg-accent cursor-pointer"
          >
            <Highlighter className="h-3.5 w-3.5" />
            <div className="h-0.5 w-3.5 rounded-full mt-0.5 bg-yellow-300" />
          </button>
          {showHighlightPicker && (
            <div className="absolute top-full left-0 z-50 mt-1 w-44 rounded-md border border-border bg-background shadow-lg p-2">
              <div className="text-[10px] font-medium text-muted-foreground mb-1">형광펜</div>
              <div className="grid grid-cols-6 gap-1">
                {highlightColors.map((c) => (
                  <button
                    key={c}
                    onClick={() => { editor.chain().focus().toggleHighlight({ color: c }).run(); setShowHighlightPicker(false) }}
                    className="h-5 w-5 rounded border border-border/50 cursor-pointer hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
              <button
                onClick={() => { editor.chain().focus().unsetHighlight().run(); setShowHighlightPicker(false) }}
                className="mt-2 w-full text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                형광펜 제거
              </button>
            </div>
          )}
        </div>

        <Separator />

        {/* Find & Replace */}
        <ToolButton onClick={() => setShowFindReplace(!showFindReplace)} isActive={showFindReplace} title="찾기 및 바꾸기">
          <Search className={iconSize} />
        </ToolButton>

        {/* Print */}
        <ToolButton onClick={handlePrint} title="인쇄">
          <Printer className={iconSize} />
        </ToolButton>
      </div>

      {/* Row 2: Formatting */}
      <div className="flex flex-wrap items-center gap-0.5 px-3 py-1">
        {/* Undo/Redo */}
        <ToolButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="실행 취소 (Ctrl+Z)">
          <Undo className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="다시 실행 (Ctrl+Y)">
          <Redo className={iconSize} />
        </ToolButton>

        <Separator />

        {/* Headings */}
        <ToolButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="제목 1"
        >
          <Heading1 className={iconSize} />
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="제목 2"
        >
          <Heading2 className={iconSize} />
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          title="제목 3"
        >
          <Heading3 className={iconSize} />
        </ToolButton>
        <ToolButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
          isActive={editor.isActive('heading', { level: 4 })}
          title="제목 4"
        >
          <Heading4 className={iconSize} />
        </ToolButton>

        <Separator />

        {/* Text Formatting */}
        <ToolButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="굵게 (Ctrl+B)">
          <Bold className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="기울임 (Ctrl+I)">
          <Italic className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="밑줄 (Ctrl+U)">
          <Underline className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="취소선">
          <Strikethrough className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleSubscript().run()} isActive={editor.isActive('subscript')} title="아래 첨자">
          <Subscript className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleSuperscript().run()} isActive={editor.isActive('superscript')} title="위 첨자">
          <Superscript className={iconSize} />
        </ToolButton>

        <Separator />

        {/* Alignment */}
        <ToolButton onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} title="왼쪽 정렬">
          <AlignLeft className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} title="가운데 정렬">
          <AlignCenter className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} title="오른쪽 정렬">
          <AlignRight className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })} title="양쪽 정렬">
          <AlignJustify className={iconSize} />
        </ToolButton>

        <Separator />

        {/* Lists */}
        <ToolButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="글머리 기호">
          <List className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="번호 매기기">
          <ListOrdered className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleTaskList().run()} isActive={editor.isActive('taskList')} title="체크리스트">
          <ListChecks className={iconSize} />
        </ToolButton>

        <Separator />

        {/* Blocks */}
        <ToolButton onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} title="인용">
          <Quote className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} isActive={editor.isActive('codeBlock')} title="코드 블록">
          <Code className={iconSize} />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="구분선">
          <Minus className={iconSize} />
        </ToolButton>

        <Separator />

        {/* Link */}
        <ToolButton onClick={handleLink} isActive={editor.isActive('link')} title="링크 삽입/제거">
          {editor.isActive('link') ? <Unlink className={iconSize} /> : <LinkIcon className={iconSize} />}
        </ToolButton>

        {/* Image */}
        <ToolButton
          onClick={() => {
            const choice = window.confirm('파일에서 이미지를 선택하시겠습니까?\n\n확인 = 파일 선택\n취소 = URL 입력')
            if (choice) {
              imageInputRef.current?.click()
            } else {
              const url = window.prompt('이미지 URL을 입력하세요:')
              if (url) editor.chain().focus().setImage({ src: url }).run()
            }
          }}
          title="이미지 삽입"
        >
          <ImageIcon className={iconSize} />
        </ToolButton>
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />

        {/* Table */}
        <div className="relative">
          <ToolButton
            onClick={() => { setShowTableMenu(!showTableMenu); setShowFontMenu(false); setShowSizeMenu(false); setShowColorPicker(false); setShowHighlightPicker(false) }}
            isActive={editor.isActive('table')}
            title="표"
          >
            <TableIcon className={iconSize} />
          </ToolButton>
          {showTableMenu && (
            <div className="absolute top-full right-0 z-50 mt-1 w-48 rounded-md border border-border bg-background shadow-lg p-1">
              {!editor.isActive('table') ? (
                <>
                  <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground">표 삽입</div>
                  {[
                    { label: '2 x 2', rows: 2, cols: 2 },
                    { label: '3 x 3', rows: 3, cols: 3 },
                    { label: '4 x 4', rows: 4, cols: 4 },
                    { label: '5 x 3', rows: 5, cols: 3 },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => {
                        editor.chain().focus().insertTable({ rows: opt.rows, cols: opt.cols, withHeaderRow: true }).run()
                        setShowTableMenu(false)
                      }}
                      className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent cursor-pointer"
                    >
                      <TableIcon className="h-3 w-3" />
                      {opt.label} 표
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground">표 편집</div>
                  <button onClick={() => { editor.chain().focus().addRowBefore().run(); setShowTableMenu(false) }} className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent cursor-pointer">
                    <Rows3 className="h-3 w-3" /> 위에 행 추가
                  </button>
                  <button onClick={() => { editor.chain().focus().addRowAfter().run(); setShowTableMenu(false) }} className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent cursor-pointer">
                    <Rows3 className="h-3 w-3" /> 아래에 행 추가
                  </button>
                  <button onClick={() => { editor.chain().focus().addColumnBefore().run(); setShowTableMenu(false) }} className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent cursor-pointer">
                    <Columns3 className="h-3 w-3" /> 왼쪽에 열 추가
                  </button>
                  <button onClick={() => { editor.chain().focus().addColumnAfter().run(); setShowTableMenu(false) }} className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent cursor-pointer">
                    <Columns3 className="h-3 w-3" /> 오른쪽에 열 추가
                  </button>
                  <div className="my-1 h-px bg-border" />
                  <button onClick={() => { editor.chain().focus().deleteRow().run(); setShowTableMenu(false) }} className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent cursor-pointer text-destructive">
                    <Trash2 className="h-3 w-3" /> 행 삭제
                  </button>
                  <button onClick={() => { editor.chain().focus().deleteColumn().run(); setShowTableMenu(false) }} className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent cursor-pointer text-destructive">
                    <Trash2 className="h-3 w-3" /> 열 삭제
                  </button>
                  <div className="my-1 h-px bg-border" />
                  <button onClick={() => { editor.chain().focus().mergeCells().run(); setShowTableMenu(false) }} className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent cursor-pointer">
                    <MergeIcon className="h-3 w-3" /> 셀 병합
                  </button>
                  <button onClick={() => { editor.chain().focus().splitCell().run(); setShowTableMenu(false) }} className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent cursor-pointer">
                    <SplitIcon className="h-3 w-3" /> 셀 분할
                  </button>
                  <button onClick={() => { editor.chain().focus().toggleHeaderRow().run(); setShowTableMenu(false) }} className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent cursor-pointer">
                    <TableIcon className="h-3 w-3" /> 헤더 행 토글
                  </button>
                  <div className="my-1 h-px bg-border" />
                  <button onClick={() => { editor.chain().focus().deleteTable().run(); setShowTableMenu(false) }} className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent cursor-pointer text-destructive">
                    <Trash2 className="h-3 w-3" /> 표 삭제
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Find & Replace Bar */}
      {showFindReplace && (
        <div className="flex items-center gap-2 border-t border-border/50 px-3 py-1.5 bg-muted/20">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFind()}
            placeholder="찾기..."
            className="h-6 w-36 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Replace className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleReplace()}
            placeholder="바꾸기..."
            className="h-6 w-36 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button onClick={handleFind} className="rounded px-2 py-0.5 text-[10px] bg-accent hover:bg-accent/80 cursor-pointer">다음 찾기</button>
          <button onClick={handleReplace} className="rounded px-2 py-0.5 text-[10px] bg-accent hover:bg-accent/80 cursor-pointer">바꾸기</button>
          <button onClick={handleReplaceAll} className="rounded px-2 py-0.5 text-[10px] bg-accent hover:bg-accent/80 cursor-pointer">모두 바꾸기</button>
          <button onClick={() => { setShowFindReplace(false); setFindText(''); setReplaceText('') }} className="ml-auto rounded p-0.5 hover:bg-accent cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
