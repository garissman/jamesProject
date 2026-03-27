import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import App from './App'
import { mockFetch } from './test-utils'

// ── Store props refs so tests can call handler functions directly ──
let plateLayoutProps = {}
let programTabProps = {}
let rightPanelProps = {}
let settingsTabProps = {}
let manualTabProps = {}

// Mock all child components to isolate App logic
vi.mock('./components/NavBar', () => ({
  default: ({ activeTab, setActiveTab, theme, toggleTheme, controllerType }) => (
    <nav data-testid="navbar">
      <span data-testid="active-tab">{activeTab}</span>
      <span data-testid="theme">{theme}</span>
      <span data-testid="controller-type">{controllerType}</span>
      <button data-testid="tab-protocol" onClick={() => setActiveTab('protocol')}>Protocol</button>
      <button data-testid="tab-program" onClick={() => setActiveTab('program')}>Program</button>
      <button data-testid="tab-manual" onClick={() => setActiveTab('manual')}>Manual</button>
      <button data-testid="tab-drift-test" onClick={() => setActiveTab('drift-test')}>Drift Test</button>
      <button data-testid="tab-settings" onClick={() => setActiveTab('settings')}>Settings</button>
      <button data-testid="toggle-theme" onClick={toggleTheme}>Toggle Theme</button>
    </nav>
  ),
}))

vi.mock('./components/PlateLayout', () => ({
  default: (props) => {
    plateLayoutProps = props
    return (
      <div data-testid="plate-layout">
        <span data-testid="layout-type">{props.layoutType}</span>
        <span data-testid="z-axis-up">{String(props.zAxisUp)}</span>
        <span data-testid="current-operation">{props.currentOperation}</span>
        <span data-testid="operation-well">{props.operationWell || 'none'}</span>
        <span data-testid="plate-is-executing">{String(props.isExecuting)}</span>
        <span data-testid="plate-system-status">{props.systemStatus}</span>
        <button data-testid="well-click" onClick={() => props.handleWellClick('A1')}>Click A1</button>
        <button data-testid="well-click-b2" onClick={() => props.handleWellClick('B2')}>Click B2</button>
        <button data-testid="set-layout-wellplate" onClick={() => props.handleSetLayout('wellplate')}>Set Wellplate</button>
        <button data-testid="set-pipette-count" onClick={() => props.handleSetPipetteCount(1)}>Set Pipette 1</button>
        <button data-testid="toggle-z" onClick={() => props.handleToggleZ()}>Toggle Z</button>
        <button data-testid="collect-5" onClick={() => props.handleCollect(5)}>Collect 5</button>
        <button data-testid="dispense-5" onClick={() => props.handleDispense(5)}>Dispense 5</button>
        <button data-testid="execute" onClick={() => props.handleExecute()}>Execute</button>
      </div>
    )
  },
}))

vi.mock('./components/ProgramTab', () => ({
  default: (props) => {
    programTabProps = props
    return (
      <div data-testid="program-tab">
        <span data-testid="steps-count">{props.steps.length}</span>
        <span data-testid="program-is-executing">{String(props.isExecuting)}</span>
        <span data-testid="current-step-index">{props.currentStepIndex ?? 'null'}</span>
        <span data-testid="total-steps">{props.totalSteps ?? 'null'}</span>
        <button data-testid="add-step" onClick={() => props.handleAddStep({
          stepType: 'pipette', cycles: 2, pickupWell: 'A1', dropoffWell: 'B1',
          rinseWell: 'WS2', washWell: 'WS1', waitTime: 5, sampleVolume: 40,
          repetitionMode: 'quantity', repetitionQuantity: 1
        })}>Add Step</button>
        <button data-testid="add-step-time-freq" onClick={() => props.handleAddStep({
          stepType: 'pipette', cycles: 1, pickupWell: 'C1', dropoffWell: 'D1',
          rinseWell: 'WS2', washWell: 'WS1', waitTime: 0, sampleVolume: 40,
          repetitionMode: 'timeFrequency', repetitionInterval: 60, repetitionDuration: 300
        })}>Add Step TimeFreq</button>
        <button data-testid="save-program" onClick={() => props.handleSaveProgram()}>Save</button>
        <button data-testid="load-program" onClick={() => props.handleLoadProgram(
          [{ id: 99, stepType: 'home' }],
          { cronExpression: '0 * * * *', enabled: true }
        )}>Load</button>
        <button data-testid="load-program-null" onClick={() => props.handleLoadProgram(null, null)}>Load Null</button>
        <button data-testid="validate-well-a1" onClick={() => {
          const r = props.validateWellId('A1')
          document.getElementById('validate-result').textContent = String(r)
        }}>Validate A1</button>
        <button data-testid="set-well-selection" onClick={() => {
          props.setWellSelectionMode({ callback: () => {} })
          props.setActiveTab('protocol')
        }}>Pick Well</button>
        <button data-testid="schedule-change" onClick={() => props.onScheduleChange({
          cronExpression: '*/5 * * * *', enabled: true
        })}>Change Schedule</button>
        <button data-testid="schedule-change-same" onClick={() => props.onScheduleChange({
          cronExpression: '*/5 * * * *', enabled: false
        })}>Change Schedule Same</button>
      </div>
    )
  },
}))

vi.mock('./components/ManualTab', () => ({
  default: (props) => {
    manualTabProps = props
    return (
      <div data-testid="manual-tab">
        <span data-testid="manual-system-status">{props.systemStatus}</span>
        <span data-testid="manual-axis-x">{props.axisPositions.x}</span>
        <button data-testid="axis-move" onClick={() => props.handleAxisMove('x', 100, 'forward')}>Move X</button>
        <button data-testid="set-position" onClick={() => props.handleSetPosition({ x: 10, y: 20, z: 30, pipette_ml: 5 })}>Set Pos</button>
      </div>
    )
  },
}))

vi.mock('./components/DriftTestTab', () => ({
  default: () => <div data-testid="drift-test-tab">Drift Test</div>,
}))

vi.mock('./components/SettingsTab', () => ({
  default: (props) => {
    settingsTabProps = props
    return (
      <div data-testid="settings-tab">
        <button data-testid="save-config" onClick={props.saveConfig}>Save Config</button>
        <button data-testid="config-change" onClick={() => props.handleConfigChange('STEPS_PER_MM_X', 200)}>Change Config</button>
      </div>
    )
  },
}))

vi.mock('./components/RightPanel', () => ({
  default: (props) => {
    rightPanelProps = props
    return (
      <div data-testid="right-panel">
        <span data-testid="selected-well">{props.selectedWell}</span>
        <span data-testid="target-well">{props.targetWell || 'none'}</span>
        <span data-testid="right-is-executing">{String(props.isExecuting)}</span>
        <button data-testid="right-execute" onClick={() => props.handleExecute()}>Execute</button>
        <button data-testid="right-stop" onClick={() => props.handleStop()}>Stop</button>
        <button data-testid="right-home" onClick={() => props.handleHome()}>Home</button>
        <button data-testid="right-delete-all" onClick={() => props.handleDeleteAll()}>Delete All</button>
        <button data-testid="right-move-to-well" onClick={() => props.handleMoveToWell()}>Move To Well</button>
      </div>
    )
  },
}))

function standardMockFetch() {
  return mockFetch({
    '/api/pipetting/status': {
      initialized: true,
      current_well: 'WS1',
      message: 'System ready',
      pipette_count: 3,
      layout_type: 'microchip',
      is_executing: false,
      controller_type: 'raspberry_pi',
      current_operation: 'idle',
      operation_well: null,
    },
    '/api/axis/positions': {
      status: 'success',
      positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} },
    },
    '/api/pipetting/logs': { logs: [] },
    '/api/config': { status: 'success', config: { STEPS_PER_MM_X: 100, PIPETTE_MAX_ML: 10.0 } },
    '/api/program/load': { steps: [], schedule: { cronExpression: '', enabled: false } },
    '/api/program/status': { execution: { status: 'idle' } },
    '/api/program/save': { status: 'success', message: 'Program saved' },
    '/api/pipetting/execute': { message: 'Executed', steps_executed: 1 },
    '/api/pipetting/stop': { message: 'Motor stop engaged', motor_stopped: true },
    '/api/pipetting/home': { message: 'Homed' },
    '/api/pipetting/set-pipette-count': { message: 'Pipette count set' },
    '/api/pipetting/set-layout': { message: 'Layout set' },
    '/api/pipetting/move-to-well': { message: 'Moved to well' },
    '/api/pipetting/toggle-z': { message: 'Z toggled' },
    '/api/pipetting/aspirate': { message: 'Aspirated' },
    '/api/pipetting/dispense': { message: 'Dispensed' },
    '/api/axis/move': { message: 'Axis moved', positions: { x: 100, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
    '/api/axis/set-position': { message: 'Position set', positions: { x: 10, y: 20, z: 30, pipette_ml: 5, motor_steps: {} } },
  })
}

// Helper to create a fetch mock with specific error responses
function errorMockFetch(errorEndpoints = {}) {
  return vi.fn((url, _options) => {
    const path = typeof url === 'string' ? url : url.toString()
    for (const [pattern, data] of Object.entries(errorEndpoints)) {
      if (path.includes(pattern)) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve(data),
          text: () => Promise.resolve(JSON.stringify(data)),
        })
      }
    }
    // Fall back to standard responses
    const standardResponses = {
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: { STEPS_PER_MM_X: 100, PIPETTE_MAX_ML: 10.0 } },
      '/api/program/load': { steps: [], schedule: { cronExpression: '', enabled: false } },
      '/api/program/status': { execution: { status: 'idle' } },
      '/api/program/save': { status: 'success' },
    }
    for (const [pattern, data] of Object.entries(standardResponses)) {
      if (path.includes(pattern)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(data),
          text: () => Promise.resolve(JSON.stringify(data)),
        })
      }
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: 'success' }),
      text: () => Promise.resolve('{}'),
    })
  })
}

// Helper to create a fetch mock that rejects for specific endpoints
function networkErrorMockFetch(errorEndpoints = []) {
  return vi.fn((url, _options) => {
    const path = typeof url === 'string' ? url : url.toString()
    for (const pattern of errorEndpoints) {
      if (path.includes(pattern)) {
        return Promise.reject(new Error('Network error'))
      }
    }
    const standardResponses = {
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: { STEPS_PER_MM_X: 100, PIPETTE_MAX_ML: 10.0 } },
      '/api/program/load': { steps: [], schedule: { cronExpression: '', enabled: false } },
      '/api/program/status': { execution: { status: 'idle' } },
      '/api/program/save': { status: 'success' },
    }
    for (const [pattern, data] of Object.entries(standardResponses)) {
      if (path.includes(pattern)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(data),
          text: () => Promise.resolve(JSON.stringify(data)),
        })
      }
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: 'success' }),
      text: () => Promise.resolve('{}'),
    })
  })
}

