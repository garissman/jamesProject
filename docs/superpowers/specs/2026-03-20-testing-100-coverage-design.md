# Testing with 100% Code Coverage — Design Spec

## Overview

Add comprehensive automated testing to the AutoSampler laboratory pipetting project, targeting 100% code coverage with pragmatic exclusions. Three test tiers: backend unit/integration tests (pytest), frontend component tests (Vitest), and end-to-end tests (Playwright).

## Decisions

- **Hardware mocking:** Mock at the GPIO/serial boundary — patch `RPi.GPIO` and serial calls so all controller logic (step calculations, limit switches, acceleration ramps) runs without real hardware.
- **Coverage policy:** 100% target with explicit `# pragma: no cover` / `istanbul ignore` on genuinely untestable lines (`if __name__ == "__main__"`, platform-specific cleanup). Everything else must be covered.
- **Build order:** Bottom-up — stepper_control → settings → pipetting_controller → API → frontend components → E2E.
- **Test organization:** Separate `tests/` directory for backend, colocated `*.test.jsx` for frontend, dedicated `e2e/` directory for Playwright.

## Backend Test Infrastructure

### Framework

pytest + pytest-cov + pytest-asyncio + httpx (for FastAPI TestClient)

### Directory Structure

```
tests/
├── conftest.py              # Shared fixtures: mock GPIO, mock stepper controller, test client
├── unit/
│   ├── test_stepper_control.py
│   ├── test_settings.py
│   ├── test_pipetting_controller.py
│   └── test_run_program.py
├── integration/
│   └── test_api.py          # FastAPI TestClient hitting all /api/* endpoints
└── fixtures/
    ├── mock_gpio.py          # RPi.GPIO mock module
    └── sample_config.json    # Test config with known coordinates
```

### GPIO Mocking

A `mock_gpio` module replaces `RPi.GPIO` before any imports. It tracks all `setup()`, `output()`, `input()` calls in a log so tests can assert motor pulse sequences, direction pins, and limit switch reads. Limit switch state is controllable per-test (e.g., "trigger min limit after 500 steps").

### Test Isolation

Each test gets a fresh `config.json` via `tmp_path` fixture — no test touches the real config. `pipette_position.json` is similarly isolated.

### Coverage Configuration (`.coveragerc`)

```ini
[run]
omit =
    .venv/*
    stepper_control_arduino.py
    test_motor.py
    generate_sample_data.py
    analyze_drift_data.py

[report]
exclude_lines =
    if __name__ == .__main__.
    pragma: no cover
fail_under = 100
```

## Backend Test Coverage Plan

### test_stepper_control.py

**StepperMotor:**
- Construction: GPIO pin setup calls, simulation mode fallback
- `step()`: direction setting, step count, trapezoidal acceleration ramp (start delay → cruise → decel), position tracking (CW increments, CCW decrements)
- Limit switch detection: min triggered mid-move stops motor, max triggered mid-move stops motor, started-at-limit-and-moving-away allowed, `check_limits=False` suppresses interrupt callbacks
- `move_until_limit()`: batch stepping with CHECK_INTERVAL, EMI settle pause, left-starting-limit detection, target limit detection, max_steps safety
- `home()`: moves CCW to min limit, resets position, returns success/failure
- `check_limit_switch()`: GPIO.LOW = triggered with pull-up, simulation mode position-based
- `request_stop()` / `clear_limit_trigger()`: interrupt-based stop flags
- `rotate_degrees()`: degree-to-step conversion
- `get_position()` / `reset_position()`: position counter management

**StepperController:**
- Multi-motor init with/without limit switches
- `move_motor()` delegation to correct motor
- `move_multiple()` sequential execution
- `check_all_limit_switches()` aggregation
- `home_all()` with limit switches and without (reset only)
- `stop_all()` de-energizes all motors
- `cleanup()` GPIO teardown

**Enums:**
- `Direction.CLOCKWISE` / `COUNTERCLOCKWISE` values
- `LimitSwitchState` enum values

