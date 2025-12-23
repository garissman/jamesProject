#!/usr/bin/env python3
"""
Motor Drift Test Script
Tests X-axis stepper motor precision by running back and forth cycles
Measures drift using limit switches
"""

import RPi.GPIO as GPIO
import time
import json
from datetime import datetime
import sys

# Motor Configuration (X-axis)
PULSE_PIN = 4   # GPIO04
DIR_PIN = 17    # GPIO17

# Limit Switch Configuration
LIMIT_MIN_PIN = 6   # GPIO06 - X-axis minimum position
LIMIT_MAX_PIN = 13  # GPIO13 - X-axis maximum position

# Motor Parameters
STEPS_PER_MM = 200  # Adjust based on your motor and lead screw specs
MOTOR_SPEED = 0.001  # Delay between pulses (seconds) - adjust for desired speed
MAX_STEPS_SAFETY = 50000  # Safety limit to prevent runaway

# Test Configuration
TEST_CYCLES = 100  # Number of back-and-forth cycles to run
LOG_FILE = f"motor_drift_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"


class MotorDriftTester:
    def __init__(self):
        self.test_data = {
            "start_time": datetime.now().isoformat(),
            "motor": "X-axis",
            "cycles": [],
            "config": {
                "pulse_pin": PULSE_PIN,
                "dir_pin": DIR_PIN,
                "limit_min_pin": LIMIT_MIN_PIN,
                "limit_max_pin": LIMIT_MAX_PIN,
                "steps_per_mm": STEPS_PER_MM,
                "motor_speed": MOTOR_SPEED
            }
        }
        self.setup_gpio()

    def setup_gpio(self):
        """Initialize GPIO pins"""
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)

        # Setup motor pins as outputs
        GPIO.setup(PULSE_PIN, GPIO.OUT)
        GPIO.setup(DIR_PIN, GPIO.OUT)

        # Setup limit switches as inputs with pull-up resistors
        # Assumes normally-open switches that connect to ground when triggered
        GPIO.setup(LIMIT_MIN_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        GPIO.setup(LIMIT_MAX_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)

        # Initialize outputs
        GPIO.output(PULSE_PIN, GPIO.LOW)
        GPIO.output(DIR_PIN, GPIO.LOW)

        print("✓ GPIO initialized")

    def check_limit_switch(self, pin):
        """Check if a limit switch is triggered (LOW = triggered with pull-up)"""
        return GPIO.input(pin) == GPIO.LOW

    def move_motor_until_limit(self, direction, limit_pin, description):
        """
        Move motor in specified direction until limit switch is triggered
        Returns: (steps_taken, time_elapsed, limit_reached)
        """
        GPIO.output(DIR_PIN, GPIO.HIGH if direction == "forward" else GPIO.LOW)
        time.sleep(0.001)  # Small delay for direction change

        steps = 0
        start_time = time.time()

        print(f"  Moving {description}...", end="", flush=True)

        while not self.check_limit_switch(limit_pin):
            if steps >= MAX_STEPS_SAFETY:
                print(f" SAFETY LIMIT REACHED!")
                return steps, time.time() - start_time, False

            # Send pulse
            GPIO.output(PULSE_PIN, GPIO.HIGH)
            time.sleep(MOTOR_SPEED)
            GPIO.output(PULSE_PIN, GPIO.LOW)
            time.sleep(MOTOR_SPEED)

            steps += 1

            # Print progress every 1000 steps
            if steps % 1000 == 0:
                print(".", end="", flush=True)

        elapsed_time = time.time() - start_time
        print(f" Done! ({steps} steps, {elapsed_time:.2f}s)")

        return steps, elapsed_time, True

    def run_drift_test(self, num_cycles):
        """Run the drift test for specified number of cycles"""
        print(f"\n{'='*60}")
        print(f"Starting Motor Drift Test - X-axis")
        print(f"{'='*60}")
        print(f"Cycles to run: {num_cycles}")
        print(f"Logging to: {LOG_FILE}")
        print(f"{'='*60}\n")

        # Initial homing to min position
        print("Phase 1: Homing to minimum position...")
        initial_steps, initial_time, success = self.move_motor_until_limit(
            "backward", LIMIT_MIN_PIN, "to MIN limit"
        )

        if not success:
            print("ERROR: Failed to reach initial home position!")
            return False

        print("✓ Homing complete\n")
        time.sleep(1)

        # Run test cycles
        for cycle in range(1, num_cycles + 1):
            print(f"Cycle {cycle}/{num_cycles}")
            cycle_start = time.time()

            # Move forward to MAX
            fwd_steps, fwd_time, fwd_success = self.move_motor_until_limit(
                "forward", LIMIT_MAX_PIN, "forward to MAX"
            )

            if not fwd_success:
                print(f"ERROR: Failed to reach MAX limit on cycle {cycle}")
                break

            time.sleep(0.5)  # Pause at max position

            # Move backward to MIN
            back_steps, back_time, back_success = self.move_motor_until_limit(
                "backward", LIMIT_MIN_PIN, "backward to MIN"
            )

            if not back_success:
                print(f"ERROR: Failed to reach MIN limit on cycle {cycle}")
                break

            cycle_elapsed = time.time() - cycle_start

            # Calculate drift metrics
            step_difference = abs(fwd_steps - back_steps)
            drift_mm = step_difference / STEPS_PER_MM

            # Store cycle data
            cycle_data = {
                "cycle_number": cycle,
                "timestamp": datetime.now().isoformat(),
                "forward_steps": fwd_steps,
                "forward_time": fwd_time,
                "backward_steps": back_steps,
                "backward_time": back_time,
                "total_cycle_time": cycle_elapsed,
                "step_difference": step_difference,
                "drift_mm": round(drift_mm, 3)
            }

            self.test_data["cycles"].append(cycle_data)

            # Print summary
            print(f"  → Forward: {fwd_steps} steps, Backward: {back_steps} steps")
            print(f"  → Drift: {step_difference} steps ({drift_mm:.3f} mm)")
            print(f"  → Cycle time: {cycle_elapsed:.2f}s\n")

            # Save data periodically (every 10 cycles)
            if cycle % 10 == 0:
                self.save_data()

            time.sleep(0.5)  # Brief pause between cycles

        # Final data save
        self.test_data["end_time"] = datetime.now().isoformat()
        self.save_data()
        self.print_summary()

        return True

    def save_data(self):
        """Save test data to JSON file"""
        with open(LOG_FILE, 'w') as f:
            json.dump(self.test_data, f, indent=2)

    def print_summary(self):
        """Print test summary and statistics"""
        print(f"\n{'='*60}")
        print("TEST SUMMARY")
        print(f"{'='*60}")

        if not self.test_data["cycles"]:
            print("No cycles completed")
            return

        # Calculate statistics
        forward_steps = [c["forward_steps"] for c in self.test_data["cycles"]]
        backward_steps = [c["backward_steps"] for c in self.test_data["cycles"]]
        drifts_mm = [c["drift_mm"] for c in self.test_data["cycles"]]

        avg_fwd = sum(forward_steps) / len(forward_steps)
        avg_back = sum(backward_steps) / len(backward_steps)
        avg_drift = sum(drifts_mm) / len(drifts_mm)
        max_drift = max(drifts_mm)
        min_drift = min(drifts_mm)

        print(f"Total cycles completed: {len(self.test_data['cycles'])}")
        print(f"\nAverage forward steps: {avg_fwd:.1f}")
        print(f"Average backward steps: {avg_back:.1f}")
        print(f"\nDrift Statistics:")
        print(f"  Average drift: {avg_drift:.3f} mm")
        print(f"  Maximum drift: {max_drift:.3f} mm")
        print(f"  Minimum drift: {min_drift:.3f} mm")
        print(f"\nData saved to: {LOG_FILE}")
        print(f"{'='*60}\n")

    def cleanup(self):
        """Clean up GPIO"""
        GPIO.cleanup()
        print("✓ GPIO cleaned up")


def main():
    print("\n" + "="*60)
    print("MOTOR DRIFT MEASUREMENT TEST")
    print("="*60)
    print("WARNING: Ensure limit switches are properly installed!")
    print("Press Ctrl+C at any time to stop the test")
    print("="*60)

    input("\nPress ENTER to start the test...")

    tester = None
    try:
        tester = MotorDriftTester()
        tester.run_drift_test(TEST_CYCLES)

    except KeyboardInterrupt:
        print("\n\n⚠ Test interrupted by user")
        if tester:
            tester.save_data()
            tester.print_summary()

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()

    finally:
        if tester:
            tester.cleanup()
        print("\nTest ended.")


if __name__ == "__main__":
    main()
