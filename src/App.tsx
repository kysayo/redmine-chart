import { useState, useEffect, useMemo } from 'react'
import Select from 'react-select'
import GanttChart from './components/GanttChart'
import {
  fetchChildIssues,
  fetchGrandChildren,
  issuesToGantt,
  buildGroupOptions,
} from './utils/redmine'
import type { RedmineIssue, GroupField, GroupOption } from './utils/redmine'

function getCurrentIssueId(): number | null {
  const match = window.location.pathname.match(/\/issues\/(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

export default function App() {
  const [children, setChildren] = useState<RedmineIssue[]>([])
  const [grandChildren, setGrandChildren] = useState<Map<number, RedmineIssue[]>>(new Map())
  const [groupByField, setGroupByField] = useState<GroupField | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = getCurrentIssueId()
    if (id === null) return

    fetchChildIssues(id)
      .then(async c => {
        setChildren(c)
        const gc = await fetchGrandChildren(c)
        setGrandChildren(gc)
      })
      .catch(err => setError(String(err)))
  }, [])

  const groupOptions = useMemo(
    () => buildGroupOptions(children),
    [children],
  )

  const { groups, items } = useMemo(
    () => issuesToGantt(children, grandChildren, groupByField ?? undefined),
    [children, grandChildren, groupByField],
  )

  const selectedOption = groupOptions.find(
    o => JSON.stringify(o.field) === JSON.stringify(groupByField)
  ) ?? null

  return (
    <div style={{ margin: '10px 0' }}>
      <div style={{
        background: '#f6f7f8',
        borderTop: '2px solid #628db6',
        padding: '6px 8px',
        marginBottom: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontWeight: 'bold', fontSize: '0.9em' }}>Chart</span>
        <div style={{ width: 220 }}>
          <Select<GroupOption>
            options={groupOptions}
            value={selectedOption}
            onChange={opt => setGroupByField(opt?.field ?? null)}
            isClearable
            placeholder="グルーピング..."
            menuPortalTarget={document.body}
            styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
          />
        </div>
      </div>
      {error
        ? <div style={{ color: 'red', padding: '8px' }}>エラー: {error}</div>
        : <GanttChart groups={groups} items={items} />
      }
    </div>
  )
}
