#!/usr/bin/env python3
"""
Simulates crontab by scheduling periodic execution of run_program.py.

Usage:
    # Use the cron expression saved from the UI (scheduled_program.json)
    python schedule_work.py

    # Override with a fixed interval (seconds)
    python schedule_work.py --interval 300

    # Override with a daily time
    python schedule_work.py --at 08:00

    # Override with a custom cron expression
    python schedule_work.py --cron "0 */2 * * *"

    # Run once at a specific datetime
    python schedule_work.py --once "2026-03-08 08:00:00"

Press Ctrl+C to stop.
"""

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

PROJECT_DIR = Path(__file__).parent
RUN_SCRIPT = PROJECT_DIR / "run_program.py"
PROGRAM_FILE = PROJECT_DIR / "scheduled_program.json"


def run_program():
    """Execute run_program.py as a subprocess and stream its output."""
    print(f"\n{'=' * 60}")
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting run_program.py")
    print('=' * 60)

    result = subprocess.run(
        [sys.executable, str(RUN_SCRIPT)],
        cwd=str(PROJECT_DIR),
    )

    status = "OK" if result.returncode == 0 else f"FAILED (exit code {result.returncode})"
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Finished - {status}")
    return result.returncode


def load_schedule_from_config():
    """Read the cron expression from scheduled_program.json."""
    if not PROGRAM_FILE.exists():
        return None

    with open(PROGRAM_FILE) as f:
        data = json.load(f)

    schedule = data.get("schedule", {})
    if not schedule.get("enabled"):
        return None
    return schedule.get("cronExpression", "").strip() or None


def schedule_cron(cron_expr):
    """Run according to a cron expression using croniter."""
    try:
        from croniter import croniter
    except ImportError:
        print("Error: croniter is required for cron scheduling.")
        print("Install it with: pip install croniter")
        sys.exit(1)

    print(f"Scheduler started with cron: {cron_expr}")

    cron = croniter(cron_expr, datetime.now())

    while True:
        next_run = cron.get_next(datetime)
        wait = (next_run - datetime.now()).total_seconds()
        print(f"\nNext run: {next_run.strftime('%Y-%m-%d %H:%M:%S')} (in {int(wait)}s)")

        if wait > 0:
            time.sleep(wait)

        run_program()
        # Re-create croniter from now so it stays accurate
        cron = croniter(cron_expr, datetime.now())


def schedule_interval(interval_seconds):
    """Run on a fixed interval."""
    print(f"Scheduler started: running every {interval_seconds}s")
    print(f"Next run: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    while True:
        run_program()
        next_run = datetime.now() + timedelta(seconds=interval_seconds)
        print(f"\nNext run: {next_run.strftime('%Y-%m-%d %H:%M:%S')}")
        time.sleep(interval_seconds)


def schedule_daily(time_str):
    """Run once daily at the given HH:MM time."""
    hour, minute = map(int, time_str.split(":"))
    print(f"Scheduler started: running daily at {time_str}")

    while True:
        now = datetime.now()
        target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)

        wait = (target - now).total_seconds()
        print(f"Next run: {target.strftime('%Y-%m-%d %H:%M:%S')} (in {int(wait)}s)")
        time.sleep(wait)
        run_program()


def schedule_once(datetime_str):
    """Run once at a specific datetime."""
    target = datetime.strptime(datetime_str, "%Y-%m-%d %H:%M:%S")
    now = datetime.now()

    if target <= now:
        print(f"Target time {datetime_str} is in the past. Running immediately.")
        run_program()
        return

    wait = (target - now).total_seconds()
    print(f"Scheduled to run at {datetime_str} (in {int(wait)}s)")
    time.sleep(wait)
    run_program()


def main():
    parser = argparse.ArgumentParser(description="Simulate crontab for run_program.py")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--interval", type=int, metavar="SECONDS",
                       help="Run every N seconds")
    group.add_argument("--at", type=str, metavar="HH:MM",
                       help="Run daily at this time (e.g. 08:00)")
    group.add_argument("--cron", type=str, metavar="EXPR",
                       help='Cron expression (e.g. "0 8 * * *")')
    group.add_argument("--once", type=str, metavar="DATETIME",
                       help='Run once at datetime (e.g. "2026-03-08 08:00:00")')
    args = parser.parse_args()

    if not RUN_SCRIPT.exists():
        print(f"Error: {RUN_SCRIPT} not found.")
        sys.exit(1)

    print(f"Schedule Worker - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Script: {RUN_SCRIPT}")
    print("Press Ctrl+C to stop.\n")

    try:
        if args.once:
            schedule_once(args.once)
        elif args.at:
            schedule_daily(args.at)
        elif args.cron:
            schedule_cron(args.cron)
        elif args.interval:
            schedule_interval(args.interval)
        else:
            # Default: read cron from scheduled_program.json
            cron_expr = load_schedule_from_config()
            if not cron_expr:
                print("Error: No schedule found in scheduled_program.json.")
                print("Either enable scheduling in the UI and save the program,")
                print("or pass --cron, --interval, --at, or --once.")
                sys.exit(1)
            print(f"Loaded cron expression from config: {cron_expr}")
            schedule_cron(cron_expr)
    except KeyboardInterrupt:
        print(f"\n\nScheduler stopped at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    main()
