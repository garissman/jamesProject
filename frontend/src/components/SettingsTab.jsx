import { useState } from 'react'

export default function SettingsTab({
    config,
    handleConfigChange,
    saveConfig,
    controllerType,
    fetchCurrentPosition,
    handleAxisMove,
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
                    Layout Settings
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
                        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 backdrop-blur-[10px]">
                            <h3 className="m-0 mb-5 text-[var(--text-primary)] text-[1.1em] font-semibold">Bed Offset</h3>
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[15px]">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Bed X Offset (mm):</label>
                                    <input
                                        type="text"
                                        value={config.BED_OFFSET_X}
                                        onChange={(e) => handleConfigChange('BED_OFFSET_X', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Bed Y Offset (mm):</label>
                                    <input
                                        type="text"
                                        value={config.BED_OFFSET_Y}
                                        onChange={(e) => handleConfigChange('BED_OFFSET_Y', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 backdrop-blur-[10px]">
                            <h3 className="m-0 mb-5 text-[var(--text-primary)] text-[1.1em] font-semibold">MicroChip Layout Well Dimensions</h3>
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[15px]">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Well Spacing (mm):</label>
                                    <input
                                        type="text"
                                        value={config.WELL_SPACING}
                                        onChange={(e) => handleConfigChange('WELL_SPACING', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Well Diameter (mm):</label>
                                    <input
                                        type="text"
                                        value={config.WELL_DIAMETER}
                                        onChange={(e) => handleConfigChange('WELL_DIAMETER', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Well Height (mm):</label>
                                    <input
                                        type="text"
                                        value={config.WELL_HEIGHT}
                                        onChange={(e) => handleConfigChange('WELL_HEIGHT', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 backdrop-blur-[10px]">
                            <h3 className="m-0 mb-5 text-[var(--text-primary)] text-[1.1em] font-semibold">Washing Station Dimensions</h3>
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[15px]">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">X Position (mm):</label>
                                    <input
                                        type="text"
                                        value={config.WS_POSITION_X}
                                        onChange={(e) => handleConfigChange('WS_POSITION_X', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Y Position (mm):</label>
                                    <input
                                        type="text"
                                        value={config.WS_POSITION_Y}
                                        onChange={(e) => handleConfigChange('WS_POSITION_Y', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Height (mm):</label>
                                    <input
                                        type="text"
                                        value={config.WS_HEIGHT}
                                        onChange={(e) => handleConfigChange('WS_HEIGHT', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Width (mm):</label>
                                    <input
                                        type="text"
                                        value={config.WS_WIDTH}
                                        onChange={(e) => handleConfigChange('WS_WIDTH', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Gap Between WS1 & WS2 (mm):</label>
                                    <input
                                        type="text"
                                        value={config.WS_GAP}
                                        onChange={(e) => handleConfigChange('WS_GAP', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 backdrop-blur-[10px]">
                            <h3 className="m-0 mb-5 text-[var(--text-primary)] text-[1.1em] font-semibold">Vial Layout Well Dimensions</h3>
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[15px]">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Vial Well Spacing (mm):</label>
                                    <input
                                        type="text"
                                        value={config.VIAL_WELL_SPACING}
                                        onChange={(e) => handleConfigChange('VIAL_WELL_SPACING', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Vial Well Diameter (mm):</label>
                                    <input
                                        type="text"
                                        value={config.VIAL_WELL_DIAMETER}
                                        onChange={(e) => handleConfigChange('VIAL_WELL_DIAMETER', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Vial Well Height (mm):</label>
                                    <input
                                        type="text"
                                        value={config.VIAL_WELL_HEIGHT}
                                        onChange={(e) => handleConfigChange('VIAL_WELL_HEIGHT', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                            </div>
                        </div>
                    </>
                ) : settingsSubTab === 'motor' ? (
                    <>
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
                                        background: (config.CONTROLLER_TYPE || controllerType) === 'arduino_uno_q'
                                            ? 'rgba(0, 150, 255, 0.15)' : 'rgba(0, 200, 83, 0.15)',
                                        color: (config.CONTROLLER_TYPE || controllerType) === 'arduino_uno_q'
                                            ? '#0096ff' : '#00c853',
                                        border: `1px solid ${(config.CONTROLLER_TYPE || controllerType) === 'arduino_uno_q'
                                            ? 'rgba(0, 150, 255, 0.3)' : 'rgba(0, 200, 83, 0.3)'}`
                                    }}>
                                        {(config.CONTROLLER_TYPE || controllerType) === 'arduino_uno_q' ? 'Arduino UNO Q' : 'Raspberry Pi 5'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Arduino-specific controls */}
                        {(config.CONTROLLER_TYPE || controllerType) === 'arduino_uno_q' && (
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
                                                } catch (e) {
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
                                                        } catch (e) {
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
                                        <span className="toggle-track toggle-track-dot" />
                                        <span className="text-[0.85rem] text-[var(--text-primary)]">{label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 backdrop-blur-[10px]">
                            <h3 className="m-0 mb-5 text-[var(--text-primary)] text-[1.1em] font-semibold">Pipette Configuration</h3>
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[15px]">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Pipette Steps/mL:</label>
                                    <input
                                        type="text"
                                        value={config.PIPETTE_STEPS_PER_ML}
                                        onChange={(e) => handleConfigChange('PIPETTE_STEPS_PER_ML', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Max Pipette Volume (mL):</label>
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
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Pipette Speed (s/step):</label>
                                    <input
                                        type="text"
                                        value={config.PIPETTE_SPEED}
                                        onChange={(e) => handleConfigChange('PIPETTE_SPEED', e.target.value)}
                                        className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                    />
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
                                        <label className="text-[0.85rem] text-[var(--text-secondary)]">Steps/mL:</label>
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
                                        <label className="text-[0.85rem] text-[var(--text-secondary)]">Measured Volume (mL):</label>
                                        <input
                                            type="number" step="0.01" min="0"
                                            value={calibration.pipette.measuredVolume}
                                            onChange={(e) => setCalibration(prev => ({
                                                ...prev,
                                                pipette: {...prev.pipette, measuredVolume: e.target.value}
                                            }))}
                                            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                                            placeholder="Enter measured mL"
                                        />
                                    </div>

                                    <button
                                        className="w-full py-2 px-3.5 border border-[var(--border-color)] rounded-md bg-[var(--bg-secondary)] text-[var(--text-primary)] cursor-pointer text-[0.9rem] transition-all duration-200 hover:border-[var(--border-hover)] hover:bg-[var(--nav-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
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
                                        <div className="flex items-center justify-between gap-2.5 p-2.5 bg-[var(--bg-overlay)] rounded-md">
                                            <span className="font-semibold text-[1.05rem]">
                                                {calibration.pipette.calculatedSPML} steps/mL
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
                                const result = await saveConfig()
                                if (result?.status === 'success') {
                                    setConfigMessage('\u2713 Configuration saved successfully')
                                } else {
                                    setConfigMessage('\u2717 ' + (result?.message || 'Failed to save configuration'))
                                }
                            } catch (err) {
                                setConfigMessage('\u2717 ' + err.message)
                            } finally {
                                setConfigLoading(false)
                            }
                        }}
                        disabled={configLoading}
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
