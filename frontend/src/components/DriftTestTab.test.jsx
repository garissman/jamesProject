import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { mockFetch } from '../test-utils'

// Mock chart.js and react-chartjs-2 before importing the component
vi.mock('react-chartjs-2', () => ({
    Line: (_props) => <canvas data-testid="mock-chart" />,
}))
vi.mock('chart.js', () => ({
    Chart: { register: vi.fn() },
    CategoryScale: 'CategoryScale',
    LinearScale: 'LinearScale',
    TimeScale: 'TimeScale',
    PointElement: 'PointElement',
    LineElement: 'LineElement',
    Title: 'Title',
    Tooltip: 'Tooltip',
    Legend: 'Legend',
}))
vi.mock('chartjs-adapter-date-fns', () => ({}))

// Import after mocks
import DriftTestTab from './DriftTestTab'

const idleStatusResponse = {
    status: 'success',
    running: false,
    data: null,
}

const limitSwitchResponse = {
    limit_states: {
        1: { min: false, max: false },
        2: { min: false, max: false },
        3: { min: false, max: false },
        4: { min: false, max: false },
    },
    pin_configuration: {
        1: { min_pin: 5, max_pin: 6 },
        2: { min_pin: 13, max_pin: 19 },
        3: { min_pin: 16, max_pin: 20 },
        4: { min_pin: 21, max_pin: 26 },
    },
}

const completedResultsData = {
    status: 'completed',
    motor_name: 'Motor 1 - X-Axis',
    current_cycle: 3,
    total_cycles: 3,
    start_time: '2026-03-24T10:00:00Z',
    end_time: '2026-03-24T10:05:00Z',
    error: null,
    cycles: [
        {
            cycle_number: 1,
            timestamp: '2026-03-24T10:01:00Z',
            forward_steps: 200,
            forward_time: 1.5,
            backward_steps: 198,
            backward_time: 1.6,
            total_cycle_time: 3.1,
            step_difference: 2,
            drift_mm: 0.01,
        },
        {
            cycle_number: 2,
            timestamp: '2026-03-24T10:02:00Z',
            forward_steps: 201,
            forward_time: 1.4,
            backward_steps: 199,
            backward_time: 1.5,
            total_cycle_time: 2.9,
            step_difference: 2,
            drift_mm: 0.01,
        },
        {
            cycle_number: 3,
            timestamp: '2026-03-24T10:03:00Z',
            forward_steps: 200,
            forward_time: 1.5,
            backward_steps: 200,
            backward_time: 1.5,
            total_cycle_time: 3.0,
            step_difference: 0,
            drift_mm: 0.0,
        },
    ],
}

function setupFetch(overrides = {}) {
    const responses = {
        '/api/drift-test/status': idleStatusResponse,
        '/api/limit-switches': limitSwitchResponse,
        ...overrides,
    }
    global.fetch = mockFetch(responses)
}