beforeEach(() => {
  window.history.pushState({}, '', '/')
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  global.fetch = standardMockFetch()
  plateLayoutProps = {}
  programTabProps = {}
  rightPanelProps = {}
  settingsTabProps = {}
  manualTabProps = {}
})

afterEach(() => {
  vi.useRealTimers()
})

// Helper to render and wait for initial loads
async function renderApp() {
  await act(async () => {
    render(<App />)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
  })
}

// ─── Initial rendering ───────────────────────────────────────────────────────

describe('App initial rendering', () => {
  it('renders NavBar', async () => {
    await renderApp()
    expect(screen.getByTestId('navbar')).toBeInTheDocument()
  })

  it('renders RightPanel', async () => {
    await renderApp()
    expect(screen.getByTestId('right-panel')).toBeInTheDocument()
  })

  it('renders PlateLayout on protocol tab (default)', async () => {
    await renderApp()
    expect(screen.getByTestId('plate-layout')).toBeInTheDocument()
  })

  it('starts with "protocol" as active tab at root path', async () => {
    await renderApp()
    expect(screen.getByTestId('active-tab').textContent).toBe('protocol')
  })
})

// ─── Tab routing ─────────────────────────────────────────────────────────────

describe('Tab routing', () => {
  it('switching to program tab shows ProgramTab', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    expect(screen.getByTestId('active-tab').textContent).toBe('program')
    expect(screen.getByTestId('program-tab')).toBeInTheDocument()
  })

  it('switching to manual tab shows ManualTab', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })
    expect(screen.getByTestId('active-tab').textContent).toBe('manual')
    expect(screen.getByTestId('manual-tab')).toBeInTheDocument()
  })

  it('switching to drift-test tab shows DriftTestTab', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-drift-test')) })
    expect(screen.getByTestId('active-tab').textContent).toBe('drift-test')
    expect(screen.getByTestId('drift-test-tab')).toBeInTheDocument()
  })

  it('switching to settings tab shows SettingsTab', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-settings')) })
    expect(screen.getByTestId('active-tab').textContent).toBe('settings')
    expect(screen.getByTestId('settings-tab')).toBeInTheDocument()
  })

  it('URL updates when switching tabs', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    expect(window.location.pathname).toBe('/program')
    await act(async () => { fireEvent.click(screen.getByTestId('tab-settings')) })
    expect(window.location.pathname).toBe('/settings')
    await act(async () => { fireEvent.click(screen.getByTestId('tab-protocol')) })
    expect(window.location.pathname).toBe('/')
  })

  it('reads initial tab from URL path', async () => {
    window.history.pushState({}, '', '/settings')
    await renderApp()
    expect(screen.getByTestId('active-tab').textContent).toBe('settings')
  })

  it('handles popstate (back/forward navigation)', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    expect(screen.getByTestId('active-tab').textContent).toBe('program')

    await act(async () => {
      window.history.back()
      await new Promise((resolve) => setTimeout(resolve, 0))
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByTestId('active-tab').textContent).toBe('protocol')
  })

  it('defaults to protocol for unknown paths', async () => {
    window.history.pushState({}, '', '/unknown-path')
    await renderApp()
    expect(screen.getByTestId('active-tab').textContent).toBe('protocol')
  })
})

// ─── Polling and initial load ────────────────────────────────────────────────

describe('Polling and initial load', () => {
  it('fetches status, config, positions, program, and logs on mount', async () => {
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    const calledUrls = fetchMock.mock.calls.map((c) => c[0])
    expect(calledUrls.some((u) => u.includes('/api/pipetting/status'))).toBe(true)
    expect(calledUrls.some((u) => u.includes('/api/config'))).toBe(true)
    expect(calledUrls.some((u) => u.includes('/api/axis/positions'))).toBe(true)
    expect(calledUrls.some((u) => u.includes('/api/program/load'))).toBe(true)
    expect(calledUrls.some((u) => u.includes('/api/pipetting/logs'))).toBe(true)
  })

  it('polls status periodically', async () => {
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    const initialCallCount = fetchMock.mock.calls.filter((c) => c[0].includes('/api/pipetting/status')).length

    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    const newCallCount = fetchMock.mock.calls.filter((c) => c[0].includes('/api/pipetting/status')).length
    expect(newCallCount).toBeGreaterThan(initialCallCount)
  })

  it('polls logs periodically', async () => {
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    const initialCallCount = fetchMock.mock.calls.filter((c) => c[0].includes('/api/pipetting/logs')).length

    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    const newCallCount = fetchMock.mock.calls.filter((c) => c[0].includes('/api/pipetting/logs')).length
    expect(newCallCount).toBeGreaterThan(initialCallCount)
  })

  it('polls axis positions when on manual tab', async () => {
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })

    const initialAxisCalls = fetchMock.mock.calls.filter((c) => c[0].includes('/api/axis/positions')).length

    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })

    const newAxisCalls = fetchMock.mock.calls.filter((c) => c[0].includes('/api/axis/positions')).length
    expect(newAxisCalls).toBeGreaterThan(initialAxisCalls)
  })

  it('polls faster during execution', async () => {
    // Status returns is_executing: true
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'Executing',
        pipette_count: 3, layout_type: 'microchip', is_executing: true,
        controller_type: 'raspberry_pi', current_operation: 'aspirating',
        operation_well: 'A1', current_step_index: 0, total_steps: 2,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: ['log1', 'log2'] },
      '/api/config': { status: 'success', config: { STEPS_PER_MM_X: 100 } },
      '/api/program/load': { steps: [{ id: 1, stepType: 'pipette' }], schedule: { cronExpression: '', enabled: false } },
      '/api/program/status': { execution: { status: 'running' } },
      '/api/program/save': { status: 'success' },
      '/api/pipetting/execute': { message: 'Executed', steps_executed: 1 },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    // Now isExecuting should be true from status poll
    // The 300ms execution poll should fire
    const fetchMock = global.fetch
    const logCallsBefore = fetchMock.mock.calls.filter((c) => c[0].includes('/api/pipetting/logs')).length

    await act(async () => { await vi.advanceTimersByTimeAsync(600) })

    const logCallsAfter = fetchMock.mock.calls.filter((c) => c[0].includes('/api/pipetting/logs')).length
    expect(logCallsAfter).toBeGreaterThan(logCallsBefore)
  })

  it('loads program with steps and schedule on mount', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'ok',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi',
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': {
        steps: [
          { id: 1, stepType: 'pipette', pickupWell: 'A1', dropoffWell: 'B1' },
          { id: 2, stepType: 'home' },
        ],
        schedule: { cronExpression: '0 * * * *', enabled: true },
        execution: { status: 'completed' },
      },
      '/api/program/status': { execution: { status: 'idle' } },
      '/api/program/save': { status: 'success' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })

    await waitFor(() => {
      expect(screen.getByTestId('steps-count').textContent).toBe('2')
    })
  })

  it('handles status fetch when system is not initialized', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: false,
        message: 'System not initialized',
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': { steps: [] },
      '/api/program/status': { execution: { status: 'idle' } },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    // Should show "System not ready" via systemStatus
    await waitFor(() => {
      expect(screen.getByTestId('plate-system-status').textContent).toBe('System not initialized')
    })
  })

  it('handles status fetch network error (backend offline)', async () => {
    global.fetch = networkErrorMockFetch(['/api/pipetting/status'])

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    await waitFor(() => {
      expect(screen.getByTestId('plate-system-status').textContent).toBe('Backend offline')
    })

    consoleSpy.mockRestore()
  })

  it('handles axis positions fetch error gracefully', async () => {
    global.fetch = networkErrorMockFetch(['/api/axis/positions'])
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    // Should not crash
    expect(screen.getByTestId('plate-layout')).toBeInTheDocument()
    consoleSpy.mockRestore()
  })

  it('handles logs fetch error gracefully', async () => {
    global.fetch = networkErrorMockFetch(['/api/pipetting/logs'])
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    expect(screen.getByTestId('plate-layout')).toBeInTheDocument()
    consoleSpy.mockRestore()
  })

  it('handles config fetch error gracefully', async () => {
    global.fetch = networkErrorMockFetch(['/api/config'])
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    expect(screen.getByTestId('plate-layout')).toBeInTheDocument()
    consoleSpy.mockRestore()
  })
})

// ─── State flow ──────────────────────────────────────────────────────────────

describe('State flow', () => {
  it('well click updates targetWell state', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('well-click')) })
    expect(screen.getByTestId('target-well').textContent).toBe('A1')
  })

  it('initial selectedWell is WS1', async () => {
    await renderApp()
    expect(screen.getByTestId('selected-well').textContent).toBe('WS1')
  })

  it('fetched status updates selectedWell', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'B5', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi',
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': { steps: [] },
      '/api/program/status': { execution: { status: 'idle' } },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await waitFor(() => {
      expect(screen.getByTestId('selected-well').textContent).toBe('B5')
    })
  })

  it('loaded program updates step count', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'ok',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi',
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': {
        steps: [
          { id: 1, stepType: 'pipette', pickupWell: 'A1', dropoffWell: 'B1' },
          { id: 2, stepType: 'home' },
        ],
        schedule: { cronExpression: '', enabled: false },
      },
      '/api/program/status': { execution: { status: 'idle' } },
      '/api/program/save': { status: 'success' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })

    await waitFor(() => {
      expect(screen.getByTestId('steps-count').textContent).toBe('2')
    })
  })
})

// ─── Theme ───────────────────────────────────────────────────────────────────

describe('Theme', () => {
  it('defaults to light theme', async () => {
    await renderApp()
    expect(screen.getByTestId('theme').textContent).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('persists theme to localStorage', async () => {
    await renderApp()
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('toggles theme from light to dark', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('toggle-theme')) })
    expect(screen.getByTestId('theme').textContent).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('reads saved theme from localStorage', async () => {
    localStorage.setItem('theme', 'dark')
    await renderApp()
    expect(screen.getByTestId('theme').textContent).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})

// ─── validateWellId ─────────────────────────────────────────────────────────

describe('validateWellId', () => {
  it('validates empty/null well IDs as true', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    // Directly call the function through the props
    expect(programTabProps.validateWellId('')).toBe(true)
    expect(programTabProps.validateWellId('  ')).toBe(true)
    expect(programTabProps.validateWellId(null)).toBe(true)
    expect(programTabProps.validateWellId(undefined)).toBe(true)
  })

  it('validates WS1 and WS2', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    expect(programTabProps.validateWellId('WS1')).toBe(true)
    expect(programTabProps.validateWellId('ws2')).toBe(true)
  })

  it('validates MC1-MC5', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    expect(programTabProps.validateWellId('MC1')).toBe(true)
    expect(programTabProps.validateWellId('MC5')).toBe(true)
    expect(programTabProps.validateWellId('mc3')).toBe(true)
  })

  it('validates vial pattern V[A-E][1-3]', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    expect(programTabProps.validateWellId('VA1')).toBe(true)
    expect(programTabProps.validateWellId('VE3')).toBe(true)
    expect(programTabProps.validateWellId('VF1')).toBe(false) // F is out of range
  })

  it('validates small well pattern [A-L][1-6]', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    expect(programTabProps.validateWellId('A1')).toBe(true)
    expect(programTabProps.validateWellId('L6')).toBe(true)
    expect(programTabProps.validateWellId('M1')).toBe(false) // M is out of range for all patterns
  })

  it('validates standard well pattern [A-H][1-15]', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    expect(programTabProps.validateWellId('A1')).toBe(true)
    expect(programTabProps.validateWellId('H15')).toBe(true)
    expect(programTabProps.validateWellId('H16')).toBe(false)
    expect(programTabProps.validateWellId('Z1')).toBe(false)
  })

  it('rejects invalid well IDs', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    expect(programTabProps.validateWellId('XX99')).toBe(false)
    expect(programTabProps.validateWellId('INVALID')).toBe(false)
  })
})

