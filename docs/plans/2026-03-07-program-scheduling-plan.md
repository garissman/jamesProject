# Program Scheduling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Save pipetting programs to a server-side JSON file and provide a standalone cron-runnable script that executes the saved program.

**Architecture:** Two new API endpoints (save/load) write/read `scheduled_program.json` at project root. Frontend save/load buttons call these endpoints instead of using browser download/upload. A standalone `run_program.py` script reads the JSON and runs it via `PipettingController` directly.

**Tech Stack:** FastAPI (backend endpoints), React (frontend button rewiring), Python (cron script)

---

### Task 1: Backend — Add save/load endpoints to `main.py`

**Files:**
- Modify: `main.py` (add 2 endpoints near existing pipetting endpoints)

**Step 1: Add the save endpoint**

Add after the existing `PipettingSequenceRequest` model (around line 98), and add the endpoints after the execute endpoint block (around line 210):

```python
# --- Scheduled program file path ---
SCHEDULED_PROGRAM_FILE = Path(__file__).parent / "scheduled_program.json"


@app.post("/api/program/save")
async def save_program(sequence: PipettingSequenceRequest):
    """Save program steps to scheduled_program.json on disk"""
    program_data = {
        "version": "1.0",
        "created": __import__("datetime").datetime.now().isoformat(),
        "steps": [step.model_dump() for step in sequence.steps]
    }
    with open(SCHEDULED_PROGRAM_FILE, "w") as f:
        json.dump(program_data, f, indent=2)
    return {"status": "success", "message": f"Program saved with {len(sequence.steps)} step(s)"}


@app.get("/api/program/load")
async def load_program():
    """Load program steps from scheduled_program.json"""
    if not SCHEDULED_PROGRAM_FILE.exists():
        return {"status": "success", "steps": []}
    try:
        with open(SCHEDULED_PROGRAM_FILE) as f:
            data = json.load(f)
        return {"status": "success", "steps": data.get("steps", [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading program file: {str(e)}")
```

Note: `json` is already imported via `settings.py` usage, but `main.py` doesn't import it directly. Add `import json` at the top if not present.

**Step 2: Verify `json` import exists in main.py**

Check top of `main.py` — if `import json` is missing, add it.

**Step 3: Test manually**

```bash
# Start the server
cd /Users/arimorales/jamesProject && source .venv/bin/activate && python main.py &

# Save a test program
curl -X POST http://localhost:8000/api/program/save \
  -H "Content-Type: application/json" \
  -d '{"steps":[{"stepType":"pipette","pickupWell":"A2","dropoffWell":"MC1","rinseWell":"WS2","washWell":"WS1","sampleVolume":40,"waitTime":0,"cycles":1,"repetitionMode":"quantity","repetitionQuantity":1,"pipetteCount":3}]}'

# Verify file was created
cat scheduled_program.json

# Load it back
curl http://localhost:8000/api/program/load
```

Expected: File created on disk, load returns the same steps.

**Step 4: Commit**

```bash
git add main.py
git commit -m "feat: add server-side program save/load endpoints"
```

---

### Task 2: Frontend — Rewire Save button to call API

**Files:**
- Modify: `frontend/src/App.jsx` (lines 249-274, the `handleSaveProgram` function)

**Step 1: Replace `handleSaveProgram` with API call**

Replace the existing `handleSaveProgram` function (lines 249-274) with:

```javascript
const handleSaveProgram = async () => {
    if (steps.length === 0) {
        console.error('No program steps to save.')
        return
    }

    try {
        const response = await fetch('/api/program/save', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({steps})
        })

        const data = await response.json()

        if (response.ok) {
            console.log(data.message)
        } else {
            console.error(`Error: ${data.detail || 'Failed to save program'}`)
        }
    } catch (error) {
        console.error(`Error: Unable to save program. ${error.message}`)
    }
}
```

