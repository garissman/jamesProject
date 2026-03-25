import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import SettingsTab from './SettingsTab'
import { mockFetch } from '../test-utils'

function defaultConfig() {
  return {
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
    CONTROLLER_TYPE: 'raspberry_pi',
  }
}

function defaultProps(overrides = {}) {
  return {
    config: defaultConfig(),
    handleConfigChange: vi.fn(),
    saveConfig: vi.fn().mockResolvedValue({ status: 'success', message: 'Saved' }),
    controllerType: 'raspberry_pi',
    fetchCurrentPosition: vi.fn(),
    handleAxisMove: vi.fn(),
    axisPositions: { x: 10.5, y: 20.3, z: 0, pipette_ml: 0, motor_steps: {} },
    ...overrides,
  }
}

beforeEach(() => {
  global.fetch = mockFetch({
    '/api/coordinates/microchip': { status: 'success', coordinates: {} },
    '/api/coordinates/vial': { status: 'success', coordinates: {} },
    '/api/coordinates/capture': { x: 10.5, y: 20.3 },
    '/api/coordinates/save': { status: 'success' },
    '/api/config': { status: 'success', message: 'Config saved' },
    '/api/pipetting/set-controller-type': { status: 'success' },
    '/api/mcu/ping': { connected: true },
    '/api/led/test': { status: 'success' },
  })
})

// ─── Basic rendering ─────────────────────────────────────────────────────────

describe('SettingsTab rendering', () => {
  it('renders the page title and description', async () => {
    render(<SettingsTab {...defaultProps()} />)
    expect(screen.getByText('System Configuration')).toBeInTheDocument()
    expect(screen.getByText(/Configure hardware parameters/)).toBeInTheDocument()
  })

  it('renders sub-tab buttons', async () => {
    render(<SettingsTab {...defaultProps()} />)
    expect(screen.getByText('Coordinate Mapping')).toBeInTheDocument()
    expect(screen.getByText('Motor Settings')).toBeInTheDocument()
    expect(screen.getByText('Calibration')).toBeInTheDocument()
  })

  it('defaults to layout (Coordinate Mapping) sub-tab', async () => {
    render(<SettingsTab {...defaultProps()} />)
    expect(screen.getByText('Location Coordinate Mapping')).toBeInTheDocument()
  })

  it('hides current position when axisPositions is null', async () => {
    render(<SettingsTab {...defaultProps({ axisPositions: null })} />)
    expect(screen.queryByText(/Current Position:/)).not.toBeInTheDocument()
  })
})

// ─── Settings sub-tab navigation ─────────────────────────────────────────────

describe('Settings sub-tab navigation', () => {
  it('switching to Motor Settings shows motor config', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      expect(screen.getByText('Motor Configuration')).toBeInTheDocument()
      expect(screen.getByText('X-Axis Steps/mm:')).toBeInTheDocument()
      expect(screen.getByText('Y-Axis Steps/mm:')).toBeInTheDocument()
      expect(screen.getByText('Z-Axis Steps/mm:')).toBeInTheDocument()
    })
  })

  it('switching to Calibration shows calibration UI', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      expect(screen.getByText('Axis Calibration')).toBeInTheDocument()
      expect(screen.getByText('X-Axis')).toBeInTheDocument()
      expect(screen.getByText('Y-Axis')).toBeInTheDocument()
      expect(screen.getByText('Z-Axis')).toBeInTheDocument()
      expect(screen.getByText('Pipette')).toBeInTheDocument()
    })
  })

  it('clicking Coordinate Mapping tab after switching away returns to layout', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))
    await waitFor(() => {
      expect(screen.getByText('Axis Calibration')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Coordinate Mapping'))
    await waitFor(() => {
      expect(screen.getByText('Location Coordinate Mapping')).toBeInTheDocument()
    })
  })
})

// ─── Coordinate Mapping sub-tab ──────────────────────────────────────────────

