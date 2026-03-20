# Testing with 100% Code Coverage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive automated testing (pytest + Vitest + Playwright) achieving 100% code coverage with pragmatic exclusions.

**Architecture:** Bottom-up testing — start with low-level stepper motor control, build up through pipetting controller and API, then frontend components, then E2E. Each layer's tests validate the foundation before the next layer builds on it.

**Tech Stack:** pytest + pytest-cov + pytest-asyncio (backend), Vitest + React Testing Library (frontend), Playwright (E2E)

**Spec:** `docs/superpowers/specs/2026-03-20-testing-100-coverage-design.md`

---

## File Map

### New Files
```
.coveragerc                              # pytest-cov configuration
tests/
├── __init__.py
├── conftest.py                          # Shared fixtures (mock GPIO, test client, tmp config)
├── unit/
│   ├── __init__.py
│   ├── test_stepper_control.py          # StepperMotor + StepperController tests
│   ├── test_settings.py                 # settings.py load/save/get/merge tests
│   ├── test_pipetting_controller.py     # CoordinateMapper + PipettingController tests
│   ├── test_run_program.py              # Scheduler runner tests
│   ├── test_schedule_work.py            # Schedule worker tests
│   └── test_main_helpers.py             # main.py module-level functions
├── integration/
│   ├── __init__.py
│   └── test_api.py                      # FastAPI TestClient endpoint tests
└── fixtures/
    ├── __init__.py
    ├── mock_gpio.py                     # RPi.GPIO replacement module
    └── sample_config.json               # Known-good test config
frontend/
├── vitest.config.js                     # Vitest configuration
├── src/
│   ├── test-utils.js                    # Custom render + fetch mock helper
│   ├── App.test.jsx
│   └── components/
│       ├── NavBar.test.jsx
│       ├── RightPanel.test.jsx
│       ├── ManualTab.test.jsx
│       ├── PlateLayout.test.jsx
│       ├── ProgramTab.test.jsx
│       ├── DriftTestTab.test.jsx
│       └── SettingsTab.test.jsx
e2e/
├── package.json
├── playwright.config.js
├── fixtures/
│   └── mock-api.js                      # page.route() API interceptor
└── tests/
    ├── navigation.spec.js
    ├── plate-layout.spec.js
    ├── program.spec.js
    ├── manual.spec.js
    ├── execution.spec.js
    └── settings.spec.js
```

### Modified Files
```
requirements.txt                          # Add pytest, pytest-cov, pytest-asyncio
stepper_control.py:644                   # Add # pragma: no cover to __main__ guard
pipetting_controller.py:1280             # Add # pragma: no cover to __main__ guard
run_program.py:132                       # Add # pragma: no cover to __main__ guard
schedule_work.py:71                      # Add # pragma: no cover to __main__ guard
main.py:444,1547,1569,1603,1614          # Add # pragma: no cover to dead code + static serving + __main__
frontend/package.json                    # Add test devDependencies + test script
```

---

### Task 1: Backend Test Infrastructure

**Files:**
- Create: `.coveragerc`
- Create: `tests/__init__.py`, `tests/unit/__init__.py`, `tests/integration/__init__.py`, `tests/fixtures/__init__.py`
- Create: `tests/fixtures/mock_gpio.py`
- Create: `tests/fixtures/sample_config.json`
- Create: `tests/conftest.py`
- Modify: `requirements.txt`

- [ ] **Step 1: Add test dependencies to requirements.txt**

Append to `requirements.txt`:
```
# Testing
pytest>=7.0
pytest-cov>=4.0
pytest-asyncio>=0.21
```

- [ ] **Step 2: Install test dependencies**

Run: `cd /Users/arimorales/jamesProject && pip install pytest pytest-cov pytest-asyncio`
Expected: Successfully installed

- [ ] **Step 3: Create `.coveragerc`**

Create `.coveragerc`:
```ini
[run]
branch = true
omit =
    .venv/*
    stepper_control_arduino.py
    generate_sample_data.py
    analyze_drift_data.py

[report]
exclude_lines =
    pragma: no cover
fail_under = 100
show_missing = true
```

- [ ] **Step 4: Create test directory structure**

Create empty `__init__.py` files in:
- `tests/__init__.py`
- `tests/unit/__init__.py`
- `tests/integration/__init__.py`
- `tests/fixtures/__init__.py`

- [ ] **Step 5: Create mock GPIO module**

