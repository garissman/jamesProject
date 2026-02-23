# Project Memory: jamesProject (Lab Sampler App)

## Stack
- **Backend**: FastAPI (Python) — `main.py`, runs on port 8000
- **Frontend**: React + Vite — `frontend/src/App.jsx`, dev on port 5173/5174
- **Hardware**: Raspberry Pi with 4 stepper motors (X, Y, Z, pipette/gripper)

## Key Files
- `main.py` — FastAPI server, all REST API endpoints at `/api/*`
- `frontend/src/App.jsx` — Single-page React app (all UI logic in one file)
- `frontend/src/App.css` — Styles (blue gradient + glassmorphism theme)
- `pipetting_controller.py` — Hardware control logic, `PipettingController` + `PipettingStep`
- `stepper_control.py` — Low-level GPIO stepper motor control
- `requirements.txt` — Python deps
- `.env` — Runtime config (created on first save from Settings tab)

## Architecture
- Single React component (`App`) with tab-based navigation: Plate Layout, Program, Settings
- 96-well plate: 8 rows (A-H) × 12 columns (1-12), well IDs like `A1`, `H12`
- Well spacing: 4mm, well size: 14mm high × 8mm diameter
- Supports 1 or 3 pipette configurations (default: 3)
- 3-pipette mode: center + left + right wells highlighted simultaneously

## API Endpoints
- `GET /api/pipetting/status` — Poll position, executing state, operation
- `POST /api/pipetting/execute` — Run sequence of PipettingStepRequest
- `POST /api/pipetting/stop` — Stop execution
- `POST /api/pipetting/home` — Return to A1
- `POST /api/pipetting/move-to-well` — Move to specific well
- `POST /api/pipetting/toggle-z` — Z-axis up/down
- `POST /api/pipetting/aspirate` / `dispense` — Manual liquid ops
- `POST /api/pipetting/set-pipette-count` — Set 1 or 3 pipettes
- `GET/POST /api/config` — Read/write hardware config to `.env`
- `GET /api/pipetting/logs` — Fetch log messages

## State Polling
- Frontend polls `/api/pipetting/status` every 1s (300ms during execution)
- Logs polled every 2s (also during execution)

## Program Step Fields
`cycles, pickupWell, dropoffWell, rinseWell, waitTime, sampleVolume, repetitionMode, repetitionQuantity, repetitionInterval, repetitionDuration, pipetteCount`

## GPIO Pin Setup
- X Motor: Pulse=GPIO04, Drive=GPIO17
- Y Motor: Pulse=GPIO27, Drive=GPIO22
- Z Motor: Pulse=GPIO23, Drive=GPIO24
- Pipette Motor: Pulse=GPIO25, Drive=GPIO05

## Dev Notes
- CORS configured for `*` (any host)
- Backend serves built frontend from `frontend/dist/` in production
- Theme: light/dark toggle, saved to localStorage
- Quick Operation Mode: click 3 wells (pickup → dropoff → rinse) then execute
