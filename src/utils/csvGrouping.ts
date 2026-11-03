import type { GroupingDef } from '../types'

/** CSV のバイト列を文字列にする。UTF-8 として読めなければ Shift-JIS(Excel の既定)とみなす */
export function decodeCsv(buf: ArrayBuffer): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    // 先頭の BOM(U+FEFF)を除く
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  } catch {
    return new TextDecoder('shift_jis').decode(buf)
  }
}

/** 引用符・改行(CRLF/LF)に対応した簡易 CSV パーサ。空行は捨てる */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
    } else {
      cell += c
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

export interface CsvGroupingDraft {
  /** グルーピング名(CSV のヘッダー) */
  name: string
  groups: GroupingDef['groups']
}

export interface CsvGroupingResult {
  /** CSV 1列目のヘッダー(対象項目の名前) */
  fieldHeader: string
  drafts: CsvGroupingDraft[]
  /** 重複を除いた値の数 */
  valueCount: number
  /** 同じ値が列内で別のグループに割り当てられていた場合のメッセージ(先に出たものを採用) */
  conflicts: string[]
  /** 1列目が空の行など、読み飛ばした行数 */
  skippedRows: number
}

/**
 * 1列目=項目の値、2列目以降=グルーピング(ヘッダーがグルーピング名、セルがグループ名)として読む。
 * グループの並びは CSV での出現順。セルが空の値は、その列のどのグループにも入れない。
 */
export function buildGroupingsFromCsv(rows: string[][]): CsvGroupingResult | null {
  if (rows.length < 2 || rows[0].length < 2) return null
  const header = rows[0].map(h => h.trim())
  const axes = header.slice(1).map((name, i) => name || `列${i + 2}`)

  const order: Array<string[]> = axes.map(() => [])
  const members: Array<Map<string, string[]>> = axes.map(() => new Map())
  const assigned: Array<Map<string, string>> = axes.map(() => new Map())
  const allValues = new Set<string>()
  const conflicts: string[] = []
  let skippedRows = 0

  for (const row of rows.slice(1)) {
    const value = (row[0] ?? '').trim()
    if (value === '') {
      skippedRows++
      continue
    }
    allValues.add(value)
    axes.forEach((axisName, j) => {
      const group = (row[j + 1] ?? '').trim()
      if (group === '') return
      const prev = assigned[j].get(value)
      if (prev != null) {
        if (prev !== group) conflicts.push(`${axisName}: 「${value}」が「${prev}」と「${group}」に割り当てられています(「${prev}」を採用)`)
        return
      }
      assigned[j].set(value, group)
      if (!members[j].has(group)) {
        members[j].set(group, [])
        order[j].push(group)
      }
      members[j].get(group)!.push(value)
    })
  }

  return {
    fieldHeader: header[0],
    drafts: axes.map((name, j) => ({
      name,
      groups: order[j].map(g => ({ name: g, values: members[j].get(g)! })),
    })),
    valueCount: allValues.size,
    conflicts,
    skippedRows,
  }
}