describe('Coordinate Mapping', () => {
  it('shows current position', async () => {
    render(<SettingsTab {...defaultProps()} />)
    await waitFor(() => {
      expect(screen.getByText(/Current Position:/)).toBeInTheDocument()
      expect(screen.getByText(/X=10\.50 mm/)).toBeInTheDocument()
      expect(screen.getByText(/Y=20\.30 mm/)).toBeInTheDocument()
    })
  })

  it('renders layout selector with MicroChip and Vial options', async () => {
    render(<SettingsTab {...defaultProps()} />)
    const select = screen.getByDisplayValue('MicroChip')
    expect(select).toBeInTheDocument()

    // Check options
    const options = select.querySelectorAll('option')
    expect(options.length).toBe(2)
    expect(options[0].textContent).toBe('MicroChip')
    expect(options[1].textContent).toBe('Vial')
  })

  it('renders well table headers', async () => {
    render(<SettingsTab {...defaultProps()} />)
    await waitFor(() => {
      expect(screen.getByText('Well')).toBeInTheDocument()
      expect(screen.getByText('X (mm)')).toBeInTheDocument()
      expect(screen.getByText('Y (mm)')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Actions')).toBeInTheDocument()
    })
  })

  it('renders reference wells for microchip layout', async () => {
    render(<SettingsTab {...defaultProps()} />)
    await waitFor(() => {
      // WS1 and WS2 should be present
      expect(screen.getByText('WS1')).toBeInTheDocument()
      expect(screen.getByText('WS2')).toBeInTheDocument()
      // Some well IDs from the microchip list
      expect(screen.getByText('A2')).toBeInTheDocument()
      expect(screen.getByText('MC1')).toBeInTheDocument()
    })
  })

  it('switching to vial layout fetches vial coordinates', async () => {
    const fetchMock = mockFetch({
      '/api/coordinates/microchip': { status: 'success', coordinates: {} },
      '/api/coordinates/vial': { status: 'success', coordinates: {} },
    })
    global.fetch = fetchMock

    render(<SettingsTab {...defaultProps()} />)
    const select = screen.getByDisplayValue('MicroChip')
    fireEvent.change(select, { target: { value: 'vial' } })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/coordinates/vial')
      )
    })
  })

  it('Capture button calls API and updates coordinates', async () => {
    const fetchMock = mockFetch({
      '/api/coordinates/microchip': { status: 'success', coordinates: {} },
      '/api/coordinates/capture': { x: 10.5, y: 20.3 },
    })
    global.fetch = fetchMock

    render(<SettingsTab {...defaultProps()} />)

    await waitFor(() => {
      // Find the first Capture button (for WS1)
      const captureButtons = screen.getAllByText('Capture')
      fireEvent.click(captureButtons[0])
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/coordinates/capture',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('Clear button removes coordinate', async () => {
    const fetchMock = mockFetch({
      '/api/coordinates/microchip': {
        status: 'success',
        coordinates: { WS1: { x: 5, y: 10 } },
      },
      '/api/coordinates/save': { status: 'success' },
    })
    global.fetch = fetchMock

    render(<SettingsTab {...defaultProps()} />)

    await waitFor(() => {
      const clearBtn = screen.getByText('Clear')
      fireEvent.click(clearBtn)
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/coordinates/save',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"x":null'),
        })
      )
    })
  })

  it('editing a coordinate value calls save API', async () => {
    const fetchMock = mockFetch({
      '/api/coordinates/microchip': {
        status: 'success',
        coordinates: { WS1: { x: 5, y: 10 } },
      },
      '/api/coordinates/save': { status: 'success' },
    })
    global.fetch = fetchMock

    render(<SettingsTab {...defaultProps()} />)

    await waitFor(() => {
      // Find the X coordinate input for WS1 (first number input with value 5)
      const xInputs = screen.getAllByDisplayValue('5')
      fireEvent.change(xInputs[0], { target: { value: '15' } })
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/coordinates/save',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('editing Y coordinate calls save API', async () => {
    const fetchMock = mockFetch({
      '/api/coordinates/microchip': {
        status: 'success',
        coordinates: { WS1: { x: 5, y: 10 } },
      },
      '/api/coordinates/save': { status: 'success' },
    })
    global.fetch = fetchMock

    render(<SettingsTab {...defaultProps()} />)

    await waitFor(() => {
      const yInputs = screen.getAllByDisplayValue('10')
      fireEvent.change(yInputs[0], { target: { value: '25' } })
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/coordinates/save',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('editing coordinate with NaN value does nothing', async () => {
    const fetchMock = mockFetch({
      '/api/coordinates/microchip': {
        status: 'success',
        coordinates: { WS1: { x: 5, y: 10 } },
      },
      '/api/coordinates/save': { status: 'success' },
    })
    global.fetch = fetchMock

    render(<SettingsTab {...defaultProps()} />)

    await waitFor(() => {
      const xInputs = screen.getAllByDisplayValue('5')
      fireEvent.change(xInputs[0], { target: { value: 'abc' } })
    })

    // The save API should NOT be called for NaN value (only initial fetch)
    await waitFor(() => {
      const saveCalls = fetchMock.mock.calls.filter(c => c[0].includes('/api/coordinates/save'))
      expect(saveCalls.length).toBe(0)
    })
  })

  it('useEffect fetch coordinates catch error path', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = vi.fn().mockRejectedValue(new Error('Network down'))

    render(<SettingsTab {...defaultProps()} />)

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch coordinates:', expect.any(Error))
    })

    consoleErrorSpy.mockRestore()
  })

  it('Capture handles non-ok response', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/coordinates/capture')) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ detail: 'Motor not ready' }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: {} }),
      })
    })

    render(<SettingsTab {...defaultProps()} />)

    await waitFor(() => {
      const captureButtons = screen.getAllByText('Capture')
      fireEvent.click(captureButtons[0])
    })

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Motor not ready')
    })

    consoleErrorSpy.mockRestore()
  })

  it('Capture handles network error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/coordinates/capture')) {
        return Promise.reject(new Error('Connection refused'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: {} }),
      })
    })

    render(<SettingsTab {...defaultProps()} />)

    await waitFor(() => {
      const captureButtons = screen.getAllByText('Capture')
      fireEvent.click(captureButtons[0])
    })

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Capture error:', 'Connection refused')
    })

    consoleErrorSpy.mockRestore()
  })

  it('handleCoordEdit catch error path', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/coordinates/save')) {
        return Promise.reject(new Error('Save failed'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: { WS1: { x: 5, y: 10 } } }),
      })
    })

    render(<SettingsTab {...defaultProps()} />)

    await waitFor(() => {
      const xInputs = screen.getAllByDisplayValue('5')
      fireEvent.change(xInputs[0], { target: { value: '15' } })
    })

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Save error:', 'Save failed')
    })

    consoleErrorSpy.mockRestore()
  })

  it('handleClearCoord catch error path', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/coordinates/save')) {
        return Promise.reject(new Error('Clear failed'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: { WS1: { x: 5, y: 10 } } }),
      })
    })

    render(<SettingsTab {...defaultProps()} />)

    await waitFor(() => {
      const clearBtn = screen.getByText('Clear')
      fireEvent.click(clearBtn)
    })

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Clear error:', 'Clear failed')
    })

    consoleErrorSpy.mockRestore()
  })

  it('Capture with non-ok response and no detail field', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/coordinates/capture')) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({}),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: {} }),
      })
    })

    render(<SettingsTab {...defaultProps()} />)

    await waitFor(() => {
      const captureButtons = screen.getAllByText('Capture')
      fireEvent.click(captureButtons[0])
    })

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Capture failed')
    })

    consoleErrorSpy.mockRestore()
  })
})

// ─── Motor Settings sub-tab ──────────────────────────────────────────────────