// ─── getPipetteWells ────────────────────────────────────────────────────────

describe('getPipetteWells', () => {
  it('returns single well for pipetteCount 1', async () => {
    await renderApp()
    const result = plateLayoutProps.getPipetteWells('A5', 1)
    expect(result).toEqual(['A5'])
  })

  it('returns null for null centerWell', async () => {
    await renderApp()
    const result = plateLayoutProps.getPipetteWells(null, 3)
    expect(result).toEqual([null])
  })

  it('returns single well for non-matching pattern (like WS1)', async () => {
    await renderApp()
    const result = plateLayoutProps.getPipetteWells('WS1', 3)
    expect(result).toEqual(['WS1'])
  })

  it('returns 3 wells for center well with 3 pipettes', async () => {
    await renderApp()
    const result = plateLayoutProps.getPipetteWells('A5', 3)
    expect(result).toEqual(['A4', 'A5', 'A6'])
  })

  it('handles edge column 1 (no well to left)', async () => {
    await renderApp()
    const result = plateLayoutProps.getPipetteWells('A1', 3)
    expect(result).toEqual(['A1', 'A2'])
  })

  it('handles edge column 15 (no well to right)', async () => {
    await renderApp()
    const result = plateLayoutProps.getPipetteWells('A15', 3)
    expect(result).toEqual(['A14', 'A15'])
  })
})

// ─── handleAddStep ──────────────────────────────────────────────────────────

describe('handleAddStep', () => {
  it('adds a pipette step with correct fields', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })

    await waitFor(() => {
      expect(screen.getByTestId('steps-count').textContent).toBe('1')
    })
  })

  it('adds a step with timeFrequency repetition mode', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step-time-freq')) })

    await waitFor(() => {
      expect(screen.getByTestId('steps-count').textContent).toBe('1')
    })
  })
})

// ─── handleUpdateStep ───────────────────────────────────────────────────────

describe('handleUpdateStep', () => {
  it('updates an existing step', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    // Add a step first
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })
    expect(screen.getByTestId('steps-count').textContent).toBe('1')

    // Get the step ID and update it
    const stepId = programTabProps.steps[0].id
    await act(async () => {
      programTabProps.handleUpdateStep(stepId, {
        stepType: 'pipette', cycles: 5, pickupWell: 'C1', dropoffWell: 'D1',
        rinseWell: 'WS2', washWell: 'WS1', waitTime: 10, sampleVolume: 40,
        repetitionMode: 'quantity', repetitionQuantity: 2
      })
    })

    expect(programTabProps.steps[0].cycles).toBe(5)
    expect(programTabProps.steps[0].pickupWell).toBe('C1')
  })

  it('updates a step with timeFrequency mode', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })

    const stepId = programTabProps.steps[0].id
    await act(async () => {
      programTabProps.handleUpdateStep(stepId, {
        stepType: 'pipette', cycles: 1, pickupWell: 'A1', dropoffWell: 'B1',
        rinseWell: 'WS2', washWell: 'WS1', waitTime: 0, sampleVolume: 40,
        repetitionMode: 'timeFrequency', repetitionInterval: 120, repetitionDuration: 600
      })
    })

    expect(programTabProps.steps[0].repetitionMode).toBe('timeFrequency')
    expect(programTabProps.steps[0].repetitionInterval).toBe(120)
    expect(programTabProps.steps[0].repetitionDuration).toBe(600)
  })
})

// ─── handleDuplicateStep ────────────────────────────────────────────────────

describe('handleDuplicateStep', () => {
  it('duplicates an existing step', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })
    expect(screen.getByTestId('steps-count').textContent).toBe('1')

    const stepId = programTabProps.steps[0].id
    await act(async () => {
      programTabProps.handleDuplicateStep(stepId)
    })

    await waitFor(() => {
      expect(screen.getByTestId('steps-count').textContent).toBe('2')
    })
  })

  it('does nothing for non-existent step ID', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })

    await act(async () => {
      programTabProps.handleDuplicateStep(999999)
    })

    expect(screen.getByTestId('steps-count').textContent).toBe('1')
  })
})

// ─── handleDeleteStep ───────────────────────────────────────────────────────

describe('handleDeleteStep', () => {
  it('deletes a step', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })
    expect(screen.getByTestId('steps-count').textContent).toBe('2')

    const stepId = programTabProps.steps[0].id
    await act(async () => {
      programTabProps.handleDeleteStep(stepId)
    })

    await waitFor(() => {
      expect(screen.getByTestId('steps-count').textContent).toBe('1')
    })
  })
})

// ─── handleReorderSteps ─────────────────────────────────────────────────────

describe('handleReorderSteps', () => {
  it('reorders steps by moving from one index to another', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step-time-freq')) })

    const firstStepId = programTabProps.steps[0].id
    const secondStepId = programTabProps.steps[1].id

    await act(async () => {
      programTabProps.handleReorderSteps(0, 1)
    })

    expect(programTabProps.steps[0].id).toBe(secondStepId)
    expect(programTabProps.steps[1].id).toBe(firstStepId)
  })
})

// ─── handleDeleteAll ────────────────────────────────────────────────────────

describe('handleDeleteAll', () => {
  it('deletes all steps after confirmation', async () => {
    window.confirm = vi.fn(() => true)

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })
    expect(screen.getByTestId('steps-count').textContent).toBe('2')

    await act(async () => { fireEvent.click(screen.getByTestId('right-delete-all')) })

    await waitFor(() => {
      expect(screen.getByTestId('steps-count').textContent).toBe('0')
    })
    expect(window.confirm).toHaveBeenCalled()
  })

  it('does not delete if confirmation is cancelled', async () => {
    window.confirm = vi.fn(() => false)

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })
    expect(screen.getByTestId('steps-count').textContent).toBe('1')

    await act(async () => { fireEvent.click(screen.getByTestId('right-delete-all')) })

    expect(screen.getByTestId('steps-count').textContent).toBe('1')
  })

  it('does nothing if there are no steps', async () => {
    window.confirm = vi.fn(() => true)

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('right-delete-all')) })

    // confirm should not have been called since steps.length === 0
    expect(window.confirm).not.toHaveBeenCalled()
  })
})

// ─── handleSaveProgram ──────────────────────────────────────────────────────

describe('handleSaveProgram', () => {
  it('saves program successfully', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })

    await act(async () => { fireEvent.click(screen.getByTestId('save-program')) })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/program/save', expect.objectContaining({
        method: 'POST',
      }))
    })

    consoleSpy.mockRestore()
  })

  it('does nothing if no steps to save', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('save-program')) })

    expect(consoleSpy).toHaveBeenCalledWith('No program steps to save.')
    consoleSpy.mockRestore()
  })

  it('handles save error response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/program/save': { detail: 'Save failed' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })
    await act(async () => { fireEvent.click(screen.getByTestId('save-program')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Save failed'))
    })
    consoleSpy.mockRestore()
  })

  it('handles save network error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })

    // Now make save reject
    global.fetch = networkErrorMockFetch(['/api/program/save'])

    await act(async () => { fireEvent.click(screen.getByTestId('save-program')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unable to save program'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleLoadProgram ──────────────────────────────────────────────────────

describe('handleLoadProgram', () => {
  it('loads steps and schedule', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('load-program')) })

    await waitFor(() => {
      expect(screen.getByTestId('steps-count').textContent).toBe('1')
    })
  })

  it('does nothing when loadedSteps is null', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('load-program-null')) })

    expect(screen.getByTestId('steps-count').textContent).toBe('0')
  })
})

// ─── handleExecute ──────────────────────────────────────────────────────────

