"""
Stepper Motor Control Class for Laboratory Sampler
Controls 4 stepper motors via GPIO pins on Raspberry Pi
Uses stepper motor drivers (DRV8825/A4988) with STEP and DIR pins
"""

try:
    import RPi.GPIO as GPIO

    GPIO_AVAILABLE = True
except (ImportError, RuntimeError):
    print("Warning: RPi.GPIO not available. Running in simulation mode.")
    GPIO_AVAILABLE = False

import time
from enum import Enum
from typing import List, Tuple


class Direction(Enum):
    """Motor rotation direction"""
    CLOCKWISE = 1
    COUNTERCLOCKWISE = 0


class StepperMotor:
    """Individual stepper motor controller using driver (STEP/DIR control)"""

    def __init__(self, pulse_pin: int, dir_pin: int, name: str = "Motor"):
        """
        Initialize a stepper motor with driver

        Args:
            pulse_pin: GPIO pin for STEP/PULSE signal
            dir_pin: GPIO pin for DIRECTION signal
            name: Descriptive name for the motor
        """
        self.pulse_pin = pulse_pin
        self.dir_pin = dir_pin
        self.name = name
        self.current_position = 0

        if GPIO_AVAILABLE:
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(self.pulse_pin, GPIO.OUT)
            GPIO.setup(self.dir_pin, GPIO.OUT)
            GPIO.output(self.pulse_pin, GPIO.LOW)
            GPIO.output(self.dir_pin, GPIO.LOW)

    def step(self, direction: Direction = Direction.CLOCKWISE, steps: int = 1, delay: float = 0.001):
        """
        Move the motor a specified number of steps

        Args:
            direction: Direction.CLOCKWISE or Direction.COUNTERCLOCKWISE
            steps: Number of steps to move
            delay: Delay between steps in seconds (controls speed)
        """
        # Set direction
        if GPIO_AVAILABLE:
            GPIO.output(self.dir_pin, direction.value)

        # Update position tracking
        position_delta = steps if direction == Direction.CLOCKWISE else -steps

        # Generate step pulses
        for _ in range(steps):
            if GPIO_AVAILABLE:
                GPIO.output(self.pulse_pin, GPIO.HIGH)
                time.sleep(delay)
                GPIO.output(self.pulse_pin, GPIO.LOW)
                time.sleep(delay)
            else:
                time.sleep(delay * 2)  # Simulate step time in non-GPIO mode

        self.current_position += position_delta

    def rotate_degrees(self, degrees: float, direction: Direction = Direction.CLOCKWISE,
                       steps_per_revolution: int = 200, delay: float = 0.001):
        """
        Rotate motor by specified degrees

        Args:
            degrees: Angle to rotate
            direction: Rotation direction
            steps_per_revolution: Steps for 360° rotation (200 for 1.8° stepper, 400 for 0.9°)
            delay: Delay between steps
        """
        steps = int((degrees / 360.0) * steps_per_revolution)
        self.step(direction, steps, delay)

    def stop(self):
        """Set both control pins low"""
        if GPIO_AVAILABLE:
            GPIO.output(self.pulse_pin, GPIO.LOW)
            GPIO.output(self.dir_pin, GPIO.LOW)

    def get_position(self) -> int:
        """Get current position in steps"""
        return self.current_position

    def reset_position(self):
        """Reset position counter to zero"""
        self.current_position = 0


