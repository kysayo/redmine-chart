import { useEffect, useMemo, useRef, useState } from 'react'
import type { FieldDef, GanttRow, InazumaSettings, TimelineScale } from '../types'
import { dayOfWeek, dayParts, formatDay, monthStart, todayDay } from '../utils/dateUtils'
import { getFieldValue } from '../utils/fields'
import { buildInazumaPolyline } from '../utils/inazuma/compute'
import { STRATEGIES } from '../utils/inazuma/strategies'

const ROW_H = 26
const HEAD_H = 40
const NAME_W = 300
const COL_W = 100
const PX_PER_DAY: Record<TimelineScale, number> = { day: 24, week: 9, month: 3 }

interface Props {
  rows: GanttRow[]
  fields: FieldDef[]
  columns: string[]
  scale: TimelineScale
  inazuma: InazumaSettings
  baseDay: number
  onToggle: (nodeId: string) => void
}

interface MonthSeg {
  from: number
  to: number // 排他
  label: string
}

function computeRange(rows: GanttRow[], extraDays: number[]): { minDay: number; maxDay: number } {
  const days = [...extraDays]
  for (const r of rows) {
    if (r.node.start != null) days.push(r.node.start)
    if (r.node.end != null) days.push(r.node.end)
  }
  const lo = Math.min(...days) - 7
  const hi = Math.max(...days) + 14
  // 週の頭(月曜)に揃える
  const minDay = lo - ((dayOfWeek(lo) + 6) % 7)
  return { minDay, maxDay: hi }
}

function buildMonthSegments(minDay: number, maxDay: number): MonthSeg[] {
  const segs: MonthSeg[] = []
  let cursor = monthStart(minDay)
  while (cursor <= maxDay) {
    const next = monthStart(cursor + 31)
    const { y, m } = dayParts(cursor)
    segs.push({ from: Math.max(cursor, minDay), to: Math.min(next, maxDay + 1), label: `${y}/${m}` })
    cursor = next
  }
  return segs
}