Create `tests/fixtures/mock_gpio.py`:
```python
"""
Mock RPi.GPIO module for testing stepper motor control without hardware.
Tracks all GPIO calls and allows controllable limit switch simulation.
"""

BCM = 11
OUT = 0
IN = 1
LOW = 0
HIGH = 1
PUD_UP = 22
FALLING = 32

_pin_states = {}  # pin -> HIGH/LOW
_pin_modes = {}   # pin -> IN/OUT
_call_log = []    # list of (function, args) tuples
_event_callbacks = {}  # pin -> callback
_limit_trigger_schedule = {}  # pin -> steps_remaining (trigger after N output calls)
_output_count = 0


def reset():
    """Reset all mock state between tests."""
    global _output_count
    _pin_states.clear()
    _pin_modes.clear()
    _call_log.clear()
    _event_callbacks.clear()
    _limit_trigger_schedule.clear()
    _output_count = 0


def setmode(mode):
    _call_log.append(('setmode', (mode,)))


def setup(pin, mode, pull_up_down=None):
    _pin_modes[pin] = mode
    _pin_states[pin] = HIGH if pull_up_down == PUD_UP else LOW
    _call_log.append(('setup', (pin, mode, pull_up_down)))


def output(pin, value):
    global _output_count
    _pin_states[pin] = value
    _output_count += 1
    _call_log.append(('output', (pin, value)))

    # Check if any limit switch should trigger based on step count
    for limit_pin, schedule in list(_limit_trigger_schedule.items()):
        if schedule > 0:
            _limit_trigger_schedule[limit_pin] = schedule - 1
        elif schedule == 0:
            _pin_states[limit_pin] = LOW  # Triggered (active low with pull-up)
            if limit_pin in _event_callbacks:
                _event_callbacks[limit_pin](limit_pin)
            _limit_trigger_schedule.pop(limit_pin)


def input(pin):
    return _pin_states.get(pin, HIGH)


def add_event_detect(pin, edge, callback=None, bouncetime=None):
    if callback:
        _event_callbacks[pin] = callback
    _call_log.append(('add_event_detect', (pin, edge, callback, bouncetime)))


def cleanup():
    _call_log.append(('cleanup', ()))
    reset()


def schedule_limit_trigger(pin, after_n_outputs):
    """Test helper: trigger a limit switch (set pin LOW) after N output() calls."""
    _limit_trigger_schedule[pin] = after_n_outputs


def set_pin_state(pin, value):
    """Test helper: directly set a pin state."""
    _pin_states[pin] = value


def get_call_log():
    """Test helper: return list of all GPIO calls made."""
    return list(_call_log)
```

- [ ] **Step 6: Create sample config fixture**

Create `tests/fixtures/sample_config.json`:
```json
{
  "STEPS_PER_MM_X": 200,
  "STEPS_PER_MM_Y": 200,
  "STEPS_PER_MM_Z": 200,
  "PIPETTE_STEPS_PER_ML": 60,
  "PIPETTE_MAX_ML": 100.0,
  "PICKUP_DEPTH": 40.0,
  "DROPOFF_DEPTH": 5.0,
  "SAFE_HEIGHT": 20.0,
  "RINSE_CYCLES": 1,
  "TRAVEL_SPEED": 0.0001,
  "PIPETTE_SPEED": 0.001,
  "WS_POSITION_X": 50.0,
  "WS_POSITION_Y": 13.0,
  "WS_HEIGHT": 15.0,
  "WS_WIDTH": 60.0,
  "WS_GAP": 14.0,
  "INVERT_X": false,
  "INVERT_Y": false,
  "INVERT_Z": false,
  "INVERT_PIPETTE": false,
  "CONTROLLER_TYPE": "raspberry_pi",
  "LAYOUT_COORDINATES": {
    "microchip": {
      "A2": {"x": 112.0, "y": 20.0},
      "A5": {"x": 211.25, "y": 20.0},
      "B2": {"x": 112.0, "y": 48.5},
      "B5": {"x": 211.25, "y": 48.5},
      "WS1": {"x": 15.0, "y": 10.0},
      "WS2": {"x": 15.0, "y": 45.0},
      "MC1": {"x": 112.0, "y": 341.0}
    }
  }
}
```

- [ ] **Step 7: Create conftest.py with shared fixtures**

