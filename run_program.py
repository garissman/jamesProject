#!/usr/bin/env python3
"""
Standalone script to execute a saved pipetting program.
Reads scheduled_program.json, checks if the schedule is enabled and
the cron expression matches the current time, then runs the steps
via PipettingController.

Called periodically by schedule_work.py (which acts like crontab).

Usage:
    python run_program.py
"""

import json
import sys
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


def should_run_now(data):
    """Check if the schedule is enabled and the cron expression matches now."""
    schedule = data.get("schedule", {})

    if not schedule.get("enabled"):
        print("Schedule is disabled. Skipping.")
        return False

    cron_expr = (schedule.get("cronExpression") or "").strip()
    if not cron_expr:
        print("No cron expression configured. Skipping.")
        return False

    try:
        from croniter import croniter
    except ImportError:
        print("Error: croniter is required. Install with: pip install croniter")
        sys.exit(1)

    # Check if the current minute matches the cron expression.
    # We do this by getting the previous fire time and seeing if it falls
    # within the current minute.
    now = datetime.now()
    cron = croniter(cron_expr, now)
    prev_fire = cron.get_prev(datetime)

    # If the previous fire time is within the last 60 seconds, it's time to run
    diff = (now - prev_fire).total_seconds()
    if diff < 60:
        print(f"Cron '{cron_expr}' matches current time. Running program.")
        return True
    else:
        print(f"Cron '{cron_expr}' does not match now (last match was {int(diff)}s ago). Skipping.")
        return False


def main():
    # Load program file
    if not PROGRAM_FILE.exists():
        print(f"Error: {PROGRAM_FILE} not found. Save a program from the UI first.")
        sys.exit(1)

    with open(PROGRAM_FILE) as f:
        data = json.load(f)

    # Check if schedule says we should run now
    if not should_run_now(data):
        return

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
