"""
Stepper Motor Control Class for Laboratory Sampler
Controls 4 stepper motors via GPIO pins on Raspberry Pi
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
    COUNTERCLOCKWISE = -1


class StepperMotor:
    """Individual stepper motor controller"""

    # Half-step sequence for smoother motion
    HALF_STEP_SEQUENCE = [
        [1, 0, 0, 0],
        [1, 1, 0, 0],
        [0, 1, 0, 0],
        [0, 1, 1, 0],
        [0, 0, 1, 0],
        [0, 0, 1, 1],
        [0, 0, 0, 1],
        [1, 0, 0, 1]
    ]

    # Full-step sequence for more torque
    FULL_STEP_SEQUENCE = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1]
    ]

    def __init__(self, pins: Tuple[int, int, int, int], name: str = "Motor"):
        """
        Initialize a stepper motor

        Args:
            pins: Tuple of 4 GPIO pin numbers (IN1, IN2, IN3, IN4)
            name: Descriptive name for the motor
        """
        self.pins = pins
        self.name = name
        self.current_position = 0
        self.step_sequence = self.HALF_STEP_SEQUENCE
        self.sequence_index = 0

        if GPIO_AVAILABLE:
            GPIO.setmode(GPIO.BCM)
            for pin in self.pins:
                GPIO.setup(pin, GPIO.OUT)
                GPIO.output(pin, GPIO.LOW)

    def _set_step(self, step: List[int]):
        """Set the GPIO pins for a single step"""
        if GPIO_AVAILABLE:
            for pin, value in zip(self.pins, step):
                GPIO.output(pin, value)

    def step(self, direction: Direction = Direction.CLOCKWISE, steps: int = 1, delay: float = 0.001):
        """
        Move the motor a specified number of steps

        Args:
            direction: Direction.CLOCKWISE or Direction.COUNTERCLOCKWISE
            steps: Number of steps to move
            delay: Delay between steps in seconds (controls speed)
        """
        for _ in range(steps):
            self._set_step(self.step_sequence[self.sequence_index])

            # Update position and sequence index
            if direction == Direction.CLOCKWISE:
                self.sequence_index = (self.sequence_index + 1) % len(self.step_sequence)
                self.current_position += 1
            else:
                self.sequence_index = (self.sequence_index - 1) % len(self.step_sequence)
                self.current_position -= 1

            time.sleep(delay)

    def rotate_degrees(self, degrees: float, direction: Direction = Direction.CLOCKWISE,
                      steps_per_revolution: int = 2048, delay: float = 0.001):
        """
        Rotate motor by specified degrees

        Args:
            degrees: Angle to rotate
            direction: Rotation direction
            steps_per_revolution: Steps for 360° rotation (2048 for 28BYJ-48 with half-step)
            delay: Delay between steps
        """
        steps = int((degrees / 360.0) * steps_per_revolution)
        self.step(direction, steps, delay)

    def use_full_step(self):
        """Switch to full-step mode (more torque, less smooth)"""
        self.step_sequence = self.FULL_STEP_SEQUENCE
        self.sequence_index = 0

    def use_half_step(self):
        """Switch to half-step mode (smoother, less torque)"""
        self.step_sequence = self.HALF_STEP_SEQUENCE
        self.sequence_index = 0

    def stop(self):
        """De-energize the motor"""
        if GPIO_AVAILABLE:
            for pin in self.pins:
                GPIO.output(pin, GPIO.LOW)

    def get_position(self) -> int:
        """Get current position in steps"""
        return self.current_position

    def reset_position(self):
        """Reset position counter to zero"""
        self.current_position = 0


class StepperController:
    """Main controller for all 4 stepper motors"""

    # GPIO pin configuration from CLAUDE.md
    MOTOR_PINS = {
        1: (4, 17, 27, 22),    # Motor 1 (X-axis typically)
        2: (23, 24, 25, 5),    # Motor 2 (Y-axis typically)
        3: (6, 12, 13, 16),    # Motor 3 (Z-axis typically)
        4: (19, 26, 20, 21)    # Motor 4 (Pipette/gripper typically)
    }

    def __init__(self):
        """Initialize all stepper motors"""
        self.motors = {
            motor_id: StepperMotor(pins, f"Motor_{motor_id}")
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
