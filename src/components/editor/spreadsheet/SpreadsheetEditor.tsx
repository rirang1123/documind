import { useState, useCallback, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import type { SheetData, CellValue } from '@/services/document/excelService'

interface Props {
  initialSheets?: SheetData[]
  onChange?: (sheets: SheetData[]) => void
}

const DEFAULT_ROWS = 20
const DEFAULT_COLS = 10

function createEmptyGrid(rows = DEFAULT_ROWS, cols = DEFAULT_COLS): CellValue[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''))
}

function getColumnLabel(index: number): string {
  let label = ''
  let n = index
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  }
  return label
}

export function SpreadsheetEditor({ initialSheets, onChange }: Props) {
  const [sheets, setSheets] = useState<SheetData[]>(() => {
    if (initialSheets && initialSheets.length > 0) return initialSheets
    return [{ name: 'Sheet1', data: createEmptyGrid() }]
  })
  const [activeSheetIdx, setActiveSheetIdx] = useState(0)
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null)
  const [editingCell, setEditingCell] = useState<[number, number] | null>(null)

  // Sync when initialSheets changes (e.g. file switch)
  useEffect(() => {
    if (initialSheets && initialSheets.length > 0) {
      setSheets(initialSheets)
      setActiveSheetIdx(0)
      setSelectedCell(null)
      setEditingCell(null)
    }
  }, [initialSheets])

  const activeSheet = sheets[activeSheetIdx] || sheets[0]
  const data = activeSheet?.data || createEmptyGrid()
  const cols = data[0]?.length || 0

  const updateSheets = useCallback(
    (newSheets: SheetData[]) => {
      setSheets(newSheets)
      onChange?.(newSheets)
    },
    [onChange]
  )

  const updateCell = useCallback(
    (row: number, col: number, value: string) => {
      const newSheets = sheets.map((s, i) => {
        if (i !== activeSheetIdx) return s
        const newData = s.data.map((r) => [...r])
        // Ensure row/col exist
        while (newData.length <= row) {
          newData.push(Array.from({ length: cols }, () => '' as CellValue))
        }
        while (newData[row].length <= col) {
          newData[row].push('')
        }
        // Try to parse as number
        const numVal = value === '' ? '' : Number(value)
        newData[row][col] = value !== '' && !isNaN(numVal as number) ? numVal : value
        return { ...s, data: newData }
      })
      updateSheets(newSheets)
    },
    [sheets, activeSheetIdx, cols, updateSheets]
  )

  const addRow = () => {
    const newSheets = sheets.map((s, i) => {
      if (i !== activeSheetIdx) return s
      const newRow = Array.from({ length: s.data[0]?.length || DEFAULT_COLS }, () => '' as CellValue)
      return { ...s, data: [...s.data, newRow] }
    })
    updateSheets(newSheets)
  }

  const addColumn = () => {
    const newSheets = sheets.map((s, i) => {
      if (i !== activeSheetIdx) return s
      return { ...s, data: s.data.map((row) => [...row, '' as CellValue]) }
    })
    updateSheets(newSheets)
  }

  const addSheet = () => {
    const newName = `Sheet${sheets.length + 1}`
    const newSheets = [...sheets, { name: newName, data: createEmptyGrid() }]
    updateSheets(newSheets)
    setActiveSheetIdx(newSheets.length - 1)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 bg-muted/30">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-3 w-3" />행 추가
        </Button>
        <Button variant="outline" size="sm" onClick={addColumn}>
          <Plus className="mr-1 h-3 w-3" />열 추가
        </Button>
        {selectedCell && (
          <span className="ml-auto text-xs text-muted-foreground">
            {getColumnLabel(selectedCell[1])}{selectedCell[0] + 1}
          </span>
        )}
      </div>

      {/* Sheet */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 min-w-[40px] border border-border bg-muted px-2 py-1 text-center text-xs font-medium text-muted-foreground">
              </th>
              {Array.from({ length: cols }, (_, i) => (
                <th
                  key={i}
                  className="sticky top-0 z-10 min-w-[100px] border border-border bg-muted px-2 py-1 text-center text-xs font-medium text-muted-foreground"
                >
                  {getColumnLabel(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri}>
                <td className="sticky left-0 z-10 border border-border bg-muted px-2 py-1 text-center text-xs font-medium text-muted-foreground">
                  {ri + 1}
                </td>
                {row.map((cell, ci) => {
                  const isSelected = selectedCell?.[0] === ri && selectedCell?.[1] === ci
                  const isEditing = editingCell?.[0] === ri && editingCell?.[1] === ci
                  const isNum = typeof cell === 'number'

                  return (
                    <td
                      key={ci}
                      className={cn(
                        'border border-border px-1 py-0',
                        isSelected && 'outline outline-2 outline-primary -outline-offset-1'
                      )}
                      onClick={() => setSelectedCell([ri, ci])}
                      onDoubleClick={() => setEditingCell([ri, ci])}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          className="w-full h-full border-none bg-transparent px-1 py-0.5 text-sm outline-none"
                          value={String(cell)}
                          onChange={(e) => updateCell(ri, ci, e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              setEditingCell(null)
                              if (ri < data.length - 1) setSelectedCell([ri + 1, ci])
                            }
                            if (e.key === 'Tab') {
                              e.preventDefault()
                              setEditingCell(null)
                              if (ci < cols - 1) setSelectedCell([ri, ci + 1])
                            }
                            if (e.key === 'Escape') setEditingCell(null)
                          }}
                        />
                      ) : (
                        <div className={cn(
                          'min-h-[24px] px-1 py-0.5 text-sm',
                          isNum && 'text-right'
                        )}>
                          {String(cell)}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sheet Tabs */}
      {sheets.length > 0 && (
        <div className="flex items-center gap-0.5 border-t border-border bg-muted/30 px-2 py-1 overflow-x-auto">
          {sheets.map((sheet, idx) => (
            <button
              key={idx}
              onClick={() => {
                setActiveSheetIdx(idx)
                setSelectedCell(null)
                setEditingCell(null)
              }}
              className={cn(
                'px-3 py-1 text-xs rounded-t border border-b-0 cursor-pointer transition-colors',
                idx === activeSheetIdx
                  ? 'bg-background border-border font-medium text-foreground'
                  : 'bg-muted/50 border-transparent text-muted-foreground hover:bg-muted'
              )}
            >
              {sheet.name}
            </button>
          ))}
          <button
            onClick={addSheet}
            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            title="새 시트 추가"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}
