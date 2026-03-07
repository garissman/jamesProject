#!/usr/bin/env python3
"""
Standalone script to execute a saved pipetting program.
Reads scheduled_program.json and runs it via PipettingController.
Updates execution status in the JSON file so the UI can track progress.

Usage:
    python run_program.py

Crontab example (run daily at 8am):
    0 8 * * * cd /path/to/jamesProject && .venv/bin/python run_program.py >> cron.log 2>&1
"""

import json
import sys
import time
from datetime import datetime
from pathlib import Path

from pipetting_controller import PipettingController, PipettingStep, CoordinateMapper
import settings

PROGRAM_FILE = Path(__file__).parent / "scheduled_program.json"


def update_status(status, error=None):
    """Update the execution status in scheduled_program.json."""
    if not PROGRAM_FILE.exists():
        return
    with open(PROGRAM_FILE) as f:
        data = json.load(f)

    data["execution"] = {
        "status": status,
        "lastUpdated": datetime.now().isoformat(),
    }
    if status == "idle":
        data["execution"]["lastRunAt"] = datetime.now().isoformat()
        data["execution"]["lastResult"] = "error" if error else "success"
        if error:
            data["execution"]["lastError"] = str(error)
    elif status == "running":
        data["execution"]["startedAt"] = datetime.now().isoformat()

    with open(PROGRAM_FILE, "w") as f:
        json.dump(data, f, indent=2)


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

    # Mark as running
    update_status("running")

    # Initialize controller and execute
    error = None
    try:
        controller = PipettingController()
        controller.execute_sequence(pipetting_steps)
        print("Program execution complete.")
    except Exception as e:
        error = e
        print(f"Program execution failed: {e}")
    finally:
        update_status("idle", error)


if __name__ == "__main__":
    main()
