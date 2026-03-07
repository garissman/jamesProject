# JamesProject — Laboratory Auto-Sampler

A full-stack laboratory sampler application that controls a 3-axis gantry with pipette for automated sample handling on well plates and microchips. Includes a web UI for building pipetting programs and a scheduler for unattended execution.

## Hardware

- **Platform**: Raspberry Pi — 4 stepper motors driven via GPIO pins through external drivers (DRV8825/A4988), with limit switches for homing.
- **Well plate**: Standard 96-well (8 rows A-H x 12 columns 1-12), 4 mm spacing, 14 mm high, 8 mm diameter
- **Pipettes**: Always 3 pipettes, volume always 40 mL

### Pin Configuration

| Motor | Function | Pulse | Dir | Limit Min | Limit Max |
|-------|----------|-------|-----|-----------|-----------|
| 1 | X-axis | GPIO04 | GPIO17 | GPIO26 | GPIO21 |
| 2 | Y-axis | GPIO27 | GPIO22 | GPIO20 | GPIO16 |
| 3 | Z-axis | GPIO05 | GPIO06 | GPIO12 | GPIO25 |
| 4 | Pipette | GPIO13 | GPIO19 | GPIO24 | GPIO23 |

### Raspberry Pi Setup Notes

**GPIO mode:** BCM (Broadcom pin numbering), set automatically by `stepper_control.py`.

**Driver wiring:** Each motor connects to a DRV8825 or A4988 driver board. The Pulse (STEP) pin triggers one motor step per HIGH→LOW transition. The Dir (DIR) pin sets rotation direction (HIGH = clockwise, LOW = counterclockwise).

**Limit switches:** Normally-open switches wired between the GPIO pin and GND. Internal pull-up resistors are enabled in software (`GPIO.PUD_UP`), so the pin reads HIGH when the switch is open and LOW when triggered. Edge detection with 50 ms debounce is configured for interrupt-driven limit stops.

**Axis inversion:** If a motor moves in the wrong direction, toggle the `INVERT_X` / `INVERT_Y` / `INVERT_Z` / `INVERT_PIPETTE` flags in the Settings tab or directly in `config.json`.

**Simulation mode:** When `RPi.GPIO` is not available (e.g. running on Mac/PC for development), the system automatically runs in simulation mode — no hardware required.

**Power considerations:**
- Use an external power supply for the stepper drivers (typically 12V or 24V). Do not power motors from the Pi's 5V rail.
- Ensure the Pi and drivers share a common ground.
- A heatsink on the driver boards is recommended for sustained operation.

## Project Structure

```
jamesProject/
├── main.py                        # FastAPI backend server
├── pipetting_controller.py        # Motor control + coordinate mapping
├── stepper_control.py             # Raspberry Pi GPIO stepper driver
├── settings.py                    # JSON-backed runtime config
├── config.json                    # Calibration, motor settings & layout coordinates
├── run_program.py                 # Standalone script to execute a saved program
├── schedule_work.py               # Scheduler — simulates crontab for run_program.py
├── scheduled_program.json         # Saved program + schedule (created via UI)
├── requirements.txt               # Python dependencies
├── frontend/                      # React + Vite + Tailwind web UI
│   └── src/
│       ├── App.jsx                # Main app with tab routing & state
│       └── components/
│           ├── PlateLayout.jsx    # Well plate visualization & quick operations
│           ├── ProgramTab.jsx     # Step wizard, program list & schedule config
│           ├── ManualTab.jsx      # Direct axis control
│           ├── DriftTestTab.jsx   # Repeatability testing
│           ├── SettingsTab.jsx    # Calibration & coordinate capture
│           ├── RightPanel.jsx     # Logs & action buttons
│           └── NavBar.jsx         # Tab navigation & theme toggle
└── docs/
    └── plans/                     # Design & implementation plans
```

## Quick Start

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

Backend at `http://localhost:8000`, frontend dev server at `http://localhost:5173`.

## Web UI Tabs

### Plate Layout

Interactive well plate visualization. Supports three layout types:

- **MicroChip** — 8x15 well grid + 5 MicroChip slots + 2 washing stations (WS1, WS2)
- **Vial** — 5 vials + 12x6 small well grid + washing stations
- **Wellplate** — 24 small wells + 24 standard wells + washing stations

Features quick-operation mode for one-click pipetting cycles: pickup → dropoff → rinse (WS2) → wash (WS1).

### Program

Build multi-step pipetting sequences using a 2-stage wizard:

1. **Wells & Volume** — Select pickup, dropoff, rinse, and wash wells; set sample volume
2. **Timing & Repetition** — Set wait time, repetition mode (by quantity or time frequency)

Also supports Home and Wait steps. Steps can be reordered via drag-and-drop, duplicated, edited, and deleted.

**Schedule section** — Enable scheduling and define a cron expression for automated execution. Quick presets include every hour, daily at 8 AM, Mon–Fri at 8 AM, and more. Saved with the program via "Save Program".

### Manual

Direct motor control with step inputs for each axis (X, Y, Z, Pipette). Override tracked positions without moving motors.

### Drift Test

Run repeatability tests to measure mechanical drift over multiple cycles.

### Settings

- **Layout Coordinates** — Capture and store XY coordinates for reference wells per layout type
- **Calibration** — Calculate steps/mm by measuring actual travel distance
- **Motor Config** — Steps/mm, travel speed, pipette speed, axis inversion

## Program Scheduling

Programs can be scheduled for unattended execution without crontab.

### How it works

1. Build your program steps in the **Program** tab
2. Enable **Schedule** and choose a cron expression (or pick a preset)
3. Click **Save Program** — saves steps + schedule to `scheduled_program.json`
4. Run the scheduler:

```bash
python schedule_work.py
```

The scheduler reads the cron expression from the saved program and calls `run_program.py` at each scheduled time.

### Scheduler options

```bash
# Default: use cron expression from saved program
python schedule_work.py

# Override with a custom cron expression
python schedule_work.py --cron "0 */2 * * *"

# Run every N seconds
python schedule_work.py --interval 300

# Run daily at a specific time
python schedule_work.py --at 08:00

# Run once at a specific datetime
python schedule_work.py --once "2026-03-08 08:00:00"
```

### Standalone execution

To run a saved program once without the scheduler:

```bash
python run_program.py
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Read all settings |
| POST | `/api/config` | Update settings |
| GET | `/api/pipetting/status` | System status, current well, operation |
| POST | `/api/pipetting/execute` | Run pipetting program |
| POST | `/api/pipetting/stop` | Stop current execution |
| POST | `/api/pipetting/home` | Home all axes |
| POST | `/api/pipetting/move-to-well` | Move to a specific well |
| POST | `/api/pipetting/toggle-z` | Raise/lower Z-axis |
| POST | `/api/pipetting/aspirate` | Aspirate volume |
| POST | `/api/pipetting/dispense` | Dispense volume |
| POST | `/api/axis/move` | Move single axis by steps |
| GET | `/api/axis/positions` | Read current axis positions |
| POST | `/api/axis/set-position` | Override tracked position |
| POST | `/api/program/save` | Save program + schedule to disk |
| GET | `/api/program/load` | Load saved program + schedule |
| POST | `/api/pipetting/set-layout` | Switch layout type |
| POST | `/api/drift-test/start` | Start drift test |
| GET | `/api/drift-test/status` | Drift test progress |
| GET | `/api/pipetting/logs` | Recent system logs |

## Architecture

### Motion Sequence

All movements follow: **Z up** (if down) → **Move X and Y** to target → **Z down**

Each pipetting circle: **Pickup** → **Drop-off** → **Rinse** (WS2) → **Wash** (WS1) → **Home** (after program finishes)

### System Diagram

```
Browser  ──HTTP──▶  FastAPI (main.py)
                        │
                        ▼
                  Raspberry Pi
                (stepper_control.py)
                   GPIO pins
                        │
                        ▼
              Stepper Drivers → Motors (X, Y, Z, Pipette)

schedule_work.py ──▶ run_program.py ──▶ PipettingController
     (cron)            (standalone)        (direct motor control)
```