describe('Motor Settings', () => {
  it('renders motor configuration inputs with correct values', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      // Multiple inputs share value 100 (X, Y, Z steps/mm)
      const inputs = screen.getAllByDisplayValue('100')
      expect(inputs.length).toBeGreaterThanOrEqual(3) // X, Y, Z steps/mm
    })
  })

  it('renders pipette configuration section', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      expect(screen.getByText('Pipette Configuration')).toBeInTheDocument()
      expect(screen.getByText('Pipette Steps/µL:')).toBeInTheDocument()
      expect(screen.getByText('Max Pipette Volume (µL):')).toBeInTheDocument()
    })
  })

  it('renders operation parameters section', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      expect(screen.getByText('Pipetting Operation Parameters')).toBeInTheDocument()
      expect(screen.getByText('Pickup Depth (mm):')).toBeInTheDocument()
      expect(screen.getByText('Dropoff Depth (mm):')).toBeInTheDocument()
      expect(screen.getByText('Safe Height (mm):')).toBeInTheDocument()
      expect(screen.getByText('Rinse Cycles:')).toBeInTheDocument()
    })
  })

  it('renders speed configuration section', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      expect(screen.getByText('Movement Speed Configuration')).toBeInTheDocument()
      expect(screen.getByText('Travel Speed (s/step):')).toBeInTheDocument()
      expect(screen.getByText('Pipette Speed (s/step):')).toBeInTheDocument()
    })
  })

  it('changing an input calls handleConfigChange', async () => {
    const handleConfigChange = vi.fn()
    render(<SettingsTab {...defaultProps({ handleConfigChange })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      // Multiple inputs share value 100 - get the first one (X-Axis)
      const inputs = screen.getAllByDisplayValue('100')
      fireEvent.change(inputs[0], { target: { value: '200' } })
    })

    expect(handleConfigChange).toHaveBeenCalledWith('STEPS_PER_MM_X', '200')
  })

  it('changing Y-Axis Steps/mm calls handleConfigChange', async () => {
    const handleConfigChange = vi.fn()
    render(<SettingsTab {...defaultProps({ handleConfigChange })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      const inputs = screen.getAllByDisplayValue('100')
      fireEvent.change(inputs[1], { target: { value: '250' } })
    })

    expect(handleConfigChange).toHaveBeenCalledWith('STEPS_PER_MM_Y', '250')
  })

  it('changing Z-Axis Steps/mm calls handleConfigChange', async () => {
    const handleConfigChange = vi.fn()
    render(<SettingsTab {...defaultProps({ handleConfigChange })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      const inputs = screen.getAllByDisplayValue('100')
      fireEvent.change(inputs[2], { target: { value: '300' } })
    })

    expect(handleConfigChange).toHaveBeenCalledWith('STEPS_PER_MM_Z', '300')
  })

  it('invert direction checkboxes render and can be toggled', async () => {
    const handleConfigChange = vi.fn()
    render(<SettingsTab {...defaultProps({ handleConfigChange })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      expect(screen.getByText('Invert Direction:')).toBeInTheDocument()
      // Find checkbox labels and click them
      const checkboxes = screen.getAllByRole('checkbox')
      // Toggle INVERT_X
      fireEvent.click(checkboxes[0])
    })

    expect(handleConfigChange).toHaveBeenCalledWith('INVERT_X', true)
  })

  it('shows speed warning when travel speed is too low', async () => {
    render(
      <SettingsTab
        {...defaultProps({
          config: { ...defaultConfig(), TRAVEL_SPEED: 0.00001 },
        })}
      />
    )
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      expect(screen.getByText('Minimum allowed value is 0.0001s')).toBeInTheDocument()
    })
  })

  it('shows speed warning when pipette speed is too low', async () => {
    render(
      <SettingsTab
        {...defaultProps({
          config: { ...defaultConfig(), PIPETTE_SPEED: 0.00001 },
        })}
      />
    )
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      expect(screen.getByText('Minimum allowed value is 0.0001s')).toBeInTheDocument()
    })
  })

  it('changing pipette steps/uL calls handleConfigChange', async () => {
    const handleConfigChange = vi.fn()
    render(<SettingsTab {...defaultProps({ handleConfigChange })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      const input = screen.getByDisplayValue('1000')
      fireEvent.change(input, { target: { value: '1500' } })
    })

    expect(handleConfigChange).toHaveBeenCalledWith('PIPETTE_STEPS_PER_ML', '1500')
  })

  it('changing Max Pipette Volume calls handleConfigChange', async () => {
    const handleConfigChange = vi.fn()
    // Use unique values so PIPETTE_MAX_ML (10) doesn't clash with PICKUP_DEPTH (10)
    const config = {
      ...defaultConfig(),
      PIPETTE_MAX_ML: 77,
    }
    render(<SettingsTab {...defaultProps({ handleConfigChange, config })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      const input = screen.getByDisplayValue('77')
      fireEvent.change(input, { target: { value: '20' } })
    })

    expect(handleConfigChange).toHaveBeenCalledWith('PIPETTE_MAX_ML', '20')
  })

  it('changing Pickup Depth calls handleConfigChange', async () => {
    const handleConfigChange = vi.fn()
    // Use a unique value for PICKUP_DEPTH to avoid conflicts
    const config = {
      ...defaultConfig(),
      PICKUP_DEPTH: 88,
    }
    render(<SettingsTab {...defaultProps({ handleConfigChange, config })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      const input = screen.getByDisplayValue('88')
      fireEvent.change(input, { target: { value: '12' } })
    })

    expect(handleConfigChange).toHaveBeenCalledWith('PICKUP_DEPTH', '12')
  })

  it('changing Dropoff Depth calls handleConfigChange', async () => {
    const handleConfigChange = vi.fn()
    render(<SettingsTab {...defaultProps({ handleConfigChange })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      // Dropoff Depth has value 5
      const input = screen.getByDisplayValue('5')
      fireEvent.change(input, { target: { value: '8' } })
    })

    expect(handleConfigChange).toHaveBeenCalledWith('DROPOFF_DEPTH', '8')
  })

  it('changing Safe Height calls handleConfigChange', async () => {
    const handleConfigChange = vi.fn()
    render(<SettingsTab {...defaultProps({ handleConfigChange })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      const input = screen.getByDisplayValue('20')
      fireEvent.change(input, { target: { value: '25' } })
    })

    expect(handleConfigChange).toHaveBeenCalledWith('SAFE_HEIGHT', '25')
  })

  it('changing Rinse Cycles calls handleConfigChange', async () => {
    const handleConfigChange = vi.fn()
    render(<SettingsTab {...defaultProps({ handleConfigChange })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      const input = screen.getByDisplayValue('3')
      fireEvent.change(input, { target: { value: '5' } })
    })

    expect(handleConfigChange).toHaveBeenCalledWith('RINSE_CYCLES', '5')
  })

  it('changing Travel Speed calls handleConfigChange', async () => {
    const handleConfigChange = vi.fn()
    render(<SettingsTab {...defaultProps({ handleConfigChange })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      const input = screen.getByDisplayValue('0.001')
      fireEvent.change(input, { target: { value: '0.005' } })
    })

    expect(handleConfigChange).toHaveBeenCalledWith('TRAVEL_SPEED', '0.005')
  })

  it('changing Pipette Speed calls handleConfigChange', async () => {
    const handleConfigChange = vi.fn()
    render(<SettingsTab {...defaultProps({ handleConfigChange })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      const input = screen.getByDisplayValue('0.002')
      fireEvent.change(input, { target: { value: '0.003' } })
    })

    expect(handleConfigChange).toHaveBeenCalledWith('PIPETTE_SPEED', '0.003')
  })

  it('renders Controller Type section in DEV mode', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      expect(screen.getByText('Controller Type')).toBeInTheDocument()
      expect(screen.getByText('Hardware Controller:')).toBeInTheDocument()
      expect(screen.getByText('Active Controller:')).toBeInTheDocument()
    })
  })

  it('changing controller type calls API and updates config', async () => {
    const handleConfigChange = vi.fn()
    const fetchCurrentPosition = vi.fn()
    const fetchMock = mockFetch({
      '/api/coordinates/microchip': { status: 'success', coordinates: {} },
      '/api/pipetting/set-controller-type': { status: 'success' },
    })
    global.fetch = fetchMock

    render(<SettingsTab {...defaultProps({ handleConfigChange, fetchCurrentPosition })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      const select = screen.getByDisplayValue('Raspberry Pi 5')
      fireEvent.change(select, { target: { value: 'arduino_uno_q' } })
    })

    expect(handleConfigChange).toHaveBeenCalledWith('CONTROLLER_TYPE', 'arduino_uno_q')

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/pipetting/set-controller-type',
        expect.objectContaining({ method: 'POST' })
      )
    })

    await waitFor(() => {
      expect(fetchCurrentPosition).toHaveBeenCalled()
    })
  })

  it('controller type change handles fetch error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handleConfigChange = vi.fn()
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/pipetting/set-controller-type')) {
        return Promise.reject(new Error('Switch failed'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: {} }),
      })
    })

    render(<SettingsTab {...defaultProps({ handleConfigChange })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      const select = screen.getByDisplayValue('Raspberry Pi 5')
      fireEvent.change(select, { target: { value: 'arduino_uno_q' } })
    })

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to switch controller:', expect.any(Error))
    })

    consoleErrorSpy.mockRestore()
  })

  it('shows active controller as Raspberry Pi 5 for raspberry_pi type', async () => {
    render(<SettingsTab {...defaultProps({ controllerType: 'raspberry_pi' })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      // There are multiple "Raspberry Pi 5" texts (select option + active controller display)
      const elements = screen.getAllByText('Raspberry Pi 5')
      expect(elements.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows active controller as Arduino UNO Q for arduino type', async () => {
    render(<SettingsTab {...defaultProps({ controllerType: 'arduino_uno_q' })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      expect(screen.getByText('Arduino UNO Q Controls')).toBeInTheDocument()
    })
  })
})

// ─── Arduino UNO Q Controls ─────────────────────────────────────────────────

describe('Arduino UNO Q Controls', () => {
  it('renders MCU ping button and LED test buttons when arduino', async () => {
    render(<SettingsTab {...defaultProps({ controllerType: 'arduino_uno_q' })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      expect(screen.getByText('Ping MCU')).toBeInTheDocument()
      expect(screen.getByText('LED Test:')).toBeInTheDocument()
      expect(screen.getByText('all')).toBeInTheDocument()
      expect(screen.getByText('sweep')).toBeInTheDocument()
      expect(screen.getByText('idle')).toBeInTheDocument()
      expect(screen.getByText('success')).toBeInTheDocument()
      expect(screen.getByText('error')).toBeInTheDocument()
    })
  })

  it('Ping MCU button calls API and shows connected message', async () => {
    const fetchMock = mockFetch({
      '/api/coordinates/microchip': { status: 'success', coordinates: {} },
      '/api/mcu/ping': { connected: true },
    })
    global.fetch = fetchMock

    render(<SettingsTab {...defaultProps({ controllerType: 'arduino_uno_q' })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      fireEvent.click(screen.getByText('Ping MCU'))
    })

    await waitFor(() => {
      expect(screen.getByText('MCU: Connected (pong)')).toBeInTheDocument()
    })
  })

  it('Ping MCU button shows no response when not connected', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/mcu/ping')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ connected: false }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: {} }),
      })
    })

    render(<SettingsTab {...defaultProps({ controllerType: 'arduino_uno_q' })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      fireEvent.click(screen.getByText('Ping MCU'))
    })

    await waitFor(() => {
      expect(screen.getByText('MCU: No response')).toBeInTheDocument()
    })
  })

  it('Ping MCU button handles error', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/mcu/ping')) {
        return Promise.reject(new Error('Network error'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: {} }),
      })
    })

    render(<SettingsTab {...defaultProps({ controllerType: 'arduino_uno_q' })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      fireEvent.click(screen.getByText('Ping MCU'))
    })

    await waitFor(() => {
      expect(screen.getByText('MCU: Connection failed')).toBeInTheDocument()
    })
  })

  it('LED test button sends pattern and shows success message', async () => {
    const fetchMock = mockFetch({
      '/api/coordinates/microchip': { status: 'success', coordinates: {} },
      '/api/led/test': { status: 'success' },
    })
    global.fetch = fetchMock

    render(<SettingsTab {...defaultProps({ controllerType: 'arduino_uno_q' })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      fireEvent.click(screen.getByText('all'))
    })

    await waitFor(() => {
      expect(screen.getByText('LED: all test sent')).toBeInTheDocument()
    })
  })

  it('LED test button handles error', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/led/test')) {
        return Promise.reject(new Error('LED error'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: {} }),
      })
    })

    render(<SettingsTab {...defaultProps({ controllerType: 'arduino_uno_q' })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      fireEvent.click(screen.getByText('sweep'))
    })

    await waitFor(() => {
      expect(screen.getByText('LED test failed')).toBeInTheDocument()
    })
  })
})

