import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ManualTab from './ManualTab'

function renderManualTab(overrides = {}) {
  const props = {
    axisPositions: { x: 10, y: 20, z: 30, pipette_ml: 5 },
    isExecuting: false,
    selectedWell: 'A1',
    systemStatus: 'Idle',
    handleAxisMove: vi.fn(),
    handleSetPosition: vi.fn(),
    fetchCurrentPosition: vi.fn(),
    fetchAxisPositions: vi.fn(),
    ...overrides,
  }
  render(<ManualTab {...props} />)
  return props
}

describe('ManualTab', () => {
  describe('Axis controls render', () => {
    it('renders all four axis control cards', () => {
      renderManualTab()
      expect(screen.getByText('X-Axis')).toBeInTheDocument()
      expect(screen.getByText('Y-Axis')).toBeInTheDocument()
      expect(screen.getByText('Z-Axis')).toBeInTheDocument()
      expect(screen.getByText('Pipette')).toBeInTheDocument()
    })

    it('displays current axis values with units', () => {
      renderManualTab({ axisPositions: { x: 15.5, y: 22.3, z: 8, pipette_ml: 3.2 } })
      expect(screen.getByText('15.5 mm')).toBeInTheDocument()
      expect(screen.getByText('22.3 mm')).toBeInTheDocument()
      expect(screen.getByText('8 mm')).toBeInTheDocument()
      expect(screen.getByText('3.2 µL')).toBeInTheDocument()
    })
  })

  describe('Step input changes', () => {
    it('renders step inputs with default value of 100', () => {
      renderManualTab()
      const stepInputs = screen.getAllByRole('spinbutton')
      // The first 4 spinbuttons are the step inputs
      expect(stepInputs[0]).toHaveValue(100)
      expect(stepInputs[1]).toHaveValue(100)
      expect(stepInputs[2]).toHaveValue(100)
      expect(stepInputs[3]).toHaveValue(100)
    })

    it('updates step input value on change', () => {
      renderManualTab()
      const stepInputs = screen.getAllByRole('spinbutton')
      fireEvent.change(stepInputs[0], { target: { value: '250' } })
      expect(stepInputs[0]).toHaveValue(250)
    })

    it('falls back to 1 when step input value is not a number', () => {
      renderManualTab()
      const stepInputs = screen.getAllByRole('spinbutton')
      fireEvent.change(stepInputs[0], { target: { value: '' } })
      expect(stepInputs[0]).toHaveValue(1)
    })
  })

  describe('CW/CCW button clicks', () => {
    it('clicking CCW (-) button calls handleAxisMove with correct args', () => {
      const props = renderManualTab()
      // The "-" buttons contain "- 100" text
      const ccwButtons = screen.getAllByText('- 100')
      // First one is X axis
      fireEvent.click(ccwButtons[0])
      expect(props.handleAxisMove).toHaveBeenCalledWith('x', 100, 'ccw')
    })

    it('clicking CW (+) button calls handleAxisMove with correct args', () => {
      const props = renderManualTab()
      const cwButtons = screen.getAllByText('+ 100')
      // First one is X axis
      fireEvent.click(cwButtons[0])
      expect(props.handleAxisMove).toHaveBeenCalledWith('x', 100, 'cw')
    })

    it('clicking Y-axis CW button calls handleAxisMove for y', () => {
      const props = renderManualTab()
      const cwButtons = screen.getAllByText('+ 100')
      fireEvent.click(cwButtons[1])
      expect(props.handleAxisMove).toHaveBeenCalledWith('y', 100, 'cw')
    })

    it('clicking Z-axis CCW button calls handleAxisMove for z', () => {
      const props = renderManualTab()
      const ccwButtons = screen.getAllByText('- 100')
      fireEvent.click(ccwButtons[2])
      expect(props.handleAxisMove).toHaveBeenCalledWith('z', 100, 'ccw')
    })

    it('clicking Pipette CW button calls handleAxisMove for pipette', () => {
      const props = renderManualTab()
      const cwButtons = screen.getAllByText('+ 100')
      fireEvent.click(cwButtons[3])
      expect(props.handleAxisMove).toHaveBeenCalledWith('pipette', 100, 'cw')
    })

    it('uses updated step value when clicking CW/CCW', () => {
      const props = renderManualTab()
      const stepInputs = screen.getAllByRole('spinbutton')
      fireEvent.change(stepInputs[0], { target: { value: '500' } })

      const cwButtons = screen.getAllByText('+ 500')
      fireEvent.click(cwButtons[0])
      expect(props.handleAxisMove).toHaveBeenCalledWith('x', 500, 'cw')
    })
  })

  describe('Position display', () => {
    it('shows current well', () => {
      renderManualTab({ selectedWell: 'C5' })
      expect(screen.getByText('Current Well: C5')).toBeInTheDocument()
    })

    it('shows "Unknown" when selectedWell is falsy', () => {
      renderManualTab({ selectedWell: null })
      expect(screen.getByText('Current Well: Unknown')).toBeInTheDocument()
    })

    it('shows system status', () => {
      renderManualTab({ systemStatus: 'Moving' })
      expect(screen.getByText('Status: Moving')).toBeInTheDocument()
    })
  })

  describe('Position edit mode', () => {
    it('shows "Set Current Position" button when not in edit mode', () => {
      renderManualTab()
      expect(screen.getByText('Set Current Position')).toBeInTheDocument()
    })

    it('entering edit mode shows position form', () => {
      renderManualTab()
      fireEvent.click(screen.getByText('Set Current Position'))
      expect(screen.getByText('Set Current Position (mm)')).toBeInTheDocument()
      expect(screen.getByText('Apply')).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    it('edit mode pre-fills position inputs with current axis values', () => {
      renderManualTab({ axisPositions: { x: 10, y: 20, z: 30, pipette_ml: 5 } })
      fireEvent.click(screen.getByText('Set Current Position'))

      // Position inputs appear after the 4 step inputs
      const allInputs = screen.getAllByRole('spinbutton')
      // Step inputs are first 4, position inputs are next 4
      const positionInputs = allInputs.slice(4)
      expect(positionInputs[0]).toHaveValue(10)
      expect(positionInputs[1]).toHaveValue(20)
      expect(positionInputs[2]).toHaveValue(30)
      expect(positionInputs[3]).toHaveValue(5)
    })

    it('Apply calls handleSetPosition with form values and exits edit mode', () => {
      const props = renderManualTab({ axisPositions: { x: 10, y: 20, z: 30, pipette_ml: 5 } })
      fireEvent.click(screen.getByText('Set Current Position'))
      fireEvent.click(screen.getByText('Apply'))

      expect(props.handleSetPosition).toHaveBeenCalledWith({
        x: '10',
        y: '20',
        z: '30',
        pipette_ml: '5',
      })
      // Should exit edit mode
      expect(screen.getByText('Set Current Position')).toBeInTheDocument()
    })

    it('Cancel exits edit mode without calling handleSetPosition', () => {
      const props = renderManualTab()
      fireEvent.click(screen.getByText('Set Current Position'))
      expect(screen.getByText('Cancel')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Cancel'))
      expect(props.handleSetPosition).not.toHaveBeenCalled()
      expect(screen.getByText('Set Current Position')).toBeInTheDocument()
    })

    it('can modify position values before applying', () => {
      const props = renderManualTab({ axisPositions: { x: 10, y: 20, z: 30, pipette_ml: 5 } })
      fireEvent.click(screen.getByText('Set Current Position'))

      const allInputs = screen.getAllByRole('spinbutton')
      const positionInputs = allInputs.slice(4)

      fireEvent.change(positionInputs[0], { target: { value: '99.5' } })
      fireEvent.click(screen.getByText('Apply'))

      expect(props.handleSetPosition).toHaveBeenCalledWith({
        x: '99.5',
        y: '20',
        z: '30',
        pipette_ml: '5',
      })
    })

    it('can modify Y position input', () => {
      const props = renderManualTab({ axisPositions: { x: 10, y: 20, z: 30, pipette_ml: 5 } })
      fireEvent.click(screen.getByText('Set Current Position'))

      const allInputs = screen.getAllByRole('spinbutton')
      const positionInputs = allInputs.slice(4)

      fireEvent.change(positionInputs[1], { target: { value: '55.5' } })
      fireEvent.click(screen.getByText('Apply'))

      expect(props.handleSetPosition).toHaveBeenCalledWith({
        x: '10',
        y: '55.5',
        z: '30',
        pipette_ml: '5',
      })
    })

    it('can modify Z position input', () => {
      const props = renderManualTab({ axisPositions: { x: 10, y: 20, z: 30, pipette_ml: 5 } })
      fireEvent.click(screen.getByText('Set Current Position'))

      const allInputs = screen.getAllByRole('spinbutton')
      const positionInputs = allInputs.slice(4)

      fireEvent.change(positionInputs[2], { target: { value: '12.3' } })
      fireEvent.click(screen.getByText('Apply'))

      expect(props.handleSetPosition).toHaveBeenCalledWith({
        x: '10',
        y: '20',
        z: '12.3',
        pipette_ml: '5',
      })
    })

    it('can modify Pipette position input', () => {
      const props = renderManualTab({ axisPositions: { x: 10, y: 20, z: 30, pipette_ml: 5 } })
      fireEvent.click(screen.getByText('Set Current Position'))

      const allInputs = screen.getAllByRole('spinbutton')
      const positionInputs = allInputs.slice(4)

      fireEvent.change(positionInputs[3], { target: { value: '7.77' } })
      fireEvent.click(screen.getByText('Apply'))

      expect(props.handleSetPosition).toHaveBeenCalledWith({
        x: '10',
        y: '20',
        z: '30',
        pipette_ml: '7.77',
      })
    })
  })

  describe('Disabled states during execution', () => {
    it('step inputs are disabled when executing', () => {
      renderManualTab({ isExecuting: true })
      const stepInputs = screen.getAllByRole('spinbutton')
      expect(stepInputs[0]).toBeDisabled()
      expect(stepInputs[1]).toBeDisabled()
      expect(stepInputs[2]).toBeDisabled()
      expect(stepInputs[3]).toBeDisabled()
    })

    it('CW and CCW buttons are disabled when executing', () => {
      renderManualTab({ isExecuting: true })
      const ccwButtons = screen.getAllByText('- 100')
      const cwButtons = screen.getAllByText('+ 100')
      ccwButtons.forEach((btn) => expect(btn).toBeDisabled())
      cwButtons.forEach((btn) => expect(btn).toBeDisabled())
    })

    it('Set Current Position button is disabled when executing', () => {
      renderManualTab({ isExecuting: true })
      expect(screen.getByText('Set Current Position')).toBeDisabled()
    })
  })
})
