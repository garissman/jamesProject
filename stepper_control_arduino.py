"""
Stepper Motor Control Class for Laboratory Sampler - Arduino UNO Q Version
Controls 4 stepper motors via serial communication with STM32U585 MCU
Uses stepper motor drivers (DRV8825/A4988) with STEP, DIR, and LIMIT pins on MCU GPIO
"""

import serial
import serial.tools.list_ports
import time
import json
from enum import Enum
from typing import List, Tuple, Optional, Dict


class Direction(Enum):
    """Motor rotation direction"""
    CLOCKWISE = 1
    COUNTERCLOCKWISE = 0


class ArduinoConnection:
    """Manages serial connection to Arduino UNO Q MCU"""

    def __init__(self, port: Optional[str] = None, baudrate: int = 115200, timeout: float = 2.0):
        """
        Initialize serial connection to Arduino UNO Q

        Args:
            port: Serial port (auto-detect if None)
            baudrate: Communication speed (default 115200)
            timeout: Read timeout in seconds
        """
        self.baudrate = baudrate
        self.timeout = timeout
        self.serial: Optional[serial.Serial] = None
        self.connected = False

        if port:
            self.port = port
        else:
            self.port = self._auto_detect_port()

        self._connect()

    def _auto_detect_port(self) -> Optional[str]:
        """Auto-detect Arduino UNO Q serial port"""
        ports = serial.tools.list_ports.comports()

        # Look for Arduino UNO Q identifiers
        arduino_keywords = ['Arduino', 'UNO', 'STM32', 'ACM', 'USB']

        for port in ports:
            description = f"{port.description} {port.manufacturer or ''}"
            if any(keyword.lower() in description.lower() for keyword in arduino_keywords):
                print(f"Auto-detected Arduino at: {port.device}")
                return port.device

        # Fallback: try common port names
        common_ports = ['/dev/ttyACM0', '/dev/ttyUSB0', '/dev/ttyACM1',
                        'COM3', 'COM4', '/dev/cu.usbmodem*']
        for port in ports:
            if any(cp.replace('*', '') in port.device for cp in common_ports):
                print(f"Found potential Arduino at: {port.device}")
                return port.device

        print("Warning: Could not auto-detect Arduino port. Running in simulation mode.")
        return None

    def _connect(self):
        """Establish serial connection"""
        if self.port is None:
            self.connected = False
            return

        try:
            self.serial = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=self.timeout
            )
            # Wait for Arduino to reset after connection
            time.sleep(2.0)
            # Clear any startup messages
            self.serial.reset_input_buffer()
            self.connected = True
            print(f"Connected to Arduino UNO Q on {self.port}")
        except serial.SerialException as e:
            print(f"Failed to connect to {self.port}: {e}")
            self.connected = False

    def send_command(self, command: dict) -> dict:
        """
        Send JSON command to Arduino MCU

        Args:
            command: Dictionary with command parameters

        Returns:
            Response dictionary from Arduino
        """
        if not self.connected or self.serial is None:
            # Simulation mode
            return {"status": "simulated", "message": "No Arduino connected"}

        try:
            # Send JSON command
            cmd_str = json.dumps(command) + '\n'
            self.serial.write(cmd_str.encode('utf-8'))

            # Read response
            response_str = self.serial.readline().decode('utf-8').strip()
            if response_str:
                return json.loads(response_str)
            return {"status": "ok"}
        except (json.JSONDecodeError, serial.SerialException) as e:
            return {"status": "error", "message": str(e)}

    def close(self):
        """Close serial connection"""
        if self.serial and self.serial.is_open:
            self.serial.close()
            print("Arduino connection closed")


