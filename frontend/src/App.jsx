import {useEffect, useRef, useState} from 'react'
import './App.css'

function App() {
    const [activeTab, setActiveTab] = useState('protocol')
    const [selectedWell, setSelectedWell] = useState('A1') // Current motor position
    const [targetWell, setTargetWell] = useState(null) // User-clicked target well
    const [currentPipetteCount, setCurrentPipetteCount] = useState(3) // Current pipette configuration (from backend)
    const [currentOperation, setCurrentOperation] = useState('idle') // Current operation: idle, moving, aspirating, dispensing
    const [operationWell, setOperationWell] = useState(null) // Well where operation is happening
    const [theme, setTheme] = useState(() => {
        // Get theme from localStorage or default to 'light'
        return localStorage.getItem('theme') || 'light'
    })

    // Configuration state
    const [config, setConfig] = useState({
        WELL_SPACING: 4.0,
        WELL_DIAMETER: 8.0,
        WELL_HEIGHT: 14.0,
        STEPS_PER_MM_X: 100,
        STEPS_PER_MM_Y: 100,
        STEPS_PER_MM_Z: 100,
        PIPETTE_STEPS_PER_ML: 1000,
        PICKUP_DEPTH: 10.0,
        DROPOFF_DEPTH: 5.0,
        SAFE_HEIGHT: 20.0,
        RINSE_CYCLES: 3,
        TRAVEL_SPEED: 0.001,
        PIPETTE_SPEED: 0.002
    })
    const [configLoading, setConfigLoading] = useState(false)
    const [configMessage, setConfigMessage] = useState('')

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

    // Repetition mode state
    const [repetitionMode, setRepetitionMode] = useState('quantity') // 'quantity' or 'timeFrequency'
    const [repetitionQuantity, setRepetitionQuantity] = useState(1)
    const [repetitionInterval, setRepetitionInterval] = useState('') // in seconds
    const [repetitionDuration, setRepetitionDuration] = useState('') // total duration in seconds

    // Pipette configuration state
    const [pipetteCount, setPipetteCount] = useState(3) // 1 or 3 pipettes (default: 3)

    // Quick operation state (3-well click mode in Plate Layout tab)
    const [quickOpMode, setQuickOpMode] = useState(false) // Enable/disable quick operation mode
    const [quickOpWells, setQuickOpWells] = useState({
        pickup: null,
        dropoff: null,
        rinse: null
    })
    const [quickOpStep, setQuickOpStep] = useState(0) // 0=pickup, 1=dropoff, 2=rinse
    const [quickOpVolume, setQuickOpVolume] = useState('1.0') // Default volume for quick ops

    // Z-axis toggle state
    const [zAxisUp, setZAxisUp] = useState(true) // true = up, false = down

    // Axis positions state (for Manual tab)
    const [axisPositions, setAxisPositions] = useState({x: 0, y: 0, z: 0, motor_steps: {}})
    const [axisStepInputs, setAxisStepInputs] = useState({x: 10, y: 10, z: 10, pipette: 10})

    // Dispense/Collect state
    const [pipetteVolume, setPipetteVolume] = useState('1.0') // Volume for manual dispense/collect

    // Ref for auto-scrolling logs
    const logsEndRef = useRef(null)
    const previousLogCountRef = useRef(0)

    const validateWellId = (wellId) => {
        if (!wellId || wellId.trim() === '') return true // Empty is OK for optional fields

        // Well ID format: Row (A-H) + Column (1-12)
        const wellPattern = /^[A-H]([1-9]|1[0-2])$/
        return wellPattern.test(wellId.trim().toUpperCase())
    }

    const handleAddStep = () => {
        // Validate required fields
        if (!pickupWell || pickupWell.trim() === '') {
            console.error('Pickup well is required')
            return
        }

        // Validate well IDs
        if (!validateWellId(pickupWell)) {
            console.error('Invalid pickup well ID. Must be in format: Row (A-H) + Column (1-12). Example: A1, B5, H12')
            return
        }

        if (dropoffWell && !validateWellId(dropoffWell)) {
            console.error('Invalid dropoff well ID. Must be in format: Row (A-H) + Column (1-12). Example: A1, B5, H12')
            return
        }

        if (rinseWell && !validateWellId(rinseWell)) {
            console.error('Invalid rinse well ID. Must be in format: Row (A-H) + Column (1-12). Example: A1, B5, H12')
            return
        }

        // Validate other fields
        if (sampleVolume && (Number(sampleVolume) <= 0 || Number(sampleVolume) > 10)) {
            console.error('Sample volume must be between 0 and 10 mL')
            return
        }

        const newStep = {
            id: Date.now(),
            cycles: Number(cycles),
            pickupWell: pickupWell.trim().toUpperCase(),
            dropoffWell: dropoffWell ? dropoffWell.trim().toUpperCase() : '',
            rinseWell: rinseWell ? rinseWell.trim().toUpperCase() : '',
            waitTime,
            sampleVolume,
            repetitionMode,
            repetitionQuantity: repetitionMode === 'quantity' ? Number(repetitionQuantity) : 1,
            repetitionInterval: repetitionMode === 'timeFrequency' ? Number(repetitionInterval) : null,
            repetitionDuration: repetitionMode === 'timeFrequency' ? Number(repetitionDuration) : null,
            pipetteCount: Number(pipetteCount)
        }
        setSteps([...steps, newStep])

        // Reset form
        setCycles(1)
        setPickupWell('')
        setDropoffWell('')
        setRinseWell('')
        setWaitTime('')
        setSampleVolume('')
        setRepetitionMode('quantity')
        setRepetitionQuantity(1)
        setRepetitionInterval('')
        setRepetitionDuration('')
        setPipetteCount(3) // Reset to default (3 pipettes)
    }

    // Initialize 96-well plate data (8 rows x 12 columns)
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    const columns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

    // Well data - all wells start empty by default
    const [wellData, setWellData] = useState({})

    const getWellType = (row, col) => {
        const wellId = `${row}${col}`
        return wellData[wellId] || {type: 'empty', label: ''}
    }

    // Calculate which wells should be highlighted based on pipette configuration
    const getPipetteWells = (centerWell, pipetteCount) => {
        if (!centerWell || pipetteCount === 1) {
            return [centerWell]
        }

        // For 3 pipettes: center, left, and right
        const match = centerWell.match(/^([A-H])(\d+)$/)
        if (!match) return [centerWell]

        const row = match[1]
        const col = parseInt(match[2])

        const wells = []

        // Left well (col - 1)
        if (col > 1) {
            wells.push(`${row}${col - 1}`)
        }

        // Center well
        wells.push(centerWell)

        // Right well (col + 1)
        if (col < 12) {
            wells.push(`${row}${col + 1}`)
        }

        return wells
    }

    const handleDeleteAll = () => {
        if (steps.length > 0) {
            if (window.confirm(`Are you sure you want to delete all ${steps.length} step(s)?`)) {
                setSteps([])
            }
        }
    }

    const handleSaveProgram = () => {
        if (steps.length === 0) {
            console.error('No program steps to save.')
            return
        }

        // Create JSON file with program data
        const programData = {
            version: "1.0",
            created: new Date().toISOString(),
            steps: steps
        }

        const jsonString = JSON.stringify(programData, null, 2)
        const blob = new Blob([jsonString], {type: 'application/json'})
        const url = URL.createObjectURL(blob)

        // Create download link
        const link = document.createElement('a')
        link.href = url
        link.download = `pipetting_program_${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        console.log(`Program saved with ${steps.length} step(s)`)
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
                    console.error('Invalid program file format')
                    return
                }

                // Load the steps
                setSteps(programData.steps)
                console.log(`Program loaded successfully with ${programData.steps.length} step(s)`)

                // Clear the file input so the same file can be loaded again if needed
                event.target.value = null
            } catch (error) {
                console.error(`Error loading program: ${error.message}`)
            }
        }

        reader.readAsText(file)
    }

    const handleExecute = async () => {
        if (steps.length === 0) {
            console.error('No steps to execute. Please add steps first.')
            return
        }

        // Switch to plate layout tab to show real-time position
        setActiveTab('protocol')

        setIsExecuting(true)

        try {
            const response = await fetch('/api/pipetting/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({steps})
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`Success! ${data.message} - Steps executed: ${data.steps_executed}`)
                // Update current position after execution
                fetchCurrentPosition()
                // Optionally clear steps after successful execution
                // setSteps([])
            } else {
                console.error(`Error: ${data.detail || 'Failed to execute sequence'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to connect to backend. ${error.message}`)
        } finally {
            setIsExecuting(false)
        }
    }

    const handleStop = async () => {
        if (!isExecuting) {
            return
        }

        try {
            const response = await fetch('/api/pipetting/stop', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`${data.message}`)
                setIsExecuting(false)
                // Update current position after stopping
                fetchCurrentPosition()
            } else {
                console.error(`Error: ${data.detail || 'Failed to stop execution'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to connect to backend. ${error.message}`)
        }
    }

    const handleHome = async () => {
        try {
            const response = await fetch('/api/pipetting/home', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`${data.message}`)
                // Update current position after homing
                fetchCurrentPosition()
            } else {
                console.error(`Error: ${data.detail || 'Failed to home system'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to connect to backend. ${error.message}`)
        }
    }

    const handleSetPipetteCount = async (count) => {
        try {
            const response = await fetch('/api/pipetting/set-pipette-count', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({pipetteCount: count})
            })

            const data = await response.json()

            if (response.ok) {
                setCurrentPipetteCount(count)
                console.log(`${data.message}`)
                // Update status to sync with backend
                fetchCurrentPosition()
            } else {
                console.error(`Error: ${data.detail || 'Failed to set pipette count'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to connect to backend. ${error.message}`)
        }
    }

    const handleWellClick = (wellId) => {
        // If quick operation mode is enabled, capture wells in sequence
        if (quickOpMode) {
            if (quickOpStep === 0) {
                // First click: set pickup well
                setQuickOpWells(prev => ({...prev, pickup: wellId}))
                setQuickOpStep(1)
            } else if (quickOpStep === 1) {
                // Second click: set dropoff well
                setQuickOpWells(prev => ({...prev, dropoff: wellId}))
                setQuickOpStep(2)
            } else if (quickOpStep === 2) {
                // Third click: set rinse well
                setQuickOpWells(prev => ({...prev, rinse: wellId}))
                // Keep at step 2 so user can see all selections before executing
            }
        } else {
            // Default behavior: set the target well for moving
            setTargetWell(wellId)
        }
    }

    const handleEnableQuickOp = () => {
        setQuickOpMode(true)
        setQuickOpStep(0)
        setQuickOpWells({pickup: null, dropoff: null, rinse: null})
    }

    const handleCancelQuickOp = () => {
        setQuickOpMode(false)
        setQuickOpStep(0)
        setQuickOpWells({pickup: null, dropoff: null, rinse: null})
    }

    const handleExecuteQuickOp = async () => {
        const {pickup, dropoff, rinse} = quickOpWells

        if (!pickup || !dropoff || !rinse) {
            console.error('Please select all three wells (pickup, dropoff, and rinse)')
            return
        }

        const volume = parseFloat(quickOpVolume)
        if (isNaN(volume) || volume <= 0 || volume > 10) {
            console.error('Volume must be between 0 and 10 mL')
            return
        }

        // Create a step with the selected wells
        const quickStep = {
            id: Date.now(),
            cycles: 1,
            pickupWell: pickup,
            dropoffWell: dropoff,
            rinseWell: rinse,
            waitTime: 0,
            sampleVolume: volume,
            repetitionMode: 'quantity',
            repetitionQuantity: 1,
            repetitionInterval: null,
            repetitionDuration: null,
            pipetteCount: currentPipetteCount
        }

        // Switch to plate layout tab to show real-time position
        setActiveTab('protocol')
        setIsExecuting(true)

        try {
            const response = await fetch('/api/pipetting/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({steps: [quickStep]})
            })

            const data = await response.json()

            if (response.ok) {
                console.log('Quick operation completed successfully!')
                fetchCurrentPosition()
                // Reset quick op mode
                handleCancelQuickOp()
            } else {
                console.error(`Error: ${data.detail || 'Failed to execute operation'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to connect to backend. ${error.message}`)
        } finally {
            setIsExecuting(false)
        }
    }

    const handleMoveToWell = async () => {
        if (!targetWell) {
            return
        }

        try {
            const response = await fetch('/api/pipetting/move-to-well', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({wellId: targetWell})
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`${data.message}`)
                // Update current position after moving
                fetchCurrentPosition()
                // Clear target well
                setTargetWell(null)
            } else {
                console.error(`Error: ${data.detail || 'Failed to move to well'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to connect to backend. ${error.message}`)
        }
    }

    const handleToggleZ = async () => {
        try {
            const response = await fetch('/api/pipetting/toggle-z', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({direction: zAxisUp ? 'down' : 'up'})
            })

            const data = await response.json()

            if (response.ok) {
                setZAxisUp(!zAxisUp)
                console.log(`${data.message}`)
            } else {
                console.error(`Error: ${data.detail || 'Failed to toggle Z-axis'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to connect to backend. ${error.message}`)
        }
    }

    const handleCollect = async () => {
        const volume = parseFloat(pipetteVolume)
        if (isNaN(volume) || volume <= 0 || volume > 10) {
            console.error('Volume must be between 0 and 10 mL')
            return
        }

        try {
            const response = await fetch('/api/pipetting/aspirate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({volume: volume})
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`${data.message}`)
            } else {
                console.error(`Error: ${data.detail || 'Failed to aspirate'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to connect to backend. ${error.message}`)
        }
    }

    const handleDispense = async () => {
        const volume = parseFloat(pipetteVolume)
        if (isNaN(volume) || volume <= 0 || volume > 10) {
            console.error('Volume must be between 0 and 10 mL')
            return
        }

        try {
            const response = await fetch('/api/pipetting/dispense', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({volume: volume})
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`${data.message}`)
            } else {
                console.error(`Error: ${data.detail || 'Failed to dispense'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to connect to backend. ${error.message}`)
        }
    }

    const handleAxisMove = async (axis, steps, direction) => {
        try {
            const response = await fetch('/api/axis/move', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({axis, steps, direction})
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`${data.message}`)
                if (data.positions) {
                    setAxisPositions(data.positions)
                }
                // Also update the current position display
                fetchCurrentPosition()
            } else {
                console.error(`Error: ${data.detail || 'Failed to move axis'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to connect to backend. ${error.message}`)
        }
    }

    const fetchAxisPositions = async () => {
        try {
            const response = await fetch('/api/axis/positions')
            const data = await response.json()

            if (data.status === 'success' && data.positions) {
                setAxisPositions(data.positions)
            }
        } catch (error) {
            console.error('Failed to fetch axis positions:', error)
        }
    }

    const fetchCurrentPosition = async () => {
        try {
            const response = await fetch('/api/pipetting/status')
            const data = await response.json()

            if (data.initialized && data.current_well) {
                console.log('Current well position:', data.current_well)
                setSelectedWell(data.current_well)
                setSystemStatus(data.message || 'System ready')

                // Update pipette count from backend
                if (data.pipette_count !== undefined) {
                    setCurrentPipetteCount(data.pipette_count)
                }

                // Update isExecuting state from backend
                if (data.is_executing !== undefined) {
                    setIsExecuting(data.is_executing)
                }

                // Update operation state from backend
                if (data.current_operation !== undefined) {
                    setCurrentOperation(data.current_operation)
                }
                if (data.operation_well !== undefined) {
                    setOperationWell(data.operation_well)
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
            const response = await fetch('/api/pipetting/logs?last_n=100')
            const data = await response.json()

            if (data.logs) {
                setLogs(data.logs)
            }
        } catch (error) {
            console.error('Failed to fetch logs:', error)
        }
    }

    const fetchConfig = async () => {
        try {
            const response = await fetch('/api/config')
            const data = await response.json()

            if (data.status === 'success') {
                setConfig(data.config)
            }
        } catch (error) {
            console.error('Failed to fetch configuration:', error)
        }
    }

    const saveConfig = async () => {
        setConfigLoading(true)
        setConfigMessage('')

        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config)
            })

            const data = await response.json()

            if (data.status === 'success') {
                setConfigMessage('✓ ' + data.message)
            } else {
                setConfigMessage('✗ Failed to save configuration')
            }
        } catch (error) {
            console.error('Failed to save configuration:', error)
            setConfigMessage('✗ Error: ' + error.message)
        } finally {
            setConfigLoading(false)
        }
    }

    const handleConfigChange = (key, value) => {
        setConfig(prev => ({
            ...prev,
            [key]: value
        }))
    }

    // Fetch current position and config on component mount
    useEffect(() => {
        // Initial fetch
        fetchCurrentPosition()
        fetchConfig()
        fetchAxisPositions()

        // Poll every 1 second to keep UI in sync with backend
        const interval = setInterval(() => {
            fetchCurrentPosition()
            if (activeTab === 'manual') {
                fetchAxisPositions()
            }
        }, 1000) // Poll every second

        return () => clearInterval(interval)
    }, [activeTab])

    // Increase polling frequency during execution
    useEffect(() => {
        let interval
        if (isExecuting) {
            interval = setInterval(() => {
                fetchCurrentPosition()
                fetchLogs() // Also fetch logs during execution
            }, 300) // Poll every 300ms during execution for smooth updates and catching quick operations
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

    // Theme effect
    useEffect(() => {
        // Apply theme to document
        document.documentElement.setAttribute('data-theme', theme)
        // Save to localStorage
        localStorage.setItem('theme', theme)
    }, [theme])

    // Auto-scroll logs to bottom only when new logs are added
    useEffect(() => {
        // Only scroll if logs count has increased (new logs added)
        if (logs.length > previousLogCountRef.current) {
            logsEndRef.current?.scrollIntoView({behavior: 'smooth'})
            previousLogCountRef.current = logs.length
        }
    }, [logs])

    const toggleTheme = () => {
        setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light')
    }

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
                <button
                    className={`nav-tab ${activeTab === 'manual' ? 'active' : ''}`}
                    onClick={() => setActiveTab('manual')}
                >
                    <span className="nav-icon">↔</span> Manual
                </button>
                <button
                    className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
                    onClick={() => setActiveTab('settings')}
                >
                    <span className="nav-icon">⚙</span> Settings
                </button>
                <button
                    className="nav-tab theme-toggle"
                    onClick={toggleTheme}
                    title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                >
                    <span className="nav-icon">{theme === 'light' ? '🌙' : '☀️'}</span>
                    {theme === 'light' ? 'Dark' : 'Light'} Mode
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
                                <label>Pipette Configuration:</label>
                                <select
                                    value={pipetteCount}
                                    onChange={(e) => setPipetteCount(Number(e.target.value))}
                                    className="form-input form-select"
                                >
                                    <option value={1}>1 Pipette</option>
                                    <option value={3}>3 Pipettes</option>
                                </select>
                            </div>

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

                            <div className="form-divider"></div>

                            <div className="form-group">
                                <label>Repetition Mode:</label>
                                <select
                                    value={repetitionMode}
                                    onChange={(e) => setRepetitionMode(e.target.value)}
                                    className="form-input form-select"
                                >
                                    <option value="quantity">By Quantity</option>
                                    <option value="timeFrequency">By Time Frequency</option>
                                </select>
                            </div>

                            {repetitionMode === 'quantity' ? (
                                <div className="form-group">
                                    <label>Repeat Step (times):</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={repetitionQuantity}
                                        onChange={(e) => setRepetitionQuantity(e.target.value)}
                                        className="form-input"
                                        placeholder="e.g., 5"
                                    />
                                </div>
                            ) : (
                                <>
                                    <div className="form-group">
                                        <label>Interval (seconds):</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={repetitionInterval}
                                            onChange={(e) => setRepetitionInterval(e.target.value)}
                                            className="form-input"
                                            placeholder="e.g., 30"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Total Duration (seconds):</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={repetitionDuration}
                                            onChange={(e) => setRepetitionDuration(e.target.value)}
                                            className="form-input"
                                            placeholder="e.g., 300"
                                        />
                                    </div>
                                </>
                            )}

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
                ) : activeTab === 'manual' ? (
                    /* Manual Tab Content */
                    <div className="manual-section">
                        <h2>Manual Axis Control</h2>
                        <p className="manual-description">
                            Manually move individual axes using step controls. Use with caution.
                        </p>

                        <div className="axis-controls-grid">
                            {/* X-Axis Control */}
                            <div className="axis-control-card">
                                <div className="axis-header">
                                    <h3>X-Axis</h3>
                                    <span className="axis-position">{axisPositions.x} mm</span>
                                </div>
                                <div className="axis-step-input">
                                    <label>Steps:</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10000"
                                        value={axisStepInputs.x}
                                        onChange={(e) => setAxisStepInputs(prev => ({...prev, x: parseInt(e.target.value) || 1}))}
                                        className="step-input"
                                        disabled={isExecuting}
                                    />
                                </div>
                                <div className="axis-buttons">
                                    <button
                                        className="axis-btn axis-btn-neg"
                                        onClick={() => handleAxisMove('x', axisStepInputs.x, 'ccw')}
                                        disabled={isExecuting}
                                    >
                                        - {axisStepInputs.x}
                                    </button>
                                    <button
                                        className="axis-btn axis-btn-pos"
                                        onClick={() => handleAxisMove('x', axisStepInputs.x, 'cw')}
                                        disabled={isExecuting}
                                    >
                                        + {axisStepInputs.x}
                                    </button>
                                </div>
                            </div>

                            {/* Y-Axis Control */}
                            <div className="axis-control-card">
                                <div className="axis-header">
                                    <h3>Y-Axis</h3>
                                    <span className="axis-position">{axisPositions.y} mm</span>
                                </div>
                                <div className="axis-step-input">
                                    <label>Steps:</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10000"
                                        value={axisStepInputs.y}
                                        onChange={(e) => setAxisStepInputs(prev => ({...prev, y: parseInt(e.target.value) || 1}))}
                                        className="step-input"
                                        disabled={isExecuting}
                                    />
                                </div>
                                <div className="axis-buttons">
                                    <button
                                        className="axis-btn axis-btn-neg"
                                        onClick={() => handleAxisMove('y', axisStepInputs.y, 'ccw')}
                                        disabled={isExecuting}
                                    >
                                        - {axisStepInputs.y}
                                    </button>
                                    <button
                                        className="axis-btn axis-btn-pos"
                                        onClick={() => handleAxisMove('y', axisStepInputs.y, 'cw')}
                                        disabled={isExecuting}
                                    >
                                        + {axisStepInputs.y}
                                    </button>
                                </div>
                            </div>

                            {/* Z-Axis Control */}
                            <div className="axis-control-card">
                                <div className="axis-header">
                                    <h3>Z-Axis</h3>
                                    <span className="axis-position">{axisPositions.z} mm</span>
                                </div>
                                <div className="axis-step-input">
                                    <label>Steps:</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10000"
                                        value={axisStepInputs.z}
                                        onChange={(e) => setAxisStepInputs(prev => ({...prev, z: parseInt(e.target.value) || 1}))}
                                        className="step-input"
                                        disabled={isExecuting}
                                    />
                                </div>
                                <div className="axis-buttons">
                                    <button
                                        className="axis-btn axis-btn-neg"
                                        onClick={() => handleAxisMove('z', axisStepInputs.z, 'ccw')}
                                        disabled={isExecuting}
                                    >
                                        - {axisStepInputs.z}
                                    </button>
                                    <button
                                        className="axis-btn axis-btn-pos"
                                        onClick={() => handleAxisMove('z', axisStepInputs.z, 'cw')}
                                        disabled={isExecuting}
                                    >
                                        + {axisStepInputs.z}
                                    </button>
                                </div>
                            </div>

                            {/* Pipette Control */}
                            <div className="axis-control-card">
                                <div className="axis-header">
                                    <h3>Pipette</h3>
                                    <span className="axis-position">Motor 4</span>
                                </div>
                                <div className="axis-step-input">
                                    <label>Steps:</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10000"
                                        value={axisStepInputs.pipette}
                                        onChange={(e) => setAxisStepInputs(prev => ({...prev, pipette: parseInt(e.target.value) || 1}))}
                                        className="step-input"
                                        disabled={isExecuting}
                                    />
                                </div>
                                <div className="axis-buttons">
                                    <button
                                        className="axis-btn axis-btn-neg"
                                        onClick={() => handleAxisMove('pipette', axisStepInputs.pipette, 'ccw')}
                                        disabled={isExecuting}
                                    >
                                        - {axisStepInputs.pipette}
                                    </button>
                                    <button
                                        className="axis-btn axis-btn-pos"
                                        onClick={() => handleAxisMove('pipette', axisStepInputs.pipette, 'cw')}
                                        disabled={isExecuting}
                                    >
                                        + {axisStepInputs.pipette}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="manual-info">
                            <p>Current Well: {selectedWell || 'Unknown'}</p>
                            <p>Status: {systemStatus}</p>
                        </div>
                    </div>
                ) : activeTab === 'settings' ? (
                    /* Settings Tab Content */
                    <div className="settings-section">
                        <h2>System Configuration</h2>
                        <p className="settings-description">
                            Configure hardware parameters for the pipetting system. Changes will be saved to the .env
                            file and applied immediately.
                        </p>

                        <div className="config-form">
                            <div className="config-section">
                                <h3>Well Plate Physical Dimensions</h3>
                                <div className="config-grid">
                                    <div className="form-group">
                                        <label>Well Spacing (mm):</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            value={config.WELL_SPACING}
                                            onChange={(e) => handleConfigChange('WELL_SPACING', parseFloat(e.target.value))}
                                            className="form-input"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Well Diameter (mm):</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            value={config.WELL_DIAMETER}
                                            onChange={(e) => handleConfigChange('WELL_DIAMETER', parseFloat(e.target.value))}
                                            className="form-input"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Well Height (mm):</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            value={config.WELL_HEIGHT}
                                            onChange={(e) => handleConfigChange('WELL_HEIGHT', parseFloat(e.target.value))}
                                            className="form-input"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="config-section">
                                <h3>Motor Configuration</h3>
                                <div className="config-grid">
                                    <div className="form-group">
                                        <label>X-Axis Steps/mm:</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={config.STEPS_PER_MM_X}
                                            onChange={(e) => handleConfigChange('STEPS_PER_MM_X', parseInt(e.target.value))}
                                            className="form-input"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Y-Axis Steps/mm:</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={config.STEPS_PER_MM_Y}
                                            onChange={(e) => handleConfigChange('STEPS_PER_MM_Y', parseInt(e.target.value))}
                                            className="form-input"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Z-Axis Steps/mm:</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={config.STEPS_PER_MM_Z}
                                            onChange={(e) => handleConfigChange('STEPS_PER_MM_Z', parseInt(e.target.value))}
                                            className="form-input"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="config-section">
                                <h3>Pipette Configuration</h3>
                                <div className="config-grid">
                                    <div className="form-group">
                                        <label>Pipette Steps/mL:</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={config.PIPETTE_STEPS_PER_ML}
                                            onChange={(e) => handleConfigChange('PIPETTE_STEPS_PER_ML', parseInt(e.target.value))}
                                            className="form-input"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="config-section">
                                <h3>Pipetting Operation Parameters</h3>
                                <div className="config-grid">
                                    <div className="form-group">
                                        <label>Pickup Depth (mm):</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            value={config.PICKUP_DEPTH}
                                            onChange={(e) => handleConfigChange('PICKUP_DEPTH', parseFloat(e.target.value))}
                                            className="form-input"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Dropoff Depth (mm):</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            value={config.DROPOFF_DEPTH}
                                            onChange={(e) => handleConfigChange('DROPOFF_DEPTH', parseFloat(e.target.value))}
                                            className="form-input"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Safe Height (mm):</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            value={config.SAFE_HEIGHT}
                                            onChange={(e) => handleConfigChange('SAFE_HEIGHT', parseFloat(e.target.value))}
                                            className="form-input"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Rinse Cycles:</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={config.RINSE_CYCLES}
                                            onChange={(e) => handleConfigChange('RINSE_CYCLES', parseInt(e.target.value))}
                                            className="form-input"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="config-section">
                                <h3>Movement Speed Configuration</h3>
                                <div className="config-grid">
                                    <div className="form-group">
                                        <label>Travel Speed (s/step):</label>
                                        <input
                                            type="number"
                                            step="0.0001"
                                            min="0"
                                            value={config.TRAVEL_SPEED}
                                            onChange={(e) => handleConfigChange('TRAVEL_SPEED', parseFloat(e.target.value))}
                                            className="form-input"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Pipette Speed (s/step):</label>
                                        <input
                                            type="number"
                                            step="0.0001"
                                            min="0"
                                            value={config.PIPETTE_SPEED}
                                            onChange={(e) => handleConfigChange('PIPETTE_SPEED', parseFloat(e.target.value))}
                                            className="form-input"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="config-actions">
                                <button
                                    onClick={saveConfig}
                                    disabled={configLoading}
                                    className="save-config-button"
                                >
                                    {configLoading ? 'Saving...' : 'Save Configuration'}
                                </button>
                                {configMessage && (
                                    <div
                                        className={`config-message ${configMessage.startsWith('✓') ? 'success' : 'error'}`}>
                                        {configMessage}
                                    </div>
                                )}
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
                                {currentOperation !== 'idle' && operationWell && (
                                    <span className={`operation-status operation-${currentOperation}`}>
                                        {currentOperation === 'aspirating' && '🔵 Aspirating'}
                                        {currentOperation === 'dispensing' && '🟢 Dispensing'}
                                        {currentOperation === 'moving' && '🟡 Moving'}
                                        {' at ' + operationWell}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="pipette-config-control">
                            <label>Pipette Configuration:</label>
                            <select
                                value={currentPipetteCount}
                                onChange={(e) => handleSetPipetteCount(Number(e.target.value))}
                                className="form-input form-select"
                                disabled={isExecuting}
                            >
                                <option value={1}>1 Pipette</option>
                                <option value={3}>3 Pipettes</option>
                            </select>

                            {/* Z-axis Toggle Control */}
                            <div className="z-axis-control">
                                <button
                                    className={`btn btn-z-toggle ${zAxisUp ? 'z-up' : 'z-down'}`}
                                    onClick={handleToggleZ}
                                    disabled={isExecuting}
                                >
                                    Z-Axis: {zAxisUp ? '⬆ UP' : '⬇ DOWN'}
                                </button>
                            </div>

                            {/* Dispense/Collect Controls */}
                            <div className="pipette-controls">
                                <div className="pipette-control-row">
                                    <label>Volume (mL):</label>
                                    <input
                                        type="number"
                                        min="0.1"
                                        max="10"
                                        step="0.1"
                                        value={pipetteVolume}
                                        onChange={(e) => setPipetteVolume(e.target.value)}
                                        className="form-input"
                                        disabled={isExecuting}
                                    />
                                    <button
                                        className="btn btn-collect"
                                        onClick={handleCollect}
                                        disabled={isExecuting}
                                    >
                                        🔵 Collect
                                    </button>
                                    <button
                                        className="btn btn-dispense"
                                        onClick={handleDispense}
                                        disabled={isExecuting}
                                    >
                                        🟢 Dispense
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Quick Operation Controls */}
                        <div className="quick-op-controls">
                            {!quickOpMode ? (
                                <button
                                    className="btn btn-enable-quick-op"
                                    onClick={handleEnableQuickOp}
                                    disabled={isExecuting}
                                >
                                    Quick Operation Mode
                                </button>
                            ) : (
                                <div className="quick-op-panel">
                                    <div className="quick-op-header">
                                        <h3>Quick Operation Mode</h3>
                                        <button
                                            className="btn btn-cancel-small"
                                            onClick={handleCancelQuickOp}
                                            disabled={isExecuting}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                    <div className="quick-op-instructions">
                                        <div
                                            className={`quick-op-step ${quickOpStep === 0 ? 'active' : quickOpWells.pickup ? 'completed' : ''}`}>
                                            1. Click pickup well {quickOpWells.pickup && `(${quickOpWells.pickup})`}
                                        </div>
                                        <div
                                            className={`quick-op-step ${quickOpStep === 1 ? 'active' : quickOpWells.dropoff ? 'completed' : ''}`}>
                                            2. Click dropoff well {quickOpWells.dropoff && `(${quickOpWells.dropoff})`}
                                        </div>
                                        <div
                                            className={`quick-op-step ${quickOpStep === 2 ? 'active' : quickOpWells.rinse ? 'completed' : ''}`}>
                                            3. Click rinse well {quickOpWells.rinse && `(${quickOpWells.rinse})`}
                                        </div>
                                    </div>
                                    <div className="quick-op-volume">
                                        <label>Volume (mL):</label>
                                        <input
                                            type="number"
                                            min="0.1"
                                            max="10"
                                            step="0.1"
                                            value={quickOpVolume}
                                            onChange={(e) => setQuickOpVolume(e.target.value)}
                                            className="form-input"
                                            disabled={isExecuting}
                                        />
                                    </div>
                                    <button
                                        className="btn btn-execute-quick-op"
                                        onClick={handleExecuteQuickOp}
                                        disabled={isExecuting || !quickOpWells.pickup || !quickOpWells.dropoff || !quickOpWells.rinse}
                                    >
                                        {isExecuting ? 'Executing...' : 'Execute Operation'}
                                    </button>
                                </div>
                            )}
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
                            {rows.map(row => {
                                // Calculate which wells should be highlighted for pipette positions
                                const pipetteWells = getPipetteWells(selectedWell, currentPipetteCount)

                                return (
                                    <div key={row} className="plate-row">
                                        <div className="row-label">{row}</div>
                                        {columns.map(col => {
                                            const well = getWellType(row, col)
                                            const wellId = `${row}${col}`
                                            const isPipettePosition = pipetteWells.includes(wellId)
                                            const isCenterPipette = wellId === selectedWell
                                            const isSidePipette = isPipettePosition && !isCenterPipette

                                            // Check if this well is part of an operation (for multi-pipette animation)
                                            const operationWells = operationWell ? getPipetteWells(operationWell, currentPipetteCount) : []
                                            const isOperating = operationWells.includes(wellId) && currentOperation !== 'idle'
                                            const operationClass = isOperating ? `operation-${currentOperation}` : ''

                                            // Check if this well is selected in quick op mode
                                            const isQuickOpPickup = quickOpMode && quickOpWells.pickup === wellId
                                            const isQuickOpDropoff = quickOpMode && quickOpWells.dropoff === wellId
                                            const isQuickOpRinse = quickOpMode && quickOpWells.rinse === wellId

                                            return (
                                                <div
                                                    key={wellId}
                                                    className={`well well-${well.type}
                                                        ${isCenterPipette ? 'selected' : ''}
                                                        ${isSidePipette ? 'pipette-side' : ''}
                                                        ${targetWell === wellId ? 'target' : ''}
                                                        ${operationClass}
                                                        ${isQuickOpPickup ? 'quick-op-pickup' : ''}
                                                        ${isQuickOpDropoff ? 'quick-op-dropoff' : ''}
                                                        ${isQuickOpRinse ? 'quick-op-rinse' : ''}`}
                                                    onClick={() => handleWellClick(wellId)}
                                                    style={{cursor: 'pointer'}}
                                                >
                                                    {wellId}
                                                    {isQuickOpPickup && <span className="quick-op-badge">P</span>}
                                                    {isQuickOpDropoff && <span className="quick-op-badge">D</span>}
                                                    {isQuickOpRinse && <span className="quick-op-badge">R</span>}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )
                            })}
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
                                <>
                                    {logs.map((log, index) => (
                                        <div key={index} className="log-entry">
                                            {log}
                                        </div>
                                    ))}
                                    <div ref={logsEndRef}/>
                                </>
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
                                {steps.map((step, stepIndex) => {
                                    // Calculate total repetitions for time frequency mode
                                    const totalReps = step.repetitionMode === 'timeFrequency' && step.repetitionInterval && step.repetitionDuration
                                        ? Math.floor(step.repetitionDuration / step.repetitionInterval)
                                        : step.repetitionQuantity || 1;

                                    return (
                                        <div key={step.id} className="step-group">
                                            <h4>Step {stepIndex + 1}</h4>
                                            <div className="step-config-info">
                                                <div className="step-item-header">
                                                    🔧 {step.pipetteCount || 3} Pipette{(step.pipetteCount || 3) > 1 ? 's' : ''}
                                                </div>
                                            </div>
                                            <div className="step-repetition-info">
                                                {step.repetitionMode === 'quantity' ? (
                                                    <div className="step-item-header">
                                                        ↻ Repeat {step.repetitionQuantity} time(s)
                                                    </div>
                                                ) : (
                                                    <div className="step-item-header">
                                                        ⏱ Every {step.repetitionInterval}s for {step.repetitionDuration}s
                                                        ({totalReps} times)
                                                    </div>
                                                )}
                                            </div>
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
                                                        <div className="step-item">• Rinse at
                                                            well: {step.rinseWell}</div>
                                                    )}
                                                    {step.waitTime && (
                                                        <div className="step-item">• Wait: {step.waitTime}s</div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                                {steps.length === 0 && (
                                    <div className="step-placeholder">Add steps to see program</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="action-buttons">
                        {targetWell && (
                            <button
                                className="btn btn-move-to-well"
                                onClick={handleMoveToWell}
                                disabled={isExecuting}
                            >
                                Move to {targetWell}
                            </button>
                        )}
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