Create `tests/conftest.py`:
```python
"""Shared test fixtures for the AutoSampler test suite."""
import json
import sys
import shutil
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# Project root
PROJECT_ROOT = Path(__file__).parent.parent
FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def mock_gpio(monkeypatch):
    """Replace RPi.GPIO with our mock before any imports that use it."""
    from tests.fixtures import mock_gpio as gpio_mock
    gpio_mock.reset()
    monkeypatch.setitem(sys.modules, 'RPi', MagicMock())
    monkeypatch.setitem(sys.modules, 'RPi.GPIO', gpio_mock)
    return gpio_mock


@pytest.fixture
def tmp_config(tmp_path):
    """Provide a temporary config.json for test isolation."""
    src = FIXTURES_DIR / "sample_config.json"
    dst = tmp_path / "config.json"
    shutil.copy(src, dst)
    return dst


@pytest.fixture
def tmp_position(tmp_path):
    """Provide a temporary pipette_position.json."""
    pos = {
        "x": 0.0, "y": 0.0, "z": 70.0,
        "well": "WS1", "pipette_count": 3,
        "layout_type": "microchip", "pipette_ml": 0.0
    }
    dst = tmp_path / "pipette_position.json"
    dst.write_text(json.dumps(pos, indent=2))
    return dst


@pytest.fixture
def patch_config_path(monkeypatch, tmp_config):
    """Redirect settings.CONFIG_FILE to the temp config."""
    import settings
    monkeypatch.setattr(settings, 'CONFIG_FILE', tmp_config)
    return tmp_config


@pytest.fixture
def patch_position_path(monkeypatch, tmp_position):
    """Redirect PipettingController.POSITION_FILE to temp position."""
    from pipetting_controller import PipettingController
    monkeypatch.setattr(PipettingController, 'POSITION_FILE', tmp_position)
    return tmp_position
```

- [ ] **Step 8: Verify pytest discovers the test structure**

Run: `cd /Users/arimorales/jamesProject && python -m pytest tests/ --collect-only 2>&1 | head -20`
Expected: "no tests ran" or "collected 0 items" (no errors)

- [ ] **Step 9: Commit**

```bash
git add .coveragerc requirements.txt tests/
git commit -m "feat: add backend test infrastructure (pytest, mock GPIO, fixtures)"
```

---

### Task 2: Pragma Annotations

**Files:**
- Modify: `stepper_control.py:644`
- Modify: `pipetting_controller.py:1280`
- Modify: `run_program.py:132`
- Modify: `schedule_work.py:71`
- Modify: `main.py:444,1547,1569,1603,1614`

- [ ] **Step 1: Add pragma to all `__main__` guard lines**

In each file, change `if __name__ == "__main__":` to `if __name__ == "__main__":  # pragma: no cover`:
- `stepper_control.py` line 644
- `pipetting_controller.py` line 1280
- `run_program.py` line 132
- `schedule_work.py` line 71
- `main.py` line 1614

- [ ] **Step 2: Add pragma to dead `except ValueError` in main.py**

In `main.py` line 444, change:
```python
    except ValueError as e:
```
to:
```python
    except ValueError as e:  # pragma: no cover
```

- [ ] **Step 3: Add pragma to static-serving guard lines in main.py**

Change line 1547:
```python
if FRONTEND_DIST_DIR.exists():
```
to:
```python
if FRONTEND_DIST_DIR.exists():  # pragma: no cover
```

Change line 1569:
```python
elif FRONTEND_DEV_DIR.exists() and (FRONTEND_DEV_DIR / "index.html").exists():
```
to:
```python
elif FRONTEND_DEV_DIR.exists() and (FRONTEND_DEV_DIR / "index.html").exists():  # pragma: no cover
```

Change line 1603:
```python
else:
```
to:
```python
else:  # pragma: no cover
```

- [ ] **Step 4: Verify pragmas are correct by running coverage**

Run: `cd /Users/arimorales/jamesProject && python -m pytest tests/ --cov=. --cov-report=term-missing 2>&1 | tail -30`
Expected: Coverage report shows excluded lines, no import errors

- [ ] **Step 5: Commit**

```bash
git add stepper_control.py pipetting_controller.py run_program.py schedule_work.py main.py
git commit -m "feat: add pragma: no cover to untestable code paths"
```

---

### Task 3: test_settings.py

**Files:**
- Create: `tests/unit/test_settings.py`
- Test: `tests/unit/test_settings.py`

- [ ] **Step 1: Write settings tests**

Create `tests/unit/test_settings.py` with tests for:
- `_deep_merge()`: scalar override, nested dict merge, new key preserved
- `load()`: missing file returns defaults, valid file merges, corrupt file falls back
- `save()`: writes JSON, round-trips with load
- `get()`: existing key, missing key with default

Use the `patch_config_path` fixture from conftest for isolation.

- [ ] **Step 2: Run tests**

Run: `cd /Users/arimorales/jamesProject && python -m pytest tests/unit/test_settings.py -v`
Expected: All tests PASS

- [ ] **Step 3: Check coverage for settings.py**

Run: `cd /Users/arimorales/jamesProject && python -m pytest tests/unit/test_settings.py --cov=settings --cov-report=term-missing`
Expected: 100% coverage on settings.py

- [ ] **Step 4: Commit**

```bash
git add tests/unit/test_settings.py
git commit -m "test: add settings.py tests (100% coverage)"
```

---

### Task 4: test_stepper_control.py

**Files:**
- Create: `tests/unit/test_stepper_control.py`
- Test: `tests/unit/test_stepper_control.py`

- [ ] **Step 1: Write StepperMotor tests**

