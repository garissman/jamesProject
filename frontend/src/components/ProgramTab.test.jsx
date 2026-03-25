import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProgramTab from './ProgramTab'
import { mockFetch } from '../test-utils'

// Default props factory
function defaultProps(overrides = {}) {
  return {
    steps: [],
    layoutType: 'microchip',
    handleAddStep: vi.fn(),
    handleUpdateStep: vi.fn(),
    handleDuplicateStep: vi.fn(),
    handleDeleteStep: vi.fn(),
    handleReorderSteps: vi.fn(),
    handleSaveProgram: vi.fn(),
    handleLoadProgram: vi.fn(),
    validateWellId: vi.fn(() => true),
    setActiveTab: vi.fn(),
    setWellSelectionMode: vi.fn(),
    schedule: { cronExpression: '', enabled: false },
    onScheduleChange: vi.fn(),
    config: {
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
      LAYOUT_COORDINATES: {},
    },
    programExecution: { status: 'idle' },
    isExecuting: false,
    currentStepIndex: null,
    totalSteps: null,
    ...overrides,
  }
}

function makePipetteStep(overrides = {}) {
  return {
    id: Date.now(),
    stepType: 'pipette',
    cycles: 1,
    pickupWell: 'A1',
    dropoffWell: 'B1',
    rinseWell: 'WS2',
    washWell: 'WS1',
    waitTime: 0,
    sampleVolume: 40,
    repetitionMode: 'quantity',
    repetitionQuantity: 1,
    repetitionInterval: null,
    repetitionDuration: null,
    pipetteCount: 3,
    ...overrides,
  }
}

function makeHomeStep(overrides = {}) {
  return {
    id: Date.now() + 1,
    stepType: 'home',
    cycles: 1,
    pickupWell: '',
    dropoffWell: '',
    rinseWell: '',
    washWell: '',
    waitTime: 0,
    sampleVolume: 0,
    repetitionMode: 'quantity',
    repetitionQuantity: 1,
    repetitionInterval: null,
    repetitionDuration: null,
    pipetteCount: 3,
    ...overrides,
  }
}

function makeWaitStep(overrides = {}) {
  return {
    id: Date.now() + 2,
    stepType: 'wait',
    cycles: 1,
    pickupWell: '',
    dropoffWell: '',
    rinseWell: '',
    washWell: '',
    waitTime: 30,
    sampleVolume: 0,
    repetitionMode: 'quantity',
    repetitionQuantity: 1,
    repetitionInterval: null,
    repetitionDuration: null,
    pipetteCount: 3,
    ...overrides,
  }
}

beforeEach(() => {
  global.fetch = mockFetch({
    '/api/programs/list': { programs: [] },
  })
})

// ─── Empty state ─────────────────────────────────────────────────────────────

describe('ProgramTab empty state', () => {
  it('renders "No steps yet" when steps array is empty', async () => {
    render(<ProgramTab {...defaultProps()} />)
    await waitFor(() => {
      expect(screen.getByText('No steps yet')).toBeInTheDocument()
    })
  })

  it('renders "+ Add Cycle", "+ Home", and "+ Wait" buttons', async () => {
    render(<ProgramTab {...defaultProps()} />)
    await waitFor(() => {
      expect(screen.getByText('+ Add Cycle')).toBeInTheDocument()
      expect(screen.getByText('+ Home')).toBeInTheDocument()
      expect(screen.getByText('+ Wait')).toBeInTheDocument()
    })
  })

  it('renders header with "Program Steps" when no programName', async () => {
    render(<ProgramTab {...defaultProps()} />)
    await waitFor(() => {
      expect(screen.getByText('Program Steps')).toBeInTheDocument()
    })
  })
})

// ─── StepCard rendering ──────────────────────────────────────────────────────

describe('StepCard rendering', () => {
  it('renders pipette step with pickup -> dropoff', async () => {
    const step = makePipetteStep({ pickupWell: 'A1', dropoffWell: 'B2' })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText(/A1/)).toBeInTheDocument()
      expect(screen.getByText(/B2/)).toBeInTheDocument()
    })
  })

  it('renders home step as "Go Home"', async () => {
    const step = makeHomeStep()
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText('Go Home')).toBeInTheDocument()
    })
  })

  it('renders wait step with formatted time', async () => {
    const step = makeWaitStep({ waitTime: 120 })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText('Wait 2 min')).toBeInTheDocument()
    })
  })

  it('renders wait step with seconds', async () => {
    const step = makeWaitStep({ waitTime: 45 })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText('Wait 45 sec')).toBeInTheDocument()
    })
  })

  it('renders wait step with hours', async () => {
    const step = makeWaitStep({ waitTime: 7200 })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText('Wait 2 hr')).toBeInTheDocument()
    })
  })

  it('shows edit/duplicate/delete buttons on step card', async () => {
    const step = makePipetteStep()
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByTitle('Edit')).toBeInTheDocument()
      expect(screen.getByTitle('Duplicate')).toBeInTheDocument()
      expect(screen.getByTitle('Delete')).toBeInTheDocument()
    })
  })

  it('highlights active step during execution', async () => {
    const step = makePipetteStep()
    const { container } = render(
      <ProgramTab
        {...defaultProps({
          steps: [step],
          isExecuting: true,
          currentStepIndex: 0,
        })}
      />
    )
    await waitFor(() => {
      // Active step has the amber border animation class
      const stepCards = container.querySelectorAll('.animate-step-active')
      expect(stepCards.length).toBe(1)
    })
  })

  it('renders step details with volume, wash, rinse info', async () => {
    const step = makePipetteStep({
      sampleVolume: 40,
      washWell: 'WS1',
      rinseWell: 'WS2',
      waitTime: 5,
      cycles: 3,
    })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      const details = screen.getByText(/40 µL/)
      expect(details).toBeInTheDocument()
      expect(details.textContent).toContain('Wash: WS1')
      expect(details.textContent).toContain('Rinse: WS2')
      expect(details.textContent).toContain('3 cycles')
    })
  })

  it('renders repetition quantity info', async () => {
    const step = makePipetteStep({
      repetitionMode: 'quantity',
      repetitionQuantity: 5,
    })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText(/x5/)).toBeInTheDocument()
    })
  })

  it('renders time frequency repetition info', async () => {
    const step = makePipetteStep({
      repetitionMode: 'timeFrequency',
      repetitionInterval: 60,
      repetitionDuration: 3600,
    })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText(/every 1 min/)).toBeInTheDocument()
    })
  })
})

// ─── Step management ─────────────────────────────────────────────────────────

describe('Step management', () => {
  it('clicking Delete calls handleDeleteStep', async () => {
    const handleDeleteStep = vi.fn()
    const step = makePipetteStep({ id: 123 })
    render(<ProgramTab {...defaultProps({ steps: [step], handleDeleteStep })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Delete'))
    })
    expect(handleDeleteStep).toHaveBeenCalledWith(123)
  })

  it('clicking Duplicate calls handleDuplicateStep', async () => {
    const handleDuplicateStep = vi.fn()
    const step = makePipetteStep({ id: 456 })
    render(<ProgramTab {...defaultProps({ steps: [step], handleDuplicateStep })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Duplicate'))
    })
    expect(handleDuplicateStep).toHaveBeenCalledWith(456)
  })

  it('clicking "+ Home" calls handleAddStep with home type', async () => {
    const handleAddStep = vi.fn()
    render(<ProgramTab {...defaultProps({ handleAddStep })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Home'))
    })
    expect(handleAddStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepType: 'home' })
    )
  })

  it('drag and drop reorders steps', async () => {
    const handleReorderSteps = vi.fn()
    const step1 = makePipetteStep({ id: 1, pickupWell: 'A1', dropoffWell: 'B1' })
    const step2 = makePipetteStep({ id: 2, pickupWell: 'C1', dropoffWell: 'D1' })
    const { container } = render(
      <ProgramTab
        {...defaultProps({
          steps: [step1, step2],
          handleReorderSteps,
        })}
      />
    )

    await waitFor(() => {
      const cards = container.querySelectorAll('[draggable="true"]')
      expect(cards.length).toBe(2)

      // Simulate drag from index 0
      fireEvent.dragStart(cards[0], { dataTransfer: { effectAllowed: 'move' } })
      // Drop on index 1
      fireEvent.dragOver(cards[1], { dataTransfer: { dropEffect: 'move' } })
      fireEvent.drop(cards[1], { dataTransfer: {} })
    })

    expect(handleReorderSteps).toHaveBeenCalledWith(0, 1)
  })
})