// ─── Save Configuration button ───────────────────────────────────────────────

describe('Save Configuration', () => {
  it('save button calls saveConfig and shows success message', async () => {
    const saveConfig = vi.fn().mockResolvedValue({
      status: 'success',
      message: 'Configuration saved',
    })
    render(<SettingsTab {...defaultProps({ saveConfig })} />)

    // The save button is at the bottom of the page
    const saveBtn = screen.getByText('Save Configuration')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(saveConfig).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByText(/Configuration saved/)).toBeInTheDocument()
    })
  })

  it('save button shows "Saving..." while loading', async () => {
    // Create a saveConfig that never resolves during the test
    let resolvePromise
    const saveConfig = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolvePromise = resolve })
    )
    render(<SettingsTab {...defaultProps({ saveConfig })} />)

    const saveBtn = screen.getByText('Save Configuration')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument()
    })

    // Resolve to clean up
    resolvePromise({ status: 'success', message: 'Done' })
  })

  it('save button shows error message on failure', async () => {
    const saveConfig = vi.fn().mockRejectedValue(new Error('Network error'))
    render(<SettingsTab {...defaultProps({ saveConfig })} />)

    const saveBtn = screen.getByText('Save Configuration')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument()
    })
  })

  it('save button disabled when speed values are too low', async () => {
    render(
      <SettingsTab
        {...defaultProps({
          config: {
            ...defaultConfig(),
            TRAVEL_SPEED: 0.00001,
            PIPETTE_SPEED: 0.00001,
          },
        })}
      />
    )

    const saveBtn = screen.getByText('Save Configuration')
    expect(saveBtn).toBeDisabled()
  })

  it('save shows fail message when status is not success', async () => {
    const saveConfig = vi.fn().mockResolvedValue({
      status: 'error',
      message: 'Something went wrong',
    })
    render(<SettingsTab {...defaultProps({ saveConfig })} />)

    const saveBtn = screen.getByText('Save Configuration')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByText(/Failed to save/)).toBeInTheDocument()
    })
  })

  it('save shows default message when status success but no message', async () => {
    const saveConfig = vi.fn().mockResolvedValue({
      status: 'success',
    })
    render(<SettingsTab {...defaultProps({ saveConfig })} />)

    const saveBtn = screen.getByText('Save Configuration')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByText(/Configuration saved/)).toBeInTheDocument()
    })
  })
})