Create `tests/unit/test_stepper_control.py` with tests covering all `StepperMotor` methods listed in the spec:
- Construction (simulation mode since mock GPIO is active)
- `step()` with direction, acceleration ramp, position tracking, limit detection (min/max triggered, started-at-limit-and-moving-away, check_limits=False)
- `move_until_limit()` batch stepping, EMI settle, left-starting-limit, target limit, max_steps
- `home()` success and failure
- `check_limit_switch()`, `check_min_limit()`, `check_max_limit()`, `get_limit_state()`
- `_limit_min_callback()`, `_limit_max_callback()` with ignore_limits
- `request_stop()`, `clear_limit_trigger()`, `stop()`
- `rotate_degrees()`, `move_until_any_limit()`
- `get_position()`, `reset_position()`

Import stepper_control AFTER mock_gpio fixture runs. Use `mock_gpio.set_pin_state()` and `mock_gpio.schedule_limit_trigger()` to control limit switches.

- [ ] **Step 2: Write StepperController tests**

Add to the same file tests for:
- Init with/without limit switches
- `get_motor()` valid/invalid
- `move_motor()`, `move_motor_until_limit()`, `move_multiple()`
- `check_limit_switch()` with 'min', 'max', 'both'
- `check_all_limit_switches()`, `get_all_positions()`, `get_all_limit_states()`
- `home_motor()`, `home_all()` with limit switches / without / custom sequence
- `stop_all()`, `cleanup()`

- [ ] **Step 3: Write enum tests**

Add tests for `Direction` and `LimitSwitchState` enum values.

- [ ] **Step 4: Run and verify coverage**

Run: `cd /Users/arimorales/jamesProject && python -m pytest tests/unit/test_stepper_control.py --cov=stepper_control --cov-report=term-missing -v`
Expected: 100% coverage on stepper_control.py

- [ ] **Step 5: Commit**

```bash
git add tests/unit/test_stepper_control.py
git commit -m "test: add stepper_control.py tests (100% coverage)"
```

---

### Task 5: test_pipetting_controller.py

**Files:**
- Create: `tests/unit/test_pipetting_controller.py`
- Test: `tests/unit/test_pipetting_controller.py`

- [ ] **Step 1: Write CoordinateMapper tests**

Create `tests/unit/test_pipetting_controller.py` with tests for:
- `parse_well()`: valid (A1, H15), invalid row, invalid column, empty/short
- `well_to_coordinates()`: stored coords, WS1/WS2, interpolation, extrapolation, unknown raises ValueError
- `coordinates_to_well()`: reverse lookup, WS match, no match returns None
- `_interpolate_from_refs()`: exact match, between refs, extrapolation below/above, <2 refs returns None
- `coordinates_to_steps()`: mm to steps conversion

Use `patch_config_path` fixture. Set `CoordinateMapper.LAYOUT_COORDINATES` and `CoordinateMapper.CURRENT_LAYOUT` in tests.

- [ ] **Step 2: Write PipettingController core tests**

Add tests for init, `_inv()`, `_speed()`, `_move_motor()`, `save_position()`, `load_position()`, `log()`, `get_logs()`, `clear_logs()`, `set_pipette_count()`, `stop()`, `cleanup()`.

Use `patch_config_path` and `patch_position_path` fixtures. Monkeypatch `PipettingController.POSITION_FILE` to use the temp path.

- [ ] **Step 3: Write movement tests**

Add tests for `_move_x_safe()`, `_move_y_safe()`, `_move_z_safe()`, `_z_to()`, `move_to_well()` (including unknown-well-catches-ValueError path), `toggle_z()`, `move_axis()`, `home()`, `_home_axis_to_min()`.

- [ ] **Step 4: Write pipetting operation tests**

Add tests for `aspirate()`, `dispense()`, `rinse()`, `execute_transfer()`, `execute_step_with_cycles()`, `execute_sequence()`, `_interruptible_sleep()`.

Test stop_requested paths, volume clamping, Z-down-before-aspirate/dispense, quantity and timeFrequency repetition modes.

- [ ] **Step 5: Add dual controller-type parameterization**

For methods with Arduino branches (`_speed()`, `_move_motor()`, `_move_x_safe()`, `_move_y_safe()`, `_move_z_safe()`, `_z_to()`, `_home_axis_to_min()`, `move_axis()`), add tests with `controller_type = 'arduino_uno_q'` by monkeypatching `settings.get('CONTROLLER_TYPE')` and mocking the Arduino stepper controller.

- [ ] **Step 6: Run and verify coverage**

Run: `cd /Users/arimorales/jamesProject && python -m pytest tests/unit/test_pipetting_controller.py --cov=pipetting_controller --cov-report=term-missing -v`
Expected: 100% coverage on pipetting_controller.py

- [ ] **Step 7: Commit**

```bash
git add tests/unit/test_pipetting_controller.py
git commit -m "test: add pipetting_controller.py tests (100% coverage)"
```