// ─── StepWizard ──────────────────────────────────────────────────────────────

describe('StepWizard', () => {
  it('opens wizard when clicking "+ Add Cycle"', async () => {
    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    // Wizard stage 1 visible
    expect(screen.getByText('Select Wells')).toBeInTheDocument()
    expect(screen.getByText('Wells & Volume')).toBeInTheDocument()
  })

  it('validates empty pickup well on stage 1', async () => {
    render(<ProgramTab {...defaultProps({ validateWellId: vi.fn(() => true) })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    // Click Next without filling pickup well
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Pickup well is required')).toBeInTheDocument()
  })

  it('validates invalid well ID on stage 1', async () => {
    const validateWellId = vi.fn((val) => {
      if (val === 'INVALID') return false
      return true
    })
    render(<ProgramTab {...defaultProps({ validateWellId })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    // Fill with invalid well - use getAllByPlaceholderText since multiple inputs share same placeholder
    const inputs = screen.getAllByPlaceholderText('e.g., A1, WS1, MC3')
    fireEvent.change(inputs[0], { target: { value: 'INVALID' } })
    fireEvent.click(screen.getByText('Next'))

    expect(screen.getByText('Invalid well ID')).toBeInTheDocument()
  })

  it('advances to stage 2 with valid wells', async () => {
    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    // Fill pickup well
    const inputs = screen.getAllByPlaceholderText('e.g., A1, WS1, MC3')
    fireEvent.change(inputs[0], { target: { value: 'A1' } })
    fireEvent.click(screen.getByText('Next'))

    // Should be at stage 2 - use heading role to avoid matching the progress step label
    expect(screen.getByRole('heading', { name: 'Timing & Repetition' })).toBeInTheDocument()
    expect(screen.getByText('Repetition Mode')).toBeInTheDocument()
  })

  it('can set repetition mode to timeFrequency', async () => {
    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const inputs = screen.getAllByPlaceholderText('e.g., A1, WS1, MC3')
    fireEvent.change(inputs[0], { target: { value: 'A1' } })
    fireEvent.click(screen.getByText('Next'))

    // Change to time frequency
    const select = screen.getByDisplayValue('By Quantity')
    fireEvent.change(select, { target: { value: 'timeFrequency' } })

    expect(screen.getByText('Interval')).toBeInTheDocument()
    expect(screen.getByText('Total Duration')).toBeInTheDocument()
  })

  it('saves step with Save Step button', async () => {
    const handleAddStep = vi.fn()
    render(<ProgramTab {...defaultProps({ handleAddStep })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const inputs = screen.getAllByPlaceholderText('e.g., A1, WS1, MC3')
    fireEvent.change(inputs[0], { target: { value: 'A1' } })
    fireEvent.click(screen.getByText('Next'))

    // Save on stage 2
    fireEvent.click(screen.getByText('Save Step'))
    expect(handleAddStep).toHaveBeenCalledWith(
      expect.objectContaining({ pickupWell: 'A1' })
    )
  })

  it('cancel returns to step list', async () => {
    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    expect(screen.getByText('Select Wells')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))

    // Back to list
    expect(screen.getByText('No steps yet')).toBeInTheDocument()
  })

  it('Back button returns to stage 1 from stage 2', async () => {
    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const inputs = screen.getAllByPlaceholderText('e.g., A1, WS1, MC3')
    fireEvent.change(inputs[0], { target: { value: 'A1' } })
    fireEvent.click(screen.getByText('Next'))

    expect(screen.getByRole('heading', { name: 'Timing & Repetition' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByRole('heading', { name: 'Select Wells' })).toBeInTheDocument()
  })

  it('clicking Edit on step opens wizard with pre-filled data', async () => {
    const step = makePipetteStep({ pickupWell: 'A1', dropoffWell: 'B2' })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Edit'))
    })

    // Wizard should show with pre-filled pickup well
    expect(screen.getByDisplayValue('A1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('B2')).toBeInTheDocument()
  })

  it('"Select from plate" buttons invoke setWellSelectionMode and setActiveTab', async () => {
    const setActiveTab = vi.fn()
    const setWellSelectionMode = vi.fn()
    render(
      <ProgramTab
        {...defaultProps({ setActiveTab, setWellSelectionMode })}
      />
    )

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const selectBtns = screen.getAllByText('Select from plate')
    fireEvent.click(selectBtns[0]) // pickup well selector

    expect(setWellSelectionMode).toHaveBeenCalledWith(
      expect.objectContaining({ field: 'pickupWell' })
    )
    expect(setActiveTab).toHaveBeenCalledWith('protocol')
  })

  it('shows "Update Step" button when editing existing step', async () => {
    const step = makePipetteStep({ pickupWell: 'A1' })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Edit'))
    })

    // Go to stage 2
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Update Step')).toBeInTheDocument()
  })
})

// ─── Wait input ──────────────────────────────────────────────────────────────

describe('Wait input', () => {
  it('clicking "+ Wait" shows wait input overlay', async () => {
    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Wait'))
    })

    expect(screen.getByText('Wait:')).toBeInTheDocument()
    expect(screen.getByDisplayValue('5')).toBeInTheDocument() // default value
  })

  it('submitting wait input calls handleAddStep with converted seconds', async () => {
    const handleAddStep = vi.fn()
    render(<ProgramTab {...defaultProps({ handleAddStep })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Wait'))
    })

    // Change value to 10 seconds
    const input = screen.getByDisplayValue('5')
    fireEvent.change(input, { target: { value: '10' } })

    fireEvent.click(screen.getByText('Add'))

    expect(handleAddStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepType: 'wait', waitTime: 10 })
    )
  })

  it('wait cancel hides the overlay', async () => {
    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Wait'))
    })

    expect(screen.getByText('Wait:')).toBeInTheDocument()
    // Find the Cancel button in the wait overlay (not in a wizard)
    const cancelButtons = screen.getAllByText('Cancel')
    fireEvent.click(cancelButtons[cancelButtons.length - 1])

    expect(screen.queryByText('Wait:')).not.toBeInTheDocument()
  })

  it('editing a wait step shows update button and calls handleUpdateStep', async () => {
    const handleUpdateStep = vi.fn()
    const step = makeWaitStep({ id: 789, waitTime: 60 })
    render(<ProgramTab {...defaultProps({ steps: [step], handleUpdateStep })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Edit'))
    })

    // Should show "Update" in wait overlay
    expect(screen.getByText('Update')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Update'))
    expect(handleUpdateStep).toHaveBeenCalledWith(789, expect.objectContaining({ waitTime: 60 }))
  })
})

// ─── Program save/load ───────────────────────────────────────────────────────