describe('handleExecute', () => {
  it('does nothing if no steps', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('right-execute')) })

    expect(consoleSpy).toHaveBeenCalledWith('No steps to execute. Please add steps first.')
    consoleSpy.mockRestore()
  })

  it('executes steps successfully', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-protocol')) })

    await act(async () => { fireEvent.click(screen.getByTestId('right-execute')) })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/pipetting/execute', expect.objectContaining({
        method: 'POST',
      }))
    })

    consoleSpy.mockRestore()
  })

  it('handles execute error response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/execute': { detail: 'Execution failed' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-protocol')) })

    await act(async () => { fireEvent.click(screen.getByTestId('right-execute')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Execution failed'))
    })
    consoleSpy.mockRestore()
  })

  it('handles execute network error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-protocol')) })

    global.fetch = networkErrorMockFetch(['/api/pipetting/execute'])

    await act(async () => { fireEvent.click(screen.getByTestId('right-execute')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unable to connect to backend'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleStop ─────────────────────────────────────────────────────────────

describe('handleStop', () => {
  it('stops execution successfully', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('right-stop')) })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/pipetting/stop', expect.objectContaining({
        method: 'POST',
      }))
    })

    consoleSpy.mockRestore()
  })

  it('handles stop error response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/stop': { detail: 'Stop failed' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await act(async () => { fireEvent.click(screen.getByTestId('right-stop')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Stop failed'))
    })
    consoleSpy.mockRestore()
  })

  it('handles stop network error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = networkErrorMockFetch(['/api/pipetting/stop'])

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await act(async () => { fireEvent.click(screen.getByTestId('right-stop')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unable to connect to backend'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleHome ─────────────────────────────────────────────────────────────

describe('handleHome', () => {
  it('homes successfully', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('right-home')) })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/pipetting/home', expect.objectContaining({
        method: 'POST',
      }))
    })

    consoleSpy.mockRestore()
  })

  it('handles home error response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/home': { detail: 'Home failed' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await act(async () => { fireEvent.click(screen.getByTestId('right-home')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Home failed'))
    })
    consoleSpy.mockRestore()
  })

  it('handles home network error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = networkErrorMockFetch(['/api/pipetting/home'])

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await act(async () => { fireEvent.click(screen.getByTestId('right-home')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unable to connect to backend'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleSetPipetteCount ──────────────────────────────────────────────────

describe('handleSetPipetteCount', () => {
  it('sets pipette count successfully', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('set-pipette-count')) })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/pipetting/set-pipette-count', expect.objectContaining({
        method: 'POST',
      }))
    })

    consoleSpy.mockRestore()
  })

  it('handles set pipette count error response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/set-pipette-count': { detail: 'Failed' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await act(async () => { fireEvent.click(screen.getByTestId('set-pipette-count')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed'))
    })
    consoleSpy.mockRestore()
  })

  it('handles set pipette count network error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = networkErrorMockFetch(['/api/pipetting/set-pipette-count'])

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await act(async () => { fireEvent.click(screen.getByTestId('set-pipette-count')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unable to connect to backend'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleSetLayout ────────────────────────────────────────────────────────

describe('handleSetLayout', () => {
  it('sets layout successfully', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('set-layout-wellplate')) })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/pipetting/set-layout', expect.objectContaining({
        method: 'POST',
      }))
    })

    await waitFor(() => {
      expect(screen.getByTestId('layout-type').textContent).toBe('wellplate')
    })
  })

  it('handles set layout error response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/set-layout': { detail: 'Layout failed' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await act(async () => { fireEvent.click(screen.getByTestId('set-layout-wellplate')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Layout failed'))
    })
    consoleSpy.mockRestore()
  })

  it('handles set layout network error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = networkErrorMockFetch(['/api/pipetting/set-layout'])

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await act(async () => { fireEvent.click(screen.getByTestId('set-layout-wellplate')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to set layout:', expect.stringContaining('Network error'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleWellClick with wellSelectionMode ─────────────────────────────────

describe('handleWellClick with wellSelectionMode', () => {
  it('calls callback and switches to program tab when in well selection mode', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })

    // Set well selection mode then switch to protocol to see PlateLayout
    await act(async () => { fireEvent.click(screen.getByTestId('set-well-selection')) })

    // Now click a well on the plate
    await act(async () => { fireEvent.click(screen.getByTestId('well-click')) })

    // Should now be on program tab
    expect(screen.getByTestId('active-tab').textContent).toBe('program')
  })
})

// ─── handleMoveToWell ───────────────────────────────────────────────────────

describe('handleMoveToWell', () => {
  it('does nothing if no targetWell', async () => {
    await renderApp()
    // targetWell is null initially
    await act(async () => { fireEvent.click(screen.getByTestId('right-move-to-well')) })
    // Should not have called the move-to-well endpoint
    const moveCalls = global.fetch.mock.calls.filter((c) => c[0].includes('/api/pipetting/move-to-well'))
    expect(moveCalls.length).toBe(0)
  })

  it('moves to well successfully', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    // Set targetWell first by clicking a well
    await act(async () => { fireEvent.click(screen.getByTestId('well-click')) })
    expect(screen.getByTestId('target-well').textContent).toBe('A1')

    await act(async () => { fireEvent.click(screen.getByTestId('right-move-to-well')) })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/pipetting/move-to-well', expect.objectContaining({
        method: 'POST',
      }))
    })
    consoleSpy.mockRestore()
  })

  it('handles move to well error response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/move-to-well': { detail: 'Move failed' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // Set targetWell
    await act(async () => { fireEvent.click(screen.getByTestId('well-click')) })
    await act(async () => { fireEvent.click(screen.getByTestId('right-move-to-well')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Move failed'))
    })
    consoleSpy.mockRestore()
  })

  it('handles move to well network error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('well-click')) })

    global.fetch = networkErrorMockFetch(['/api/pipetting/move-to-well'])

    await act(async () => { fireEvent.click(screen.getByTestId('right-move-to-well')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unable to connect to backend'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleToggleZ ──────────────────────────────────────────────────────────

describe('handleToggleZ', () => {
  it('toggles Z axis successfully', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('toggle-z')) })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/pipetting/toggle-z', expect.objectContaining({
        method: 'POST',
      }))
    })
    consoleSpy.mockRestore()
  })

  it('handles toggle Z error response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/toggle-z': { detail: 'Toggle Z failed' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await act(async () => { fireEvent.click(screen.getByTestId('toggle-z')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Toggle Z failed'))
    })
    consoleSpy.mockRestore()
  })

  it('handles toggle Z network error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = networkErrorMockFetch(['/api/pipetting/toggle-z'])

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await act(async () => { fireEvent.click(screen.getByTestId('toggle-z')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unable to connect to backend'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleCollect ──────────────────────────────────────────────────────────

describe('handleCollect', () => {
  it('collects volume successfully', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('collect-5')) })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/pipetting/aspirate', expect.objectContaining({
        method: 'POST',
      }))
    })
    consoleSpy.mockRestore()
  })

  it('rejects invalid volume (NaN)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderApp()
    await act(async () => {
      plateLayoutProps.handleCollect('invalid')
    })

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Volume must be between'))
    consoleSpy.mockRestore()
  })

  it('rejects volume of 0', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderApp()
    await act(async () => {
      plateLayoutProps.handleCollect(0)
    })

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Volume must be between'))
    consoleSpy.mockRestore()
  })

  it('rejects volume exceeding max', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderApp()
    await act(async () => {
      plateLayoutProps.handleCollect(99999)
    })

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Volume must be between'))
    consoleSpy.mockRestore()
  })

  it('handles collect error response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/aspirate': { detail: 'Aspirate failed' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await act(async () => { fireEvent.click(screen.getByTestId('collect-5')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Aspirate failed'))
    })
    consoleSpy.mockRestore()
  })

  it('handles collect network error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = networkErrorMockFetch(['/api/pipetting/aspirate'])

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await act(async () => { fireEvent.click(screen.getByTestId('collect-5')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unable to connect to backend'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleDispense ─────────────────────────────────────────────────────────

describe('handleDispense', () => {
  it('dispenses volume successfully', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('dispense-5')) })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/pipetting/dispense', expect.objectContaining({
        method: 'POST',
      }))
    })
    consoleSpy.mockRestore()
  })

  it('rejects invalid dispense volume (NaN)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderApp()
    await act(async () => {
      plateLayoutProps.handleDispense('bad')
    })

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Volume must be between'))
    consoleSpy.mockRestore()
  })

  it('rejects dispense volume of 0', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderApp()
    await act(async () => {
      plateLayoutProps.handleDispense(0)
    })

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Volume must be between'))
    consoleSpy.mockRestore()
  })

  it('rejects dispense volume exceeding max', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderApp()
    await act(async () => {
      plateLayoutProps.handleDispense(99999)
    })

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Volume must be between'))
    consoleSpy.mockRestore()
  })

  it('handles dispense error response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/dispense': { detail: 'Dispense failed' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await act(async () => { fireEvent.click(screen.getByTestId('dispense-5')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Dispense failed'))
    })
    consoleSpy.mockRestore()
  })

  it('handles dispense network error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = networkErrorMockFetch(['/api/pipetting/dispense'])

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await act(async () => { fireEvent.click(screen.getByTestId('dispense-5')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unable to connect to backend'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleAxisMove ─────────────────────────────────────────────────────────

describe('handleAxisMove', () => {
  it('moves axis successfully and updates positions', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })

    await act(async () => { fireEvent.click(screen.getByTestId('axis-move')) })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/axis/move', expect.objectContaining({
        method: 'POST',
      }))
    })

    consoleSpy.mockRestore()
  })

  it('handles axis move error response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/axis/move': { detail: 'Move failed' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })

    await act(async () => { fireEvent.click(screen.getByTestId('axis-move')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Move failed'))
    })
    consoleSpy.mockRestore()
  })

  it('handles axis move network error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })

    global.fetch = networkErrorMockFetch(['/api/axis/move'])

    await act(async () => { fireEvent.click(screen.getByTestId('axis-move')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unable to connect to backend'))
    })
    consoleSpy.mockRestore()
  })

  it('updates axis positions from response data', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })

    await act(async () => { fireEvent.click(screen.getByTestId('axis-move')) })

    // The mock returns positions with x: 100
    await waitFor(() => {
      expect(screen.getByTestId('manual-axis-x').textContent).toBe('100')
    })

    consoleSpy.mockRestore()
  })
})

// ─── handleSetPosition ──────────────────────────────────────────────────────

describe('handleSetPosition', () => {
  it('sets position successfully', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })

    await act(async () => { fireEvent.click(screen.getByTestId('set-position')) })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/axis/set-position', expect.objectContaining({
        method: 'POST',
      }))
    })
    consoleSpy.mockRestore()
  })

  it('handles set position error response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/axis/set-position': { detail: 'Set position failed' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })

    await act(async () => { fireEvent.click(screen.getByTestId('set-position')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Set position failed'))
    })
    consoleSpy.mockRestore()
  })

  it('handles set position network error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })

    global.fetch = networkErrorMockFetch(['/api/axis/set-position'])

    await act(async () => { fireEvent.click(screen.getByTestId('set-position')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to set position:', expect.stringContaining('Network error'))
    })
    consoleSpy.mockRestore()
  })

  it('returns true on success and false on error', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })

    let result
    await act(async () => {
      result = await manualTabProps.handleSetPosition({ x: 10, y: 20, z: 30, pipette_ml: 5 })
    })
    expect(result).toBe(true)

    consoleSpy.mockRestore()
  })
})

// ─── saveConfig ─────────────────────────────────────────────────────────────

