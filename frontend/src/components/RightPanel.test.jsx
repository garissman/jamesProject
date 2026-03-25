import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import RightPanel from './RightPanel'

function renderPanel(overrides = {}) {
  const props = {
    logs: [],
    logsEndRef: createRef(),
    activeTab: 'program',
    steps: [],
    targetWell: null,
    isExecuting: false,
    handleMoveToWell: vi.fn(),
    handleExecute: vi.fn(),
    handleStop: vi.fn(),
    handleHome: vi.fn(),
    handleDeleteAll: vi.fn(),
    ...overrides,
  }
  render(<RightPanel {...props} />)
  return props
}

describe('RightPanel', () => {
  describe('Logs', () => {
    it('shows empty state message when no logs', () => {
      renderPanel({ logs: [] })
      expect(screen.getByText('No logs available')).toBeInTheDocument()
    })

    it('renders populated logs', () => {
      renderPanel({ logs: ['Homing complete', 'Step 1 started', 'Step 1 done'] })
      expect(screen.getByText('Homing complete')).toBeInTheDocument()
      expect(screen.getByText('Step 1 started')).toBeInTheDocument()
      expect(screen.getByText('Step 1 done')).toBeInTheDocument()
      expect(screen.queryByText('No logs available')).not.toBeInTheDocument()
    })

    it('assigns logsEndRef to sentinel div', () => {
      const ref = createRef()
      renderPanel({ logs: ['log entry'], logsEndRef: ref })
      expect(ref.current).toBeInstanceOf(HTMLDivElement)
    })
  })

  describe('Action Buttons', () => {
    it('renders Execute, Stop, Home, Delete all buttons', () => {
      renderPanel()
      expect(screen.getByText('Execute')).toBeInTheDocument()
      expect(screen.getByText('Stop')).toBeInTheDocument()
      expect(screen.getByText('Home')).toBeInTheDocument()
      expect(screen.getByText('Delete all')).toBeInTheDocument()
    })

    it('clicking Execute fires handleExecute', () => {
      const props = renderPanel({ steps: [{ id: 1 }] })
      fireEvent.click(screen.getByText('Execute'))
      expect(props.handleExecute).toHaveBeenCalledTimes(1)
    })

    it('clicking Stop fires handleStop', () => {
      const props = renderPanel()
      fireEvent.click(screen.getByText('Stop'))
      expect(props.handleStop).toHaveBeenCalledTimes(1)
    })

    it('clicking Home fires handleHome', () => {
      const props = renderPanel()
      fireEvent.click(screen.getByText('Home'))
      expect(props.handleHome).toHaveBeenCalledTimes(1)
    })

    it('clicking Delete all fires handleDeleteAll', () => {
      const props = renderPanel()
      fireEvent.click(screen.getByText('Delete all'))
      expect(props.handleDeleteAll).toHaveBeenCalledTimes(1)
    })
  })

  describe('Execute disabled states', () => {
    it('Execute is disabled when no steps', () => {
      renderPanel({ steps: [], isExecuting: false })
      expect(screen.getByText('Execute')).toBeDisabled()
    })

    it('Execute is disabled when executing', () => {
      renderPanel({ steps: [{ id: 1 }], isExecuting: true })
      expect(screen.getByText('Executing...')).toBeDisabled()
    })

    it('Execute shows "Executing..." text when executing', () => {
      renderPanel({ steps: [{ id: 1 }], isExecuting: true })
      expect(screen.getByText('Executing...')).toBeInTheDocument()
      expect(screen.queryByText('Execute')).not.toBeInTheDocument()
    })

    it('Execute is enabled when steps exist and not executing', () => {
      renderPanel({ steps: [{ id: 1 }], isExecuting: false })
      expect(screen.getByText('Execute')).not.toBeDisabled()
    })
  })

  describe('Home disabled state', () => {
    it('Home is disabled when executing', () => {
      renderPanel({ isExecuting: true, steps: [{ id: 1 }] })
      expect(screen.getByText('Home')).toBeDisabled()
    })

    it('Home is enabled when not executing', () => {
      renderPanel({ isExecuting: false })
      expect(screen.getByText('Home')).not.toBeDisabled()
    })
  })

  describe('Move-to-well section', () => {
    it('does not render Move-to-well button when targetWell is null', () => {
      renderPanel({ targetWell: null })
      expect(screen.queryByText(/Move to/)).not.toBeInTheDocument()
    })

    it('renders Move-to-well button when targetWell is set', () => {
      renderPanel({ targetWell: 'A1' })
      expect(screen.getByText('Move to A1')).toBeInTheDocument()
    })

    it('clicking Move-to-well fires handleMoveToWell', () => {
      const props = renderPanel({ targetWell: 'B3' })
      fireEvent.click(screen.getByText('Move to B3'))
      expect(props.handleMoveToWell).toHaveBeenCalledTimes(1)
    })

    it('Move-to-well button is disabled when executing', () => {
      renderPanel({ targetWell: 'A1', isExecuting: true, steps: [{ id: 1 }] })
      expect(screen.getByText('Move to A1')).toBeDisabled()
    })
  })
})