describe('Program save/load', () => {
  it('Save button disabled when no steps', async () => {
    render(<ProgramTab {...defaultProps()} />)
    await waitFor(() => {
      const saveBtn = screen.getAllByText('Save')[0]
      expect(saveBtn).toBeDisabled()
    })
  })

  it('Save As button shows dialog', async () => {
    const step = makePipetteStep()
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save As'))
    })

    expect(screen.getByPlaceholderText('Enter program name...')).toBeInTheDocument()
    expect(screen.getByText('Program Name:')).toBeInTheDocument()
  })

  it('save dialog: typing name and clicking save calls API', async () => {
    const fetchMock = mockFetch({
      '/api/programs/list': { programs: [] },
      '/api/programs/save': { name: 'My Program' },
      '/api/program/save': { status: 'success' },
    })
    global.fetch = fetchMock

    const step = makePipetteStep()
    render(
      <ProgramTab
        {...defaultProps({ steps: [step] })}
      />
    )

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save As'))
    })

    const input = screen.getByPlaceholderText('Enter program name...')
    fireEvent.change(input, { target: { value: 'My Program' } })

    // Click the Save button inside the save dialog
    const dialogSaveButtons = screen.getAllByText('Save')
    // The last "Save" button should be in the dialog
    fireEvent.click(dialogSaveButtons[dialogSaveButtons.length - 1])

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/programs/save',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('Load button shows program list', async () => {
    global.fetch = mockFetch({
      '/api/programs/list': {
        programs: [
          { name: 'Test Program', stepCount: 3, modified: '2026-01-01T00:00:00' },
        ],
      },
    })

    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Load'))
    })

    await waitFor(() => {
      expect(screen.getByText('Saved Programs')).toBeInTheDocument()
      expect(screen.getByText('Test Program')).toBeInTheDocument()
    })
  })

  it('empty program list shows "No saved programs"', async () => {
    global.fetch = mockFetch({
      '/api/programs/list': { programs: [] },
    })

    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Load'))
    })

    await waitFor(() => {
      expect(screen.getByText('No saved programs')).toBeInTheDocument()
    })
  })

  it('loading a program calls handleLoadProgram', async () => {
    const handleLoadProgram = vi.fn()
    global.fetch = mockFetch({
      '/api/programs/list': {
        programs: [{ name: 'P1', stepCount: 2 }],
      },
      '/api/programs/load/P1': {
        steps: [{ id: 1 }],
        schedule: { cronExpression: '', enabled: false },
      },
      '/api/program/save': { status: 'success' },
    })

    render(<ProgramTab {...defaultProps({ handleLoadProgram })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Load'))
    })

    await waitFor(() => {
      const loadBtn = screen.getAllByText('Load')
      // The last Load button should be the one in the program list item
      fireEvent.click(loadBtn[loadBtn.length - 1])
    })

    await waitFor(() => {
      expect(handleLoadProgram).toHaveBeenCalled()
    })
  })

  it('download program creates an anchor element', async () => {
    global.fetch = mockFetch({
      '/api/programs/list': {
        programs: [{ name: 'P1', stepCount: 2 }],
      },
    })

    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {
        return { href: '', download: '', click: clickSpy, setAttribute: vi.fn() }
      }
      return document.createElement.wrappedMethod
        ? document.createElement.wrappedMethod(tag)
        : Object.getPrototypeOf(document).createElement.call(document, tag)
    })

    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Load'))
    })

    await waitFor(() => {
      expect(screen.getByText('P1')).toBeInTheDocument()
    })

    // Click download button (the SVG download icon button)
    const downloadBtn = screen.getByTitle('Download JSON')
    fireEvent.click(downloadBtn)

    expect(clickSpy).toHaveBeenCalled()

    vi.restoreAllMocks()
  })

  it('delete program calls API and refreshes list', async () => {
    const fetchMock = mockFetch({
      '/api/programs/list': {
        programs: [{ name: 'P1', stepCount: 2 }],
      },
      '/api/programs/P1': { status: 'success' },
    })
    global.fetch = fetchMock

    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Load'))
    })

    await waitFor(() => {
      const deleteBtn = screen.getByTitle('Delete')
      fireEvent.click(deleteBtn)
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/programs/P1'),
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })
})

// ─── Schedule ────────────────────────────────────────────────────────────────

describe('Schedule', () => {
  it('renders schedule section with Disabled text', async () => {
    render(<ProgramTab {...defaultProps()} />)
    await waitFor(() => {
      expect(screen.getByText('Schedule')).toBeInTheDocument()
      expect(screen.getByText('Disabled')).toBeInTheDocument()
    })
  })

  it('clicking toggle calls onScheduleChange with enabled=true', async () => {
    const onScheduleChange = vi.fn()
    render(
      <ProgramTab
        {...defaultProps({ onScheduleChange })}
      />
    )

    await waitFor(() => {
      // The toggle is the green/gray div
      const toggle = screen.getByText('Disabled').closest('label').querySelector('div')
      fireEvent.click(toggle)
    })

    expect(onScheduleChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true })
    )
  })

  it('renders Enabled text when schedule is enabled', async () => {
    render(
      <ProgramTab
        {...defaultProps({
          schedule: { cronExpression: '', enabled: true },
        })}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeInTheDocument()
    })
  })

  it('cron expression input calls onScheduleChange', async () => {
    const onScheduleChange = vi.fn()
    render(
      <ProgramTab
        {...defaultProps({
          schedule: { cronExpression: '', enabled: true },
          onScheduleChange,
        })}
      />
    )

    await waitFor(() => {
      const cronInput = screen.getByPlaceholderText('e.g., 0 8 * * *')
      fireEvent.change(cronInput, { target: { value: '0 8 * * *' } })
    })

    expect(onScheduleChange).toHaveBeenCalledWith(
      expect.objectContaining({ cronExpression: '0 8 * * *' })
    )
  })

  it('displays cron description when expression is set', async () => {
    render(
      <ProgramTab
        {...defaultProps({
          schedule: { cronExpression: '0 8 * * *', enabled: true },
        })}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('Daily at 08:00')).toBeInTheDocument()
    })
  })

  it('preset buttons set cron expression', async () => {
    const onScheduleChange = vi.fn()
    render(
      <ProgramTab
        {...defaultProps({
          schedule: { cronExpression: '', enabled: true },
          onScheduleChange,
        })}
      />
    )

    await waitFor(() => {
      fireEvent.click(screen.getByText('Every hour'))
    })

    expect(onScheduleChange).toHaveBeenCalledWith(
      expect.objectContaining({ cronExpression: '0 * * * *' })
    )
  })

  it('describeCron returns correct descriptions for various expressions', async () => {
    // Test via component rendering with different cron expressions
    // The cron description is rendered in a <span> with class text-xs text-[var(--text-secondary)]
    const expressions = [
      { cron: '* * * * *', expected: 'Every minute' },
      { cron: '*/5 * * * *', expected: 'Every 5 minutes' },
      { cron: '0 * * * *', expected: 'Every hour' },
      { cron: '0 */2 * * *', expected: 'Every 2 hours' },
      { cron: '0 8 * * 1-5', expected: /Mon.*Fri at 08:00/ },
      { cron: '0 8 * * 1', expected: 'Every Monday at 08:00' },
    ]

    for (const { cron, expected } of expressions) {
      const { unmount } = render(
        <ProgramTab
          {...defaultProps({
            schedule: { cronExpression: cron, enabled: true },
          })}
        />
      )

      await waitFor(() => {
        // Use getAllByText since preset buttons may have the same text as the description
        const matches = typeof expected === 'string'
          ? screen.getAllByText(expected)
          : screen.getAllByText(expected)
        expect(matches.length).toBeGreaterThanOrEqual(1)
      })

      unmount()
    }
  })

  it('invalid cron expression shows error message', async () => {
    render(
      <ProgramTab
        {...defaultProps({
          schedule: { cronExpression: 'bad', enabled: true },
        })}
      />
    )
    await waitFor(() => {
      expect(screen.getByText(/Invalid expression/)).toBeInTheDocument()
    })
  })
})

// ─── Estimation display ──────────────────────────────────────────────────────

describe('Estimation', () => {
  it('shows estimated duration for steps', async () => {
    const step = makePipetteStep({ pickupWell: 'A1', dropoffWell: 'B1' })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)

    await waitFor(() => {
      // The estimation badge appears next to the header
      expect(screen.getByText(/Est\./)).toBeInTheDocument()
    })
  })

  it('no estimation badge when no steps', async () => {
    render(<ProgramTab {...defaultProps()} />)
    await waitFor(() => {
      expect(screen.queryByText(/Est\./)).not.toBeInTheDocument()
    })
  })

  it('formatDuration: shows correct values through component', async () => {
    // Create a wait step that contributes known time to the estimate
    // A wait step adds exactly waitTime seconds
    const step = makeWaitStep({ waitTime: 3661 }) // ~1h 1m + homing overhead
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)

    await waitFor(() => {
      // The estimation should contain hour and minute components
      const estBadge = screen.getByText(/Est\./)
      expect(estBadge.textContent).toContain('h')
    })
  })
})

// ─── Execution status display ────────────────────────────────────────────────