---

### Task 6: test_run_program.py + test_schedule_work.py

**Files:**
- Create: `tests/unit/test_run_program.py`
- Create: `tests/unit/test_schedule_work.py`
- Test: `tests/unit/test_run_program.py`, `tests/unit/test_schedule_work.py`

- [ ] **Step 1: Write run_program tests**

Create `tests/unit/test_run_program.py` with tests for:
- `should_run_now()`: disabled → False, no cron → False, matching cron → True, non-matching → False, missing croniter → sys.exit
- `update_status()`: "running" writes startedAt, "idle" writes lastRunAt/lastResult, "idle" with error writes lastError
- `main()`: missing file → sys.exit, empty steps → sys.exit, success, URLError, general Exception, disabled schedule

Mock `urlopen`, `croniter`, file I/O. Monkeypatch `PROGRAM_FILE` to tmp_path.

- [ ] **Step 2: Write schedule_work tests**

Create `tests/unit/test_schedule_work.py` with tests for:
- `call_run_program()`: mock subprocess.run, verify args/cwd, handle returncode 0 and non-zero
- `main()`: mock call_run_program + time.sleep, verify interval arg, missing RUN_SCRIPT → sys.exit, KeyboardInterrupt handling

- [ ] **Step 3: Run and verify coverage**

Run: `cd /Users/arimorales/jamesProject && python -m pytest tests/unit/test_run_program.py tests/unit/test_schedule_work.py --cov=run_program --cov=schedule_work --cov-report=term-missing -v`
Expected: 100% coverage on both files

- [ ] **Step 4: Commit**

```bash
git add tests/unit/test_run_program.py tests/unit/test_schedule_work.py
git commit -m "test: add run_program.py and schedule_work.py tests (100% coverage)"
```

---

### Task 7: test_main_helpers.py

**Files:**
- Create: `tests/unit/test_main_helpers.py`
- Test: `tests/unit/test_main_helpers.py`

- [ ] **Step 1: Write main.py helper function tests**

Create `tests/unit/test_main_helpers.py` with tests for:
- `_sanitize_program_name()`: valid name, strips invalid chars, empty → "untitled", whitespace → "untitled"
- `run_pipetting_sequence()`: sets is_executing, handles exception, clears flag
- `_move_until_limit_rpi()`: delegates to motor, returns (steps, bool)
- `_move_until_limit_arduino()`: converts delay to microseconds, calls stepper, calls _refresh_limit_cache
- `_refresh_limit_cache()`: updates cache, exception path logs warning
- `run_drift_test()`: RPi path, Arduino path, no controller, no limit switches, both-directions-fail, stop mid-cycle, n>1 vs n==1 summary, motor inversion

Import functions directly from `main` module. Mock `pipetting_controller` global, `time.time`, `time.sleep`.

- [ ] **Step 2: Run and verify coverage**

Run: `cd /Users/arimorales/jamesProject && python -m pytest tests/unit/test_main_helpers.py --cov=main --cov-report=term-missing -v`
Expected: All module-level helper functions covered

- [ ] **Step 3: Commit**

```bash
git add tests/unit/test_main_helpers.py
git commit -m "test: add main.py helper function tests"
```

---

### Task 8: test_api.py (Integration)

**Files:**
- Create: `tests/integration/test_api.py`
- Test: `tests/integration/test_api.py`

- [ ] **Step 1: Write API test fixtures**

Create `tests/integration/test_api.py` with a `client` fixture that uses `TestClient(app)` as a context manager to trigger lifespan. Mock the pipetting controller initialization in conftest or inline.

- [ ] **Step 2: Write pipetting endpoint tests**

Add tests for all `/api/pipetting/*` endpoints:
- execute (success, 503, 409, 400)
- stop (success, 503)
- home (success, 503)
- move-to-well (success, 503)
- status (initialized vs not)
- logs (with/without)
- set-pipette-count (valid, invalid)
- set-layout-type (microchip, wellplate, invalid)
- set-layout (success)
- toggle-z (up, down, invalid)
- aspirate, dispense (success, 503)
- set-controller-type (valid, invalid)

- [ ] **Step 3: Write axis, config, coordinate, and program endpoint tests**

Add tests for all remaining endpoints per the spec.

- [ ] **Step 4: Write drift-test, items, limit-switch, and Arduino endpoint tests**

Add tests for drift-test CRUD, stub /api/items, limit-switches (RPi path), and Arduino-specific 400s.

- [ ] **Step 5: Run and verify coverage**

Run: `cd /Users/arimorales/jamesProject && python -m pytest tests/ --cov=. --cov-report=term-missing -v`
Expected: Combined backend coverage at 100%

- [ ] **Step 6: Commit**

