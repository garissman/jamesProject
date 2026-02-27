# JamesProject — Laboratory Auto-Sampler

A full-stack laboratory sampler application that controls a 3-axis gantry with pipette for automated sample handling on 96-well plates.

Runs on the **Arduino UNO Q** as an Arduino Lab App — the Linux MPU serves the web UI and communicates with the STM32 MCU via Bridge RPC to drive stepper motors.

## Hardware

- **Platform**: Arduino UNO Q (Linux MPU + STM32U585 MCU)
- **Motors**: 4 stepper motors (X, Y, Z, Pipette) via external drivers
- **Limit switches**: X-axis (min D10, max D12) and Y-axis (min D11, max D13)
- **Well plate**: Standard 96-well (8 rows A-H × 12 columns 1-12), 15 mm spacing

### Pin Configuration

| Motor | Function | Pulse | Dir | Limit Min | Limit Max |
|-------|----------|-------|-----|-----------|-----------|
| 1 | X-axis | D2 | D3 | D10 | D12 |
| 2 | Y-axis | D4 | D5 | D11 | D13 |
| 3 | Z-axis | D6 | D7 | — | — |
| 4 | Pipette | D8 | D9 | — | — |

## Project Structure

```
jamesProject/
├── main.py                        # FastAPI backend server
├── pipetting_controller.py        # Motor control + coordinate mapping
├── stepper_control_arduino.py     # Arduino RPC client (Bridge/msgpack)
├── stepper_control.py             # Raspberry Pi GPIO fallback
├── settings.py                    # JSON-backed runtime config
├── config.json                    # Calibration & motor settings
├── frontend/                      # React + Vite web UI
│   └── src/
│       ├── App.jsx                # Main app with tab navigation
│       └── components/            # Settings, Plate Layout, etc.
├── arduino/
│   └── stepper_controller/
│       └── stepper_controller.ino # MCU firmware (Bridge RPC)
└── arduino-app/                   # Arduino Lab App package
    ├── app.yaml                   # App manifest
    ├── sketch/                    # MCU sketch + build config
    ├── python/                    # Server + controllers
    └── assets/                    # Built frontend
```

## Quick Start

### Development (Mac/PC)

```bash
# Backend
pip install -r requirements.txt
python main.py

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Backend at `http://localhost:8000`, frontend dev server at `http://localhost:5173`.

### Deploy to Arduino UNO Q

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Deploy all files
./deploy.sh 192.168.12.172 Ar!17924594
```

Then open `http://<arduino-ip>:8000` in a browser.

## Web UI Tabs

- **Plate Layout** — 96-well plate view with sample type assignment (PC, NC, SD, BK, QC, etc.)
- **Program** — Build multi-step pipetting sequences (pickup, dropoff, rinse, volume, wait)
- **Manual** — Direct motor control and axis positioning
- **Drift Test** — Run repeatability tests to measure mechanical drift
- **Settings** — Calibrate offsets, steps/mm, speeds, inversion, controller type

## API

Key endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Read all settings |
| POST | `/api/config` | Update settings |
| GET | `/api/mcu/ping` | Test MCU connection |
| GET | `/api/mcu/limits` | Read limit switch states |
| POST | `/api/pipetting/execute` | Run pipetting program |
| POST | `/api/pipetting/home` | Home all axes |
| POST | `/api/axis/move` | Move single axis |
| POST | `/api/drift-test/start` | Start drift test |

## Architecture

```
Browser  ──HTTP──▶  FastAPI (Python on Linux MPU)
                        │
                        ▼
                    unix socket (/var/run/arduino-router.sock)
                        │
                        ▼
                    STM32U585 MCU (Bridge RPC / MessagePack)
                        │
                        ▼
                    Stepper Drivers → Motors
```
