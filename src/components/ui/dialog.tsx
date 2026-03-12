import { type ReactNode, useEffect, useRef } from 'react'
import { cn } from '@/utils/cn'

interface DialogProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  title: string
  className?: string
}

export function Dialog({ open, onClose, children, title, className }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      dialog.showModal()
    } else {
      dialog.close()
    }
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className={cn(
        'rounded-lg border border-border bg-background p-0 shadow-lg backdrop:bg-black/50',
        'w-full max-w-md',
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
          ✕
        </button>
      </div>
      <div className="p-6">{children}</div>
    </dialog>
  )
}