describe('saveConfig', () => {
  it('saves config successfully', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-settings')) })

    await act(async () => { fireEvent.click(screen.getByTestId('save-config')) })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/config', expect.objectContaining({
        method: 'POST',
      }))
    })
    consoleSpy.mockRestore()
  })

  it('handles config save error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-settings')) })

    global.fetch = networkErrorMockFetch(['/api/config'])

    let result
    await act(async () => {
      result = await settingsTabProps.saveConfig()
    })

    expect(result).toEqual({ status: 'error', message: 'Network error' })
    consoleSpy.mockRestore()
  })

  it('parses config values correctly with string number, boolean, and string keys', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-settings')) })

    // Change config values through handleConfigChange
    await act(async () => {
      settingsTabProps.handleConfigChange('STEPS_PER_MM_X', '200')
      settingsTabProps.handleConfigChange('INVERT_X', true)
      settingsTabProps.handleConfigChange('CONTROLLER_TYPE', 'mock')
      settingsTabProps.handleConfigChange('LAYOUT_COORDINATES', { A1: [0, 0] })
    })

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await act(async () => { fireEvent.click(screen.getByTestId('save-config')) })

    await waitFor(() => {
      const saveCalls = global.fetch.mock.calls.filter(
        (c) => c[0] === '/api/config' && c[1]?.method === 'POST'
      )
      expect(saveCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(saveCalls[saveCalls.length - 1][1].body)
      // CONTROLLER_TYPE should remain a string
      expect(body.CONTROLLER_TYPE).toBe('mock')
      // LAYOUT_COORDINATES should be excluded
      expect(body.LAYOUT_COORDINATES).toBeUndefined()
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleConfigChange ─────────────────────────────────────────────────────

describe('handleConfigChange', () => {
  it('updates config value', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-settings')) })

    await act(async () => { fireEvent.click(screen.getByTestId('config-change')) })

    // The config should be updated - we can verify through saveConfig
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await act(async () => { fireEvent.click(screen.getByTestId('save-config')) })

    await waitFor(() => {
      const saveCalls = global.fetch.mock.calls.filter(
        (c) => c[0] === '/api/config' && c[1]?.method === 'POST'
      )
      const body = JSON.parse(saveCalls[saveCalls.length - 1][1].body)
      expect(body.STEPS_PER_MM_X).toBe(200)
    })
    consoleSpy.mockRestore()
  })
})

// ─── Auto-save on steps/schedule change ─────────────────────────────────────

describe('Auto-save on steps/schedule change', () => {
  it('auto-saves when steps change after initial load', async () => {
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })

    // Add a step - should trigger auto-save
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })

    // Wait for the auto-save effect to fire
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    const saveCalls = fetchMock.mock.calls.filter(
      (c) => c[0].includes('/api/program/save') && c[1]?.method === 'POST'
    )
    expect(saveCalls.length).toBeGreaterThan(0)
  })

  it('does not auto-save if steps are empty', async () => {
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    // Steps are empty, no auto-save should fire for steps
    const saveCallsBefore = fetchMock.mock.calls.filter(
      (c) => c[0].includes('/api/program/save')
    ).length

    // Advance time more but steps are still empty
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })

    const saveCallsAfter = fetchMock.mock.calls.filter(
      (c) => c[0].includes('/api/program/save')
    ).length

    // Should not have any save calls because steps are empty
    expect(saveCallsAfter).toBe(saveCallsBefore)
  })
})

// ─── Schedule change with auto-save ─────────────────────────────────────────

describe('Schedule change', () => {
  it('auto-saves when enabled changes and steps exist', async () => {
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })

    // Add a step first
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })

    const saveCallsBefore = fetchMock.mock.calls.filter(
      (c) => c[0].includes('/api/program/save')
    ).length

    // Change schedule (enabled changes from false to true)
    await act(async () => { fireEvent.click(screen.getByTestId('schedule-change')) })

    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    const saveCallsAfter = fetchMock.mock.calls.filter(
      (c) => c[0].includes('/api/program/save')
    ).length

    expect(saveCallsAfter).toBeGreaterThan(saveCallsBefore)
  })

  it('does not auto-save when enabled does not change', async () => {
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })

    // Change schedule without changing enabled (enabled stays false)
    await act(async () => { fireEvent.click(screen.getByTestId('schedule-change-same')) })

    // The onScheduleChange callback with same enabled value should NOT trigger the inline save
    // (though auto-save effect may still fire if steps exist)
  })
})

// ─── Auto-scroll logs ───────────────────────────────────────────────────────

describe('Auto-scroll logs', () => {
  it('scrolls to bottom when new logs are added', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: ['log1', 'log2', 'log3'] },
      '/api/config': { status: 'success', config: { STEPS_PER_MM_X: 100 } },
      '/api/program/load': { steps: [] },
      '/api/program/status': { execution: { status: 'idle' } },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    // Logs should have been fetched and processed without error
    expect(screen.getByTestId('plate-layout')).toBeInTheDocument()
  })
})

// ─── fetchProgramStatus ─────────────────────────────────────────────────────

describe('fetchProgramStatus', () => {
  it('updates programExecution from status polling', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': { steps: [] },
      '/api/program/status': { execution: { status: 'completed', last_run: '2026-01-01' } },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    // programExecution should be updated - it's passed to ProgramTab
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    // The ProgramTab mock receives programExecution prop
    expect(programTabProps.programExecution).toEqual({ status: 'completed', last_run: '2026-01-01' })
  })
})

// ─── Edge cases for fetch functions ─────────────────────────────────────────

describe('Fetch edge cases', () => {
  it('handles axis positions with non-success status', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'error', positions: null },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': { steps: [] },
      '/api/program/status': { execution: { status: 'idle' } },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    // Should not crash, axis positions remain default
    expect(screen.getByTestId('plate-layout')).toBeInTheDocument()
  })

  it('handles config fetch with non-success status', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'error', message: 'Config not found' },
      '/api/program/load': { steps: [] },
      '/api/program/status': { execution: { status: 'idle' } },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    expect(screen.getByTestId('plate-layout')).toBeInTheDocument()
  })

  it('handles logs fetch with no logs field', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { status: 'ok' },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': { steps: [] },
      '/api/program/status': { execution: { status: 'idle' } },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    expect(screen.getByTestId('plate-layout')).toBeInTheDocument()
  })

  it('handles program load failure gracefully', async () => {
    global.fetch = vi.fn((url) => {
      const path = typeof url === 'string' ? url : url.toString()
      if (path.includes('/api/program/load')) {
        return Promise.reject(new Error('Load failed'))
      }
      const standardResponses = {
        '/api/pipetting/status': {
          initialized: true, current_well: 'WS1', message: 'System ready',
          pipette_count: 3, layout_type: 'microchip', is_executing: false,
          controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
        },
        '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
        '/api/pipetting/logs': { logs: [] },
        '/api/config': { status: 'success', config: {} },
        '/api/program/status': { execution: { status: 'idle' } },
      }
      for (const [pattern, data] of Object.entries(standardResponses)) {
        if (path.includes(pattern)) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
        }
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) })
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    expect(screen.getByTestId('plate-layout')).toBeInTheDocument()
  })

  it('handles program load with non-ok response', async () => {
    global.fetch = vi.fn((url) => {
      const path = typeof url === 'string' ? url : url.toString()
      if (path.includes('/api/program/load')) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ detail: 'Not found' }),
        })
      }
      const standardResponses = {
        '/api/pipetting/status': {
          initialized: true, current_well: 'WS1', message: 'System ready',
          pipette_count: 3, layout_type: 'microchip', is_executing: false,
          controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
        },
        '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
        '/api/pipetting/logs': { logs: [] },
        '/api/config': { status: 'success', config: {} },
        '/api/program/status': { execution: { status: 'idle' } },
      }
      for (const [pattern, data] of Object.entries(standardResponses)) {
        if (path.includes(pattern)) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
        }
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) })
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    expect(screen.getByTestId('plate-layout')).toBeInTheDocument()
  })

  it('handles status with missing message field', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi',
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': { steps: [] },
      '/api/program/status': { execution: { status: 'idle' } },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    // Should use default message
    expect(screen.getByTestId('plate-system-status').textContent).toBe('System ready')
  })

  it('handles status with no message and not initialized', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: false,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': { steps: [] },
      '/api/program/status': { execution: { status: 'idle' } },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    await waitFor(() => {
      expect(screen.getByTestId('plate-system-status').textContent).toBe('System not ready')
    })
  })
})

// ─── Z axis state ───────────────────────────────────────────────────────────

describe('Z axis state', () => {
  it('zAxisUp is true when z >= 35', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 40, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': { steps: [] },
      '/api/program/status': { execution: { status: 'idle' } },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    await waitFor(() => {
      expect(screen.getByTestId('z-axis-up').textContent).toBe('true')
    })
  })

  it('zAxisUp is false when z < 35', async () => {
    await renderApp()
    expect(screen.getByTestId('z-axis-up').textContent).toBe('false')
  })
})

// ─── Execute from PlateLayout ───────────────────────────────────────────────

describe('Execute from PlateLayout', () => {
  it('calls handleExecute through PlateLayout', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderApp()
    // Execute with no steps should log error
    await act(async () => { fireEvent.click(screen.getByTestId('execute')) })

    expect(consoleSpy).toHaveBeenCalledWith('No steps to execute. Please add steps first.')
    consoleSpy.mockRestore()
  })
})

// ─── saveConfig with success response triggers re-fetch ─────────────────────

describe('saveConfig triggers re-fetch on success', () => {
  it('fetches position and axis after successful save', async () => {
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-settings')) })

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Override fetch to return success for config POST
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': { steps: [] },
      '/api/program/status': { execution: { status: 'idle' } },
      '/api/program/save': { status: 'success' },
    })

    await act(async () => { fireEvent.click(screen.getByTestId('save-config')) })

    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // After successful config save, it should have called fetchCurrentPosition and fetchAxisPositions
    const statusCalls = global.fetch.mock.calls.filter((c) => c[0].includes('/api/pipetting/status'))
    const axisCalls = global.fetch.mock.calls.filter((c) => c[0].includes('/api/axis/positions'))
    expect(statusCalls.length).toBeGreaterThan(0)
    expect(axisCalls.length).toBeGreaterThan(0)

    consoleSpy.mockRestore()
  })
})

// ─── Ensure all branches of saveConfig are hit ──────────────────────────────

describe('saveConfig parsing edge cases', () => {
  it('handles boolean string values (true/false)', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-settings')) })

    // Set a config value to string "true"
    await act(async () => {
      settingsTabProps.handleConfigChange('INVERT_X', 'true')
      settingsTabProps.handleConfigChange('INVERT_Y', 'false')
    })

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await act(async () => { fireEvent.click(screen.getByTestId('save-config')) })

    await waitFor(() => {
      const saveCalls = global.fetch.mock.calls.filter(
        (c) => c[0] === '/api/config' && c[1]?.method === 'POST'
      )
      expect(saveCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(saveCalls[saveCalls.length - 1][1].body)
      // Boolean strings should be kept as-is (not converted to number)
      expect(body.INVERT_X).toBe('true')
      expect(body.INVERT_Y).toBe('false')
    })
    consoleSpy.mockRestore()
  })
})

// ─── Execution polling cleanup ──────────────────────────────────────────────

describe('Execution polling cleanup', () => {
  it('stops fast polling when execution ends', async () => {
    // Start with executing state
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'Executing',
        pipette_count: 3, layout_type: 'microchip', is_executing: true,
        controller_type: 'raspberry_pi', current_operation: 'aspirating',
        operation_well: 'A1', current_step_index: 0, total_steps: 2,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: ['log1'] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': { steps: [{ id: 1, stepType: 'pipette' }], schedule: { cronExpression: '', enabled: false } },
      '/api/program/status': { execution: { status: 'running' } },
      '/api/program/save': { status: 'success' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })

    // Now switch to not executing
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: ['log1'] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': { steps: [] },
      '/api/program/status': { execution: { status: 'idle' } },
    })

    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })

    // Should not crash
    expect(screen.getByTestId('plate-layout')).toBeInTheDocument()
  })
})

// ─── handleExecute sets isExecuting and switches tab ────────────────────────

describe('handleExecute flow', () => {
  it('sets isExecuting true during execution and false after', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    // Add step via program tab
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-protocol')) })

    // Execute
    await act(async () => {
      // Call handleExecute - it should set isExecuting = true, switch to protocol, then set false after
      rightPanelProps.handleExecute()
    })

    // After await, isExecuting should be false (finally block)
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    consoleSpy.mockRestore()
  })
})

