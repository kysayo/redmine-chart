import { useState, useEffect } from 'react'
import GanttChart from './components/GanttChart'
import { fetchIssue, fetchChildIssues, issuesToGantt } from './utils/redmine'
import type { DataGroup, DataItem } from 'vis-timeline'

function getCurrentIssueId(): number | null {
  const match = window.location.pathname.match(/\/issues\/(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

export default function App() {
  const [groups, setGroups] = useState<DataGroup[]>([])
  const [items, setItems] = useState<DataItem[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = getCurrentIssueId()
    if (id === null) return

    Promise.all([fetchIssue(id), fetchChildIssues(id)])
      .then(([parent, children]) => {
        const { groups, items } = issuesToGantt(parent, children)
        setGroups(groups)
        setItems(items)
      })
      .catch(err => setError(String(err)))
  }, [])

  return (
    <div style={{ margin: '10px 0' }}>
      <div style={{
        background: '#f6f7f8',
        borderTop: '2px solid #628db6',
        padding: '6px 8px',
        marginBottom: '6px',
        fontWeight: 'bold',
        fontSize: '0.9em',
      }}>
        Chart
      </div>
      {error
        ? <div style={{ color: 'red', padding: '8px' }}>エラー: {error}</div>
        : <GanttChart groups={groups} items={items} />
      }
    </div>
  )
}
