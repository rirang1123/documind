import { useMemo } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DiffViewerProps {
  leftContent: string;
  rightContent: string;
  leftTitle: string;
  rightTitle: string;
  onClose: () => void;
}

function htmlToLines(html: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || '', 'text/html');
  const text = doc.body.textContent || '';
  return text.split('\n').map(l => l.trimEnd());
}

// Simple LCS-based diff
function computeDiff(oldLines: string[], newLines: string[]): { type: 'same' | 'add' | 'remove'; text: string }[] {
  const result: { type: 'same' | 'add' | 'remove'; text: string }[] = [];
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  let oi = 0, ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push({ type: 'same', text: oldLines[oi] });
      oi++; ni++;
    } else if (oi < oldLines.length && !newSet.has(oldLines[oi])) {
      result.push({ type: 'remove', text: oldLines[oi] });
      oi++;
    } else if (ni < newLines.length && !oldSet.has(newLines[ni])) {
      result.push({ type: 'add', text: newLines[ni] });
      ni++;
    } else if (oi < oldLines.length) {
      result.push({ type: 'remove', text: oldLines[oi] });
      oi++;
    } else {
      result.push({ type: 'add', text: newLines[ni] });
      ni++;
    }
  }
  return result;
}

export default function DiffViewer({ leftContent, rightContent, leftTitle, rightTitle, onClose }: DiffViewerProps) {
  const diff = useMemo(() => {
    const leftLines = htmlToLines(leftContent);
    const rightLines = htmlToLines(rightContent);
    return computeDiff(leftLines, rightLines);
  }, [leftContent, rightContent]);

  const stats = useMemo(() => {
    const added = diff.filter(d => d.type === 'add').length;
    const removed = diff.filter(d => d.type === 'remove').length;
    return { added, removed };
  }, [diff]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2 bg-muted/30">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold">문서 비교</h2>
          <span className="text-xs text-green-600">+{stats.added} 추가</span>
          <span className="text-xs text-red-600">-{stats.removed} 삭제</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Column Headers */}
      <div className="flex border-b border-border">
        <div className="flex-1 px-4 py-1 text-xs font-medium text-muted-foreground bg-red-50 dark:bg-red-950/20 border-r border-border">
          {leftTitle} (이전)
        </div>
        <div className="flex-1 px-4 py-1 text-xs font-medium text-muted-foreground bg-green-50 dark:bg-green-950/20">
          {rightTitle} (이후)
        </div>
      </div>

      {/* Diff Content */}
      <div className="flex-1 overflow-auto">
        <div className="font-mono text-sm">
          {diff.map((line, idx) => (
            <div
              key={idx}
              className={
                line.type === 'add'
                  ? 'bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300'
                  : line.type === 'remove'
                  ? 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300'
                  : 'text-foreground'
              }
            >
              <div className="flex">
                <span className="w-8 text-right text-xs text-muted-foreground pr-2 select-none border-r border-border">
                  {idx + 1}
                </span>
                <span className="w-6 text-center text-xs select-none">
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                </span>
                <span className="flex-1 px-2 whitespace-pre-wrap break-all">
                  {line.text || '\u00A0'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