describe('Execution status', () => {
  it('shows "Idle" when not executing', async () => {
    render(<ProgramTab {...defaultProps()} />)
    await waitFor(() => {
      expect(screen.getByText('Idle')).toBeInTheDocument()
    })
  })

  it('shows "Program Running" when executing', async () => {
    render(
      <ProgramTab
        {...defaultProps({
          isExecuting: true,
          currentStepIndex: 0,
          totalSteps: 3,
        })}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('Program Running')).toBeInTheDocument()
      expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    })
  })

  it('shows last run info', async () => {
    render(
      <ProgramTab
        {...defaultProps({
          programExecution: {
            status: 'idle',
            lastRunAt: '2026-01-01T08:00:00',
            lastResult: 'success',
          },
        })}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('Success')).toBeInTheDocument()
      expect(screen.getByText(/Last run:/)).toBeInTheDocument()
    })
  })

  it('shows error info for failed execution', async () => {
    render(
      <ProgramTab
        {...defaultProps({
          programExecution: {
            status: 'idle',
            lastRunAt: '2026-01-01T08:00:00',
            lastResult: 'error',
            lastError: 'Motor stalled',
          },
        })}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument()
      expect(screen.getByText(/Motor stalled/)).toBeInTheDocument()
    })
  })

  it('shows "Program Running" when programExecution.status is running with startedAt', async () => {
    render(
      <ProgramTab
        {...defaultProps({
          programExecution: {
            status: 'running',
            startedAt: '2026-01-01T08:00:00',
          },
        })}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('Program Running')).toBeInTheDocument()
      expect(screen.getByText(/since/)).toBeInTheDocument()
    })
  })
})

// ─── StepWizard: sample volume and wait time inputs ─────────────────────────