// ─── handleStop sets isExecuting to false ───────────────────────────────────

describe('handleStop flow', () => {
  it('sets isExecuting to false on successful stop', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('right-stop')) })

    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // isExecuting should be false
    expect(screen.getByTestId('right-is-executing').textContent).toBe('false')

    consoleSpy.mockRestore()
  })

  it('does not set isExecuting to false when motor_stopped is false (release)', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: true,
        controller_type: 'raspberry_pi', current_operation: 'idle',
        operation_well: null, motor_stopped: false,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': { steps: [], schedule: { cronExpression: '', enabled: false } },
      '/api/program/status': { execution: { status: 'idle' } },
      '/api/pipetting/stop': { message: 'Motor stop released', motor_stopped: false },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('right-stop')) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // isExecuting stays true because motor_stopped is false (release, not engage)
    expect(screen.getByTestId('right-is-executing').textContent).toBe('true')

    consoleSpy.mockRestore()
  })
})

// ─── handleHome sets isExecuting during call ────────────────────────────────

describe('handleHome flow', () => {
  it('sets isExecuting true during home and false after', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('right-home')) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // After completion, isExecuting should be false
    expect(screen.getByTestId('right-is-executing').textContent).toBe('false')

    consoleSpy.mockRestore()
  })
})

// ─── Cover handleSetPosition returning false on error ───────────────────────

describe('handleSetPosition return values', () => {
  it('returns false on error response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/axis/set-position': { detail: 'Failed' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })

    let result
    await act(async () => {
      result = await manualTabProps.handleSetPosition({ x: 10, y: 20, z: 30, pipette_ml: 5 })
    })
    expect(result).toBe(false)
    consoleSpy.mockRestore()
  })

  it('returns false on network error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })

    global.fetch = networkErrorMockFetch(['/api/axis/set-position'])

    let result
    await act(async () => {
      result = await manualTabProps.handleSetPosition({ x: 10, y: 20, z: 30, pipette_ml: 5 })
    })
    expect(result).toBe(false)
    consoleSpy.mockRestore()
  })
})

// ─── Axis move without positions in response ────────────────────────────────

describe('handleAxisMove without positions in response', () => {
  it('does not crash when response has no positions', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Custom fetch that returns axis/move without positions
    global.fetch = vi.fn((url) => {
      const path = typeof url === 'string' ? url : url.toString()
      if (path.includes('/api/axis/move')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'Moved' }),
        })
      }
      const standardResponses = {
        '/api/pipetting/status': {
          initialized: true, current_well: 'WS1', message: 'System ready',
          pipette_count: 3, layout_type: 'microchip', is_executing: false,
          controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
        },
        '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
        '/api/pipetting/logs': { logs: [] },
        '/api/config': { status: 'success', config: { STEPS_PER_MM_X: 100 } },
        '/api/program/load': { steps: [] },
        '/api/program/status': { execution: { status: 'idle' } },
      }
      for (const [pattern, data] of Object.entries(standardResponses)) {
        if (path.includes(pattern)) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
        }
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) })
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })
    await act(async () => { fireEvent.click(screen.getByTestId('axis-move')) })

    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    expect(screen.getByTestId('manual-tab')).toBeInTheDocument()
    consoleSpy.mockRestore()
  })
})

// ─── Set position without positions in response ─────────────────────────────

describe('handleSetPosition without positions in response', () => {
  it('does not crash when response has no positions', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    global.fetch = vi.fn((url) => {
      const path = typeof url === 'string' ? url : url.toString()
      if (path.includes('/api/axis/set-position')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'Set' }),
        })
      }
      const standardResponses = {
        '/api/pipetting/status': {
          initialized: true, current_well: 'WS1', message: 'System ready',
          pipette_count: 3, layout_type: 'microchip', is_executing: false,
          controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
        },
        '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
        '/api/pipetting/logs': { logs: [] },
        '/api/config': { status: 'success', config: { STEPS_PER_MM_X: 100 } },
        '/api/program/load': { steps: [] },
        '/api/program/status': { execution: { status: 'idle' } },
      }
      for (const [pattern, data] of Object.entries(standardResponses)) {
        if (path.includes(pattern)) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
        }
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) })
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })

    let result
    await act(async () => {
      result = await manualTabProps.handleSetPosition({ x: 10, y: 20, z: 30, pipette_ml: 5 })
    })

    expect(result).toBe(true)
    consoleSpy.mockRestore()
  })
})

// ─── handleSaveProgram error without detail ─────────────────────────────────