### test_settings.py

- `load()`: missing file returns defaults, valid file merges over defaults, corrupt file falls back to defaults
- `save()`: writes valid JSON, round-trips correctly with `load()`
- `get()`: single key lookup, missing key returns default
- `_deep_merge()`: nested dict merging — override scalar, merge nested dict, new keys preserved

### test_pipetting_controller.py

**CoordinateMapper:**
- `well_to_coordinates()`: stored coords lookup, WS1/WS2 computed from config, WS coords searched across all layouts, interpolation between two calibrated refs, extrapolation beyond refs, unknown well raises ValueError
- `coordinates_to_well()`: reverse lookup from XY to well ID, tolerance matching, WS position matching, returns None when not at a well
- `parse_well()`: valid wells (A1, H15), invalid row, invalid column, empty/short string
- `_interpolate_from_refs()`: exact match, between two refs, extrapolation below, extrapolation above, fewer than 2 refs returns None
- `coordinates_to_steps()`: mm-to-steps conversion using config values

**PipettingController:**
- Init: loads position file, syncs motor step counters, sets layout type
- `move_to_well()`: Z-up-if-down → XY simultaneous threads → Z-down-if-offset sequence, skips Z-up if already up, position update and save
- `aspirate()`: Z-down-if-up before aspirate, volume clamping to max, empty skip, step calculation, motor move, pipette_ml tracking
- `dispense()`: Z-down-if-up before dispense, volume clamping to current, empty skip, motor move, pipette_ml tracking
- `rinse()`: N cycles of move→aspirate→dispense
- `execute_transfer()`: full pickup→dropoff→rinse→wash flow with Z transitions
- `execute_sequence()`: multi-step execution, stop request between steps, home/wait step types, quantity repetition mode, timeFrequency repetition mode, final home
- `_interruptible_sleep()`: stops early on stop_requested
- `home()`: Z raise, simultaneous X/Y homing to MIN limits, position reset
- `_home_axis_to_min()`: tries first direction, reverses on MAX hit, RPi vs Arduino paths
- `toggle_z()`: up/down movement, position update
- `move_axis()`: all 4 axes, CW/CCW, inversion flags, software travel limits (_move_x_safe, _move_y_safe, _move_z_safe), pipette volume clamping
- `save_position()` / `load_position()`: JSON persistence, default on missing file
- `set_pipette_count()`: valid (1, 3), invalid raises
- `log()` / `get_logs()` / `clear_logs()`: buffer management

### test_run_program.py

- `should_run_now()`: disabled schedule → False, no cron expression → False, matching cron → True, non-matching cron → False, missing croniter → sys.exit
- `main()`: missing program file → sys.exit, empty steps → sys.exit, successful API call updates status, API URLError updates status with error, schedule disabled skips
- `update_status()`: "running" writes startedAt, "idle" writes lastRunAt and lastResult

### test_api.py (Integration)

All endpoints tested via FastAPI `TestClient`:

**Pipetting endpoints:**
- POST `/api/pipetting/execute` — success, controller not initialized (503), already executing (409), invalid input (400)
- POST `/api/pipetting/stop` — success, not initialized (503)
- POST `/api/pipetting/home` — success, not initialized (503)
- POST `/api/pipetting/move-to-well` — success, invalid well (400), not initialized (503)
- GET `/api/pipetting/status` — initialized vs not, during execution
- GET `/api/pipetting/logs` — with and without logs
- POST `/api/pipetting/set-pipette-count` — valid (1, 3), invalid (400)
- POST `/api/pipetting/set-layout-type` — microchip, wellplate, invalid (400)
- POST `/api/pipetting/set-layout` — success with first_mapped_well
- POST `/api/pipetting/toggle-z` — up, down, invalid direction (400)
- POST `/api/pipetting/aspirate` — success, not initialized (503)
- POST `/api/pipetting/dispense` — success, not initialized (503)
- POST `/api/pipetting/set-controller-type` — raspberry_pi, arduino_uno_q, invalid (400)

