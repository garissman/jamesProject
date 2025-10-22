import {useEffect, useState} from 'react'
import './App.css'

function App() {
    const [activeTab, setActiveTab] = useState('settings')
    const [selectedWell, setSelectedWell] = useState('A1')

    // Program tab state
    const [cycles, setCycles] = useState(1)
    const [pickupWell, setPickupWell] = useState('')
    const [dropoffWell, setDropoffWell] = useState('')
    const [rinseWell, setRinseWell] = useState('')
    const [waitTime, setWaitTime] = useState('')
    const [sampleVolume, setSampleVolume] = useState('')
    const [steps, setSteps] = useState([])
    const [isExecuting, setIsExecuting] = useState(false)
    const [systemStatus, setSystemStatus] = useState('Connecting...')
    const [logs, setLogs] = useState([])

    const handleAddStep = () => {
        if (pickupWell) {
            const newStep = {
                id: Date.now(),
                cycles: Number(cycles),
                pickupWell,
                dropoffWell,
                rinseWell,
                waitTime,
                sampleVolume
            }
            setSteps([...steps, newStep])
            // Reset form
            setCycles(1)
            setPickupWell('')
            setDropoffWell('')
            setRinseWell('')
            setWaitTime('')
            setSampleVolume('')
        }
    }

    // Initialize 96-well plate data (8 rows x 12 columns)
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    const columns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

    // Sample data for wells with their types and labels
    const [wellData, setWellData] = useState({
        'A1': {type: 'empty', label: ''},
        'A2': {type: 'pc', label: 'PC'},
        'A3': {type: 'pc', label: 'PC'},
        'A4': {type: 'pc', label: 'PC'},
        'A5': {type: '05', label: '05'},
        'A6': {type: 'pc', label: 'PC'},
        'A7': {type: 'pc', label: 'PC'},
        'A8': {type: 'nc', label: 'NC'},
        'A9': {type: 'nc', label: 'NC'},
        'B2': {type: 'nc', label: 'NC'},
        'B3': {type: '01', label: '01'},
        'B4': {type: '01', label: '01'},
        'B9': {type: 'nc', label: 'NC'},
        'C1': {type: 'sd', label: 'SD'},
        'C2': {type: 'sd', label: 'SD'},
        'C3': {type: 'sd', label: 'SD'},
        'C4': {type: 'sd', label: 'SD'},
        'C5': {type: 'sd', label: 'SD'},
        'C6': {type: 'sd', label: 'SD'},
        'C7': {type: 'sd', label: 'SD'},
        'C8': {type: 'sd', label: 'SD'},
        'C9': {type: 'sd', label: 'SD'},
        'C10': {type: 'sd', label: 'SD'},
        'C11': {type: 'sd', label: 'SD'},
        'C12': {type: 'sd', label: 'SD'},
        'D1': {type: 'empty', label: ''},
        'D2': {type: 'nc', label: 'NC'},
        'D3': {type: '03', label: '03'},
        'D4': {type: '03', label: '03'},
        'D9': {type: '01', label: '01'},
        'E3': {type: '01', label: '01'},
        'E4': {type: '01', label: '01'},
        'F3': {type: '02', label: '02'},
        'F4': {type: '02', label: '02'},
        'G1': {type: 'sd-03', label: 'SD 03'},
        'G3': {type: '03', label: '03'},
        'G4': {type: '03', label: '03'},
    })

    const getWellType = (row, col) => {
        const wellId = `${row}${col}`
        return wellData[wellId] || {type: 'empty', label: ''}
    }

    const handleDeleteAll = () => {
        setWellData({})
    }

    const handleSaveProgram = () => {
        if (steps.length === 0) {
            alert('No program steps to save.')
            return
        }

        // Create JSON file with program data
        const programData = {
            version: "1.0",
            created: new Date().toISOString(),
            steps: steps
        }

        const jsonString = JSON.stringify(programData, null, 2)
        const blob = new Blob([jsonString], { type: 'application/json' })
        const url = URL.createObjectURL(blob)

        // Create download link
        const link = document.createElement('a')
        link.href = url
        link.download = `pipetting_program_${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        alert(`Program saved with ${steps.length} step(s)`)
    }

    const handleLoadProgram = (event) => {
        const file = event.target.files[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const programData = JSON.parse(e.target.result)

                // Validate the program data
                if (!programData.steps || !Array.isArray(programData.steps)) {
                    alert('Invalid program file format')
                    return
                }

                // Load the steps
                setSteps(programData.steps)
                alert(`Program loaded successfully with ${programData.steps.length} step(s)`)

                // Clear the file input so the same file can be loaded again if needed
                event.target.value = null
            } catch (error) {
                alert(`Error loading program: ${error.message}`)
            }
        }

        reader.readAsText(file)
    }

    const handleExecute = async () => {
        if (steps.length === 0) {
            alert('No steps to execute. Please add steps first.')
            return
        }

        // Switch to plate layout tab to show real-time position
        setActiveTab('protocol')

        setIsExecuting(true)

        try {
            const response = await fetch('http://localhost:8000/api/pipetting/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({steps})
            })

            const data = await response.json()

            if (response.ok) {
                alert(`Success! ${data.message}\n\nSteps executed: ${data.steps_executed}`)
                // Update current position after execution
                fetchCurrentPosition()
                // Optionally clear steps after successful execution
                // setSteps([])
            } else {
                alert(`Error: ${data.detail || 'Failed to execute sequence'}`)
            }
        } catch (error) {
            alert(`Error: Unable to connect to backend.\n${error.message}\n\nMake sure the backend is running on http://localhost:8000`)
        } finally {
            setIsExecuting(false)
        }
    }

    const handleStop = async () => {
        if (!isExecuting) {
            return
        }

        try {
            const response = await fetch('http://localhost:8000/api/pipetting/stop', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            })

            const data = await response.json()

            if (response.ok) {
                alert(`${data.message}`)
                setIsExecuting(false)
                // Update current position after stopping
                fetchCurrentPosition()
            } else {
                alert(`Error: ${data.detail || 'Failed to stop execution'}`)
            }
        } catch (error) {
            alert(`Error: Unable to connect to backend.\n${error.message}`)
        }
    }

    const handleHome = async () => {
        try {
            const response = await fetch('http://localhost:8000/api/pipetting/home', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            })

            const data = await response.json()

            if (response.ok) {
                alert(`${data.message}`)
                // Update current position after homing
                fetchCurrentPosition()
            } else {
                alert(`Error: ${data.detail || 'Failed to home system'}`)
            }
        } catch (error) {
            alert(`Error: Unable to connect to backend.\n${error.message}\n\nMake sure the backend is running on http://localhost:8000`)
        }
    }

    const fetchCurrentPosition = async () => {
        try {
            const response = await fetch('http://localhost:8000/api/pipetting/status')
            const data = await response.json()

            if (data.initialized && data.current_well) {
                console.log('Current well position:', data.current_well)
                setSelectedWell(data.current_well)
                setSystemStatus(data.message || 'System ready')

                // Update isExecuting state from backend
                if (data.is_executing !== undefined) {
                    setIsExecuting(data.is_executing)
                }
            } else {
                console.log('No position data available:', data)
                setSystemStatus(data.message || 'System not ready')
            }
        } catch (error) {
            console.error('Failed to fetch current position:', error)
            setSystemStatus('Backend offline')
        }
    }

    const fetchLogs = async () => {
        try {
            const response = await fetch('http://localhost:8000/api/pipetting/logs?last_n=100')
            const data = await response.json()

            if (data.logs) {
                setLogs(data.logs)
            }
        } catch (error) {
            console.error('Failed to fetch logs:', error)
        }
    }

    // Fetch current position on component mount and poll regularly
    useEffect(() => {
        // Initial fetch
        fetchCurrentPosition()

        // Poll every 1 second to keep UI in sync with backend
        const interval = setInterval(() => {
            fetchCurrentPosition()
        }, 1000) // Poll every second

        return () => clearInterval(interval)
    }, [])

    // Increase polling frequency during execution
    useEffect(() => {
        let interval
        if (isExecuting) {
            interval = setInterval(() => {
                fetchCurrentPosition()
                fetchLogs() // Also fetch logs during execution
            }, 300) // Poll every 300ms during execution for smooth updates
        }
        return () => {
            if (interval) clearInterval(interval)
        }
    }, [isExecuting])

    // Poll logs regularly
    useEffect(() => {
        // Initial fetch
        fetchLogs()

        // Poll every 2 seconds
        const interval = setInterval(() => {
            fetchLogs()
        }, 2000)

        return () => clearInterval(interval)
    }, [])

    return (
        <div className="App">
            {/* Navigation */}
            <nav className="nav-tabs">
                <button
                    className={`nav-tab ${activeTab === 'protocol' ? 'active' : ''}`}
                    onClick={() => setActiveTab('protocol')}
                >
                    <span className="nav-icon">☐</span>
                    Plate Layout
                </button>
                <button
                    className={`nav-tab ${activeTab === 'program' ? 'active' : ''}`}
                    onClick={() => setActiveTab('program')}
                >
                    <span className="nav-icon">◇</span> Program
                </button>
            </nav>

            <div className="plate-container">
                {/* Conditionally render based on active tab */}
                {activeTab === 'program' ? (
                    /* Program Tab Content */
                    <div className="program-section">
                        <h2>Program Configuration</h2>

                        <div className="program-form">
                            <div className="form-group">
                                <label>Cycles:</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={cycles}
                                    onChange={(e) => setCycles(e.target.value)}
                                    className="form-input"
                                />
                            </div>

                            <div className="form-group">
                                <label>Pickup Well:</label>
                                <input
                                    type="text"
                                    placeholder="e.g., A1"
                                    value={pickupWell}
                                    onChange={(e) => setPickupWell(e.target.value)}
                                    className="form-input"
                                />
                            </div>

                            <div className="form-group">
                                <label>Dropoff Well:</label>
                                <input
                                    type="text"
                                    placeholder="e.g., B2"
                                    value={dropoffWell}
                                    onChange={(e) => setDropoffWell(e.target.value)}
                                    className="form-input"
                                />
                            </div>

                            <div className="form-group">
                                <label>Rinse Well:</label>
                                <input
                                    type="text"
                                    placeholder="e.g., C3"
                                    value={rinseWell}
                                    onChange={(e) => setRinseWell(e.target.value)}
                                    className="form-input"
                                />
                            </div>

                            <div className="form-group">
                                <label>Wait Time (seconds):</label>
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="e.g., 5"
                                    value={waitTime}
                                    onChange={(e) => setWaitTime(e.target.value)}
                                    className="form-input"
                                />
                            </div>

                            <div className="form-group">
                                <label>Sample Volume (mL):</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    placeholder="e.g., 0.5"
                                    value={sampleVolume}
                                    onChange={(e) => setSampleVolume(e.target.value)}
                                    className="form-input"
                                />
                            </div>

                            <button className="btn btn-add-step" onClick={handleAddStep}>
                                Add Step
                            </button>

                            <div className="program-file-actions">
                                <button
                                    className="btn btn-save-program"
                                    onClick={handleSaveProgram}
                                    disabled={steps.length === 0}
                                >
                                    Save Program
                                </button>
                                <label className="btn btn-load-program">
                                    Load Program
                                    <input
                                        type="file"
                                        accept=".json"
                                        onChange={handleLoadProgram}
                                        style={{display: 'none'}}
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Plate Layout Section */
                    <div className="plate-section">
                        <div className="plate-header">
                            <h2>Plate layout</h2>
                            <div className="plate-info">
                                <span>Position: {selectedWell}</span>
                                <span>Status: {systemStatus}</span>
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
                                            >
                                                {wellId}
                                            </div>
                                        )
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Right Panel */}
                <div className="right-panel">
                    {/* Logs Section */}
                    <div className="logs-section">
                        <h3>System Logs</h3>
                        <div className="logs-viewer">
                            {logs.length > 0 ? (
                                logs.map((log, index) => (
                                    <div key={index} className="log-entry">
                                        {log}
                                    </div>
                                ))
                            ) : (
                                <div className="log-placeholder">No logs available</div>
                            )}
                        </div>
                    </div>

                    {/* Concentration Section */}
                    {activeTab === 'program' && (
                        <div className="concentration-section">
                            <h3>Cycles</h3>
                            <div className="steps-list">
                                {steps.map((step, stepIndex) => (
                                    <div key={step.id} className="step-group">
                                        <h4>Cicle {stepIndex + 1}</h4>
                                        {[...Array(step.cycles)].map((_, cycleIndex) => (
                                            <div key={cycleIndex} className="step-cycle">
                                                {step.pickupWell && (
                                                    <div className="step-item">• Pickup from
                                                        well: {step.pickupWell}</div>
                                                )}
                                                {step.sampleVolume && (
                                                    <div className="step-item">• Sample
                                                        volume: {step.sampleVolume} mL</div>
                                                )}
                                                {step.dropoffWell && (
                                                    <div className="step-item">• Dropoff to
                                                        well: {step.dropoffWell}</div>
                                                )}
                                                {step.rinseWell && (
                                                    <div className="step-item">• Rinse at well: {step.rinseWell}</div>
                                                )}
                                                {step.waitTime && (
                                                    <div className="step-item">• Wait: {step.waitTime}s</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                                {steps.length === 0 && (
                                    <div className="step-placeholder">Add steps to see program</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="action-buttons">
                        <button
                            className="btn btn-execute"
                            onClick={handleExecute}
                            disabled={isExecuting || steps.length === 0}
                        >
                            {isExecuting ? 'Executing...' : 'Execute'}
                        </button>
                        <button
                            className="btn btn-stop"
                            onClick={handleStop}
                            disabled={!isExecuting}
                        >
                            Stop
                        </button>
                        <button
                            className="btn btn-home"
                            onClick={handleHome}
                            disabled={isExecuting}
                        >
                            Home
                        </button>
                        <button className="btn btn-delete" onClick={handleDeleteAll}>
                            Delete all
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default App