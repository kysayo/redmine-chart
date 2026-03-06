import GanttChart from './components/GanttChart'
import { dummyTasks } from './utils/dummyData'

function App() {
  return (
    <div style={{ padding: '16px' }}>
      <h2 style={{ marginBottom: '12px' }}>ガントチャート（ダミーデータ）</h2>
      <GanttChart tasks={dummyTasks} />
    </div>
  )
}

export default App