// ─── Calibration sub-tab ─────────────────────────────────────────────────────

describe('Calibration', () => {
  it('renders calibration cards for x, y, z axes and pipette', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      expect(screen.getByText('X-Axis')).toBeInTheDocument()
      expect(screen.getByText('Y-Axis')).toBeInTheDocument()
      expect(screen.getByText('Z-Axis')).toBeInTheDocument()
      expect(screen.getByText('Pipette')).toBeInTheDocument()
    })
  })

  it('Move + and Move - buttons call handleAxisMove', async () => {
    const handleAxisMove = vi.fn()
    render(<SettingsTab {...defaultProps({ handleAxisMove })} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const movePlusBtns = screen.getAllByText('Move +')
      fireEvent.click(movePlusBtns[0]) // X-Axis Move +
    })

    expect(handleAxisMove).toHaveBeenCalledWith('x', 1000, 'cw')
  })

  it('Move - button calls handleAxisMove with ccw', async () => {
    const handleAxisMove = vi.fn()
    render(<SettingsTab {...defaultProps({ handleAxisMove })} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const moveMinusBtns = screen.getAllByText(/Move ./)
      // "Move −" buttons (Unicode minus sign)
      const ccwBtns = screen.getAllByText('Move −')
      fireEvent.click(ccwBtns[0]) // X-Axis Move -
    })

    expect(handleAxisMove).toHaveBeenCalledWith('x', 1000, 'ccw')
  })

  it('Y-Axis Move + button calls handleAxisMove', async () => {
    const handleAxisMove = vi.fn()
    render(<SettingsTab {...defaultProps({ handleAxisMove })} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const movePlusBtns = screen.getAllByText('Move +')
      fireEvent.click(movePlusBtns[1]) // Y-Axis Move +
    })

    expect(handleAxisMove).toHaveBeenCalledWith('y', 1000, 'cw')
  })

  it('Z-Axis Move + button calls handleAxisMove', async () => {
    const handleAxisMove = vi.fn()
    render(<SettingsTab {...defaultProps({ handleAxisMove })} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const movePlusBtns = screen.getAllByText('Move +')
      fireEvent.click(movePlusBtns[2]) // Z-Axis Move +
    })

    expect(handleAxisMove).toHaveBeenCalledWith('z', 1000, 'cw')
  })

  it('Calculate button computes steps/mm', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      // Fill measured distance for X-axis
      const measuredInputs = screen.getAllByPlaceholderText('Enter measured mm')
      fireEvent.change(measuredInputs[0], { target: { value: '10' } })
    })

    // Click Calculate for X-axis (first Calculate button)
    const calcBtns = screen.getAllByText('Calculate')
    fireEvent.click(calcBtns[0])

    await waitFor(() => {
      // 1000 steps / 10 mm = 100 steps/mm
      expect(screen.getByText('100 steps/mm')).toBeInTheDocument()
    })
  })

  it('Apply & Save button calls API with updated config', async () => {
    const handleConfigChange = vi.fn()
    const fetchMock = mockFetch({
      '/api/coordinates/microchip': { status: 'success', coordinates: {} },
      '/api/config': { status: 'success', message: 'Config saved' },
    })
    global.fetch = fetchMock

    render(<SettingsTab {...defaultProps({ handleConfigChange })} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const measuredInputs = screen.getAllByPlaceholderText('Enter measured mm')
      fireEvent.change(measuredInputs[0], { target: { value: '10' } })
    })

    const calcBtns = screen.getAllByText('Calculate')
    fireEvent.click(calcBtns[0])

    await waitFor(() => {
      expect(screen.getByText('100 steps/mm')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Apply & Save'))

    await waitFor(() => {
      expect(handleConfigChange).toHaveBeenCalledWith('STEPS_PER_MM_X', 100)
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/config',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('Apply & Save error shows error message', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/config') {
        return Promise.reject(new Error('Save failed'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: {} }),
      })
    })

    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const measuredInputs = screen.getAllByPlaceholderText('Enter measured mm')
      fireEvent.change(measuredInputs[0], { target: { value: '10' } })
    })

    const calcBtns = screen.getAllByText('Calculate')
    fireEvent.click(calcBtns[0])

    await waitFor(() => {
      expect(screen.getByText('100 steps/mm')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Apply & Save'))

    await waitFor(() => {
      expect(screen.getByText(/Error: Save failed/)).toBeInTheDocument()
    })
  })

  it('calibration Save button per axis calls API', async () => {
    const fetchMock = mockFetch({
      '/api/coordinates/microchip': { status: 'success', coordinates: {} },
      '/api/config': { status: 'success', message: 'Config saved' },
    })
    global.fetch = fetchMock

    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      // Click the first "Save" button (X-axis calibration card save)
      const saveBtns = screen.getAllByText('Save')
      fireEvent.click(saveBtns[0])
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/config',
        expect.objectContaining({ method: 'POST' })
      )
    })

    await waitFor(() => {
      expect(screen.getByText(/Config saved/)).toBeInTheDocument()
    })
  })

  it('calibration Save button handles error', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/config') {
        return Promise.reject(new Error('Server down'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: {} }),
      })
    })

    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const saveBtns = screen.getAllByText('Save')
      fireEvent.click(saveBtns[0])
    })

    await waitFor(() => {
      expect(screen.getByText(/Error: Server down/)).toBeInTheDocument()
    })
  })

  it('calibration Save shows failed when status is not success', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/config') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'error', message: 'Validation error' }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: {} }),
      })
    })

    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const saveBtns = screen.getAllByText('Save')
      fireEvent.click(saveBtns[0])
    })

    await waitFor(() => {
      expect(screen.getByText(/Failed to save/)).toBeInTheDocument()
    })
  })

  it('changing test steps input updates calibration state', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      // Test steps inputs default to 1000, get the first one (x-axis)
      const testStepInputs = screen.getAllByDisplayValue('1000')
      fireEvent.change(testStepInputs[0], { target: { value: '2000' } })
    })

    // Verify the input now has value 2000
    await waitFor(() => {
      expect(screen.getAllByDisplayValue('2000').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('changing steps/mm in calibration tab calls handleConfigChange', async () => {
    const handleConfigChange = vi.fn()
    render(<SettingsTab {...defaultProps({ handleConfigChange })} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      // Steps/mm inputs have value 100
      const stepsInputs = screen.getAllByDisplayValue('100')
      fireEvent.change(stepsInputs[0], { target: { value: '150' } })
    })

    expect(handleConfigChange).toHaveBeenCalledWith('STEPS_PER_MM_X', '150')
  })

  it('Pipette calibration with Aspirate + and Dispense - buttons', async () => {
    const handleAxisMove = vi.fn()
    render(<SettingsTab {...defaultProps({ handleAxisMove })} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const aspirateBtn = screen.getByText('Aspirate +')
      fireEvent.click(aspirateBtn)
    })

    expect(handleAxisMove).toHaveBeenCalledWith('pipette', 1000, 'cw')
  })

  it('Dispense - button calls handleAxisMove with ccw', async () => {
    const handleAxisMove = vi.fn()
    render(<SettingsTab {...defaultProps({ handleAxisMove })} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const dispenseBtn = screen.getByText('Dispense −')
      fireEvent.click(dispenseBtn)
    })

    expect(handleAxisMove).toHaveBeenCalledWith('pipette', 1000, 'ccw')
  })

  it('Pipette Calculate button computes steps/µL', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const measuredInputs = screen.getAllByPlaceholderText('Enter measured µL')
      fireEvent.change(measuredInputs[0], { target: { value: '5' } })
    })

    // Pipette Calculate is the last Calculate button
    const calcBtns = screen.getAllByText('Calculate')
    fireEvent.click(calcBtns[calcBtns.length - 1])

    await waitFor(() => {
      // 1000 steps / 5 µL = 200 steps/µL
      expect(screen.getByText(/200 steps\/µL/)).toBeInTheDocument()
    })
  })

  it('Pipette Apply & Save button calls API', async () => {
    const handleConfigChange = vi.fn()
    const fetchMock = mockFetch({
      '/api/coordinates/microchip': { status: 'success', coordinates: {} },
      '/api/config': { status: 'success', message: 'Pipette config saved' },
    })
    global.fetch = fetchMock

    render(<SettingsTab {...defaultProps({ handleConfigChange })} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const measuredInputs = screen.getAllByPlaceholderText('Enter measured µL')
      fireEvent.change(measuredInputs[0], { target: { value: '5' } })
    })

    const calcBtns = screen.getAllByText('Calculate')
    fireEvent.click(calcBtns[calcBtns.length - 1])

    await waitFor(() => {
      expect(screen.getByText(/200 steps\/µL/)).toBeInTheDocument()
    })

    // There should now be two Apply & Save buttons: one from axis, but we only triggered pipette calc
    // The pipette Apply & Save appears after calculating
    const applyBtns = screen.getAllByText('Apply & Save')
    fireEvent.click(applyBtns[applyBtns.length - 1])

    await waitFor(() => {
      expect(handleConfigChange).toHaveBeenCalledWith('PIPETTE_STEPS_PER_ML', 200)
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/config',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('Pipette Apply & Save error shows error message', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/config') {
        return Promise.reject(new Error('Pipette save failed'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: {} }),
      })
    })

    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const measuredInputs = screen.getAllByPlaceholderText('Enter measured µL')
      fireEvent.change(measuredInputs[0], { target: { value: '5' } })
    })

    const calcBtns = screen.getAllByText('Calculate')
    fireEvent.click(calcBtns[calcBtns.length - 1])

    await waitFor(() => {
      expect(screen.getByText(/200 steps\/µL/)).toBeInTheDocument()
    })

    const applyBtns = screen.getAllByText('Apply & Save')
    fireEvent.click(applyBtns[applyBtns.length - 1])

    await waitFor(() => {
      expect(screen.getByText(/Error: Pipette save failed/)).toBeInTheDocument()
    })
  })

  it('Pipette calibration Save button calls API', async () => {
    const fetchMock = mockFetch({
      '/api/coordinates/microchip': { status: 'success', coordinates: {} },
      '/api/config': { status: 'success', message: 'Config saved' },
    })
    global.fetch = fetchMock

    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      // The pipette card has a Save button next to the Steps/µL input
      // It's the last Save button (after x, y, z)
      const saveBtns = screen.getAllByText('Save')
      fireEvent.click(saveBtns[saveBtns.length - 1])
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/config',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('Pipette calibration Save button handles error', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/config') {
        return Promise.reject(new Error('Pipette save error'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: {} }),
      })
    })

    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const saveBtns = screen.getAllByText('Save')
      fireEvent.click(saveBtns[saveBtns.length - 1])
    })

    await waitFor(() => {
      expect(screen.getByText(/Error: Pipette save error/)).toBeInTheDocument()
    })
  })

  it('Pipette Steps/µL input in calibration calls handleConfigChange', async () => {
    const handleConfigChange = vi.fn()
    // Use unique value so we can target the PIPETTE_STEPS_PER_ML input
    const config = { ...defaultConfig(), PIPETTE_STEPS_PER_ML: 999 }
    render(<SettingsTab {...defaultProps({ handleConfigChange, config })} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      // The pipette Steps/µL text input has value 999 (unique)
      const input = screen.getByDisplayValue('999')
      fireEvent.change(input, { target: { value: '1200' } })
    })

    expect(handleConfigChange).toHaveBeenCalledWith('PIPETTE_STEPS_PER_ML', '1200')
  })

  it('Pipette test steps input changes calibration state', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      // All test steps default to 1000 (4 of them: x, y, z, pipette)
      // Plus the PIPETTE_STEPS_PER_ML which is also 1000
      const inputs = screen.getAllByDisplayValue('1000')
      // The last number input with value 1000 that is type="number" is the pipette test steps
      // Change the pipette test steps (the very last "1000" input)
      fireEvent.change(inputs[inputs.length - 1], { target: { value: '500' } })
    })

    await waitFor(() => {
      expect(screen.getAllByDisplayValue('500').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('Pipette measured volume input updates calibration', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const measuredInputs = screen.getAllByPlaceholderText('Enter measured µL')
      fireEvent.change(measuredInputs[0], { target: { value: '8' } })
    })

    await waitFor(() => {
      expect(screen.getByDisplayValue('8')).toBeInTheDocument()
    })
  })

  it('Pipette calibration Save shows failed when status is not success', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/config') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'error', message: 'Validation failed' }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: {} }),
      })
    })

    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const saveBtns = screen.getAllByText('Save')
      fireEvent.click(saveBtns[saveBtns.length - 1])
    })

    await waitFor(() => {
      expect(screen.getByText(/Failed to save/)).toBeInTheDocument()
    })
  })

  it('Pipette Apply & Save shows failed when status is not success', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/config') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'error', message: 'Bad config' }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: {} }),
      })
    })

    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const measuredInputs = screen.getAllByPlaceholderText('Enter measured µL')
      fireEvent.change(measuredInputs[0], { target: { value: '5' } })
    })

    const calcBtns = screen.getAllByText('Calculate')
    fireEvent.click(calcBtns[calcBtns.length - 1])

    await waitFor(() => {
      expect(screen.getByText(/200 steps\/µL/)).toBeInTheDocument()
    })

    const applyBtns = screen.getAllByText('Apply & Save')
    fireEvent.click(applyBtns[applyBtns.length - 1])

    await waitFor(() => {
      expect(screen.getByText(/Failed to save/)).toBeInTheDocument()
    })
  })

  it('Axis Apply & Save shows failed when status is not success', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/config') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'error', message: 'Bad axis config' }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: {} }),
      })
    })

    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const measuredInputs = screen.getAllByPlaceholderText('Enter measured mm')
      fireEvent.change(measuredInputs[0], { target: { value: '10' } })
    })

    const calcBtns = screen.getAllByText('Calculate')
    fireEvent.click(calcBtns[0])

    await waitFor(() => {
      expect(screen.getByText('100 steps/mm')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Apply & Save'))

    await waitFor(() => {
      expect(screen.getByText(/Failed to save/)).toBeInTheDocument()
    })
  })
})

