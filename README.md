# JamesProject

Laboratory auto-sampler that moves a 3-axis gantry with pipettes over well plates and microchips. You build pipetting programs in a browser, run them from the web UI, or schedule them with cron for unattended operation.

## Hardware

The system runs on a Raspberry Pi with 4 stepper motors (X, Y, Z, pipette) driven through DRV8825 or A4988 driver boards, plus limit switches for homing. It always uses 3 pipettes at 40 mL volume.

The well plate is a standard 96-well format: 8 rows (A-H) x 12 columns (1-12), 4 mm spacing, 14 mm high, 8 mm diameter per well.

### Pin configuration

| Motor | Function | Pulse | Dir | Limit Min | Limit Max |
|-------|----------|-------|-----|-----------|-----------|
| 1 | X-axis | GPIO04 | GPIO17 | GPIO26 | GPIO21 |
| 2 | Y-axis | GPIO27 | GPIO22 | GPIO20 | GPIO16 |
| 3 | Z-axis | GPIO05 | GPIO06 | GPIO12 | GPIO25 |
| 4 | Pipette | GPIO13 | GPIO19 | GPIO24 | GPIO23 |

### Raspberry Pi notes

`stepper_control.py` sets BCM (Broadcom) pin numbering automatically.

Each motor connects to a driver board. The Pulse pin triggers one step per HIGH-LOW transition. The Dir pin sets direction (HIGH = clockwise, LOW = counterclockwise).

Limit switches are normally-open, wired between the GPIO pin and GND. Internal pull-ups are enabled in software, so the pin reads HIGH when open and LOW when triggered. Edge detection with 50 ms debounce handles interrupt-driven stops.

If a motor moves the wrong way, flip the `INVERT_X` / `INVERT_Y` / `INVERT_Z` / `INVERT_PIPETTE` flag in the Settings tab or in `config.json` directly.

When `RPi.GPIO` isn't available (Mac/PC), the system runs in simulation mode automatically.

Power the stepper drivers from an external supply (12V or 24V), not the Pi's 5V rail. Share a common ground between the Pi and drivers. Heatsinks on the driver boards help during long runs.

## Project structure

```
jamesProject/
├── main.py                        # FastAPI backend
├── pipetting_controller.py        # Motor control + coordinate mapping
├── stepper_control.py             # GPIO stepper driver
├── settings.py                    # JSON-backed config
├── config.json                    # Calibration, motor settings, layout coordinates
├── run_program.py                 # Checks cron, runs saved program
├── schedule_work.py               # Calls run_program.py every minute (like crontab)
├── scheduled_program.json         # Current program + schedule + execution status
├── programs/                      # Named programs (Save As)
├── requirements.txt
├── frontend/
│   └── src/
│       ├── App.jsx                # Tab routing, state management
│       └── components/
│           ├── PlateLayout.jsx    # Well plate grid + quick operations
│           ├── ProgramTab.jsx     # Step wizard, program list, schedule
│           ├── ManualTab.jsx      # Direct axis control
│           ├── DriftTestTab.jsx   # Repeatability testing
│           ├── SettingsTab.jsx    # Calibration + coordinate capture
│           ├── RightPanel.jsx     # Logs + action buttons
│           └── NavBar.jsx         # Tab navigation
└── docs/
    └── plans/
```

## Quick start

```bash
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Backend runs at `http://localhost:8000`, frontend at `http://localhost:5173`.

## Web UI

The interface has five tabs:

### Plate Layout

Shows the well plate grid. Three layout types are available:

- **MicroChip** -- 8x15 well grid + 5 MicroChip slots + 2 washing stations (WS1, WS2)
- **Vial** -- 5 vials + 12x6 small well grid + washing stations
- **Wellplate** -- 24 small wells + 24 standard wells + washing stations

There's a quick-operation mode where clicking a well runs a full cycle: pickup, dropoff, rinse (WS2), wash (WS1).

### Program

A 2-step wizard for building pipetting sequences:

1. Select pickup, dropoff, rinse, and wash wells; set sample volume
2. Set wait time, repetition mode (by quantity or by time interval)

You can also add Home and Wait steps. Steps support drag-and-drop reordering, duplication, editing, and deletion.

Programs can be saved, loaded, deleted, and downloaded as JSON. The UI shows an estimated run duration based on motor speeds, well distances, and cycle counts.

The schedule section lets you enable a cron expression for automated runs. Presets are available for common intervals (every 5 minutes, hourly, daily at 8 AM, weekdays at 8 AM, etc.).

While a program runs, the tab shows status (idle/running/error), which step is executing, and when the last run finished.

Steps and schedule auto-save to `scheduled_program.json` on every change.

### Manual

Move individual axes by step count. You can also override the tracked position without actually moving motors.

### Drift test

Runs repeatability tests over multiple cycles to measure mechanical drift.

### Settings

Capture and store XY coordinates for reference wells per layout type. Calibrate steps/mm by measuring actual travel distance. Configure motor parameters: steps/mm, travel speed, pipette speed, axis inversion flags.

## Scheduling

Two ways to run programs on a schedule:

### Option 1: schedule_work.py

`schedule_work.py` is a simple loop that calls `run_program.py` every 60 seconds, like a built-in crontab. `run_program.py` reads `scheduled_program.json`, checks that `schedule.enabled` is true and the cron expression matches the current minute, and only then sends the steps to the FastAPI server's `/api/pipetting/execute` endpoint. This avoids GPIO conflicts -- only the FastAPI server owns the hardware.