class StepperMotor:
    """Individual stepper motor controller for Arduino UNO Q with limit switch"""

    def __init__(self, motor_id: int, pulse_pin: int, dir_pin: int, limit_pin: int,
                 connection: ArduinoConnection, name: str = "Motor"):
        """
        Initialize a stepper motor

        Args:
            motor_id: Motor identifier (1-4)
            pulse_pin: Arduino digital pin for STEP/PULSE signal
            dir_pin: Arduino digital pin for DIRECTION signal
            limit_pin: Arduino digital pin for limit switch (normally open to GND)
            connection: ArduinoConnection instance
            name: Descriptive name for the motor
        """
        self.motor_id = motor_id
        self.pulse_pin = pulse_pin
        self.dir_pin = dir_pin
        self.limit_pin = limit_pin
        self.connection = connection
        self.name = name
        self.current_position = 0
        self.is_homed = False

        # Initialize pins on Arduino
        self._init_pins()

    def _init_pins(self):
        """Initialize motor pins on Arduino MCU"""
        command = {
            "cmd": "init_motor",
            "motor_id": self.motor_id,
            "pulse_pin": self.pulse_pin,
            "dir_pin": self.dir_pin,
            "limit_pin": self.limit_pin
        }
        self.connection.send_command(command)

    def step(self, direction: Direction = Direction.CLOCKWISE,
             steps: int = 1, delay: float = 0.001, respect_limit: bool = True) -> dict:
        """
        Move the motor a specified number of steps

        Args:
            direction: Direction.CLOCKWISE or Direction.COUNTERCLOCKWISE
            steps: Number of steps to move
            delay: Delay between steps in seconds (controls speed)
            respect_limit: If True, stop when limit switch is triggered

        Returns:
            Response dict with steps_executed and limit_triggered
        """
        command = {
            "cmd": "step",
            "motor_id": self.motor_id,
            "direction": direction.value,
            "steps": steps,
            "delay_us": int(delay * 1000000),
            "respect_limit": respect_limit
        }

        response = self.connection.send_command(command)

        # Update position tracking based on actual steps executed
        steps_executed = response.get("steps_executed", steps)
        position_delta = steps_executed if direction == Direction.CLOCKWISE else -steps_executed
        self.current_position += position_delta

        # If simulating, add delay
        if not self.connection.connected:
            time.sleep(steps * delay * 2)

        return response

    def rotate_degrees(self, degrees: float, direction: Direction = Direction.CLOCKWISE,
                       steps_per_revolution: int = 200, delay: float = 0.001,
                       respect_limit: bool = True) -> dict:
        """
        Rotate motor by specified degrees

        Args:
            degrees: Angle to rotate
            direction: Rotation direction
            steps_per_revolution: Steps for 360° rotation (200 for 1.8° stepper)
            delay: Delay between steps
            respect_limit: If True, stop when limit switch is triggered
        """
        steps = int((degrees / 360.0) * steps_per_revolution)
        return self.step(direction, steps, delay, respect_limit)

    def home(self, direction: Direction = Direction.COUNTERCLOCKWISE,
             delay: float = 0.002, max_steps: int = 10000) -> dict:
        """
        Home the motor by moving until limit switch is triggered

        Args:
            direction: Direction to move toward home position
            delay: Step delay (slower for homing)
            max_steps: Maximum steps before giving up

        Returns:
            Response dict with steps_to_home and homed status
        """
        command = {
            "cmd": "home_motor",
            "motor_id": self.motor_id,
            "direction": direction.value,
            "delay_us": int(delay * 1000000),
            "max_steps": max_steps
        }

        response = self.connection.send_command(command)

        if response.get("homed", False):
            self.current_position = 0
            self.is_homed = True
            print(f"{self.name} homed after {response.get('steps_to_home', 0)} steps")
        else:
            print(f"{self.name} failed to home (limit not reached)")

        return response

    def is_limit_triggered(self) -> bool:
        """Check if the limit switch is currently triggered"""
        response = self.connection.send_command({"cmd": "get_limits"})
        limits = response.get("limits", [])
        for limit in limits:
            if limit.get("motor_id") == self.motor_id:
                return limit.get("triggered", False)
        return False

    def stop(self):
        """Stop motor and set pins low"""
        command = {
            "cmd": "stop",
            "motor_id": self.motor_id
        }
        return self.connection.send_command(command)

    def get_position(self) -> int:
        """Get current position in steps"""
        return self.current_position

    def reset_position(self):
        """Reset position counter to zero"""
        self.current_position = 0


