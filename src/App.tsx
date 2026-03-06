import GanttChart from './components/GanttChart'
import { dummyGroups, dummyItems } from './utils/dummyData'

function App() {
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
      <GanttChart groups={dummyGroups} items={dummyItems} />
    </div>
  )
}

export default App
