"""
Stepper Motor Control Class for Laboratory Sampler - Arduino UNO Q Version
Controls 4 stepper motors via Bridge RPC communication with STM32U585 MCU
This script runs on the Arduino UNO Q Linux MPU and communicates with MCU via arduino-router

Uses MessagePack-RPC protocol for communication with the Bridge library on MCU
"""

import socket
import time
import threading
import struct
from enum import IntEnum
from typing import List, Tuple, Optional, Dict, Any

# Try to import msgpack, provide fallback installation instructions
try:
    import msgpack
except ImportError:
    print("ERROR: msgpack not installed. Run: pip install msgpack")
    raise


class Direction(IntEnum):
    """Motor rotation direction"""
    COUNTERCLOCKWISE = 0
    CLOCKWISE = 1


class StepperController:
    """
    Interface to Arduino UNO Q stepper motor controller
    Communicates with MCU via arduino-router unix socket using MessagePack-RPC
    """

    SOCKET_PATH = "/var/run/arduino-router.sock"

    def __init__(self):
        """Initialize connection to MCU via arduino-router"""
        self.sock = None
        self.msg_id = 0
        self.lock = threading.Lock()
        self._connect()

    def _connect(self):
        """Connect to arduino-router socket"""
        try:
            self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.sock.connect(self.SOCKET_PATH)
            self.sock.settimeout(10.0)  # 10 second timeout
            print("Connected to MCU via arduino-router")
            time.sleep(0.3)  # Wait for bridge to stabilize

        except Exception as e:
            print(f"Failed to connect to arduino-router: {e}")
            raise

    def _next_msg_id(self) -> int:
        """Get next message ID"""
        self.msg_id = (self.msg_id + 1) % 0xFFFFFFFF
        return self.msg_id

    def _call_rpc(self, method: str, *args, timeout: float = 10.0) -> Any:
        """
        Call RPC method on MCU

        Args:
            method: RPC method name
            *args: Method arguments
            timeout: Response timeout in seconds

        Returns:
            Method return value or None on error
        """
        with self.lock:
            try:
                # Build MessagePack-RPC request: [type=0, msgid, method, params]
                msg_id = self._next_msg_id()
                request = [0, msg_id, method, list(args)]

                # Pack and send
                packed = msgpack.packb(request)
                self.sock.sendall(packed)

                # Receive response
                self.sock.settimeout(timeout)
                response_data = self._recv_msgpack()

                if response_data is None:
                    return None

                # Unpack response: [type=1, msgid, error, result]
                response = msgpack.unpackb(response_data, raw=False)

                if len(response) != 4:
                    print(f"Invalid response format: {response}")
                    return None

                resp_type, resp_id, error, result = response

                if resp_type != 1:
                    print(f"Unexpected response type: {resp_type}")
                    return None

                if error is not None:
                    print(f"RPC error: {error}")
                    return None

                return result

            except socket.timeout:
                print(f"RPC call '{method}' timed out")
                return None
            except Exception as e:
                print(f"RPC call '{method}' failed: {e}")
                return None

    def _recv_msgpack(self) -> Optional[bytes]:
        """Receive a complete MessagePack message"""
        try:
            # Read data in chunks
            data = b""
            while True:
                chunk = self.sock.recv(4096)
                if not chunk:
                    return None
                data += chunk

                # Try to unpack - if successful, we have complete message
                try:
                    msgpack.unpackb(data, raw=False)
                    return data
                except msgpack.exceptions.ExtraData:
                    # More data than needed, return what we have
                    return data
                except msgpack.exceptions.UnpackValueError:
                    # Incomplete message, continue reading
                    continue

        except socket.timeout:
            return None

    def ping(self) -> bool:
        """
        Test connection to controller

        Returns:
            True if controller responds with "pong"
        """
        result = self._call_rpc("ping")
        return result == "pong"

    def init_motor(self, motor_id: int) -> bool:
        """
        Initialize a motor

        Args:
            motor_id: Motor number (1-4)

        Returns:
            True if initialization successful
        """
        result = self._call_rpc("init_motor", motor_id)
        return result == 1

    def move_motor(self, motor_id: int, steps: int, direction: Direction,
                   delay_us: int = 1000, respect_limit: bool = True) -> Dict:
        """
        Move motor specified number of steps

        Args:
            motor_id: Motor number (1-4)
            steps: Number of steps to move
            direction: Direction of rotation
            delay_us: Microseconds between steps (controls speed)
            respect_limit: Stop if limit switch triggered (always true in RPC version)

        Returns:
            Dict with steps_executed and limit_triggered
        """
        # Calculate timeout based on expected move duration
        move_time = (steps * delay_us * 2) / 1_000_000  # seconds
        timeout = max(10, move_time + 5)

        result = self._call_rpc("move", motor_id, steps, int(direction), delay_us, timeout=timeout)

        if result is None:
            return {"steps_executed": 0, "limit_triggered": False}

        # Positive result = steps executed
        # Negative result = error code
        if result >= 0:
            return {"steps_executed": result, "limit_triggered": result < steps}
        else:
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
        move_time = (max_steps * delay_us * 2) / 1_000_000
        timeout = max(15, move_time + 5)

        result = self._call_rpc("home", motor_id, int(direction), delay_us, max_steps, timeout=timeout)

        if result is None:
            return {"steps_to_home": 0, "homed": False}

        # Positive result = steps to home (success)
        # Negative result = error code (-3 = max steps reached)
        if result >= 0:
            return {"steps_to_home": result, "homed": True}
        else:
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
        steps_to_home = []
        homed = []

        for motor_id in range(1, 5):
            result = self.home_motor(motor_id, direction, delay_us, max_steps)
            steps_to_home.append(result["steps_to_home"])
            homed.append(result["homed"])

        return {"steps_to_home": steps_to_home, "homed": homed}

    def get_limit_states(self) -> List[Dict]:
        """
        Get current state of all limit switches

        Returns:
            List of dicts with motor_id, triggered, and pin for each motor
        """
        limits = []
        for motor_id in range(1, 5):
            result = self._call_rpc("get_limit", motor_id)
            triggered = result == 1 if result is not None else False
            limits.append({
                "motor_id": motor_id,
                "triggered": triggered,
                "pin": 9 + motor_id  # Pins 10-13
            })
        return limits

    def stop_motor(self, motor_id: int) -> bool:
        """
        Immediately stop a specific motor

        Args:
            motor_id: Motor number (1-4)

        Returns:
            True if successful
        """
        result = self._call_rpc("stop", motor_id)
        return result == 1

    def stop_all(self) -> bool:
        """
        Immediately stop all motors

        Returns:
            True if successful
        """
        result = self._call_rpc("stop_all")
        return result == 1

    def move_batch(self, movements: List[Dict], respect_limits: bool = True) -> List[Dict]:
        """
        Move multiple motors (sequentially in RPC version)

        Args:
            movements: List of movement dicts with motor_id, steps, direction, delay_us
            respect_limits: Stop motors if limit switches triggered

        Returns:
            List of results with motor_id, steps_executed, limit_hit
        """
        results = []
        for movement in movements:
            motor_id = movement.get("motor_id", 1)
            steps = movement.get("steps", 0)
            direction = movement.get("direction", 0)
            delay_us = movement.get("delay_us", 1000)

            result = self.move_motor(motor_id, steps, Direction(direction), delay_us)
            results.append({
                "motor_id": motor_id,
                "steps_executed": result["steps_executed"],
                "limit_hit": result["limit_triggered"]
            })

        return results

    def led_test(self, pattern: str = "all", value: int = 0) -> bool:
        """
        Run LED test pattern on the matrix

        Args:
            pattern: Test pattern name (idle, success, error, progress, motor0-3, sweep, all)
            value: Optional value for pattern

        Returns:
            True if successful
        """
        # Map pattern names to pattern IDs
        pattern_map = {
            "idle": 0,
            "success": 1,
            "error": 2,
            "progress": 3,
            "motor": 4 + value,  # 4-7 for motors 0-3
            "motor0": 4,
            "motor1": 5,
            "motor2": 6,
            "motor3": 7,
            "sweep": 8,
            "matrix": 8,
            "all": 9,
        }

        pattern_id = pattern_map.get(pattern.lower(), 0)

        # Longer timeout for full test
        timeout = 15 if pattern_id == 9 else 5

        result = self._call_rpc("led_test", pattern_id, timeout=timeout)
        return result == 1

    def cleanup(self):
        """Close connection to arduino-router"""
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
    print("Arduino UNO Q Stepper Controller Test (RPC)")
    print("=" * 50)

    try:
        controller = StepperController()
    except Exception as e:
        print(f"Failed to initialize: {e}")
        return

    # Test ping
    print("\nTesting connection...")
    if controller.ping():
        print("Controller responding")
    else:
        print("No response from controller")
        controller.cleanup()
        return

    # Interactive menu
    while True:
        print("\n" + "=" * 50)
        print("Commands:")
        print("  1. Ping")
        print("  2. LED Test (all)")
        print("  3. LED Test (sweep)")
        print("  4. LED Test (progress)")
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
                    print("Pong!")
                else:
                    print("No response")
            elif choice == '2':
                print("Running full LED test...")
                controller.led_test("all")
                print("Done")
            elif choice == '3':
                print("Running sweep...")
                controller.led_test("sweep")
                print("Done")
            elif choice == '4':
                print("Running progress bar demo...")
                for p in [0, 25, 50, 75, 100]:
                    controller.led_test("progress")
                    print(f"  {p}%")
                    time.sleep(0.5)
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
