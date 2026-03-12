import { useEffect, useRef, useState } from 'react'

type SaveStatus = 'idle' | 'saving' | 'saved'

const DEBOUNCE_MS = 2000

export function useAutoSave(content: string | null, storageKey: string) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevContentRef = useRef<string | null>(null)

  useEffect(() => {
    if (content === null) return
    if (content === prevContentRef.current) return
    prevContentRef.current = content

    // Don't save empty content
    if (!content || content === '<p></p>') return

    setSaveStatus('saving')

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, content)
        localStorage.setItem(`${storageKey}-ts`, Date.now().toString())
        setSaveStatus('saved')
      } catch {
        setSaveStatus('idle')
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [content, storageKey])

  const restore = (): string | null => {
    try {
      return localStorage.getItem(storageKey)
    } catch {
      return null
    }
  }

  const clearSaved = () => {
    try {
      localStorage.removeItem(storageKey)
      localStorage.removeItem(`${storageKey}-ts`)
    } catch {}
  }

  return { saveStatus, restore, clearSaved }
}
