import { Check, Cloud } from 'lucide-react'

interface Props {
  status: 'idle' | 'saving' | 'saved'
}

export function AutoSaveIndicator({ status }: Props) {
  if (status === 'idle') return null

  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
      {status === 'saving' && (
        <>
          <Cloud className="h-3 w-3 animate-pulse" />
          <span>저장 중...</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Check className="h-3 w-3 text-green-500" />
          <span className="text-green-600">임시 저장됨</span>
        </>
      )}
    </span>
  )
}