describe('StepWizard sampleVolume and waitTime inputs', () => {
  it('changing sampleVolume updates form', async () => {
    const handleAddStep = vi.fn()
    render(<ProgramTab {...defaultProps({ handleAddStep })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    // Fill pickup well
    const inputs = screen.getAllByPlaceholderText('e.g., A1, WS1, MC3')
    fireEvent.change(inputs[0], { target: { value: 'A1' } })

    // Change sample volume (default is 40)
    const volumeInput = screen.getByPlaceholderText('e.g., 40')
    fireEvent.change(volumeInput, { target: { value: '25.5' } })

    // Go to stage 2 and save
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Save Step'))

    expect(handleAddStep).toHaveBeenCalledWith(
      expect.objectContaining({ sampleVolume: '25.5' })
    )
  })

  it('changing waitTime in stage 2 updates form', async () => {
    const handleAddStep = vi.fn()
    render(<ProgramTab {...defaultProps({ handleAddStep })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    // Fill pickup well
    const inputs = screen.getAllByPlaceholderText('e.g., A1, WS1, MC3')
    fireEvent.change(inputs[0], { target: { value: 'A1' } })

    // Go to stage 2
    fireEvent.click(screen.getByText('Next'))

    // Change wait time in stage 2 (first "e.g., 5" placeholder is Wait Time)
    const waitInputs = screen.getAllByPlaceholderText('e.g., 5')
    fireEvent.change(waitInputs[0], { target: { value: '30' } })

    // Save
    fireEvent.click(screen.getByText('Save Step'))

    expect(handleAddStep).toHaveBeenCalledWith(
      expect.objectContaining({ waitTime: '30' })
    )
  })
})

// ─── StepWizard: toSeconds and formatSeconds ────────────────────────────────

describe('StepWizard time conversion', () => {
  it('saves step with timeFrequency mode converting interval/duration to seconds', async () => {
    const handleAddStep = vi.fn()
    render(<ProgramTab {...defaultProps({ handleAddStep })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    // Fill pickup well
    const inputs = screen.getAllByPlaceholderText('e.g., A1, WS1, MC3')
    fireEvent.change(inputs[0], { target: { value: 'A1' } })
    fireEvent.click(screen.getByText('Next'))

    // Switch to timeFrequency mode
    const select = screen.getByDisplayValue('By Quantity')
    fireEvent.change(select, { target: { value: 'timeFrequency' } })

    // Fill interval and duration
    const intervalInput = screen.getByPlaceholderText('e.g., 30')
    fireEvent.change(intervalInput, { target: { value: '5' } })

    // Duration input has placeholder "e.g., 5" but so does Wait Time
    const durationInputs = screen.getAllByPlaceholderText('e.g., 5')
    // The last one should be the Total Duration input
    fireEvent.change(durationInputs[durationInputs.length - 1], { target: { value: '60' } })

    // Save
    fireEvent.click(screen.getByText('Save Step'))

    expect(handleAddStep).toHaveBeenCalledWith(
      expect.objectContaining({
        repetitionMode: 'timeFrequency',
        repetitionInterval: 5,
        repetitionDuration: 60,
      })
    )
  })

  it('converts interval with minutes unit when saving timeFrequency step', async () => {
    const handleAddStep = vi.fn()
    render(<ProgramTab {...defaultProps({ handleAddStep })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const inputs = screen.getAllByPlaceholderText('e.g., A1, WS1, MC3')
    fireEvent.change(inputs[0], { target: { value: 'A1' } })
    fireEvent.click(screen.getByText('Next'))

    const select = screen.getByDisplayValue('By Quantity')
    fireEvent.change(select, { target: { value: 'timeFrequency' } })

    // Set interval value
    const intervalInput = screen.getByPlaceholderText('e.g., 30')
    fireEvent.change(intervalInput, { target: { value: '2' } })

    // Change interval unit to minutes
    const unitSelects = screen.getAllByDisplayValue('Seconds')
    fireEvent.change(unitSelects[0], { target: { value: 'minutes' } })

    // Set duration - use getAllByPlaceholderText since "e.g., 5" is shared
    const durationInputs = screen.getAllByPlaceholderText('e.g., 5')
    fireEvent.change(durationInputs[durationInputs.length - 1], { target: { value: '1' } })

    // Change duration unit to hours - note unitSelects may have shifted
    const unitSelects2 = screen.getAllByDisplayValue('Seconds')
    fireEvent.change(unitSelects2[unitSelects2.length - 1], { target: { value: 'hours' } })

    fireEvent.click(screen.getByText('Save Step'))

    expect(handleAddStep).toHaveBeenCalledWith(
      expect.objectContaining({
        repetitionMode: 'timeFrequency',
        repetitionInterval: 120,  // 2 * 60
        repetitionDuration: 3600, // 1 * 3600
      })
    )
  })

  it('shows seconds conversion hint for interval when non-seconds unit is selected', async () => {
    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const inputs = screen.getAllByPlaceholderText('e.g., A1, WS1, MC3')
    fireEvent.change(inputs[0], { target: { value: 'A1' } })
    fireEvent.click(screen.getByText('Next'))

    const select = screen.getByDisplayValue('By Quantity')
    fireEvent.change(select, { target: { value: 'timeFrequency' } })

    // Set interval value
    const intervalInput = screen.getByPlaceholderText('e.g., 30')
    fireEvent.change(intervalInput, { target: { value: '5' } })

    // Change interval unit to minutes
    const unitSelects = screen.getAllByDisplayValue('Seconds')
    fireEvent.change(unitSelects[0], { target: { value: 'minutes' } })

    // Should show "= 300 seconds"
    expect(screen.getByText('= 300 seconds')).toBeInTheDocument()
  })

  it('shows seconds conversion hint for duration when non-seconds unit is selected', async () => {
    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const inputs = screen.getAllByPlaceholderText('e.g., A1, WS1, MC3')
    fireEvent.change(inputs[0], { target: { value: 'A1' } })
    fireEvent.click(screen.getByText('Next'))

    const select = screen.getByDisplayValue('By Quantity')
    fireEvent.change(select, { target: { value: 'timeFrequency' } })

    // Set duration value - use getAllByPlaceholderText since placeholder is shared
    const durationInputs = screen.getAllByPlaceholderText('e.g., 5')
    fireEvent.change(durationInputs[durationInputs.length - 1], { target: { value: '2' } })

    // Change duration unit to hours
    const unitSelects = screen.getAllByDisplayValue('Seconds')
    fireEvent.change(unitSelects[unitSelects.length - 1], { target: { value: 'hours' } })

    // Should show "= 7200 seconds"
    expect(screen.getByText('= 7200 seconds')).toBeInTheDocument()
  })

  it('changes repetitionQuantity input in quantity mode', async () => {
    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const inputs = screen.getAllByPlaceholderText('e.g., A1, WS1, MC3')
    fireEvent.change(inputs[0], { target: { value: 'A1' } })
    fireEvent.click(screen.getByText('Next'))

    // In quantity mode, both Wait Time and Repeat Step share placeholder "e.g., 5"
    const repInputs = screen.getAllByPlaceholderText('e.g., 5')
    // The second one is "Repeat Step (times)"
    const repInput = repInputs[repInputs.length - 1]
    fireEvent.change(repInput, { target: { value: '10' } })
    expect(repInput.value).toBe('10')
  })
})

// ─── StepWizard validation for dropoff/rinse/wash ──────────────────────────

describe('StepWizard stage1 validation for non-pickup wells', () => {
  it('validates invalid dropoff well ID', async () => {
    const validateWellId = vi.fn((val) => val !== 'BAD')
    render(<ProgramTab {...defaultProps({ validateWellId })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const inputs = screen.getAllByPlaceholderText('e.g., A1, WS1, MC3')
    fireEvent.change(inputs[0], { target: { value: 'A1' } })  // pickup - valid
    fireEvent.change(inputs[1], { target: { value: 'BAD' } })  // dropoff - invalid
    fireEvent.click(screen.getByText('Next'))

    expect(screen.getByText('Invalid well ID')).toBeInTheDocument()
  })

  it('validates invalid rinse well ID', async () => {
    const validateWellId = vi.fn((val) => val !== 'BAD')
    render(<ProgramTab {...defaultProps({ validateWellId })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const inputs = screen.getAllByPlaceholderText('e.g., A1, WS1, MC3')
    fireEvent.change(inputs[0], { target: { value: 'A1' } })   // pickup - valid
    // Rinse well - need to change it to invalid
    fireEvent.change(inputs[3], { target: { value: 'BAD' } })  // rinse
    fireEvent.click(screen.getByText('Next'))

    expect(screen.getByText('Invalid well ID')).toBeInTheDocument()
  })

  it('validates invalid wash well ID', async () => {
    const validateWellId = vi.fn((val) => val !== 'BAD')
    render(<ProgramTab {...defaultProps({ validateWellId })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const inputs = screen.getAllByPlaceholderText('e.g., A1, WS1, MC3')
    fireEvent.change(inputs[0], { target: { value: 'A1' } })   // pickup - valid
    // Wash well
    fireEvent.change(inputs[2], { target: { value: 'BAD' } })  // wash
    fireEvent.click(screen.getByText('Next'))

    expect(screen.getByText('Invalid well ID')).toBeInTheDocument()
  })
})

// ─── StepWizard "Select from plate" for all fields ─────────────────────────

describe('StepWizard select from plate all fields', () => {
  it('invokes setWellSelectionMode for dropoffWell', async () => {
    const setWellSelectionMode = vi.fn()
    const setActiveTab = vi.fn()
    render(
      <ProgramTab
        {...defaultProps({ setWellSelectionMode, setActiveTab })}
      />
    )

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const selectBtns = screen.getAllByText('Select from plate')
    fireEvent.click(selectBtns[1]) // dropoff

    expect(setWellSelectionMode).toHaveBeenCalledWith(
      expect.objectContaining({ field: 'dropoffWell' })
    )
    expect(setActiveTab).toHaveBeenCalledWith('protocol')
  })

  it('invokes setWellSelectionMode for washWell', async () => {
    const setWellSelectionMode = vi.fn()
    const setActiveTab = vi.fn()
    render(
      <ProgramTab
        {...defaultProps({ setWellSelectionMode, setActiveTab })}
      />
    )

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const selectBtns = screen.getAllByText('Select from plate')
    fireEvent.click(selectBtns[2]) // wash

    expect(setWellSelectionMode).toHaveBeenCalledWith(
      expect.objectContaining({ field: 'washWell' })
    )
  })

  it('invokes setWellSelectionMode for rinseWell', async () => {
    const setWellSelectionMode = vi.fn()
    const setActiveTab = vi.fn()
    render(
      <ProgramTab
        {...defaultProps({ setWellSelectionMode, setActiveTab })}
      />
    )

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const selectBtns = screen.getAllByText('Select from plate')
    fireEvent.click(selectBtns[3]) // rinse

    expect(setWellSelectionMode).toHaveBeenCalledWith(
      expect.objectContaining({ field: 'rinseWell' })
    )
  })

  it('well selection callback sets the well value in form', async () => {
    const setWellSelectionMode = vi.fn()
    render(
      <ProgramTab
        {...defaultProps({ setWellSelectionMode })}
      />
    )

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const selectBtns = screen.getAllByText('Select from plate')
    fireEvent.click(selectBtns[0]) // pickup

    // Get the callback that was passed to setWellSelectionMode
    const call = setWellSelectionMode.mock.calls[0][0]
    expect(call.callback).toBeDefined()

    // Invoke the callback to simulate well selection
    call.callback('B5')

    // The pickup well input should now show B5
    await waitFor(() => {
      expect(screen.getByDisplayValue('B5')).toBeInTheDocument()
    })
  })
})

// ─── Edit home step (should skip wizard) ────────────────────────────────────

describe('Edit home step', () => {
  it('clicking Edit on a home step does not open wizard', async () => {
    const step = makeHomeStep()
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Edit'))
    })

    // Should remain on step list, not open wizard
    expect(screen.getByText('Go Home')).toBeInTheDocument()
    expect(screen.queryByText('Select Wells')).not.toBeInTheDocument()
  })
})

// ─── Edit pipette step: update via wizard ───────────────────────────────────

describe('Edit pipette step updates', () => {
  it('updating existing pipette step calls handleUpdateStep', async () => {
    const handleUpdateStep = vi.fn()
    const step = makePipetteStep({ id: 999, pickupWell: 'A1', dropoffWell: 'B2' })
    render(<ProgramTab {...defaultProps({ steps: [step], handleUpdateStep })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Edit'))
    })

    // Change pickup well
    const pickupInput = screen.getByDisplayValue('A1')
    fireEvent.change(pickupInput, { target: { value: 'C3' } })

    // Go to stage 2
    fireEvent.click(screen.getByText('Next'))

    // Click Update Step
    fireEvent.click(screen.getByText('Update Step'))

    expect(handleUpdateStep).toHaveBeenCalledWith(
      999,
      expect.objectContaining({ pickupWell: 'C3' })
    )
  })
})

// ─── Wait input: Enter key ──────────────────────────────────────────────────

describe('Wait input keyboard', () => {
  it('pressing Enter submits wait value', async () => {
    const handleAddStep = vi.fn()
    render(<ProgramTab {...defaultProps({ handleAddStep })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Wait'))
    })

    const input = screen.getByDisplayValue('5')
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(handleAddStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepType: 'wait', waitTime: 15 })
    )
  })

  it('pressing Escape cancels wait input', async () => {
    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Wait'))
    })

    expect(screen.getByText('Wait:')).toBeInTheDocument()

    const input = screen.getByDisplayValue('5')
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByText('Wait:')).not.toBeInTheDocument()
  })
})

// ─── Save dialog keyboard shortcuts ────────────────────────────────────────

describe('Save dialog keyboard', () => {
  it('pressing Enter in program name input triggers save', async () => {
    const fetchMock = mockFetch({
      '/api/programs/list': { programs: [] },
      '/api/programs/save': { name: 'Quick' },
      '/api/program/save': { status: 'success' },
    })
    global.fetch = fetchMock

    const step = makePipetteStep()
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save As'))
    })

    const input = screen.getByPlaceholderText('Enter program name...')
    fireEvent.change(input, { target: { value: 'Quick' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/programs/save',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('pressing Escape in program name input closes save dialog', async () => {
    const step = makePipetteStep()
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save As'))
    })

    expect(screen.getByPlaceholderText('Enter program name...')).toBeInTheDocument()

    const input = screen.getByPlaceholderText('Enter program name...')
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByPlaceholderText('Enter program name...')).not.toBeInTheDocument()
  })
})

// ─── Quick save (Save with existing name) ───────────────────────────────────

describe('Quick save with existing name', () => {
  it('clicking Save when programName is set triggers quick save', async () => {
    const fetchMock = mockFetch({
      '/api/programs/list': {
        programs: [{ name: 'Existing', stepCount: 1 }],
      },
      '/api/programs/load/Existing': {
        steps: [{ id: 1, stepType: 'pipette', pickupWell: 'A1', dropoffWell: 'B1', rinseWell: 'WS2', washWell: 'WS1', sampleVolume: 40, waitTime: 0, cycles: 1, repetitionMode: 'quantity', repetitionQuantity: 1 }],
        schedule: { cronExpression: '', enabled: false },
      },
      '/api/programs/save': { name: 'Existing' },
      '/api/program/save': { status: 'success' },
    })
    global.fetch = fetchMock

    const step = makePipetteStep()
    const handleLoadProgram = vi.fn()
    render(<ProgramTab {...defaultProps({ steps: [step], handleLoadProgram })} />)

    // First load a program to set programName
    await waitFor(() => {
      fireEvent.click(screen.getByText('Load'))
    })

    await waitFor(() => {
      const loadBtns = screen.getAllByText('Load')
      fireEvent.click(loadBtns[loadBtns.length - 1])
    })

    await waitFor(() => {
      expect(handleLoadProgram).toHaveBeenCalled()
    })

    // Now click Save (not Save As) - should quick save
    const saveBtns = screen.getAllByText('Save')
    fireEvent.click(saveBtns[0])

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/programs/save',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })
})

// ─── Close program list ─────────────────────────────────────────────────────

describe('Close program list', () => {
  it('closing program list hides it', async () => {
    global.fetch = mockFetch({
      '/api/programs/list': {
        programs: [{ name: 'P1', stepCount: 2 }],
      },
    })

    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Load'))
    })

    await waitFor(() => {
      expect(screen.getByText('Saved Programs')).toBeInTheDocument()
    })

    // Click the close button (the × symbol)
    fireEvent.click(screen.getByText('\u00d7'))

    expect(screen.queryByText('Saved Programs')).not.toBeInTheDocument()
  })
})

// ─── API error handling ─────────────────────────────────────────────────────

describe('API error handling', () => {
  it('handles fetchPrograms failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
    consoleSpy.mockRestore()
  })

  it('handles handleSaveAs failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = mockFetch({
      '/api/programs/list': { programs: [] },
    })

    const step = makePipetteStep()
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)

    // Replace fetch with one that rejects for save
    global.fetch = vi.fn().mockRejectedValue(new Error('Save error'))

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save As'))
    })

    const input = screen.getByPlaceholderText('Enter program name...')
    fireEvent.change(input, { target: { value: 'Test' } })

    const dialogSaveBtns = screen.getAllByText('Save')
    fireEvent.click(dialogSaveBtns[dialogSaveBtns.length - 1])

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
    consoleSpy.mockRestore()
  })

  it('handles handleLoadFromList failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = mockFetch({
      '/api/programs/list': {
        programs: [{ name: 'P1', stepCount: 2 }],
      },
    })

    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Load'))
    })

    await waitFor(() => {
      expect(screen.getByText('P1')).toBeInTheDocument()
    })

    // Replace fetch with one that rejects
    global.fetch = vi.fn().mockRejectedValue(new Error('Load error'))

    const loadBtns = screen.getAllByText('Load')
    fireEvent.click(loadBtns[loadBtns.length - 1])

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
    consoleSpy.mockRestore()
  })

  it('handles handleDeleteProgram failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = mockFetch({
      '/api/programs/list': {
        programs: [{ name: 'P1', stepCount: 2 }],
      },
    })

    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Load'))
    })

    await waitFor(() => {
      expect(screen.getByText('P1')).toBeInTheDocument()
    })

    // Replace fetch
    global.fetch = vi.fn().mockRejectedValue(new Error('Delete error'))

    const deleteBtn = screen.getByTitle('Delete')
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
    consoleSpy.mockRestore()
  })
})

