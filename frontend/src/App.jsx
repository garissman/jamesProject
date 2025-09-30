import { useState } from 'react'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('settings')
  const [selectedWell, setSelectedWell] = useState('G3')

  // Initialize 96-well plate data (8 rows x 12 columns)
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
  const columns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

  // Sample data for wells with their types and labels
  const [wellData, setWellData] = useState({
    'A1': { type: 'empty', label: '' },
    'A2': { type: 'pc', label: 'PC' },
    'A3': { type: 'pc', label: 'PC' },
    'A4': { type: 'pc', label: 'PC' },
    'A5': { type: '05', label: '05' },
    'A6': { type: 'pc', label: 'PC' },
    'A7': { type: 'pc', label: 'PC' },
    'A8': { type: 'nc', label: 'NC' },
    'A9': { type: 'nc', label: 'NC' },
    'B2': { type: 'nc', label: 'NC' },
    'B3': { type: '01', label: '01' },
    'B4': { type: '01', label: '01' },
    'B9': { type: 'nc', label: 'NC' },
    'C1': { type: 'sd', label: 'SD' },
    'C2': { type: 'sd', label: 'SD' },
    'C3': { type: 'sd', label: 'SD' },
    'C4': { type: 'sd', label: 'SD' },
    'C5': { type: 'sd', label: 'SD' },
    'C6': { type: 'sd', label: 'SD' },
    'C7': { type: 'sd', label: 'SD' },
    'C8': { type: 'sd', label: 'SD' },
    'C9': { type: 'sd', label: 'SD' },
    'C10': { type: 'sd', label: 'SD' },
    'C11': { type: 'sd', label: 'SD' },
    'C12': { type: 'sd', label: 'SD' },
    'D1': { type: 'selected', label: '' },
    'D2': { type: 'nc', label: 'NC' },
    'D3': { type: '03', label: '03' },
    'D4': { type: '03', label: '03' },
    'D9': { type: '01', label: '01' },
    'E3': { type: '01', label: '01' },
    'E4': { type: '01', label: '01' },
    'F3': { type: '02', label: '02' },
    'F4': { type: '02', label: '02' },
    'G1': { type: 'sd-03', label: 'SD 03' },
    'G3': { type: '03', label: '03' },
    'G4': { type: '03', label: '03' },
  })

  const getWellType = (row, col) => {
    const wellId = `${row}${col}`
    return wellData[wellId] || { type: 'empty', label: '' }
  }

  const handleWellClick = (row, col) => {
    setSelectedWell(`${row}${col}`)
  }

  const handleDeleteAll = () => {
    setWellData({})
  }

  return (
    <div className="App">
      {/* Navigation */}
      <nav className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'protocol' ? 'active' : ''}`}
          onClick={() => setActiveTab('protocol')}
        >
          <span className="nav-icon">☐</span> Protocol
        </button>
        <button
          className={`nav-tab ${activeTab === 'results' ? 'active' : ''}`}
          onClick={() => setActiveTab('results')}
        >
          <span className="nav-icon">◇</span> Results
        </button>
        <button
          className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <span className="nav-icon">⚙</span> Settings
        </button>
        <button className="nav-tab info-btn">ⓘ</button>
      </nav>

      <div className="plate-container">
        {/* Plate Layout Section */}
        <div className="plate-section">
          <div className="plate-header">
            <h2>Plate layout</h2>
            <div className="plate-info">
              <span>Well: {selectedWell}</span>
              <span>Plate: 96 wells</span>
            </div>
          </div>

          <div className="plate-grid-wrapper">
            {/* Column headers */}
            <div className="column-headers">
              <div className="row-label-space"></div>
              {columns.map(col => (
                <div key={col} className="column-header">{col}</div>
              ))}
            </div>

            {/* Grid with row labels */}
            {rows.map(row => (
              <div key={row} className="plate-row">
                <div className="row-label">{row}</div>
                {columns.map(col => {
                  const well = getWellType(row, col)
                  const wellId = `${row}${col}`
                  return (
                    <div
                      key={wellId}
                      className={`well well-${well.type} ${selectedWell === wellId ? 'selected' : ''}`}
                      onClick={() => handleWellClick(row, col)}
                    >
                      {well.label}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel */}
        <div className="right-panel">
          {/* Legend */}
          <div className="legend">
            <div className="legend-grid">
              <div className="legend-item">
                <div className="legend-well well-nc">NC</div>
                <span>NC</span>
              </div>
              <div className="legend-item">
                <div className="legend-well well-bk">BK</div>
                <span>BK</span>
              </div>
              <div className="legend-item">
                <div className="legend-well well-sd-03">SD<br/>03</div>
              </div>
              <div className="legend-item">
                <div className="legend-well well-qc-01">QC<br/>01</div>
              </div>
              <div className="legend-item">
                <div className="legend-well well-ud">UD</div>
              </div>
              <div className="legend-item">
                <div className="legend-well well-ep">EP</div>
              </div>
            </div>
          </div>

          {/* Concentration Section */}
          <div className="concentration-section">
            <h3>Concentration</h3>
          </div>

          {/* Action Buttons */}
          <div className="action-buttons">
            <button className="btn btn-delete" onClick={handleDeleteAll}>
              Delete all
            </button>
            <button className="btn btn-primary">OK</button>
            <button className="btn btn-secondary">Back</button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="footer">
        <span>🕐 10:51:08 05/16/2017</span>
      </div>
    </div>
  )
}

export default App