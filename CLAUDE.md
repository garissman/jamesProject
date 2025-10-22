# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a full-stack laboratory sampler application with:

- **Backend**: FastAPI (Python) providing REST API
- **Frontend**: React + Vite with a 96-well plate interface for laboratory workflow management
- **Electronic**: A Raspberry Pi microcontroller will be used for hardware control, with the pins Setup:
  Stepper X Motor Driver 1 in GPIO04,GPIO17,GPIO27,GPIO22;
  Stepper Y Motor Driver 2 in GPIO23,GPIO24,GPIO25,GPIO05;
  Stepper Z Motor Driver 3 in GPIO06,GPIO12,GPIO13,GPIO16;
  Stepper pipette/gripper Motor Driver 4 in GPIO19,GPIO26,GPIO20,GPIO21;
- **Well Layout**: 8 rows (A-H) × 12 columns (1-12) representing a standard 96-well plate, evenly separated 4mm,
  each well size is 14 mm high and 8 mm in diameter.

## Key Commands

### Backend (FastAPI)

```bash
# Activate virtual environment
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run backend server (http://localhost:8000)
python main.py
```

### Frontend (React + Vite)

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Run dev server (http://localhost:5173 or 5174 if 5173 is in use)
npm run dev

# Build for production
npm run build

# Lint code
npm run lint
```

## Architecture

### Frontend Structure

The application uses a single-page component architecture in `frontend/src/App.jsx`:

**Tab-Based Navigation:**

- **Protocol Tab**: Shows 96-well plate layout (8 rows × 12 columns, A-H and 1-12)
- **Program Tab**: Configuration interface for creating automated pipetting programs

**State Management:**

- Well data stored with type classifications (PC, NC, SD, BK, QC, UD, EP, numbered samples)
- Program steps stored as array of step objects containing:
    - `cycles`: Number of repetitions
    - `pickupWell`: Source well identifier
    - `dropoffWell`: Destination well identifier
    - `rinseWell`: Cleaning well identifier
    - `waitTime`: Pause duration in seconds
    - `sampleVolume`: Transfer volume in mL

**Program Tab Workflow:**

1. User fills form with cycle parameters (pickup/dropoff/rinse wells, volume, wait time)
2. Clicking "Add Step" saves current configuration and resets form
3. Steps display dynamically in right panel showing all cycles and operations
4. Multiple steps can be added to build complex pipetting sequences

### Backend Structure

- FastAPI server with CORS configured for local frontend (`http://localhost:5173`)
- REST API endpoints at `/api/*`
- Uses Pydantic models for request/response validation

## Development Notes

- Frontend dev server may use port 5174 if 5173 is occupied
- Backend CORS is configured only for `http://localhost:5173` - update `main.py` if frontend port changes
- Well identifiers follow format: `{Row}{Column}` (e.g., A1, B2, H12)
- The UI uses a blue gradient theme with glassmorphism effects