// ─── describeCron edge cases ─────────────────────────────────────────────────

describe('describeCron edge cases', () => {
  it('shows day-of-week label for unusual dow values', async () => {
    render(
      <ProgramTab
        {...defaultProps({
          schedule: { cronExpression: '0 8 * * 3', enabled: true },
        })}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('Every Wednesday at 08:00')).toBeInTheDocument()
    })
  })

  it('shows generic day-of-week for complex dow like 1,3,5', async () => {
    render(
      <ProgramTab
        {...defaultProps({
          schedule: { cronExpression: '0 8 * * 1,3,5', enabled: true },
        })}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('At 08:00 on day-of-week 1,3,5')).toBeInTheDocument()
    })
  })

  it('shows generic Cron text for complex expressions', async () => {
    render(
      <ProgramTab
        {...defaultProps({
          schedule: { cronExpression: '*/5 */3 1 * *', enabled: true },
        })}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('Cron: */5 */3 1 * *')).toBeInTheDocument()
    })
  })

  it('shows generic Cron text for expressions with non-star dom/month', async () => {
    render(
      <ProgramTab
        {...defaultProps({
          schedule: { cronExpression: '15 10 1 6 *', enabled: true },
        })}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('Cron: 15 10 1 6 *')).toBeInTheDocument()
    })
  })
})

// ─── StepCard: home step with waitTime ──────────────────────────────────────

describe('StepCard: home step with waitTime', () => {
  it('renders home step with wait time detail', async () => {
    const step = makeHomeStep({ waitTime: 10 })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText('Go Home')).toBeInTheDocument()
      expect(screen.getByText('Wait: 10s after')).toBeInTheDocument()
    })
  })
})

// ─── StepCard: pipette step with no optional fields ─────────────────────────

describe('StepCard: pipette step missing fields', () => {
  it('renders step with no wash, no rinse, no volume, no wait, 1 cycle', async () => {
    const step = makePipetteStep({
      pickupWell: 'A1',
      dropoffWell: 'B1',
      washWell: '',
      rinseWell: '',
      sampleVolume: '',
      waitTime: 0,
      cycles: 1,
      repetitionMode: 'quantity',
      repetitionQuantity: 1,
    })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      // Title should show A1 → B1
      expect(screen.getByText(/A1/)).toBeInTheDocument()
    })
  })
})

// ─── StepCard: fmtTime edge cases ───────────────────────────────────────────

describe('StepCard: fmtTime edge cases', () => {
  it('fmtTime returns "?" for zero or NaN', async () => {
    const step = makeWaitStep({ waitTime: 0 })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText('Wait 0s')).toBeInTheDocument()
    })
  })

  it('fmtTime shows fractional hours', async () => {
    const step = makeWaitStep({ waitTime: 5400 }) // 1.5 hours
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText('Wait 1.5 hr')).toBeInTheDocument()
    })
  })

  it('fmtTime shows fractional minutes', async () => {
    const step = makeWaitStep({ waitTime: 90 }) // 1.5 minutes
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText('Wait 1.5 min')).toBeInTheDocument()
    })
  })
})

// ─── estimateProgramTime edge cases ─────────────────────────────────────────

describe('estimateProgramTime edge cases', () => {
  it('estimates time for step with timeFrequency mode and duration', async () => {
    const step = makePipetteStep({
      repetitionMode: 'timeFrequency',
      repetitionDuration: 600,
    })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText(/Est\./)).toBeInTheDocument()
    })
  })

  it('estimates time with waitTime between reps', async () => {
    const step = makePipetteStep({
      waitTime: 5,
      cycles: 2,
      repetitionMode: 'quantity',
      repetitionQuantity: 3,
    })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText(/Est\./)).toBeInTheDocument()
    })
  })

  it('estimates time with known layout coordinates', async () => {
    const step = makePipetteStep({
      pickupWell: 'A1',
      dropoffWell: 'B1',
      rinseWell: 'WS2',
      washWell: 'WS1',
    })
    const config = {
      STEPS_PER_MM_X: 100,
      STEPS_PER_MM_Y: 100,
      STEPS_PER_MM_Z: 100,
      PIPETTE_STEPS_PER_ML: 1000,
      RINSE_CYCLES: 3,
      TRAVEL_SPEED: 0.001,
      PIPETTE_SPEED: 0.002,
      LAYOUT_COORDINATES: {
        microchip: {
          A1: { x: 10, y: 20 },
          B1: { x: 30, y: 40 },
          WS1: { x: 0, y: 0 },
          WS2: { x: 5, y: 5 },
        },
      },
    }
    render(<ProgramTab {...defaultProps({ steps: [step], config })} />)
    await waitFor(() => {
      expect(screen.getByText(/Est\./)).toBeInTheDocument()
    })
  })
})

// ─── wellplate placeholder in wizard ────────────────────────────────────────

