#!/usr/bin/env python3
"""
Standalone script to execute a saved pipetting program.
Reads scheduled_program.json, checks if the schedule is enabled and
the cron expression matches the current time, then triggers execution
via the FastAPI server's /api/pipetting/execute endpoint.

This avoids GPIO conflicts — only the FastAPI server owns the hardware.

Called periodically by schedule_work.py (which acts like crontab).

Usage:
    python run_program.py
"""

import json
import sys
from datetime import datetime
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

PROGRAM_FILE = Path(__file__).parent / "scheduled_program.json"
API_BASE = "http://localhost:8000"


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

    print(f"Loaded {len(steps_data)} step(s) from {PROGRAM_FILE}")

    # Mark as running
    update_status("running")

    # Execute via FastAPI server (which already owns the GPIO hardware)
    error = None
    try:
        payload = json.dumps({"steps": steps_data}).encode("utf-8")
        req = Request(
            f"{API_BASE}/api/pipetting/execute",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=600) as resp:
            result = json.loads(resp.read().decode())
            print(f"Program execution complete: {result.get('message', 'OK')}")
    except URLError as e:
        error = f"Cannot reach FastAPI server at {API_BASE}: {e}"
        print(f"Program execution failed: {error}")
    except Exception as e:
        error = e
        print(f"Program execution failed: {e}")
    finally:
        update_status("idle", error)


if __name__ == "__main__":  # pragma: no cover
    main()