```bash
git add tests/integration/test_api.py
git commit -m "test: add API integration tests (FastAPI TestClient)"
```

---

### Task 9: Backend Coverage Gate

- [ ] **Step 1: Run full backend test suite with coverage enforcement**

Run: `cd /Users/arimorales/jamesProject && python -m pytest tests/ --cov=. --cov-report=term-missing --cov-fail-under=100 -v`
Expected: All tests pass, 100% coverage achieved

- [ ] **Step 2: Fix any remaining coverage gaps**

If any lines are uncovered, add targeted tests or `# pragma: no cover` annotations with justification.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "test: achieve 100% backend code coverage"
```

---

### Task 10: Frontend Test Infrastructure

**Files:**
- Create: `frontend/vitest.config.js`
- Create: `frontend/src/test-utils.js`
- Modify: `frontend/package.json`

- [ ] **Step 1: Install frontend test dependencies**

Run: `cd /Users/arimorales/jamesProject/frontend && npm install --save-dev vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom`

- [ ] **Step 2: Create vitest.config.js**

Create `frontend/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-utils.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
})
```

- [ ] **Step 3: Create test-utils.js**

Create `frontend/src/test-utils.js`:
```js
import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/**
 * Create a mock fetch that responds based on URL patterns.
 * Usage: mockFetch({ '/api/pipetting/status': { initialized: true, ... } })
 */
export function mockFetch(responses = {}) {
  return vi.fn((url, options) => {
    const path = typeof url === 'string' ? url : url.toString()
    for (const [pattern, data] of Object.entries(responses)) {
      if (path.includes(pattern)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(data),
          text: () => Promise.resolve(JSON.stringify(data)),
        })
      }
    }
    // Default: return empty success
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: 'success' }),
      text: () => Promise.resolve('{}'),
    })
  })
}
```

- [ ] **Step 4: Add test script to package.json**

In `frontend/package.json`, add to "scripts":
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 5: Verify vitest discovers tests**

Run: `cd /Users/arimorales/jamesProject/frontend && npx vitest run --passWithNoTests`
Expected: No errors, 0 tests

- [ ] **Step 6: Commit**

```bash
git add frontend/vitest.config.js frontend/src/test-utils.js frontend/package.json frontend/package-lock.json
git commit -m "feat: add frontend test infrastructure (Vitest + React Testing Library)"
```

---

### Task 11: NavBar.test.jsx + RightPanel.test.jsx

**Files:**
- Create: `frontend/src/components/NavBar.test.jsx`
- Create: `frontend/src/components/RightPanel.test.jsx`

- [ ] **Step 1: Write NavBar tests**

Create `frontend/src/components/NavBar.test.jsx` with tests for:
- Renders all 5 tab buttons + theme toggle
- Click each tab fires `setActiveTab` with correct value ('protocol', 'program', 'manual', 'drift-test', 'settings')
- Active tab gets active class
- Theme toggle: light mode shows "Dark Mode", dark mode shows "Light Mode", click fires `toggleTheme`

- [ ] **Step 2: Write RightPanel tests**

Create `frontend/src/components/RightPanel.test.jsx` with tests for:
- Logs: empty state shows "No logs available", populated logs render
- Action buttons: Execute (disabled when no steps or executing), Stop, Home (disabled when isExecuting), Delete All — all fire handlers
- Move-to-well button: hidden when targetWell is null, visible and shows well ID when set
- Disabled states: render with `isExecuting=true` and assert Execute and Home are disabled

- [ ] **Step 3: Run and verify**

Run: `cd /Users/arimorales/jamesProject/frontend && npx vitest run src/components/NavBar.test.jsx src/components/RightPanel.test.jsx -v`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/NavBar.test.jsx frontend/src/components/RightPanel.test.jsx
git commit -m "test: add NavBar and RightPanel component tests"
```

---

### Task 12: ManualTab.test.jsx

**Files:**
- Create: `frontend/src/components/ManualTab.test.jsx`

- [ ] **Step 1: Write ManualTab tests**

Create `frontend/src/components/ManualTab.test.jsx` with tests for:
- Renders 4 axis controls (X, Y, Z, Pipette) with current values
- Step input: changing value updates state
- CW/CCW buttons: click fires `handleAxisMove` with (axis, steps, 'cw'/'ccw')
- Position edit mode: "Set Current Position" button → form appears → fill values → Apply fires `handleSetPosition` → Cancel hides form
- Disabled states when isExecuting is true
- Shows selectedWell and systemStatus in info section

- [ ] **Step 2: Run and verify**