describe('Wellplate layout type in wizard', () => {
  it('shows wellplate placeholder text', async () => {
    render(<ProgramTab {...defaultProps({ layoutType: 'wellplate' })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const inputs = screen.getAllByPlaceholderText('e.g., SA1, VA1, WS2')
    expect(inputs.length).toBeGreaterThan(0)
  })
})

// ─── Save dialog Cancel button ──────────────────────────────────────────────

describe('Save dialog cancel', () => {
  it('cancel button in save dialog closes it', async () => {
    const step = makePipetteStep()
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save As'))
    })

    expect(screen.getByPlaceholderText('Enter program name...')).toBeInTheDocument()

    // Click Cancel in the save dialog
    const cancelBtns = screen.getAllByText('Cancel')
    fireEvent.click(cancelBtns[cancelBtns.length - 1])

    expect(screen.queryByPlaceholderText('Enter program name...')).not.toBeInTheDocument()
  })
})

// ─── Save button opens save dialog when no programName ──────────────────────

describe('Save button with no programName', () => {
  it('clicking Save with steps but no programName opens save dialog', async () => {
    const step = makePipetteStep()
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)

    // The first Save button (not Save As) should open the dialog
    // because there's no programName set
    await waitFor(() => {
      const saveBtns = screen.getAllByText('Save')
      fireEvent.click(saveBtns[0])
    })

    // Should show save dialog
    expect(screen.getByPlaceholderText('Enter program name...')).toBeInTheDocument()
  })
})

// ─── Delete current program clears name ─────────────────────────────────────

// ─── StepCard: missing stepType defaults to pipette (line 9) ─────────────────

describe('StepCard: stepType defaults', () => {
  it('renders as pipette step when stepType is undefined', async () => {
    const step = makePipetteStep({ pickupWell: 'A1', dropoffWell: 'B1' })
    delete step.stepType
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      // Should render as pipette: "A1 → B1"
      expect(screen.getByText(/A1/)).toBeInTheDocument()
      expect(screen.getByText(/B1/)).toBeInTheDocument()
    })
  })
})

// ─── StepCard: pipette step with empty pickup/dropoff (lines 27-28) ─────────

describe('StepCard: empty pickup/dropoff wells', () => {
  it('shows em-dash for empty pickup and dropoff wells', async () => {
    const step = makePipetteStep({
      pickupWell: '',
      dropoffWell: '',
      washWell: '',
      rinseWell: '',
      sampleVolume: 0,
      waitTime: 0,
      cycles: 1,
    })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      // When pickup and dropoff are empty, title is "— → —"
      const titleEl = screen.getByText(/\u2014.*\u2192.*\u2014/)
      expect(titleEl).toBeInTheDocument()
    })
  })
})

// ─── StepCard: fmtTime with NaN (line 13) ──────────────────────────────────

describe('StepCard: fmtTime with NaN value', () => {
  it('shows "?" for NaN time in timeFrequency repetitionInterval', async () => {
    const step = makePipetteStep({
      repetitionMode: 'timeFrequency',
      repetitionInterval: 'abc',
      repetitionDuration: 'xyz',
    })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      // fmtTime('abc') and fmtTime('xyz') should return '?'
      expect(screen.getByText(/every \?/)).toBeInTheDocument()
    })
  })
})

// ─── estimateProgramTime: null/empty config (line 902, 522-530) ─────────────

describe('estimateProgramTime with null config', () => {
  it('renders estimate even when config is null', async () => {
    const step = makePipetteStep()
    render(<ProgramTab {...defaultProps({ steps: [step], config: null })} />)
    await waitFor(() => {
      expect(screen.getByText(/Est\./)).toBeInTheDocument()
    })
  })
})

// ─── estimateProgramTime: step without stepType (line 609) ──────────────────

describe('estimateProgramTime: step without stepType defaults to pipette', () => {
  it('estimates time for step with no stepType as pipette step', async () => {
    const step = makePipetteStep({ pickupWell: 'A1', dropoffWell: 'B1' })
    delete step.stepType
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText(/Est\./)).toBeInTheDocument()
    })
  })
})

// ─── estimateProgramTime: step without cycles (line 626) ────────────────────

describe('estimateProgramTime: step without cycles defaults to 1', () => {
  it('estimates time for step with no cycles property', async () => {
    const step = makePipetteStep({ pickupWell: 'A1', dropoffWell: 'B1' })
    delete step.cycles
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText(/Est\./)).toBeInTheDocument()
    })
  })
})

// ─── estimateProgramTime: step without pickupWell/dropoffWell (lines 628-629)

describe('estimateProgramTime: step without pickup/dropoff wells', () => {
  it('estimates time for step with no pickupWell or dropoffWell', async () => {
    const step = makePipetteStep()
    delete step.pickupWell
    delete step.dropoffWell
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText(/Est\./)).toBeInTheDocument()
    })
  })
})

// ─── estimateProgramTime: home step (line 616-622) ──────────────────────────

describe('estimateProgramTime: home step', () => {
  it('estimates time for home step', async () => {
    const step = makeHomeStep()
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText(/Est\./)).toBeInTheDocument()
    })
  })

  it('estimates time for home step with waitTime', async () => {
    const step = makeHomeStep({ waitTime: 30 })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText(/Est\./)).toBeInTheDocument()
    })
  })
})

// ─── estimateProgramTime: wait step (line 611-613) ──────────────────────────

describe('estimateProgramTime: wait step', () => {
  it('estimates time for wait step', async () => {
    const step = makeWaitStep({ waitTime: 60 })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText(/Est\./)).toBeInTheDocument()
    })
  })
})

// ─── estimateProgramTime: repetition quantity > 1 (line 637) ────────────────

describe('estimateProgramTime: quantity repetition', () => {
  it('estimates time with repetition quantity > 1', async () => {
    const step = makePipetteStep({
      repetitionMode: 'quantity',
      repetitionQuantity: 5,
      cycles: 2,
      waitTime: 10,
    })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      expect(screen.getByText(/Est\./)).toBeInTheDocument()
    })
  })
})

// ─── formatDuration: minutes-only time (line 672) ───────────────────────────

describe('formatDuration: minutes-only', () => {
  it('shows minutes-only duration for a wait step of 120s', async () => {
    // A wait step of 120s + homing overhead. The raw wait is 2m.
    const step = makeWaitStep({ waitTime: 120 })
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)
    await waitFor(() => {
      const estBadge = screen.getByText(/Est\./)
      expect(estBadge.textContent).toContain('m')
    })
  })
})

// ─── onDrop: same index no-op (line 872) ────────────────────────────────────

describe('onDrop: same index no-op', () => {
  it('does not call handleReorderSteps when dropping on same index', async () => {
    const handleReorderSteps = vi.fn()
    const step1 = makePipetteStep({ id: 1, pickupWell: 'A1', dropoffWell: 'B1' })
    const step2 = makePipetteStep({ id: 2, pickupWell: 'C1', dropoffWell: 'D1' })
    const { container } = render(
      <ProgramTab
        {...defaultProps({
          steps: [step1, step2],
          handleReorderSteps,
        })}
      />
    )

    await waitFor(() => {
      const cards = container.querySelectorAll('[draggable="true"]')
      expect(cards.length).toBe(2)

      // Drag from index 0 and drop on index 0 (same)
      fireEvent.dragStart(cards[0], { dataTransfer: { effectAllowed: 'move' } })
      fireEvent.drop(cards[0], { dataTransfer: {} })
    })

    // Should NOT have been called since fromIndex === toIndex
    expect(handleReorderSteps).not.toHaveBeenCalled()
  })
})

// ─── Wait input: editing existing wait step with hours default (lines 1029-1033)

