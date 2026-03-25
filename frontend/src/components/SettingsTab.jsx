import { useState, useEffect } from 'react'

const REFERENCE_WELLS = {
    microchip: [
        'WS1', 'WS2',
        'A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2', 'H2', 'MC1',
        'A5', 'B5', 'C5', 'D5', 'E5', 'F5', 'G5', 'H5', 'MC2',
        'A8', 'B8', 'C8', 'D8', 'E8', 'F8', 'G8', 'H8', 'MC3',
        'A11', 'B11', 'C11', 'D11', 'E11', 'F11', 'G11', 'H11', 'MC4',
        'A14', 'B14', 'C14', 'D14', 'E14', 'F14', 'G14', 'H14', 'MC5',
    ],
    vial: [
        'WS1', 'WS2',
        'VA2', 'VB2', 'VC2', 'VD2', 'VE2',
        'A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2', 'H2', 'I2', 'J2', 'K2', 'L2',
        'A5', 'B5', 'C5', 'D5', 'E5', 'F5', 'G5', 'H5', 'I5', 'J5', 'K5', 'L5',
    ],
}

export default function SettingsTab({
    config,
    handleConfigChange,
    saveConfig,
    controllerType,
    fetchCurrentPosition,
    handleAxisMove,
    axisPositions,
}) {
    const [settingsSubTab, setSettingsSubTab] = useState('layout')
    const [calibration, setCalibration] = useState({
        x: { testSteps: 1000, measuredDistance: '', calculatedSPM: null },
        y: { testSteps: 1000, measuredDistance: '', calculatedSPM: null },
        z: { testSteps: 1000, measuredDistance: '', calculatedSPM: null },
        pipette: { testSteps: 1000, measuredVolume: '', calculatedSPML: null },
    })
    const [configLoading, setConfigLoading] = useState(false)
    const [configMessage, setConfigMessage] = useState('')
    const [coordLayout, setCoordLayout] = useState('microchip')
    const [coordData, setCoordData] = useState({})
    const [capturingWell, setCapturingWell] = useState(null)

    // Fetch coordinates when layout changes
    useEffect(() => {
        if (settingsSubTab === 'layout') {
            fetch(`/api/coordinates/${coordLayout}`)
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') setCoordData(data.coordinates || {})
                })
                .catch(err => console.error('Failed to fetch coordinates:', err))
        }
    }, [coordLayout, settingsSubTab])

    const handleCapture = async (wellId) => {
        setCapturingWell(wellId)
        try {
            const res = await fetch('/api/coordinates/capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ layout: coordLayout, wellId }),
            })
            const data = await res.json()
            if (res.ok) {
                setCoordData(prev => ({ ...prev, [wellId]: { x: data.x, y: data.y } }))
            } else {
                console.error(data.detail || 'Capture failed')
            }
        } catch (err) {
            console.error('Capture error:', err.message)
        } finally {
            setCapturingWell(null)
        }
    }

    const handleCoordEdit = async (wellId, axis, value) => {
        const numVal = parseFloat(value)
        if (isNaN(numVal)) return
        const existing = coordData[wellId] || { x: 0, y: 0 }
        const updated = { ...existing, [axis]: numVal }
        setCoordData(prev => ({ ...prev, [wellId]: updated }))

        try {
            await fetch('/api/coordinates/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ layout: coordLayout, wellId, x: updated.x, y: updated.y }),
            })
        } catch (err) {
            console.error('Save error:', err.message)
        }
    }

    const handleClearCoord = async (wellId) => {
        const newData = { ...coordData }
        delete newData[wellId]
        setCoordData(newData)
        try {
            await fetch('/api/coordinates/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ layout: coordLayout, wellId, x: null, y: null }),
            })
        } catch (err) {
            console.error('Clear error:', err.message)
        }
    }

    return (
        <div className="p-5 max-w-[1200px] mx-auto">
            <h2 className="mt-0 mb-2.5 text-[var(--text-primary)]">System Configuration</h2>
            <p className="text-[var(--text-tertiary)] mb-5 leading-relaxed">
                Configure hardware parameters for the pipetting system. Changes are saved to config.json
                and applied immediately without a server restart.
            </p>

            {/* Settings sub-tabs */}
            <div className="flex gap-0 mb-6 border-b-2 border-[var(--border-color)]">
                <button
                    className={`bg-transparent border-none border-b-[3px] -mb-[2px] py-2.5 px-7 text-[0.95rem] font-semibold cursor-pointer transition-all duration-200 tracking-wide hover:text-[var(--text-primary)] hover:bg-[var(--nav-hover)] ${
                        settingsSubTab === 'layout'
                            ? 'text-[var(--text-primary)] border-b-[var(--border-hover)] bg-transparent'
                            : 'border-b-transparent text-[var(--text-tertiary)]'
                    }`}
                    onClick={() => setSettingsSubTab('layout')}
                >
                    Coordinate Mapping
                </button>
                <button
                    className={`bg-transparent border-none border-b-[3px] -mb-[2px] py-2.5 px-7 text-[0.95rem] font-semibold cursor-pointer transition-all duration-200 tracking-wide hover:text-[var(--text-primary)] hover:bg-[var(--nav-hover)] ${
                        settingsSubTab === 'motor'
                            ? 'text-[var(--text-primary)] border-b-[var(--border-hover)] bg-transparent'
                            : 'border-b-transparent text-[var(--text-tertiary)]'
                    }`}
                    onClick={() => setSettingsSubTab('motor')}
                >
                    Motor Settings
                </button>
                <button
                    className={`bg-transparent border-none border-b-[3px] -mb-[2px] py-2.5 px-7 text-[0.95rem] font-semibold cursor-pointer transition-all duration-200 tracking-wide hover:text-[var(--text-primary)] hover:bg-[var(--nav-hover)] ${
                        settingsSubTab === 'calibration'
                            ? 'text-[var(--text-primary)] border-b-[var(--border-hover)] bg-transparent'
                            : 'border-b-transparent text-[var(--text-tertiary)]'
                    }`}
                    onClick={() => setSettingsSubTab('calibration')}
                >
                    Calibration
                </button>
            </div>

            <div className="flex flex-col gap-[30px]">
                {settingsSubTab === 'layout' ? (
                    <>
                        {/* Location Coordinate Mapping */}
                        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 backdrop-blur-[10px]">
                            <h3 className="m-0 mb-3 text-[var(--text-primary)] text-[1.1em] font-semibold">Location Coordinate Mapping</h3>
                            <p className="text-[var(--text-tertiary)] text-sm mb-4">
                                Store explicit X,Y positions for reference wells. Use "Capture" to save the current motor position, or edit values manually.
                            </p>

                            {/* Current position display */}
                            {axisPositions && (
                                <div className="mb-4 p-3 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-color)] text-sm">
                                    <span className="font-semibold text-[var(--text-primary)]">Current Position: </span>
                                    <span className="text-[var(--text-secondary)]">
                                        X={axisPositions.x?.toFixed(2) ?? '0.00'} mm, Y={axisPositions.y?.toFixed(2) ?? '0.00'} mm
                                    </span>
                                </div>
                            )}

                            {/* Layout selector */}
                            <div className="flex items-center gap-3 mb-4">
                                <label className="text-sm font-semibold text-[var(--text-primary)]">Layout:</label>
                                <select
                                    value={coordLayout}
                                    onChange={(e) => setCoordLayout(e.target.value)}
                                    className="p-2 px-3 text-sm border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] cursor-pointer"
                                >
                                    <option value="microchip">MicroChip</option>
                                    <option value="vial">Vial</option>
                                </select>
                            </div>

                            {/* Reference wells table */}
                            <div className="max-h-[400px] overflow-y-auto border border-[var(--border-color)] rounded-lg">
                                <table className="w-full border-collapse text-sm">
                                    <thead className="sticky top-0 bg-[var(--bg-secondary)]">
                                        <tr>
                                            <th className="text-left p-2 px-3 border-b border-[var(--border-color)] text-[var(--text-primary)] font-semibold">Well</th>
                                            <th className="text-left p-2 px-3 border-b border-[var(--border-color)] text-[var(--text-primary)] font-semibold">X (mm)</th>
                                            <th className="text-left p-2 px-3 border-b border-[var(--border-color)] text-[var(--text-primary)] font-semibold">Y (mm)</th>
                                            <th className="text-center p-2 px-3 border-b border-[var(--border-color)] text-[var(--text-primary)] font-semibold">Status</th>
                                            <th className="text-center p-2 px-3 border-b border-[var(--border-color)] text-[var(--text-primary)] font-semibold">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* v8 ignore next */ (REFERENCE_WELLS[coordLayout] || []).map((wellId) => {
                                            const coord = coordData[wellId]
                                            const isSet = coord !== null && coord !== undefined
                                            return (
                                                <tr key={wellId} className="hover:bg-[var(--nav-hover)] transition-colors">
                                                    <td className="p-2 px-3 border-b border-[var(--border-color)] font-mono font-semibold text-[var(--text-primary)]">
                                                        {wellId}
                                                    </td>
                                                    <td className="p-1 px-2 border-b border-[var(--border-color)]">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={isSet ? coord.x : ''}
                                                            placeholder="—"
                                                            onChange={(e) => handleCoordEdit(wellId, 'x', e.target.value)}
                                                            className="w-20 p-1.5 px-2 text-sm border border-[var(--input-border)] rounded bg-[var(--input-bg)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-hover)]"
                                                        />
                                                    </td>
                                                    <td className="p-1 px-2 border-b border-[var(--border-color)]">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={isSet ? coord.y : ''}
                                                            placeholder="—"
                                                            onChange={(e) => handleCoordEdit(wellId, 'y', e.target.value)}
                                                            className="w-20 p-1.5 px-2 text-sm border border-[var(--input-border)] rounded bg-[var(--input-bg)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-hover)]"
                                                        />
                                                    </td>
                                                    <td className="p-2 px-3 border-b border-[var(--border-color)] text-center">
                                                        <span
                                                            className={`inline-block w-2.5 h-2.5 rounded-full ${
                                                                isSet ? 'bg-green-500' : 'bg-gray-400'
                                                            }`}
                                                            title={isSet ? `Set: X=${coord.x}, Y=${coord.y}` : 'Not set'}
                                                        />
                                                    </td>
                                                    <td className="p-1.5 px-2 border-b border-[var(--border-color)] text-center">
                                                        <div className="flex gap-1 justify-center">
                                                            <button
                                                                onClick={() => handleCapture(wellId)}
                                                                disabled={capturingWell === wellId}
                                                                className="px-2.5 py-1 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-wait transition-colors"
                                                                title="Capture current motor position"
                                                            >
                                                                {capturingWell === wellId ? '...' : 'Capture'}
                                                            </button>
                                                            {isSet && (
                                                                <button
                                                                    onClick={() => handleClearCoord(wellId)}
                                                                    className="px-2 py-1 text-xs font-semibold rounded bg-red-600/80 text-white hover:bg-red-700 cursor-pointer transition-colors"
                                                                    title="Clear coordinate"
                                                                >
                                                                    Clear
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                ) : settingsSubTab === 'motor' ? (
                    <>
                        {import.meta.env.DEV && (
                        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 backdrop-blur-[10px]">
                            <h3 className="m-0 mb-5 text-[var(--text-primary)] text-[1.1em] font-semibold">Controller Type</h3>
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[15px]">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Hardware Controller:</label>
                                    <select
                                        value={config.CONTROLLER_TYPE || 'raspberry_pi'}
                                        onChange={(e) => {
                                            handleConfigChange('CONTROLLER_TYPE', e.target.value)
                                            fetch('/api/pipetting/set-controller-type', {
                                                method: 'POST',
                                                headers: {'Content-Type': 'application/json'},
                                                body: JSON.stringify({controllerType: e.target.value})
                                            }).then(r => r.json()).then(data => {
                                                if (data.status === 'success') {
                                                    setConfigMessage('Controller switched to ' + e.target.value)
                                                    fetchCurrentPosition()
                                                }
                                            }).catch(err => console.error('Failed to switch controller:', err))
                                        }}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    >
                                        <option value="raspberry_pi">Raspberry Pi 5</option>
                                        <option value="arduino_uno_q">Arduino UNO Q</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Active Controller:</label>
                                    <div style={{
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        background: controllerType === 'arduino_uno_q'
                                            ? 'rgba(0, 150, 255, 0.15)' : 'rgba(0, 200, 83, 0.15)',
                                        color: controllerType === 'arduino_uno_q'
                                            ? '#0096ff' : '#00c853',
                                        border: `1px solid ${controllerType === 'arduino_uno_q'
                                            ? 'rgba(0, 150, 255, 0.3)' : 'rgba(0, 200, 83, 0.3)'}`
                                    }}>
                                        {controllerType === 'arduino_uno_q' ? 'Arduino UNO Q' : 'Raspberry Pi 5'}
                                    </div>
                                </div>
                            </div>
                        </div>
                        )}

                        {/* Arduino-specific controls */}
                        {controllerType === 'arduino_uno_q' && (
                            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 backdrop-blur-[10px]">
                                <h3 className="m-0 mb-5 text-[var(--text-primary)] text-[1.1em] font-semibold">Arduino UNO Q Controls</h3>
                                <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[15px]">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">MCU Connection:</label>
                                        <button
                                            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 cursor-pointer focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                            onClick={async () => {
                                                try {
                                                    const r = await fetch('/api/mcu/ping')
                                                    const data = await r.json()
                                                    setConfigMessage(data.connected ? 'MCU: Connected (pong)' : 'MCU: No response')
                                                } catch {
                                                    setConfigMessage('MCU: Connection failed')
                                                }
                                            }}
                                        >
                                            Ping MCU
                                        </button>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">LED Test:</label>
                                        <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                                            {['all', 'sweep', 'idle', 'success', 'error'].map(pattern => (
                                                <button
                                                    key={pattern}
                                                    className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 cursor-pointer focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                                    style={{fontSize: '11px', padding: '4px 8px'}}
                                                    onClick={async () => {
                                                        try {
                                                            await fetch('/api/led/test', {
                                                                method: 'POST',
                                                                headers: {'Content-Type': 'application/json'},
                                                                body: JSON.stringify({pattern, value: 0})
                                                            })
                                                            setConfigMessage(`LED: ${pattern} test sent`)
                                                        } catch {
                                                            setConfigMessage('LED test failed')
                                                        }
                                                    }}
                                                >
                                                    {pattern}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 backdrop-blur-[10px]">
                            <h3 className="m-0 mb-5 text-[var(--text-primary)] text-[1.1em] font-semibold">Motor Configuration</h3>
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[15px]">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">X-Axis Steps/mm:</label>
                                    <input
                                        type="text"
                                        value={config.STEPS_PER_MM_X}
                                        onChange={(e) => handleConfigChange('STEPS_PER_MM_X', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Y-Axis Steps/mm:</label>
                                    <input
                                        type="text"
                                        value={config.STEPS_PER_MM_Y}
                                        onChange={(e) => handleConfigChange('STEPS_PER_MM_Y', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Z-Axis Steps/mm:</label>
                                    <input
                                        type="text"
                                        value={config.STEPS_PER_MM_Z}
                                        onChange={(e) => handleConfigChange('STEPS_PER_MM_Z', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center flex-wrap gap-4 mt-4 pt-3.5 border-t border-[var(--border-color)]">
                                <span className="text-[0.85rem] font-semibold text-[var(--text-secondary)] whitespace-nowrap">Invert Direction:</span>
                                {[
                                    {key: 'INVERT_X',       label: 'X-Axis'},
                                    {key: 'INVERT_Y',       label: 'Y-Axis'},
                                    {key: 'INVERT_Z',       label: 'Z-Axis'},
                                    {key: 'INVERT_PIPETTE', label: 'Pipette'},
                                ].map(({key, label}) => (
                                    <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={!!config[key]}
                                            onChange={(e) => handleConfigChange(key, e.target.checked)}
                                            className="hidden"
                                        />
                                        <span className="toggle-track toggle-track-dot toggle-track-checked" />
                                        <span className="text-[0.85rem] text-[var(--text-primary)]">{label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 backdrop-blur-[10px]">
                            <h3 className="m-0 mb-5 text-[var(--text-primary)] text-[1.1em] font-semibold">Pipette Configuration</h3>
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[15px]">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Pipette Steps/µL:</label>
                                    <input
                                        type="text"
                                        value={config.PIPETTE_STEPS_PER_ML}
                                        onChange={(e) => handleConfigChange('PIPETTE_STEPS_PER_ML', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Max Pipette Volume (µL):</label>
                                    <input
                                        type="text"
                                        value={config.PIPETTE_MAX_ML}
                                        onChange={(e) => handleConfigChange('PIPETTE_MAX_ML', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 backdrop-blur-[10px]">
                            <h3 className="m-0 mb-5 text-[var(--text-primary)] text-[1.1em] font-semibold">Pipetting Operation Parameters</h3>
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[15px]">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Pickup Depth (mm):</label>
                                    <input
                                        type="text"
                                        value={config.PICKUP_DEPTH}
                                        onChange={(e) => handleConfigChange('PICKUP_DEPTH', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Dropoff Depth (mm):</label>
                                    <input
                                        type="text"
                                        value={config.DROPOFF_DEPTH}
                                        onChange={(e) => handleConfigChange('DROPOFF_DEPTH', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Safe Height (mm):</label>
                                    <input
                                        type="text"
                                        value={config.SAFE_HEIGHT}
                                        onChange={(e) => handleConfigChange('SAFE_HEIGHT', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Rinse Cycles:</label>
                                    <input
                                        type="text"
                                        value={config.RINSE_CYCLES}
                                        onChange={(e) => handleConfigChange('RINSE_CYCLES', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 backdrop-blur-[10px]">
                            <h3 className="m-0 mb-5 text-[var(--text-primary)] text-[1.1em] font-semibold">Movement Speed Configuration</h3>
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[15px]">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Travel Speed (s/step):</label>
                                    <input
                                        type="text"
                                        value={config.TRAVEL_SPEED}
                                        onChange={(e) => handleConfigChange('TRAVEL_SPEED', e.target.value)}
                                        className={`p-3 px-4 text-base border-2 rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)] ${parseFloat(config.TRAVEL_SPEED) < 0.0001 && config.TRAVEL_SPEED !== '' ? 'border-red-500' : 'border-[var(--input-border)]'}`}
                                    />
                                    {parseFloat(config.TRAVEL_SPEED) < 0.0001 && config.TRAVEL_SPEED !== '' && (
                                        <span className="text-red-500 text-xs font-medium">Minimum allowed value is 0.0001s</span>
                                    )}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Pipette Speed (s/step):</label>
                                    <input
                                        type="text"
                                        value={config.PIPETTE_SPEED}
                                        onChange={(e) => handleConfigChange('PIPETTE_SPEED', e.target.value)}
                                        className={`p-3 px-4 text-base border-2 rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)] ${parseFloat(config.PIPETTE_SPEED) < 0.0001 && config.PIPETTE_SPEED !== '' ? 'border-red-500' : 'border-[var(--input-border)]'}`}
                                    />
                                    {parseFloat(config.PIPETTE_SPEED) < 0.0001 && config.PIPETTE_SPEED !== '' && (
                                        <span className="text-red-500 text-xs font-medium">Minimum allowed value is 0.0001s</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    /* Calibration sub-tab */
                    <>
                        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 backdrop-blur-[10px]">
                            <h3 className="m-0 mb-5 text-[var(--text-primary)] text-[1.1em] font-semibold">Axis Calibration</h3>
                            <p className="text-[var(--text-tertiary)] text-[0.9rem] m-0 mb-4">
                                Send a known number of steps, measure the actual travel distance with a ruler,
                                then calculate the correct Steps/mm for each axis.
                            </p>
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
                                {['x', 'y', 'z'].map(axis => {
                                    const cal = calibration[axis]
                                    const configKey = `STEPS_PER_MM_${axis.toUpperCase()}`
                                    return (
                                        <div key={axis} className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-[10px] p-4 flex flex-col gap-2.5 overflow-hidden min-w-0">
                                            <h4 className="m-0 text-[1.1rem]">{axis.toUpperCase()}-Axis</h4>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[0.85rem] text-[var(--text-secondary)]">Steps/mm:</label>
                                                <div className="flex gap-2 items-center min-w-0">
                                                    <input
                                                        type="text"
                                                        value={config[configKey]}
                                                        onChange={(e) => handleConfigChange(configKey, e.target.value)}
                                                        className="flex-1 min-w-0 p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                                    />
                                                    <button
                                                        className="shrink-0 py-2 px-3.5 border border-[var(--border-color)] rounded-md bg-[var(--bg-secondary)] text-[var(--text-primary)] cursor-pointer text-[0.9rem] transition-all duration-200 hover:border-[var(--border-hover)] hover:bg-[var(--nav-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
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
                                                                setConfigMessage(data.status === 'success' ? '\u2713 ' + data.message : '\u2717 Failed to save')
                                                            } catch (err) {
                                                                setConfigMessage('\u2717 Error: ' + err.message)
                                                            } finally {
                                                                setConfigLoading(false)
                                                            }
                                                        }}
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                            </div>

                                            <hr className="border-none border-t border-[var(--border-color)] my-1" />

                                            <div className="flex flex-col gap-1">
                                                <label className="text-[0.85rem] text-[var(--text-secondary)]">Test Steps:</label>
                                                <input
                                                    type="number" min="1"
                                                    value={cal.testSteps}
                                                    onChange={(e) => setCalibration(prev => ({
                                                        ...prev,
                                                        [axis]: {...prev[axis], testSteps: parseInt(e.target.value) || 0}
                                                    }))}
                                                    className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                                />
                                            </div>

                                            <div className="flex gap-2">
                                                <button
                                                    className="flex-1 py-2 px-3.5 border border-[var(--border-color)] rounded-md bg-[var(--bg-secondary)] text-[var(--text-primary)] cursor-pointer text-[0.9rem] transition-all duration-200 hover:border-[var(--border-hover)] hover:bg-[var(--nav-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                                                    onClick={() => handleAxisMove(axis, cal.testSteps, 'cw')}
                                                >
                                                    Move +
                                                </button>
                                                <button
                                                    className="flex-1 py-2 px-3.5 border border-[var(--border-color)] rounded-md bg-[var(--bg-secondary)] text-[var(--text-primary)] cursor-pointer text-[0.9rem] transition-all duration-200 hover:border-[var(--border-hover)] hover:bg-[var(--nav-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                                                    onClick={() => handleAxisMove(axis, cal.testSteps, 'ccw')}
                                                >
                                                    Move −
                                                </button>
                                            </div>

                                            <div className="flex flex-col gap-1">
                                                <label className="text-[0.85rem] text-[var(--text-secondary)]">Measured Distance (mm):</label>
                                                <input
                                                    type="number" step="0.01" min="0"
                                                    value={cal.measuredDistance}
                                                    onChange={(e) => setCalibration(prev => ({
                                                        ...prev,
                                                        [axis]: {...prev[axis], measuredDistance: e.target.value}
                                                    }))}
                                                    className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                                    placeholder="Enter measured mm"
                                                />
                                            </div>

                                            <button
                                                className="w-full py-2 px-3.5 border border-[var(--border-color)] rounded-md bg-[var(--bg-secondary)] text-[var(--text-primary)] cursor-pointer text-[0.9rem] transition-all duration-200 hover:border-[var(--border-hover)] hover:bg-[var(--nav-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                                                disabled={!cal.measuredDistance || parseFloat(cal.measuredDistance) <= 0}
                                                onClick={() => {
                                                    const dist = parseFloat(cal.measuredDistance)
                                                    /* v8 ignore start */
                                                    if (dist > 0) {
                                                    /* v8 ignore stop */
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
                                                <div className="flex items-center justify-between gap-2.5 p-2.5 bg-[var(--bg-overlay)] rounded-md">
                                                    <span className="font-semibold text-[1.05rem]">
                                                        {cal.calculatedSPM} steps/mm
                                                    </span>
                                                    <button
                                                        className="shrink-0 py-2 px-3.5 border border-[var(--border-color)] rounded-md bg-[var(--bg-secondary)] text-[var(--text-primary)] cursor-pointer text-[0.9rem] transition-all duration-200 hover:border-[var(--border-hover)] hover:bg-[var(--nav-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                                                        onClick={async () => {
                                                            handleConfigChange(configKey, cal.calculatedSPM)
                                                            const updatedConfig = {...config, [configKey]: cal.calculatedSPM}
                                                            setConfigLoading(true)
                                                            setConfigMessage('')
                                                            try {
                                                                const res = await fetch('/api/config', {
                                                                    method: 'POST',
                                                                    headers: {'Content-Type': 'application/json'},
                                                                    body: JSON.stringify(updatedConfig)
                                                                })
                                                                const data = await res.json()
                                                                setConfigMessage(data.status === 'success' ? '\u2713 ' + data.message : '\u2717 Failed to save')
                                                            } catch (err) {
                                                                setConfigMessage('\u2717 Error: ' + err.message)
                                                            } finally {
                                                                setConfigLoading(false)
                                                            }
                                                        }}
                                                    >
                                                        Apply & Save
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}

                                {/* Pipette calibration card */}
                                <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-[10px] p-4 flex flex-col gap-2.5 overflow-hidden min-w-0">
                                    <h4 className="m-0 text-[1.1rem]">Pipette</h4>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[0.85rem] text-[var(--text-secondary)]">Steps/µL:</label>
                                        <div className="flex gap-2 items-center min-w-0">
                                            <input
                                                type="text"
                                                value={config.PIPETTE_STEPS_PER_ML}
                                                onChange={(e) => handleConfigChange('PIPETTE_STEPS_PER_ML', e.target.value)}
                                                className="flex-1 min-w-0 p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                            />
                                            <button
                                                className="shrink-0 py-2 px-3.5 border border-[var(--border-color)] rounded-md bg-[var(--bg-secondary)] text-[var(--text-primary)] cursor-pointer text-[0.9rem] transition-all duration-200 hover:border-[var(--border-hover)] hover:bg-[var(--nav-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
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
                                                        setConfigMessage(data.status === 'success' ? '\u2713 ' + data.message : '\u2717 Failed to save')
                                                    } catch (err) {
                                                        setConfigMessage('\u2717 Error: ' + err.message)
                                                    } finally {
                                                        setConfigLoading(false)
                                                    }
                                                }}
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </div>

                                    <hr className="border-none border-t border-[var(--border-color)] my-1" />

                                    <div className="flex flex-col gap-1">
                                        <label className="text-[0.85rem] text-[var(--text-secondary)]">Test Steps:</label>
                                        <input
                                            type="number" min="1"
                                            value={calibration.pipette.testSteps}
                                            onChange={(e) => setCalibration(prev => ({
                                                ...prev,
                                                pipette: {...prev.pipette, testSteps: parseInt(e.target.value) || 0}
                                            }))}
                                            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                        />
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            className="flex-1 py-2 px-3.5 border border-[var(--border-color)] rounded-md bg-[var(--bg-secondary)] text-[var(--text-primary)] cursor-pointer text-[0.9rem] transition-all duration-200 hover:border-[var(--border-hover)] hover:bg-[var(--nav-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                                            onClick={() => handleAxisMove('pipette', calibration.pipette.testSteps, 'cw')}
                                        >
                                            Aspirate +
                                        </button>
                                        <button
                                            className="flex-1 py-2 px-3.5 border border-[var(--border-color)] rounded-md bg-[var(--bg-secondary)] text-[var(--text-primary)] cursor-pointer text-[0.9rem] transition-all duration-200 hover:border-[var(--border-hover)] hover:bg-[var(--nav-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                                            onClick={() => handleAxisMove('pipette', calibration.pipette.testSteps, 'ccw')}
                                        >
                                            Dispense −
                                        </button>
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <label className="text-[0.85rem] text-[var(--text-secondary)]">Measured Volume (µL):</label>
                                        <input
                                            type="number" step="0.01" min="0"
                                            value={calibration.pipette.measuredVolume}
                                            onChange={(e) => setCalibration(prev => ({
                                                ...prev,
                                                pipette: {...prev.pipette, measuredVolume: e.target.value}
                                            }))}
                                            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                            placeholder="Enter measured µL"
                                        />
                                    </div>

                                    <button
                                        className="w-full py-2 px-3.5 border border-[var(--border-color)] rounded-md bg-[var(--bg-secondary)] text-[var(--text-primary)] cursor-pointer text-[0.9rem] transition-all duration-200 hover:border-[var(--border-hover)] hover:bg-[var(--nav-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                                        disabled={!calibration.pipette.measuredVolume || parseFloat(calibration.pipette.measuredVolume) <= 0}
                                        onClick={() => {
                                            const vol = parseFloat(calibration.pipette.measuredVolume)
                                            /* v8 ignore start */
                                            if (vol > 0) {
                                            /* v8 ignore stop */
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
                                        <div className="flex items-center justify-between gap-2.5 p-2.5 bg-[var(--bg-overlay)] rounded-md">
                                            <span className="font-semibold text-[1.05rem]">
                                                {calibration.pipette.calculatedSPML} steps/µL
                                            </span>
                                            <button
                                                className="shrink-0 py-2 px-3.5 border border-[var(--border-color)] rounded-md bg-[var(--bg-secondary)] text-[var(--text-primary)] cursor-pointer text-[0.9rem] transition-all duration-200 hover:border-[var(--border-hover)] hover:bg-[var(--nav-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                                                onClick={async () => {
                                                    handleConfigChange('PIPETTE_STEPS_PER_ML', calibration.pipette.calculatedSPML)
                                                    const updatedConfig = {...config, PIPETTE_STEPS_PER_ML: calibration.pipette.calculatedSPML}
                                                    setConfigLoading(true)
                                                    setConfigMessage('')
                                                    try {
                                                        const res = await fetch('/api/config', {
                                                            method: 'POST',
                                                            headers: {'Content-Type': 'application/json'},
                                                            body: JSON.stringify(updatedConfig)
                                                        })
                                                        const data = await res.json()
                                                        setConfigMessage(data.status === 'success' ? '\u2713 ' + data.message : '\u2717 Failed to save')
                                                    } catch (err) {
                                                        setConfigMessage('\u2717 Error: ' + err.message)
                                                    } finally {
                                                        setConfigLoading(false)
                                                    }
                                                }}
                                            >
                                                Apply & Save
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}

                <div className="flex flex-col gap-[15px] items-start">
                    <button
                        onClick={async () => {
                            setConfigLoading(true)
                            setConfigMessage('')
                            try {
                                const data = await saveConfig()
                                setConfigMessage(data.status === 'success' ? '\u2713 ' + (data.message || 'Configuration saved') : '\u2717 Failed to save')
                            } catch (err) {
                                setConfigMessage('\u2717 Error: ' + err.message)
                            } finally {
                                setConfigLoading(false)
                            }
                        }}
                        disabled={configLoading || parseFloat(config.TRAVEL_SPEED) < 0.0001 || parseFloat(config.PIPETTE_SPEED) < 0.0001}
                        className="py-3 px-8 bg-gradient-to-br from-[#4a90e2] to-[#357abd] text-white border-none rounded-lg text-base font-semibold cursor-pointer transition-all duration-300 shadow-[0_2px_8px_rgba(74,144,226,0.3)] hover:enabled:bg-gradient-to-br hover:enabled:from-[#357abd] hover:enabled:to-[#2868a8] hover:enabled:shadow-[0_4px_12px_rgba(74,144,226,0.4)] hover:enabled:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {configLoading ? 'Saving...' : 'Save Configuration'}
                    </button>
                    {configMessage && (
                        <div
                            className={`py-3 px-5 rounded-lg text-sm font-medium ${
                                configMessage.startsWith('\u2713')
                                    ? 'bg-[rgba(76,175,80,0.1)] border border-[rgba(76,175,80,0.3)] text-[#4caf50]'
                                    : 'bg-[rgba(244,67,54,0.1)] border border-[rgba(244,67,54,0.3)] text-[#f44336]'
                            }`}
                        >
                            {configMessage}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