class StepperController:
    """Main controller for all 4 stepper motors on Arduino UNO Q"""

    # Arduino UNO Q JDIGITAL pin configuration (Pulse Pin, Direction Pin, Limit Pin)
    # Using 3.3V digital pins on the MCU header
    # Limit switches are normally open (NO) connected between pin and GND
    MOTOR_PINS = {
        1: (2, 3, 10),    # Motor 1 X-axis: Pulse=D2, Dir=D3, Limit=D10
        2: (4, 5, 11),    # Motor 2 Y-axis: Pulse=D4, Dir=D5, Limit=D11
        3: (6, 7, 12),    # Motor 3 Z-axis: Pulse=D6, Dir=D7, Limit=D12
        4: (8, 9, 13)     # Motor 4 Pipette: Pulse=D8, Dir=D9, Limit=D13
    }

    def __init__(self, port: Optional[str] = None, baudrate: int = 115200):
        """
        Initialize all stepper motors

        Args:
            port: Serial port for Arduino (auto-detect if None)
            baudrate: Serial communication speed
        """
        self.connection = ArduinoConnection(port, baudrate)

        self.motors = {
            motor_id: StepperMotor(
                motor_id=motor_id,
                pulse_pin=pins[0],
                dir_pin=pins[1],
                limit_pin=pins[2],
                connection=self.connection,
                name=f"Motor_{motor_id}"
            )
            for motor_id, pins in self.MOTOR_PINS.items()
        }
        print(f"Initialized {len(self.motors)} stepper motors on Arduino UNO Q")

    def get_motor(self, motor_id: int) -> StepperMotor:
        """
        Get a specific motor controller

        Args:
            motor_id: Motor number (1-4)

        Returns:
            StepperMotor instance
        """
        if motor_id not in self.motors:
            raise ValueError(f"Invalid motor_id: {motor_id}. Must be 1-4")
        return self.motors[motor_id]

    def move_motor(self, motor_id: int, steps: int,
                   direction: Direction = Direction.CLOCKWISE, delay: float = 0.001,
                   respect_limit: bool = True) -> dict:
        """
        Move a specific motor

        Args:
            motor_id: Motor number (1-4)
            steps: Number of steps
            direction: Direction to move
            delay: Step delay in seconds
            respect_limit: If True, stop when limit switch is triggered
        """
        motor = self.get_motor(motor_id)
        return motor.step(direction, steps, delay, respect_limit)

    def move_multiple(self, movements: List[Tuple[int, int, Direction, float]],
                      respect_limits: bool = True) -> List[dict]:
        """
        Execute movements for multiple motors sequentially

        Args:
            movements: List of (motor_id, steps, direction, delay) tuples
            respect_limits: If True, stop each motor when its limit is triggered
        """
        results = []
        for motor_id, steps, direction, delay in movements:
            result = self.move_motor(motor_id, steps, direction, delay, respect_limits)
            results.append(result)
        return results

    def move_simultaneous(self, movements: List[Tuple[int, int, Direction, float]],
                          respect_limits: bool = True) -> dict:
        """
        Execute movements for multiple motors simultaneously
        Sends batch command to Arduino for parallel execution

        Args:
            movements: List of (motor_id, steps, direction, delay) tuples
            respect_limits: If True, stop motors when their limits are triggered
        """
        command = {
            "cmd": "move_batch",
            "respect_limits": respect_limits,
            "movements": [
                {
                    "motor_id": motor_id,
                    "steps": steps,
                    "direction": direction.value,
                    "delay_us": int(delay * 1000000)
                }
                for motor_id, steps, direction, delay in movements
            ]
        }

        response = self.connection.send_command(command)

        # Update position tracking based on actual steps executed
        results = response.get("results", [])
        for result in results:
            motor_id = result.get("motor_id")
            steps_executed = result.get("steps_executed", 0)
            if motor_id in self.motors:
                # Find original direction for this motor
                for m_id, steps, direction, _ in movements:
                    if m_id == motor_id:
                        position_delta = steps_executed if direction == Direction.CLOCKWISE else -steps_executed
                        self.motors[motor_id].current_position += position_delta
                        break

        return response

    def home_motor(self, motor_id: int, direction: Direction = Direction.COUNTERCLOCKWISE,
                   delay: float = 0.002, max_steps: int = 10000) -> dict:
        """
        Home a specific motor using its limit switch

        Args:
            motor_id: Motor number (1-4)
            direction: Direction to move toward home
            delay: Step delay (slower for homing)
            max_steps: Maximum steps before giving up
        """
        motor = self.get_motor(motor_id)
        return motor.home(direction, delay, max_steps)

    def home_all(self, direction: Direction = Direction.COUNTERCLOCKWISE,
                 delay: float = 0.002, max_steps: int = 10000) -> dict:
        """
        Home all motors using limit switches

        Args:
            direction: Direction to move toward home
            delay: Step delay (slower for homing)
            max_steps: Maximum steps before giving up
        """
        print("Homing all motors...")
        command = {
            "cmd": "home_all",
            "direction": direction.value,
            "delay_us": int(delay * 1000000),
            "max_steps": max_steps
        }

        response = self.connection.send_command(command)

        # Update motor states
        homed_list = response.get("homed", [False] * 4)
        for i, motor in enumerate(self.motors.values()):
            if i < len(homed_list) and homed_list[i]:
                motor.current_position = 0
                motor.is_homed = True
                print(f"  {motor.name} homed")
            else:
                print(f"  {motor.name} failed to home")

        return response

    def get_limit_states(self) -> Dict[int, bool]:
        """
        Get the current state of all limit switches

        Returns:
            Dictionary mapping motor_id to limit switch state (True = triggered)
        """
        response = self.connection.send_command({"cmd": "get_limits"})
        limits = response.get("limits", [])

        return {
            limit.get("motor_id"): limit.get("triggered", False)
            for limit in limits
        }

    def stop_all(self):
        """Stop and de-energize all motors"""
        command = {"cmd": "stop_all"}
        self.connection.send_command(command)

        for motor in self.motors.values():
            motor.stop()
        print("All motors stopped")

    def get_all_positions(self) -> dict:
        """Get current positions of all motors"""
        return {
            motor_id: motor.get_position()
            for motor_id, motor in self.motors.items()
        }

    def is_connected(self) -> bool:
        """Check if Arduino is connected"""
        return self.connection.connected

    def cleanup(self):
        """Clean up resources"""
        self.stop_all()
        self.connection.close()
        print("Arduino UNO Q cleanup complete")