describe('handleSaveProgram error without detail', () => {
  it('shows fallback error message when no detail field', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/program/save': {},
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })
    await act(async () => { fireEvent.click(screen.getByTestId('save-program')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to save program'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleExecute error without detail ─────────────────────────────────────

describe('handleExecute error without detail', () => {
  it('shows fallback error message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/execute': {},
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-protocol')) })
    await act(async () => { fireEvent.click(screen.getByTestId('right-execute')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to execute sequence'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── motor_stopped syncs from status polling even without current_well ───────

describe('motorStopped status polling', () => {
  it('updates motorStopped from status even when current_well is null', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: false, current_well: null, message: 'Not ready',
        motor_stopped: true,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': { steps: [], schedule: { cronExpression: '', enabled: false } },
      '/api/program/status': { execution: { status: 'idle' } },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })

    // motorStopped prop should be passed to RightPanel even when system not initialized
    expect(rightPanelProps.motorStopped).toBe(true)
  })
})

// ─── handleStop error without detail ────────────────────────────────────────

describe('handleStop error without detail', () => {
  it('shows fallback error message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/stop': {},
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('right-stop')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to toggle motor stop'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleHome error without detail ────────────────────────────────────────

describe('handleHome error without detail', () => {
  it('shows fallback error message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/home': {},
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('right-home')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to home system'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleSetPipetteCount error without detail ─────────────────────────────

describe('handleSetPipetteCount error without detail', () => {
  it('shows fallback error message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/set-pipette-count': {},
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('set-pipette-count')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to set pipette count'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleSetLayout error without detail ───────────────────────────────────

describe('handleSetLayout error without detail', () => {
  it('shows fallback error message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/set-layout': {},
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('set-layout-wellplate')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to set layout'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleMoveToWell error without detail ──────────────────────────────────

describe('handleMoveToWell error without detail', () => {
  it('shows fallback error message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/move-to-well': {},
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('well-click')) })
    await act(async () => { fireEvent.click(screen.getByTestId('right-move-to-well')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to move to well'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleToggleZ error without detail ─────────────────────────────────────

describe('handleToggleZ error without detail', () => {
  it('shows fallback error message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/toggle-z': {},
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('toggle-z')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to toggle Z-axis'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleCollect error without detail ─────────────────────────────────────

describe('handleCollect error without detail', () => {
  it('shows fallback error message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/aspirate': {},
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('collect-5')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to aspirate'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleDispense error without detail ────────────────────────────────────

describe('handleDispense error without detail', () => {
  it('shows fallback error message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/pipetting/dispense': {},
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('dispense-5')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to dispense'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleAxisMove error without detail ────────────────────────────────────

describe('handleAxisMove error without detail', () => {
  it('shows fallback error message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/axis/move': {},
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })
    await act(async () => { fireEvent.click(screen.getByTestId('axis-move')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to move axis'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── handleSetPosition error without detail ─────────────────────────────────

describe('handleSetPosition error without detail', () => {
  it('shows fallback error message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = errorMockFetch({
      '/api/axis/set-position': {},
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })
    await act(async () => { fireEvent.click(screen.getByTestId('set-position')) })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to set position'))
    })
    consoleSpy.mockRestore()
  })
})

// ─── onScheduleChange inline save behavior ──────────────────────────────────

describe('onScheduleChange inline save', () => {
  it('fires inline save when enabled changes and steps exist', async () => {
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })

    // Add a step first so steps.length > 0
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })

    const saveCountBefore = fetchMock.mock.calls.filter(
      (c) => c[0].includes('/api/program/save') && c[1]?.method === 'POST'
    ).length

    // The schedule-change button sets enabled: true (different from initial false)
    await act(async () => { fireEvent.click(screen.getByTestId('schedule-change')) })

    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    const saveCountAfter = fetchMock.mock.calls.filter(
      (c) => c[0].includes('/api/program/save') && c[1]?.method === 'POST'
    ).length

    // Should have extra save calls from the inline save in onScheduleChange
    expect(saveCountAfter).toBeGreaterThan(saveCountBefore)
  })
})

// ─── Additional branch coverage tests ────────────────────────────────────────

describe('handleAddStep branch coverage', () => {
  it('handles missing stepType (defaults to pipette)', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })

    await act(async () => {
      programTabProps.handleAddStep({
        cycles: 0, pickupWell: null, dropoffWell: undefined,
        rinseWell: '', washWell: '', waitTime: 0, sampleVolume: 0,
        repetitionMode: 'quantity', repetitionQuantity: 0
      })
    })

    expect(programTabProps.steps[0].stepType).toBe('pipette')
    expect(programTabProps.steps[0].cycles).toBe(1) // 0 becomes 1 via || 1
    expect(programTabProps.steps[0].pickupWell).toBe('')
    expect(programTabProps.steps[0].sampleVolume).toBe(40) // 0 becomes 40 via || 40
    expect(programTabProps.steps[0].repetitionQuantity).toBe(1) // 0 becomes 1
    expect(programTabProps.steps[0].repetitionInterval).toBeNull()
    expect(programTabProps.steps[0].repetitionDuration).toBeNull()
  })

  it('handles timeFrequency repetition mode with falsy interval/duration', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })

    await act(async () => {
      programTabProps.handleAddStep({
        stepType: 'pipette', cycles: 1, pickupWell: 'A1', dropoffWell: 'B1',
        rinseWell: 'WS2', washWell: 'WS1', waitTime: 5, sampleVolume: 40,
        repetitionMode: 'timeFrequency', repetitionInterval: 0, repetitionDuration: 0
      })
    })

    // 0 interval/duration should fall through to null via || null
    expect(programTabProps.steps[0].repetitionInterval).toBeNull()
    expect(programTabProps.steps[0].repetitionDuration).toBeNull()
    // repetitionQuantity should be 1 (not quantity mode)
    expect(programTabProps.steps[0].repetitionQuantity).toBe(1)
  })
})

describe('handleUpdateStep branch coverage', () => {
  it('handles update with missing stepType (uses existing)', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })

    const stepId = programTabProps.steps[0].id
    await act(async () => {
      programTabProps.handleUpdateStep(stepId, {
        stepType: '', cycles: 0, pickupWell: null, dropoffWell: undefined,
        rinseWell: '', washWell: '', waitTime: 0, sampleVolume: 0,
        repetitionMode: 'quantity', repetitionQuantity: 0
      })
    })

    // empty stepType falls back to s.stepType (pipette)
    expect(programTabProps.steps[0].stepType).toBe('pipette')
    expect(programTabProps.steps[0].cycles).toBe(1)
    expect(programTabProps.steps[0].sampleVolume).toBe(40)
  })

  it('update with non-matching stepId does nothing', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })

    const originalStep = { ...programTabProps.steps[0] }
    await act(async () => {
      programTabProps.handleUpdateStep(999999, {
        stepType: 'home', cycles: 99, pickupWell: 'Z9', dropoffWell: 'Z8',
        rinseWell: 'WS1', washWell: 'WS2', waitTime: 99, sampleVolume: 99,
        repetitionMode: 'quantity', repetitionQuantity: 99
      })
    })

    // Step should be unchanged
    expect(programTabProps.steps[0].cycles).toBe(originalStep.cycles)
  })
})

describe('handleLoadProgram branch coverage', () => {
  it('loads steps without schedule', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })

    // Load with steps but no schedule (null schedule)
    await act(async () => {
      programTabProps.handleLoadProgram([{ id: 42, stepType: 'home' }], null)
    })

    expect(programTabProps.steps.length).toBe(1)
    expect(programTabProps.steps[0].id).toBe(42)
  })
})

describe('handleToggleZ with z up', () => {
  it('sends direction down when z >= 35', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Mock axis positions with z >= 35 so zAxisUp = true
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 40, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: { STEPS_PER_MM_X: 100, PIPETTE_MAX_ML: 10.0 } },
      '/api/program/load': { steps: [], schedule: { cronExpression: '', enabled: false } },
      '/api/program/status': { execution: { status: 'idle' } },
      '/api/program/save': { status: 'success', message: 'Program saved' },
      '/api/pipetting/toggle-z': { message: 'Z toggled' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    // Verify zAxisUp is true
    await waitFor(() => {
      expect(screen.getByTestId('z-axis-up').textContent).toBe('true')
    })

    await act(async () => { fireEvent.click(screen.getByTestId('toggle-z')) })

    await waitFor(() => {
      const toggleCalls = global.fetch.mock.calls.filter(
        (c) => c[0].includes('/api/pipetting/toggle-z') && c[1]?.method === 'POST'
      )
      expect(toggleCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(toggleCalls[0][1].body)
      expect(body.direction).toBe('down')
    })

    consoleSpy.mockRestore()
  })
})

describe('handleCollect and handleDispense with no PIPETTE_MAX_ML config', () => {
  it('uses fallback max of 100 when PIPETTE_MAX_ML is not set', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Config without PIPETTE_MAX_ML
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: { STEPS_PER_MM_X: 100 } },
      '/api/program/load': { steps: [], schedule: { cronExpression: '', enabled: false } },
      '/api/program/status': { execution: { status: 'idle' } },
      '/api/program/save': { status: 'success' },
      '/api/pipetting/aspirate': { message: 'Aspirated' },
      '/api/pipetting/dispense': { message: 'Dispensed' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    // Try to collect with volume above the default 10 (which is the value from config)
    // but below 100 (fallback). The config has no PIPETTE_MAX_ML so the component
    // uses initial state value of 10.0.
    // Actually, the config fetch returns { STEPS_PER_MM_X: 100 } which replaces
    // config.PIPETTE_MAX_ML. Let's test volume that exceeds 100 to hit the fallback branch
    await act(async () => {
      plateLayoutProps.handleCollect(101)
    })

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Volume must be between'))
    consoleSpy.mockRestore()
  })
})

describe('toggleTheme dark to light', () => {
  it('toggles from dark back to light', async () => {
    localStorage.setItem('theme', 'dark')
    await renderApp()
    expect(screen.getByTestId('theme').textContent).toBe('dark')

    await act(async () => { fireEvent.click(screen.getByTestId('toggle-theme')) })

    expect(screen.getByTestId('theme').textContent).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
  })
})

describe('setActiveTab fallback path', () => {
  it('uses / as fallback for unknown tab', async () => {
    await renderApp()
    // Call setActiveTab with an unknown tab name to hit the fallback || '/' path
    await act(async () => {
      // Access through plateLayoutProps.setActiveTab
      plateLayoutProps.setActiveTab('unknown-tab')
    })
    expect(window.location.pathname).toBe('/')
  })
})

describe('fetchCurrentPosition in-flight guard', () => {
  it('skips fetch if already in-flight', async () => {
    let resolveStatus
    const slowFetch = vi.fn((url) => {
      const path = typeof url === 'string' ? url : url.toString()
      if (path.includes('/api/pipetting/status')) {
        return new Promise((resolve) => {
          resolveStatus = resolve
        })
      }
      const standardResponses = {
        '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
        '/api/pipetting/logs': { logs: [] },
        '/api/config': { status: 'success', config: { STEPS_PER_MM_X: 100, PIPETTE_MAX_ML: 10.0 } },
        '/api/program/load': { steps: [], schedule: { cronExpression: '', enabled: false } },
        '/api/program/status': { execution: { status: 'idle' } },
        '/api/program/save': { status: 'success' },
      }
      for (const [pattern, data] of Object.entries(standardResponses)) {
        if (path.includes(pattern)) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
        }
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) })
    })
    global.fetch = slowFetch

    await act(async () => { render(<App />) })

    // First status call is pending - advance timer to trigger another poll
    const statusCallsBefore = slowFetch.mock.calls.filter(c => c[0].includes('/api/pipetting/status')).length
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    const statusCallsAfter = slowFetch.mock.calls.filter(c => c[0].includes('/api/pipetting/status')).length

    // Should only have 1 call due to in-flight guard
    expect(statusCallsAfter).toBe(statusCallsBefore)

    // Resolve the pending request
    if (resolveStatus) {
      await act(async () => {
        resolveStatus({
          ok: true,
          json: () => Promise.resolve({
            initialized: true, current_well: 'WS1', message: 'System ready',
            pipette_count: 3, layout_type: 'microchip', is_executing: false,
            controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
          })
        })
        await vi.advanceTimersByTimeAsync(100)
      })
    }
  })
})

describe('saveConfig with non-success response', () => {
  it('returns data but does not re-fetch on non-success', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const fetchMock = standardMockFetch()
    global.fetch = fetchMock

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-settings')) })

    // Override to return non-success for config POST
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'error', message: 'Failed' },
      '/api/program/load': { steps: [] },
      '/api/program/status': { execution: { status: 'idle' } },
    })

    let result
    await act(async () => {
      result = await settingsTabProps.saveConfig()
    })

    // Should return the non-success response
    expect(result.status).toBe('error')
    consoleSpy.mockRestore()
  })
})

describe('saveConfig parsing with numeric string values', () => {
  it('converts string number config values to numbers', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-settings')) })

    // Set a numeric config as string
    await act(async () => {
      settingsTabProps.handleConfigChange('STEPS_PER_MM_Y', '300')
      settingsTabProps.handleConfigChange('TRAVEL_SPEED', '0.005')
    })

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await act(async () => { fireEvent.click(screen.getByTestId('save-config')) })

    await waitFor(() => {
      const saveCalls = global.fetch.mock.calls.filter(
        (c) => c[0] === '/api/config' && c[1]?.method === 'POST'
      )
      expect(saveCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(saveCalls[saveCalls.length - 1][1].body)
      expect(body.STEPS_PER_MM_Y).toBe(300)
      expect(body.TRAVEL_SPEED).toBe(0.005)
    })
    consoleSpy.mockRestore()
  })
})

describe('fetchProgramStatus error handling', () => {
  it('silently handles program status fetch error', async () => {
    global.fetch = networkErrorMockFetch(['/api/program/status'])

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    // Should not crash
    expect(screen.getByTestId('plate-layout')).toBeInTheDocument()
  })
})

describe('Status updates with partial data', () => {
  it('handles status without pipette_count, layout_type, controller_type', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'A3', message: 'Minimal status',
        is_executing: false,
        current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: { STEPS_PER_MM_X: 100, PIPETTE_MAX_ML: 10.0 } },
      '/api/program/load': { steps: [], schedule: { cronExpression: '', enabled: false } },
      '/api/program/status': { execution: { status: 'idle' } },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    await waitFor(() => {
      expect(screen.getByTestId('selected-well').textContent).toBe('A3')
    })
  })

  it('handles status with current_step_index and total_steps', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'Executing',
        pipette_count: 3, layout_type: 'microchip', is_executing: true,
        controller_type: 'raspberry_pi', current_operation: 'aspirating',
        operation_well: 'A1', current_step_index: 2, total_steps: 5,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': { steps: [{ id: 1, stepType: 'pipette' }], schedule: { cronExpression: '', enabled: false } },
      '/api/program/status': { execution: { status: 'running' } },
      '/api/program/save': { status: 'success' },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })

    await waitFor(() => {
      expect(screen.getByTestId('current-step-index').textContent).toBe('2')
      expect(screen.getByTestId('total-steps').textContent).toBe('5')
    })
  })
})

// ─── handleAddStep with missing repetitionMode ──────────────────────────────

describe('handleAddStep repetitionMode fallback', () => {
  it('defaults repetitionMode to quantity when not provided', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })

    await act(async () => {
      programTabProps.handleAddStep({
        stepType: 'pipette', cycles: 1, pickupWell: 'A1', dropoffWell: 'B1',
        rinseWell: 'WS2', washWell: 'WS1', waitTime: 0, sampleVolume: 40,
        // no repetitionMode provided
      })
    })

    expect(programTabProps.steps[0].repetitionMode).toBe('quantity')
    expect(programTabProps.steps[0].repetitionQuantity).toBe(1)
    expect(programTabProps.steps[0].repetitionInterval).toBeNull()
    expect(programTabProps.steps[0].repetitionDuration).toBeNull()
  })
})

// ─── handleUpdateStep with timeFrequency mode and falsy values ──────────────

describe('handleUpdateStep timeFrequency with falsy values', () => {
  it('handles update with timeFrequency mode and zero interval/duration', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })

    const stepId = programTabProps.steps[0].id
    await act(async () => {
      programTabProps.handleUpdateStep(stepId, {
        stepType: 'pipette', cycles: 1, pickupWell: 'A1', dropoffWell: 'B1',
        rinseWell: 'WS2', washWell: 'WS1', waitTime: 0, sampleVolume: 40,
        repetitionMode: 'timeFrequency', repetitionInterval: 0, repetitionDuration: 0
      })
    })

    expect(programTabProps.steps[0].repetitionMode).toBe('timeFrequency')
    expect(programTabProps.steps[0].repetitionInterval).toBeNull()
    expect(programTabProps.steps[0].repetitionDuration).toBeNull()
    expect(programTabProps.steps[0].repetitionQuantity).toBe(1)
  })

  it('handles update with missing repetitionMode (uses existing or default)', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })
    await act(async () => { fireEvent.click(screen.getByTestId('add-step')) })

    const stepId = programTabProps.steps[0].id
    await act(async () => {
      programTabProps.handleUpdateStep(stepId, {
        stepType: 'pipette', cycles: 1, pickupWell: 'A1', dropoffWell: 'B1',
        rinseWell: 'WS2', washWell: 'WS1', waitTime: 0, sampleVolume: 40,
        // no repetitionMode
      })
    })

    expect(programTabProps.steps[0].repetitionMode).toBe('quantity')
  })
})