**Axis endpoints:**
- POST `/api/axis/move` — all axes, invalid axis (400), invalid direction (400)
- GET `/api/axis/positions` — success
- POST `/api/axis/set-position` — success

**Config endpoints:**
- GET `/api/config` — returns current config
- POST `/api/config` — saves and reinitializes, preserves LAYOUT_COORDINATES

**Coordinate endpoints:**
- POST `/api/coordinates/capture` — success
- POST `/api/coordinates/save` — save and clear
- GET `/api/coordinates/{layout}` — returns stored coords

**Program endpoints:**
- POST `/api/program/save` — success
- GET `/api/program/load` — with and without file
- GET `/api/program/status` — idle, running
- GET `/api/programs/list` — empty and populated
- POST `/api/programs/save` — new and overwrite
- GET `/api/programs/load/{name}` — found and not found (404)
- DELETE `/api/programs/{name}` — found and not found (404)
- GET `/api/programs/download/{name}` — file response

**Drift test endpoints:**
- POST `/api/drift-test/start` — success, already running (400)
- POST `/api/drift-test/stop` — success, not running (400)
- GET `/api/drift-test/status` — idle, running, completed
- POST `/api/drift-test/clear` — success, while running (400)

**Limit switches:**
- GET `/api/limit-switches` — RPi path, not initialized (503)

**Arduino-specific:**
- POST `/api/led/test` — wrong controller type (400)
- GET `/api/mcu/ping` — wrong controller type (400)
- GET `/api/mcu/limits` — wrong controller type (400)

## Frontend Test Infrastructure

### Framework

Vitest + React Testing Library + @testing-library/user-event + jsdom + @vitest/coverage-v8

### File Structure (Colocated)

```
frontend/
├── vitest.config.js
├── src/
│   ├── test-utils.js         # Custom render, mock fetch helper
│   ├── App.test.jsx
│   ├── components/
│   │   ├── PlateLayout.test.jsx
│   │   ├── ProgramTab.test.jsx
│   │   ├── ManualTab.test.jsx
│   │   ├── DriftTestTab.test.jsx
│   │   ├── SettingsTab.test.jsx
│   │   ├── RightPanel.test.jsx
│   │   └── NavBar.test.jsx
```

### Mocking Strategy

- `fetch` globally mocked via `vi.fn()` — each test configures expected API responses
- `window.history.pushState` and `window.location` mocked for tab routing
- `localStorage` mocked for theme persistence
- No real backend needed

### Coverage Configuration

```js
// vitest.config.js
coverage: {
  provider: 'v8',
  thresholds: {
    lines: 100,
    branches: 100,
    functions: 100,
    statements: 100,
  },
}
```

## Frontend Test Coverage Plan

### NavBar.test.jsx
- Renders all 5 tabs + theme toggle
- Click each tab fires `setActiveTab` with correct value
- Active tab gets active styling class
- Theme toggle switches light/dark label

### PlateLayout.test.jsx
- Layout toggle: microchip/vial button click calls `handleSetLayout`
- Well click: calls `handleWellClick` with well ID
- Quick operation mode: enable → click 4 wells in sequence → shows badges (P/D/R/W) → execute calls API
- Z-axis toggle: button label reflects state, click calls `handleToggleZ`
- Collect/Dispense: volume input, button clicks call handlers with volume
- Well selection mode: banner shows, cancel dismisses
- Operation status display: aspirating/dispensing/moving indicators
- Disabled states during execution

### ProgramTab.test.jsx
- **StepWizard:** stage 1 validation (empty pickup = error, invalid well = error), fill fields and advance to stage 2, set repetition mode (quantity / timeFrequency), save creates step, cancel returns to list
- **StepCard:** renders pipette/home/wait types correctly, edit/duplicate/delete buttons fire callbacks, drag events fire reorder callbacks, active step highlighting during execution
- **Step management:** add step via wizard, edit existing step, duplicate step, delete step, drag reorder
- **Program save/load:** save dialog with name input, save-as, load from list, delete from list, download
- **Schedule:** toggle enabled/disabled, cron expression input, preset buttons, `describeCron()` output, execution status display
- **Estimation:** `estimateProgramTime()` calculation, `formatDuration()` output
- **Wait input:** add wait step with unit conversion (seconds/minutes/hours), edit existing wait