**Step 2: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: save program to server instead of browser download"
```

---

### Task 3: Frontend — Rewire Load button to call API

**Files:**
- Modify: `frontend/src/App.jsx` (lines 276-296, the `handleLoadProgram` function)
- Modify: `frontend/src/components/ProgramTab.jsx` (lines 624-632, the Load button markup)

**Step 1: Replace `handleLoadProgram` with API call**

Replace the existing `handleLoadProgram` function (lines 276-296) in `App.jsx` with:

```javascript
const handleLoadProgram = async () => {
    try {
        const response = await fetch('/api/program/load')
        const data = await response.json()

        if (response.ok && data.steps) {
            setSteps(data.steps)
            console.log(`Program loaded with ${data.steps.length} step(s)`)
        } else {
            console.error(`Error: ${data.detail || 'Failed to load program'}`)
        }
    } catch (error) {
        console.error(`Error: Unable to load program. ${error.message}`)
    }
}
```

**Step 2: Replace the Load button in ProgramTab.jsx**

Replace lines 624-632 (the `<label>` with hidden file input) with a simple button:

```jsx
<button
    className="py-2.5 px-5 text-sm font-semibold border-none rounded-lg cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"
    onClick={handleLoadProgram}
>
    Load Program
</button>
```

**Step 3: Verify with Playwright**

Open the app, go to Program tab, add a step, click Save Program — should save to server. Click Load Program — should load back the saved steps.

**Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/ProgramTab.jsx
git commit -m "feat: load program from server instead of file upload"
```

---

### Task 4: Create the cron script `run_program.py`

**Files:**
- Create: `run_program.py` (project root)

**Step 1: Write the script**

```python
#!/usr/bin/env python3
"""
Standalone script to execute a saved pipetting program.
Reads scheduled_program.json and runs it via PipettingController.

Usage:
    python run_program.py

Crontab example (run daily at 8am):
    0 8 * * * cd /path/to/jamesProject && .venv/bin/python run_program.py >> cron.log 2>&1
"""

import json
import sys
from pathlib import Path

from pipetting_controller import PipettingController, PipettingStep, CoordinateMapper
import settings

PROGRAM_FILE = Path(__file__).parent / "scheduled_program.json"


def main():
    # Load program file
    if not PROGRAM_FILE.exists():
        print(f"Error: {PROGRAM_FILE} not found. Save a program from the UI first.")
        sys.exit(1)

    with open(PROGRAM_FILE) as f:
        data = json.load(f)

    steps_data = data.get("steps", [])
    if not steps_data:
        print("Error: No steps found in program file.")
        sys.exit(1)

    # Load layout coordinates into CoordinateMapper
    cfg = settings.load()
    CoordinateMapper.LAYOUT_COORDINATES = cfg.get("LAYOUT_COORDINATES", {})

    # Convert JSON steps to PipettingStep objects
    pipetting_steps = []
    for s in steps_data:
        pipetting_steps.append(PipettingStep(
            step_type=s.get("stepType", "pipette"),
            pickup_well=s.get("pickupWell", ""),
            dropoff_well=s.get("dropoffWell", ""),
            rinse_well=s.get("rinseWell"),
            wash_well=s.get("washWell"),
            volume_ml=s.get("sampleVolume", 0),
            wait_time=s.get("waitTime", 0),
            cycles=s.get("cycles", 1),
            repetition_mode=s.get("repetitionMode", "quantity"),
            repetition_quantity=s.get("repetitionQuantity", 1),
            repetition_interval=s.get("repetitionInterval"),
            repetition_duration=s.get("repetitionDuration"),
            pipette_count=s.get("pipetteCount", 3),
        ))

    print(f"Loaded {len(pipetting_steps)} step(s) from {PROGRAM_FILE}")

    # Initialize controller and execute
    controller = PipettingController()
    controller.execute_sequence(pipetting_steps)

    print("Program execution complete.")


if __name__ == "__main__":
    main()
```

**Step 2: Make executable**

```bash
chmod +x run_program.py
```

**Step 3: Test (dry run in simulation mode)**

```bash
cd /Users/arimorales/jamesProject
source .venv/bin/activate

# Ensure a program file exists (create a minimal one if needed)
python run_program.py
```

Expected: Script loads the saved program, initializes PipettingController (simulation mode on macOS), runs through the sequence, prints logs, exits.

**Step 4: Commit**

```bash
git add run_program.py
git commit -m "feat: add standalone cron script for scheduled program execution"
```
