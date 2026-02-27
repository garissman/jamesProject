import {useState} from 'react'

export default function PlateLayout({
                                        selectedWell,
                                        targetWell,
                                        setTargetWell,
                                        currentPipetteCount,
                                        handleSetPipetteCount,
                                        currentOperation,
                                        operationWell,
                                        layoutType,
                                        handleSetLayout,
                                        isExecuting,
                                        config,
                                        axisPositions,
                                        zAxisUp,
                                        handleToggleZ,
                                        handleCollect,
                                        handleDispense,
                                        handleWellClick,
                                        getPipetteWells,
                                        systemStatus,
                                        controllerType,
                                        fetchCurrentPosition,
                                        fetchAxisPositions,
                                    }) {
    const [quickOpMode, setQuickOpMode] = useState(false)
    const [quickOpWells, setQuickOpWells] = useState({pickup: null, dropoff: null, rinse: null})
    const [quickOpStep, setQuickOpStep] = useState(0)
    const [quickOpVolume, setQuickOpVolume] = useState('1.0')
    const [pipetteVolume, setPipetteVolume] = useState('1.0')

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
            pipetteCount: currentPipetteCount,
        }

        try {
            const response = await fetch('/api/pipetting/execute', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({steps: [quickStep]}),
            })

            const data = await response.json()

            if (response.ok) {
                console.log('Quick operation completed successfully!')
                fetchCurrentPosition()
                handleCancelQuickOp()
            } else {
                console.error(`Error: ${data.detail || 'Failed to execute operation'}`)
            }
        } catch (error) {
            console.error(`Error: Unable to connect to backend. ${error.message}`)
        }
    }

    const onWellClick = (wellId) => {
        if (quickOpMode) {
            if (quickOpStep === 0) {
                setQuickOpWells(prev => ({...prev, pickup: wellId}))
                setQuickOpStep(1)
            } else if (quickOpStep === 1) {
                setQuickOpWells(prev => ({...prev, dropoff: wellId}))
                setQuickOpStep(2)
            } else if (quickOpStep === 2) {
                setQuickOpWells(prev => ({...prev, rinse: wellId}))
            }
        } else {
            handleWellClick(wellId)
        }
    }

    // Helper to get quick-op class names for a well
    const getQuickOpClasses = (wellId) => {
        if (!quickOpMode) return ''
        const classes = []
        if (quickOpWells.pickup === wellId) classes.push('quick-op-pickup')
        if (quickOpWells.dropoff === wellId) classes.push('quick-op-dropoff')
        if (quickOpWells.rinse === wellId) classes.push('quick-op-rinse')
        return classes.join(' ')
    }

    // Helper to render quick-op badges
    const renderQuickOpBadges = (wellId) => {
        if (!quickOpMode) return null
        return (
            <>
                {quickOpWells.pickup === wellId && <span
                    className="absolute top-0.5 right-0.5 bg-black/80 text-white text-[10px] font-bold py-0.5 px-1 rounded-sm leading-none">P</span>}
                {quickOpWells.dropoff === wellId && <span
                    className="absolute top-0.5 right-0.5 bg-black/80 text-white text-[10px] font-bold py-0.5 px-1 rounded-sm leading-none">D</span>}
                {quickOpWells.rinse === wellId && <span
                    className="absolute top-0.5 right-0.5 bg-black/80 text-white text-[10px] font-bold py-0.5 px-1 rounded-sm leading-none">R</span>}
            </>
        )
    }

    return (
        <div className="flex-1 bg-[var(--bg-secondary)] rounded-[15px] p-[15px] flex flex-col">
            {/* Plate Header */}
            <div className="flex justify-between items-center mb-[15px]">
                <h2 className="text-[1.3rem] m-0 font-semibold text-[var(--text-primary)]">Plate layout</h2>
                <div className="flex gap-5 text-base text-[var(--text-secondary)] flex-wrap">
                    <span>Position: {selectedWell}</span>
                    <span>Status: {systemStatus}</span>
                    <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: (config.CONTROLLER_TYPE || controllerType) === 'arduino_uno_q'
                            ? 'rgba(0, 150, 255, 0.15)' : 'rgba(0, 200, 83, 0.15)',
                        color: (config.CONTROLLER_TYPE || controllerType) === 'arduino_uno_q'
                            ? '#0096ff' : '#00c853',
                    }}>
                        {(config.CONTROLLER_TYPE || controllerType) === 'arduino_uno_q' ? 'Arduino' : 'RPi'}
                    </span>
                    {currentOperation !== 'idle' && operationWell && (
                        <span className={`py-1 px-3 rounded-xl text-[0.9rem] font-semibold animate-fade-in ${
                            currentOperation === 'aspirating' ? 'bg-[rgba(59,130,246,0.2)] text-[#3b82f6] border border-[#3b82f6]' :
                                currentOperation === 'dispensing' ? 'bg-[rgba(16,185,129,0.2)] text-[#10b981] border border-[#10b981]' :
                                    currentOperation === 'moving' ? 'bg-[rgba(245,158,11,0.2)] text-[#f59e0b] border border-[#f59e0b]' : ''
                        }`}>
                            {currentOperation === 'aspirating' && '🔵 Aspirating'}
                            {currentOperation === 'dispensing' && '🟢 Dispensing'}
                            {currentOperation === 'moving' && '🟡 Moving'}
                            {' at ' + operationWell}
                        </span>
                    )}
                </div>
            </div>

            {/* Layout Toggle */}
            <div className="flex gap-2 py-2.5 mb-1">
                <button
                    className={`py-2.5 px-7 text-base font-semibold border-2 rounded-lg bg-transparent text-[var(--text-primary)] cursor-pointer transition-all duration-200 ${
                        layoutType === 'microchip'
                            ? 'bg-[rgba(59,130,246,0.15)] border-[#3b82f6] text-[#3b82f6] shadow-[0_0_0_2px_rgba(59,130,246,0.2)]'
                            : 'border-[var(--border-color)] hover:bg-[var(--nav-hover)] hover:border-[var(--border-hover)]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    onClick={() => handleSetLayout('microchip')}
                    disabled={isExecuting}
                >
                    MicroChip
                </button>
                <button
                    className={`py-2.5 px-7 text-base font-semibold border-2 rounded-lg bg-transparent text-[var(--text-primary)] cursor-pointer transition-all duration-200 ${
                        layoutType === 'wellplate'
                            ? 'bg-[rgba(59,130,246,0.15)] border-[#3b82f6] text-[#3b82f6] shadow-[0_0_0_2px_rgba(59,130,246,0.2)]'
                            : 'border-[var(--border-color)] hover:bg-[var(--nav-hover)] hover:border-[var(--border-hover)]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    onClick={() => handleSetLayout('wellplate')}
                    disabled={isExecuting}
                >
                    Vial
                </button>
            </div>

            {/* Pipette Config Panel */}
            <div className="flex flex-col gap-2 mb-2.5 p-3 bg-[var(--bg-secondary)] rounded-[10px]">
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <label
                            className="text-[0.85rem] font-medium text-[var(--text-secondary)] whitespace-nowrap shrink-0">Pipette
                            Configuration:</label>
                        <select
                            value={currentPipetteCount}
                            onChange={(e) => handleSetPipetteCount(Number(e.target.value))}
                            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)] cursor-pointer"
                            disabled={isExecuting}
                        >
                            <option value={1}>1 Pipette</option>
                            <option value={3}>3 Pipettes</option>
                        </select>
                    </div>
                    <button
                        className={`py-2 px-4 text-[0.9rem] font-semibold border-2 rounded-lg cursor-pointer transition-all duration-300 whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                            zAxisUp
                                ? 'bg-gradient-to-br from-[#f59e0b] to-[#d97706] text-white border-[#f59e0b]'
                                : 'bg-gradient-to-br from-[#10b981] to-[#059669] text-white border-[#10b981]'
                        }`}
                        onClick={handleToggleZ}
                        disabled={isExecuting}
                    >
                        Z-Axis: {zAxisUp ? '\u2B07 DOWN' : '\u2B06 UP'}
                    </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div
                        className="w-full text-[0.85rem] text-[var(--text-secondary)] py-1.5 px-2.5 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg mb-0.5">
                        Current: <strong
                        className="text-[#3b82f6] text-[0.95rem]">{axisPositions.pipette_ml ?? 0} mL</strong> / {config.PIPETTE_MAX_ML ?? 100} mL
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <label className="text-[0.85rem] font-semibold text-[var(--text-primary)] whitespace-nowrap">Volume
                            (mL):</label>
                        <input
                            type="number"
                            min="0.1"
                            max={config.PIPETTE_MAX_ML || 100}
                            step="0.1"
                            value={pipetteVolume}
                            onChange={(e) => setPipetteVolume(e.target.value)}
                            className="w-[70px] py-2 px-2.5 text-sm font-semibold text-center border-2 border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[#3b82f6] focus:bg-[var(--input-focus-bg)] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)]"
                            disabled={isExecuting}
                        />
                    </div>
                    <div className="flex gap-2 flex-1 min-w-0">
                        <button
                            className="flex-1 py-2.5 px-4 text-sm font-bold border-none rounded-lg cursor-pointer transition-all duration-300 whitespace-nowrap shadow-[0_2px_8px_rgba(0,0,0,0.15)] min-w-0 bg-gradient-to-br from-[#3b82f6] to-[#2563eb] text-white hover:enabled:from-[#2563eb] hover:enabled:to-[#1d4ed8] hover:enabled:-translate-y-0.5 hover:enabled:shadow-[0_6px_20px_rgba(59,130,246,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale-[50%]"
                            onClick={() => handleCollect(pipetteVolume)}
                            disabled={isExecuting}
                        >
                            Collect
                        </button>
                        <button
                            className="flex-1 py-2.5 px-4 text-sm font-bold border-none rounded-lg cursor-pointer transition-all duration-300 whitespace-nowrap shadow-[0_2px_8px_rgba(0,0,0,0.15)] min-w-0 bg-gradient-to-br from-[#10b981] to-[#059669] text-white hover:enabled:from-[#059669] hover:enabled:to-[#047857] hover:enabled:-translate-y-0.5 hover:enabled:shadow-[0_6px_20px_rgba(16,185,129,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale-[50%]"
                            onClick={() => handleDispense(pipetteVolume)}
                            disabled={isExecuting}
                        >
                            Dispense
                        </button>
                    </div>
                </div>
            </div>

            {/* Quick Operation Controls */}
            <div
                className="my-5 p-[15px] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg backdrop-blur-[10px]">
                {!quickOpMode ? (
                    <button
                        className="w-full p-3 bg-gradient-to-br from-[#4CAF50] to-[#45a049] text-white border-none rounded-md text-sm font-semibold cursor-pointer transition-all duration-300 hover:enabled:-translate-y-0.5 hover:enabled:shadow-[0_4px_12px_rgba(76,175,80,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handleEnableQuickOp}
                        disabled={isExecuting}
                    >
                        Quick Operation Mode
                    </button>
                ) : (
                    <div className="flex flex-col gap-[15px]">
                        <div className="flex justify-between items-center">
                            <h3 className="m-0 text-base text-[var(--text-primary)]">Quick Operation Mode</h3>
                            <button
                                className="py-1.5 px-3 bg-[rgba(244,67,54,0.1)] text-[#f44336] border border-[rgba(244,67,54,0.3)] rounded text-xs cursor-pointer transition-all duration-200 hover:enabled:bg-[rgba(244,67,54,0.2)]"
                                onClick={handleCancelQuickOp}
                                disabled={isExecuting}
                            >
                                Cancel
                            </button>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div
                                className={`p-2.5 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[13px] text-[var(--text-secondary)] transition-all duration-300 ${
                                    quickOpStep === 0 ? 'bg-[rgba(33,150,243,0.1)] border-[#2196F3] text-[#2196F3] font-semibold animate-quick-op-pulse' :
                                        quickOpWells.pickup ? 'bg-[rgba(76,175,80,0.1)] border-[#4CAF50] text-[#4CAF50]' : ''
                                }`}>
                                1. Click pickup well {quickOpWells.pickup && `(${quickOpWells.pickup})`}
                            </div>
                            <div
                                className={`p-2.5 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[13px] text-[var(--text-secondary)] transition-all duration-300 ${
                                    quickOpStep === 1 ? 'bg-[rgba(33,150,243,0.1)] border-[#2196F3] text-[#2196F3] font-semibold animate-quick-op-pulse' :
                                        quickOpWells.dropoff ? 'bg-[rgba(76,175,80,0.1)] border-[#4CAF50] text-[#4CAF50]' : ''
                                }`}>
                                2. Click dropoff well {quickOpWells.dropoff && `(${quickOpWells.dropoff})`}
                            </div>
                            <div
                                className={`p-2.5 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[13px] text-[var(--text-secondary)] transition-all duration-300 ${
                                    quickOpStep === 2 ? 'bg-[rgba(33,150,243,0.1)] border-[#2196F3] text-[#2196F3] font-semibold animate-quick-op-pulse' :
                                        quickOpWells.rinse ? 'bg-[rgba(76,175,80,0.1)] border-[#4CAF50] text-[#4CAF50]' : ''
                                }`}>
                                3. Click rinse well {quickOpWells.rinse && `(${quickOpWells.rinse})`}
                            </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <label className="text-[13px] font-semibold text-[var(--text-primary)] min-w-[80px]">Volume
                                (mL):</label>
                            <input
                                type="number"
                                min="0.1"
                                max="10"
                                step="0.1"
                                value={quickOpVolume}
                                onChange={(e) => setQuickOpVolume(e.target.value)}
                                className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                disabled={isExecuting}
                            />
                        </div>
                        <button
                            className="p-3 bg-gradient-to-br from-[#2196F3] to-[#1976D2] text-white border-none rounded-md text-sm font-semibold cursor-pointer transition-all duration-300 hover:enabled:-translate-y-0.5 hover:enabled:shadow-[0_4px_12px_rgba(33,150,243,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={handleExecuteQuickOp}
                            disabled={isExecuting || !quickOpWells.pickup || !quickOpWells.dropoff || !quickOpWells.rinse}
                        >
                            {isExecuting ? 'Executing...' : 'Execute Operation'}
                        </button>
                    </div>
                )}
            </div>

            {/* Layout Grid */}
            {layoutType === 'microchip' ? (
                /* MicroChip Layout */
                <div className="layout-grid">
                    {/* WS1 -- row 1, cols 1-6 */}
                    <div
                        className={`flex items-center justify-center rounded text-[0.65rem] font-semibold text-[var(--text-primary)] bg-[var(--well-bg)] border-2 border-[var(--border-color)] transition-all duration-200 relative cursor-pointer hover:border-[var(--border-hover)] hover:bg-[var(--bg-overlay)] ${
                            selectedWell === 'WS1' ? '!bg-gradient-to-br !from-[#4CAF50] !to-[#45a049] !text-white !border-[#45a049] shadow-[0_0_12px_rgba(76,175,80,0.5)]' : ''
                        } ${targetWell === 'WS1' ? '!border-[#FF9800] shadow-[0_0_12px_rgba(255,152,0,0.5)]' : ''} ${getQuickOpClasses('WS1')}`}
                        style={{gridColumn: '1/7', gridRow: '1/2'}}
                        onClick={() => onWellClick('WS1')}
                    >
                        WS1
                        {renderQuickOpBadges('WS1')}
                    </div>
                    {/* WS2 -- row 2, cols 1-6 */}
                    <div
                        className={`flex items-center justify-center rounded text-[0.65rem] font-semibold text-[var(--text-primary)] bg-[var(--well-bg)] border-2 border-[var(--border-color)] transition-all duration-200 relative cursor-pointer hover:border-[var(--border-hover)] hover:bg-[var(--bg-overlay)] ${
                            selectedWell === 'WS2' ? '!bg-gradient-to-br !from-[#4CAF50] !to-[#45a049] !text-white !border-[#45a049] shadow-[0_0_12px_rgba(76,175,80,0.5)]' : ''
                        } ${targetWell === 'WS2' ? '!border-[#FF9800] shadow-[0_0_12px_rgba(255,152,0,0.5)]' : ''} ${getQuickOpClasses('WS2')}`}
                        style={{gridColumn: '1/7', gridRow: '2/3'}}
                        onClick={() => onWellClick('WS2')}
                    >
                        WS2
                        {renderQuickOpBadges('WS2')}
                    </div>
                    {/* Disabled area -- rows 3-12, cols 1-6 */}
                    <div
                        className="bg-[var(--bg-tertiary)] opacity-20 pointer-events-none border border-dashed border-[var(--border-color)] cursor-default"
                        style={{gridColumn: '1/7', gridRow: '3/13'}}
                    />

                    {/* Well grid -- rows 1-8, cols 7-21 */}
                    {currentPipetteCount === 3 ? (
                        /* Grouped mode: 5 groups × 8 rows, each group = 3 adjacent wells */
                        <div className="mc-well-grid-grouped" style={{gridColumn: '7/22', gridRow: '1/9'}}>
                            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].flatMap(row =>
                                [0, 1, 2, 3, 4].map(groupIdx => {
                                    const cols = [groupIdx * 3 + 1, groupIdx * 3 + 2, groupIdx * 3 + 3]
                                    const wellIds = cols.map(c => `${row}${c}`)
                                    const middleWell = `${row}${cols[1]}`

                                    const pipetteWells = getPipetteWells(selectedWell, currentPipetteCount)
                                    const isGroupSelected = wellIds.some(w => pipetteWells.includes(w))
                                    const opWells = operationWell ? getPipetteWells(operationWell, currentPipetteCount) : []
                                    const isOperating = wellIds.some(w => opWells.includes(w)) && currentOperation !== 'idle'
                                    const isQPickup = quickOpMode && wellIds.some(w => quickOpWells.pickup === w)
                                    const isQDropoff = quickOpMode && wellIds.some(w => quickOpWells.dropoff === w)
                                    const isQRinse = quickOpMode && wellIds.some(w => quickOpWells.rinse === w)
                                    const isTarget = wellIds.some(w => targetWell === w)

                                    return (
                                        <div
                                            key={middleWell}
                                            title={middleWell}
                                            className={`grid grid-cols-3 place-items-center justify-center rounded-lg cursor-pointer transition-all duration-200 relative p-1 border-2 ${
                                                isGroupSelected
                                                    ? 'border-[#4CAF50] bg-[rgba(76,175,80,0.1)] shadow-[0_0_10px_rgba(76,175,80,0.3)]'
                                                    : 'border-[var(--border-color)] bg-[var(--bg-tertiary)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-overlay)]'
                                            } ${isTarget ? '!border-[#FF9800] shadow-[0_0_10px_rgba(255,152,0,0.5)]' : ''
                                            } ${isOperating && currentOperation === 'aspirating' ? '!border-[#3b82f6] shadow-[0_0_12px_#3b82f6] animate-aspirate !bg-[rgba(59,130,246,0.15)]' : ''
                                            } ${isOperating && currentOperation === 'dispensing' ? '!border-[#10b981] shadow-[0_0_12px_#10b981] animate-dispense !bg-[rgba(16,185,129,0.15)]' : ''
                                            } ${isOperating && currentOperation === 'moving' ? '!border-[#f59e0b] shadow-[0_0_10px_#f59e0b] animate-move' : ''
                                            } ${isQPickup ? '!border-[#2196F3] !bg-[rgba(33,150,243,0.15)] shadow-[0_0_10px_rgba(33,150,243,0.4)]' : ''
                                            } ${isQDropoff ? '!border-[#4CAF50] !bg-[rgba(76,175,80,0.15)] shadow-[0_0_10px_rgba(76,175,80,0.4)]' : ''
                                            } ${isQRinse ? '!border-[#FF9800] !bg-[rgba(255,152,0,0.15)] shadow-[0_0_10px_rgba(255,152,0,0.4)]' : ''
                                            }`}
                                            onClick={() => onWellClick(middleWell)}
                                        >
                                            {wellIds.map((wId) => {
                                                return (
                                                    <div
                                                        key={wId}
                                                        className={`w-4 h-4 rounded-full border transition-all duration-200 bg-[var(--well-bg)] border-[var(--border-color)] ${
                                                            isGroupSelected
                                                                ? 'bg-gradient-to-br from-[#4CAF50] to-[#45a049] border-[#45a049] shadow-[0_0_6px_rgba(76,175,80,0.6)]'
                                                                : 'bg-[var(--well-bg)] border-[var(--border-color)]'
                                                        }`}
                                                    />
                                                )
                                            })}
                                            {isQPickup && <span
                                                className="absolute top-0 right-0.5 bg-black/80 text-white text-[9px] font-bold py-0.5 px-1 rounded-sm leading-none">P</span>}
                                            {isQDropoff && <span
                                                className="absolute top-0 right-0.5 bg-black/80 text-white text-[9px] font-bold py-0.5 px-1 rounded-sm leading-none">D</span>}
                                            {isQRinse && <span
                                                className="absolute top-0 right-0.5 bg-black/80 text-white text-[9px] font-bold py-0.5 px-1 rounded-sm leading-none">R</span>}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    ) : (
                        /* Individual mode: 15 cols × 8 rows */
                        <div className="mc-well-grid" style={{gridColumn: '7/22', gridRow: '1/9'}}>
                            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].flatMap(row =>
                                [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(col => {
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
                                            className={`w-6 h-6 bg-[var(--well-bg)] border border-[var(--border-color)] rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 text-[0.6rem] text-transparent relative hover:bg-[var(--bg-overlay)] hover:border-[var(--border-hover)] ${
                                                isCenterPipette ? 'bg-gradient-to-br from-[#4CAF50] to-[#45a049] border-[#45a049] shadow-[0_0_8px_rgba(76,175,80,0.6)]' : ''
                                            } ${isSidePipette ? 'bg-gradient-to-br from-[#81C784] to-[#66BB6A] border-[#66BB6A] shadow-[0_0_6px_rgba(129,199,132,0.4)]' : ''
                                            } ${targetWell === wellId ? 'border-[#FF9800] shadow-[0_0_8px_rgba(255,152,0,0.6)]' : ''
                                            } ${isOperating && currentOperation === 'aspirating' ? 'border-[3px] !border-[#3b82f6] shadow-[0_0_12px_#3b82f6] animate-aspirate !bg-[rgba(59,130,246,0.2)]' : ''
                                            } ${isOperating && currentOperation === 'dispensing' ? 'border-[3px] !border-[#10b981] shadow-[0_0_12px_#10b981] animate-dispense !bg-[rgba(16,185,129,0.2)]' : ''
                                            } ${isOperating && currentOperation === 'moving' ? 'border-[3px] !border-[#f59e0b] shadow-[0_0_10px_#f59e0b] animate-move' : ''
                                            } ${isQPickup ? '!border-2 !border-[#2196F3] !bg-[rgba(33,150,243,0.2)] shadow-[0_0_10px_rgba(33,150,243,0.4)]' : ''
                                            } ${isQDropoff ? '!border-2 !border-[#4CAF50] !bg-[rgba(76,175,80,0.2)] shadow-[0_0_10px_rgba(76,175,80,0.4)]' : ''
                                            } ${isQRinse ? '!border-2 !border-[#FF9800] !bg-[rgba(255,152,0,0.2)] shadow-[0_0_10px_rgba(255,152,0,0.4)]' : ''
                                            }`}
                                            onClick={() => onWellClick(wellId)}
                                        >
                                            {isQPickup && <span
                                                className="absolute top-0.5 right-0.5 bg-black/80 text-white text-[10px] font-bold py-0.5 px-1 rounded-sm leading-none">P</span>}
                                            {isQDropoff && <span
                                                className="absolute top-0.5 right-0.5 bg-black/80 text-white text-[10px] font-bold py-0.5 px-1 rounded-sm leading-none">D</span>}
                                            {isQRinse && <span
                                                className="absolute top-0.5 right-0.5 bg-black/80 text-white text-[10px] font-bold py-0.5 px-1 rounded-sm leading-none">R</span>}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )}

                    {/* MicroChips -- rows 9-12, each 3-col block */}
                    {[1, 2, 3, 4, 5].map(n => {
                        const colStart = 7 + (n - 1) * 3
                        const mcId = `MC${n}`
                        const isQPickup = quickOpMode && quickOpWells.pickup === mcId
                        const isQDropoff = quickOpMode && quickOpWells.dropoff === mcId
                        const isQRinse = quickOpMode && quickOpWells.rinse === mcId
                        return (
                            <div
                                key={mcId}
                                className={`flex items-center justify-center rounded text-[0.75rem] font-bold text-[var(--text-primary)] bg-[var(--well-bg)] border-2 border-[var(--border-color)] transition-all duration-200 relative cursor-pointer hover:border-[var(--border-hover)] hover:bg-[var(--bg-overlay)] ${
                                    selectedWell === mcId ? '!bg-gradient-to-br !from-[#4CAF50] !to-[#45a049] !text-white !border-[#45a049] shadow-[0_0_12px_rgba(76,175,80,0.5)]' : ''
                                } ${targetWell === mcId ? '!border-[#FF9800] shadow-[0_0_12px_rgba(255,152,0,0.5)]' : ''
                                } ${isQPickup ? '!border-2 !border-[#2196F3] !bg-[rgba(33,150,243,0.2)] shadow-[0_0_10px_rgba(33,150,243,0.4)]' : ''
                                } ${isQDropoff ? '!border-2 !border-[#4CAF50] !bg-[rgba(76,175,80,0.2)] shadow-[0_0_10px_rgba(76,175,80,0.4)]' : ''
                                } ${isQRinse ? '!border-2 !border-[#FF9800] !bg-[rgba(255,152,0,0.2)] shadow-[0_0_10px_rgba(255,152,0,0.4)]' : ''
                                }`}
                                style={{gridColumn: `${colStart}/${colStart + 3}`, gridRow: '9/13'}}
                                onClick={() => onWellClick(mcId)}
                            >
                                {mcId}
                                {isQPickup && <span
                                    className="absolute top-0.5 right-0.5 bg-black/80 text-white text-[10px] font-bold py-0.5 px-1 rounded-sm leading-none">P</span>}
                                {isQDropoff && <span
                                    className="absolute top-0.5 right-0.5 bg-black/80 text-white text-[10px] font-bold py-0.5 px-1 rounded-sm leading-none">D</span>}
                                {isQRinse && <span
                                    className="absolute top-0.5 right-0.5 bg-black/80 text-white text-[10px] font-bold py-0.5 px-1 rounded-sm leading-none">R</span>}
                            </div>
                        )
                    })}
                </div>
            ) : (
                /* Vial Layout */
                <div className="layout-grid grid grid-cols-3">
                    <div>
                        {/* WS1 -- row 1, cols 1-6 */}
                        <div
                            className={`h-8 flex items-center justify-center rounded text-[0.65rem] font-semibold text-[var(--text-primary)] bg-[var(--well-bg)] border-2 border-[var(--border-color)] transition-all duration-200 relative cursor-pointer hover:border-[var(--border-hover)] hover:bg-[var(--bg-overlay)] ${
                                selectedWell === 'WS1' ? '!bg-gradient-to-br !from-[#4CAF50] !to-[#45a049] !text-white !border-[#45a049] shadow-[0_0_12px_rgba(76,175,80,0.5)]' : ''
                            } ${targetWell === 'WS1' ? '!border-[#FF9800] shadow-[0_0_12px_rgba(255,152,0,0.5)]' : ''} ${getQuickOpClasses('WS1')}`}
                            onClick={() => onWellClick('WS1')}
                        >
                            WS1
                            {renderQuickOpBadges('WS1')}
                        </div>
                        {/* WS2 -- row 2, cols 1-6 */}
                        <div
                            className={`h-8 flex items-center justify-center rounded text-[0.65rem] font-semibold text-[var(--text-primary)] bg-[var(--well-bg)] border-2 border-[var(--border-color)] transition-all duration-200 relative cursor-pointer hover:border-[var(--border-hover)] hover:bg-[var(--bg-overlay)] ${
                                selectedWell === 'WS2' ? '!bg-gradient-to-br !from-[#4CAF50] !to-[#45a049] !text-white !border-[#45a049] shadow-[0_0_12px_rgba(76,175,80,0.5)]' : ''
                            } ${targetWell === 'WS2' ? '!border-[#FF9800] shadow-[0_0_12px_rgba(255,152,0,0.5)]' : ''} ${getQuickOpClasses('WS2')}`}
                            onClick={() => onWellClick('WS2')}
                        >
                            WS2
                            {renderQuickOpBadges('WS2')}
                        </div>
                        {['A', 'B', 'C', 'D', 'E'].map(row => {
                            const vialIds = [1, 2, 3].map(c => `V${row}${c}`)
                            const middleVial = `V${row}2`
                            const isGroupSelected = vialIds.some(v => v === selectedWell)
                            const isTarget = vialIds.some(v => v === targetWell)
                            const opWells = operationWell ? getPipetteWells(operationWell, currentPipetteCount) : []
                            const isOperating = vialIds.some(v => opWells.includes(v)) && currentOperation !== 'idle'
                            const isQPickup = quickOpMode && vialIds.some(v => quickOpWells.pickup === v)
                            const isQDropoff = quickOpMode && vialIds.some(v => quickOpWells.dropoff === v)
                            const isQRinse = quickOpMode && vialIds.some(v => quickOpWells.rinse === v)
                            return (
                                <div
                                    key={middleVial}
                                    className={`grid h-16 grid-cols-3 place-items-center justify-center gap-1 rounded-lg cursor-pointer transition-all duration-300 relative border-2 ${
                                        isGroupSelected
                                            ? '!border-[#4CAF50] !bg-[rgba(76,175,80,0.1)] shadow-[0_0_12px_rgba(76,175,80,0.3)]'
                                            : 'border-[var(--border-color)] bg-[var(--bg-tertiary)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-overlay)]'
                                    } ${isTarget ? '!border-[#FF9800] shadow-[0_0_10px_rgba(255,152,0,0.5)]' : ''
                                    } ${isOperating && currentOperation === 'aspirating' ? '!border-[#3b82f6] shadow-[0_0_12px_#3b82f6] animate-aspirate !bg-[rgba(59,130,246,0.15)]' : ''
                                    } ${isOperating && currentOperation === 'dispensing' ? '!border-[#10b981] shadow-[0_0_12px_#10b981] animate-dispense !bg-[rgba(16,185,129,0.15)]' : ''
                                    } ${isOperating && currentOperation === 'moving' ? '!border-[#f59e0b] shadow-[0_0_10px_#f59e0b] animate-move' : ''
                                    } ${isQPickup ? '!border-[#2196F3] !bg-[rgba(33,150,243,0.15)] shadow-[0_0_10px_rgba(33,150,243,0.4)]' : ''
                                    } ${isQDropoff ? '!border-[#4CAF50] !bg-[rgba(76,175,80,0.15)] shadow-[0_0_10px_rgba(76,175,80,0.4)]' : ''
                                    } ${isQRinse ? '!border-[#FF9800] !bg-[rgba(255,152,0,0.15)] shadow-[0_0_10px_rgba(255,152,0,0.4)]' : ''
                                    }`}
                                    onClick={() => onWellClick(middleVial)}
                                >
                                    {vialIds.map(vId => (
                                        <div
                                            key={vId}
                                            className={`w-10 h-10 rounded-full border-2 transition-all duration-200 flex items-center justify-center text-[0.7rem] font-semibold ${
                                                isGroupSelected
                                                    ? '!bg-gradient-to-br !from-[#4CAF50] !to-[#45a049] !border-[#45a049] !text-white shadow-[0_0_8px_rgba(76,175,80,0.5)]'
                                                    : 'bg-[var(--well-bg)] border-[var(--border-color)] text-[var(--text-primary)]'
                                            }`}
                                        >
                                            {vId}
                                        </div>
                                    ))}
                                    {isQPickup && <span
                                        className="absolute top-0 right-0.5 bg-black/80 text-white text-[9px] font-bold py-0.5 px-1 rounded-sm leading-none">P</span>}
                                    {isQDropoff && <span
                                        className="absolute top-0 right-0.5 bg-black/80 text-white text-[9px] font-bold py-0.5 px-1 rounded-sm leading-none">D</span>}
                                    {isQRinse && <span
                                        className="absolute top-0 right-0.5 bg-black/80 text-white text-[9px] font-bold py-0.5 px-1 rounded-sm leading-none">R</span>}
                                </div>
                            )
                        })}
                    </div>
                    <div>
                        {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].flatMap(row =>
                            [0].map(groupIdx => {
                                const cols = [groupIdx * 3 + 1, groupIdx * 3 + 2, groupIdx * 3 + 3]
                                const wellIds = cols.map(c => `${row}${c}`)
                                const middleWell = `${row}${cols[1]}`
                                const isGroupSelected = wellIds.some(w => w === selectedWell)
                                const isTarget = wellIds.some(w => w === targetWell)
                                const opWells = operationWell ? getPipetteWells(operationWell, currentPipetteCount) : []
                                const isOperating = wellIds.some(w => opWells.includes(w)) && currentOperation !== 'idle'
                                const isQPickup = quickOpMode && wellIds.some(w => quickOpWells.pickup === w)
                                const isQDropoff = quickOpMode && wellIds.some(w => quickOpWells.dropoff === w)
                                const isQRinse = quickOpMode && wellIds.some(w => quickOpWells.rinse === w)
                                return (
                                    <div
                                        key={middleWell}
                                        className={`grid grid-cols-3 place-items-center justify-center rounded-lg cursor-pointer transition-all duration-200 relative p-1 border-2 ${
                                            isGroupSelected
                                                ? 'border-[#4CAF50] bg-[rgba(76,175,80,0.1)] shadow-[0_0_10px_rgba(76,175,80,0.3)]'
                                                : 'border-[var(--border-color)] bg-[var(--bg-tertiary)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-overlay)]'
                                        } ${isTarget ? '!border-[#FF9800] shadow-[0_0_10px_rgba(255,152,0,0.5)]' : ''
                                        } ${isOperating && currentOperation === 'aspirating' ? '!border-[#3b82f6] shadow-[0_0_12px_#3b82f6] animate-aspirate !bg-[rgba(59,130,246,0.15)]' : ''
                                        } ${isOperating && currentOperation === 'dispensing' ? '!border-[#10b981] shadow-[0_0_12px_#10b981] animate-dispense !bg-[rgba(16,185,129,0.15)]' : ''
                                        } ${isOperating && currentOperation === 'moving' ? '!border-[#f59e0b] shadow-[0_0_10px_#f59e0b] animate-move' : ''
                                        } ${isQPickup ? '!border-[#2196F3] !bg-[rgba(33,150,243,0.15)] shadow-[0_0_10px_rgba(33,150,243,0.4)]' : ''
                                        } ${isQDropoff ? '!border-[#4CAF50] !bg-[rgba(76,175,80,0.15)] shadow-[0_0_10px_rgba(76,175,80,0.4)]' : ''
                                        } ${isQRinse ? '!border-[#FF9800] !bg-[rgba(255,152,0,0.15)] shadow-[0_0_10px_rgba(255,152,0,0.4)]' : ''
                                        }`}
                                        onClick={() => onWellClick(middleWell)}
                                    >
                                        {wellIds.map(wId => (
                                            <div
                                                key={wId}
                                                className={`w-5 h-5 rounded-full border transition-all duration-200 ${
                                                    isGroupSelected
                                                        ? 'bg-gradient-to-br from-[#4CAF50] to-[#45a049] border-[#45a049] shadow-[0_0_4px_rgba(76,175,80,0.6)]'
                                                        : 'bg-[var(--well-bg)] border-[var(--border-color)]'
                                                }`}
                                            />
                                        ))}
                                        {isQPickup && <span
                                            className="absolute top-0 right-0.5 bg-black/80 text-white text-[9px] font-bold py-0.5 px-1 rounded-sm leading-none">P</span>}
                                        {isQDropoff && <span
                                            className="absolute top-0 right-0.5 bg-black/80 text-white text-[9px] font-bold py-0.5 px-1 rounded-sm leading-none">D</span>}
                                        {isQRinse && <span
                                            className="absolute top-0 right-0.5 bg-black/80 text-white text-[9px] font-bold py-0.5 px-1 rounded-sm leading-none">R</span>}
                                    </div>
                                )
                            })
                        )}
                    </div>
                    <div>
                        {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].flatMap(row =>
                            [1].map(groupIdx => {
                                const cols = [groupIdx * 3 + 1, groupIdx * 3 + 2, groupIdx * 3 + 3]
                                const wellIds = cols.map(c => `${row}${c}`)
                                const middleWell = `${row}${cols[1]}`
                                const isGroupSelected = wellIds.some(w => w === selectedWell)
                                const isTarget = wellIds.some(w => w === targetWell)
                                const opWells = operationWell ? getPipetteWells(operationWell, currentPipetteCount) : []
                                const isOperating = wellIds.some(w => opWells.includes(w)) && currentOperation !== 'idle'
                                const isQPickup = quickOpMode && wellIds.some(w => quickOpWells.pickup === w)
                                const isQDropoff = quickOpMode && wellIds.some(w => quickOpWells.dropoff === w)
                                const isQRinse = quickOpMode && wellIds.some(w => quickOpWells.rinse === w)
                                return (
                                    <div
                                        key={middleWell}
                                        className={`grid grid-cols-3 place-items-center justify-center rounded-lg cursor-pointer transition-all duration-200 relative p-1 border-2 ${
                                            isGroupSelected
                                                ? 'border-[#4CAF50] bg-[rgba(76,175,80,0.1)] shadow-[0_0_10px_rgba(76,175,80,0.3)]'
                                                : 'border-[var(--border-color)] bg-[var(--bg-tertiary)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-overlay)]'
                                        } ${isTarget ? '!border-[#FF9800] shadow-[0_0_10px_rgba(255,152,0,0.5)]' : ''
                                        } ${isOperating && currentOperation === 'aspirating' ? '!border-[#3b82f6] shadow-[0_0_12px_#3b82f6] animate-aspirate !bg-[rgba(59,130,246,0.15)]' : ''
                                        } ${isOperating && currentOperation === 'dispensing' ? '!border-[#10b981] shadow-[0_0_12px_#10b981] animate-dispense !bg-[rgba(16,185,129,0.15)]' : ''
                                        } ${isOperating && currentOperation === 'moving' ? '!border-[#f59e0b] shadow-[0_0_10px_#f59e0b] animate-move' : ''
                                        } ${isQPickup ? '!border-[#2196F3] !bg-[rgba(33,150,243,0.15)] shadow-[0_0_10px_rgba(33,150,243,0.4)]' : ''
                                        } ${isQDropoff ? '!border-[#4CAF50] !bg-[rgba(76,175,80,0.15)] shadow-[0_0_10px_rgba(76,175,80,0.4)]' : ''
                                        } ${isQRinse ? '!border-[#FF9800] !bg-[rgba(255,152,0,0.15)] shadow-[0_0_10px_rgba(255,152,0,0.4)]' : ''
                                        }`}
                                        onClick={() => onWellClick(middleWell)}
                                    >
                                        {wellIds.map(wId => (
                                            <div
                                                key={wId}
                                                className={`w-5 h-5 rounded-full border transition-all duration-200 ${
                                                    isGroupSelected
                                                        ? 'bg-gradient-to-br from-[#4CAF50] to-[#45a049] border-[#45a049] shadow-[0_0_4px_rgba(76,175,80,0.6)]'
                                                        : 'bg-[var(--well-bg)] border-[var(--border-color)]'
                                                }`}
                                            />
                                        ))}
                                        {isQPickup && <span
                                            className="absolute top-0 right-0.5 bg-black/80 text-white text-[9px] font-bold py-0.5 px-1 rounded-sm leading-none">P</span>}
                                        {isQDropoff && <span
                                            className="absolute top-0 right-0.5 bg-black/80 text-white text-[9px] font-bold py-0.5 px-1 rounded-sm leading-none">D</span>}
                                        {isQRinse && <span
                                            className="absolute top-0 right-0.5 bg-black/80 text-white text-[9px] font-bold py-0.5 px-1 rounded-sm leading-none">R</span>}
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