# Example usage
if __name__ == "__main__":
    # Create controller (auto-detect port)
    controller = StepperController()

    try:
        if controller.is_connected():
            print("\nArduino UNO Q connected!")
        else:
            print("\nRunning in simulation mode (no Arduino detected)")

        # Check limit switch states
        print("\nLimit switch states:", controller.get_limit_states())

        # Example 1: Home all motors first
        print("\nHoming all motors...")
        controller.home_all()

        # Example 2: Move motor 1 forward 100 steps (respects limit)
        print("\nMoving Motor 1 forward 100 steps...")
        result = controller.move_motor(1, 100, Direction.CLOCKWISE, delay=0.002)
        print(f"  Steps executed: {result.get('steps_executed', 'N/A')}")
        print(f"  Limit triggered: {result.get('limit_triggered', 'N/A')}")

        # Example 3: Move motor 2 backward 50 steps
        print("Moving Motor 2 backward 50 steps...")
        controller.move_motor(2, 50, Direction.COUNTERCLOCKWISE, delay=0.002)

        # Example 4: Rotate motor 3 by 90 degrees
        print("Rotating Motor 3 by 90 degrees...")
        motor3 = controller.get_motor(3)
        motor3.rotate_degrees(90, Direction.CLOCKWISE)

        # Example 5: Home a single motor
        print("\nHoming Motor 4...")
        controller.home_motor(4, Direction.COUNTERCLOCKWISE)

        # Example 6: Sequential movements
        print("\nExecuting sequential movements...")
        movements = [
            (1, 50, Direction.CLOCKWISE, 0.002),
            (2, 50, Direction.CLOCKWISE, 0.002),
            (3, 50, Direction.CLOCKWISE, 0.002),
            (4, 50, Direction.CLOCKWISE, 0.002)
        ]
        controller.move_multiple(movements)

        # Example 7: Simultaneous movements (batch command)
        print("\nExecuting simultaneous movements...")
        result = controller.move_simultaneous([
            (1, 25, Direction.COUNTERCLOCKWISE, 0.002),
            (2, 25, Direction.COUNTERCLOCKWISE, 0.002)
        ])
        print(f"  Batch results: {result.get('results', [])}")

        # Show positions
        print("\nCurrent positions:", controller.get_all_positions())

        # Check limit states again
        print("Limit switch states:", controller.get_limit_states())

    except KeyboardInterrupt:
        print("\nInterrupted by user")
    finally:
        # Always cleanup
        controller.cleanup()