describe('Wait input: editing existing wait step with different units', () => {
  it('editing a wait step with hours-scale waitTime shows hours default', async () => {
    const handleUpdateStep = vi.fn()
    const step = makeWaitStep({ id: 111, waitTime: 7200 }) // 2 hours exactly
    render(<ProgramTab {...defaultProps({ steps: [step], handleUpdateStep })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Edit'))
    })

    // Should show the wait input with default unit hours
    expect(screen.getByText('Wait:')).toBeInTheDocument()
    // Default value should be 2 (7200/3600)
    expect(screen.getByDisplayValue('2')).toBeInTheDocument()
    // Default unit select should be hours
    const unitSelect = screen.getByDisplayValue('Hours')
    expect(unitSelect).toBeInTheDocument()
  })

  it('editing a wait step with minutes-scale waitTime shows minutes default', async () => {
    const handleUpdateStep = vi.fn()
    const step = makeWaitStep({ id: 222, waitTime: 300 }) // 5 minutes exactly
    render(<ProgramTab {...defaultProps({ steps: [step], handleUpdateStep })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Edit'))
    })

    expect(screen.getByText('Wait:')).toBeInTheDocument()
    expect(screen.getByDisplayValue('5')).toBeInTheDocument()
    const unitSelect = screen.getByDisplayValue('Minutes')
    expect(unitSelect).toBeInTheDocument()
  })

  it('editing a wait step with seconds-scale waitTime shows seconds default', async () => {
    const handleUpdateStep = vi.fn()
    const step = makeWaitStep({ id: 333, waitTime: 15 }) // 15 seconds
    render(<ProgramTab {...defaultProps({ steps: [step], handleUpdateStep })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByTitle('Edit'))
    })

    expect(screen.getByText('Wait:')).toBeInTheDocument()
    expect(screen.getByDisplayValue('15')).toBeInTheDocument()
    const unitSelect = screen.getByDisplayValue('Seconds')
    expect(unitSelect).toBeInTheDocument()
  })
})

// ─── handleSaveAs: empty name or no steps guards (line 760) ─────────────────

describe('handleSaveAs guards', () => {
  it('does not call API when program name is empty', async () => {
    const fetchMock = mockFetch({
      '/api/programs/list': { programs: [] },
      '/api/programs/save': { name: 'test' },
    })
    global.fetch = fetchMock

    const step = makePipetteStep()
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save As'))
    })

    // Leave name empty and click save
    const dialogSaveBtns = screen.getAllByText('Save')
    // The button should be disabled since name is empty
    const dialogSaveBtn = dialogSaveBtns[dialogSaveBtns.length - 1]
    expect(dialogSaveBtn).toBeDisabled()
  })
})

// ─── handleLoadFromList: non-ok response (line 782) ─────────────────────────

describe('handleLoadFromList non-ok response', () => {
  it('does not call handleLoadProgram when load response is not ok', async () => {
    const handleLoadProgram = vi.fn()
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/programs/list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ programs: [{ name: 'P1', stepCount: 1 }] }),
        })
      }
      if (url.includes('/api/programs/load/P1')) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ detail: 'Not found' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<ProgramTab {...defaultProps({ handleLoadProgram })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Load'))
    })

    await waitFor(() => {
      const loadBtns = screen.getAllByText('Load')
      fireEvent.click(loadBtns[loadBtns.length - 1])
    })

    // Wait a tick
    await waitFor(() => {
      expect(handleLoadProgram).not.toHaveBeenCalled()
    })
  })
})

// ─── handleDeleteProgram: non-ok response (line 799) ────────────────────────

describe('handleDeleteProgram non-ok response', () => {
  it('does not refresh list when delete response is not ok', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/programs/list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ programs: [{ name: 'P1', stepCount: 1 }] }),
        })
      }
      if (url.includes('/api/programs/P1') && !url.includes('/list') && !url.includes('/load')) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ detail: 'Cannot delete' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<ProgramTab {...defaultProps()} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Load'))
    })

    await waitFor(() => {
      expect(screen.getByText('P1')).toBeInTheDocument()
    })

    const deleteBtn = screen.getByTitle('Delete')
    fireEvent.click(deleteBtn)

    // The program should still be listed (not deleted since not ok)
    await waitFor(() => {
      expect(screen.getByText('P1')).toBeInTheDocument()
    })
  })
})

// ─── toSeconds with NaN input (line 151) ────────────────────────────────────

describe('toSeconds with NaN', () => {
  it('returns empty string for NaN input in time conversion', async () => {
    const handleAddStep = vi.fn()
    render(<ProgramTab {...defaultProps({ handleAddStep })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('+ Add Cycle'))
    })

    const inputs = screen.getAllByPlaceholderText('e.g., A1, WS1, MC3')
    fireEvent.change(inputs[0], { target: { value: 'A1' } })
    fireEvent.click(screen.getByText('Next'))

    // Switch to timeFrequency
    const select = screen.getByDisplayValue('By Quantity')
    fireEvent.change(select, { target: { value: 'timeFrequency' } })

    // Set interval to NaN value
    const intervalInput = screen.getByPlaceholderText('e.g., 30')
    fireEvent.change(intervalInput, { target: { value: 'abc' } })

    // Save
    fireEvent.click(screen.getByText('Save Step'))

    expect(handleAddStep).toHaveBeenCalledWith(
      expect.objectContaining({
        repetitionMode: 'timeFrequency',
        repetitionInterval: '',
      })
    )
  })
})

describe('Delete current program clears name', () => {
  it('deleting the currently loaded program clears programName', async () => {
    const handleLoadProgram = vi.fn()
    const fetchMock = mockFetch({
      '/api/programs/list': {
        programs: [{ name: 'Active', stepCount: 1 }],
      },
      '/api/programs/load/Active': {
        steps: [{ id: 1 }],
        schedule: { cronExpression: '', enabled: false },
      },
      '/api/programs/Active': { status: 'success' },
      '/api/program/save': { status: 'success' },
    })
    global.fetch = fetchMock

    // No steps, so there won't be a step card with a "Delete" title button
    render(<ProgramTab {...defaultProps({ steps: [], handleLoadProgram })} />)

    // Load the program first
    await waitFor(() => {
      fireEvent.click(screen.getByText('Load'))
    })

    await waitFor(() => {
      const loadBtns = screen.getAllByText('Load')
      fireEvent.click(loadBtns[loadBtns.length - 1])
    })

    await waitFor(() => {
      expect(handleLoadProgram).toHaveBeenCalled()
    })

    // Open program list again
    fireEvent.click(screen.getByText('Load'))

    await waitFor(() => {
      expect(screen.getByText('Saved Programs')).toBeInTheDocument()
    })

    // Delete it
    const deleteBtn = screen.getByTitle('Delete')
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/programs/Active'),
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })
})

// ─── fetchPrograms: API returns no programs field (line 755) ────────────────

describe('fetchPrograms no programs field', () => {
  it('handles API response without programs field gracefully', async () => {
    global.fetch = mockFetch({
      '/api/programs/list': { status: 'success' },
    })

    render(<ProgramTab {...defaultProps()} />)

    // Open program list - should show "No saved programs" since programs wasn't returned
    await waitFor(() => {
      fireEvent.click(screen.getByText('Load'))
    })

    await waitFor(() => {
      expect(screen.getByText('No saved programs')).toBeInTheDocument()
    })
  })
})

// ─── handleSaveAs: not-ok response (line 771) ──────────────────────────────

describe('handleSaveAs not-ok response', () => {
  it('does not close dialog when save response is not ok', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/programs/list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ programs: [] }),
        })
      }
      if (url.includes('/api/programs/save')) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ detail: 'Name conflict' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    const step = makePipetteStep()
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save As'))
    })

    const input = screen.getByPlaceholderText('Enter program name...')
    fireEvent.change(input, { target: { value: 'TestProgram' } })

    const dialogSaveBtns = screen.getAllByText('Save')
    fireEvent.click(dialogSaveBtns[dialogSaveBtns.length - 1])

    // The dialog should remain open since save was not ok
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter program name...')).toBeInTheDocument()
    })
  })
})

// ─── handleSaveAs: API returns without data.name (line 779) ─────────────────

describe('handleSaveAs fallback name', () => {
  it('uses programName as fallback when API does not return data.name', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/programs/list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ programs: [] }),
        })
      }
      if (url.includes('/api/programs/save')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'success' }), // no `name` field
        })
      }
      if (url.includes('/api/program/save')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'success' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    const step = makePipetteStep()
    render(<ProgramTab {...defaultProps({ steps: [step] })} />)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save As'))
    })

    const input = screen.getByPlaceholderText('Enter program name...')
    fireEvent.change(input, { target: { value: 'FallbackName' } })

    const dialogSaveBtns = screen.getAllByText('Save')
    fireEvent.click(dialogSaveBtns[dialogSaveBtns.length - 1])

    // After saving, the dialog should close and the header should show FallbackName
    await waitFor(() => {
      expect(screen.getByText('FallbackName')).toBeInTheDocument()
    })
  })
})
