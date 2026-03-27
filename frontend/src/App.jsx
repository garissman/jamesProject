import {useCallback, useEffect, useRef, useState} from 'react'
import NavBar from './components/NavBar'
import PlateLayout from './components/PlateLayout'
import ProgramTab from './components/ProgramTab'
import ManualTab from './components/ManualTab'
import DriftTestTab from './components/DriftTestTab'
import SettingsTab from './components/SettingsTab'
import RightPanel from './components/RightPanel'

const TAB_TO_PATH = {
    'protocol': '/',
    'program': '/program',
    'manual': '/manual',
    'drift-test': '/drift-test',
    'settings': '/settings',
}

const PATH_TO_TAB = Object.fromEntries(
    Object.entries(TAB_TO_PATH).map(([tab, path]) => [path, tab])
)

function getTabFromPath() {
    return PATH_TO_TAB[window.location.pathname] || 'protocol'
}

function App() {
    const [activeTab, setActiveTabState] = useState(getTabFromPath)

    const setActiveTab = useCallback((tab) => {
        setActiveTabState(tab)
        const path = TAB_TO_PATH[tab] || '/'
        if (window.location.pathname !== path) {
            window.history.pushState({ tab }, '', path)
        }
    }, [])

    // Handle browser back/forward
    useEffect(() => {
        const onPopState = () => setActiveTabState(getTabFromPath())
        window.addEventListener('popstate', onPopState)
        return () => window.removeEventListener('popstate', onPopState)
    }, [])
    const [selectedWell, setSelectedWell] = useState('WS1')
    const [targetWell, setTargetWell] = useState(null)
    const [currentPipetteCount, setCurrentPipetteCount] = useState(3)
    const [currentOperation, setCurrentOperation] = useState('idle')
    const [operationWell, setOperationWell] = useState(null)
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('theme') || 'light'
    })

    // Configuration state
    const [config, setConfig] = useState({
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
        INVERT_X: false,
        INVERT_Y: false,
        INVERT_Z: false,
        INVERT_PIPETTE: false,
        CONTROLLER_TYPE: 'raspberry_pi'
    })

    // Program tab state
    const [steps, setSteps] = useState([])
    const [isExecuting, setIsExecuting] = useState(false)
    const [currentStepIndex, setCurrentStepIndex] = useState(null)
    const [totalSteps, setTotalSteps] = useState(null)
    const [systemStatus, setSystemStatus] = useState('Connecting...')
    const [logs, setLogs] = useState([])

    // Schedule state
    const [schedule, setSchedule] = useState({ cronExpression: '', enabled: false })
    const [programExecution, setProgramExecution] = useState({ status: 'idle' })

    // Layout type state
    const [layoutType, setLayoutType] = useState('microchip')

    // Well selection mode for picking wells from the plate
    const [wellSelectionMode, setWellSelectionMode] = useState(null)

    // Controller type
    const [controllerType, setControllerType] = useState('raspberry_pi')

    // Motor stop interlock
    const [motorStopped, setMotorStopped] = useState(false)
    const prevMotorStoppedRef = useRef(false)

    // Axis positions state
    const [axisPositions, setAxisPositions] = useState({x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {}})

    // Z-axis state derived from actual position
    const zAxisUp = axisPositions.z >= 35

    // Well data
    const [_wellData, _setWellData] = useState({})

    // Ref for auto-scrolling logs
    const logsEndRef = useRef(null)
    const previousLogCountRef = useRef(0)

    // Layout definitions
    const layouts = {
        microchip: {
            name: 'MicroChip Layout',
            reservoirs: [
                {id: 'WS1', label: 'Washing Station 1', type: 'reservoir'},
                {id: 'WS2', label: 'Washing Station 2', type: 'reservoir'}
            ],
            wellGrid: {
                rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
                columns: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
            },
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
            reservoirs: [
                {id: 'WS1', label: 'Washing Station 1', type: 'reservoir'},
                {id: 'WS2', label: 'Washing Station 2', type: 'reservoir'}
            ],
            vialGrid: {
                rows: ['A', 'B', 'C', 'D', 'E'],
                columns: [1, 2, 3],
                prefix: 'V'
            },
            smallWellGrid: {
                rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'],
                columns: [1, 2, 3, 4, 5, 6]
            }
        }
    }

    // ── Utility functions ──

    const validateWellId = (wellId) => {
        if (!wellId || wellId.trim() === '') return true

        const wellIdUpper = wellId.trim().toUpperCase()

        if (['WS1', 'WS2'].includes(wellIdUpper)) return true
        if (['MC1', 'MC2', 'MC3', 'MC4', 'MC5'].includes(wellIdUpper)) return true

        const vialPattern = /^V[A-E][1-3]$/
        if (vialPattern.test(wellIdUpper)) return true

        const smallWellPattern = /^[A-L][1-6]$/
        if (smallWellPattern.test(wellIdUpper)) return true

        const wellPattern = /^[A-H]([1-9]|1[0-5])$/
        return wellPattern.test(wellIdUpper)
    }

    const getPipetteWells = (centerWell, pipetteCount) => {
        if (!centerWell || pipetteCount === 1) return [centerWell]

        const match = centerWell.match(/^([A-H])(\d+)$/)
        if (!match) return [centerWell]

        const row = match[1]
        const col = parseInt(match[2])
        const wells = []

        if (col > 1) wells.push(`${row}${col - 1}`)
        wells.push(centerWell)
        if (col < 15) wells.push(`${row}${col + 1}`)

        return wells
    }

    // ── Handler functions ──

    const handleAddStep = (stepData) => {
        const stepType = stepData.stepType || 'pipette'
        const newStep = {
            id: Date.now(),
            stepType,
            cycles: Number(stepData.cycles) || 1,
            pickupWell: (stepData.pickupWell || '').trim().toUpperCase(),
            dropoffWell: (stepData.dropoffWell || '').trim().toUpperCase(),
            rinseWell: (stepData.rinseWell || '').trim().toUpperCase(),
            washWell: (stepData.washWell || '').trim().toUpperCase(),
            waitTime: Number(stepData.waitTime) || 0,
            sampleVolume: Number(stepData.sampleVolume) || 40,
            repetitionMode: stepData.repetitionMode || 'quantity',
            repetitionQuantity: stepData.repetitionMode === 'quantity' ? Number(stepData.repetitionQuantity) || 1 : 1,
            repetitionInterval: stepData.repetitionMode === 'timeFrequency' ? Number(stepData.repetitionInterval) || null : null,
            repetitionDuration: stepData.repetitionMode === 'timeFrequency' ? Number(stepData.repetitionDuration) || null : null,
            pipetteCount: 3,
        }
        setSteps(prev => [...prev, newStep])
    }

    const handleUpdateStep = (stepId, stepData) => {
        setSteps(prev => prev.map(s => s.id === stepId ? {
            ...s,
            stepType: stepData.stepType || s.stepType || 'pipette',
            cycles: Number(stepData.cycles) || 1,
            pickupWell: (stepData.pickupWell || '').trim().toUpperCase(),
            dropoffWell: (stepData.dropoffWell || '').trim().toUpperCase(),
            rinseWell: (stepData.rinseWell || '').trim().toUpperCase(),
            washWell: (stepData.washWell || '').trim().toUpperCase(),
            waitTime: Number(stepData.waitTime) || 0,
            sampleVolume: Number(stepData.sampleVolume) || 40,
            repetitionMode: stepData.repetitionMode || 'quantity',
            repetitionQuantity: stepData.repetitionMode === 'quantity' ? Number(stepData.repetitionQuantity) || 1 : 1,
            repetitionInterval: stepData.repetitionMode === 'timeFrequency' ? Number(stepData.repetitionInterval) || null : null,
            repetitionDuration: stepData.repetitionMode === 'timeFrequency' ? Number(stepData.repetitionDuration) || null : null,
            pipetteCount: 3,
        } : s))
    }

    const handleDuplicateStep = (stepId) => {
        setSteps(prev => {
            const idx = prev.findIndex(s => s.id === stepId)
            if (idx === -1) return prev
            const copy = { ...prev[idx], id: Date.now() }
            const next = [...prev]
            next.splice(idx + 1, 0, copy)
            return next
        })
    }

    const handleDeleteStep = (stepId) => {
        setSteps(prev => prev.filter(s => s.id !== stepId))
    }

    const handleReorderSteps = (fromIndex, toIndex) => {
        setSteps(prev => {
            const next = [...prev]
            const [moved] = next.splice(fromIndex, 1)
            next.splice(toIndex, 0, moved)
            return next
        })
    }

    const handleDeleteAll = () => {
        if (steps.length > 0) {
            if (window.confirm(`Are you sure you want to delete all ${steps.length} step(s)?`)) {
                setSteps([])
            }
        }
    }

    const handleSaveProgram = async () => {
        if (steps.length === 0) {
            console.error('No program steps to save.')
            return
        }

        try {
            const response = await fetch('/api/program/save', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({steps, schedule})
            })

            const data = await response.json()

            if (response.ok) {
                console.log(data.message)
            } else {
                console.error(`Error: ${data.detail || 'Failed to save program'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to save program. ${error.message}`)
        }
    }

    const handleLoadProgram = (loadedSteps, loadedSchedule) => {
        if (loadedSteps) {
            setSteps(loadedSteps)
            if (loadedSchedule) setSchedule(loadedSchedule)
        }
    }

    const handleExecute = async () => {
        if (steps.length === 0) {
            console.error('No steps to execute. Please add steps first.')
            return
        }

        setActiveTab('protocol')
        setIsExecuting(true)

        try {
            const response = await fetch('/api/pipetting/execute', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({steps})
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`Success! ${data.message} - Steps executed: ${data.steps_executed}`)
                fetchCurrentPosition()
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
                headers: {'Content-Type': 'application/json'}
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`${data.message}`)
                setMotorStopped(data.motor_stopped)
                if (data.motor_stopped) setIsExecuting(false)
                fetchCurrentPosition()
            } else {
                console.error(`Error: ${data.detail || 'Failed to toggle motor stop'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to connect to backend. ${error.message}`)
        }
    }

    const handleHome = async () => {
        setIsExecuting(true)
        try {
            const response = await fetch('/api/pipetting/home', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'}
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`${data.message}`)
                fetchCurrentPosition()
                fetchAxisPositions()
            } else {
                console.error(`Error: ${data.detail || 'Failed to home system'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to connect to backend. ${error.message}`)
        } finally {
            setIsExecuting(false)
        }
    }

    const handleSetPipetteCount = async (count) => {
        try {
            const response = await fetch('/api/pipetting/set-pipette-count', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({pipetteCount: count})
            })

            const data = await response.json()

            if (response.ok) {
                setCurrentPipetteCount(count)
                console.log(`${data.message}`)
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
            if (res.ok) {
                const _data = await res.json()
                setLayoutType(mode)
            } else {
                const data = await res.json()
                console.error(`Error: ${data.detail || 'Failed to set layout'}`)
            }
        } catch (e) {
            console.error('Failed to set layout:', e.message)
        }
    }

    const handleWellClick = (wellId) => {
        if (wellSelectionMode) {
            wellSelectionMode.callback(wellId)
            setWellSelectionMode(null)
            setActiveTab('program')
            return
        }
        setTargetWell(wellId)
    }

    const handleMoveToWell = async () => {
        if (!targetWell) return

        try {
            const response = await fetch('/api/pipetting/move-to-well', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({wellId: targetWell})
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`${data.message}`)
                fetchCurrentPosition()
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
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({direction: zAxisUp ? 'down' : 'up'})
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`${data.message}`)
                fetchAxisPositions()
            } else {
                console.error(`Error: ${data.detail || 'Failed to toggle Z-axis'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to connect to backend. ${error.message}`)
        }
    }

    const handleCollect = async (volume) => {
        const vol = parseFloat(volume)
        const maxML = config.PIPETTE_MAX_ML || 100
        if (isNaN(vol) || vol <= 0 || vol > maxML) {
            console.error(`Volume must be between 0 and ${maxML} µL`)
            return
        }

        try {
            const response = await fetch('/api/pipetting/aspirate', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({volume: vol})
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

    const handleDispense = async (volume) => {
        const vol = parseFloat(volume)
        const maxML = config.PIPETTE_MAX_ML || 100
        if (isNaN(vol) || vol <= 0 || vol > maxML) {
            console.error(`Volume must be between 0 and ${maxML} µL`)
            return
        }

        try {
            const response = await fetch('/api/pipetting/dispense', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({volume: vol})
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
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({axis, steps, direction})
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`${data.message}`)
                if (data.positions) {
                    setAxisPositions(data.positions)
                }
                fetchCurrentPosition()
            } else {
                console.error(`Error: ${data.detail || 'Failed to move axis'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to connect to backend. ${error.message}`)
        }
    }

    const handleSetPosition = async (positionData) => {
        try {
            const response = await fetch('/api/axis/set-position', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    x: parseFloat(positionData.x) || 0,
                    y: parseFloat(positionData.y) || 0,
                    z: parseFloat(positionData.z) || 0,
                    pipette_ml: parseFloat(positionData.pipette_ml) || 0
                })
            })
            const data = await response.json()
            if (response.ok) {
                console.log(data.message)
                if (data.positions) setAxisPositions(data.positions)
                fetchCurrentPosition()
                return true
            } else {
                console.error(`Error: ${data.detail || 'Failed to set position'}`)
                return false
            }
        } catch (error) {
            console.error('Failed to set position:', error.message)
            return false
        }
    }

    // ── Fetch functions (with in-flight guards to avoid stacking requests) ──

    const statusPending = useRef(false)
    const axisPending = useRef(false)
    const logsPending = useRef(false)

    const fetchCurrentPosition = async () => {
        if (statusPending.current) return
        statusPending.current = true
        try {
            const response = await fetch('/api/pipetting/status')
            const data = await response.json()

            // Always update motor_stopped regardless of initialization state
            if (data.motor_stopped !== undefined) setMotorStopped(data.motor_stopped)

            if (data.initialized && data.current_well) {
                setSelectedWell(data.current_well)
                setSystemStatus(data.message || 'System ready')

                if (data.pipette_count !== undefined) setCurrentPipetteCount(data.pipette_count)
                if (data.layout_type !== undefined) setLayoutType(data.layout_type)
                /* v8 ignore start */
                if (data.is_executing !== undefined) setIsExecuting(data.is_executing)
                /* v8 ignore stop */
                setCurrentStepIndex(data.current_step_index ?? null)
                setTotalSteps(data.total_steps ?? null)
                if (data.controller_type !== undefined) setControllerType(data.controller_type)
                if (data.current_operation !== undefined) setCurrentOperation(data.current_operation)
                if (data.operation_well !== undefined) setOperationWell(data.operation_well)
            } else {
                setSystemStatus(data.message || 'System not ready')
            }
        } catch (error) {
            console.error('Failed to fetch current position:', error)
            setSystemStatus('Backend offline')
        } finally {
            statusPending.current = false
        }
    }

    const fetchAxisPositions = async () => {
        if (axisPending.current) return
        axisPending.current = true
        try {
            const response = await fetch('/api/axis/positions')
            const data = await response.json()

            if (data.status === 'success' && data.positions) {
                setAxisPositions(data.positions)
            }
        } catch (error) {
            console.error('Failed to fetch axis positions:', error)
        } finally {
            axisPending.current = false
        }
    }

    const fetchLogs = async () => {
        if (logsPending.current) return
        logsPending.current = true
        try {
            const response = await fetch('/api/pipetting/logs?last_n=100')
            const data = await response.json()

            if (data.logs) {
                setLogs(data.logs)
            }
        } catch (error) {
            console.error('Failed to fetch logs:', error)
        } finally {
            logsPending.current = false
        }
    }

    const fetchProgramStatus = async () => {
        try {
            const response = await fetch('/api/program/status')
            const data = await response.json()
            if (data.execution) setProgramExecution(data.execution)
        } catch {
            // silently ignore
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
        const stringKeys = ['CONTROLLER_TYPE']
        const excludeKeys = ['LAYOUT_COORDINATES']
        const parsed = {}
        for (const [key, value] of Object.entries(config)) {
            if (excludeKeys.includes(key)) continue
            if (stringKeys.includes(key)) {
                parsed[key] = value
            } else if (typeof value === 'string' && !['true', 'false'].includes(value)) {
                parsed[key] = Number(value) || 0
            } else {
                parsed[key] = value
            }
        }
        setConfig(prev => ({...parsed, LAYOUT_COORDINATES: prev.LAYOUT_COORDINATES}))

        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(parsed)
            })

            const data = await response.json()
            if (data.status === 'success') {
                fetchCurrentPosition()
                fetchAxisPositions()
            }
            return data
        } catch (error) {
            console.error('Failed to save configuration:', error)
            return {status: 'error', message: error.message}
        }
    }

    const handleConfigChange = (key, value) => {
        setConfig(prev => ({
            ...prev,
            [key]: value
        }))
    }

    // ── Effects ──

    // Load saved program from server on mount
    const initialLoadDone = useRef(false)
    useEffect(() => {
        const loadSavedProgram = async () => {
            try {
                const response = await fetch('/api/program/load')
                const data = await response.json()
                if (response.ok) {
                    if (data.steps && data.steps.length > 0) setSteps(data.steps)
                    if (data.schedule) setSchedule(data.schedule)
                    if (data.execution) setProgramExecution(data.execution)
                }
            } catch {
                // silently ignore on mount
            } finally {
                initialLoadDone.current = true
            }
        }
        loadSavedProgram()
    }, [])

    // Auto-save steps and schedule to scheduled_program.json whenever they change
    useEffect(() => {
        if (!initialLoadDone.current) return
        if (steps.length === 0) return
        fetch('/api/program/save', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({steps, schedule})
        }).catch(() => {})
    }, [steps, schedule])

    // Fetch current position, config, and axis positions on mount; poll every second
    useEffect(() => {
        fetchCurrentPosition()
        fetchConfig()
        fetchAxisPositions()
        fetchProgramStatus()

        const interval = setInterval(() => {
            fetchCurrentPosition()
            fetchProgramStatus()
            if (activeTab === 'manual') {
                fetchAxisPositions()
            }
        }, 1000)

        return () => clearInterval(interval)
    }, [activeTab])

    // Increase polling frequency during execution
    useEffect(() => {
        let interval
        if (isExecuting) {
            interval = setInterval(() => {
                fetchCurrentPosition()
                fetchLogs()
            }, 300)
        }
        return () => {
            if (interval) clearInterval(interval)
        }
    }, [isExecuting])

    // Poll logs regularly
    useEffect(() => {
        fetchLogs()

        const interval = setInterval(() => {
            fetchLogs()
        }, 2000)

        return () => clearInterval(interval)
    }, [])

    // Auto-home when motor stop is released
    useEffect(() => {
        if (prevMotorStoppedRef.current && !motorStopped) {
            handleHome()
        }
        prevMotorStoppedRef.current = motorStopped
    }, [motorStopped])

    // Theme effect
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        localStorage.setItem('theme', theme)
    }, [theme])

    // Auto-scroll logs to bottom only when new logs are added
    useEffect(() => {
        if (logs.length > previousLogCountRef.current) {
            logsEndRef.current?.scrollIntoView({behavior: 'smooth'})
            previousLogCountRef.current = logs.length
        }
    }, [logs])

    const toggleTheme = () => {
        setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light')
    }

    // ── Render ──

    return (
        <div className="min-h-screen flex flex-col bg-[image:var(--bg-primary)] text-[var(--text-primary)] font-sans">
            {motorStopped && (
                <>
                    <div className="animate-motor-stop-overlay fixed inset-0 z-[9999] pointer-events-none border-[6px] border-solid border-[rgba(220,38,38,0.5)]" />
                    <div className="animate-motor-stop-banner fixed top-0 left-0 right-0 z-[9999] bg-[#dc2626] text-white text-center py-1.5 text-sm font-semibold tracking-wide flex items-center justify-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
                        MOTORS STOPPED
                        <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
                    </div>
                </>
            )}
            <NavBar
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                controllerType={controllerType}
                theme={theme}
                toggleTheme={toggleTheme}
            />
            <div className="flex gap-5 px-5 py-[15px] flex-1 max-w-full overflow-hidden max-lg:flex-col max-lg:gap-[15px] max-lg:px-2.5">
                {/* ProgramTab: keep mounted (hidden) during well selection so wizard state survives */}
                <div style={{ display: activeTab === 'program' ? undefined : 'none' }}>
                    {(activeTab === 'program' || wellSelectionMode) && (
                        <ProgramTab
                            steps={steps}
                            layoutType={layoutType}
                            handleAddStep={handleAddStep}
                            handleUpdateStep={handleUpdateStep}
                            handleDuplicateStep={handleDuplicateStep}
                            handleDeleteStep={handleDeleteStep}
                            handleReorderSteps={handleReorderSteps}
                            handleSaveProgram={handleSaveProgram}
                            handleLoadProgram={handleLoadProgram}
                            validateWellId={validateWellId}
                            setActiveTab={setActiveTab}
                            setWellSelectionMode={setWellSelectionMode}
                            schedule={schedule}
                            onScheduleChange={(newSchedule) => {
                                setSchedule(newSchedule)
                                // Auto-save when enabled/disabled changes so the scheduler picks it up
                                if (newSchedule.enabled !== schedule.enabled && steps.length > 0) {
                                    fetch('/api/program/save', {
                                        method: 'POST',
                                        headers: {'Content-Type': 'application/json'},
                                        body: JSON.stringify({steps, schedule: newSchedule})
                                    }).catch(() => {})
                                }
                            }}
                            config={config}
                            programExecution={programExecution}
                            isExecuting={isExecuting}
                            currentStepIndex={currentStepIndex}
                            totalSteps={totalSteps}
                        />
                    )}
                </div>
                {activeTab === 'manual' ? (
                    <ManualTab
                        axisPositions={axisPositions}
                        isExecuting={isExecuting}
                        selectedWell={selectedWell}
                        systemStatus={systemStatus}
                        handleAxisMove={handleAxisMove}
                        handleSetPosition={handleSetPosition}
                    />
                ) : activeTab === 'drift-test' ? (
                    <DriftTestTab />
                ) : activeTab === 'settings' ? (
                    <SettingsTab
                        config={config}
                        handleConfigChange={handleConfigChange}
                        saveConfig={saveConfig}
                        controllerType={controllerType}
                        fetchCurrentPosition={fetchCurrentPosition}
                        handleAxisMove={handleAxisMove}
                        axisPositions={axisPositions}
                    />
                ) : activeTab !== 'program' ? (
                    <PlateLayout
                        layoutType={layoutType}
                        layouts={layouts}
                        selectedWell={selectedWell}
                        targetWell={targetWell}
                        currentPipetteCount={currentPipetteCount}
                        currentOperation={currentOperation}
                        operationWell={operationWell}
                        isExecuting={isExecuting}
                        systemStatus={systemStatus}
                        controllerType={controllerType}
                        zAxisUp={zAxisUp}
                        axisPositions={axisPositions}
                        config={config}
                        handleWellClick={handleWellClick}
                        handleSetLayout={handleSetLayout}
                        handleSetPipetteCount={handleSetPipetteCount}
                        handleToggleZ={handleToggleZ}
                        handleCollect={handleCollect}
                        handleDispense={handleDispense}
                        handleExecute={handleExecute}
                        setActiveTab={setActiveTab}
                        setIsExecuting={setIsExecuting}
                        fetchCurrentPosition={fetchCurrentPosition}
                        getPipetteWells={getPipetteWells}
                        wellSelectionMode={wellSelectionMode}
                        setWellSelectionMode={setWellSelectionMode}
                    />
                ) : null}
                <RightPanel
                    activeTab={activeTab}
                    steps={steps}
                    setSteps={setSteps}
                    targetWell={targetWell}
                    setTargetWell={setTargetWell}
                    isExecuting={isExecuting}
                    motorStopped={motorStopped}
                    logs={logs}
                    logsEndRef={logsEndRef}
                    handleExecute={handleExecute}
                    handleStop={handleStop}
                    handleHome={handleHome}
                    handleDeleteAll={handleDeleteAll}
                    handleMoveToWell={handleMoveToWell}
                    selectedWell={selectedWell}
                    fetchCurrentPosition={fetchCurrentPosition}
                />
            </div>
        </div>
    )
}

export default App
