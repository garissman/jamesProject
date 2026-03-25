import { useState, useEffect, useCallback, useRef } from 'react'
import { Line } from 'react-chartjs-2'
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    TimeScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js'
import 'chartjs-adapter-date-fns'

ChartJS.register(CategoryScale, LinearScale, TimeScale, PointElement, LineElement, Title, Tooltip, Legend)

// Compute inter-cycle deltas from raw step data (frontend fallback when backend doesn't provide them)
function withDeltas(cycles) {
    return cycles.map((c, i) => {
        if (c.fwd_delta != null) return c // backend already provided deltas
        if (i === 0) return { ...c, fwd_delta: null, bwd_delta: null }
        const prev = cycles[i - 1]
        return {
            ...c,
            fwd_delta: c.forward_steps - prev.forward_steps,
            bwd_delta: c.backward_steps - prev.backward_steps,
        }
    })
}

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

    const driftStatusPending = useRef(false)
    const fetchDriftTestStatus = useCallback(async () => {
        /* v8 ignore start */
        if (driftStatusPending.current) return
        /* v8 ignore stop */
        driftStatusPending.current = true
        try {
            const response = await fetch('/api/drift-test/status')
            const data = await response.json()
            if (data.status === 'success') {
                setDriftTestRunning(data.running)
                setDriftTestResults(data.data)
            }
        } catch (error) {
            console.error('Failed to fetch drift test status:', error)
        } finally {
            driftStatusPending.current = false
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

    const limitSwitchPending = useRef(false)
    const fetchLimitSwitches = useCallback(async () => {
        /* v8 ignore start */
        if (limitSwitchPending.current) return
        /* v8 ignore stop */
        limitSwitchPending.current = true
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
            limitSwitchPending.current = false
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
                        {driftTestResults.start_time && (
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-[var(--text-secondary)]">Start Time:</span>
                                <span className="font-mono font-semibold py-1 px-3 rounded-md bg-[var(--bg-overlay)] text-[0.85rem]">
                                    {new Date(driftTestResults.start_time).toLocaleString()}
                                </span>
                            </div>
                        )}
                        {driftTestResults.end_time && (
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-[var(--text-secondary)]">End Time:</span>
                                <span className="font-mono font-semibold py-1 px-3 rounded-md bg-[var(--bg-overlay)] text-[0.85rem]">
                                    {new Date(driftTestResults.end_time).toLocaleString()}
                                </span>
                            </div>
                        )}
                        {driftTestResults.error && (
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-[#ef4444]">Error:</span>
                                <span className="font-mono font-semibold py-1 px-3 rounded-md bg-[rgba(239,68,68,0.15)] text-[#ef4444] text-[0.85rem]">
                                    {driftTestResults.error}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Test Summary — computed live from cycle data */}
            {driftTestResults?.cycles?.length > 0 && (() => {
                const c = withDeltas(driftTestResults.cycles)
                const n = c.length
                const avg = (arr) => (arr.reduce((a, b) => a + b, 0) / n).toFixed(2)
                const sum = (arr) => arr.reduce((a, b) => a + b, 0).toFixed(2)
                const s = driftTestResults.summary || {}
                const avgFwdSteps = s.avg_forward_steps ?? Math.round(c.reduce((a, x) => a + x.forward_steps, 0) / n * 10) / 10
                const avgBwdSteps = s.avg_backward_steps ?? Math.round(c.reduce((a, x) => a + x.backward_steps, 0) / n * 10) / 10
                const drifts = c.map(x => x.drift_mm)
                const avgDrift = s.avg_drift_mm ?? +(drifts.reduce((a, b) => a + b, 0) / n).toFixed(3)
                const maxDrift = s.max_drift_mm ?? +Math.max(...drifts).toFixed(3)
                const minDrift = s.min_drift_mm ?? +Math.min(...drifts).toFixed(3)
                const avgFwdTime = avg(c.map(x => x.forward_time))
                const avgBwdTime = avg(c.map(x => x.backward_time))
                const avgCycleTime = avg(c.map(x => x.total_cycle_time))
                const totalTime = sum(c.map(x => x.total_cycle_time))
                /* v8 ignore start */
                const fwdDeltas = n > 1 ? c.slice(1).map(x => Math.abs(x.fwd_delta ?? 0)) : [0]
                const bwdDeltas = n > 1 ? c.slice(1).map(x => Math.abs(x.bwd_delta ?? 0)) : [0]
                /* v8 ignore stop */
                const avgFwdDelta = (fwdDeltas.reduce((a, b) => a + b, 0) / fwdDeltas.length).toFixed(1)
                const maxFwdDelta = Math.max(...fwdDeltas)
                const avgBwdDelta = (bwdDeltas.reduce((a, b) => a + b, 0) / bwdDeltas.length).toFixed(1)
                const maxBwdDelta = Math.max(...bwdDeltas)

                return (
                <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl p-5">
                    <h3 className="m-0 mb-[15px] text-[1.1rem] font-semibold text-[var(--text-primary)]">
                        Test Summary {driftTestRunning && <span className="text-[0.85rem] font-normal text-[var(--text-tertiary)]">(live)</span>}
                    </h3>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-[15px]">
                        <div className="flex flex-col gap-1.5 p-3 bg-[var(--bg-overlay)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Total Cycles:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{n}</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[var(--bg-overlay)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Avg Forward Steps:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{avgFwdSteps}</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[var(--bg-overlay)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Avg Backward Steps:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{avgBwdSteps}</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[rgba(16,185,129,0.15)] border border-[rgba(16,185,129,0.3)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Avg Drift:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{avgDrift} mm</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[var(--bg-overlay)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Max Drift:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{maxDrift} mm</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[var(--bg-overlay)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Min Drift:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{minDrift} mm</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[rgba(59,130,246,0.15)] border border-[rgba(59,130,246,0.3)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Avg Forward Time:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{avgFwdTime} s</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[rgba(59,130,246,0.15)] border border-[rgba(59,130,246,0.3)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Avg Backward Time:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{avgBwdTime} s</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[rgba(59,130,246,0.15)] border border-[rgba(59,130,246,0.3)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Avg Cycle Time:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{avgCycleTime} s</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[rgba(59,130,246,0.15)] border border-[rgba(59,130,246,0.3)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Total Test Time:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{totalTime} s</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Avg Fwd Delta:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{avgFwdDelta} steps</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Max Fwd Delta:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{maxFwdDelta} steps</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Avg Bwd Delta:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{avgBwdDelta} steps</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] rounded-lg">
                            <span className="text-[0.85rem] text-[var(--text-tertiary)]">Max Bwd Delta:</span>
                            <span className="text-[1.2rem] font-bold font-mono text-[var(--text-primary)]">{maxBwdDelta} steps</span>
                        </div>
                    </div>
                </div>
                )
            })()}

            {/* Cycle Data Table */}
            {driftTestResults?.cycles?.length > 0 && (
                <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl p-5">
                    <h3 className="m-0 mb-[15px] text-[1.1rem] font-semibold text-[var(--text-primary)]">Cycle Data</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-[0.9rem]">
                            <thead>
                            <tr>
                                <th className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] bg-[var(--bg-overlay)] font-semibold text-[var(--text-primary)]">Cycle</th>
                                <th className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] bg-[var(--bg-overlay)] font-semibold text-[var(--text-primary)]">Timestamp</th>
                                <th className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] bg-[var(--bg-overlay)] font-semibold text-[var(--text-primary)]">Fwd Steps</th>
                                <th className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] bg-[var(--bg-overlay)] font-semibold text-[var(--text-primary)]">Fwd Time (s)</th>
                                <th className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] bg-[var(--bg-overlay)] font-semibold text-[var(--text-primary)]">Bwd Steps</th>
                                <th className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] bg-[var(--bg-overlay)] font-semibold text-[var(--text-primary)]">Bwd Time (s)</th>
                                <th className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] bg-[var(--bg-overlay)] font-semibold text-[var(--text-primary)]">Cycle Time (s)</th>
                                <th className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] bg-[var(--bg-overlay)] font-semibold text-[var(--text-primary)]">Difference</th>
                                <th className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] bg-[var(--bg-overlay)] font-semibold text-[var(--text-primary)]">Drift (mm)</th>
                                <th className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] bg-[var(--bg-overlay)] font-semibold text-[var(--text-primary)]">Fwd &Delta;</th>
                                <th className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] bg-[var(--bg-overlay)] font-semibold text-[var(--text-primary)]">Bwd &Delta;</th>
                            </tr>
                            </thead>
                            <tbody>
                            {withDeltas(driftTestResults.cycles).map((cycle, index) => (
                                <tr key={index} className="hover:bg-[var(--bg-overlay)]">
                                    <td className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] text-[var(--text-secondary)] font-mono">{cycle.cycle_number}</td>
                                    <td className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] text-[var(--text-secondary)] font-mono text-[0.8rem]">{cycle.timestamp ? new Date(cycle.timestamp).toLocaleTimeString() : '-'}</td>
                                    <td className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] text-[var(--text-secondary)] font-mono">{cycle.forward_steps}</td>
                                    <td className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] text-[var(--text-secondary)] font-mono">{cycle.forward_time}</td>
                                    <td className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] text-[var(--text-secondary)] font-mono">{cycle.backward_steps}</td>
                                    <td className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] text-[var(--text-secondary)] font-mono">{cycle.backward_time}</td>
                                    <td className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] text-[var(--text-secondary)] font-mono">{cycle.total_cycle_time}</td>
                                    <td className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] text-[var(--text-secondary)] font-mono">{cycle.step_difference}</td>
                                    <td className="py-2.5 px-[15px] text-center border-b border-[var(--border-color)] text-[var(--text-secondary)] font-mono">{cycle.drift_mm}</td>
                                    <td className={`py-2.5 px-[15px] text-center border-b border-[var(--border-color)] font-mono ${cycle.fwd_delta != null && cycle.fwd_delta !== 0 ? (cycle.fwd_delta > 0 ? 'text-[#10b981]' : 'text-[#ef4444]') : 'text-[var(--text-tertiary)]'}`}>{cycle.fwd_delta != null ? (cycle.fwd_delta > 0 ? '+' : '') + cycle.fwd_delta : '—'}</td>
                                    <td className={`py-2.5 px-[15px] text-center border-b border-[var(--border-color)] font-mono ${cycle.bwd_delta != null && cycle.bwd_delta !== 0 ? (cycle.bwd_delta > 0 ? 'text-[#10b981]' : 'text-[#ef4444]') : 'text-[var(--text-tertiary)]'}`}>{cycle.bwd_delta != null ? (cycle.bwd_delta > 0 ? '+' : '') + cycle.bwd_delta : '—'}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Charts by Cycle */}
            {driftTestResults?.cycles?.length > 1 && (() => {
                const cycles = withDeltas(driftTestResults.cycles)
                const labels = cycles.map(c => c.cycle_number)
                const cycleOpts = (yLabel) => ({
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: 'var(--text-secondary)', usePointStyle: true, padding: 15 } },
                        title: { display: false },
                        tooltip: { mode: 'index', intersect: false },
                    },
                    scales: {
                        x: { title: { display: true, text: 'Cycle', color: 'var(--text-tertiary)' }, ticks: { color: 'var(--text-tertiary)' }, grid: { color: 'var(--border-color)' } },
                        y: { title: { display: true, text: yLabel, color: 'var(--text-tertiary)' }, ticks: { color: 'var(--text-tertiary)' }, grid: { color: 'var(--border-color)' } },
                    },
                    interaction: { mode: 'nearest', axis: 'x', intersect: false },
                })

                return (
                    <>
                        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl p-5">
                            <h3 className="m-0 mb-[15px] text-[1.1rem] font-semibold text-[var(--text-primary)]">Steps per Cycle</h3>
                            <div style={{ height: '300px' }}>
                                <Line options={cycleOpts('Steps')} data={{
                                    labels,
                                    datasets: [
                                        { label: 'Forward Steps', data: cycles.map(c => c.forward_steps), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', tension: 0.3, pointRadius: 3 },
                                        { label: 'Backward Steps', data: cycles.map(c => c.backward_steps), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.3, pointRadius: 3 },
                                    ],
                                }} />
                            </div>
                        </div>

                        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl p-5">
                            <h3 className="m-0 mb-[15px] text-[1.1rem] font-semibold text-[var(--text-primary)]">Drift per Cycle</h3>
                            <div style={{ height: '300px' }}>
                                <Line options={cycleOpts('mm')} data={{
                                    labels,
                                    datasets: [
                                        { label: 'Drift (mm)', data: cycles.map(c => c.drift_mm), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', tension: 0.3, pointRadius: 3, fill: true },
                                    ],
                                }} />
                            </div>
                        </div>

                        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl p-5">
                            <h3 className="m-0 mb-[15px] text-[1.1rem] font-semibold text-[var(--text-primary)]">Time per Cycle</h3>
                            <div style={{ height: '300px' }}>
                                <Line options={cycleOpts('Seconds')} data={{
                                    labels,
                                    datasets: [
                                        { label: 'Forward Time', data: cycles.map(c => c.forward_time), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', tension: 0.3, pointRadius: 3 },
                                        { label: 'Backward Time', data: cycles.map(c => c.backward_time), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.3, pointRadius: 3 },
                                        { label: 'Cycle Time', data: cycles.map(c => c.total_cycle_time), borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)', tension: 0.3, pointRadius: 3 },
                                    ],
                                }} />
                            </div>
                        </div>
                        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl p-5">
                            <h3 className="m-0 mb-[15px] text-[1.1rem] font-semibold text-[var(--text-primary)]">Running Average Time</h3>
                            <div style={{ height: '300px' }}>
                                <Line options={cycleOpts('Seconds')} data={{
                                    labels,
                                    datasets: (() => {
                                        let fwdSum = 0, bwdSum = 0, cycleSum = 0
                                        const avgFwd = [], avgBwd = [], avgCycle = []
                                        cycles.forEach((c, i) => {
                                            fwdSum += c.forward_time; bwdSum += c.backward_time; cycleSum += c.total_cycle_time
                                            avgFwd.push(+(fwdSum / (i + 1)).toFixed(2))
                                            avgBwd.push(+(bwdSum / (i + 1)).toFixed(2))
                                            avgCycle.push(+(cycleSum / (i + 1)).toFixed(2))
                                        })
                                        return [
                                            { label: 'Avg Forward Time', data: avgFwd, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', tension: 0.3, pointRadius: 3 },
                                            { label: 'Avg Backward Time', data: avgBwd, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.3, pointRadius: 3 },
                                            { label: 'Avg Cycle Time', data: avgCycle, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)', tension: 0.3, pointRadius: 3 },
                                        ]
                                    })(),
                                }} />
                            </div>
                        </div>

                        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl p-5">
                            <h3 className="m-0 mb-[15px] text-[1.1rem] font-semibold text-[var(--text-primary)]">Inter-Cycle Step Delta</h3>
                            <div style={{ height: '300px' }}>
                                <Line options={cycleOpts('Steps')} data={{
                                    labels,
                                    datasets: [
                                        { label: 'Fwd Delta', data: cycles.map(c => c.fwd_delta ?? 0), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', tension: 0.3, pointRadius: 3 },
                                        { label: 'Bwd Delta', data: cycles.map(c => c.bwd_delta ?? 0), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', tension: 0.3, pointRadius: 3 },
                                    ],
                                }} />
                            </div>
                        </div>
                    </>
                )
            })()}

            {/* Charts by Timestamp */}
            {driftTestResults?.cycles?.length > 1 && (() => {
                const cycles = driftTestResults.cycles
                const hasTimestamps = cycles.every(c => c.timestamp)
                if (!hasTimestamps) return null

                const timeOpts = (yLabel) => ({
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: 'var(--text-secondary)', usePointStyle: true, padding: 15 } },
                        title: { display: false },
                        tooltip: { mode: 'index', intersect: false },
                    },
                    scales: {
                        x: {
                            type: 'time',
                            time: { unit: 'second', displayFormats: { second: 'HH:mm:ss' }, tooltipFormat: 'HH:mm:ss' },
                            title: { display: true, text: 'Time', color: 'var(--text-tertiary)' },
                            ticks: { color: 'var(--text-tertiary)', maxRotation: 45 },
                            grid: { color: 'var(--border-color)' },
                        },
                        y: { title: { display: true, text: yLabel, color: 'var(--text-tertiary)' }, ticks: { color: 'var(--text-tertiary)' }, grid: { color: 'var(--border-color)' } },
                    },
                    interaction: { mode: 'nearest', axis: 'x', intersect: false },
                })

                const timeData = (values, color, fill = false) => values.map((v, i) => ({ x: new Date(cycles[i].timestamp), y: v }))

                return (
                    <>
                        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl p-5">
                            <h3 className="m-0 mb-[15px] text-[1.1rem] font-semibold text-[var(--text-primary)]">Drift over Time</h3>
                            <div style={{ height: '300px' }}>
                                <Line options={timeOpts('mm')} data={{
                                    datasets: [
                                        { label: 'Drift (mm)', data: timeData(cycles.map(c => c.drift_mm)), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', tension: 0.3, pointRadius: 3, fill: true },
                                    ],
                                }} />
                            </div>
                        </div>

                        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl p-5">
                            <h3 className="m-0 mb-[15px] text-[1.1rem] font-semibold text-[var(--text-primary)]">Step Difference over Time</h3>
                            <div style={{ height: '300px' }}>
                                <Line options={timeOpts('Steps')} data={{
                                    datasets: [
                                        { label: 'Step Difference', data: timeData(cycles.map(c => c.step_difference)), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', tension: 0.3, pointRadius: 3, fill: true },
                                    ],
                                }} />
                            </div>
                        </div>
                    </>
                )
            })()}
        </div>
    )
}
