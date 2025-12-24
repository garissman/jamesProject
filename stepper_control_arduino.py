"""
Stepper Motor Control Class for Laboratory Sampler - Arduino UNO Q Version
Controls 4 stepper motors via Bridge communication with STM32U585 MCU
This script runs on the Arduino UNO Q Linux MPU and communicates with MCU via arduino-router

Uses stepper motor drivers (DRV8825/A4988) with STEP, DIR, and LIMIT pins on MCU GPIO
"""

import socket
import time
import json
import subprocess
import threading
import queue
from enum import IntEnum
from typing import List, Tuple, Optional, Dict, Any


class Direction(IntEnum):
    """Motor rotation direction"""
    COUNTERCLOCKWISE = 0
    CLOCKWISE = 1


class StepperController:
    """
    Interface to Arduino UNO Q stepper motor controller
    Communicates with MCU via arduino-router unix socket
    """

    SOCKET_PATH = "/var/run/arduino-router.sock"

    def __init__(self):
        """Initialize connection to MCU via arduino-router"""
        self.sock = None
        self.response_queue = queue.Queue()
        self.reader_thread = None
        self.running = False
        self._connect()

    def _connect(self):
        """Connect to arduino-router socket"""
        try:
            self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.sock.connect(self.SOCKET_PATH)
            self.sock.setblocking(False)

            # Start reader thread
            self.running = True
            self.reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
            self.reader_thread.start()

            print("Connected to MCU via arduino-router")
            time.sleep(0.5)  # Wait for bridge to stabilize

        except Exception as e:
            print(f"Failed to connect to arduino-router: {e}")
            raise

    def _reader_loop(self):
        """Background thread to read responses from socket"""
        buffer = b""
        while self.running:
            try:
                data = self.sock.recv(1024)
                if data:
                    buffer += data
                    while b'\n' in buffer:
                        line, buffer = buffer.split(b'\n', 1)
                        line_str = line.decode('utf-8', errors='ignore').strip()
                        if line_str and line_str.startswith('{'):
                            self.response_queue.put(line_str)
            except BlockingIOError:
                time.sleep(0.01)
            except Exception:
                if self.running:
                    time.sleep(0.1)

    def send_command(self, cmd: Dict[str, Any], timeout: float = 5.0) -> Optional[Dict]:
        """
        Send JSON command to MCU and wait for response

        Args:
            cmd: Command dictionary
            timeout: Response timeout in seconds

        Returns:
            Response dictionary or None on timeout
        """
        # Clear any pending responses
        while not self.response_queue.empty():
            try:
                self.response_queue.get_nowait()
            except queue.Empty:
                break

        # Send command
        cmd_str = json.dumps(cmd) + '\n'
        self.sock.sendall(cmd_str.encode('utf-8'))

        # Wait for response
        try:
            response_str = self.response_queue.get(timeout=timeout)
            return json.loads(response_str)
        except queue.Empty:
            return None
        except json.JSONDecodeError:
            return None

    def ping(self) -> bool:
        """
        Test connection to controller

        Returns:
            True if controller responds
        """
        response = self.send_command({"cmd": "ping"})
        return response is not None and response.get("status") == "pong"

    def init_motor(self, motor_id: int, pulse_pin: int = None,
                   dir_pin: int = None, limit_pin: int = None) -> bool:
        """
        Initialize a motor with optional custom pin configuration

        Args:
            motor_id: Motor number (1-4)
            pulse_pin: Optional custom pulse/step pin
            dir_pin: Optional custom direction pin
            limit_pin: Optional custom limit switch pin

        Returns:
            True if initialization successful
        """
        cmd = {"cmd": "init_motor", "motor_id": motor_id}
        if pulse_pin is not None:
            cmd["pulse_pin"] = pulse_pin
        if dir_pin is not None:
            cmd["dir_pin"] = dir_pin
        if limit_pin is not None:
            cmd["limit_pin"] = limit_pin

        response = self.send_command(cmd)
        return response is not None and response.get("status") == "ok"

    def move_motor(self, motor_id: int, steps: int, direction: Direction,
                   delay_us: int = 1000, respect_limit: bool = True) -> Dict:
        """
        Move motor specified number of steps

        Args:
            motor_id: Motor number (1-4)
            steps: Number of steps to move
            direction: Direction of rotation
            delay_us: Microseconds between steps (controls speed)
            respect_limit: Stop if limit switch triggered

        Returns:
            Dict with steps_executed and limit_triggered
        """
        cmd = {
            "cmd": "step",
            "motor_id": motor_id,
            "direction": int(direction),
            "steps": steps,
            "delay_us": delay_us,
            "respect_limit": respect_limit
        }

        # Calculate timeout based on expected move duration
        move_time = (steps * delay_us * 2) / 1_000_000  # seconds
        timeout = max(5, move_time + 2)

        response = self.send_command(cmd, timeout=timeout)
        if response:
            return {
                "steps_executed": response.get("steps_executed", 0),
                "limit_triggered": response.get("limit_triggered", False)
            }
        return {"steps_executed": 0, "limit_triggered": False}

    def home_motor(self, motor_id: int, direction: Direction = Direction.COUNTERCLOCKWISE,
                   delay_us: int = 2000, max_steps: int = 10000) -> Dict:
        """
        Home a motor by moving until limit switch is triggered

        Args:
            motor_id: Motor number (1-4)
            direction: Direction to move toward home
            delay_us: Microseconds between steps
            max_steps: Maximum steps before giving up

        Returns:
            Dict with steps_to_home and homed status
        """
        cmd = {
            "cmd": "home_motor",
            "motor_id": motor_id,
            "direction": int(direction),
            "delay_us": delay_us,
            "max_steps": max_steps
        }

        move_time = (max_steps * delay_us * 2) / 1_000_000
        timeout = max(10, move_time + 2)

        response = self.send_command(cmd, timeout=timeout)
        if response:
            return {
                "steps_to_home": response.get("steps_to_home", 0),
                "homed": response.get("homed", False)
            }
        return {"steps_to_home": 0, "homed": False}

    def home_all(self, direction: Direction = Direction.COUNTERCLOCKWISE,
                 delay_us: int = 2000, max_steps: int = 10000) -> Dict:
        """
        Home all motors sequentially

        Args:
            direction: Direction to move toward home
            delay_us: Microseconds between steps
            max_steps: Maximum steps per motor

        Returns:
            Dict with arrays of steps_to_home and homed status
        """
        cmd = {
            "cmd": "home_all",
            "direction": int(direction),
            "delay_us": delay_us,
            "max_steps": max_steps
        }

        move_time = (max_steps * delay_us * 2 * 4) / 1_000_000  # 4 motors
        timeout = max(30, move_time + 5)

        response = self.send_command(cmd, timeout=timeout)
        if response:
            return {
                "steps_to_home": response.get("steps_to_home", [0, 0, 0, 0]),
                "homed": response.get("homed", [False, False, False, False])
            }
        return {"steps_to_home": [0, 0, 0, 0], "homed": [False, False, False, False]}

    def get_limit_states(self) -> List[Dict]:
        """
        Get current state of all limit switches

        Returns:
            List of dicts with motor_id, triggered, and pin for each motor
        """
        response = self.send_command({"cmd": "get_limits"})
        if response and response.get("status") == "ok":
            return response.get("limits", [])
        return []

    def stop_motor(self, motor_id: int) -> bool:
        """
        Immediately stop a specific motor

        Args:
            motor_id: Motor number (1-4)

        Returns:
            True if successful
        """
        response = self.send_command({"cmd": "stop", "motor_id": motor_id})
        return response is not None and response.get("status") == "ok"

    def stop_all(self) -> bool:
        """
        Immediately stop all motors

        Returns:
            True if successful
        """
        response = self.send_command({"cmd": "stop_all"})
        return response is not None and response.get("status") == "ok"

    def move_batch(self, movements: List[Dict], respect_limits: bool = True) -> List[Dict]:
        """
        Move multiple motors simultaneously

        Args:
            movements: List of movement dicts with motor_id, steps, direction, delay_us
            respect_limits: Stop motors if limit switches triggered

        Returns:
            List of results with motor_id, steps_executed, limit_hit
        """
        cmd = {
            "cmd": "move_batch",
            "respect_limits": respect_limits,
            "movements": movements
        }

        if movements:
            max_steps = max(m.get("steps", 0) for m in movements)
            min_delay = min(m.get("delay_us", 1000) for m in movements)
            move_time = (max_steps * min_delay * 2) / 1_000_000
            timeout = max(5, move_time + 2)
        else:
            timeout = 5

        response = self.send_command(cmd, timeout=timeout)
        if response and response.get("status") == "ok":
            return response.get("results", [])
        return []

    def led_test(self, pattern: str = "all", value: int = 0) -> bool:
        """
        Run LED test pattern on the matrix and RGB LEDs

        Args:
            pattern: Test pattern name (all, matrix, rgb, progress, motor, idle, moving, homing, error, success)
            value: Optional value for pattern (e.g., percentage for progress, motor index for motor)

        Returns:
            True if successful
        """
        cmd = {"cmd": "led_test", "pattern": pattern}
        if value:
            cmd["value"] = value

        response = self.send_command(cmd, timeout=15)
        return response is not None and response.get("status") == "ok"

    def cleanup(self):
        """Close connection to arduino-router"""
        self.running = False
        if self.reader_thread:
            self.reader_thread.join(timeout=2)
        if self.sock:
            try:
                self.sock.close()
            except:
                pass
        print("Disconnected from MCU")