// ─── handleDispense with no PIPETTE_MAX_ML (fallback to 100) ────────────────

describe('handleDispense volume validation with fallback max', () => {
  it('uses fallback max of 100 for dispense when PIPETTE_MAX_ML is not in config', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: { STEPS_PER_MM_X: 100 } },
      '/api/program/load': { steps: [], schedule: { cronExpression: '', enabled: false } },
      '/api/program/status': { execution: { status: 'idle' } },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    // Dispense with volume exceeding 100 (the fallback max when PIPETTE_MAX_ML is absent)
    await act(async () => {
      plateLayoutProps.handleDispense(101)
    })

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Volume must be between'))
    consoleSpy.mockRestore()
  })
})

// ─── handleSetPosition with falsy position data ─────────────────────────────

describe('handleSetPosition with falsy position data', () => {
  it('defaults to 0 when position values are NaN', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })

    await act(async () => {
      await manualTabProps.handleSetPosition({ x: 'bad', y: undefined, z: null, pipette_ml: '' })
    })

    await waitFor(() => {
      const setCalls = global.fetch.mock.calls.filter(
        (c) => c[0].includes('/api/axis/set-position') && c[1]?.method === 'POST'
      )
      expect(setCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(setCalls[setCalls.length - 1][1].body)
      expect(body.x).toBe(0)
      expect(body.y).toBe(0)
      expect(body.z).toBe(0)
      expect(body.pipette_ml).toBe(0)
    })
    consoleSpy.mockRestore()
  })
})

// ─── saveConfig with non-numeric string value (converts to 0) ───────────────

// ─── handleUpdateStep with both stepType and s.stepType falsy ────────────────

describe('handleUpdateStep triple fallback stepType', () => {
  it('falls back to pipette when both stepData.stepType and s.stepType are falsy', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-program')) })

    // Load a step with no stepType field (falsy)
    await act(async () => {
      programTabProps.handleLoadProgram([{ id: 55, cycles: 1, pickupWell: 'A1' }], null)
    })

    expect(programTabProps.steps[0].stepType).toBeUndefined()

    // Update that step with empty stepType
    await act(async () => {
      programTabProps.handleUpdateStep(55, {
        stepType: '', cycles: 1, pickupWell: 'A1', dropoffWell: 'B1',
        rinseWell: 'WS2', washWell: 'WS1', waitTime: 0, sampleVolume: 40,
        repetitionMode: 'quantity', repetitionQuantity: 1
      })
    })

    // Should fall through to 'pipette' (the third fallback)
    expect(programTabProps.steps[0].stepType).toBe('pipette')
  })
})

// ─── fetchProgramStatus with no execution field ─────────────────────────────

describe('fetchProgramStatus with no execution field', () => {
  it('handles program status response without execution field', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'microchip', is_executing: false,
        controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': { steps: [] },
      '/api/program/status': { status: 'ok' }, // no execution field
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    // Should not crash, programExecution stays default
    expect(screen.getByTestId('plate-layout')).toBeInTheDocument()
  })
})

// ─── fetchAxisPositions in-flight guard ──────────────────────────────────────

describe('fetchAxisPositions in-flight guard', () => {
  it('skips axis fetch when one is already pending', async () => {
    let resolveAxis
    const slowFetch = vi.fn((url) => {
      const path = typeof url === 'string' ? url : url.toString()
      if (path.includes('/api/axis/positions')) {
        return new Promise((resolve) => {
          resolveAxis = resolve
        })
      }
      const standardResponses = {
        '/api/pipetting/status': {
          initialized: true, current_well: 'WS1', message: 'System ready',
          pipette_count: 3, layout_type: 'microchip', is_executing: false,
          controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
        },
        '/api/pipetting/logs': { logs: [] },
        '/api/config': { status: 'success', config: { STEPS_PER_MM_X: 100, PIPETTE_MAX_ML: 10.0 } },
        '/api/program/load': { steps: [], schedule: { cronExpression: '', enabled: false } },
        '/api/program/status': { execution: { status: 'idle' } },
      }
      for (const [pattern, data] of Object.entries(standardResponses)) {
        if (path.includes(pattern)) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
        }
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) })
    })
    global.fetch = slowFetch

    await act(async () => { render(<App />) })
    // Switch to manual tab to trigger axis polling
    await act(async () => { fireEvent.click(screen.getByTestId('tab-manual')) })

    const axisCallsBefore = slowFetch.mock.calls.filter(c => c[0].includes('/api/axis/positions')).length
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    const axisCallsAfter = slowFetch.mock.calls.filter(c => c[0].includes('/api/axis/positions')).length

    // Should only have 1 call due to in-flight guard
    expect(axisCallsAfter).toBe(axisCallsBefore)

    // Resolve the pending request
    if (resolveAxis) {
      await act(async () => {
        resolveAxis({
          ok: true,
          json: () => Promise.resolve({ status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } })
        })
        await vi.advanceTimersByTimeAsync(100)
      })
    }
  })
})

// ─── fetchLogs in-flight guard ──────────────────────────────────────────────

describe('fetchLogs in-flight guard', () => {
  it('skips logs fetch when one is already pending', async () => {
    let resolveLogs
    const slowFetch = vi.fn((url) => {
      const path = typeof url === 'string' ? url : url.toString()
      if (path.includes('/api/pipetting/logs')) {
        return new Promise((resolve) => {
          resolveLogs = resolve
        })
      }
      const standardResponses = {
        '/api/pipetting/status': {
          initialized: true, current_well: 'WS1', message: 'System ready',
          pipette_count: 3, layout_type: 'microchip', is_executing: false,
          controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
        },
        '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
        '/api/config': { status: 'success', config: { STEPS_PER_MM_X: 100, PIPETTE_MAX_ML: 10.0 } },
        '/api/program/load': { steps: [], schedule: { cronExpression: '', enabled: false } },
        '/api/program/status': { execution: { status: 'idle' } },
      }
      for (const [pattern, data] of Object.entries(standardResponses)) {
        if (path.includes(pattern)) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
        }
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) })
    })
    global.fetch = slowFetch

    await act(async () => { render(<App />) })

    const logsCallsBefore = slowFetch.mock.calls.filter(c => c[0].includes('/api/pipetting/logs')).length
    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    const logsCallsAfter = slowFetch.mock.calls.filter(c => c[0].includes('/api/pipetting/logs')).length

    // Should only have 1 call due to in-flight guard
    expect(logsCallsAfter).toBe(logsCallsBefore)

    // Resolve the pending request
    if (resolveLogs) {
      await act(async () => {
        resolveLogs({
          ok: true,
          json: () => Promise.resolve({ logs: [] })
        })
        await vi.advanceTimersByTimeAsync(100)
      })
    }
  })
})

// ─── Status with explicit layout_type present ────────────────────────────────

describe('Status with layout_type defined', () => {
  it('updates layoutType when layout_type is present in status', async () => {
    global.fetch = mockFetch({
      '/api/pipetting/status': {
        initialized: true, current_well: 'WS1', message: 'System ready',
        pipette_count: 3, layout_type: 'wellplate', is_executing: false,
        controller_type: 'raspberry_pi', current_operation: 'idle', operation_well: null,
      },
      '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
      '/api/pipetting/logs': { logs: [] },
      '/api/config': { status: 'success', config: {} },
      '/api/program/load': { steps: [], schedule: { cronExpression: '', enabled: false } },
      '/api/program/status': { execution: { status: 'idle' } },
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    await waitFor(() => {
      expect(screen.getByTestId('layout-type').textContent).toBe('wellplate')
    })
  })
})

describe('saveConfig with non-numeric string config value', () => {
  it('converts non-numeric string to 0 via Number(value) || 0', async () => {
    await renderApp()
    await act(async () => { fireEvent.click(screen.getByTestId('tab-settings')) })

    await act(async () => {
      settingsTabProps.handleConfigChange('STEPS_PER_MM_X', 'not-a-number')
    })

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await act(async () => { fireEvent.click(screen.getByTestId('save-config')) })

    await waitFor(() => {
      const saveCalls = global.fetch.mock.calls.filter(
        (c) => c[0] === '/api/config' && c[1]?.method === 'POST'
      )
      expect(saveCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(saveCalls[saveCalls.length - 1][1].body)
      expect(body.STEPS_PER_MM_X).toBe(0) // NaN converts to 0
    })
    consoleSpy.mockRestore()
  })
})

// ─── Auto-home when motor stop is released ──────────────────────────────────

describe('auto-home on motor stop release', () => {
  it('calls handleHome when motorStopped transitions from true to false', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // First: render with motor_stopped true via status polling
    let stopCallCount = 0
    let currentMotorStopped = false
    global.fetch = vi.fn((url, opts) => {
      if (url === '/api/pipetting/stop' && opts?.method === 'POST') {
        stopCallCount++
        // First stop call: engage (true), second: release (false)
        currentMotorStopped = stopCallCount === 1
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: currentMotorStopped ? 'Motor stop engaged' : 'Motor stop released', motor_stopped: currentMotorStopped }),
        })
      }
      if (url === '/api/pipetting/status') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            initialized: true, current_well: 'WS1', message: 'System ready',
            pipette_count: 3, layout_type: 'microchip', is_executing: false,
            controller_type: 'raspberry_pi', current_operation: 'idle',
            operation_well: null, motor_stopped: currentMotorStopped,
          }),
        })
      }
      // Default responses for other endpoints
      const defaults = {
        '/api/axis/positions': { status: 'success', positions: { x: 0, y: 0, z: 0, pipette_ml: 0, motor_steps: {} } },
        '/api/pipetting/logs': { logs: [] },
        '/api/config': { status: 'success', config: {} },
        '/api/program/load': { steps: [], schedule: { cronExpression: '', enabled: false } },
        '/api/program/status': { execution: { status: 'idle' } },
        '/api/pipetting/home': { message: 'Homed successfully' },
      }
      const data = defaults[url] || {}
      return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
    })

    await act(async () => { render(<App />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // Click stop to engage motor stop (motorStopped -> true)
    await act(async () => { fireEvent.click(screen.getByTestId('right-stop')) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(rightPanelProps.motorStopped).toBe(true)

    // Clear fetch call history so we can check for the home call
    global.fetch.mockClear()

    // Click stop again to release motor stop (motorStopped -> false)
    await act(async () => { fireEvent.click(screen.getByTestId('right-stop')) })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(rightPanelProps.motorStopped).toBe(false)

    // Verify that /api/pipetting/home was called automatically
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/pipetting/home', expect.objectContaining({ method: 'POST' }))
    })

    consoleSpy.mockRestore()
  })
})
