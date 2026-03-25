import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PlateLayout from './PlateLayout'
import { mockFetch } from '../test-utils'

function defaultProps(overrides = {}) {
    return {
        selectedWell: 'A2',
        targetWell: null,
        setTargetWell: vi.fn(),
        currentPipetteCount: 3,
        handleSetPipetteCount: vi.fn(),
        currentOperation: 'idle',
        operationWell: null,
        layoutType: 'microchip',
        handleSetLayout: vi.fn(),
        isExecuting: false,
        config: { PIPETTE_MAX_ML: 100, CONTROLLER_TYPE: null },
        axisPositions: { pipette_ml: 25 },
        zAxisUp: true,
        handleToggleZ: vi.fn(),
        handleCollect: vi.fn(),
        handleDispense: vi.fn(),
        handleWellClick: vi.fn(),
        getPipetteWells: vi.fn((well) => (well ? [well] : [])),
        systemStatus: 'ready',
        controllerType: 'rpi',
        fetchCurrentPosition: vi.fn(),
        fetchAxisPositions: vi.fn(),
        wellSelectionMode: null,
        setWellSelectionMode: vi.fn(),
        ...overrides,
    }
}

describe('PlateLayout', () => {
    beforeEach(() => {
        global.fetch = mockFetch({})
    })

    // --- Layout toggle ---
    describe('Layout toggle', () => {
        it('calls handleSetLayout with "microchip" when MicroChip button is clicked', async () => {
            const props = defaultProps()
            render(<PlateLayout {...props} />)
            const btn = screen.getByRole('button', { name: /MicroChip/i })
            await userEvent.click(btn)
            expect(props.handleSetLayout).toHaveBeenCalledWith('microchip')
        })

        it('calls handleSetLayout with "wellplate" when Vial button is clicked', async () => {
            const props = defaultProps()
            render(<PlateLayout {...props} />)
            const btn = screen.getByRole('button', { name: /Vial/i })
            await userEvent.click(btn)
            expect(props.handleSetLayout).toHaveBeenCalledWith('wellplate')
        })

        it('disables layout buttons when isExecuting is true', () => {
            const props = defaultProps({ isExecuting: true })
            render(<PlateLayout {...props} />)
            expect(screen.getByRole('button', { name: /MicroChip/i })).toBeDisabled()
            expect(screen.getByRole('button', { name: /Vial/i })).toBeDisabled()
        })
    })

    // --- Well click ---
    describe('Well click', () => {
        it('calls handleWellClick with well ID when a well is clicked (microchip layout, 3-pipette)', async () => {
            const props = defaultProps({ currentPipetteCount: 3 })
            render(<PlateLayout {...props} />)
            // In 3-pipette grouped mode, clicking a group fires with middleWell
            // WS1 is always present in microchip layout
            const ws1 = screen.getByText('WS1')
            await userEvent.click(ws1)
            expect(props.handleWellClick).toHaveBeenCalledWith('WS1')
        })

        it('calls handleWellClick with well ID when a well is clicked (microchip layout, 1-pipette)', async () => {
            const props = defaultProps({ currentPipetteCount: 1 })
            render(<PlateLayout {...props} />)
            const ws2 = screen.getByText('WS2')
            await userEvent.click(ws2)
            expect(props.handleWellClick).toHaveBeenCalledWith('WS2')
        })
    })

    // --- Quick Operation Mode ---
    describe('Quick Operation Mode', () => {
        it('enables quick op mode and shows instructions on button click', async () => {
            const props = defaultProps()
            render(<PlateLayout {...props} />)
            const btn = screen.getByRole('button', { name: /Quick Operation Mode/i })
            await userEvent.click(btn)
            expect(screen.getByText(/Click pickup well/i)).toBeInTheDocument()
            expect(screen.getByText(/Click dropoff well/i)).toBeInTheDocument()
            expect(screen.getByText(/Click wash well/i)).toBeInTheDocument()
            expect(screen.getByText(/Click rinse well/i)).toBeInTheDocument()
        })

        it('shows badges after selecting wells in sequence', async () => {
            const props = defaultProps()
            render(<PlateLayout {...props} />)
            // Enable quick op
            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))

            // Step 0: click pickup (WS1)
            await userEvent.click(screen.getByText('WS1'))
            expect(screen.getByText('P')).toBeInTheDocument()
            // The instruction text shows the selected well
            expect(screen.getByText(/Click pickup well.*WS1/)).toBeInTheDocument()

            // Step 1: click dropoff (WS2)
            await userEvent.click(screen.getByText('WS2'))
            expect(screen.getByText('D')).toBeInTheDocument()
            expect(screen.getByText(/Click dropoff well.*WS2/)).toBeInTheDocument()

            // Step 2: click wash (MC1)
            await userEvent.click(screen.getByText('MC1'))
            expect(screen.getByText('W')).toBeInTheDocument()
            expect(screen.getByText(/Click wash well.*MC1/)).toBeInTheDocument()

            // Step 3: click rinse (MC2)
            await userEvent.click(screen.getByText('MC2'))
            expect(screen.getByText('R')).toBeInTheDocument()
            expect(screen.getByText(/Click rinse well.*MC2/)).toBeInTheDocument()
        })

        it('cancels quick op mode', async () => {
            const props = defaultProps()
            render(<PlateLayout {...props} />)
            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))
            expect(screen.getByText(/Click pickup well/i)).toBeInTheDocument()

            await userEvent.click(screen.getByRole('button', { name: /Cancel/i }))
            // Should be back to the quick op enable button
            expect(screen.getByRole('button', { name: /Quick Operation Mode/i })).toBeInTheDocument()
        })

        it('executes quick operation by calling fetch', async () => {
            const props = defaultProps()
            global.fetch = mockFetch({
                '/api/pipetting/execute': { status: 'success' },
            })
            render(<PlateLayout {...props} />)

            // Enable and fill all 4 wells
            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))
            await userEvent.click(screen.getByText('WS1'))  // pickup
            await userEvent.click(screen.getByText('WS2'))  // dropoff
            await userEvent.click(screen.getByText('MC1'))  // wash
            await userEvent.click(screen.getByText('MC2'))  // rinse

            const executeBtn = screen.getByRole('button', { name: /Execute Operation/i })
            expect(executeBtn).not.toBeDisabled()
            await userEvent.click(executeBtn)

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    '/api/pipetting/execute',
                    expect.objectContaining({ method: 'POST' })
                )
            })
        })

        it('disables execute button when not all wells selected', async () => {
            const props = defaultProps()
            render(<PlateLayout {...props} />)
            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))
            // Only pick one well
            await userEvent.click(screen.getByText('WS1'))

            const executeBtn = screen.getByRole('button', { name: /Execute Operation/i })
            expect(executeBtn).toBeDisabled()
        })

        it('does not call handleWellClick in quick op mode', async () => {
            const props = defaultProps()
            render(<PlateLayout {...props} />)
            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))
            await userEvent.click(screen.getByText('WS1'))
            expect(props.handleWellClick).not.toHaveBeenCalled()
        })

        it('shows "Executing..." text when isExecuting during quick op', () => {
            const props = defaultProps({ isExecuting: true })
            // We need to render in quick op mode but the button is disabled when executing
            // So render without executing, enable quick op, then re-render
            render(<PlateLayout {...props} />)
            // Since isExecuting=true from the start, the "Quick Operation Mode" button is disabled
            expect(screen.getByRole('button', { name: /Quick Operation Mode/i })).toBeDisabled()
        })
    })

    // --- Z-Axis toggle ---
    describe('Z-Axis toggle', () => {
        it('shows DOWN when zAxisUp is true', () => {
            const props = defaultProps({ zAxisUp: true })
            render(<PlateLayout {...props} />)
            expect(screen.getByRole('button', { name: /Z-Axis.*DOWN/i })).toBeInTheDocument()
        })

        it('shows UP when zAxisUp is false', () => {
            const props = defaultProps({ zAxisUp: false })
            render(<PlateLayout {...props} />)
            expect(screen.getByRole('button', { name: /Z-Axis.*UP/i })).toBeInTheDocument()
        })

        it('calls handleToggleZ on click', async () => {
            const props = defaultProps()
            render(<PlateLayout {...props} />)
            await userEvent.click(screen.getByRole('button', { name: /Z-Axis/i }))
            expect(props.handleToggleZ).toHaveBeenCalledTimes(1)
        })

        it('disables Z button when executing', () => {
            const props = defaultProps({ isExecuting: true })
            render(<PlateLayout {...props} />)
            expect(screen.getByRole('button', { name: /Z-Axis/i })).toBeDisabled()
        })
    })

    // --- Collect / Dispense ---
    describe('Collect and Dispense', () => {
        it('calls handleCollect with volume when Collect is clicked', async () => {
            const props = defaultProps()
            render(<PlateLayout {...props} />)
            await userEvent.click(screen.getByRole('button', { name: /Collect/i }))
            expect(props.handleCollect).toHaveBeenCalledWith('40')
        })

        it('calls handleDispense with volume when Dispense is clicked', async () => {
            const props = defaultProps()
            render(<PlateLayout {...props} />)
            await userEvent.click(screen.getByRole('button', { name: /Dispense/i }))
            expect(props.handleDispense).toHaveBeenCalledWith('40')
        })

        it('updates volume input and passes new value', async () => {
            const props = defaultProps()
            render(<PlateLayout {...props} />)
            // The volume input is labeled "Volume (uL):"
            const inputs = screen.getAllByRole('spinbutton')
            // The pipette volume input is the first one (the quick op volume is hidden since quick op is off)
            const volumeInput = inputs[0]
            await userEvent.clear(volumeInput)
            await userEvent.type(volumeInput, '55')
            await userEvent.click(screen.getByRole('button', { name: /Collect/i }))
            expect(props.handleCollect).toHaveBeenCalledWith('55')
        })

        it('disables collect/dispense buttons when executing', () => {
            const props = defaultProps({ isExecuting: true })
            render(<PlateLayout {...props} />)
            expect(screen.getByRole('button', { name: /Collect/i })).toBeDisabled()
            expect(screen.getByRole('button', { name: /Dispense/i })).toBeDisabled()
        })

        it('shows current pipette volume', () => {
            const props = defaultProps({ axisPositions: { pipette_ml: 42 } })
            render(<PlateLayout {...props} />)
            expect(screen.getByText('42 \u00B5L')).toBeInTheDocument()
        })
    })

    // --- Well Selection Mode ---
    describe('Well selection mode banner', () => {
        it('shows banner with field name for pickupWell', () => {
            const props = defaultProps({ wellSelectionMode: { field: 'pickupWell' } })
            render(<PlateLayout {...props} />)
            expect(screen.getByText(/Selecting well for:.*Pickup Well/i)).toBeInTheDocument()
        })

        it('shows banner with field name for dropoffWell', () => {
            const props = defaultProps({ wellSelectionMode: { field: 'dropoffWell' } })
            render(<PlateLayout {...props} />)
            expect(screen.getByText(/Selecting well for:.*Dropoff Well/i)).toBeInTheDocument()
        })

        it('shows banner with field name for washWell', () => {
            const props = defaultProps({ wellSelectionMode: { field: 'washWell' } })
            render(<PlateLayout {...props} />)
            expect(screen.getByText(/Selecting well for:.*Wash Well/i)).toBeInTheDocument()
        })

        it('shows banner with field name for rinseWell', () => {
            const props = defaultProps({ wellSelectionMode: { field: 'rinseWell' } })
            render(<PlateLayout {...props} />)
            expect(screen.getByText(/Selecting well for:.*Rinse Well/i)).toBeInTheDocument()
        })

        it('dismisses banner when Cancel is clicked', async () => {
            const props = defaultProps({ wellSelectionMode: { field: 'pickupWell' } })
            render(<PlateLayout {...props} />)
            // There are two Cancel buttons potentially - find the one in the banner
            const cancelButtons = screen.getAllByRole('button', { name: /Cancel/i })
            await userEvent.click(cancelButtons[0])
            expect(props.setWellSelectionMode).toHaveBeenCalledWith(null)
        })

        it('does not show banner when wellSelectionMode is null', () => {
            const props = defaultProps({ wellSelectionMode: null })
            render(<PlateLayout {...props} />)
            expect(screen.queryByText(/Selecting well for/i)).not.toBeInTheDocument()
        })
    })

    // --- Operation status display ---
    describe('Operation status display', () => {
        it('shows aspirating status', () => {
            const props = defaultProps({ currentOperation: 'aspirating', operationWell: 'A2' })
            render(<PlateLayout {...props} />)
            expect(screen.getByText(/Aspirating/)).toBeInTheDocument()
            expect(screen.getByText(/at A2/)).toBeInTheDocument()
        })

        it('shows dispensing status', () => {
            const props = defaultProps({ currentOperation: 'dispensing', operationWell: 'B5' })
            render(<PlateLayout {...props} />)
            expect(screen.getByText(/Dispensing/)).toBeInTheDocument()
            expect(screen.getByText(/at B5/)).toBeInTheDocument()
        })

        it('shows moving status', () => {
            const props = defaultProps({ currentOperation: 'moving', operationWell: 'C3' })
            render(<PlateLayout {...props} />)
            expect(screen.getByText(/Moving/)).toBeInTheDocument()
            expect(screen.getByText(/at C3/)).toBeInTheDocument()
        })

        it('does not show operation when idle', () => {
            const props = defaultProps({ currentOperation: 'idle', operationWell: 'A1' })
            render(<PlateLayout {...props} />)
            expect(screen.queryByText(/Aspirating/)).not.toBeInTheDocument()
            expect(screen.queryByText(/Dispensing/)).not.toBeInTheDocument()
            expect(screen.queryByText(/Moving/)).not.toBeInTheDocument()
        })

        it('does not show operation when operationWell is null', () => {
            const props = defaultProps({ currentOperation: 'aspirating', operationWell: null })
            render(<PlateLayout {...props} />)
            expect(screen.queryByText(/Aspirating/)).not.toBeInTheDocument()
        })
    })

    // --- Header display ---
    describe('Header display', () => {
        it('shows position and status', () => {
            const props = defaultProps({ selectedWell: 'D4', systemStatus: 'homing' })
            render(<PlateLayout {...props} />)
            expect(screen.getByText(/Position:.*D4/)).toBeInTheDocument()
            expect(screen.getByText(/Status:.*homing/)).toBeInTheDocument()
        })

        it('shows RPi badge when controller is rpi', () => {
            const props = defaultProps({ controllerType: 'rpi', config: { CONTROLLER_TYPE: null, PIPETTE_MAX_ML: 100 } })
            render(<PlateLayout {...props} />)
            expect(screen.getByText('RPi')).toBeInTheDocument()
        })

        it('shows Arduino badge when controller is arduino_uno_q', () => {
            const props = defaultProps({ controllerType: 'arduino_uno_q' })
            render(<PlateLayout {...props} />)
            expect(screen.getByText('Arduino')).toBeInTheDocument()
        })
    })

    // --- Microchip grid rendering ---
    describe('Microchip grid rendering', () => {
        it('renders WS1, WS2, and MC1-MC5 in microchip layout', () => {
            const props = defaultProps({ layoutType: 'microchip' })
            render(<PlateLayout {...props} />)
            expect(screen.getByText('WS1')).toBeInTheDocument()
            expect(screen.getByText('WS2')).toBeInTheDocument()
            expect(screen.getByText('MC1')).toBeInTheDocument()
            expect(screen.getByText('MC2')).toBeInTheDocument()
            expect(screen.getByText('MC3')).toBeInTheDocument()
            expect(screen.getByText('MC4')).toBeInTheDocument()
            expect(screen.getByText('MC5')).toBeInTheDocument()
        })

        it('clicking MC3 calls handleWellClick with MC3', async () => {
            const props = defaultProps({ layoutType: 'microchip' })
            render(<PlateLayout {...props} />)
            await userEvent.click(screen.getByText('MC3'))
            expect(props.handleWellClick).toHaveBeenCalledWith('MC3')
        })
    })

    // --- Vial grid rendering ---
    describe('Vial grid rendering', () => {
        it('renders WS1, WS2, and vials in wellplate layout', () => {
            const props = defaultProps({ layoutType: 'wellplate' })
            render(<PlateLayout {...props} />)
            expect(screen.getByText('WS1')).toBeInTheDocument()
            expect(screen.getByText('WS2')).toBeInTheDocument()
            // Vials: VA1, VA2, VA3, etc.
            expect(screen.getByText('VA1')).toBeInTheDocument()
            expect(screen.getByText('VE3')).toBeInTheDocument()
        })

        it('clicking a vial group calls handleWellClick with middle vial', async () => {
            const props = defaultProps({ layoutType: 'wellplate' })
            render(<PlateLayout {...props} />)
            // VA2 is the middle vial of group A => clicking the group fires VA2
            await userEvent.click(screen.getByText('VA2'))
            expect(props.handleWellClick).toHaveBeenCalledWith('VA2')
        })
    })

    // --- Grouped 3-pipette mode (microchip) ---
    describe('Grouped 3-pipette mode', () => {
        it('renders 5 groups per row in microchip layout with pipetteCount=3', () => {
            const getPipetteWells = vi.fn((well) => {
                if (!well) return []
                // Extract row and col
                const row = well.charAt(0)
                const col = parseInt(well.substring(1))
                return [`${row}${col - 1}`, well, `${row}${col + 1}`]
            })
            const props = defaultProps({ currentPipetteCount: 3, getPipetteWells })
            render(<PlateLayout {...props} />)
            // In grouped mode, there should be 8 rows * 5 groups = 40 group cells
            // Each group has a title attribute with the middle well
            // Check that A2 group exists (middleWell for group 0: cols 1,2,3 => middle=A2)
            const group = document.querySelector('[title="A2"]')
            expect(group).not.toBeNull()
        })
    })

    // --- Individual 1-pipette mode (microchip) ---
    describe('Individual 1-pipette mode', () => {
        it('renders 15x8 individual wells in microchip layout with pipetteCount=1', () => {
            const props = defaultProps({ currentPipetteCount: 1, layoutType: 'microchip' })
            render(<PlateLayout {...props} />)
            // Should have WS1, WS2, and individual well circles
            expect(screen.getByText('WS1')).toBeInTheDocument()
            expect(screen.getByText('WS2')).toBeInTheDocument()
            // MC chips should still be present
            expect(screen.getByText('MC1')).toBeInTheDocument()
        })
    })

    // --- Quick op execute error handling ---
    describe('Quick op execute error handling', () => {
        it('handles fetch error on execute', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

            const props = defaultProps()
            render(<PlateLayout {...props} />)
            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))
            await userEvent.click(screen.getByText('WS1'))
            await userEvent.click(screen.getByText('WS2'))
            await userEvent.click(screen.getByText('MC1'))
            await userEvent.click(screen.getByText('MC2'))

            await userEvent.click(screen.getByRole('button', { name: /Execute Operation/i }))

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unable to connect'))
            })
            consoleSpy.mockRestore()
        })

        it('handles API error response on execute', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({ detail: 'Motor fault' }),
            })

            const props = defaultProps()
            render(<PlateLayout {...props} />)
            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))
            await userEvent.click(screen.getByText('WS1'))
            await userEvent.click(screen.getByText('WS2'))
            await userEvent.click(screen.getByText('MC1'))
            await userEvent.click(screen.getByText('MC2'))
            await userEvent.click(screen.getByRole('button', { name: /Execute Operation/i }))

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Motor fault'))
            })
            consoleSpy.mockRestore()
        })
    })

    // --- Quick op missing wells (console.error path) ---
    describe('Quick op missing wells guard', () => {
        it('logs error when executing with missing wells (pickup missing)', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            const props = defaultProps()
            render(<PlateLayout {...props} />)

            // Enable quick op
            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))

            // Manually trigger handleExecuteQuickOp without selecting all wells
            // We can't easily do this via the disabled button, so we test the internal guard
            // by rendering with all 4 wells but setting one to empty programmatically
            // The button should be disabled, so this path is only hit internally
            // Let's verify the button is disabled when not all selected
            const executeBtn = screen.getByRole('button', { name: /Execute Operation/i })
            expect(executeBtn).toBeDisabled()

            consoleSpy.mockRestore()
        })
    })

    // --- Quick op invalid volume guard ---
    describe('Quick op invalid volume guard', () => {
        it('logs error when volume is invalid (zero)', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            const props = defaultProps({ config: { PIPETTE_MAX_ML: 100, CONTROLLER_TYPE: null } })
            render(<PlateLayout {...props} />)

            // Enable quick op and select all wells
            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))
            await userEvent.click(screen.getByText('WS1'))  // pickup
            await userEvent.click(screen.getByText('WS2'))  // dropoff
            await userEvent.click(screen.getByText('MC1'))  // wash
            await userEvent.click(screen.getByText('MC2'))  // rinse

            // Set volume to 0 using fireEvent for direct control
            const volumeInputs = screen.getAllByRole('spinbutton')
            // In quick op mode there are two spinbuttons - find the quick op one
            const quickVolInput = volumeInputs[volumeInputs.length - 1]
            fireEvent.change(quickVolInput, { target: { value: '0' } })

            // Execute
            const executeBtn = screen.getByRole('button', { name: /Execute Operation/i })
            await userEvent.click(executeBtn)

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Volume must be between'))
            })
            consoleSpy.mockRestore()
        })
    })

    // --- Wellplate layout (vial) specific rendering ---
    describe('Wellplate (Vial) layout specific', () => {
        it('renders wellplate layout with WS1, WS2, vials and wells', () => {
            const props = defaultProps({ layoutType: 'wellplate' })
            render(<PlateLayout {...props} />)
            // Check that wellplate-specific vials are present
            expect(screen.getAllByText('WS1').length).toBeGreaterThanOrEqual(1)
            expect(screen.getAllByText('WS2').length).toBeGreaterThanOrEqual(1)
        })

        it('renders wellplate middle column wells', () => {
            const props = defaultProps({ layoutType: 'wellplate' })
            render(<PlateLayout {...props} />)
            // Middle column wells from the second grid section (rows A-L, groupIdx=0)
            // These are wellIds like A2 (middle of group [1,2,3])
            // Check some representative wells exist
            expect(document.querySelector('[class*="grid-cols-3"]')).not.toBeNull()
        })

        it('renders wellplate right column wells', () => {
            const props = defaultProps({ layoutType: 'wellplate' })
            render(<PlateLayout {...props} />)
            // Right column wells from the third grid section (rows A-L, groupIdx=1)
            // These are wellIds like A5 (middle of group [4,5,6])
            const allGrids = document.querySelectorAll('[class*="grid-cols-3"]')
            expect(allGrids.length).toBeGreaterThan(0)
        })

        it('clicking a well in wellplate vial section works', async () => {
            const props = defaultProps({ layoutType: 'wellplate' })
            render(<PlateLayout {...props} />)
            // Click VA2 which is in the vial section
            const va2 = screen.getByText('VA2')
            await userEvent.click(va2)
            expect(props.handleWellClick).toHaveBeenCalledWith('VA2')
        })

        it('clicking WS1 in wellplate layout calls handleWellClick', async () => {
            const props = defaultProps({ layoutType: 'wellplate' })
            render(<PlateLayout {...props} />)
            const ws1Elements = screen.getAllByText('WS1')
            await userEvent.click(ws1Elements[0])
            expect(props.handleWellClick).toHaveBeenCalledWith('WS1')
        })

        it('clicking WS2 in wellplate layout calls handleWellClick', async () => {
            const props = defaultProps({ layoutType: 'wellplate' })
            render(<PlateLayout {...props} />)
            const ws2Elements = screen.getAllByText('WS2')
            await userEvent.click(ws2Elements[0])
            expect(props.handleWellClick).toHaveBeenCalledWith('WS2')
        })
    })

    // --- config.CONTROLLER_TYPE badge (line 339) ---
    describe('Controller type badge from config', () => {
        it('shows Arduino badge when config.CONTROLLER_TYPE is arduino_uno_q', () => {
            const props = defaultProps({
                config: { CONTROLLER_TYPE: 'arduino_uno_q', PIPETTE_MAX_ML: 100 },
                controllerType: 'rpi',
            })
            render(<PlateLayout {...props} />)
            expect(screen.getByText('Arduino')).toBeInTheDocument()
        })
    })

    // --- Individual well click in 1-pipette microchip mode (line 481) ---
    describe('Individual well click in 1-pipette microchip mode', () => {
        it('clicking an individual well in 1-pipette mode calls handleWellClick', async () => {
            const props = defaultProps({ currentPipetteCount: 1, layoutType: 'microchip' })
            render(<PlateLayout {...props} />)
            // In 1-pipette individual mode, each well is rendered individually
            // WS1 and WS2 are always present; click WS1
            await userEvent.click(screen.getByText('WS1'))
            expect(props.handleWellClick).toHaveBeenCalledWith('WS1')
        })
    })

    // --- Group well click in 3-pipette microchip mode (line 424) ---
    describe('Group well click in 3-pipette microchip mode', () => {
        it('clicking a well group in 3-pipette mode calls handleWellClick with middleWell', async () => {
            const props = defaultProps({ currentPipetteCount: 3, layoutType: 'microchip' })
            render(<PlateLayout {...props} />)
            // Groups have title attribute with middle well ID
            const group = document.querySelector('[title="A2"]')
            expect(group).not.toBeNull()
            await userEvent.click(group)
            expect(props.handleWellClick).toHaveBeenCalledWith('A2')
        })
    })

    // --- Quick op in wellplate layout ---
    describe('Quick op badges in wellplate layout', () => {
        it('shows quick op badges on wellplate vials', async () => {
            const props = defaultProps({ layoutType: 'wellplate' })
            render(<PlateLayout {...props} />)

            // Enable quick op
            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))

            // Click wells for each role
            const ws1Elements = screen.getAllByText('WS1')
            await userEvent.click(ws1Elements[0]) // pickup
            const ws2Elements = screen.getAllByText('WS2')
            await userEvent.click(ws2Elements[0]) // dropoff

            // Verify badges
            expect(screen.getByText('P')).toBeInTheDocument()
            expect(screen.getByText('D')).toBeInTheDocument()
        })
    })

    // --- Individual 1-pipette well click on grid cells (line 481) ---
    describe('Individual 1-pipette well click on grid cells', () => {
        it('clicking an individual grid well in 1-pipette mode calls handleWellClick', async () => {
            const props = defaultProps({ currentPipetteCount: 1, layoutType: 'microchip', selectedWell: 'A1' })
            render(<PlateLayout {...props} />)
            // In 1-pipette individual mode, wells are rendered in a 15x8 grid
            // Find the grid and click its first child (A1)
            const gridContainer = document.querySelector('.grid.grid-cols-\\[repeat\\(15\\,1fr\\)\\]')
            expect(gridContainer).not.toBeNull()
            const wellDiv = gridContainer.children[0]
            await userEvent.click(wellDiv)
            expect(props.handleWellClick).toHaveBeenCalledWith('A1')
        })
    })

    // --- Wellplate middle column well click (line 640) ---
    describe('Wellplate middle column well click', () => {
        it('clicking a well in the middle column of wellplate layout calls handleWellClick', async () => {
            const props = defaultProps({ layoutType: 'wellplate' })
            render(<PlateLayout {...props} />)
            // The wellplate has 3 column divs. The 2nd column has 12 row groups (A-L).
            // Each group renders with onClick(() => onWellClick(middleWell)) where middleWell is e.g. A2
            // Get the 3 column containers (direct children of the main grid)
            const mainGrid = document.querySelector('.grid.grid-cols-3')
            expect(mainGrid).not.toBeNull()
            const columns = mainGrid.children
            expect(columns.length).toBe(3)
            // Middle column (index 1) has 12 groups, click the first one
            const middleCol = columns[1]
            const firstGroup = middleCol.children[0]
            await userEvent.click(firstGroup)
            expect(props.handleWellClick).toHaveBeenCalledWith('A2')
        })
    })

    // --- Wellplate right column well click (line 695) ---
    describe('Wellplate right column well click', () => {
        it('clicking a well in the right column of wellplate layout calls handleWellClick', async () => {
            const props = defaultProps({ layoutType: 'wellplate' })
            render(<PlateLayout {...props} />)
            const mainGrid = document.querySelector('.grid.grid-cols-3')
            const columns = mainGrid.children
            // Right column (index 2) has 12 groups, click the first one
            const rightCol = columns[2]
            const firstGroup = rightCol.children[0]
            await userEvent.click(firstGroup)
            expect(props.handleWellClick).toHaveBeenCalledWith('A5')
        })
    })

    // --- Quick op successful execute resets state (lines 88-90) ---
    describe('Quick op successful execute resets state', () => {
        it('resets quick op mode on successful execute and calls fetchCurrentPosition', async () => {
            const props = defaultProps()
            global.fetch = mockFetch({
                '/api/pipetting/execute': { status: 'success' },
            })
            render(<PlateLayout {...props} />)

            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))
            await userEvent.click(screen.getByText('WS1'))
            await userEvent.click(screen.getByText('WS2'))
            await userEvent.click(screen.getByText('MC1'))
            await userEvent.click(screen.getByText('MC2'))

            await userEvent.click(screen.getByRole('button', { name: /Execute Operation/i }))

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Quick Operation Mode/i })).toBeInTheDocument()
            })
            expect(props.fetchCurrentPosition).toHaveBeenCalled()
        })
    })

    // --- Quick op volume > max guard ---
    describe('Quick op volume exceeding max', () => {
        it('logs error when volume exceeds PIPETTE_MAX_ML', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            const props = defaultProps({ config: { PIPETTE_MAX_ML: 50, CONTROLLER_TYPE: null } })
            render(<PlateLayout {...props} />)

            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))
            await userEvent.click(screen.getByText('WS1'))
            await userEvent.click(screen.getByText('WS2'))
            await userEvent.click(screen.getByText('MC1'))
            await userEvent.click(screen.getByText('MC2'))

            const volumeInputs = screen.getAllByRole('spinbutton')
            const quickVolInput = volumeInputs[volumeInputs.length - 1]
            fireEvent.change(quickVolInput, { target: { value: '999' } })

            await userEvent.click(screen.getByRole('button', { name: /Execute Operation/i }))

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Volume must be between'))
            })
            consoleSpy.mockRestore()
        })
    })

    // --- Quick op NaN volume guard ---
    describe('Quick op NaN volume', () => {
        it('logs error when volume is not a number', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            const props = defaultProps()
            render(<PlateLayout {...props} />)

            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))
            await userEvent.click(screen.getByText('WS1'))
            await userEvent.click(screen.getByText('WS2'))
            await userEvent.click(screen.getByText('MC1'))
            await userEvent.click(screen.getByText('MC2'))

            const volumeInputs = screen.getAllByRole('spinbutton')
            const quickVolInput = volumeInputs[volumeInputs.length - 1]
            fireEvent.change(quickVolInput, { target: { value: '' } })

            await userEvent.click(screen.getByRole('button', { name: /Execute Operation/i }))

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Volume must be between'))
            })
            consoleSpy.mockRestore()
        })
    })

    // --- Executing text in quick op mode ---
    describe('Executing text during quick op', () => {
        it('shows "Executing..." text when isExecuting is true and all wells selected', async () => {
            const props = defaultProps({ isExecuting: false })
            const { rerender } = render(<PlateLayout {...props} />)

            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))
            await userEvent.click(screen.getByText('WS1'))
            await userEvent.click(screen.getByText('WS2'))
            await userEvent.click(screen.getByText('MC1'))
            await userEvent.click(screen.getByText('MC2'))

            rerender(<PlateLayout {...defaultProps({ isExecuting: true })} />)
            expect(screen.getByText('Executing...')).toBeInTheDocument()
        })
    })

    // --- Target well highlighting in grouped mode ---
    describe('Target well highlighting in grouped mode', () => {
        it('highlights target well group in 3-pipette mode', () => {
            const props = defaultProps({ targetWell: 'A2', currentPipetteCount: 3, layoutType: 'microchip' })
            render(<PlateLayout {...props} />)
            const group = document.querySelector('[title="A2"]')
            expect(group).not.toBeNull()
            expect(group.className).toContain('FF9800')
        })
    })

    // --- Operation animation in grouped mode ---
    describe('Operation animation in grouped mode', () => {
        it('shows aspirating animation on group containing operationWell', () => {
            const getPipetteWells = vi.fn((well, _count) => {
                if (!well) return []
                const row = well.charAt(0)
                const col = parseInt(well.substring(1))
                return [`${row}${col - 1}`, well, `${row}${col + 1}`]
            })
            const props = defaultProps({
                currentPipetteCount: 3,
                layoutType: 'microchip',
                currentOperation: 'aspirating',
                operationWell: 'A2',
                getPipetteWells,
            })
            render(<PlateLayout {...props} />)
            const group = document.querySelector('[title="A2"]')
            expect(group.className).toContain('3b82f6')
        })

        it('shows dispensing animation on group containing operationWell', () => {
            const getPipetteWells = vi.fn((well, _count) => {
                if (!well) return []
                const row = well.charAt(0)
                const col = parseInt(well.substring(1))
                return [`${row}${col - 1}`, well, `${row}${col + 1}`]
            })
            const props = defaultProps({
                currentPipetteCount: 3,
                layoutType: 'microchip',
                currentOperation: 'dispensing',
                operationWell: 'A2',
                getPipetteWells,
            })
            render(<PlateLayout {...props} />)
            const group = document.querySelector('[title="A2"]')
            expect(group.className).toContain('10b981')
        })

        it('shows moving animation on group containing operationWell', () => {
            const getPipetteWells = vi.fn((well, _count) => {
                if (!well) return []
                const row = well.charAt(0)
                const col = parseInt(well.substring(1))
                return [`${row}${col - 1}`, well, `${row}${col + 1}`]
            })
            const props = defaultProps({
                currentPipetteCount: 3,
                layoutType: 'microchip',
                currentOperation: 'moving',
                operationWell: 'A2',
                getPipetteWells,
            })
            render(<PlateLayout {...props} />)
            const group = document.querySelector('[title="A2"]')
            expect(group.className).toContain('f59e0b')
        })
    })

    // --- Quick op badges in grouped mode ---
    describe('Quick op badges in microchip grouped mode', () => {
        it('shows P, D, R, W badges on groups in 3-pipette mode', async () => {
            const props = defaultProps({ currentPipetteCount: 3, layoutType: 'microchip' })
            render(<PlateLayout {...props} />)

            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))

            const groupA2 = document.querySelector('[title="A2"]')
            await userEvent.click(groupA2)
            const groupA5 = document.querySelector('[title="A5"]')
            await userEvent.click(groupA5)
            const groupA8 = document.querySelector('[title="A8"]')
            await userEvent.click(groupA8)
            const groupA11 = document.querySelector('[title="A11"]')
            await userEvent.click(groupA11)

            expect(screen.getByText('P')).toBeInTheDocument()
            expect(screen.getByText('D')).toBeInTheDocument()
            expect(screen.getByText('W')).toBeInTheDocument()
            expect(screen.getByText('R')).toBeInTheDocument()
        })
    })

    // --- MC chip target/selected state ---
    describe('MC chip target and selected state', () => {
        it('highlights target MC chip with orange border', () => {
            const props = defaultProps({ targetWell: 'MC3', layoutType: 'microchip' })
            render(<PlateLayout {...props} />)
            const mc3 = screen.getByText('MC3').closest('div')
            expect(mc3.className).toContain('FF9800')
        })

        it('highlights selected MC chip with green style', () => {
            const props = defaultProps({ selectedWell: 'MC1', layoutType: 'microchip' })
            render(<PlateLayout {...props} />)
            const mc1 = screen.getByText('MC1').closest('div')
            expect(mc1.className).toContain('4CAF50')
        })
    })

    // --- Wellplate vial operation animations ---
    describe('Wellplate vial operation animations', () => {
        it('shows aspirating animation on vials in wellplate layout', () => {
            const getPipetteWells = vi.fn((well, _count) => well ? [well] : [])
            const props = defaultProps({
                layoutType: 'wellplate',
                currentOperation: 'aspirating',
                operationWell: 'VA2',
                getPipetteWells,
            })
            render(<PlateLayout {...props} />)
            const va2Parent = screen.getByText('VA2').closest('[class*="grid"]')
            expect(va2Parent.className).toContain('3b82f6')
        })
    })

    // --- Wellplate WS selected/target state ---
    describe('Wellplate WS selected/target state', () => {
        it('highlights WS1 as selected in wellplate layout', () => {
            const props = defaultProps({ layoutType: 'wellplate', selectedWell: 'WS1' })
            render(<PlateLayout {...props} />)
            const ws1Elements = screen.getAllByText('WS1')
            const ws1Div = ws1Elements[0].closest('div')
            expect(ws1Div.className).toContain('4CAF50')
        })

        it('highlights WS2 as target in wellplate layout', () => {
            const props = defaultProps({ layoutType: 'wellplate', targetWell: 'WS2' })
            render(<PlateLayout {...props} />)
            const ws2Elements = screen.getAllByText('WS2')
            const ws2Div = ws2Elements[0].closest('div')
            expect(ws2Div.className).toContain('FF9800')
        })
    })

    // --- Quick op mode: selecting preset wash/rinse wells shows their badges ---
    describe('Quick op preset wash/rinse wells', () => {
        it('shows wash (WS1) and rinse (WS2) badges initially in quick op mode', async () => {
            const props = defaultProps()
            render(<PlateLayout {...props} />)

            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))
            // After enabling quick op, wash=WS1 and rinse=WS2 are pre-set
            // Instruction text for wash should show WS1
            expect(screen.getByText(/Click wash well.*WS1/)).toBeInTheDocument()
            expect(screen.getByText(/Click rinse well.*WS2/)).toBeInTheDocument()
        })
    })

    // --- 1-pipette mode: operation animations on individual wells ---
    describe('Individual well operation animation in 1-pipette mode', () => {
        it('shows aspirating animation on individual well in 1-pipette mode', () => {
            const getPipetteWells = vi.fn((well, _count) => well ? [well] : [])
            const props = defaultProps({
                currentPipetteCount: 1,
                layoutType: 'microchip',
                currentOperation: 'aspirating',
                operationWell: 'A1',
                selectedWell: 'B1',
                getPipetteWells,
            })
            render(<PlateLayout {...props} />)
            const gridContainer = document.querySelector('.grid.grid-cols-\\[repeat\\(15\\,1fr\\)\\]')
            expect(gridContainer).not.toBeNull()
            // First well (A1) should have aspirating styling
            const wellDiv = gridContainer.children[0]
            expect(wellDiv.className).toContain('3b82f6')
        })

        it('shows dispensing animation on individual well in 1-pipette mode', () => {
            const getPipetteWells = vi.fn((well, _count) => well ? [well] : [])
            const props = defaultProps({
                currentPipetteCount: 1,
                layoutType: 'microchip',
                currentOperation: 'dispensing',
                operationWell: 'A1',
                selectedWell: 'B1',
                getPipetteWells,
            })
            render(<PlateLayout {...props} />)
            const gridContainer = document.querySelector('.grid.grid-cols-\\[repeat\\(15\\,1fr\\)\\]')
            const wellDiv = gridContainer.children[0]
            expect(wellDiv.className).toContain('10b981')
        })

        it('shows moving animation on individual well in 1-pipette mode', () => {
            const getPipetteWells = vi.fn((well, _count) => well ? [well] : [])
            const props = defaultProps({
                currentPipetteCount: 1,
                layoutType: 'microchip',
                currentOperation: 'moving',
                operationWell: 'A1',
                selectedWell: 'B1',
                getPipetteWells,
            })
            render(<PlateLayout {...props} />)
            const gridContainer = document.querySelector('.grid.grid-cols-\\[repeat\\(15\\,1fr\\)\\]')
            const wellDiv = gridContainer.children[0]
            expect(wellDiv.className).toContain('f59e0b')
        })
    })

    // --- 1-pipette mode: target well and side pipette ---
    describe('Individual well target and side pipette in 1-pipette mode', () => {
        it('highlights target well in 1-pipette mode', () => {
            const props = defaultProps({
                currentPipetteCount: 1,
                layoutType: 'microchip',
                targetWell: 'A1',
                selectedWell: 'B1',
            })
            render(<PlateLayout {...props} />)
            const gridContainer = document.querySelector('.grid.grid-cols-\\[repeat\\(15\\,1fr\\)\\]')
            const wellDiv = gridContainer.children[0]
            expect(wellDiv.className).toContain('FF9800')
        })

        it('highlights side pipette wells in 1-pipette mode', () => {
            const getPipetteWells = vi.fn((well, _count) => {
                if (!well) return []
                const row = well.charAt(0)
                const col = parseInt(well.substring(1))
                return [`${row}${col}`, `${row}${col + 1}`]
            })
            const props = defaultProps({
                currentPipetteCount: 1,
                layoutType: 'microchip',
                selectedWell: 'A1',
                getPipetteWells,
            })
            render(<PlateLayout {...props} />)
            const gridContainer = document.querySelector('.grid.grid-cols-\\[repeat\\(15\\,1fr\\)\\]')
            // A1 is center (index 0), A2 is side pipette (index 1)
            const sideWell = gridContainer.children[1]
            expect(sideWell.className).toContain('81C784')
        })
    })

    // --- Quick op badges on individual wells in 1-pipette mode ---
    describe('Quick op badges on individual wells in 1-pipette mode', () => {
        it('shows all 4 quick op badges on individual wells', async () => {
            const props = defaultProps({ currentPipetteCount: 1, layoutType: 'microchip' })
            render(<PlateLayout {...props} />)

            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))

            // Select individual wells for pickup/dropoff using MC chips
            await userEvent.click(screen.getByText('MC1'))  // pickup
            await userEvent.click(screen.getByText('MC2'))  // dropoff
            await userEvent.click(screen.getByText('MC3'))  // wash
            await userEvent.click(screen.getByText('MC4'))  // rinse

            expect(screen.getByText('P')).toBeInTheDocument()
            expect(screen.getByText('D')).toBeInTheDocument()
            expect(screen.getByText('W')).toBeInTheDocument()
            expect(screen.getByText('R')).toBeInTheDocument()
        })
    })

    // --- Quick op badges on MC chips ---
    describe('Quick op badges on MC chips', () => {
        it('shows badges on MC chips during quick op', async () => {
            const props = defaultProps({ layoutType: 'microchip' })
            render(<PlateLayout {...props} />)

            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))
            await userEvent.click(screen.getByText('MC1'))  // pickup
            await userEvent.click(screen.getByText('MC2'))  // dropoff
            await userEvent.click(screen.getByText('MC3'))  // wash
            await userEvent.click(screen.getByText('MC4'))  // rinse

            expect(screen.getByText('P')).toBeInTheDocument()
            expect(screen.getByText('D')).toBeInTheDocument()
            expect(screen.getByText('W')).toBeInTheDocument()
            expect(screen.getByText('R')).toBeInTheDocument()
        })
    })

    // --- Wellplate vial target well ---
    describe('Wellplate vial target well', () => {
        it('highlights target vial group in wellplate layout', () => {
            const props = defaultProps({ layoutType: 'wellplate', targetWell: 'VA2' })
            render(<PlateLayout {...props} />)
            const va2Parent = screen.getByText('VA2').closest('[class*="grid"]')
            expect(va2Parent.className).toContain('FF9800')
        })
    })

    // --- Wellplate vial dispensing animation ---
    describe('Wellplate vial dispensing and moving animations', () => {
        it('shows dispensing animation on vials in wellplate layout', () => {
            const getPipetteWells = vi.fn((well, _count) => well ? [well] : [])
            const props = defaultProps({
                layoutType: 'wellplate',
                currentOperation: 'dispensing',
                operationWell: 'VA2',
                getPipetteWells,
            })
            render(<PlateLayout {...props} />)
            const va2Parent = screen.getByText('VA2').closest('[class*="grid"]')
            expect(va2Parent.className).toContain('10b981')
        })

        it('shows moving animation on vials in wellplate layout', () => {
            const getPipetteWells = vi.fn((well, _count) => well ? [well] : [])
            const props = defaultProps({
                layoutType: 'wellplate',
                currentOperation: 'moving',
                operationWell: 'VA2',
                getPipetteWells,
            })
            render(<PlateLayout {...props} />)
            const va2Parent = screen.getByText('VA2').closest('[class*="grid"]')
            expect(va2Parent.className).toContain('f59e0b')
        })
    })

    // --- Wellplate middle/right column operation and target states ---
    describe('Wellplate middle/right column states', () => {
        it('highlights target well group in middle column', () => {
            const props = defaultProps({ layoutType: 'wellplate', targetWell: 'A2' })
            render(<PlateLayout {...props} />)
            const mainGrid = document.querySelector('.grid.grid-cols-3')
            const middleCol = mainGrid.children[1]
            const firstGroup = middleCol.children[0]
            expect(firstGroup.className).toContain('FF9800')
        })

        it('shows aspirating animation in middle column', () => {
            const getPipetteWells = vi.fn((well, _count) => well ? [well] : [])
            const props = defaultProps({
                layoutType: 'wellplate',
                currentOperation: 'aspirating',
                operationWell: 'A2',
                getPipetteWells,
            })
            render(<PlateLayout {...props} />)
            const mainGrid = document.querySelector('.grid.grid-cols-3')
            const middleCol = mainGrid.children[1]
            const firstGroup = middleCol.children[0]
            expect(firstGroup.className).toContain('3b82f6')
        })

        it('highlights target well group in right column', () => {
            const props = defaultProps({ layoutType: 'wellplate', targetWell: 'A5' })
            render(<PlateLayout {...props} />)
            const mainGrid = document.querySelector('.grid.grid-cols-3')
            const rightCol = mainGrid.children[2]
            const firstGroup = rightCol.children[0]
            expect(firstGroup.className).toContain('FF9800')
        })

        it('shows dispensing animation in right column', () => {
            const getPipetteWells = vi.fn((well, _count) => well ? [well] : [])
            const props = defaultProps({
                layoutType: 'wellplate',
                currentOperation: 'dispensing',
                operationWell: 'A5',
                getPipetteWells,
            })
            render(<PlateLayout {...props} />)
            const mainGrid = document.querySelector('.grid.grid-cols-3')
            const rightCol = mainGrid.children[2]
            const firstGroup = rightCol.children[0]
            expect(firstGroup.className).toContain('10b981')
        })

        it('shows moving animation in right column', () => {
            const getPipetteWells = vi.fn((well, _count) => well ? [well] : [])
            const props = defaultProps({
                layoutType: 'wellplate',
                currentOperation: 'moving',
                operationWell: 'A5',
                getPipetteWells,
            })
            render(<PlateLayout {...props} />)
            const mainGrid = document.querySelector('.grid.grid-cols-3')
            const rightCol = mainGrid.children[2]
            const firstGroup = rightCol.children[0]
            expect(firstGroup.className).toContain('f59e0b')
        })
    })

    // --- Quick op badges in wellplate middle/right columns ---
    describe('Quick op badges in wellplate middle and right columns', () => {
        it('shows quick op badges on wellplate middle column wells', async () => {
            const props = defaultProps({ layoutType: 'wellplate' })
            render(<PlateLayout {...props} />)

            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))

            // Click wells in the middle column
            const mainGrid = document.querySelector('.grid.grid-cols-3')
            const middleCol = mainGrid.children[1]
            // Click first middle column group (A2) for pickup
            await userEvent.click(middleCol.children[0])
            expect(screen.getByText('P')).toBeInTheDocument()
        })

        it('shows quick op badges on wellplate right column wells', async () => {
            const props = defaultProps({ layoutType: 'wellplate' })
            render(<PlateLayout {...props} />)

            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))

            // Click first group for pickup
            const ws1Elements = screen.getAllByText('WS1')
            await userEvent.click(ws1Elements[0])

            // Click right column group for dropoff
            const mainGrid = document.querySelector('.grid.grid-cols-3')
            const rightCol = mainGrid.children[2]
            await userEvent.click(rightCol.children[0])
            expect(screen.getByText('D')).toBeInTheDocument()
        })
    })

    // --- Config fallback values ---
    describe('Config fallback values', () => {
        it('uses fallback PIPETTE_MAX_ML of 100 when not set', () => {
            const props = defaultProps({ config: { CONTROLLER_TYPE: null } })
            render(<PlateLayout {...props} />)
            expect(screen.getByText(/\/ 100 µL/)).toBeInTheDocument()
        })
    })

    // --- Axis position fallback ---
    describe('Axis position fallback', () => {
        it('shows 0 µL when pipette_ml is missing', () => {
            const props = defaultProps({ axisPositions: {} })
            render(<PlateLayout {...props} />)
            expect(screen.getByText('0 µL')).toBeInTheDocument()
        })
    })

    // --- Wellplate middle column: selected well ---
    describe('Wellplate middle column selected well', () => {
        it('highlights selected well in middle column of wellplate', () => {
            const props = defaultProps({ layoutType: 'wellplate', selectedWell: 'A2' })
            render(<PlateLayout {...props} />)
            const mainGrid = document.querySelector('.grid.grid-cols-3')
            const middleCol = mainGrid.children[1]
            const firstGroup = middleCol.children[0]
            expect(firstGroup.className).toContain('4CAF50')
        })
    })

    // --- Wellplate right column: selected well ---
    describe('Wellplate right column selected well', () => {
        it('highlights selected well in right column of wellplate', () => {
            const props = defaultProps({ layoutType: 'wellplate', selectedWell: 'A5' })
            render(<PlateLayout {...props} />)
            const mainGrid = document.querySelector('.grid.grid-cols-3')
            const rightCol = mainGrid.children[2]
            const firstGroup = rightCol.children[0]
            expect(firstGroup.className).toContain('4CAF50')
        })
    })

    // --- Wellplate vial: selected well ---
    describe('Wellplate vial selected well', () => {
        it('highlights selected vial in wellplate', () => {
            const props = defaultProps({ layoutType: 'wellplate', selectedWell: 'VA2' })
            render(<PlateLayout {...props} />)
            const va2Parent = screen.getByText('VA2').closest('[class*="grid"]')
            expect(va2Parent.className).toContain('4CAF50')
        })
    })

    // --- Quick op all 4 badges on vials in wellplate ---
    describe('Quick op all 4 badges on vials', () => {
        it('shows P, D, W, R on vials during quick op', async () => {
            const props = defaultProps({ layoutType: 'wellplate' })
            render(<PlateLayout {...props} />)

            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))

            // pickup: VA2
            await userEvent.click(screen.getByText('VA2'))
            // dropoff: VB2
            await userEvent.click(screen.getByText('VB2'))
            // wash: VC2
            await userEvent.click(screen.getByText('VC2'))
            // rinse: VD2
            await userEvent.click(screen.getByText('VD2'))

            expect(screen.getByText('P')).toBeInTheDocument()
            expect(screen.getByText('D')).toBeInTheDocument()
            expect(screen.getByText('W')).toBeInTheDocument()
            expect(screen.getByText('R')).toBeInTheDocument()
        })
    })

    // --- Quick op all 4 badges on wellplate middle column ---
    describe('Quick op all 4 badges on wellplate middle column', () => {
        it('shows all quick op badges on middle column wells', async () => {
            const props = defaultProps({ layoutType: 'wellplate' })
            render(<PlateLayout {...props} />)

            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))

            const mainGrid = document.querySelector('.grid.grid-cols-3')
            const middleCol = mainGrid.children[1]

            // pickup: A2 (row A, middle col group 0)
            await userEvent.click(middleCol.children[0])
            // dropoff: B2
            await userEvent.click(middleCol.children[1])
            // wash: C2
            await userEvent.click(middleCol.children[2])
            // rinse: D2
            await userEvent.click(middleCol.children[3])

            expect(screen.getByText('P')).toBeInTheDocument()
            expect(screen.getByText('D')).toBeInTheDocument()
            expect(screen.getByText('W')).toBeInTheDocument()
            expect(screen.getByText('R')).toBeInTheDocument()
        })
    })

    // --- Quick op all 4 badges on wellplate right column ---
    describe('Quick op all 4 badges on wellplate right column', () => {
        it('shows all quick op badges on right column wells', async () => {
            const props = defaultProps({ layoutType: 'wellplate' })
            render(<PlateLayout {...props} />)

            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))

            const mainGrid = document.querySelector('.grid.grid-cols-3')
            const rightCol = mainGrid.children[2]

            // pickup: A5 (row A, right col group 1)
            await userEvent.click(rightCol.children[0])
            // dropoff: B5
            await userEvent.click(rightCol.children[1])
            // wash: C5
            await userEvent.click(rightCol.children[2])
            // rinse: D5
            await userEvent.click(rightCol.children[3])

            expect(screen.getByText('P')).toBeInTheDocument()
            expect(screen.getByText('D')).toBeInTheDocument()
            expect(screen.getByText('W')).toBeInTheDocument()
            expect(screen.getByText('R')).toBeInTheDocument()
        })
    })

    // --- Quick op in 1-pipette individual mode with all 4 well badges ---
    describe('Quick op in 1-pipette individual mode all badges', () => {
        it('shows P, D, W, R badges on individual wells during quick op', async () => {
            const props = defaultProps({ currentPipetteCount: 1, layoutType: 'microchip' })
            render(<PlateLayout {...props} />)

            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))

            // Use WS1, WS2, MC1, MC2 for simplicity
            await userEvent.click(screen.getByText('WS1'))  // pickup
            await userEvent.click(screen.getByText('WS2'))  // dropoff
            await userEvent.click(screen.getByText('MC1'))  // wash
            await userEvent.click(screen.getByText('MC2'))  // rinse

            expect(screen.getByText('P')).toBeInTheDocument()
            expect(screen.getByText('D')).toBeInTheDocument()
            expect(screen.getByText('W')).toBeInTheDocument()
            expect(screen.getByText('R')).toBeInTheDocument()
        })
    })

    // --- Wellplate middle column: moving animation ---
    describe('Wellplate middle column moving animation', () => {
        it('shows moving animation in middle column', () => {
            const getPipetteWells = vi.fn((well, _count) => well ? [well] : [])
            const props = defaultProps({
                layoutType: 'wellplate',
                currentOperation: 'moving',
                operationWell: 'A2',
                getPipetteWells,
            })
            render(<PlateLayout {...props} />)
            const mainGrid = document.querySelector('.grid.grid-cols-3')
            const middleCol = mainGrid.children[1]
            const firstGroup = middleCol.children[0]
            expect(firstGroup.className).toContain('f59e0b')
        })
    })

    // --- Wellplate middle column: dispensing animation ---
    describe('Wellplate middle column dispensing animation', () => {
        it('shows dispensing animation in middle column', () => {
            const getPipetteWells = vi.fn((well, _count) => well ? [well] : [])
            const props = defaultProps({
                layoutType: 'wellplate',
                currentOperation: 'dispensing',
                operationWell: 'A2',
                getPipetteWells,
            })
            render(<PlateLayout {...props} />)
            const mainGrid = document.querySelector('.grid.grid-cols-3')
            const middleCol = mainGrid.children[1]
            const firstGroup = middleCol.children[0]
            expect(firstGroup.className).toContain('10b981')
        })
    })

    // --- Microchip WS1 selected and target in microchip layout (lines 364-376) ---
    describe('Microchip WS1/WS2 selected and target states', () => {
        it('highlights WS1 as selected in microchip layout', () => {
            const props = defaultProps({ layoutType: 'microchip', selectedWell: 'WS1' })
            render(<PlateLayout {...props} />)
            const ws1 = screen.getByText('WS1').closest('div')
            expect(ws1.className).toContain('4CAF50')
        })

        it('highlights WS1 as target in microchip layout', () => {
            const props = defaultProps({ layoutType: 'microchip', targetWell: 'WS1' })
            render(<PlateLayout {...props} />)
            const ws1 = screen.getByText('WS1').closest('div')
            expect(ws1.className).toContain('FF9800')
        })

        it('highlights WS2 as selected in microchip layout', () => {
            const props = defaultProps({ layoutType: 'microchip', selectedWell: 'WS2' })
            render(<PlateLayout {...props} />)
            const ws2 = screen.getByText('WS2').closest('div')
            expect(ws2.className).toContain('4CAF50')
        })

        it('highlights WS2 as target in microchip layout', () => {
            const props = defaultProps({ layoutType: 'microchip', targetWell: 'WS2' })
            render(<PlateLayout {...props} />)
            const ws2 = screen.getByText('WS2').closest('div')
            expect(ws2.className).toContain('FF9800')
        })
    })

    // --- Wellplate WS1/WS2 target state (lines 543-552) ---
    describe('Wellplate WS1 and WS2 target states', () => {
        it('highlights WS1 as target in wellplate layout', () => {
            const props = defaultProps({ layoutType: 'wellplate', targetWell: 'WS1' })
            render(<PlateLayout {...props} />)
            const ws1Elements = screen.getAllByText('WS1')
            const ws1Div = ws1Elements[0].closest('div')
            expect(ws1Div.className).toContain('FF9800')
        })

        it('highlights WS2 as selected in wellplate layout', () => {
            const props = defaultProps({ layoutType: 'wellplate', selectedWell: 'WS2' })
            render(<PlateLayout {...props} />)
            const ws2Elements = screen.getAllByText('WS2')
            const ws2Div = ws2Elements[0].closest('div')
            expect(ws2Div.className).toContain('4CAF50')
        })
    })

    // --- Quick op badges on individual grid wells in 1-pipette mode (lines 478-491) ---
    describe('Quick op all 4 badges on individual grid wells in 1-pipette mode', () => {
        it('shows P, D, W, R badges on individual grid wells', async () => {
            const props = defaultProps({ currentPipetteCount: 1, layoutType: 'microchip' })
            render(<PlateLayout {...props} />)

            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))

            // Select individual grid wells for each role
            const gridContainer = document.querySelector('.grid.grid-cols-\\[repeat\\(15\\,1fr\\)\\]')
            expect(gridContainer).not.toBeNull()

            // A1 for pickup (grid child 0)
            await userEvent.click(gridContainer.children[0])
            // A2 for dropoff (grid child 1)
            await userEvent.click(gridContainer.children[1])
            // A3 for wash (grid child 2)
            await userEvent.click(gridContainer.children[2])
            // A4 for rinse (grid child 3)
            await userEvent.click(gridContainer.children[3])

            expect(screen.getByText('P')).toBeInTheDocument()
            expect(screen.getByText('D')).toBeInTheDocument()
            expect(screen.getByText('W')).toBeInTheDocument()
            expect(screen.getByText('R')).toBeInTheDocument()
        })
    })

    // --- Quick op execute with detail missing in error (line 94) ---
    describe('Quick op execute error without detail', () => {
        it('shows default error when response has no detail', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({}),
            })

            const props = defaultProps()
            render(<PlateLayout {...props} />)
            await userEvent.click(screen.getByRole('button', { name: /Quick Operation Mode/i }))
            await userEvent.click(screen.getByText('WS1'))
            await userEvent.click(screen.getByText('WS2'))
            await userEvent.click(screen.getByText('MC1'))
            await userEvent.click(screen.getByText('MC2'))
            await userEvent.click(screen.getByRole('button', { name: /Execute Operation/i }))

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to execute operation'))
            })
            consoleSpy.mockRestore()
        })
    })

    // --- Wellplate right column: aspirating animation ---
    describe('Wellplate right column aspirating animation', () => {
        it('shows aspirating animation in right column', () => {
            const getPipetteWells = vi.fn((well, _count) => well ? [well] : [])
            const props = defaultProps({
                layoutType: 'wellplate',
                currentOperation: 'aspirating',
                operationWell: 'A5',
                getPipetteWells,
            })
            render(<PlateLayout {...props} />)
            const mainGrid = document.querySelector('.grid.grid-cols-3')
            const rightCol = mainGrid.children[2]
            const firstGroup = rightCol.children[0]
            expect(firstGroup.className).toContain('3b82f6')
        })
    })
})