// ─── Branch coverage: edge cases ─────────────────────────────────────────────

describe('Branch coverage edge cases', () => {
  it('fetch coordinates with non-success status does not set data', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'error', coordinates: { WS1: { x: 1, y: 2 } } }),
      })
    )

    render(<SettingsTab {...defaultProps()} />)

    // Wait for the fetch to complete
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    // Since status was 'error', the coord data should not be set from the response
    // WS1 should NOT show values from the failed response
    const captureButtons = screen.getAllByText('Capture')
    expect(captureButtons.length).toBeGreaterThan(0)
    // No Clear buttons should appear since no coordinates were loaded
    expect(screen.queryByText('Clear')).not.toBeInTheDocument()
  })

  it('axisPositions with null x and y shows 0.00 defaults', async () => {
    render(<SettingsTab {...defaultProps({
      axisPositions: { x: null, y: null, z: 0, pipette_ml: 0, motor_steps: {} },
    })} />)

    await waitFor(() => {
      expect(screen.getByText(/X=0\.00 mm/)).toBeInTheDocument()
      expect(screen.getByText(/Y=0\.00 mm/)).toBeInTheDocument()
    })
  })

  it('editing coord for well not in coordData uses default 0,0', async () => {
    const fetchMock = mockFetch({
      '/api/coordinates/microchip': { status: 'success', coordinates: {} },
      '/api/coordinates/save': { status: 'success' },
    })
    global.fetch = fetchMock

    render(<SettingsTab {...defaultProps()} />)

    // Wait for initial fetch
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/coordinates/microchip'))
    })

    // All inputs are empty (no coords set). Type a value into the first X input (WS1)
    const emptyInputs = screen.getAllByPlaceholderText('—')
    fireEvent.change(emptyInputs[0], { target: { value: '42' } })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/coordinates/save',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('calibration test steps with empty value results in 0', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const testStepInputs = screen.getAllByDisplayValue('1000')
      // Change to empty value (parseInt('') || 0 => 0)
      fireEvent.change(testStepInputs[0], { target: { value: '' } })
    })

    await waitFor(() => {
      expect(screen.getAllByDisplayValue('0').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('pipette test steps with empty value results in 0', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      const testStepInputs = screen.getAllByDisplayValue('1000')
      // Change the last test steps input (pipette)
      fireEvent.change(testStepInputs[testStepInputs.length - 1], { target: { value: '' } })
    })

    await waitFor(() => {
      expect(screen.getAllByDisplayValue('0').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('active controller badge shows Arduino UNO Q styling', async () => {
    render(<SettingsTab {...defaultProps({ controllerType: 'arduino_uno_q' })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      // Both active controller display and select option
      const arduinoElements = screen.getAllByText('Arduino UNO Q')
      expect(arduinoElements.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('fetch coordinates with success but no coordinates field uses empty object', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      })
    )

    render(<SettingsTab {...defaultProps()} />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    // No Clear buttons since coordinates was undefined (falls back to {})
    expect(screen.queryByText('Clear')).not.toBeInTheDocument()
  })

  it('controller type switch with non-success does not show message', async () => {
    const fetchCurrentPosition = vi.fn()
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/pipetting/set-controller-type')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'error', message: 'Switch failed' }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', coordinates: {} }),
      })
    })

    render(<SettingsTab {...defaultProps({ fetchCurrentPosition })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      const select = screen.getByDisplayValue('Raspberry Pi 5')
      fireEvent.change(select, { target: { value: 'arduino_uno_q' } })
    })

    // fetchCurrentPosition should NOT have been called since status was not success
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/pipetting/set-controller-type',
        expect.anything()
      )
    })

    // Small delay to ensure the .then() has run
    await new Promise(r => setTimeout(r, 50))
    expect(fetchCurrentPosition).not.toHaveBeenCalled()
  })

  it('config.CONTROLLER_TYPE undefined falls back to raspberry_pi', async () => {
    const config = { ...defaultConfig(), CONTROLLER_TYPE: undefined }
    render(<SettingsTab {...defaultProps({ config })} />)
    fireEvent.click(screen.getByText('Motor Settings'))

    await waitFor(() => {
      // The select should show "Raspberry Pi 5" as default
      const selectEl = screen.getByDisplayValue('Raspberry Pi 5')
      expect(selectEl).toBeInTheDocument()
    })
  })

  it('Calculate button with NaN measured distance does nothing', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      // Set to "abc" which parseFloat returns NaN for
      // NaN <= 0 is false, so button won't be disabled
      // But dist > 0 will be false (NaN > 0 is false)
      const measuredInputs = screen.getAllByPlaceholderText('Enter measured mm')
      fireEvent.change(measuredInputs[0], { target: { value: 'abc' } })
    })

    const calcBtns = screen.getAllByText('Calculate')
    fireEvent.click(calcBtns[0])

    // No calculatedSPM should appear because dist is NaN
    expect(screen.queryByText(/steps\/mm/)).not.toBeInTheDocument()
  })

  it('Pipette Calculate with NaN measured volume does nothing', async () => {
    render(<SettingsTab {...defaultProps()} />)
    fireEvent.click(screen.getByText('Calibration'))

    await waitFor(() => {
      // Set to "abc" - parseFloat returns NaN
      // NaN <= 0 is false, so button won't be disabled
      // But vol > 0 will be false (NaN > 0 is false)
      const measuredInputs = screen.getAllByPlaceholderText('Enter measured µL')
      fireEvent.change(measuredInputs[0], { target: { value: 'abc' } })
    })

    const calcBtns = screen.getAllByText('Calculate')
    fireEvent.click(calcBtns[calcBtns.length - 1])

    // No calculatedSPML should appear because vol is NaN
    expect(screen.queryByText(/steps\/µL/)).not.toBeInTheDocument()
  })
})