class StepperController:
    """Main controller for all 4 stepper motors"""

    # GPIO pin configuration from CLAUDE.md (Pulse Pin, Direction Pin)
    MOTOR_PINS = {
        1: (4, 17),  # Motor 1 X-axis: Pulse=GPIO04, Dir=GPIO17
        2: (27, 22),  # Motor 2 Y-axis: Pulse=GPIO27, Dir=GPIO22
        # 3: (23, 24),    # Motor 3 Z-axis: Pulse=GPIO23, Dir=GPIO24
        3: (5, 6),  # Motor 3 Z-axis: Pulse=GPIO05, Dir=GPIO06, use this pins For Better PCB Design
        # 4: (25, 5)  # Motor 4 Pipette: Pulse=GPIO25, Dir=GPIO05
        4: (13, 19)  # Motor 4 Pipette: Pulse=GPIO13, Dir=GPIO19, use this pins For Better PCB Design
    }

    def __init__(self):
        """Initialize all stepper motors"""
        self.motors = {
            motor_id: StepperMotor(pins[0], pins[1], f"Motor_{motor_id}")
            for motor_id, pins in self.MOTOR_PINS.items()
        }
        print(f"Initialized {len(self.motors)} stepper motors")

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

    def move_motor(self, motor_id: int, steps: int, direction: Direction = Direction.CLOCKWISE,
                   delay: float = 0.001):
        """
        Move a specific motor

        Args:
            motor_id: Motor number (1-4)
            steps: Number of steps
            direction: Direction to move
            delay: Step delay in seconds
        """
        motor = self.get_motor(motor_id)
        motor.step(direction, steps, delay)

    def move_multiple(self, movements: List[Tuple[int, int, Direction, float]]):
        """
        Execute movements for multiple motors sequentially

        Args:
            movements: List of (motor_id, steps, direction, delay) tuples
        """
        for motor_id, steps, direction, delay in movements:
            self.move_motor(motor_id, steps, direction, delay)

    def home_all(self, home_sequence: List[Tuple[int, int, Direction]] = None):
        """
        Home all motors to starting position

        Args:
            home_sequence: Optional list of (motor_id, steps, direction) for homing routine
        """
        if home_sequence is None:
            # Default: Move all motors to "home" position
            print("Homing all motors...")
            for motor_id in self.motors:
                motor = self.get_motor(motor_id)
                motor.reset_position()
                print(f"  {motor.name} homed")
        else:
            for motor_id, steps, direction in home_sequence:
                self.move_motor(motor_id, steps, direction)
                self.get_motor(motor_id).reset_position()

    def stop_all(self):
        """Stop and de-energize all motors"""
        for motor in self.motors.values():
            motor.stop()
        print("All motors stopped")

    def get_all_positions(self) -> dict:
        """Get current positions of all motors"""
        return {
            motor_id: motor.get_position()
            for motor_id, motor in self.motors.items()
        }

    def cleanup(self):
        """Clean up GPIO resources"""
        self.stop_all()
        if GPIO_AVAILABLE:
            GPIO.cleanup()
        print("GPIO cleanup complete")


# Example usage
if __name__ == "__main__":
    # Create controller
    controller = StepperController()

    try:
        # Example 1: Move motor 1 forward 100 steps
        print("\nMoving Motor 1 forward 100 steps...")
        controller.move_motor(1, 100, Direction.CLOCKWISE, delay=0.002)

        # Example 2: Move motor 2 backward 50 steps
        print("Moving Motor 2 backward 50 steps...")
        controller.move_motor(2, 50, Direction.COUNTERCLOCKWISE, delay=0.002)

        # Example 3: Rotate motor 3 by 90 degrees
        print("Rotating Motor 3 by 90 degrees...")
        motor3 = controller.get_motor(3)
        motor3.rotate_degrees(90, Direction.CLOCKWISE)

        # Example 4: Sequential movements
        print("\nExecuting sequential movements...")
        movements = [
            (1, 50, Direction.CLOCKWISE, 0.002),
            (2, 50, Direction.CLOCKWISE, 0.002),
            (3, 50, Direction.CLOCKWISE, 0.002),
            (4, 50, Direction.CLOCKWISE, 0.002)
        ]
        controller.move_multiple(movements)

        # Show positions
        print("\nCurrent positions:", controller.get_all_positions())

        # Home all motors
        print("\nHoming all motors...")
        controller.home_all()

    except KeyboardInterrupt:
        print("\nInterrupted by user")
    finally:
        # Always cleanup
        controller.cleanup()