# Motor configuration defaults
DEFAULT_MOTOR_CONFIG = {
    1: {"name": "X-axis", "pulse_pin": 2, "dir_pin": 3, "limit_pin": 10},
    2: {"name": "Y-axis", "pulse_pin": 4, "dir_pin": 5, "limit_pin": 11},
    3: {"name": "Z-axis", "pulse_pin": 6, "dir_pin": 7, "limit_pin": 12},
    4: {"name": "Pipette", "pulse_pin": 8, "dir_pin": 9, "limit_pin": 13},
}


def main():
    """Interactive test of stepper controller"""
    print("=" * 50)
    print("Arduino UNO Q Stepper Controller Test")
    print("=" * 50)

    try:
        controller = StepperController()
    except Exception as e:
        print(f"Failed to initialize: {e}")
        return

    # Test ping
    print("\nTesting connection...")
    if controller.ping():
        print("✓ Controller responding")
    else:
        print("✗ No response from controller")
        controller.cleanup()
        return

    # Interactive menu
    while True:
        print("\n" + "=" * 50)
        print("Commands:")
        print("  1. Ping")
        print("  2. LED Test (all)")
        print("  3. LED Test (matrix sweep)")
        print("  4. LED Test (progress bar)")
        print("  5. Get Limit States")
        print("  6. Move Motor")
        print("  7. Home Motor")
        print("  8. Home All")
        print("  9. Move Batch")
        print("  q. Quit")
        print("=" * 50)

        choice = input("Select: ").strip().lower()

        try:
            if choice == 'q':
                break
            elif choice == '1':
                if controller.ping():
                    print("✓ Pong!")
                else:
                    print("✗ No response")
            elif choice == '2':
                print("Running full LED test...")
                controller.led_test("all")
                print("Done")
            elif choice == '3':
                print("Running matrix sweep...")
                controller.led_test("matrix")
                print("Done")
            elif choice == '4':
                print("Running progress bar demo...")
                for p in range(0, 101, 10):
                    controller.led_test("progress", p)
                    print(f"  {p}%")
                    time.sleep(0.3)
                print("Done")
            elif choice == '5':
                limits = controller.get_limit_states()
                print("\nLimit Switch States:")
                for limit in limits:
                    motor_id = limit.get('motor_id', '?')
                    triggered = limit.get('triggered', False)
                    pin = limit.get('pin', '?')
                    name = DEFAULT_MOTOR_CONFIG.get(motor_id, {}).get('name', f'Motor {motor_id}')
                    status = "TRIGGERED" if triggered else "open"
                    print(f"  {name}: {status} (pin {pin})")
            elif choice == '6':
                motor_id = int(input("Motor ID (1-4): "))
                steps = int(input("Steps: "))
                direction = int(input("Direction (0=CCW, 1=CW): "))
                delay_us = int(input("Delay (us, default 1000): ") or "1000")

                print(f"Moving motor {motor_id}...")
                result = controller.move_motor(motor_id, steps, Direction(direction), delay_us)
                print(f"  Steps executed: {result['steps_executed']}")
                print(f"  Limit triggered: {result['limit_triggered']}")
            elif choice == '7':
                motor_id = int(input("Motor ID (1-4): "))
                direction = int(input("Direction (0=CCW, 1=CW, default 0): ") or "0")

                print(f"Homing motor {motor_id}...")
                result = controller.home_motor(motor_id, Direction(direction))
                print(f"  Steps to home: {result['steps_to_home']}")
                print(f"  Homed: {result['homed']}")
            elif choice == '8':
                direction = int(input("Direction (0=CCW, 1=CW, default 0): ") or "0")

                print("Homing all motors...")
                result = controller.home_all(Direction(direction))
                for i, (steps, homed) in enumerate(zip(result['steps_to_home'], result['homed'])):
                    name = DEFAULT_MOTOR_CONFIG.get(i + 1, {}).get('name', f'Motor {i + 1}')
                    print(f"  {name}: {steps} steps, {'homed' if homed else 'NOT homed'}")
            elif choice == '9':
                print("Enter movements (empty line to finish):")
                movements = []
                while True:
                    line = input("  motor_id,steps,direction,delay_us: ").strip()
                    if not line:
                        break
                    parts = line.split(',')
                    if len(parts) >= 3:
                        movements.append({
                            "motor_id": int(parts[0]),
                            "steps": int(parts[1]),
                            "direction": int(parts[2]),
                            "delay_us": int(parts[3]) if len(parts) > 3 else 1000
                        })

                if movements:
                    print("Moving motors...")
                    results = controller.move_batch(movements)
                    for result in results:
                        print(f"  Motor {result.get('motor_id')}: {result.get('steps_executed')} steps, limit_hit={result.get('limit_hit')}")
                else:
                    print("No movements specified")
            else:
                print("Invalid choice")

        except ValueError as e:
            print(f"Invalid input: {e}")
        except Exception as e:
            print(f"Error: {e}")

    controller.cleanup()
    print("\nGoodbye!")


if __name__ == "__main__":
    main()
