import * as XLSX from 'xlsx'

export type CellValue = string | number
export interface SheetData {
  name: string
  data: CellValue[][]
}

export interface ParsedExcel {
  sheets: SheetData[]
}

/** Parse an ArrayBuffer (binary xlsx/xls) into structured sheet data */
export function parseExcelFromArrayBuffer(buffer: ArrayBuffer): ParsedExcel {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheets: SheetData[] = workbook.SheetNames.map((name) => {
    const ws = workbook.Sheets[name]
    const json = XLSX.utils.sheet_to_json<CellValue[]>(ws, {
      header: 1,
      defval: '',
    })
    return { name, data: json }
  })
  return { sheets }
}

/** Parse CSV text content into a single sheet */
export function parseExcelFromContent(content: string): ParsedExcel {
  const workbook = XLSX.read(content, { type: 'string' })
  const sheets: SheetData[] = workbook.SheetNames.map((name) => {
    const ws = workbook.Sheets[name]
    const json = XLSX.utils.sheet_to_json<CellValue[]>(ws, {
      header: 1,
      defval: '',
    })
    return { name, data: json }
  })
  return { sheets }
}

/** Generate XLSX binary (ArrayBuffer) from sheet data */
export function generateExcelBuffer(sheets: SheetData[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.data)
    XLSX.utils.book_append_sheet(workbook, ws, sheet.name)
  }
  const out = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return out as ArrayBuffer
}

/** Trim trailing empty rows and columns */
function trimData(data: CellValue[][]): CellValue[][] {
  if (data.length === 0) return data

  // Find last row with data
  let lastRow = data.length - 1
  while (lastRow >= 0 && data[lastRow].every((c) => c === '' || c === undefined || c === null)) {
    lastRow--
  }
  if (lastRow < 0) return []

  // Find last col with data across all remaining rows
  let lastCol = 0
  for (let r = 0; r <= lastRow; r++) {
    for (let c = data[r].length - 1; c > lastCol; c--) {
      if (data[r][c] !== '' && data[r][c] !== undefined && data[r][c] !== null) {
        lastCol = c
      }
    }
  }

  return data.slice(0, lastRow + 1).map((row) => row.slice(0, lastCol + 1))
}

/** Convert sheet data to an HTML table string (for viewer preview) */
export function sheetToHtmlTable(data: CellValue[][]): string {
  const trimmed = trimData(data)
  if (trimmed.length === 0) return '<p>데이터가 없습니다.</p>'

  let html = '<table style="border-collapse:collapse;width:100%;">'

  // First row as header
  html += '<thead><tr>'
  const headerRow = trimmed[0]
  for (const cell of headerRow) {
    html += `<th style="border:1px solid #ddd;padding:6px 10px;background:#f5f5f5;text-align:left;font-size:13px;">${escapeHtml(String(cell))}</th>`
  }
  html += '</tr></thead>'

  // Remaining rows as body
  if (trimmed.length > 1) {
    html += '<tbody>'
    for (let r = 1; r < trimmed.length; r++) {
      html += '<tr>'
      for (const cell of trimmed[r]) {
        const isNum = typeof cell === 'number'
        html += `<td style="border:1px solid #ddd;padding:4px 10px;font-size:13px;${isNum ? 'text-align:right;' : ''}">${escapeHtml(String(cell))}</td>`
      }
      html += '</tr>'
    }
    html += '</tbody>'
  }

  html += '</table>'
  return html
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