```
schedule_work.py  --(every 60s)-->  run_program.py  --(checks cron)--> FastAPI /api/pipetting/execute
                                         |
                                         +-- reads scheduled_program.json
                                         +-- checks schedule.enabled
                                         +-- checks cron matches current minute
                                         +-- POSTs steps to FastAPI if both pass
```

Setup:

1. Build steps in the Program tab
2. Enable the schedule and pick a cron expression
3. Start the scheduler:

```bash
python schedule_work.py

# Or with a custom check interval:
python schedule_work.py --interval 30
```

### Option 2: system crontab

You can skip `schedule_work.py` entirely and use your system's crontab. Since `run_program.py` already checks the cron expression, you just need crontab to call it every minute:

```bash
crontab -e
```

Add this line (adjust the path to match your setup):

```
* * * * * cd /home/pi/jamesProject && /home/pi/jamesProject/.venv/bin/python run_program.py >> /home/pi/jamesProject/cron.log 2>&1
```

What each part does:

| Part | Purpose |
|------|---------|
| `* * * * *` | Crontab calls the script every minute. The actual run schedule is controlled by the cron expression in the UI. |
| `cd /home/pi/jamesProject` | Sets the working directory so `scheduled_program.json` and `config.json` are found |
| `.venv/bin/python` | Uses the project's virtualenv with all dependencies |
| `>> cron.log 2>&1` | Appends output to a log file for debugging |

To verify it's working:

```bash
crontab -l                       # list entries
sudo systemctl status cron       # check cron service is running
```

To stop: either disable the schedule in the UI or remove the crontab entry.

### Running once manually

```bash
python run_program.py
```

This still checks the cron expression. If the cron doesn't match the current minute, it skips execution and exits.

### scheduled_program.json

```json
{
  "version": "1.0",
  "steps": [],
  "schedule": {
    "cronExpression": "*/5 * * * *",
    "enabled": true
  },
  "execution": {
    "status": "idle",
    "lastRunAt": "2026-03-07T08:00:01",
    "lastResult": "success"
  }
}
```

`schedule.enabled` -- toggled from the UI; `run_program.py` skips execution when false.
`schedule.cronExpression` -- standard 5-field cron expression.
`execution.status` -- `"running"` during execution, `"idle"` otherwise.
`execution.lastResult` -- `"success"` or `"error"` after each run.

## API

### Pipetting

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/pipetting/execute` | Run a sequence of steps |
| POST | `/api/pipetting/stop` | Stop execution |
| POST | `/api/pipetting/home` | Home all axes |
| POST | `/api/pipetting/move-to-well` | Move to a well |
| POST | `/api/pipetting/toggle-z` | Raise or lower Z |
| POST | `/api/pipetting/aspirate` | Aspirate volume |
| POST | `/api/pipetting/dispense` | Dispense volume |
| GET | `/api/pipetting/status` | Current state, well, operation |
| GET | `/api/pipetting/logs` | Recent log entries |
| POST | `/api/pipetting/set-layout` | Set layout type and wells |
| POST | `/api/pipetting/set-layout-type` | Set layout type only |
| POST | `/api/pipetting/set-pipette-count` | Set pipette count |
| POST | `/api/pipetting/set-controller-type` | Set controller type |

### Programs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/program/save` | Save steps + schedule to `scheduled_program.json` |
| GET | `/api/program/load` | Load current program |
| GET | `/api/program/status` | Poll execution status |
| POST | `/api/programs/save` | Save a named program |
| GET | `/api/programs/list` | List saved programs |
| GET | `/api/programs/load/{name}` | Load a program by name |
| DELETE | `/api/programs/{name}` | Delete a program |
| GET | `/api/programs/download/{name}` | Download as JSON |

### Axes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/axis/move` | Move one axis by N steps |
| GET | `/api/axis/positions` | Current positions |
| POST | `/api/axis/set-position` | Override tracked position |
| GET | `/api/limit-switches` | Limit switch states |

### Coordinates

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/coordinates/capture` | Capture current position for a well |
| POST | `/api/coordinates/save` | Save a coordinate |
| GET | `/api/coordinates/{layout}` | Get coordinates for a layout |

### Drift test

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/drift-test/start` | Start test |
| POST | `/api/drift-test/stop` | Stop test |
| GET | `/api/drift-test/status` | Progress and results |
| POST | `/api/drift-test/clear` | Clear results |

### Config

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Read all settings |
| POST | `/api/config` | Update settings |

### Hardware

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/led/test` | LED on/off test |
| GET | `/api/mcu/ping` | Ping MCU |
| GET | `/api/mcu/limits` | MCU limit switch states |

## How motion works

Every move follows the same pattern: raise Z (if down), move X and Y to the target, lower Z.

A pipetting cycle goes: pickup, dropoff, rinse (WS2), wash (WS1). After a program finishes, the system always homes.

```
Browser  --HTTP-->  FastAPI (main.py)
                        |
                        v
                  PipettingController
                        |
                        v
                  StepperController (GPIO)
                        |
                        v
                  Drivers --> Motors (X, Y, Z, Pipette)

schedule_work.py --(every 60s)--> run_program.py --(cron check)--> FastAPI /api/pipetting/execute
                                       |
                                       v
                                scheduled_program.json
```

## Dependencies

**Python:** FastAPI, Uvicorn, Pydantic, croniter, RPi.GPIO (optional, simulated on non-Pi), matplotlib, msgpack, pyserial

**Frontend:** React, Vite, Tailwind CSS
