#!/usr/bin/env python3
"""
Simulates crontab by calling run_program.py every minute.

run_program.py is responsible for checking the cron expression in
scheduled_program.json and deciding whether to execute the steps.

Usage:
    python schedule_work.py

    # Custom check interval (default: 60 seconds)
    python schedule_work.py --interval 30

Press Ctrl+C to stop.
"""

import argparse
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

PROJECT_DIR = Path(__file__).parent
RUN_SCRIPT = PROJECT_DIR / "run_program.py"


def call_run_program():
    """Execute run_program.py as a subprocess."""
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Calling run_program.py ...")

    result = subprocess.run(
        [sys.executable, str(RUN_SCRIPT)],
        cwd=str(PROJECT_DIR),
    )

    if result.returncode == 0:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] run_program.py exited OK")
    else:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] run_program.py exited with code {result.returncode}")


def main():
    parser = argparse.ArgumentParser(
        description="Simulate crontab — calls run_program.py every minute"
    )
    parser.add_argument(
        "--interval", type=int, default=60, metavar="SECONDS",
        help="How often to call run_program.py (default: 60)",
    )
    args = parser.parse_args()

    if not RUN_SCRIPT.exists():
        print(f"Error: {RUN_SCRIPT} not found.")
        sys.exit(1)

    print(f"Schedule Worker - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Script: {RUN_SCRIPT}")
    print(f"Check interval: {args.interval}s")
    print("Press Ctrl+C to stop.\n")

    try:
        while True:
            call_run_program()
            print(f"Next check in {args.interval}s ...\n")
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print(f"\n\nScheduler stopped at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":  # pragma: no cover
    main()
