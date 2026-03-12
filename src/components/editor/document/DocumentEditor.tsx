import { useEffect, useRef, useState, useCallback, type MutableRefObject } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Typography from '@tiptap/extension-typography'
import { FontSize } from './FontSizeExtension'
import { DocumentToolbar } from './DocumentToolbar'
import { rewriteText } from '@/services/ai-provider/documentAI'
import { useAppStore } from '@/stores/useAppStore'
import './editor.css'

interface Props {
  content?: string
  onChange?: (html: string) => void
  editorRef?: MutableRefObject<import('@tiptap/react').Editor | null>
}

export function DocumentEditor({ content = '', onChange, editorRef }: Props) {
  const prevContentRef = useRef(content)
  const [aiMenu, setAiMenu] = useState<{ x: number; y: number } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const settings = useAppStore(s => s.settings)
  const aiMenuRef = useRef<HTMLDivElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Placeholder.configure({ placeholder: '여기에 내용을 입력하세요...' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image.configure({ allowBase64: true, inline: false }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-primary underline cursor-pointer' } }),
      Subscript,
      Superscript,
      TaskList,
      TaskItem.configure({ nested: true }),
      Typography,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
  })

  useEffect(() => {
    if (editorRef && editor) {
      editorRef.current = editor
    }
  }, [editor, editorRef])

  useEffect(() => {
    if (editor && content !== prevContentRef.current) {
      const currentHtml = editor.getHTML()
      if (content !== currentHtml) {
        editor.commands.setContent(content, { emitUpdate: false })
      }
      prevContentRef.current = content
    }
  }, [content, editor])

  const handleMouseUp = useCallback(() => {
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from === to) {
      setAiMenu(null)
      return
    }
    const coords = editor.view.coordsAtPos(to)
    setAiMenu({ x: coords.left, y: coords.bottom + 8 })
  }, [editor])

  const handleAiRewrite = useCallback(async (instruction: 'rewrite' | 'elaborate' | 'simplify' | 'formal' | 'casual') => {
    if (!editor || !settings) return
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, ' ')
    if (!selectedText) return

    setAiLoading(true)
    try {
      const result = await rewriteText(selectedText, instruction, settings)
      editor.chain().focus().deleteRange({ from, to }).insertContent(result).run()
      setAiMenu(null)
    } catch (err) {
      console.error('AI rewrite failed:', err)
      alert('AI 처리 중 오류가 발생했습니다: ' + (err instanceof Error ? err.message : '알 수 없는 오류'))
    } finally {
      setAiLoading(false)
    }
  }, [editor, settings])

  // Close AI menu on click outside or Escape
  useEffect(() => {
    if (!aiMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      if (aiMenuRef.current && !aiMenuRef.current.contains(e.target as Node)) {
        setAiMenu(null)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAiMenu(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [aiMenu])

  if (!editor) return null

  return (
    <div className="flex flex-col h-full">
      <DocumentToolbar editor={editor} />
      <div className="flex-1 overflow-y-auto bg-white">
        <div
          className="mx-auto max-w-[800px] px-12 py-10"
          onMouseUp={handleMouseUp}
        >
          <EditorContent
            editor={editor}
            className="documind-editor"
          />
        </div>
      </div>

      {aiMenu && (
        <div
          ref={aiMenuRef}
          className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-40"
          style={{ left: aiMenu.x, top: aiMenu.y }}
        >
          {aiLoading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
              <span className="animate-spin">&#9203;</span> AI 처리 중...
            </div>
          ) : (
            <>
              <div className="px-3 py-1 text-xs text-muted-foreground font-medium">AI로 수정</div>
              {([
                { key: 'rewrite' as const, label: '다시 쓰기' },
                { key: 'elaborate' as const, label: '더 자세히' },
                { key: 'simplify' as const, label: '더 간결하게' },
                { key: 'formal' as const, label: '격식체로' },
                { key: 'casual' as const, label: '캐주얼하게' },
              ]).map(item => (
                <button
                  key={item.key}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                  onClick={() => handleAiRewrite(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