Run: `cd /Users/arimorales/jamesProject/frontend && npx vitest run src/components/ManualTab.test.jsx -v`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ManualTab.test.jsx
git commit -m "test: add ManualTab component tests"
```

---

### Task 13: PlateLayout.test.jsx

**Files:**
- Create: `frontend/src/components/PlateLayout.test.jsx`

- [ ] **Step 1: Write PlateLayout tests**

Create `frontend/src/components/PlateLayout.test.jsx` with full mock props matching the component's actual prop signature: `selectedWell`, `targetWell`, `setTargetWell`, `currentPipetteCount`, `handleSetPipetteCount`, `currentOperation`, `operationWell`, `layoutType`, `handleSetLayout`, `isExecuting`, `config`, `axisPositions`, `zAxisUp`, `handleToggleZ`, `handleCollect`, `handleDispense`, `handleWellClick`, `getPipetteWells`, `systemStatus`, `controllerType`, `fetchCurrentPosition`, `fetchAxisPositions`, `wellSelectionMode`, `setWellSelectionMode`.

Test:
- Layout toggle: microchip/vial buttons, click calls `handleSetLayout`
- Well click: calls `handleWellClick` with well ID
- Quick operation mode: enable → 4-step flow → execute
- Z-axis toggle: label reflects zAxisUp state, click fires handler
- Collect/Dispense: volume input, button clicks
- Well selection mode: banner shows, cancel dismisses
- Operation status indicators (aspirating/dispensing/moving)
- Disabled states during execution
- Both microchip (grouped and individual modes) and vial layout rendering

- [ ] **Step 2: Run and verify**

Run: `cd /Users/arimorales/jamesProject/frontend && npx vitest run src/components/PlateLayout.test.jsx -v`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PlateLayout.test.jsx
git commit -m "test: add PlateLayout component tests"
```

---

### Task 14: ProgramTab.test.jsx

**Files:**
- Create: `frontend/src/components/ProgramTab.test.jsx`

- [ ] **Step 1: Write StepWizard and StepCard tests**

Create `frontend/src/components/ProgramTab.test.jsx`. Mock fetch for `/api/programs/*` URLs.

Test StepWizard:
- Stage 1 validation: empty pickup shows error, invalid well shows error
- Fill fields, advance to stage 2
- Stage 2: quantity mode, timeFrequency mode with unit conversion
- Save fires onSave, Cancel fires onCancel
- "Select from plate" buttons trigger well selection mode

Test StepCard:
- Renders pipette/home/wait step types with correct title/details
- Edit/duplicate/delete buttons fire callbacks
- Drag events fire reorder callbacks
- Active step highlighting

- [ ] **Step 2: Write program management and schedule tests**

Test:
- Add/edit/duplicate/delete/reorder steps
- Save dialog, save-as, load from list, delete program, download
- Cron schedule: toggle, presets, custom expression, describeCron()
- estimateProgramTime() and formatDuration()
- Wait input with unit conversion
- Execution status display

- [ ] **Step 3: Run and verify**

Run: `cd /Users/arimorales/jamesProject/frontend && npx vitest run src/components/ProgramTab.test.jsx -v`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ProgramTab.test.jsx
git commit -m "test: add ProgramTab component tests"
```

---

### Task 15: DriftTestTab.test.jsx + SettingsTab.test.jsx

**Files:**
- Create: `frontend/src/components/DriftTestTab.test.jsx`
- Create: `frontend/src/components/SettingsTab.test.jsx`

- [ ] **Step 1: Write DriftTestTab tests**

Read `frontend/src/components/DriftTestTab.jsx` to understand all states and interactions, then write comprehensive tests covering all rendered states and user actions (start/stop drift test, status display, motor selection, cycle configuration).

- [ ] **Step 2: Write SettingsTab tests**

Read `frontend/src/components/SettingsTab.jsx` to understand all inputs and flows, then write comprehensive tests covering config form inputs, save action, coordinate capture/calibration UI, controller type switching.

- [ ] **Step 3: Run and verify**

Run: `cd /Users/arimorales/jamesProject/frontend && npx vitest run src/components/DriftTestTab.test.jsx src/components/SettingsTab.test.jsx -v`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/DriftTestTab.test.jsx frontend/src/components/SettingsTab.test.jsx
git commit -m "test: add DriftTestTab and SettingsTab component tests"
```

---

### Task 16: App.test.jsx

**Files:**
- Create: `frontend/src/App.test.jsx`

- [ ] **Step 1: Write App integration tests**

Create `frontend/src/App.test.jsx` with comprehensive fetch mocking for all polled endpoints.

Test:
- Tab routing: click tabs → URL changes, popstate handler
- Initial load: fetches program, config, positions on mount
- Polling: status/logs intervals, cleanup on unmount
- Execution polling: faster interval during isExecuting
- Auto-save: step/schedule changes trigger program save
- State flow: well click updates targetWell, execute switches tab
- Theme: localStorage persistence, data-theme attribute
- Handler delegation: handleAddStep, handleExecute, handleStop, handleHome, etc.

- [ ] **Step 2: Run and verify**