export default function GanttChart({ rows, fields, columns, scale, inazuma, baseDay, onToggle }: Props) {
  const px = PX_PER_DAY[scale]
  const today = todayDay()

  const innerRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef<HTMLDivElement>(null)
  // 画面上部に追従させる親行(rows のインデックス。上位の階層から順)
  const [stickyIdx, setStickyIdx] = useState<number[]>([])

  const { minDay, maxDay } = useMemo(() => computeRange(rows, [today, baseDay]), [rows, today, baseDay])
  const monthSegs = useMemo(() => buildMonthSegments(minDay, maxDay), [minDay, maxDay])

  const fieldName = (key: string) => fields.find(f => f.key === key)?.name ?? key
  const leftW = NAME_W + COL_W * columns.length
  const days = maxDay - minDay + 1
  const timeW = days * px
  const bodyH = rows.length * ROW_H
  const x = (day: number) => (day - minDay) * px

  const inazumaLine = useMemo(() => {
    if (!inazuma.enabled) return ''
    const strategy = STRATEGIES[inazuma.strategy]
    if (!strategy) return ''
    const points = strategy.computePoints(rows, { baseDay })
    return buildInazumaPolyline(
      points,
      (baseDay - minDay) * px + px / 2,
      px,
      i => i * ROW_H + ROW_H / 2,
      0,
      bodyH,
    )
  }, [inazuma, rows, baseDay, minDay, px, bodyH])

  // 各行の親行のインデックス(深さの連なりから求める)。-1 は親なし
  const parentIdx = useMemo(() => {
    const stack: number[] = []
    return rows.map((r, i) => {
      const d = r.node.depth
      stack.length = d
      const parent = d > 0 ? (stack[d - 1] ?? -1) : -1
      stack[d] = i
      return parent
    })
  }, [rows])

  // ページのスクロールに合わせて、見出しと「親階層の追従行」を更新する
  useEffect(() => {
    const ancestorsOf = (idx: number): number[] => {
      const chain: number[] = []
      for (let p = parentIdx[idx]; p != null && p >= 0; p = parentIdx[p]) chain.unshift(p)
      return chain
    }

    const update = () => {
      const inner = innerRef.current
      if (!inner) return
      // 見出しがビューポート上端に固定されたときの、チャート上端からのずれ(px)
      const sy = Math.min(Math.max(0, -inner.getBoundingClientRect().top), bodyH)
      const t = `translateY(${sy}px)`
      if (headRef.current) headRef.current.style.transform = t
      if (stickyRef.current) stickyRef.current.style.transform = t

      // 追従行を除いた先頭の行 → その親を追従させる。追従行の数で先頭が変わるので収束するまで繰り返す
      let chain: number[] = []
      if (sy > 0 && rows.length > 0) {
        for (let n = 0; n < 5; n++) {
          const idx = Math.min(rows.length - 1, Math.floor((sy + chain.length * ROW_H) / ROW_H))
          const next = ancestorsOf(idx)
          const stable = next.length === chain.length
          chain = next
          if (stable) break
        }
      }
      setStickyIdx(prev =>
        prev.length === chain.length && prev.every((v, i) => v === chain[i]) ? prev : chain,
      )
    }

    // どの要素がスクロールしても拾えるよう capture で購読する
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    const raf = requestAnimationFrame(update)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [rows, parentIdx, bodyH])

  // 週末の網掛け(日・週スケール)
  const weekendDays: number[] = []
  if (scale !== 'month') {
    for (let d = minDay; d <= maxDay; d++) {
      const w = dayOfWeek(d)
      if (w === 0 || w === 6) weekendDays.push(d)
    }
  }

  // 左の表の1行分(階層ツリー + 列)
  const renderLeft = (row: GanttRow) => (
    <div className="rc-left" style={{ width: leftW }}>
      <div className="rc-cell rc-name" style={{ width: NAME_W, paddingLeft: 4 + row.node.depth * 16 }}>
        {row.hasChildren ? (
          <button
            type="button"
            className="rc-toggle"
            onClick={() => onToggle(row.node.id)}
            aria-label={row.collapsed ? '展開' : '折り畳み'}
          >
            {row.collapsed ? '▶' : '▼'}
          </button>
        ) : (
          <span className="rc-toggle-space" />
        )}
        {row.node.kind === 'issue' && row.node.issue ? (
          <a href={`/issues/${row.node.issue.id}`} target="_blank" rel="noopener noreferrer" title={row.node.label}>
            <span className="rc-id">#{row.node.issue.id}</span> {row.node.label}
          </a>
        ) : (
          <span className="rc-group-label" title={row.node.label}>
            {row.node.label}
            <span className="rc-meta">
              {' '}({row.node.issueCount}件・{Math.round(row.node.progress)}%)
            </span>
          </span>
        )}
      </div>
      {columns.map(c => (
        <div key={c} className="rc-cell" style={{ width: COL_W }} title={row.node.issue ? getFieldValue(row.node.issue, c) : ''}>
          {row.node.issue ? getFieldValue(row.node.issue, c) : ''}
        </div>
      ))}
    </div>
  )

  // 1行分のバー。rowTop はその行の上端の y 座標(通常行は i*ROW_H、追従行は 0)
  const renderBar = (row: GanttRow, rowTop: number) => {
    const { node } = row
    if (node.start == null || node.end == null) return null
    const bx = x(node.start)
    const bw = (node.end - node.start + 1) * px
    const isGroup = node.kind === 'group'
    const isParent = node.kind === 'issue' && row.hasChildren
    const h = isGroup ? 6 : isParent ? 8 : 12
    const y = rowTop + (ROW_H - h) / 2
    const cls = isGroup ? 'rc-bar-group' : isParent ? 'rc-bar-parent' : 'rc-bar'
    const tip = node.issue
      ? `#${node.issue.id} ${node.label}\n${formatDay(node.start)} 〜 ${formatDay(node.end)}\n進捗 ${Math.round(node.progress)}%`
      : `${node.label}\n${formatDay(node.start)} 〜 ${formatDay(node.end)}\n進捗 ${Math.round(node.progress)}%`
    return (
      <g key={node.id} className="rc-bar-wrap">
        <title>{tip}</title>
        <rect x={bx} y={y} width={bw} height={h} rx={2} className={`${cls} rc-bar-bg`} />
        <rect x={bx} y={y} width={(bw * node.progress) / 100} height={h} rx={2} className={`${cls} rc-bar-fill`} />
      </g>
    )
  }

  return (
    <div className="rc-scroll">
      <div ref={innerRef} className="rc-inner" style={{ width: leftW + timeW }}>
        {/* ヘッダ(ページのスクロールに追従: transform は ref 経由で更新) */}
        <div ref={headRef} className="rc-head" style={{ height: HEAD_H }}>
          <div className="rc-left rc-left-head" style={{ width: leftW }}>
            <div className="rc-cell rc-name" style={{ width: NAME_W }}>チケット</div>
            {columns.map(c => (
              <div key={c} className="rc-cell" style={{ width: COL_W }}>{fieldName(c)}</div>
            ))}
          </div>
          <svg width={timeW} height={HEAD_H} className="rc-head-svg">
            {monthSegs.map(s => (
              <g key={s.from}>
                <rect x={x(s.from)} y={0} width={(s.to - s.from) * px} height={HEAD_H / 2} className="rc-head-month" />
                <text x={x(s.from) + 4} y={14} className="rc-head-text">{s.label}</text>
              </g>
            ))}
            {scale === 'day' &&
              Array.from({ length: days }, (_, i) => minDay + i).map(d => {
                const w = dayOfWeek(d)
                return (
                  <text
                    key={d}
                    x={x(d) + px / 2}
                    y={34}
                    textAnchor="middle"
                    className={`rc-head-text rc-head-day${w === 0 ? ' rc-sun' : w === 6 ? ' rc-sat' : ''}`}
                  >
                    {dayParts(d).d}
                  </text>
                )
              })}
            {scale === 'week' &&
              Array.from({ length: days }, (_, i) => minDay + i)
                .filter(d => dayOfWeek(d) === 1)
                .map(d => (
                  <g key={d}>
                    <line x1={x(d)} x2={x(d)} y1={HEAD_H / 2} y2={HEAD_H} className="rc-grid" />
                    <text x={x(d) + 2} y={34} className="rc-head-text rc-head-day">
                      {dayParts(d).m}/{dayParts(d).d}
                    </text>
                  </g>
                ))}
          </svg>
        </div>

        {/* 本体 */}
        <div className="rc-body" style={{ height: bodyH }}>
          {rows.map(row => (
            <div key={row.node.id} className="rc-row" style={{ height: ROW_H }}>
              {renderLeft(row)}
            </div>
          ))}

          {/* 画面上部に追従する親階層の行(スクロール位置は ref 経由で更新) */}
          <div ref={stickyRef} className="rc-sticky" style={{ width: leftW + timeW }}>
            {stickyIdx.map(ri => {
              const row = rows[ri]
              if (!row) return null
              return (
                <div key={row.node.id} className="rc-row rc-sticky-row" style={{ height: ROW_H }}>
                  {renderLeft(row)}
                  <svg width={timeW} height={ROW_H} className="rc-sticky-svg">
                    {renderBar(row, 0)}
                  </svg>
                </div>
              )
            })}
          </div>

          <svg className="rc-overlay" style={{ left: leftW }} width={timeW} height={bodyH}>
            {weekendDays.map(d => (
              <rect key={d} x={x(d)} y={0} width={px} height={bodyH} className="rc-weekend" />
            ))}
            {monthSegs.map(s => (
              <line key={s.from} x1={x(s.from)} x2={x(s.from)} y1={0} y2={bodyH} className="rc-grid" />
            ))}
            {rows.map((_, i) => (
              <line key={i} x1={0} x2={timeW} y1={(i + 1) * ROW_H} y2={(i + 1) * ROW_H} className="rc-grid-h" />
            ))}

            {/* 今日 */}
            <line x1={x(today) + px / 2} x2={x(today) + px / 2} y1={0} y2={bodyH} className="rc-today" />

            {/* バー */}
            {rows.map((row, i) => renderBar(row, i * ROW_H))}

            {/* イナズマ線 */}
            {inazuma.enabled && (
              <>
                <line
                  x1={(baseDay - minDay) * px + px / 2}
                  x2={(baseDay - minDay) * px + px / 2}
                  y1={0}
                  y2={bodyH}
                  className="rc-base"
                />
                {inazumaLine && <polyline points={inazumaLine} className="rc-inazuma" />}
              </>
            )}
          </svg>
        </div>
      </div>
    </div>
  )
}