### ManualTab.test.jsx
- Axis controls: step input changes, CW/CCW button clicks call `handleAxisMove` with correct args
- Position display: shows current axis values with units
- Position edit mode: enter → shows form with current values → apply calls `handleSetPosition` → cancel exits mode
- Disabled states during execution

### DriftTestTab.test.jsx
- Full coverage of all rendered states and user interactions (start/stop/status display)

### SettingsTab.test.jsx
- Config form inputs, save button calls API, coordinate capture/calibration UI

### RightPanel.test.jsx
- Logs display: empty state, populated logs, auto-scroll ref
- Action buttons: Execute (disabled when no steps or executing), Stop, Home (disabled when executing), Delete All
- Move-to-well: conditional render when targetWell is set

### App.test.jsx
- Tab routing: URL sync on tab change, popstate handler
- Polling: status/logs intervals start on mount, cleanup on unmount
- Execution polling: faster interval during isExecuting
- Auto-save: program save fires on step/schedule change
- Initial load: fetches program, config, positions on mount
- State flow: well click updates targetWell, execute switches to protocol tab
- Theme: persists to localStorage, applies data-theme attribute

## E2E Tests (Playwright)

### Structure

```
e2e/
├── playwright.config.js
├── fixtures/
│   └── mock-api.js           # page.route() handler for /api/* with canned responses
├── tests/
│   ├── navigation.spec.js
│   ├── plate-layout.spec.js
│   ├── program.spec.js
│   ├── manual.spec.js
│   ├── execution.spec.js
│   └── settings.spec.js
```

### API Mocking

Playwright's `page.route()` intercepts all `/api/*` requests and returns controlled JSON. No real backend runs during E2E tests — fast, deterministic, runnable anywhere.

### Test Scenarios

**navigation.spec.js:**
- Click each tab, verify URL changes and correct content renders
- Browser back/forward navigation preserves tab state

**plate-layout.spec.js:**
- Switch between microchip and vial layouts
- Click wells, verify selection highlighting
- Quick operation full flow: enable → click 4 wells → execute
- Z-axis toggle button
- Collect/Dispense with volume input

**program.spec.js:**
- Open wizard, fill all fields, advance through stages, save step
- Verify step card appears with correct info
- Edit, duplicate, delete steps
- Add home and wait steps
- Save program with name, load from list
- Cron schedule: toggle, presets, custom expression

**execution.spec.js:**
- Click Execute, verify executing state
- Mock status polling returns step progress
- Click Stop, verify return to idle
- Home button triggers API call
- Logs update during execution

**manual.spec.js:**
- Adjust step inputs, click +/- buttons
- Verify API calls with correct axis/steps/direction
- Position override form flow

**settings.spec.js:**
- Change config values, save
- Theme toggle persists across reload

## Dependencies

### Backend (requirements.txt additions)
```
pytest
pytest-cov
pytest-asyncio
httpx
```

### Frontend (package.json devDependencies)
```json
{
  "vitest": "latest",
  "@vitest/coverage-v8": "latest",
  "@testing-library/react": "latest",
  "@testing-library/jest-dom": "latest",
  "@testing-library/user-event": "latest",
  "jsdom": "latest"
}
```

### E2E
```json
{
  "@playwright/test": "latest"
}
```

## Commands

```bash
# Backend tests with coverage
pytest tests/ --cov=. --cov-report=term-missing --cov-fail-under=100

# Frontend tests with coverage
cd frontend && npx vitest run --coverage

# E2E tests
cd e2e && npx playwright test

# All tests
pytest tests/ --cov=. --cov-report=term-missing && cd frontend && npx vitest run --coverage && cd ../e2e && npx playwright test
```