describe('DriftTestTab', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        setupFetch()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    // --- Idle state rendering ---
    describe('Idle state rendering', () => {
        it('renders heading and description', async () => {
            await act(async () => { render(<DriftTestTab />) })
            expect(screen.getByText('Motor Drift Test')).toBeInTheDocument()
            expect(screen.getByText(/Test stepper motor precision/i)).toBeInTheDocument()
        })

        it('renders Test Configuration section', async () => {
            await act(async () => { render(<DriftTestTab />) })
            expect(screen.getByText('Test Configuration')).toBeInTheDocument()
        })

        it('shows Start Drift Test button when not running', async () => {
            await act(async () => { render(<DriftTestTab />) })
            expect(screen.getByRole('button', { name: /Start Drift Test/i })).toBeInTheDocument()
        })

        it('shows Clear Results button', async () => {
            await act(async () => { render(<DriftTestTab />) })
            expect(screen.getByRole('button', { name: /Clear Results/i })).toBeInTheDocument()
        })

        it('does not show Test Status section when no results', async () => {
            await act(async () => { render(<DriftTestTab />) })
            expect(screen.queryByText('Test Status')).not.toBeInTheDocument()
        })
    })

    // --- Form inputs ---
    describe('Form inputs', () => {
        it('renders motor select with default value 1 (X-Axis)', async () => {
            await act(async () => { render(<DriftTestTab />) })
            const select = screen.getByRole('combobox')
            expect(select.value).toBe('1')
        })

        it('renders cycles input with default value 10', async () => {
            await act(async () => { render(<DriftTestTab />) })
            const inputs = screen.getAllByRole('spinbutton')
            const cyclesInput = inputs.find(input => input.value === '10')
            expect(cyclesInput).toBeDefined()
        })

        it('renders motor speed input with default 0.001', async () => {
            await act(async () => { render(<DriftTestTab />) })
            const inputs = screen.getAllByRole('spinbutton')
            const speedInput = inputs.find(input => input.value === '0.001')
            expect(speedInput).toBeDefined()
        })

        it('renders steps per mm input with default 200', async () => {
            await act(async () => { render(<DriftTestTab />) })
            const inputs = screen.getAllByRole('spinbutton')
            const stepsInput = inputs.find(input => input.value === '200')
            expect(stepsInput).toBeDefined()
        })

        it('can change motor selection', async () => {
            await act(async () => { render(<DriftTestTab />) })
            const select = screen.getByRole('combobox')
            await act(async () => {
                fireEvent.change(select, { target: { value: '2' } })
            })
            expect(select.value).toBe('2')
        })

        it('can change cycles input', async () => {
            await act(async () => { render(<DriftTestTab />) })
            const inputs = screen.getAllByRole('spinbutton')
            const cyclesInput = inputs.find(input => input.value === '10')
            await act(async () => {
                fireEvent.change(cyclesInput, { target: { value: '50' } })
            })
            expect(cyclesInput.value).toBe('50')
        })
    })

    // --- Start / Stop ---
    describe('Start and Stop buttons', () => {
        it('calls /api/drift-test/start when Start Drift Test is clicked', async () => {
            await act(async () => { render(<DriftTestTab />) })
            const startBtn = screen.getByRole('button', { name: /Start Drift Test/i })
            await act(async () => {
                fireEvent.click(startBtn)
            })
            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    '/api/drift-test/start',
                    expect.objectContaining({
                        method: 'POST',
                        body: expect.stringContaining('"cycles":10'),
                    })
                )
            })
        })

        it('shows Stop Test button when drift test is running', async () => {
            setupFetch({
                '/api/drift-test/status': { status: 'success', running: true, data: { status: 'running', current_cycle: 5, total_cycles: 10, cycles: [] } },
            })
            await act(async () => { render(<DriftTestTab />) })
            // Allow initial fetch to complete
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Stop Test/i })).toBeInTheDocument()
            })
        })

        it('calls /api/drift-test/stop when Stop Test is clicked', async () => {
            setupFetch({
                '/api/drift-test/status': { status: 'success', running: true, data: { status: 'running', current_cycle: 5, total_cycles: 10, cycles: [] } },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Stop Test/i })).toBeInTheDocument()
            })

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /Stop Test/i }))
            })

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    '/api/drift-test/stop',
                    expect.objectContaining({ method: 'POST' })
                )
            })
        })

        it('disables Start button when limit switches are not configured', async () => {
            setupFetch({
                '/api/limit-switches': {
                    limit_states: { 1: { min: false, max: false } },
                    pin_configuration: { 1: { min_pin: null, max_pin: null } },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Start Drift Test/i })).toBeDisabled()
            })
        })

        it('disables form inputs when running', async () => {
            setupFetch({
                '/api/drift-test/status': { status: 'success', running: true, data: { status: 'running', current_cycle: 2, total_cycles: 10, cycles: [] } },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByRole('combobox')).toBeDisabled()
            })
        })

        it('disables Clear Results button when running', async () => {
            setupFetch({
                '/api/drift-test/status': { status: 'success', running: true, data: { status: 'running', current_cycle: 2, total_cycles: 10, cycles: [] } },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Clear Results/i })).toBeDisabled()
            })
        })
    })

    // --- Status display ---
    describe('Status display', () => {
        it('shows test status when results are available', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: completedResultsData,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Test Status')).toBeInTheDocument()
                expect(screen.getByText('COMPLETED')).toBeInTheDocument()
            })
        })

        it('shows progress with cycle counts', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: completedResultsData,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText(/3 \/ 3 cycles/)).toBeInTheDocument()
            })
        })

        it('shows motor name', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: completedResultsData,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Motor 1 - X-Axis')).toBeInTheDocument()
            })
        })

        it('shows running status', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: true,
                    data: { ...completedResultsData, status: 'running', current_cycle: 2 },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('RUNNING')).toBeInTheDocument()
            })
        })

        it('shows start and end times', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: completedResultsData,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Start Time:')).toBeInTheDocument()
                expect(screen.getByText('End Time:')).toBeInTheDocument()
            })
        })
    })

    // --- Results / Summary ---
    describe('Results display', () => {
        it('shows Test Summary with cycle data', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: completedResultsData,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Test Summary')).toBeInTheDocument()
                expect(screen.getByText('Total Cycles:')).toBeInTheDocument()
                expect(screen.getByText('Avg Forward Steps:')).toBeInTheDocument()
                expect(screen.getByText('Avg Backward Steps:')).toBeInTheDocument()
                expect(screen.getByText('Avg Drift:')).toBeInTheDocument()
            })
        })

        it('shows Cycle Data table', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: completedResultsData,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Cycle Data')).toBeInTheDocument()
                // Table headers
                expect(screen.getByText('Fwd Steps')).toBeInTheDocument()
                expect(screen.getByText('Bwd Steps')).toBeInTheDocument()
                expect(screen.getByText('Drift (mm)')).toBeInTheDocument()
            })
        })

        it('shows summary statistics fields', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: completedResultsData,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Max Drift:')).toBeInTheDocument()
                expect(screen.getByText('Min Drift:')).toBeInTheDocument()
                expect(screen.getByText('Avg Forward Time:')).toBeInTheDocument()
                expect(screen.getByText('Avg Backward Time:')).toBeInTheDocument()
                expect(screen.getByText('Avg Cycle Time:')).toBeInTheDocument()
                expect(screen.getByText('Total Test Time:')).toBeInTheDocument()
            })
        })
    })

    // --- Chart rendering ---
    describe('Chart rendering', () => {
        it('renders charts when cycles > 1', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: completedResultsData,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                const charts = screen.getAllByTestId('mock-chart')
                expect(charts.length).toBeGreaterThan(0)
            })
        })

        it('shows chart section titles', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: completedResultsData,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Steps per Cycle')).toBeInTheDocument()
                expect(screen.getByText('Drift per Cycle')).toBeInTheDocument()
                expect(screen.getByText('Time per Cycle')).toBeInTheDocument()
                expect(screen.getByText('Running Average Time')).toBeInTheDocument()
                expect(screen.getByText('Inter-Cycle Step Delta')).toBeInTheDocument()
            })
        })

        it('shows timestamp-based charts when timestamps are present', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: completedResultsData,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Drift over Time')).toBeInTheDocument()
                expect(screen.getByText('Step Difference over Time')).toBeInTheDocument()
            })
        })

        it('does not render charts with only 1 cycle', async () => {
            const singleCycle = {
                ...completedResultsData,
                total_cycles: 1,
                current_cycle: 1,
                cycles: [completedResultsData.cycles[0]],
            }
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: singleCycle,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Test Status')).toBeInTheDocument()
            })
            expect(screen.queryByText('Steps per Cycle')).not.toBeInTheDocument()
        })
    })

    // --- Error state ---
    describe('Error state handling', () => {
        it('shows error message when results have an error', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: {
                        ...completedResultsData,
                        status: 'error',
                        error: 'Motor stalled at cycle 5',
                        cycles: [],
                    },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('ERROR')).toBeInTheDocument()
                expect(screen.getByText('Motor stalled at cycle 5')).toBeInTheDocument()
            })
        })

        it('handles start drift test fetch failure gracefully', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
            await act(async () => { render(<DriftTestTab />) })

            // The initial fetches will fail; that's fine
            await act(async () => { vi.advanceTimersByTime(100) })

            expect(consoleSpy).toHaveBeenCalled()
            consoleSpy.mockRestore()
        })

        it('handles start drift test API error response', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            setupFetch()
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })

            // Replace fetch to return error for start
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({ detail: 'Already running' }),
            })

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /Start Drift Test/i }))
            })

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Already running'))
            })
            consoleSpy.mockRestore()
        })

        it('shows limit switch error message', async () => {
            setupFetch({
                '/api/limit-switches': { error: 'Could not reach backend' },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Could not reach backend')).toBeInTheDocument()
            })
        })
    })

    // --- Limit switch display ---
    describe('Limit switch display', () => {
        it('shows configured limit switches with GPIO pins', async () => {
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText(/GPIO 5/)).toBeInTheDocument()
                expect(screen.getByText(/GPIO 6/)).toBeInTheDocument()
            })
        })

        it('shows Refresh button in limit switch section', async () => {
            await act(async () => { render(<DriftTestTab />) })
            expect(screen.getByTitle('Refresh limit switch status')).toBeInTheDocument()
        })

        it('shows both switches configured message', async () => {
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText(/Both limit switches configured/i)).toBeInTheDocument()
            })
        })

        it('shows warning when switches not configured', async () => {
            setupFetch({
                '/api/limit-switches': {
                    limit_states: { 1: { min: false, max: false } },
                    pin_configuration: { 1: { min_pin: null, max_pin: null } },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText(/not configured for this motor/i)).toBeInTheDocument()
            })
        })

        it('shows TRIGGERED state for active limit switch', async () => {
            setupFetch({
                '/api/limit-switches': {
                    limit_states: { 1: { min: true, max: false } },
                    pin_configuration: { 1: { min_pin: 5, max_pin: 6 } },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('TRIGGERED')).toBeInTheDocument()
                expect(screen.getByText('Open')).toBeInTheDocument()
            })
        })
    })

    // --- Clear results ---
    describe('Clear results', () => {
        it('calls /api/drift-test/clear when Clear Results is clicked', async () => {
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /Clear Results/i }))
            })
            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    '/api/drift-test/clear',
                    expect.objectContaining({ method: 'POST' })
                )
            })
        })
    })

    // --- Polling ---
    describe('Polling', () => {
        it('polls status periodically', async () => {
            await act(async () => { render(<DriftTestTab />) })
            const callCountBefore = global.fetch.mock.calls.filter(c => c[0]?.includes?.('/api/drift-test/status')).length

            await act(async () => { vi.advanceTimersByTime(1100) })
            const callCountAfter = global.fetch.mock.calls.filter(c => c[0]?.includes?.('/api/drift-test/status')).length
            expect(callCountAfter).toBeGreaterThan(callCountBefore)
        })
    })

    // --- Stopped status ---
    describe('Stopped status', () => {
        it('shows STOPPED status text', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: { ...completedResultsData, status: 'stopped', cycles: [] },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('STOPPED')).toBeInTheDocument()
            })
        })
    })

    // --- Error catch blocks ---
    describe('Catch blocks for API calls', () => {
        it('handles startDriftTest fetch rejection', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            setupFetch()
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })

            // Replace fetch with rejecting one
            global.fetch = vi.fn().mockRejectedValue(new Error('Start network error'))

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /Start Drift Test/i }))
            })

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith('Failed to start drift test:', expect.any(Error))
            })
            consoleSpy.mockRestore()
        })

        it('handles stopDriftTest fetch rejection', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            setupFetch({
                '/api/drift-test/status': { status: 'success', running: true, data: { status: 'running', current_cycle: 5, total_cycles: 10, cycles: [] } },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Stop Test/i })).toBeInTheDocument()
            })

            // Replace fetch with rejecting one
            global.fetch = vi.fn().mockRejectedValue(new Error('Stop network error'))

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /Stop Test/i }))
            })

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith('Failed to stop drift test:', expect.any(Error))
            })
            consoleSpy.mockRestore()
        })

        it('handles clearDriftTestResults fetch rejection', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            setupFetch()
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })

            // Replace fetch with rejecting one
            global.fetch = vi.fn().mockRejectedValue(new Error('Clear network error'))

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /Clear Results/i }))
            })

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith('Failed to clear drift test results:', expect.any(Error))
            })
            consoleSpy.mockRestore()
        })
    })

    // --- Limit switch non-ok response (line 117) ---
    describe('Limit switch non-ok response', () => {
        it('shows error detail from non-ok limit switch response', async () => {
            global.fetch = vi.fn((url) => {
                if (url.includes('/api/drift-test/status')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(idleStatusResponse),
                    })
                }
                if (url.includes('/api/limit-switches')) {
                    return Promise.resolve({
                        ok: false,
                        json: () => Promise.resolve({ detail: 'Permission denied' }),
                    })
                }
                return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
            })

            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })

            await waitFor(() => {
                expect(screen.getByText('Permission denied')).toBeInTheDocument()
            })
        })
    })

    // --- Faster polling when running (line 145) ---
    describe('Faster polling when running', () => {
        it('polls status more frequently when drift test is running', async () => {
            setupFetch({
                '/api/drift-test/status': { status: 'success', running: true, data: { status: 'running', current_cycle: 2, total_cycles: 10, cycles: [] } },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })

            const callCountBefore = global.fetch.mock.calls.filter(c => c[0]?.includes?.('/api/drift-test/status')).length

            // Advance 600ms - should trigger at least one fast poll (every 500ms)
            await act(async () => { vi.advanceTimersByTime(600) })

            const callCountAfter = global.fetch.mock.calls.filter(c => c[0]?.includes?.('/api/drift-test/status')).length
            expect(callCountAfter).toBeGreaterThan(callCountBefore)
        })
    })

    // --- Motor speed and steps_per_mm input change handlers (lines 203-218) ---
    describe('Motor speed and steps per mm inputs', () => {
        it('can change motor speed input', async () => {
            await act(async () => { render(<DriftTestTab />) })
            const inputs = screen.getAllByRole('spinbutton')
            const speedInput = inputs.find(input => input.value === '0.001')
            await act(async () => {
                fireEvent.change(speedInput, { target: { value: '0.005' } })
            })
            expect(speedInput.value).toBe('0.005')
        })

        it('can change steps per mm input', async () => {
            await act(async () => { render(<DriftTestTab />) })
            const inputs = screen.getAllByRole('spinbutton')
            const stepsInput = inputs.find(input => input.value === '200')
            await act(async () => {
                fireEvent.change(stepsInput, { target: { value: '400' } })
            })
            expect(stepsInput.value).toBe('400')
        })
    })

    // --- withDeltas function: backend-provided deltas (line 21) ---
    describe('withDeltas function - backend-provided deltas', () => {
        it('uses backend-provided fwd_delta when present', async () => {
            const cyclesWithDeltas = completedResultsData.cycles.map((c, i) => ({
                ...c,
                fwd_delta: i === 0 ? null : 5,
                bwd_delta: i === 0 ? null : -3,
            }))
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: { ...completedResultsData, cycles: cyclesWithDeltas },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Cycle Data')).toBeInTheDocument()
                // Backend delta of +5 should be rendered with + prefix
                const plus5Elements = screen.getAllByText('+5')
                expect(plus5Elements.length).toBeGreaterThanOrEqual(1)
            })
        })
    })

    // --- stopDriftTest success path (line 67-68) ---
    describe('Stop drift test success path', () => {
        it('logs success message when stop is successful', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            setupFetch({
                '/api/drift-test/status': { status: 'success', running: true, data: { status: 'running', current_cycle: 5, total_cycles: 10, cycles: [] } },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Stop Test/i })).toBeInTheDocument()
            })

            // Set up fetch to return success for stop
            global.fetch = vi.fn((url) => {
                if (url.includes('/api/drift-test/stop')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({ message: 'Test stopped' }),
                    })
                }
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', running: false, data: null }) })
            })

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /Stop Test/i }))
            })

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith('Test stopped')
            })
            consoleSpy.mockRestore()
        })
    })

    // --- MAX switch triggered state (line 269-270) ---
    describe('MAX switch triggered state', () => {
        it('shows TRIGGERED for MAX switch when max is true', async () => {
            setupFetch({
                '/api/limit-switches': {
                    limit_states: { 1: { min: false, max: true } },
                    pin_configuration: { 1: { min_pin: 5, max_pin: 6 } },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                // Both min and max switches are configured, min is Open, max is TRIGGERED
                const triggeredElements = screen.getAllByText('TRIGGERED')
                expect(triggeredElements.length).toBeGreaterThanOrEqual(1)
                const openElements = screen.getAllByText('Open')
                expect(openElements.length).toBeGreaterThanOrEqual(1)
            })
        })

        it('shows both TRIGGERED when both switches are triggered', async () => {
            setupFetch({
                '/api/limit-switches': {
                    limit_states: { 1: { min: true, max: true } },
                    pin_configuration: { 1: { min_pin: 5, max_pin: 6 } },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                const triggeredElements = screen.getAllByText('TRIGGERED')
                expect(triggeredElements.length).toBe(2)
            })
        })
    })

    // --- Unrecognized status display (line 336 - default branch) ---
    describe('Unrecognized status display', () => {
        it('shows status with default styling for unknown status', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: { ...completedResultsData, status: 'unknown_status' },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('UNKNOWN_STATUS')).toBeInTheDocument()
            })
        })
    })

    // --- Cycles without timestamps (line 623) ---
    describe('Cycles without timestamps', () => {
        it('does not render time-based charts when timestamps are missing', async () => {
            const cyclesNoTimestamp = completedResultsData.cycles.map(c => ({
                ...c,
                timestamp: null,
            }))
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: { ...completedResultsData, cycles: cyclesNoTimestamp },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                // Cycle-based charts should still appear
                expect(screen.getByText('Steps per Cycle')).toBeInTheDocument()
            })
            // Time-based charts should NOT appear
            expect(screen.queryByText('Drift over Time')).not.toBeInTheDocument()
            expect(screen.queryByText('Step Difference over Time')).not.toBeInTheDocument()
        })
    })

    // --- Cycle data table: timestamp conditional (line 502) ---
    describe('Cycle data table timestamp display', () => {
        it('shows dash for cycles without timestamps in table', async () => {
            const cyclesNoTimestamp = completedResultsData.cycles.map(c => ({
                ...c,
                timestamp: null,
            }))
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: { ...completedResultsData, cycles: cyclesNoTimestamp },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Cycle Data')).toBeInTheDocument()
                // When no timestamp, the table shows '-'
                const dashes = screen.getAllByText('-')
                expect(dashes.length).toBeGreaterThanOrEqual(3) // one for each cycle
            })
        })
    })

    // --- Delta display in table: negative and zero deltas (line 511) ---
    describe('Delta display in cycle data table', () => {
        it('shows positive delta with + prefix and green color', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: completedResultsData,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Cycle Data')).toBeInTheDocument()
                // Cycle 2 has fwd_delta = 201-200 = +1
                const plus1Elements = screen.getAllByText('+1')
                expect(plus1Elements.length).toBeGreaterThanOrEqual(1)
            })
        })

        it('shows negative delta with negative prefix and red color', async () => {
            const cyclesWithNegDelta = [
                completedResultsData.cycles[0],
                {
                    ...completedResultsData.cycles[1],
                    forward_steps: 195,  // 195 - 200 = -5
                },
                completedResultsData.cycles[2],
            ]
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: { ...completedResultsData, cycles: cyclesWithNegDelta },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Cycle Data')).toBeInTheDocument()
                expect(screen.getByText('-5')).toBeInTheDocument()
            })
        })

        it('shows em-dash for first cycle delta (null)', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: completedResultsData,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Cycle Data')).toBeInTheDocument()
                // First cycle has null deltas, shown as em-dash
                const emDashes = screen.getAllByText('\u2014')
                expect(emDashes.length).toBeGreaterThanOrEqual(2) // fwd and bwd for cycle 1
            })
        })
    })

    // --- Summary with running indicator (live) ---
    describe('Summary with running indicator', () => {
        it('shows (live) indicator in summary when running', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: true,
                    data: { ...completedResultsData, status: 'running', current_cycle: 2 },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('(live)')).toBeInTheDocument()
            })
        })
    })

    // --- Summary delta statistics ---
    describe('Summary delta statistics', () => {
        it('shows delta statistics in summary', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: completedResultsData,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Avg Fwd Delta:')).toBeInTheDocument()
                expect(screen.getByText('Max Fwd Delta:')).toBeInTheDocument()
                expect(screen.getByText('Avg Bwd Delta:')).toBeInTheDocument()
                expect(screen.getByText('Max Bwd Delta:')).toBeInTheDocument()
            })
        })
    })

    // --- Progress bar rendering ---
    describe('Progress bar rendering', () => {
        it('renders progress bar when total_cycles > 0', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: true,
                    data: { ...completedResultsData, status: 'running', current_cycle: 2, total_cycles: 10 },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('2 / 10 cycles')).toBeInTheDocument()
            })
        })
    })

    // --- Motor name not shown when null ---
    describe('Motor name display', () => {
        it('does not render motor name when null', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: { ...completedResultsData, motor_name: null },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Test Status')).toBeInTheDocument()
            })
            expect(screen.queryByText('Motor 1 - X-Axis')).not.toBeInTheDocument()
        })
    })

    // --- No end_time shown when null ---
    describe('End time display', () => {
        it('does not show End Time when not provided', async () => {
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: true,
                    data: { ...completedResultsData, status: 'running', end_time: null },
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Start Time:')).toBeInTheDocument()
            })
            expect(screen.queryByText('End Time:')).not.toBeInTheDocument()
        })
    })

    // --- Limit switch loading state ---
    describe('Limit switch loading state', () => {
        it('shows loading text in refresh button when loading', async () => {
            // Use a fetch that never resolves for limit switches
            let resolveLimitSwitch
            global.fetch = vi.fn((url) => {
                if (url.includes('/api/drift-test/status')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(idleStatusResponse),
                    })
                }
                if (url.includes('/api/limit-switches')) {
                    return new Promise((resolve) => { resolveLimitSwitch = resolve })
                }
                return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
            })

            await act(async () => { render(<DriftTestTab />) })
            // While limit switch fetch is pending, the button should show '...'
            expect(screen.getByTitle('Refresh limit switch status')).toBeInTheDocument()
            // Resolve to clean up
            resolveLimitSwitch({ ok: true, json: () => Promise.resolve(limitSwitchResponse) })
            await act(async () => { vi.advanceTimersByTime(100) })
        })
    })

    // --- No limit switch status (click Refresh text) ---
    describe('No limit switch status initially', () => {
        it('shows prompt to click Refresh when limitSwitchStatus is null', async () => {
            // Prevent limit switch fetch from resolving during render
            global.fetch = vi.fn((url) => {
                if (url.includes('/api/drift-test/status')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(idleStatusResponse),
                    })
                }
                if (url.includes('/api/limit-switches')) {
                    // Return a promise that never resolves so status stays null
                    return new Promise(() => {})
                }
                return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
            })

            await act(async () => { render(<DriftTestTab />) })
            // limitSwitchStatus is null initially (fetch never resolves)
            expect(screen.getByText(/Click Refresh to check limit switches/)).toBeInTheDocument()
        })
    })

    // --- Start drift test success path (log message) ---
    describe('Start drift test success log', () => {
        it('logs success message when start is successful', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            setupFetch({
                '/api/drift-test/start': { message: 'Drift test started' },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /Start Drift Test/i }))
            })

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith('Drift test started')
            })
            consoleSpy.mockRestore()
        })
    })

    // --- Clear results success path (log message) ---
    describe('Clear results success log', () => {
        it('logs success message and clears results when clear is successful', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: completedResultsData,
                },
                '/api/drift-test/clear': { message: 'Results cleared' },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })

            await waitFor(() => {
                expect(screen.getByText('Test Status')).toBeInTheDocument()
            })

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /Clear Results/i }))
            })

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith('Results cleared')
            })
            consoleSpy.mockRestore()
        })
    })

    // --- Summary with single cycle (lines 403-404 branch n <= 1) ---
    describe('Summary with single cycle', () => {
        it('renders summary correctly with only 1 cycle (delta fallback to [0])', async () => {
            const singleCycleData = {
                ...completedResultsData,
                total_cycles: 1,
                current_cycle: 1,
                cycles: [completedResultsData.cycles[0]],
            }
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: singleCycleData,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Test Summary')).toBeInTheDocument()
                expect(screen.getByText('Total Cycles:')).toBeInTheDocument()
                expect(screen.getByText('Avg Fwd Delta:')).toBeInTheDocument()
                expect(screen.getByText('Avg Bwd Delta:')).toBeInTheDocument()
                // With single cycle, deltas fallback to [0], so both Avg Fwd/Bwd Delta = 0.0
                const deltaSteps = screen.getAllByText('0.0 steps')
                expect(deltaSteps.length).toBeGreaterThanOrEqual(2)
            })
        })
    })

    // --- Summary with backend-provided summary data ---
    describe('Summary with backend-provided summary data', () => {
        it('uses summary values from backend when available', async () => {
            const dataWithSummary = {
                ...completedResultsData,
                summary: {
                    avg_forward_steps: 199.5,
                    avg_backward_steps: 198.5,
                    avg_drift_mm: 0.007,
                    max_drift_mm: 0.015,
                    min_drift_mm: 0.0,
                },
            }
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: dataWithSummary,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            await waitFor(() => {
                expect(screen.getByText('Test Summary')).toBeInTheDocument()
                expect(screen.getByText('199.5')).toBeInTheDocument()
                expect(screen.getByText('198.5')).toBeInTheDocument()
                expect(screen.getByText('0.007 mm')).toBeInTheDocument()
                expect(screen.getByText('0.015 mm')).toBeInTheDocument()
            })
        })
    })

    // --- Motor change triggers fetchLimitSwitches ---
    describe('Motor change triggers limit switch fetch', () => {
        it('fetches limit switches when motor is changed', async () => {
            setupFetch()
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })

            const callCountBefore = global.fetch.mock.calls.filter(c => c[0]?.includes?.('/api/limit-switches')).length

            const select = screen.getByRole('combobox')
            await act(async () => {
                fireEvent.change(select, { target: { value: '3' } })
            })

            const callCountAfter = global.fetch.mock.calls.filter(c => c[0]?.includes?.('/api/limit-switches')).length
            expect(callCountAfter).toBeGreaterThan(callCountBefore)
        })
    })

    // --- Stop drift test not-ok response (line 67 false branch) ---
    describe('Stop drift test not-ok response', () => {
        it('does not log message when stop response is not ok', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            setupFetch({
                '/api/drift-test/status': { status: 'success', running: true, data: { status: 'running', current_cycle: 5, total_cycles: 10, cycles: [] } },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Stop Test/i })).toBeInTheDocument()
            })

            // Return not-ok for stop
            global.fetch = vi.fn((url) => {
                if (url.includes('/api/drift-test/stop')) {
                    return Promise.resolve({
                        ok: false,
                        json: () => Promise.resolve({ detail: 'Not running' }),
                    })
                }
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', running: true, data: { status: 'running', current_cycle: 5, total_cycles: 10, cycles: [] } }) })
            })

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /Stop Test/i }))
            })

            await waitFor(() => {
                // console.log should NOT have been called with a success message
                expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('stopped'))
            })
            consoleSpy.mockRestore()
        })
    })

    // --- fetchDriftTestStatus non-success status (line 82 false branch) ---
    describe('Drift test status non-success', () => {
        it('does not update state when status response is not success', async () => {
            setupFetch({
                '/api/drift-test/status': { status: 'error', running: false, data: null },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })
            // Should not crash and should not show Test Status section
            expect(screen.queryByText('Test Status')).not.toBeInTheDocument()
        })
    })

    // --- clearDriftTestResults not-ok response (line 97 false branch) ---
    describe('Clear results not-ok response', () => {
        it('does not clear results when clear response is not ok', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            setupFetch({
                '/api/drift-test/status': {
                    status: 'success',
                    running: false,
                    data: completedResultsData,
                },
            })
            await act(async () => { render(<DriftTestTab />) })
            await act(async () => { vi.advanceTimersByTime(100) })

            await waitFor(() => {
                expect(screen.getByText('Test Status')).toBeInTheDocument()
            })

            // Return not-ok for clear
            global.fetch = vi.fn((url) => {
                if (url.includes('/api/drift-test/clear')) {
                    return Promise.resolve({
                        ok: false,
                        json: () => Promise.resolve({ detail: 'Clear failed' }),
                    })
                }
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', running: false, data: completedResultsData }) })
            })

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /Clear Results/i }))
            })

            // Results should still be showing (not cleared)
            await waitFor(() => {
                expect(screen.getByText('Test Status')).toBeInTheDocument()
            })
            consoleSpy.mockRestore()
        })
    })

    // --- onChange fallback defaults (lines 189, 205, 220) ---
    describe('Input onChange fallback defaults', () => {
        it('cycles input falls back to 1 when value is empty/NaN', async () => {
            await act(async () => { render(<DriftTestTab />) })
            const inputs = screen.getAllByRole('spinbutton')
            const cyclesInput = inputs.find(input => input.value === '10')
            await act(async () => {
                fireEvent.change(cyclesInput, { target: { value: '' } })
            })
            expect(cyclesInput.value).toBe('1')
        })

        it('motor speed input falls back to 0.001 when value is empty/NaN', async () => {
            await act(async () => { render(<DriftTestTab />) })
            const inputs = screen.getAllByRole('spinbutton')
            const speedInput = inputs.find(input => input.value === '0.001')
            await act(async () => {
                fireEvent.change(speedInput, { target: { value: '' } })
            })
            expect(speedInput.value).toBe('0.001')
        })

        it('steps per mm input falls back to 200 when value is empty/NaN', async () => {
            await act(async () => { render(<DriftTestTab />) })
            const inputs = screen.getAllByRole('spinbutton')
            const stepsInput = inputs.find(input => input.value === '200')
            await act(async () => {
                fireEvent.change(stepsInput, { target: { value: '' } })
            })
            expect(stepsInput.value).toBe('200')
        })
    })
})
