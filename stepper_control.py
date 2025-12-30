"""
Stepper Motor Control Class for Laboratory Sampler
Controls 4 stepper motors via GPIO pins on Raspberry Pi
Uses stepper motor drivers (DRV8825/A4988) with STEP and DIR pins
Supports limit switches for homing and safety stops
"""

try:
    import RPi.GPIO as GPIO

    GPIO_AVAILABLE = True
except (ImportError, RuntimeError):
    print("Warning: RPi.GPIO not available. Running in simulation mode.")
    GPIO_AVAILABLE = False

import random
import time
from enum import Enum
from typing import List, Tuple, Optional


class Direction(Enum):
    """Motor rotation direction"""
    CLOCKWISE = 1
    COUNTERCLOCKWISE = 0


class LimitSwitchState(Enum):
    """Limit switch trigger state"""
    NOT_TRIGGERED = 0
    MIN_TRIGGERED = 1
    MAX_TRIGGERED = 2


class StepperMotor:
    """Individual stepper motor controller using driver (STEP/DIR control)"""

    def __init__(self, pulse_pin: int, dir_pin: int, name: str = "Motor",
                 limit_min_pin: Optional[int] = None, limit_max_pin: Optional[int] = None):
        """
        Initialize a stepper motor with driver

        Args:
            pulse_pin: GPIO pin for STEP/PULSE signal
            dir_pin: GPIO pin for DIRECTION signal
            name: Descriptive name for the motor
            limit_min_pin: GPIO pin for minimum limit switch (optional)
            limit_max_pin: GPIO pin for maximum limit switch (optional)
        """
        self.pulse_pin = pulse_pin
        self.dir_pin = dir_pin
        self.name = name
        self.current_position = 0
        self.limit_min_pin = limit_min_pin
        self.limit_max_pin = limit_max_pin
        self.stop_requested = False

        # Simulation mode: track simulated position and limit triggers
        self.simulated_position = 0
        self.simulated_travel_range = random.randint(8000, 12000)  # Simulated range in steps

        if GPIO_AVAILABLE:
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(self.pulse_pin, GPIO.OUT)
            GPIO.setup(self.dir_pin, GPIO.OUT)
            GPIO.output(self.pulse_pin, GPIO.LOW)
            GPIO.output(self.dir_pin, GPIO.LOW)

            # Setup limit switch pins with pull-up resistors
            # Assumes normally-open switches that connect to ground when triggered
            if self.limit_min_pin is not None:
                GPIO.setup(self.limit_min_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
            if self.limit_max_pin is not None:
                GPIO.setup(self.limit_max_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)

    def check_limit_switch(self, pin: Optional[int]) -> bool:
        """
        Check if a limit switch is triggered

        Args:
            pin: GPIO pin number for the limit switch

        Returns:
            True if limit switch is triggered (LOW with pull-up)
        """
        if pin is None:
            return False
        if GPIO_AVAILABLE:
            return GPIO.input(pin) == GPIO.LOW

        # Simulation mode: simulate limit switch based on position
        if pin == self.limit_min_pin:
            return self.simulated_position <= 0
        elif pin == self.limit_max_pin:
            return self.simulated_position >= self.simulated_travel_range
        return False

    def check_min_limit(self) -> bool:
        """Check if minimum limit switch is triggered"""
        return self.check_limit_switch(self.limit_min_pin)

    def check_max_limit(self) -> bool:
        """Check if maximum limit switch is triggered"""
        return self.check_limit_switch(self.limit_max_pin)

    def get_limit_state(self) -> LimitSwitchState:
        """
        Get current limit switch state

        Returns:
            LimitSwitchState enum value
        """
        if self.check_min_limit():
            return LimitSwitchState.MIN_TRIGGERED
        if self.check_max_limit():
            return LimitSwitchState.MAX_TRIGGERED
        return LimitSwitchState.NOT_TRIGGERED

    def step(self, direction: Direction = Direction.CLOCKWISE, steps: int = 1,
             delay: float = 0.001, check_limits: bool = True) -> Tuple[int, LimitSwitchState]:
        """
        Move the motor a specified number of steps

        Args:
            direction: Direction.CLOCKWISE or Direction.COUNTERCLOCKWISE
            steps: Number of steps to move
            delay: Delay between steps in seconds (controls speed)
            check_limits: If True, stop when limit switch is triggered

        Returns:
            Tuple of (steps_completed, limit_state)
        """
        self.stop_requested = False

        # Set direction
        if GPIO_AVAILABLE:
            GPIO.output(self.dir_pin, direction.value)

        # Determine which limit to check based on direction
        if check_limits:
            if direction == Direction.CLOCKWISE:
                limit_pin = self.limit_max_pin
            else:
                limit_pin = self.limit_min_pin
        else:
            limit_pin = None

        steps_completed = 0
        limit_state = LimitSwitchState.NOT_TRIGGERED

        # Generate step pulses
        for _ in range(steps):
            # Check for stop request
            if self.stop_requested:
                break

            # Check limit switch before stepping
            if check_limits and limit_pin is not None:
                if self.check_limit_switch(limit_pin):
                    if direction == Direction.CLOCKWISE:
                        limit_state = LimitSwitchState.MAX_TRIGGERED
                    else:
                        limit_state = LimitSwitchState.MIN_TRIGGERED
                    break

            if GPIO_AVAILABLE:
                GPIO.output(self.pulse_pin, GPIO.HIGH)
                time.sleep(delay)
                GPIO.output(self.pulse_pin, GPIO.LOW)
                time.sleep(delay)
            else:
                # Simulation mode: faster delay for testing, update simulated position
                time.sleep(delay * 0.01)  # Much faster in simulation mode
                if direction == Direction.CLOCKWISE:
                    self.simulated_position += 1
                else:
                    self.simulated_position -= 1

            steps_completed += 1

        # Update position tracking
        position_delta = steps_completed if direction == Direction.CLOCKWISE else -steps_completed
        self.current_position += position_delta

        return steps_completed, limit_state

    def move_until_limit(self, direction: Direction, delay: float = 0.001,
                         max_steps: int = 50000) -> Tuple[int, bool]:
        """
        Move motor until limit switch is triggered

        Args:
            direction: Direction to move
            delay: Step delay in seconds
            max_steps: Maximum steps before giving up (safety limit)

        Returns:
            Tuple of (steps_taken, limit_reached)
        """
        self.stop_requested = False

        # Determine which limit to check
        if direction == Direction.CLOCKWISE:
            limit_pin = self.limit_max_pin
        else:
            limit_pin = self.limit_min_pin

        if limit_pin is None:
            print(f"Warning: No limit switch configured for {self.name} in {'max' if direction == Direction.CLOCKWISE else 'min'} direction")
            return 0, False

        # Set direction
        if GPIO_AVAILABLE:
            GPIO.output(self.dir_pin, direction.value)
            time.sleep(0.001)  # Small delay for direction change

        steps_taken = 0

        while not self.check_limit_switch(limit_pin):
            if self.stop_requested:
                break

            if steps_taken >= max_steps:
                print(f"Warning: {self.name} reached safety limit ({max_steps} steps)")
                return steps_taken, False

            if GPIO_AVAILABLE:
                GPIO.output(self.pulse_pin, GPIO.HIGH)
                time.sleep(delay)
                GPIO.output(self.pulse_pin, GPIO.LOW)
                time.sleep(delay)
            else:
                # Simulation mode: faster delay for testing, update simulated position
                time.sleep(delay * 0.01)  # Much faster in simulation mode
                if direction == Direction.CLOCKWISE:
                    self.simulated_position += 1
                else:
                    self.simulated_position -= 1

            steps_taken += 1

        # Update position
        position_delta = steps_taken if direction == Direction.CLOCKWISE else -steps_taken
        self.current_position += position_delta

        return steps_taken, self.check_limit_switch(limit_pin)

    def home(self, delay: float = 0.001, max_steps: int = 50000) -> bool:
        """
        Home the motor by moving to minimum limit switch

        Args:
            delay: Step delay in seconds
            max_steps: Maximum steps before giving up

        Returns:
            True if homing successful
        """
        if self.limit_min_pin is None:
            print(f"Warning: {self.name} has no min limit switch, cannot home")
            return False

        print(f"Homing {self.name}...")
        steps, reached = self.move_until_limit(Direction.COUNTERCLOCKWISE, delay, max_steps)

        if reached:
            self.current_position = 0
            print(f"  {self.name} homed successfully ({steps} steps)")
            return True
        else:
            print(f"  {self.name} homing failed")
            return False

    def request_stop(self):
        """Request motor to stop"""
        self.stop_requested = True

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
        self.simulated_position = 0  # Also reset simulated position


class StepperController:
    """Main controller for all 4 stepper motors"""

    # GPIO pin configuration (Pulse Pin, Direction Pin)
    MOTOR_PINS = {
        1: (4, 17),  # Motor 1 X-axis: Pulse=GPIO04, Dir=GPIO17
        2: (27, 22),  # Motor 2 Y-axis: Pulse=GPIO27, Dir=GPIO22
        # 3: (23, 24),    # Motor 3 Z-axis: Pulse=GPIO23, Dir=GPIO24
        3: (5, 6),  # Motor 3 Z-axis: Pulse=GPIO05, Dir=GPIO06, use this pins For Better PCB Design
        # 4: (25, 5)  # Motor 4 Pipette: Pulse=GPIO25, Dir=GPIO05
        4: (13, 19)  # Motor 4 Pipette: Pulse=GPIO13, Dir=GPIO19, use this pins For Better PCB Design
    }

    # Limit switch configuration (Min Pin, Max Pin) - None if not connected
    LIMIT_SWITCH_PINS = {
        1: (20, 21),  # Motor 1 X-axis: Min=GPIO20, Max=GPIO21
        2: (16, 12),  # Motor 2 Y-axis: Min=GPIO16, Max=GPIO12
        3: (7, 8),    # Motor 3 Z-axis: Min=GPIO07, Max=GPIO08
        4: (None, None)  # Motor 4 Pipette: No limit switches
    }

    def __init__(self, use_limit_switches: bool = True):
        """
        Initialize all stepper motors

        Args:
            use_limit_switches: If True, configure limit switches for motors
        """
        self.use_limit_switches = use_limit_switches
        self.motors = {}

        for motor_id, pins in self.MOTOR_PINS.items():
            if use_limit_switches and motor_id in self.LIMIT_SWITCH_PINS:
                limit_pins = self.LIMIT_SWITCH_PINS[motor_id]
                self.motors[motor_id] = StepperMotor(
                    pins[0], pins[1], f"Motor_{motor_id}",
                    limit_min_pin=limit_pins[0],
                    limit_max_pin=limit_pins[1]
                )
            else:
                self.motors[motor_id] = StepperMotor(pins[0], pins[1], f"Motor_{motor_id}")

        print(f"Initialized {len(self.motors)} stepper motors")
        if use_limit_switches:
            print("  Limit switches enabled")

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
                   delay: float = 0.001, check_limits: bool = True) -> Tuple[int, LimitSwitchState]:
        """
        Move a specific motor

        Args:
            motor_id: Motor number (1-4)
            steps: Number of steps
            direction: Direction to move
            delay: Step delay in seconds
            check_limits: If True, stop when limit switch is triggered

        Returns:
            Tuple of (steps_completed, limit_state)
        """
        motor = self.get_motor(motor_id)
        return motor.step(direction, steps, delay, check_limits)

    def move_motor_until_limit(self, motor_id: int, direction: Direction,
                                delay: float = 0.001, max_steps: int = 50000) -> Tuple[int, bool]:
        """
        Move a motor until its limit switch is triggered

        Args:
            motor_id: Motor number (1-4)
            direction: Direction to move
            delay: Step delay in seconds
            max_steps: Maximum steps (safety limit)

        Returns:
            Tuple of (steps_taken, limit_reached)
        """
        motor = self.get_motor(motor_id)
        return motor.move_until_limit(direction, delay, max_steps)

    def move_multiple(self, movements: List[Tuple[int, int, Direction, float]]):
        """
        Execute movements for multiple motors sequentially

        Args:
            movements: List of (motor_id, steps, direction, delay) tuples
        """
        for motor_id, steps, direction, delay in movements:
            self.move_motor(motor_id, steps, direction, delay)

    def check_limit_switch(self, motor_id: int, limit_type: str = 'both') -> dict:
        """
        Check limit switch status for a motor

        Args:
            motor_id: Motor number (1-4)
            limit_type: 'min', 'max', or 'both'

        Returns:
            Dict with limit switch states
        """
        motor = self.get_motor(motor_id)
        result = {'motor_id': motor_id}

        if limit_type in ['min', 'both']:
            result['min_triggered'] = motor.check_min_limit()
        if limit_type in ['max', 'both']:
            result['max_triggered'] = motor.check_max_limit()

        return result

    def check_all_limit_switches(self) -> dict:
        """
        Check all limit switches for all motors

        Returns:
            Dict with limit switch states for each motor
        """
        return {
            motor_id: {
                'min': motor.check_min_limit(),
                'max': motor.check_max_limit(),
                'state': motor.get_limit_state().name
            }
            for motor_id, motor in self.motors.items()
        }

    def home_motor(self, motor_id: int, delay: float = 0.001, max_steps: int = 50000) -> bool:
        """
        Home a specific motor using its limit switch

        Args:
            motor_id: Motor number (1-4)
            delay: Step delay in seconds
            max_steps: Maximum steps (safety limit)

        Returns:
            True if homing successful
        """
        motor = self.get_motor(motor_id)
        return motor.home(delay, max_steps)

    def home_all(self, home_sequence: List[Tuple[int, int, Direction]] = None,
                 use_limits: bool = True, delay: float = 0.001, max_steps: int = 50000):
        """
        Home all motors to starting position

        Args:
            home_sequence: Optional list of (motor_id, steps, direction) for manual homing
            use_limits: If True, use limit switches for homing
            delay: Step delay in seconds
            max_steps: Maximum steps (safety limit)
        """
        if home_sequence is None:
            print("Homing all motors...")
            if use_limits and self.use_limit_switches:
                # Home using limit switches
                for motor_id in self.motors:
                    motor = self.get_motor(motor_id)
                    if motor.limit_min_pin is not None:
                        motor.home(delay, max_steps)
                    else:
                        # No limit switch, just reset position
                        motor.reset_position()
                        print(f"  {motor.name} position reset (no limit switch)")
            else:
                # Just reset positions
                for motor_id in self.motors:
                    motor = self.get_motor(motor_id)
                    motor.reset_position()
                    print(f"  {motor.name} position reset")
        else:
            for motor_id, steps, direction in home_sequence:
                self.move_motor(motor_id, steps, direction, delay)
                self.get_motor(motor_id).reset_position()

    def stop_all(self):
        """Stop and de-energize all motors"""
        for motor in self.motors.values():
            motor.request_stop()
            motor.stop()
        print("All motors stopped")

    def get_all_positions(self) -> dict:
        """Get current positions of all motors"""
        return {
            motor_id: motor.get_position()
            for motor_id, motor in self.motors.items()
        }

    def get_all_limit_states(self) -> dict:
        """Get limit switch states for all motors"""
        return {
            motor_id: motor.get_limit_state().name
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
    # Create controller with limit switches enabled
    controller = StepperController(use_limit_switches=True)

    try:
        # Example 1: Check all limit switches
        print("\nChecking all limit switches...")
        limit_states = controller.check_all_limit_switches()
        for motor_id, states in limit_states.items():
            print(f"  Motor {motor_id}: min={states['min']}, max={states['max']}, state={states['state']}")

        # Example 2: Move motor 1 forward 100 steps (will stop at limit switch)
        print("\nMoving Motor 1 forward 100 steps...")
        steps_done, limit_state = controller.move_motor(1, 100, Direction.CLOCKWISE, delay=0.002)
        print(f"  Completed {steps_done} steps, limit state: {limit_state.name}")

        # Example 3: Move motor 2 backward 50 steps
        print("Moving Motor 2 backward 50 steps...")
        steps_done, limit_state = controller.move_motor(2, 50, Direction.COUNTERCLOCKWISE, delay=0.002)
        print(f"  Completed {steps_done} steps, limit state: {limit_state.name}")

        # Example 4: Rotate motor 3 by 90 degrees
        print("Rotating Motor 3 by 90 degrees...")
        motor3 = controller.get_motor(3)
        motor3.rotate_degrees(90, Direction.CLOCKWISE)

        # Example 5: Sequential movements
        print("\nExecuting sequential movements...")
        test_movements = [
            (1, 50, Direction.CLOCKWISE, 0.002),
            (2, 50, Direction.CLOCKWISE, 0.002),
            (3, 50, Direction.CLOCKWISE, 0.002),
            (4, 50, Direction.CLOCKWISE, 0.002)
        ]
        controller.move_multiple(test_movements)

        # Show positions
        print("\nCurrent positions:", controller.get_all_positions())
        print("Limit states:", controller.get_all_limit_states())

        # Example 6: Home motor 1 using limit switch
        print("\nHoming motor 1 using limit switch...")
        success = controller.home_motor(1, delay=0.002)
        print(f"  Homing {'successful' if success else 'failed'}")

        # Example 7: Home all motors using limit switches
        print("\nHoming all motors using limit switches...")
        controller.home_all(use_limits=True)

    except KeyboardInterrupt:
        print("\nInterrupted by user")
    finally:
        # Always cleanup
        controller.cleanup()
