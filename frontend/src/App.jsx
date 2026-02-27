import {useEffect, useRef, useState} from 'react'
import './App.css'

function App() {
    const [activeTab, setActiveTab] = useState('protocol')
    const [selectedWell, setSelectedWell] = useState('WS1') // Current motor position (home = WS1)
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
        PIPETTE_MAX_ML: 10.0,
        PICKUP_DEPTH: 10.0,
        DROPOFF_DEPTH: 5.0,
        SAFE_HEIGHT: 20.0,
        RINSE_CYCLES: 3,
        TRAVEL_SPEED: 0.001,
        PIPETTE_SPEED: 0.002,
        VIAL_WELL_SPACING:  45.0,
        VIAL_WELL_DIAMETER:  8.0,
        VIAL_WELL_HEIGHT:   14.0,
        INVERT_X:       false,
        INVERT_Y:       false,
        INVERT_Z:       false,
        INVERT_PIPETTE: false
    })
    const [configLoading, setConfigLoading] = useState(false)
    const [configMessage, setConfigMessage] = useState('')
    const [settingsSubTab, setSettingsSubTab] = useState('layout') // 'layout' | 'motor' | 'calibration'

    // Calibration state
    const [calibration, setCalibration] = useState({
        x: {testSteps: 1000, measuredDistance: '', calculatedSPM: null},
        y: {testSteps: 1000, measuredDistance: '', calculatedSPM: null},
        z: {testSteps: 1000, measuredDistance: '', calculatedSPM: null},
        pipette: {testSteps: 1000, measuredVolume: '', calculatedSPML: null},
    })

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
    const [axisPositions, setAxisPositions] = useState({x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {}})
    const [axisStepInputs, setAxisStepInputs] = useState({x: 10, y: 10, z: 10, pipette: 10})
    const [positionEditMode, setPositionEditMode] = useState(false)
    const [positionInputs, setPositionInputs] = useState({x: 0, y: 0, z: 0, pipette_ml: 0})

    // Drift test state
    const [driftTestConfig, setDriftTestConfig] = useState({cycles: 10, motor_speed: 0.001, steps_per_mm: 200, motor: 1})
    const [driftTestRunning, setDriftTestRunning] = useState(false)
    const [driftTestResults, setDriftTestResults] = useState(null)
    const [limitSwitchStatus, setLimitSwitchStatus] = useState(null)
    const [limitSwitchLoading, setLimitSwitchLoading] = useState(false)

    // Dispense/Collect state
    const [pipetteVolume, setPipetteVolume] = useState('1.0') // Volume for manual dispense/collect

    // Ref for auto-scrolling logs
    const logsEndRef = useRef(null)
    const previousLogCountRef = useRef(0)

    const validateWellId = (wellId) => {
        if (!wellId || wellId.trim() === '') return true // Empty is OK for optional fields

        const wellIdUpper = wellId.trim().toUpperCase()

        // Special wells
        // Washing stations (both layouts)
        if (['WS1', 'WS2'].includes(wellIdUpper)) {
            return true
        }

        // MicroChips (microchip layout)
        if (['MC1', 'MC2', 'MC3', 'MC4', 'MC5'].includes(wellIdUpper)) {
            return true
        }

        // Vials (vial layout - VA1-VE3)
        const vialPattern = /^V[A-E][1-3]$/
        if (vialPattern.test(wellIdUpper)) {
            return true
        }

        // Small wells (SA1-SL6)
        const smallWellPattern = /^S[A-L][1-6]$/
        if (smallWellPattern.test(wellIdUpper)) {
            return true
        }

        // Standard well ID format: Row (A-H) + Column (1-15 for MicroChip, 1-12 for legacy)
        const wellPattern = /^[A-H]([1-9]|1[0-5])$/
        return wellPattern.test(wellIdUpper)
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

    // Layout type state
    const [layoutType, setLayoutType] = useState('microchip') // 'microchip' or 'wellplate'

    // Initialize 96-well plate data (8 rows x 12 columns) - for microchip layout
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    const columns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

    // Well data - all wells start empty by default
    const [wellData, setWellData] = useState({})

    // Layout definitions
    const layouts = {
        microchip: {
            name: 'MicroChip Layout',
            // Washing stations (top-left)
            reservoirs: [
                {id: 'WS1', label: 'Washing Station 1', type: 'reservoir'},
                {id: 'WS2', label: 'Washing Station 2', type: 'reservoir'}
            ],
            // Main well grid (8 rows x 15 columns)
            wellGrid: {
                rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
                columns: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
            },
            // MicroChips (bottom)
            vials: [
                {id: 'MC1', label: 'MicroChip 1', type: 'vial'},
                {id: 'MC2', label: 'MicroChip 2', type: 'vial'},
                {id: 'MC3', label: 'MicroChip 3', type: 'vial'},
                {id: 'MC4', label: 'MicroChip 4', type: 'vial'},
                {id: 'MC5', label: 'MicroChip 5', type: 'vial'}
            ]
        },
        wellplate: {
            name: 'Vial Layout',
            // Washing stations (top-left)
            reservoirs: [
                {id: 'WS1', label: 'Washing Station 1', type: 'reservoir'},
                {id: 'WS2', label: 'Washing Station 2', type: 'reservoir'}
            ],
            // Vials grid (left side: 5 rows x 3 columns)
            vialGrid: {
                rows: ['A', 'B', 'C', 'D', 'E'],
                columns: [1, 2, 3],
                prefix: 'V' // V for Vials (VA1, VA2, etc.)
            },
            // Small wells grid (right side: 12 rows x 6 columns)
            smallWellGrid: {
                rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'],
                columns: [1, 2, 3, 4, 5, 6],
                prefix: 'S' // S for Small wells (SA1, SA2, etc.)
            }
        }
    }

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

    const handleSetLayout = async (mode) => {
        try {
            const res = await fetch('/api/pipetting/set-layout', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({layoutType: mode})
            })
            if (res.ok) setLayoutType(mode)
            else {
                const data = await res.json()
                console.error(`Error: ${data.detail || 'Failed to set layout'}`)
            }
        } catch (e) {
            console.error('Failed to set layout:', e.message)
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
        const maxML = config.PIPETTE_MAX_ML || 100
        if (isNaN(volume) || volume <= 0 || volume > maxML) {
            console.error(`Volume must be between 0 and ${maxML} mL`)
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
                body: JSON.stringify({direction: zAxisUp ? 'up' : 'down'})
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
        const maxML = config.PIPETTE_MAX_ML || 100
        if (isNaN(volume) || volume <= 0 || volume > maxML) {
            console.error(`Volume must be between 0 and ${maxML} mL`)
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
                fetchAxisPositions()
            } else {
                console.error(`Error: ${data.detail || 'Failed to aspirate'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to connect to backend. ${error.message}`)
        }
    }

    const handleDispense = async () => {
        const volume = parseFloat(pipetteVolume)
        const maxML = config.PIPETTE_MAX_ML || 100
        if (isNaN(volume) || volume <= 0 || volume > maxML) {
            console.error(`Volume must be between 0 and ${maxML} mL`)
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
                fetchAxisPositions()
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

    const handleSetPosition = async () => {
        try {
            const response = await fetch('/api/axis/set-position', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    x: parseFloat(positionInputs.x) || 0,
                    y: parseFloat(positionInputs.y) || 0,
                    z: parseFloat(positionInputs.z) || 0,
                    pipette_ml: parseFloat(positionInputs.pipette_ml) || 0
                })
            })
            const data = await response.json()
            if (response.ok) {
                console.log(data.message)
                if (data.positions) setAxisPositions(data.positions)
                fetchCurrentPosition()
                setPositionEditMode(false)
            } else {
                console.error(`Error: ${data.detail || 'Failed to set position'}`)
            }
        } catch (error) {
            console.error('Failed to set position:', error.message)
        }
    }

    const handleEnterPositionEdit = () => {
        setPositionInputs({x: axisPositions.x, y: axisPositions.y, z: axisPositions.z, pipette_ml: axisPositions.pipette_ml || 0})
        setPositionEditMode(true)
    }

    // Drift test functions
    const startDriftTest = async () => {
        try {
            const response = await fetch('/api/drift-test/start', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(driftTestConfig)
            })
            const data = await response.json()
            if (response.ok) {
                setDriftTestRunning(true)
                console.log(data.message)
            } else {
                console.error(`Error: ${data.detail}`)
            }
        } catch (error) {
            console.error('Failed to start drift test:', error)
        }
    }

    const stopDriftTest = async () => {
        try {
            const response = await fetch('/api/drift-test/stop', {method: 'POST'})
            const data = await response.json()
            if (response.ok) {
                console.log(data.message)
            }
        } catch (error) {
            console.error('Failed to stop drift test:', error)
        }
    }

    const fetchDriftTestStatus = async () => {
        try {
            const response = await fetch('/api/drift-test/status')
            const data = await response.json()
            if (data.status === 'success') {
                setDriftTestRunning(data.running)
                setDriftTestResults(data.data)
            }
        } catch (error) {
            console.error('Failed to fetch drift test status:', error)
        }
    }

    const clearDriftTestResults = async () => {
        try {
            const response = await fetch('/api/drift-test/clear', {method: 'POST'})
            const data = await response.json()
            if (response.ok) {
                setDriftTestResults(null)
                console.log(data.message)
            }
        } catch (error) {
            console.error('Failed to clear drift test results:', error)
        }
    }

    const fetchLimitSwitches = async () => {
        setLimitSwitchLoading(true)
        try {
            const response = await fetch('/api/limit-switches')
            const data = await response.json()
            if (response.ok) {
                setLimitSwitchStatus(data)
            } else {
                setLimitSwitchStatus({error: data.detail})
            }
        } catch (error) {
            setLimitSwitchStatus({error: 'Could not reach backend'})
        } finally {
            setLimitSwitchLoading(false)
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

                // Update layout type from backend
                if (data.layout_type !== undefined) {
                    setLayoutType(data.layout_type)
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

                // Sync Z-axis toggle with actual position
                // Button shows the action: UP when Z is low, DOWN when Z is high
                if (data.position) {
                    setZAxisUp(data.position.z <= 5)
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
            if (activeTab === 'drift-test') {
                fetchDriftTestStatus()
                fetchLimitSwitches()
            }
        }, 1000) // Poll every second

        return () => clearInterval(interval)
    }, [activeTab])

    // Faster polling when drift test is running
    useEffect(() => {
        if (!driftTestRunning) return

        const interval = setInterval(() => {
            fetchDriftTestStatus()
        }, 500)

        return () => clearInterval(interval)
    }, [driftTestRunning])

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
                    className={`nav-tab ${activeTab === 'drift-test' ? 'active' : ''}`}
                    onClick={() => setActiveTab('drift-test')}
                >
                    <span className="nav-icon">⟳</span> Drift Test
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
                                    placeholder={layoutType === 'microchip' ? 'e.g., A1, WS1, MC3' : 'e.g., SA1, VA1, WS2'}
                                    value={pickupWell}
                                    onChange={(e) => setPickupWell(e.target.value)}
                                    className="form-input"
                                />
                            </div>

                            <div className="form-group">
                                <label>Dropoff Well:</label>
                                <input
                                    type="text"
                                    placeholder={layoutType === 'microchip' ? 'e.g., A1, WS1, MC3' : 'e.g., SA1, VA1, WS2'}
                                    value={dropoffWell}
                                    onChange={(e) => setDropoffWell(e.target.value)}
                                    className="form-input"
                                />
                            </div>

                            <div className="form-group">
                                <label>Rinse Well:</label>
                                <input
                                    type="text"
                                    placeholder={layoutType === 'microchip' ? 'e.g., A1, WS1, MC3' : 'e.g., SA1, VA1, WS2'}
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
                                        onChange={(e) => setAxisStepInputs(prev => ({
                                            ...prev,
                                            x: parseInt(e.target.value) || 1
                                        }))}
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
                                        onChange={(e) => setAxisStepInputs(prev => ({
                                            ...prev,
                                            y: parseInt(e.target.value) || 1
                                        }))}
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
                                        onChange={(e) => setAxisStepInputs(prev => ({
                                            ...prev,
                                            z: parseInt(e.target.value) || 1
                                        }))}
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
                                    <span className="axis-position">{axisPositions.pipette_ml} mL</span>
                                </div>
                                <div className="axis-step-input">
                                    <label>Steps:</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10000"
                                        value={axisStepInputs.pipette}
                                        onChange={(e) => setAxisStepInputs(prev => ({
                                            ...prev,
                                            pipette: parseInt(e.target.value) || 1
                                        }))}
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

                        <div className="set-position-section">
                            {!positionEditMode ? (
                                <button
                                    className="btn btn-set-position"
                                    onClick={handleEnterPositionEdit}
                                    disabled={isExecuting}
                                >
                                    Set Current Position
                                </button>
                            ) : (
                                <div className="position-edit-card">
                                    <h3>Set Current Position (mm)</h3>
                                    <p className="position-edit-hint">Override the tracked position without moving motors.</p>
                                    <div className="position-edit-inputs">
                                        <label>
                                            X:
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={positionInputs.x}
                                                onChange={(e) => setPositionInputs(prev => ({...prev, x: e.target.value}))}
                                                className="step-input"
                                            />
                                        </label>
                                        <label>
                                            Y:
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={positionInputs.y}
                                                onChange={(e) => setPositionInputs(prev => ({...prev, y: e.target.value}))}
                                                className="step-input"
                                            />
                                        </label>
                                        <label>
                                            Z:
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={positionInputs.z}
                                                onChange={(e) => setPositionInputs(prev => ({...prev, z: e.target.value}))}
                                                className="step-input"
                                            />
                                        </label>
                                        <label>
                                            Pipette (mL):
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={positionInputs.pipette_ml}
                                                onChange={(e) => setPositionInputs(prev => ({...prev, pipette_ml: e.target.value}))}
                                                className="step-input"
                                            />
                                        </label>
                                    </div>
                                    <div className="position-edit-actions">
                                        <button className="btn btn-add-step" onClick={handleSetPosition}>Apply</button>
                                        <button className="btn btn-cancel" onClick={() => setPositionEditMode(false)}>Cancel</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="manual-info">
                            <p>Current Well: {selectedWell || 'Unknown'}</p>
                            <p>Status: {systemStatus}</p>
                        </div>
                    </div>
                ) : activeTab === 'drift-test' ? (
                    /* Drift Test Tab Content */
                    <div className="drift-test-section">
                        <h2>Motor Drift Test</h2>
                        <p className="drift-test-description">
                            Test stepper motor precision by running back-and-forth cycles.
                            Measures drift using limit switches.
                        </p>

                        {/* Test Configuration */}
                        <div className="drift-test-config">
                            <h3>Test Configuration</h3>
                            <div className="config-grid">
                                <div className="form-group">
                                    <label>Motor:</label>
                                    <select
                                        value={driftTestConfig.motor}
                                        onChange={(e) => {
                                            setDriftTestConfig(prev => ({...prev, motor: parseInt(e.target.value)}))
                                            fetchLimitSwitches()
                                        }}
                                        className="form-input"
                                        disabled={driftTestRunning}
                                    >
                                        <option value={1}>Motor 1 — X-Axis</option>
                                        <option value={2}>Motor 2 — Y-Axis</option>
                                        <option value={3}>Motor 3 — Z-Axis</option>
                                        <option value={4}>Motor 4 — Pipette</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Number of Cycles:</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="1000"
                                        value={driftTestConfig.cycles}
                                        onChange={(e) => setDriftTestConfig(prev => ({
                                            ...prev,
                                            cycles: parseInt(e.target.value) || 1
                                        }))}
                                        className="form-input"
                                        disabled={driftTestRunning}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Motor Speed (s):</label>
                                    <input
                                        type="number"
                                        min="0.0001"
                                        max="0.1"
                                        step="0.0001"
                                        value={driftTestConfig.motor_speed}
                                        onChange={(e) => setDriftTestConfig(prev => ({
                                            ...prev,
                                            motor_speed: parseFloat(e.target.value) || 0.001
                                        }))}
                                        className="form-input"
                                        disabled={driftTestRunning}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Steps per mm:</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10000"
                                        value={driftTestConfig.steps_per_mm}
                                        onChange={(e) => setDriftTestConfig(prev => ({
                                            ...prev,
                                            steps_per_mm: parseInt(e.target.value) || 200
                                        }))}
                                        className="form-input"
                                        disabled={driftTestRunning}
                                    />
                                </div>
                            </div>

                            {/* Limit Switch Validation */}
                            {(() => {
                                const motorData = limitSwitchStatus?.limit_states?.[driftTestConfig.motor]
                                const pinData   = limitSwitchStatus?.pin_configuration?.[driftTestConfig.motor]
                                const minOk  = pinData?.min_pin != null
                                const maxOk  = pinData?.max_pin != null
                                const bothOk = minOk && maxOk
                                return (
                                    <div className="limit-switch-validation">
                                        <div className="limit-switch-validation-header">
                                            <span className="limit-switch-validation-title">Limit Switch Check</span>
                                            <button
                                                className="btn-refresh-limits"
                                                onClick={fetchLimitSwitches}
                                                disabled={limitSwitchLoading || driftTestRunning}
                                                title="Refresh limit switch status"
                                            >
                                                {limitSwitchLoading ? '...' : '↻ Refresh'}
                                            </button>
                                        </div>
                                        {limitSwitchStatus?.error ? (
                                            <p className="limit-switch-error">{limitSwitchStatus.error}</p>
                                        ) : !limitSwitchStatus ? (
                                            <p className="limit-switch-hint">Click Refresh to check limit switches.</p>
                                        ) : (
                                            <div className="limit-switch-rows">
                                                <div className={`limit-switch-row ${minOk ? 'ls-configured' : 'ls-missing'}`}>
                                                    <span className="ls-dot" />
                                                    <span className="ls-label">MIN switch</span>
                                                    <span className="ls-pin">{minOk ? `GPIO ${pinData.min_pin}` : 'Not configured'}</span>
                                                    {minOk && (
                                                        <span className={`ls-state ${motorData?.min ? 'ls-triggered' : 'ls-open'}`}>
                                                            {motorData?.min ? 'TRIGGERED' : 'Open'}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={`limit-switch-row ${maxOk ? 'ls-configured' : 'ls-missing'}`}>
                                                    <span className="ls-dot" />
                                                    <span className="ls-label">MAX switch</span>
                                                    <span className="ls-pin">{maxOk ? `GPIO ${pinData.max_pin}` : 'Not configured'}</span>
                                                    {maxOk && (
                                                        <span className={`ls-state ${motorData?.max ? 'ls-triggered' : 'ls-open'}`}>
                                                            {motorData?.max ? 'TRIGGERED' : 'Open'}
                                                        </span>
                                                    )}
                                                </div>
                                                {bothOk ? (
                                                    <p className="ls-ok-msg">Both limit switches configured. Press each switch by hand to verify it shows TRIGGERED.</p>
                                                ) : (
                                                    <p className="ls-warn-msg">⚠ One or both limit switches are not configured for this motor. Fix wiring before running the test.</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })()}

                            <div className="drift-test-actions">
                                {!driftTestRunning ? (
                                    (() => {
                                        const pinData = limitSwitchStatus?.pin_configuration?.[driftTestConfig.motor]
                                        const bothOk  = pinData?.min_pin != null && pinData?.max_pin != null
                                        return (
                                            <button
                                                className="btn btn-start-test"
                                                onClick={startDriftTest}
                                                disabled={!bothOk}
                                                title={!bothOk ? 'Both limit switches must be configured before running the test' : ''}
                                            >
                                                Start Drift Test
                                            </button>
                                        )
                                    })()
                                ) : (
                                    <button
                                        className="btn btn-stop-test"
                                        onClick={stopDriftTest}
                                    >
                                        Stop Test
                                    </button>
                                )}
                                <button
                                    className="btn btn-clear-results"
                                    onClick={clearDriftTestResults}
                                    disabled={driftTestRunning}
                                >
                                    Clear Results
                                </button>
                            </div>
                        </div>

                        {/* Test Status */}
                        {driftTestResults && (
                            <div className="drift-test-status">
                                <h3>Test Status</h3>
                                <div className="status-grid">
                                    {driftTestResults.motor_name && (
                                        <div className="status-item">
                                            <span className="status-label">Motor:</span>
                                            <span className="status-value">{driftTestResults.motor_name}</span>
                                        </div>
                                    )}
                                    <div className="status-item">
                                        <span className="status-label">Status:</span>
                                        <span className={`status-value status-${driftTestResults.status}`}>
                                            {driftTestResults.status?.toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="status-item">
                                        <span className="status-label">Progress:</span>
                                        <span className="status-value">
                                            {driftTestResults.current_cycle} / {driftTestResults.total_cycles} cycles
                                        </span>
                                    </div>
                                    {driftTestResults.total_cycles > 0 && (
                                        <div className="progress-bar-container">
                                            <div
                                                className="progress-bar"
                                                style={{
                                                    width: `${(driftTestResults.current_cycle / driftTestResults.total_cycles) * 100}%`
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Test Summary */}
                        {driftTestResults?.summary && (
                            <div className="drift-test-summary">
                                <h3>Test Summary</h3>
                                <div className="summary-grid">
                                    <div className="summary-item">
                                        <span className="summary-label">Total Cycles:</span>
                                        <span className="summary-value">{driftTestResults.summary.total_cycles}</span>
                                    </div>
                                    <div className="summary-item">
                                        <span className="summary-label">Avg Forward Steps:</span>
                                        <span
                                            className="summary-value">{driftTestResults.summary.avg_forward_steps}</span>
                                    </div>
                                    <div className="summary-item">
                                        <span className="summary-label">Avg Backward Steps:</span>
                                        <span
                                            className="summary-value">{driftTestResults.summary.avg_backward_steps}</span>
                                    </div>
                                    <div className="summary-item highlight">
                                        <span className="summary-label">Avg Drift:</span>
                                        <span
                                            className="summary-value">{driftTestResults.summary.avg_drift_mm} mm</span>
                                    </div>
                                    <div className="summary-item">
                                        <span className="summary-label">Max Drift:</span>
                                        <span
                                            className="summary-value">{driftTestResults.summary.max_drift_mm} mm</span>
                                    </div>
                                    <div className="summary-item">
                                        <span className="summary-label">Min Drift:</span>
                                        <span
                                            className="summary-value">{driftTestResults.summary.min_drift_mm} mm</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Cycle Data Table */}
                        {driftTestResults?.cycles?.length > 0 && (
                            <div className="drift-test-data">
                                <h3>Cycle Data</h3>
                                <div className="data-table-container">
                                    <table className="data-table">
                                        <thead>
                                        <tr>
                                            <th>Cycle</th>
                                            <th>Forward Steps</th>
                                            <th>Backward Steps</th>
                                            <th>Difference</th>
                                            <th>Drift (mm)</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {driftTestResults.cycles.slice(-20).map((cycle, index) => (
                                            <tr key={index}>
                                                <td>{cycle.cycle_number}</td>
                                                <td>{cycle.forward_steps}</td>
                                                <td>{cycle.backward_steps}</td>
                                                <td>{cycle.step_difference}</td>
                                                <td>{cycle.drift_mm}</td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                                {driftTestResults.cycles.length > 20 && (
                                    <p className="table-note">Showing last 20 cycles
                                        of {driftTestResults.cycles.length}</p>
                                )}
                            </div>
                        )}
                    </div>
                ) : activeTab === 'settings' ? (
                    /* Settings Tab Content */
                    <div className="settings-section">
                        <h2>System Configuration</h2>
                        <p className="settings-description">
                            Configure hardware parameters for the pipetting system. Changes are saved to config.json
                            and applied immediately without a server restart.
                        </p>

                        {/* Settings sub-tabs */}
                        <div className="settings-subtabs">
                            <button
                                className={`settings-subtab ${settingsSubTab === 'layout' ? 'active' : ''}`}
                                onClick={() => setSettingsSubTab('layout')}
                            >
                                Layout Settings
                            </button>
                            <button
                                className={`settings-subtab ${settingsSubTab === 'motor' ? 'active' : ''}`}
                                onClick={() => setSettingsSubTab('motor')}
                            >
                                Motor Settings
                            </button>
                            <button
                                className={`settings-subtab ${settingsSubTab === 'calibration' ? 'active' : ''}`}
                                onClick={() => setSettingsSubTab('calibration')}
                            >
                                Calibration
                            </button>
                        </div>

                        <div className="config-form">
                            {settingsSubTab === 'layout' ? (
                                <>
                                    <div className="config-section">
                                        <h3>MicroChip Layout Well Dimensions</h3>
                                        <div className="config-grid">
                                            <div className="form-group">
                                                <label>Well Spacing (mm):</label>
                                                <input
                                                    type="number" step="0.1" min="0"
                                                    value={config.WELL_SPACING}
                                                    onChange={(e) => handleConfigChange('WELL_SPACING', parseFloat(e.target.value))}
                                                    className="form-input"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Well Diameter (mm):</label>
                                                <input
                                                    type="number" step="0.1" min="0"
                                                    value={config.WELL_DIAMETER}
                                                    onChange={(e) => handleConfigChange('WELL_DIAMETER', parseFloat(e.target.value))}
                                                    className="form-input"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Well Height (mm):</label>
                                                <input
                                                    type="number" step="0.1" min="0"
                                                    value={config.WELL_HEIGHT}
                                                    onChange={(e) => handleConfigChange('WELL_HEIGHT', parseFloat(e.target.value))}
                                                    className="form-input"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="config-section">
                                        <h3>Washing Station Dimensions</h3>
                                        <div className="config-grid">
                                            <div className="form-group">
                                                <label>Y Offset (mm):</label>
                                                <input type="number" step="0.1" min="0"
                                                    value={config.WS_OFFSET_Y}
                                                    onChange={(e) => handleConfigChange('WS_OFFSET_Y', parseFloat(e.target.value))}
                                                    className="form-input" />
                                            </div>
                                            <div className="form-group">
                                                <label>Height (mm):</label>
                                                <input type="number" step="0.1" min="0"
                                                    value={config.WS_HEIGHT}
                                                    onChange={(e) => handleConfigChange('WS_HEIGHT', parseFloat(e.target.value))}
                                                    className="form-input" />
                                            </div>
                                            <div className="form-group">
                                                <label>Width (mm):</label>
                                                <input type="number" step="0.1" min="0"
                                                    value={config.WS_WIDTH}
                                                    onChange={(e) => handleConfigChange('WS_WIDTH', parseFloat(e.target.value))}
                                                    className="form-input" />
                                            </div>
                                            <div className="form-group">
                                                <label>Gap Between WS1 & WS2 (mm):</label>
                                                <input type="number" step="0.1" min="0"
                                                    value={config.WS_GAP}
                                                    onChange={(e) => handleConfigChange('WS_GAP', parseFloat(e.target.value))}
                                                    className="form-input" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="config-section">
                                        <h3>Vial Layout Well Dimensions</h3>
                                        <div className="config-grid">
                                            <div className="form-group">
                                                <label>Vial Well Spacing (mm):</label>
                                                <input type="number" step="0.1" min="0"
                                                    value={config.VIAL_WELL_SPACING}
                                                    onChange={(e) => handleConfigChange('VIAL_WELL_SPACING', parseFloat(e.target.value))}
                                                    className="form-input" />
                                            </div>
                                            <div className="form-group">
                                                <label>Vial Well Diameter (mm):</label>
                                                <input type="number" step="0.1" min="0"
                                                    value={config.VIAL_WELL_DIAMETER}
                                                    onChange={(e) => handleConfigChange('VIAL_WELL_DIAMETER', parseFloat(e.target.value))}
                                                    className="form-input" />
                                            </div>
                                            <div className="form-group">
                                                <label>Vial Well Height (mm):</label>
                                                <input type="number" step="0.1" min="0"
                                                    value={config.VIAL_WELL_HEIGHT}
                                                    onChange={(e) => handleConfigChange('VIAL_WELL_HEIGHT', parseFloat(e.target.value))}
                                                    className="form-input" />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : settingsSubTab === 'motor' ? (
                                <>
                                    <div className="config-section">
                                        <h3>Motor Configuration</h3>
                                        <div className="config-grid">
                                            <div className="form-group">
                                                <label>X-Axis Steps/mm:</label>
                                                <input
                                                    type="number" min="1"
                                                    value={config.STEPS_PER_MM_X}
                                                    onChange={(e) => handleConfigChange('STEPS_PER_MM_X', parseInt(e.target.value))}
                                                    className="form-input"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Y-Axis Steps/mm:</label>
                                                <input
                                                    type="number" min="1"
                                                    value={config.STEPS_PER_MM_Y}
                                                    onChange={(e) => handleConfigChange('STEPS_PER_MM_Y', parseInt(e.target.value))}
                                                    className="form-input"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Z-Axis Steps/mm:</label>
                                                <input
                                                    type="number" min="1"
                                                    value={config.STEPS_PER_MM_Z}
                                                    onChange={(e) => handleConfigChange('STEPS_PER_MM_Z', parseInt(e.target.value))}
                                                    className="form-input"
                                                />
                                            </div>
                                        </div>
                                        <div className="invert-row">
                                            <span className="invert-label">Invert Direction:</span>
                                            {[
                                                {key: 'INVERT_X',       label: 'X-Axis'},
                                                {key: 'INVERT_Y',       label: 'Y-Axis'},
                                                {key: 'INVERT_Z',       label: 'Z-Axis'},
                                                {key: 'INVERT_PIPETTE', label: 'Pipette'},
                                            ].map(({key, label}) => (
                                                <label key={key} className="invert-toggle">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!config[key]}
                                                        onChange={(e) => handleConfigChange(key, e.target.checked)}
                                                    />
                                                    <span className="invert-toggle-track" />
                                                    <span className="invert-toggle-text">{label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="config-section">
                                        <h3>Pipette Configuration</h3>
                                        <div className="config-grid">
                                            <div className="form-group">
                                                <label>Pipette Steps/mL:</label>
                                                <input
                                                    type="number" min="1"
                                                    value={config.PIPETTE_STEPS_PER_ML}
                                                    onChange={(e) => handleConfigChange('PIPETTE_STEPS_PER_ML', parseInt(e.target.value))}
                                                    className="form-input"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Max Pipette Volume (mL):</label>
                                                <input
                                                    type="number" min="0.1" step="0.1"
                                                    value={config.PIPETTE_MAX_ML}
                                                    onChange={(e) => handleConfigChange('PIPETTE_MAX_ML', parseFloat(e.target.value))}
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
                                                    type="number" step="0.1" min="0"
                                                    value={config.PICKUP_DEPTH}
                                                    onChange={(e) => handleConfigChange('PICKUP_DEPTH', parseFloat(e.target.value))}
                                                    className="form-input"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Dropoff Depth (mm):</label>
                                                <input
                                                    type="number" step="0.1" min="0"
                                                    value={config.DROPOFF_DEPTH}
                                                    onChange={(e) => handleConfigChange('DROPOFF_DEPTH', parseFloat(e.target.value))}
                                                    className="form-input"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Safe Height (mm):</label>
                                                <input
                                                    type="number" step="0.1" min="0"
                                                    value={config.SAFE_HEIGHT}
                                                    onChange={(e) => handleConfigChange('SAFE_HEIGHT', parseFloat(e.target.value))}
                                                    className="form-input"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Rinse Cycles:</label>
                                                <input
                                                    type="number" min="0"
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
                                                    type="number" step="0.0001" min="0"
                                                    value={config.TRAVEL_SPEED}
                                                    onChange={(e) => handleConfigChange('TRAVEL_SPEED', parseFloat(e.target.value))}
                                                    className="form-input"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Pipette Speed (s/step):</label>
                                                <input
                                                    type="number" step="0.0001" min="0"
                                                    value={config.PIPETTE_SPEED}
                                                    onChange={(e) => handleConfigChange('PIPETTE_SPEED', parseFloat(e.target.value))}
                                                    className="form-input"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                /* Calibration sub-tab */
                                <>
                                    <div className="config-section">
                                        <h3>Axis Calibration</h3>
                                        <p className="calibration-help">
                                            Send a known number of steps, measure the actual travel distance with a ruler,
                                            then calculate the correct Steps/mm for each axis.
                                        </p>
                                        <div className="calibration-cards">
                                            {['x', 'y', 'z'].map(axis => {
                                                const cal = calibration[axis]
                                                const configKey = `STEPS_PER_MM_${axis.toUpperCase()}`
                                                return (
                                                    <div key={axis} className="calibration-card">
                                                        <h4>{axis.toUpperCase()}-Axis</h4>
                                                        <div className="calibration-row">
                                                            <label>Steps/mm:</label>
                                                            <div className="calibration-spm-row">
                                                                <input
                                                                    type="number" min="1"
                                                                    value={config[configKey]}
                                                                    onChange={(e) => handleConfigChange(configKey, parseInt(e.target.value) || 0)}
                                                                    className="form-input"
                                                                />
                                                                <button
                                                                    className="calibration-btn apply-btn"
                                                                    onClick={async () => {
                                                                        setConfigLoading(true)
                                                                        setConfigMessage('')
                                                                        try {
                                                                            const res = await fetch('/api/config', {
                                                                                method: 'POST',
                                                                                headers: {'Content-Type': 'application/json'},
                                                                                body: JSON.stringify(config)
                                                                            })
                                                                            const data = await res.json()
                                                                            setConfigMessage(data.status === 'success' ? '✓ ' + data.message : '✗ Failed to save')
                                                                        } catch (err) {
                                                                            setConfigMessage('✗ Error: ' + err.message)
                                                                        } finally {
                                                                            setConfigLoading(false)
                                                                        }
                                                                    }}
                                                                >
                                                                    Save
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <hr className="calibration-divider" />

                                                        <div className="calibration-row">
                                                            <label>Test Steps:</label>
                                                            <input
                                                                type="number" min="1"
                                                                value={cal.testSteps}
                                                                onChange={(e) => setCalibration(prev => ({
                                                                    ...prev,
                                                                    [axis]: {...prev[axis], testSteps: parseInt(e.target.value) || 0}
                                                                }))}
                                                                className="form-input"
                                                            />
                                                        </div>

                                                        <div className="calibration-move-buttons">
                                                            <button
                                                                className="calibration-btn move-btn"
                                                                onClick={() => handleAxisMove(axis, cal.testSteps, 'cw')}
                                                            >
                                                                Move +
                                                            </button>
                                                            <button
                                                                className="calibration-btn move-btn"
                                                                onClick={() => handleAxisMove(axis, cal.testSteps, 'ccw')}
                                                            >
                                                                Move −
                                                            </button>
                                                        </div>

                                                        <div className="calibration-row">
                                                            <label>Measured Distance (mm):</label>
                                                            <input
                                                                type="number" step="0.01" min="0"
                                                                value={cal.measuredDistance}
                                                                onChange={(e) => setCalibration(prev => ({
                                                                    ...prev,
                                                                    [axis]: {...prev[axis], measuredDistance: e.target.value}
                                                                }))}
                                                                className="form-input"
                                                                placeholder="Enter measured mm"
                                                            />
                                                        </div>

                                                        <button
                                                            className="calibration-btn calculate-btn"
                                                            disabled={!cal.measuredDistance || parseFloat(cal.measuredDistance) <= 0}
                                                            onClick={() => {
                                                                const dist = parseFloat(cal.measuredDistance)
                                                                if (dist > 0) {
                                                                    const spm = Math.round(cal.testSteps / dist)
                                                                    setCalibration(prev => ({
                                                                        ...prev,
                                                                        [axis]: {...prev[axis], calculatedSPM: spm}
                                                                    }))
                                                                }
                                                            }}
                                                        >
                                                            Calculate
                                                        </button>

                                                        {cal.calculatedSPM !== null && (
                                                            <div className="calibration-result">
                                                                <span className="calibration-value">
                                                                    {cal.calculatedSPM} steps/mm
                                                                </span>
                                                                <button
                                                                    className="calibration-btn apply-btn"
                                                                    onClick={async () => {
                                                                        const updatedConfig = {...config, [configKey]: cal.calculatedSPM}
                                                                        setConfig(updatedConfig)
                                                                        setConfigLoading(true)
                                                                        setConfigMessage('')
                                                                        try {
                                                                            const res = await fetch('/api/config', {
                                                                                method: 'POST',
                                                                                headers: {'Content-Type': 'application/json'},
                                                                                body: JSON.stringify(updatedConfig)
                                                                            })
                                                                            const data = await res.json()
                                                                            setConfigMessage(data.status === 'success' ? '✓ ' + data.message : '✗ Failed to save')
                                                                        } catch (err) {
                                                                            setConfigMessage('✗ Error: ' + err.message)
                                                                        } finally {
                                                                            setConfigLoading(false)
                                                                        }
                                                                    }}
                                                                >
                                                                    Apply &amp; Save
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}

                                            {/* Pipette calibration card */}
                                            <div className="calibration-card">
                                                <h4>Pipette</h4>
                                                <div className="calibration-row">
                                                    <label>Steps/mL:</label>
                                                    <div className="calibration-spm-row">
                                                        <input
                                                            type="number" min="1"
                                                            value={config.PIPETTE_STEPS_PER_ML}
                                                            onChange={(e) => handleConfigChange('PIPETTE_STEPS_PER_ML', parseInt(e.target.value) || 0)}
                                                            className="form-input"
                                                        />
                                                        <button
                                                            className="calibration-btn apply-btn"
                                                            onClick={async () => {
                                                                setConfigLoading(true)
                                                                setConfigMessage('')
                                                                try {
                                                                    const res = await fetch('/api/config', {
                                                                        method: 'POST',
                                                                        headers: {'Content-Type': 'application/json'},
                                                                        body: JSON.stringify(config)
                                                                    })
                                                                    const data = await res.json()
                                                                    setConfigMessage(data.status === 'success' ? '✓ ' + data.message : '✗ Failed to save')
                                                                } catch (err) {
                                                                    setConfigMessage('✗ Error: ' + err.message)
                                                                } finally {
                                                                    setConfigLoading(false)
                                                                }
                                                            }}
                                                        >
                                                            Save
                                                        </button>
                                                    </div>
                                                </div>

                                                <hr className="calibration-divider" />

                                                <div className="calibration-row">
                                                    <label>Test Steps:</label>
                                                    <input
                                                        type="number" min="1"
                                                        value={calibration.pipette.testSteps}
                                                        onChange={(e) => setCalibration(prev => ({
                                                            ...prev,
                                                            pipette: {...prev.pipette, testSteps: parseInt(e.target.value) || 0}
                                                        }))}
                                                        className="form-input"
                                                    />
                                                </div>

                                                <div className="calibration-move-buttons">
                                                    <button
                                                        className="calibration-btn move-btn"
                                                        onClick={() => handleAxisMove('pipette', calibration.pipette.testSteps, 'cw')}
                                                    >
                                                        Aspirate +
                                                    </button>
                                                    <button
                                                        className="calibration-btn move-btn"
                                                        onClick={() => handleAxisMove('pipette', calibration.pipette.testSteps, 'ccw')}
                                                    >
                                                        Dispense −
                                                    </button>
                                                </div>

                                                <div className="calibration-row">
                                                    <label>Measured Volume (mL):</label>
                                                    <input
                                                        type="number" step="0.01" min="0"
                                                        value={calibration.pipette.measuredVolume}
                                                        onChange={(e) => setCalibration(prev => ({
                                                            ...prev,
                                                            pipette: {...prev.pipette, measuredVolume: e.target.value}
                                                        }))}
                                                        className="form-input"
                                                        placeholder="Enter measured mL"
                                                    />
                                                </div>

                                                <button
                                                    className="calibration-btn calculate-btn"
                                                    disabled={!calibration.pipette.measuredVolume || parseFloat(calibration.pipette.measuredVolume) <= 0}
                                                    onClick={() => {
                                                        const vol = parseFloat(calibration.pipette.measuredVolume)
                                                        if (vol > 0) {
                                                            const spml = Math.round(calibration.pipette.testSteps / vol)
                                                            setCalibration(prev => ({
                                                                ...prev,
                                                                pipette: {...prev.pipette, calculatedSPML: spml}
                                                            }))
                                                        }
                                                    }}
                                                >
                                                    Calculate
                                                </button>

                                                {calibration.pipette.calculatedSPML !== null && (
                                                    <div className="calibration-result">
                                                        <span className="calibration-value">
                                                            {calibration.pipette.calculatedSPML} steps/mL
                                                        </span>
                                                        <button
                                                            className="calibration-btn apply-btn"
                                                            onClick={async () => {
                                                                const updatedConfig = {...config, PIPETTE_STEPS_PER_ML: calibration.pipette.calculatedSPML}
                                                                setConfig(updatedConfig)
                                                                setConfigLoading(true)
                                                                setConfigMessage('')
                                                                try {
                                                                    const res = await fetch('/api/config', {
                                                                        method: 'POST',
                                                                        headers: {'Content-Type': 'application/json'},
                                                                        body: JSON.stringify(updatedConfig)
                                                                    })
                                                                    const data = await res.json()
                                                                    setConfigMessage(data.status === 'success' ? '✓ ' + data.message : '✗ Failed to save')
                                                                } catch (err) {
                                                                    setConfigMessage('✗ Error: ' + err.message)
                                                                } finally {
                                                                    setConfigLoading(false)
                                                                }
                                                            }}
                                                        >
                                                            Apply &amp; Save
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

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

                        {/* Layout Toggle */}
                        <div className="layout-toggle">
                            <button
                                className={`btn ${layoutType === 'microchip' ? 'active' : ''}`}
                                onClick={() => handleSetLayout('microchip')}
                                disabled={isExecuting}
                            >
                                MicroChip
                            </button>
                            <button
                                className={`btn ${layoutType === 'wellplate' ? 'active' : ''}`}
                                onClick={() => handleSetLayout('wellplate')}
                                disabled={isExecuting}
                            >
                                Vial
                            </button>
                        </div>

                        <div className="pipette-config-panel">
                            <div className="pipette-config-row">
                                <div className="pipette-config-item">
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
                                </div>
                                <button
                                    className={`btn btn-z-toggle ${zAxisUp ? 'z-up' : 'z-down'}`}
                                    onClick={handleToggleZ}
                                    disabled={isExecuting}
                                >
                                    Z-Axis: {zAxisUp ? '⬆ UP' : '⬇ DOWN'}
                                </button>
                            </div>
                            <div className="pipette-volume-row">
                                <div className="pipette-current-volume">
                                    Current: <strong>{axisPositions.pipette_ml ?? 0} mL</strong> / {config.PIPETTE_MAX_ML ?? 100} mL
                                </div>
                                <div className="pipette-volume-input">
                                    <label>Volume (mL):</label>
                                    <input
                                        type="number"
                                        min="0.1"
                                        max={config.PIPETTE_MAX_ML || 100}
                                        step="0.1"
                                        value={pipetteVolume}
                                        onChange={(e) => setPipetteVolume(e.target.value)}
                                        className="form-input"
                                        disabled={isExecuting}
                                    />
                                </div>
                                <div className="pipette-action-buttons">
                                    <button
                                        className="btn btn-collect"
                                        onClick={handleCollect}
                                        disabled={isExecuting}
                                    >
                                        Collect
                                    </button>
                                    <button
                                        className="btn btn-dispense"
                                        onClick={handleDispense}
                                        disabled={isExecuting}
                                    >
                                        Dispense
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

                        {/* Render layout based on selected type — strict 12×21 CSS grid */}
                        {layoutType === 'microchip' ? (
                            /* MicroChip Layout */
                            <div className="layout-grid">
                                {/* WS1 — row 1, cols 1-6 */}
                                <div
                                    className={`grid-zone ${selectedWell === 'WS1' ? 'selected' : ''} ${targetWell === 'WS1' ? 'target' : ''} ${quickOpMode && quickOpWells.pickup === 'WS1' ? 'quick-op-pickup' : ''} ${quickOpMode && quickOpWells.dropoff === 'WS1' ? 'quick-op-dropoff' : ''} ${quickOpMode && quickOpWells.rinse === 'WS1' ? 'quick-op-rinse' : ''}`}
                                    style={{gridColumn: '1/7', gridRow: '1/2'}}
                                    onClick={() => handleWellClick('WS1')}
                                >
                                    WS1
                                    {quickOpMode && quickOpWells.pickup === 'WS1' && <span className="quick-op-badge">P</span>}
                                    {quickOpMode && quickOpWells.dropoff === 'WS1' && <span className="quick-op-badge">D</span>}
                                    {quickOpMode && quickOpWells.rinse === 'WS1' && <span className="quick-op-badge">R</span>}
                                </div>
                                {/* WS2 — row 2, cols 1-6 */}
                                <div
                                    className={`grid-zone ${selectedWell === 'WS2' ? 'selected' : ''} ${targetWell === 'WS2' ? 'target' : ''} ${quickOpMode && quickOpWells.pickup === 'WS2' ? 'quick-op-pickup' : ''} ${quickOpMode && quickOpWells.dropoff === 'WS2' ? 'quick-op-dropoff' : ''} ${quickOpMode && quickOpWells.rinse === 'WS2' ? 'quick-op-rinse' : ''}`}
                                    style={{gridColumn: '1/7', gridRow: '2/3'}}
                                    onClick={() => handleWellClick('WS2')}
                                >
                                    WS2
                                    {quickOpMode && quickOpWells.pickup === 'WS2' && <span className="quick-op-badge">P</span>}
                                    {quickOpMode && quickOpWells.dropoff === 'WS2' && <span className="quick-op-badge">D</span>}
                                    {quickOpMode && quickOpWells.rinse === 'WS2' && <span className="quick-op-badge">R</span>}
                                </div>
                                {/* Disabled area — rows 3-12, cols 1-6 */}
                                <div className="grid-zone disabled-zone" style={{gridColumn: '1/7', gridRow: '3/13'}} />

                                {/* Well grid 8×15 — rows 1-8, cols 7-21 */}
                                <div className="mc-well-zone" style={{gridColumn: '7/22', gridRow: '1/9'}}>
                                    {['A','B','C','D','E','F','G','H'].flatMap(row =>
                                        [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].map(col => {
                                            const wellId = `${row}${col}`
                                            const pipetteWells = getPipetteWells(selectedWell, currentPipetteCount)
                                            const isCenterPipette = wellId === selectedWell
                                            const isSidePipette = pipetteWells.includes(wellId) && !isCenterPipette
                                            const opWells = operationWell ? getPipetteWells(operationWell, currentPipetteCount) : []
                                            const isOperating = opWells.includes(wellId) && currentOperation !== 'idle'
                                            const isQPickup = quickOpMode && quickOpWells.pickup === wellId
                                            const isQDropoff = quickOpMode && quickOpWells.dropoff === wellId
                                            const isQRinse = quickOpMode && quickOpWells.rinse === wellId
                                            return (
                                                <div
                                                    key={wellId}
                                                    className={`microchip-well ${isCenterPipette ? 'selected' : ''} ${isSidePipette ? 'pipette-side' : ''} ${targetWell === wellId ? 'target' : ''} ${isOperating ? `operation-${currentOperation}` : ''} ${isQPickup ? 'quick-op-pickup' : ''} ${isQDropoff ? 'quick-op-dropoff' : ''} ${isQRinse ? 'quick-op-rinse' : ''}`}
                                                    onClick={() => handleWellClick(wellId)}
                                                >
                                                    {isQPickup && <span className="quick-op-badge">P</span>}
                                                    {isQDropoff && <span className="quick-op-badge">D</span>}
                                                    {isQRinse && <span className="quick-op-badge">R</span>}
                                                </div>
                                            )
                                        })
                                    )}
                                </div>

                                {/* MicroChips — rows 9-12, each 3-col block */}
                                {[1,2,3,4,5].map(n => {
                                    const colStart = 7 + (n - 1) * 3
                                    const mcId = `MC${n}`
                                    const isQPickup = quickOpMode && quickOpWells.pickup === mcId
                                    const isQDropoff = quickOpMode && quickOpWells.dropoff === mcId
                                    const isQRinse = quickOpMode && quickOpWells.rinse === mcId
                                    return (
                                        <div
                                            key={mcId}
                                            className={`grid-zone mc-chip-zone ${selectedWell === mcId ? 'selected' : ''} ${targetWell === mcId ? 'target' : ''} ${isQPickup ? 'quick-op-pickup' : ''} ${isQDropoff ? 'quick-op-dropoff' : ''} ${isQRinse ? 'quick-op-rinse' : ''}`}
                                            style={{gridColumn: `${colStart}/${colStart + 3}`, gridRow: '9/13'}}
                                            onClick={() => handleWellClick(mcId)}
                                        >
                                            {mcId}
                                            {isQPickup && <span className="quick-op-badge">P</span>}
                                            {isQDropoff && <span className="quick-op-badge">D</span>}
                                            {isQRinse && <span className="quick-op-badge">R</span>}
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            /* Vial Layout */
                            <div className="layout-grid">
                                {/* WS1 — row 1, cols 1-6 */}
                                <div
                                    className={`grid-zone ${selectedWell === 'WS1' ? 'selected' : ''} ${targetWell === 'WS1' ? 'target' : ''} ${quickOpMode && quickOpWells.pickup === 'WS1' ? 'quick-op-pickup' : ''} ${quickOpMode && quickOpWells.dropoff === 'WS1' ? 'quick-op-dropoff' : ''} ${quickOpMode && quickOpWells.rinse === 'WS1' ? 'quick-op-rinse' : ''}`}
                                    style={{gridColumn: '1/7', gridRow: '1/2'}}
                                    onClick={() => handleWellClick('WS1')}
                                >
                                    WS1
                                    {quickOpMode && quickOpWells.pickup === 'WS1' && <span className="quick-op-badge">P</span>}
                                    {quickOpMode && quickOpWells.dropoff === 'WS1' && <span className="quick-op-badge">D</span>}
                                    {quickOpMode && quickOpWells.rinse === 'WS1' && <span className="quick-op-badge">R</span>}
                                </div>
                                {/* WS2 — row 2, cols 1-6 */}
                                <div
                                    className={`grid-zone ${selectedWell === 'WS2' ? 'selected' : ''} ${targetWell === 'WS2' ? 'target' : ''} ${quickOpMode && quickOpWells.pickup === 'WS2' ? 'quick-op-pickup' : ''} ${quickOpMode && quickOpWells.dropoff === 'WS2' ? 'quick-op-dropoff' : ''} ${quickOpMode && quickOpWells.rinse === 'WS2' ? 'quick-op-rinse' : ''}`}
                                    style={{gridColumn: '1/7', gridRow: '2/3'}}
                                    onClick={() => handleWellClick('WS2')}
                                >
                                    WS2
                                    {quickOpMode && quickOpWells.pickup === 'WS2' && <span className="quick-op-badge">P</span>}
                                    {quickOpMode && quickOpWells.dropoff === 'WS2' && <span className="quick-op-badge">D</span>}
                                    {quickOpMode && quickOpWells.rinse === 'WS2' && <span className="quick-op-badge">R</span>}
                                </div>

                                {/* Vials sub-grid — rows 3-12, cols 1-6 (5 rows × 3 cols = 15 vials) */}
                                <div className="vial-zone" style={{gridColumn: '1/7', gridRow: '3/13'}}>
                                    {['A','B','C','D','E'].flatMap(row =>
                                        [1,2,3].map(col => {
                                            const vialId = `V${row}${col}`
                                            const isQPickup = quickOpMode && quickOpWells.pickup === vialId
                                            const isQDropoff = quickOpMode && quickOpWells.dropoff === vialId
                                            const isQRinse = quickOpMode && quickOpWells.rinse === vialId
                                            const opWells = operationWell ? getPipetteWells(operationWell, currentPipetteCount) : []
                                            const isOperating = opWells.includes(vialId) && currentOperation !== 'idle'
                                            return (
                                                <div
                                                    key={vialId}
                                                    className={`large-well ${selectedWell === vialId ? 'selected' : ''} ${targetWell === vialId ? 'target' : ''} ${isOperating ? `operation-${currentOperation}` : ''} ${isQPickup ? 'quick-op-pickup' : ''} ${isQDropoff ? 'quick-op-dropoff' : ''} ${isQRinse ? 'quick-op-rinse' : ''}`}
                                                    onClick={() => handleWellClick(vialId)}
                                                >
                                                    {vialId}
                                                    {isQPickup && <span className="quick-op-badge">P</span>}
                                                    {isQDropoff && <span className="quick-op-badge">D</span>}
                                                    {isQRinse && <span className="quick-op-badge">R</span>}
                                                </div>
                                            )
                                        })
                                    )}
                                </div>

                                {/* Small wells sub-grid — rows 1-12, cols 7-21 (12 rows × 6 cols = 72 wells) */}
                                <div className="vial-well-zone" style={{gridColumn: '7/22', gridRow: '1/13'}}>
                                    {['A','B','C','D','E','F','G','H','I','J','K','L'].flatMap(row =>
                                        [1,2,3,4,5,6].map(col => {
                                            const wellId = `S${row}${col}`
                                            const isQPickup = quickOpMode && quickOpWells.pickup === wellId
                                            const isQDropoff = quickOpMode && quickOpWells.dropoff === wellId
                                            const isQRinse = quickOpMode && quickOpWells.rinse === wellId
                                            const opWells = operationWell ? getPipetteWells(operationWell, currentPipetteCount) : []
                                            const isOperating = opWells.includes(wellId) && currentOperation !== 'idle'
                                            return (
                                                <div
                                                    key={wellId}
                                                    className={`small-well ${selectedWell === wellId ? 'selected' : ''} ${targetWell === wellId ? 'target' : ''} ${isOperating ? `operation-${currentOperation}` : ''} ${isQPickup ? 'quick-op-pickup' : ''} ${isQDropoff ? 'quick-op-dropoff' : ''} ${isQRinse ? 'quick-op-rinse' : ''}`}
                                                    onClick={() => handleWellClick(wellId)}
                                                >
                                                    {isQPickup && <span className="quick-op-badge">P</span>}
                                                    {isQDropoff && <span className="quick-op-badge">D</span>}
                                                    {isQRinse && <span className="quick-op-badge">R</span>}
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            </div>
                        )}
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