import {useEffect, useRef, useState} from 'react'
import NavBar from './components/NavBar'
import PlateLayout from './components/PlateLayout'
import ProgramTab from './components/ProgramTab'
import ManualTab from './components/ManualTab'
import DriftTestTab from './components/DriftTestTab'
import SettingsTab from './components/SettingsTab'
import RightPanel from './components/RightPanel'

function App() {
    const [activeTab, setActiveTab] = useState('protocol')
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
        BED_OFFSET_X: 70.0,
        BED_OFFSET_Y: 15.0,
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
        VIAL_WELL_SPACING: 45.0,
        VIAL_WELL_DIAMETER: 8.0,
        VIAL_WELL_HEIGHT: 14.0,
        INVERT_X: false,
        INVERT_Y: false,
        INVERT_Z: false,
        INVERT_PIPETTE: false,
        CONTROLLER_TYPE: 'raspberry_pi'
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
    const [repetitionMode, setRepetitionMode] = useState('quantity')
    const [repetitionQuantity, setRepetitionQuantity] = useState(1)
    const [repetitionInterval, setRepetitionInterval] = useState('')
    const [repetitionDuration, setRepetitionDuration] = useState('')

    // Pipette configuration state
    const [pipetteCount, setPipetteCount] = useState(3)

    // Layout type state
    const [layoutType, setLayoutType] = useState('microchip')

    // Controller type
    const [controllerType, setControllerType] = useState('raspberry_pi')

    // Axis positions state
    const [axisPositions, setAxisPositions] = useState({x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {}})

    // Z-axis state derived from actual position
    const zAxisUp = axisPositions.z >= 35

    // Well data
    const [wellData, setWellData] = useState({})

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
                columns: [1, 2, 3, 4, 5, 6],
                prefix: 'S'
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

        const smallWellPattern = /^S[A-L][1-6]$/
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

    const handleAddStep = () => {
        if (!pickupWell || pickupWell.trim() === '') {
            console.error('Pickup well is required')
            return
        }
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
        setPipetteCount(3)
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

        const programData = {
            version: "1.0",
            created: new Date().toISOString(),
            steps: steps
        }

        const jsonString = JSON.stringify(programData, null, 2)
        const blob = new Blob([jsonString], {type: 'application/json'})
        const url = URL.createObjectURL(blob)

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
                if (!programData.steps || !Array.isArray(programData.steps)) {
                    console.error('Invalid program file format')
                    return
                }
                setSteps(programData.steps)
                console.log(`Program loaded successfully with ${programData.steps.length} step(s)`)
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
                setIsExecuting(false)
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
                headers: {'Content-Type': 'application/json'}
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`${data.message}`)
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
            console.error(`Volume must be between 0 and ${maxML} mL`)
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
            console.error(`Volume must be between 0 and ${maxML} mL`)
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

    // ── Fetch functions ──

    const fetchCurrentPosition = async () => {
        try {
            const response = await fetch('/api/pipetting/status')
            const data = await response.json()

            if (data.initialized && data.current_well) {
                console.log('Current well position:', data.current_well)
                setSelectedWell(data.current_well)
                setSystemStatus(data.message || 'System ready')

                if (data.pipette_count !== undefined) setCurrentPipetteCount(data.pipette_count)
                if (data.layout_type !== undefined) setLayoutType(data.layout_type)
                if (data.is_executing !== undefined) setIsExecuting(data.is_executing)
                if (data.controller_type !== undefined) setControllerType(data.controller_type)
                if (data.current_operation !== undefined) setCurrentOperation(data.current_operation)
                if (data.operation_well !== undefined) setOperationWell(data.operation_well)
            } else {
                console.log('No position data available:', data)
                setSystemStatus(data.message || 'System not ready')
            }
        } catch (error) {
            console.error('Failed to fetch current position:', error)
            setSystemStatus('Backend offline')
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
        const stringKeys = ['CONTROLLER_TYPE']
        const parsed = {}
        for (const [key, value] of Object.entries(config)) {
            if (stringKeys.includes(key)) {
                parsed[key] = value
            } else if (typeof value === 'string' && !['true', 'false'].includes(value)) {
                parsed[key] = Number(value) || 0
            } else {
                parsed[key] = value
            }
        }
        setConfig(parsed)

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

    // Fetch current position, config, and axis positions on mount; poll every second
    useEffect(() => {
        fetchCurrentPosition()
        fetchConfig()
        fetchAxisPositions()

        const interval = setInterval(() => {
            fetchCurrentPosition()
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
            <NavBar
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                controllerType={controllerType}
                theme={theme}
                toggleTheme={toggleTheme}
            />
            <div className="flex gap-5 px-5 py-[15px] flex-1 max-w-full overflow-hidden max-lg:flex-col max-lg:gap-[15px] max-lg:px-2.5">
                {activeTab === 'program' ? (
                    <ProgramTab
                        cycles={cycles}
                        setCycles={setCycles}
                        pickupWell={pickupWell}
                        setPickupWell={setPickupWell}
                        dropoffWell={dropoffWell}
                        setDropoffWell={setDropoffWell}
                        rinseWell={rinseWell}
                        setRinseWell={setRinseWell}
                        waitTime={waitTime}
                        setWaitTime={setWaitTime}
                        sampleVolume={sampleVolume}
                        setSampleVolume={setSampleVolume}
                        repetitionMode={repetitionMode}
                        setRepetitionMode={setRepetitionMode}
                        repetitionQuantity={repetitionQuantity}
                        setRepetitionQuantity={setRepetitionQuantity}
                        repetitionInterval={repetitionInterval}
                        setRepetitionInterval={setRepetitionInterval}
                        repetitionDuration={repetitionDuration}
                        setRepetitionDuration={setRepetitionDuration}
                        pipetteCount={pipetteCount}
                        setPipetteCount={setPipetteCount}
                        layoutType={layoutType}
                        steps={steps}
                        handleAddStep={handleAddStep}
                        handleSaveProgram={handleSaveProgram}
                        handleLoadProgram={handleLoadProgram}
                    />
                ) : activeTab === 'manual' ? (
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
                    />
                ) : (
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
                    />
                )}
                <RightPanel
                    activeTab={activeTab}
                    steps={steps}
                    setSteps={setSteps}
                    targetWell={targetWell}
                    setTargetWell={setTargetWell}
                    isExecuting={isExecuting}
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