Run: `cd /Users/arimorales/jamesProject/frontend && npx vitest run src/App.test.jsx -v`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.test.jsx
git commit -m "test: add App component integration tests"
```

---

### Task 17: Frontend Coverage Gate

- [ ] **Step 1: Run full frontend test suite with coverage**

Run: `cd /Users/arimorales/jamesProject/frontend && npx vitest run --coverage`
Expected: All tests pass, 100% coverage on all thresholds

- [ ] **Step 2: Fix any remaining coverage gaps**

If any lines/branches uncovered, add targeted tests or `/* istanbul ignore next */` with justification.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "test: achieve 100% frontend code coverage"
```

---

### Task 18: E2E Test Infrastructure

**Files:**
- Create: `e2e/package.json`
- Create: `e2e/playwright.config.js`
- Create: `e2e/fixtures/mock-api.js`

- [ ] **Step 1: Initialize E2E project**

```bash
mkdir -p /Users/arimorales/jamesProject/e2e/fixtures /Users/arimorales/jamesProject/e2e/tests
cd /Users/arimorales/jamesProject/e2e
npm init -y
npm install --save-dev @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create playwright.config.js**

Create `e2e/playwright.config.js`:
```js
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'cd ../frontend && npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30000,
  },
})
```

- [ ] **Step 3: Create mock-api.js fixture**

Create `e2e/fixtures/mock-api.js` with a `setupMockApi(page)` function that uses `page.route('**/api/**', ...)` to intercept all API calls and return controlled JSON responses for: status, logs, config, positions, program load/save, pipetting operations.

- [ ] **Step 4: Verify Playwright runs**

Run: `cd /Users/arimorales/jamesProject/e2e && npx playwright test --list`
Expected: No tests found (no errors)

- [ ] **Step 5: Commit**

```bash
git add e2e/
git commit -m "feat: add E2E test infrastructure (Playwright)"
```

---

### Task 19: E2E Tests — Navigation + Plate Layout

**Files:**
- Create: `e2e/tests/navigation.spec.js`
- Create: `e2e/tests/plate-layout.spec.js`

- [ ] **Step 1: Write navigation tests**

Test tab switching (click each tab → verify URL + content), browser back/forward.

- [ ] **Step 2: Write plate layout tests**

Test layout toggle, well clicking, quick operation flow, Z toggle, collect/dispense.

- [ ] **Step 3: Run and verify**

Run: `cd /Users/arimorales/jamesProject/e2e && npx playwright test tests/navigation.spec.js tests/plate-layout.spec.js`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/navigation.spec.js e2e/tests/plate-layout.spec.js
git commit -m "test: add E2E tests for navigation and plate layout"
```

---

### Task 20: E2E Tests — Program + Execution + Manual + Settings

**Files:**
- Create: `e2e/tests/program.spec.js`
- Create: `e2e/tests/execution.spec.js`
- Create: `e2e/tests/manual.spec.js`
- Create: `e2e/tests/settings.spec.js`

- [ ] **Step 1: Write program wizard E2E tests**

Test wizard flow, step management, save/load, schedule.

- [ ] **Step 2: Write execution E2E tests**

Test execute → executing state → stop → idle, home button, log updates.

- [ ] **Step 3: Write manual and settings E2E tests**

Test axis controls, position override, config form, theme toggle.

- [ ] **Step 4: Run all E2E tests**

Run: `cd /Users/arimorales/jamesProject/e2e && npx playwright test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add e2e/tests/
git commit -m "test: add E2E tests for program, execution, manual, and settings"
```

---

### Task 21: Final Verification

- [ ] **Step 1: Run full backend test suite**

Run: `cd /Users/arimorales/jamesProject && python -m pytest tests/ --cov=. --cov-report=term-missing --cov-fail-under=100 -v`
Expected: All pass, 100% coverage

- [ ] **Step 2: Run full frontend test suite**

Run: `cd /Users/arimorales/jamesProject/frontend && npx vitest run --coverage`
Expected: All pass, 100% coverage

- [ ] **Step 3: Run full E2E test suite**

Run: `cd /Users/arimorales/jamesProject/e2e && npx playwright test`
Expected: All pass

- [ ] **Step 4: Update CLAUDE.md with test commands**

Add to `CLAUDE.md` under Key Commands:

```markdown
### Testing

```bash
# Backend tests with coverage (from project root)
python -m pytest tests/ --cov=. --cov-report=term-missing --cov-fail-under=100

# Frontend tests with coverage
cd frontend && npx vitest run --coverage

# E2E tests
cd e2e && npx playwright test

# Run all tests
python -m pytest tests/ --cov=. --cov-report=term-missing --cov-fail-under=100 && cd frontend && npx vitest run --coverage && cd ../e2e && npx playwright test
```
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "test: complete 100% code coverage testing suite"
```
