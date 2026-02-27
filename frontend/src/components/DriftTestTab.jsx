import { useState, useEffect, useCallback } from 'react'

export default function DriftTestTab() {
    const [driftTestConfig, setDriftTestConfig] = useState({
        cycles: 10,
        motor_speed: 0.001,
        steps_per_mm: 200,
        motor: 1
    })
    const [driftTestRunning, setDriftTestRunning] = useState(false)
    const [driftTestResults, setDriftTestResults] = useState(null)
    const [limitSwitchStatus, setLimitSwitchStatus] = useState(null)
    const [limitSwitchLoading, setLimitSwitchLoading] = useState(false)

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

    const fetchDriftTestStatus = useCallback(async () => {
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
    }, [])

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

    const fetchLimitSwitches = useCallback(async () => {
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
    }, [])

    // Initial fetch and regular polling
    useEffect(() => {
        fetchDriftTestStatus()
        fetchLimitSwitches()

        const interval = setInterval(() => {
            fetchDriftTestStatus()
            fetchLimitSwitches()
        }, 1000)

        return () => clearInterval(interval)
    }, [fetchDriftTestStatus, fetchLimitSwitches])

    // Faster polling when drift test is running
    useEffect(() => {
        if (!driftTestRunning) return

        const interval = setInterval(() => {
            fetchDriftTestStatus()
        }, 500)

        return () => clearInterval(interval)
    }, [driftTestRunning, fetchDriftTestStatus])

    return (
        <div className="flex-1 bg-[var(--bg-secondary)] rounded-[15px] p-[30px] max-w-full flex flex-col gap-[25px]">
            <h2 className="m-0 text-[1.6rem] font-semibold text-[var(--text-primary)]">Motor Drift Test</h2>
            <p className="text-[var(--text-tertiary)] m-0 text-[0.95rem]">
                Test stepper motor precision by running back-and-forth cycles.
                Measures drift using limit switches.
            </p>

            {/* Test Configuration */}
            <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl p-5">
                <h3 className="m-0 mb-[15px] text-[1.1rem] font-semibold text-[var(--text-primary)]">Test Configuration</h3>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[15px]">
                    <div className="flex flex-col gap-2">
                        <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Motor:</label>
                        <select
                            value={driftTestConfig.motor}
                            onChange={(e) => {
                                setDriftTestConfig(prev => ({...prev, motor: parseInt(e.target.value)}))
                                fetchLimitSwitches()
                            }}
                            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                            disabled={driftTestRunning}
                        >
                            <option value={1}>Motor 1 — X-Axis</option>
                            <option value={2}>Motor 2 — Y-Axis</option>
                            <option value={3}>Motor 3 — Z-Axis</option>
                            <option value={4}>Motor 4 — Pipette</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Number of Cycles:</label>
                        <input
                            type="number"
                            min="1"
                            max="1000"
                            value={driftTestConfig.cycles}
                            onChange={(e) => setDriftTestConfig(prev => ({
                                ...prev,
                                cycles: parseInt(e.target.value) || 1
                            }))}
                            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                            disabled={driftTestRunning}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Motor Speed (s):</label>
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
                            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                            disabled={driftTestRunning}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">Steps per mm:</label>
                        <input
                            type="number"
                            min="1"
                            max="10000"
                            value={driftTestConfig.steps_per_mm}
                            onChange={(e) => setDriftTestConfig(prev => ({
                                ...prev,
                                steps_per_mm: parseInt(e.target.value) || 200
                            }))}
                            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
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
                        <div className="mt-5 p-4 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-[10px]">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[0.95rem] font-semibold text-[var(--text-primary)]">Limit Switch Check</span>
                                <button
                                    className="py-1 px-3 text-[0.8rem] font-semibold border border-[var(--border-color)] rounded-md bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-pointer transition-all duration-200 hover:enabled:border-[#3b82f6] hover:enabled:text-[#3b82f6] disabled:opacity-40 disabled:cursor-not-allowed"
                                    onClick={fetchLimitSwitches}
                                    disabled={limitSwitchLoading || driftTestRunning}
                                    title="Refresh limit switch status"
                                >
                                    {limitSwitchLoading ? '...' : '\u21BB Refresh'}
                                </button>
                            </div>
                            {limitSwitchStatus?.error ? (
                                <p className="text-[#ef4444] text-[0.88rem]">{limitSwitchStatus.error}</p>
                            ) : !limitSwitchStatus ? (
                                <p className="text-[var(--text-tertiary)] text-[0.88rem]">Click Refresh to check limit switches.</p>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <div className={`flex items-center gap-2.5 py-2 px-3 rounded-lg text-[0.88rem] ${minOk ? 'bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.3)]' : 'bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.3)]'}`}>
                                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${minOk ? 'bg-[#10b981]' : 'bg-[#ef4444]'}`} />
                                        <span className="font-semibold text-[var(--text-primary)] min-w-[90px]">MIN switch</span>
                                        <span className="text-[var(--text-secondary)] font-mono text-[0.85rem] flex-1">{minOk ? `GPIO ${pinData.min_pin}` : 'Not configured'}</span>
                                        {minOk && (
                                            <span className={`text-[0.78rem] font-bold py-0.5 px-2 rounded-full tracking-wide ${motorData?.min ? 'bg-[#f59e0b] text-white' : 'bg-[rgba(16,185,129,0.15)] text-[#10b981] border border-[rgba(16,185,129,0.4)]'}`}>
                                                {motorData?.min ? 'TRIGGERED' : 'Open'}
                                            </span>
                                        )}
                                    </div>
                                    <div className={`flex items-center gap-2.5 py-2 px-3 rounded-lg text-[0.88rem] ${maxOk ? 'bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.3)]' : 'bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.3)]'}`}>
                                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${maxOk ? 'bg-[#10b981]' : 'bg-[#ef4444]'}`} />
                                        <span className="font-semibold text-[var(--text-primary)] min-w-[90px]">MAX switch</span>
                                        <span className="text-[var(--text-secondary)] font-mono text-[0.85rem] flex-1">{maxOk ? `GPIO ${pinData.max_pin}` : 'Not configured'}</span>
                                        {maxOk && (
                                            <span className={`text-[0.78rem] font-bold py-0.5 px-2 rounded-full tracking-wide ${motorData?.max ? 'bg-[#f59e0b] text-white' : 'bg-[rgba(16,185,129,0.15)] text-[#10b981] border border-[rgba(16,185,129,0.4)]'}`}>
                                                {motorData?.max ? 'TRIGGERED' : 'Open'}
                                            </span>
                                        )}
                                    </div>
                                    {bothOk ? (
                                        <p className="mt-2 text-[0.82rem] text-[#10b981]">Both limit switches configured. Press each switch by hand to verify it shows TRIGGERED.</p>
                                    ) : (
                                        <p className="mt-2 text-[0.82rem] text-[#f59e0b]">&#9888; One or both limit switches are not configured for this motor. Fix wiring before running the test.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })()}

                <div className="flex gap-[15px] mt-5">
                    {!driftTestRunning ? (
                        (() => {
                            const pinData = limitSwitchStatus?.pin_configuration?.[driftTestConfig.motor]
                            const bothOk  = pinData?.min_pin != null && pinData?.max_pin != null
                            return (
                                <button
                                    className="py-[15px] px-[30px] text-[1.1rem] font-semibold border-none rounded-[10px] cursor-pointer transition-all duration-200 bg-gradient-to-br from-[#10b981] to-[#059669] text-white flex-1 disabled:bg-gradient-to-br disabled:from-[#6b7280] disabled:to-[#4b5563] disabled:opacity-55 disabled:cursor-not-allowed"
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
                            className="py-[15px] px-[30px] text-[1.1rem] font-semibold border-none rounded-[10px] cursor-pointer transition-all duration-200 bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white flex-1"
                            onClick={stopDriftTest}
                        >
                            Stop Test
                        </button>
                    )}
                    <button
                        className="py-[15px] px-[30px] text-[1.1rem] font-semibold border-none rounded-[10px] cursor-pointer transition-all duration-200 bg-gradient-to-br from-[#6b7280] to-[#4b5563] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={clearDriftTestResults}
                        disabled={driftTestRunning}
                    >
                        Clear Results
                    </button>
                </div>
            </div>

            {/* Test Status */}
            {driftTestResults && (
                <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl p-5">
                    <h3 className="m-0 mb-[15px] text-[1.1rem] font-semibold text-[var(--text-primary)]">Test Status</h3>
                    <div className="flex flex-col gap-3">
                        {driftTestResults.motor_name && (
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-[var(--text-secondary)]">Motor:</span>
                                <span className="font-mono font-semibold py-1 px-3 rounded-md bg-[var(--bg-overlay)]">{driftTestResults.motor_name}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center">
                            <span className="font-semibold text-[var(--text-secondary)]">Status:</span>
                            <span className={`font-mono font-semibold py-1 px-3 rounded-md ${
                                driftTestResults.status === 'running' ? 'text-[#3b82f6] bg-[rgba(59,130,246,0.15)]' :
                                driftTestResults.status === 'completed' ? 'text-[#10b981] bg-[rgba(16,185,129,0.15)]' :
                                driftTestResults.status === 'stopped' ? 'text-[#f59e0b] bg-[rgba(245,158,11,0.15)]' :
                                driftTestResults.status === 'error' ? 'text-[#ef4444] bg-[rgba(239,68,68,0.15)]' :
                                'bg-[var(--bg-overlay)]'
                            }`}>
                                {driftTestResults.status?.toUpperCase()}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="font-semibold text-[var(--text-secondary)]">Progress:</span>
                            <span className="font-mono font-semibold py-1 px-3 rounded-md bg-[var(--bg-overlay)]">
                                {driftTestResults.current_cycle} / {driftTestResults.total_cycles} cycles
                            </span>
                        </div>
                        {driftTestResults.total_cycles > 0 && (
                            <div className="w-full h-2 bg-[var(--bg-overlay)] rounded overflow-hidden mt-1.5">
                                <div
                                    className="h-full bg-gradient-to-r from-[#3b82f6] to-[#10b981] rounded transition-[width] duration-300"
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
                <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl p-5">
                    <h3 className="m-0 mb-[15px] text-[1.1rem] font-semibold text-[var(--text-primary)]">Test Summary</h3>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-[15px]">
                        <div className="flex flex-col gap-1.5 p-3 bg-[var(--bg-overlay)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Total Cycles:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{driftTestResults.summary.total_cycles}</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[var(--bg-overlay)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Avg Forward Steps:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{driftTestResults.summary.avg_forward_steps}</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[var(--bg-overlay)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Avg Backward Steps:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{driftTestResults.summary.avg_backward_steps}</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[rgba(16,185,129,0.15)] border border-[rgba(16,185,129,0.3)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Avg Drift:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{driftTestResults.summary.avg_drift_mm} mm</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[var(--bg-overlay)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Max Drift:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{driftTestResults.summary.max_drift_mm} mm</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[var(--bg-overlay)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Min Drift:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{driftTestResults.summary.min_drift_mm} mm</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Cycle Data Table */}
            {driftTestResults?.cycles?.length > 0 && (
                <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl p-5">
                    <h3 className="m-0 mb-[15px] text-[1.1rem] font-semibold text-[var(--text-primary)]">Cycle Data</h3>
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                        <table className="w-full border-collapse text-[0.9rem]">
                            <thead>
                            <tr>
                                <th className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] bg-[var(--bg-overlay)] font-semibold text-[var(--text-primary)] sticky top-0">Cycle</th>
                                <th className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] bg-[var(--bg-overlay)] font-semibold text-[var(--text-primary)] sticky top-0">Forward Steps</th>
                                <th className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] bg-[var(--bg-overlay)] font-semibold text-[var(--text-primary)] sticky top-0">Backward Steps</th>
                                <th className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] bg-[var(--bg-overlay)] font-semibold text-[var(--text-primary)] sticky top-0">Difference</th>
                                <th className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] bg-[var(--bg-overlay)] font-semibold text-[var(--text-primary)] sticky top-0">Drift (mm)</th>
                            </tr>
                            </thead>
                            <tbody>
                            {driftTestResults.cycles.slice(-20).map((cycle, index) => (
                                <tr key={index} className="hover:bg-[var(--bg-overlay)]">
                                    <td className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] text-[var(--text-secondary)] font-mono">{cycle.cycle_number}</td>
                                    <td className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] text-[var(--text-secondary)] font-mono">{cycle.forward_steps}</td>
                                    <td className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] text-[var(--text-secondary)] font-mono">{cycle.backward_steps}</td>
                                    <td className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] text-[var(--text-secondary)] font-mono">{cycle.step_difference}</td>
                                    <td className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] text-[var(--text-secondary)] font-mono">{cycle.drift_mm}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                    {driftTestResults.cycles.length > 20 && (
                        <p className="mt-2.5 text-[0.85rem] text-[var(--text-tertiary)] italic text-center">Showing last 20 cycles of {driftTestResults.cycles.length}</p>
                    )}
                </div>
            )}
        </div>
    )
}
