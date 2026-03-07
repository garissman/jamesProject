# Program Scheduling Design

## Summary

Save pipetting programs to a server-side JSON file, and provide a standalone Python script that crontab can run to execute the saved program using PipettingController directly.

## Components

### 1. Server-side file: `scheduled_program.json`

Located at project root (next to `config.json`). Same format the frontend already produces:

```json
{
  "version": "1.0",
  "created": "2026-03-07T10:00:00.000Z",
  "steps": [
    {
      "id": 1234,
      "stepType": "pipette",
      "pickupWell": "A2",
      "dropoffWell": "MC1",
      "rinseWell": "WS2",
      "washWell": "WS1",
      "sampleVolume": 40,
      "waitTime": 0,
      "cycles": 1,
      "repetitionMode": "quantity",
      "repetitionQuantity": 1,
      ...
    }
  ]
}
```

### 2. Backend API (main.py) - 2 new endpoints

- `POST /api/program/save` - Accepts `{ steps: [...] }`, writes `scheduled_program.json` to disk
- `GET /api/program/load` - Reads `scheduled_program.json`, returns `{ steps: [...] }` or empty steps if file doesn't exist

### 3. Frontend changes

**ProgramTab.jsx + App.jsx:**
- "Save Program" button calls `POST /api/program/save` instead of downloading a JSON blob
- "Load Program" button calls `GET /api/program/load` instead of using a file upload input
- Remove the file input element and blob/download logic

### 4. Cron script: `run_program.py`

Standalone script at project root:
- Reads `scheduled_program.json`
- Converts steps to `PipettingStep` objects
- Creates `PipettingController()` and calls `execute_sequence()`
- Logs to stdout (cron captures this)
- Exits after completion

Example crontab entry:
```
0 8 * * * cd /path/to/jamesProject && .venv/bin/python run_program.py
```

## Data flow

```
Program Tab (UI)
  |
  |-- Save Program --> POST /api/program/save --> scheduled_program.json (disk)
  |-- Load Program --> GET /api/program/load  <-- scheduled_program.json (disk)

crontab
  |
  '--> run_program.py --> reads scheduled_program.json
                      --> PipettingController.execute_sequence()
                      --> stdout logs
```
