"""
Pipetting Controller for Laboratory Sampler
Handles coordinate mapping and pipetting workflows
"""

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Tuple, Optional

from stepper_control import StepperController, Direction


@dataclass
class WellCoordinates:
    """Physical coordinates for a well position"""
    x: float  # mm from origin
    y: float  # mm from origin
    z: float  # mm depth (0 = top of well)


@dataclass
class PipettingStep:
    """Single step in a pipetting sequence"""
    pickup_well: str
    dropoff_well: str
    rinse_well: Optional[str]
    volume_ml: float
    wait_time: int
    cycles: int = 1
    repetition_mode: str = 'quantity'  # 'quantity' or 'timeFrequency'
    repetition_quantity: int = 1
    repetition_interval: Optional[int] = None  # seconds
    repetition_duration: Optional[int] = None  # seconds
    pipette_count: int = 3  # 1 or 3 pipettes (default: 3)


class CoordinateMapper:
    """Maps well positions to physical coordinates"""

    # Well plate configuration from CLAUDE.md
    ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    COLUMNS = list(range(1, 13))  # 1-12

    # Physical dimensions - read from environment variables with fallback to default values
    WELL_SPACING = float(os.getenv('WELL_SPACING', '4.0'))  # mm between wells
    WELL_DIAMETER = float(os.getenv('WELL_DIAMETER', '8.0'))  # mm
    WELL_HEIGHT = float(os.getenv('WELL_HEIGHT', '14.0'))  # mm

    # Motor configuration (steps per mm - adjust based on your stepper setup)
    # Read from environment variables with fallback to default values
    STEPS_PER_MM_X = int(os.getenv('STEPS_PER_MM_X', '100'))  # Adjust based on calibration
    STEPS_PER_MM_Y = int(os.getenv('STEPS_PER_MM_Y', '100'))  # Adjust based on calibration
    STEPS_PER_MM_Z = int(os.getenv('STEPS_PER_MM_Z', '100'))  # Adjust based on calibration

    # Origin offset (position of well A1)
    ORIGIN_X = 0.0  # mm
    ORIGIN_Y = 0.0  # mm

    @staticmethod
    def coordinates_to_well(coords: WellCoordinates) -> Optional[str]:
        """
        Convert physical coordinates back to well ID

        Args:
            coords: WellCoordinates with x, y position

        Returns:
            Well ID (e.g., 'A1') or None if not at a well position
        """
        # Calculate which column based on X coordinate
        x_offset = coords.x - CoordinateMapper.ORIGIN_X
        well_pitch_x = CoordinateMapper.WELL_DIAMETER + CoordinateMapper.WELL_SPACING
        column_index = round(x_offset / well_pitch_x)

        # Calculate which row based on Y coordinate
        y_offset = coords.y - CoordinateMapper.ORIGIN_Y
        well_pitch_y = CoordinateMapper.WELL_DIAMETER + CoordinateMapper.WELL_SPACING
        row_index = round(y_offset / well_pitch_y)

        # Validate indices are within bounds
        if 0 <= row_index < len(CoordinateMapper.ROWS) and 0 <= column_index < len(CoordinateMapper.COLUMNS):
            row = CoordinateMapper.ROWS[row_index]
            column = CoordinateMapper.COLUMNS[column_index]
            return f"{row}{column}"

        return None

    @staticmethod
    def parse_well(well_id: str) -> Tuple[str, int]:
        """
        Parse well identifier into row and column

        Args:
            well_id: Well identifier (e.g., 'A12', 'H1')

        Returns:
            Tuple of (row, column)
        """
        if not well_id or len(well_id) < 2:
            raise ValueError(f"Invalid well ID: {well_id}")

        row = well_id[0].upper()
        try:
            column = int(well_id[1:])
        except ValueError:
            raise ValueError(f"Invalid column in well ID: {well_id}")

        if row not in CoordinateMapper.ROWS:
            raise ValueError(f"Invalid row '{row}'. Must be A-H")
        if column not in CoordinateMapper.COLUMNS:
            raise ValueError(f"Invalid column {column}. Must be 1-12")

        return row, column

    @staticmethod
    def well_to_coordinates(well_id: str) -> WellCoordinates:
        """
        Convert well ID to physical coordinates

        Args:
            well_id: Well identifier (e.g., 'A12')

        Returns:
            WellCoordinates with x, y, z positions
        """
        row, column = CoordinateMapper.parse_well(well_id)

        # Calculate row index (A=0, B=1, etc.)
        row_index = CoordinateMapper.ROWS.index(row)

        # Calculate column index (1=0, 2=1, etc.)
        column_index = column - 1

        # Calculate physical coordinates
        # X increases with column number
        x = CoordinateMapper.ORIGIN_X + (
                    column_index * (CoordinateMapper.WELL_DIAMETER + CoordinateMapper.WELL_SPACING))

        # Y increases with row letter (A to H)
        y = CoordinateMapper.ORIGIN_Y + (row_index * (CoordinateMapper.WELL_DIAMETER + CoordinateMapper.WELL_SPACING))

        # Z is at top of well (0), adjust during pipetting
        z = 0.0

        return WellCoordinates(x=x, y=y, z=z)

    @staticmethod
    def coordinates_to_steps(coords: WellCoordinates) -> Tuple[int, int, int]:
        """
        Convert physical coordinates to motor steps

        Args:
            coords: WellCoordinates

        Returns:
            Tuple of (x_steps, y_steps, z_steps)
        """
        x_steps = int(coords.x * CoordinateMapper.STEPS_PER_MM_X)
        y_steps = int(coords.y * CoordinateMapper.STEPS_PER_MM_Y)
        z_steps = int(coords.z * CoordinateMapper.STEPS_PER_MM_Z)

        return x_steps, y_steps, z_steps


class PipettingController:
    """High-level controller for pipetting operations"""

    # Pipette parameters - read from environment variables with fallback to default values
    PIPETTE_STEPS_PER_ML = int(
        os.getenv('PIPETTE_STEPS_PER_ML', '1000'))  # Steps to aspirate/dispense 1mL (adjust based on syringe)
    PICKUP_DEPTH = float(os.getenv('PICKUP_DEPTH', '10.0'))  # mm to descend into well for pickup
    DROPOFF_DEPTH = float(os.getenv('DROPOFF_DEPTH', '5.0'))  # mm to descend into well for dropoff
    SAFE_HEIGHT = float(os.getenv('SAFE_HEIGHT', '20.0'))  # mm above well for travel
    RINSE_CYCLES = int(os.getenv('RINSE_CYCLES', '3'))  # Number of rinse cycles

    # Movement speeds - read from environment variables with fallback to default values
    TRAVEL_SPEED = float(os.getenv('TRAVEL_SPEED', '0.001'))  # Fast movement delay (seconds between steps)
    PIPETTE_SPEED = float(os.getenv('PIPETTE_SPEED', '0.002'))  # Slower for pipetting operations

    # Position persistence
    POSITION_FILE = Path(__file__).parent / "pipette_position.json"

    def __init__(self):
        """Initialize the pipetting controller"""
        self.stepper_controller = StepperController()
        self.mapper = CoordinateMapper()
        self.stop_requested = False
        self.log_buffer = []  # Store log messages for UI display
        self.max_logs = 100  # Maximum number of logs to keep
        self.current_pipette_count = 1  # Current pipette configuration (default: 1)
        self.current_operation = "idle"  # Current operation: idle, moving, aspirating, dispensing
        self.operation_well = None  # Well where current operation is happening

        # Load last known position or default to home (A1)
        self.current_position, self.current_pipette_count = self.load_position()
        self.log(f"Pipetting controller initialized at position: {self.get_current_well() or 'Unknown'}")
        self.log(f"Pipette configuration: {self.current_pipette_count} pipette(s)")

    def log(self, message: str):
        """Log a message to both console and buffer for UI display"""
        import datetime
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {message}"

        # Print to console
        print(log_entry)

        # Add to buffer
        self.log_buffer.append(log_entry)

        # Keep buffer size limited
        if len(self.log_buffer) > self.max_logs:
            self.log_buffer.pop(0)

    def get_logs(self, last_n: int = 50) -> list:
        """Get the last N log messages"""
        return self.log_buffer[-last_n:] if self.log_buffer else []

    def clear_logs(self):
        """Clear the log buffer"""
        self.log_buffer.clear()

    def save_position(self):
        """Save current position and pipette count to file for recovery after interruption"""
        try:
            position_data = {
                "x": self.current_position.x,
                "y": self.current_position.y,
                "z": self.current_position.z,
                "well": self.get_current_well(),
                "pipette_count": self.current_pipette_count
            }
            with open(self.POSITION_FILE, 'w') as f:
                json.dump(position_data, f, indent=2)
        except Exception as e:
            print(f"Warning: Could not save position to file: {e}")

    def load_position(self) -> tuple[WellCoordinates, int]:
        """Load last known position and pipette count from file"""
        try:
            if self.POSITION_FILE.exists():
                with open(self.POSITION_FILE, 'r') as f:
                    position_data = json.load(f)
                # Note: can't use self.log here as it's called before __init__ completes
                print(f"Loaded last position from file: {position_data.get('well', 'Unknown')}")
                pipette_count = position_data.get('pipette_count', 1)  # Default to 1 if not found
                print(f"Loaded pipette configuration: {pipette_count} pipette(s)")
                return (
                    WellCoordinates(
                        x=position_data.get('x', 0.0),
                        y=position_data.get('y', 0.0),
                        z=position_data.get('z', 0.0)
                    ),
                    pipette_count
                )
        except Exception as e:
            print(f"Warning: Could not load position from file: {e}")

        # Default to home position (A1) with 1 pipette
        print("Using default home position (A1) and 1 pipette")
        return WellCoordinates(x=0.0, y=0.0, z=0.0), 1

    def move_to_well(self, well_id: str, z_offset: float = 0.0):
        """
        Move to a specific well position

        Args:
            well_id: Well identifier (e.g., 'A12')
            z_offset: Additional Z offset in mm (negative goes down)
        """
        self.current_operation = "moving"
        self.operation_well = well_id
        self.log(f"Moving to well {well_id}...")

        # Get target coordinates
        target_coords = self.mapper.well_to_coordinates(well_id)
        target_coords.z += z_offset

        # Convert to steps
        target_steps = self.mapper.coordinates_to_steps(target_coords)
        current_steps = self.mapper.coordinates_to_steps(self.current_position)

        # Calculate relative movements
        x_delta = target_steps[0] - current_steps[0]
        y_delta = target_steps[1] - current_steps[1]
        z_delta = target_steps[2] - current_steps[2]

        # Move Z up to safe height first (if moving down)
        if z_delta < 0:
            safe_z_steps = int(self.SAFE_HEIGHT * self.mapper.STEPS_PER_MM_Z)
            self.stepper_controller.move_motor(3, safe_z_steps, Direction.CLOCKWISE, self.TRAVEL_SPEED)

        # Move X and Y
        if x_delta != 0:
            direction = Direction.CLOCKWISE if x_delta > 0 else Direction.COUNTERCLOCKWISE
            self.stepper_controller.move_motor(1, abs(x_delta), direction, self.TRAVEL_SPEED)

        if y_delta != 0:
            direction = Direction.CLOCKWISE if y_delta > 0 else Direction.COUNTERCLOCKWISE
            self.stepper_controller.move_motor(2, abs(y_delta), direction, self.TRAVEL_SPEED)

        # Move Z to target position
        if z_delta != 0:
            # Account for safe height movement
            if z_delta < 0:
                total_z = abs(z_delta) + int(self.SAFE_HEIGHT * self.mapper.STEPS_PER_MM_Z)
                self.stepper_controller.move_motor(3, total_z, Direction.COUNTERCLOCKWISE, self.TRAVEL_SPEED)
            else:
                self.stepper_controller.move_motor(3, abs(z_delta), Direction.CLOCKWISE, self.TRAVEL_SPEED)

        # Update current position
        self.current_position = target_coords
        self.log(f"  Arrived at {well_id} (X={target_coords.x:.1f}, Y={target_coords.y:.1f}, Z={target_coords.z:.1f})")

        self.current_operation = "idle"
        self.operation_well = None

        # Save position to file for recovery
        self.save_position()

    def aspirate(self, volume_ml: float):
        """
        Aspirate liquid into pipette

        Args:
            volume_ml: Volume to aspirate in mL
        """
        self.current_operation = "aspirating"
        self.operation_well = self.get_current_well()
        self.log(f"  Aspirating {volume_ml} mL...")
        steps = int(volume_ml * self.PIPETTE_STEPS_PER_ML)
        self.stepper_controller.move_motor(4, steps, Direction.CLOCKWISE, self.PIPETTE_SPEED)
        time.sleep(0.5)  # Allow liquid to settle
        self.current_operation = "idle"
        self.operation_well = None

    def dispense(self, volume_ml: float):
        """
        Dispense liquid from pipette

        Args:
            volume_ml: Volume to dispense in mL
        """
        self.current_operation = "dispensing"
        self.operation_well = self.get_current_well()
        self.log(f"  Dispensing {volume_ml} mL...")
        steps = int(volume_ml * self.PIPETTE_STEPS_PER_ML)
        self.stepper_controller.move_motor(4, steps, Direction.COUNTERCLOCKWISE, self.PIPETTE_SPEED)
        time.sleep(0.5)  # Allow liquid to settle
        self.current_operation = "idle"
        self.operation_well = None

    def rinse(self, rinse_well: str, volume_ml: float):
        """
        Rinse the pipette tip

        Args:
            rinse_well: Well ID containing rinse solution
            :param volume_ml:
        """
        self.log(f"  Rinsing in well {rinse_well}...")
        steps = int(volume_ml * self.PIPETTE_STEPS_PER_ML)
        for i in range(self.RINSE_CYCLES):
            # Move to rinse well
            self.move_to_well(rinse_well, -self.PICKUP_DEPTH)

            # Aspirate rinse solution
            self.aspirate(steps)  # Use half volume for rinsing

            # Dispense
            self.dispense(steps)

        # Move back up
        self.move_to_well(rinse_well, 0)

    def execute_transfer(self, pickup_well: str, dropoff_well: str,
                         volume_ml: float, rinse_well: Optional[str] = None):
        """
        Execute a single liquid transfer

        Args:
            pickup_well: Source well ID
            dropoff_well: Destination well ID
            volume_ml: Volume to transfer in mL
            rinse_well: Optional well for rinsing after transfer
        """
        self.log(f"Transfer: {pickup_well} -> {dropoff_well} ({volume_ml} mL)")

        # Move to pickup well and aspirate
        self.move_to_well(pickup_well, -self.PICKUP_DEPTH)
        self.aspirate(volume_ml)

        # Raise pipette
        self.move_to_well(pickup_well, 0)

        # Move to dropoff well and dispense
        self.move_to_well(dropoff_well, -self.DROPOFF_DEPTH)
        self.dispense(volume_ml)

        # Raise pipette
        self.move_to_well(dropoff_well, 0)

        # Rinse if specified
        if rinse_well:
            self.rinse(rinse_well, volume_ml)

    def execute_step_with_cycles(self, step: PipettingStep):
        """
        Execute a single step with its cycles

        Args:
            step: PipettingStep object
        """
        for cycle in range(step.cycles):
            # Check for stop request during cycles
            if self.stop_requested:
                return False

            if step.cycles > 1:
                self.log(f"  Cycle {cycle + 1}/{step.cycles}")

            # Execute transfer
            self.execute_transfer(
                step.pickup_well,
                step.dropoff_well,
                step.volume_ml,
                step.rinse_well
            )

            # Wait between cycles
            if step.wait_time > 0 and cycle < step.cycles - 1:
                self.log(f"  Waiting {step.wait_time} seconds...")
                time.sleep(step.wait_time)

        return True

    def execute_sequence(self, steps: list[PipettingStep]):
        """
        Execute a complete pipetting sequence

        Args:
            steps: List of PipettingStep objects
        """
        # Reset stop flag at the start
        self.stop_requested = False

        self.log("=" * 60)
        self.log(f"EXECUTING PIPETTING SEQUENCE ({len(steps)} steps)")
        self.log("=" * 60)

        for step_num, step in enumerate(steps, 1):
            # Check for stop request
            if self.stop_requested:
                self.log("=" * 60)
                self.log("EXECUTION STOPPED BY USER")
                self.log(f"Completed {step_num - 1} of {len(steps)} steps")
                self.log("=" * 60)
                self.stop_requested = False
                return

            self.log(f"--- Step {step_num}/{len(steps)} ---")
            self.log(f"Pipette Configuration: {step.pipette_count} pipette(s)")

            # Update current pipette configuration
            self.current_pipette_count = step.pipette_count

            # Handle repetition based on mode
            if step.repetition_mode == 'quantity':
                # Quantity mode: repeat N times
                self.log(f"Repetition: {step.repetition_quantity} time(s)")

                for rep in range(step.repetition_quantity):
                    if self.stop_requested:
                        break

                    if step.repetition_quantity > 1:
                        self.log(f"Repetition {rep + 1}/{step.repetition_quantity}")

                    # Execute the step with all its cycles
                    if not self.execute_step_with_cycles(step):
                        break

                    # Wait between repetitions (except after the last one)
                    if rep < step.repetition_quantity - 1:
                        if step.wait_time > 0:
                            self.log(f"  Waiting {step.wait_time} seconds before next repetition...")
                            time.sleep(step.wait_time)

            elif step.repetition_mode == 'timeFrequency':
                # Time frequency mode: repeat at intervals for a duration
                if step.repetition_interval and step.repetition_duration:
                    total_reps = int(step.repetition_duration / step.repetition_interval)
                    self.log(
                        f"Repetition: Every {step.repetition_interval}s for {step.repetition_duration}s ({total_reps} times)")

                    start_time = time.time()
                    rep_count = 0

                    while (time.time() - start_time) < step.repetition_duration:
                        if self.stop_requested:
                            break

                        rep_count += 1
                        self.log(f"Repetition {rep_count}/{total_reps}")

                        # Execute the step with all its cycles
                        if not self.execute_step_with_cycles(step):
                            break

                        # Calculate time until next repetition
                        elapsed = time.time() - start_time
                        next_execution_time = rep_count * step.repetition_interval
                        remaining_time = next_execution_time - elapsed

                        # Only wait if we haven't exceeded the duration and there's time left
                        if remaining_time > 0 and elapsed < step.repetition_duration:
                            self.log(f"  Waiting {remaining_time:.1f} seconds until next repetition...")
                            time.sleep(min(remaining_time, step.repetition_duration - elapsed))
                else:
                    self.log("Warning: Time frequency mode selected but interval/duration not specified")
                    # Fall back to single execution
                    self.execute_step_with_cycles(step)

            else:
                # Unknown mode, execute once
                self.log(f"Warning: Unknown repetition mode '{step.repetition_mode}', executing once")
                self.execute_step_with_cycles(step)

            # Check for stop after step completion
            if self.stop_requested:
                self.log("=" * 60)
                self.log("EXECUTION STOPPED BY USER")
                self.log(f"Completed {step_num} of {len(steps)} steps")
                self.log("=" * 60)
                self.stop_requested = False
                return

            # Wait before next step (if not the last step)
            if step.wait_time > 0 and step_num < len(steps):
                self.log(f"  Waiting {step.wait_time} seconds before next step...")
                time.sleep(step.wait_time)

        self.log("=" * 60)
        self.log("SEQUENCE COMPLETE")
        self.log("=" * 60)

    def stop(self):
        """Request to stop the current execution"""
        self.log("Stop requested...")
        self.stop_requested = True
        self.stepper_controller.stop_all()

    def home(self):
        """Return to home position (well A1)"""
        self.log("Returning to home position (well A1)...")

        # First, raise Z to safe height if needed
        if self.current_position.z < 0:
            safe_z_steps = int(abs(self.current_position.z) * self.mapper.STEPS_PER_MM_Z)
            self.stepper_controller.move_motor(3, safe_z_steps, Direction.CLOCKWISE, self.TRAVEL_SPEED)

        # Move to well A1 (home position)
        self.move_to_well("A1", 0)

        # Reset position tracking
        self.current_position = WellCoordinates(x=0, y=0, z=0)
        self.save_position()
        self.log("Home position reached (A1)")

    def get_current_well(self) -> Optional[str]:
        """
        Get the current well position of the pipette/gripper

        Returns:
            Well ID (e.g., 'A1') or None if not at a well
        """
        return self.mapper.coordinates_to_well(self.current_position)

    def set_pipette_count(self, count: int):
        """
        Set the current pipette configuration

        Args:
            count: Number of pipettes (1 or 3)
        """
        if count not in [1, 3]:
            raise ValueError("Pipette count must be 1 or 3")

        self.current_pipette_count = count
        self.log(f"Pipette configuration changed to: {count} pipette(s)")
        self.save_position()  # Save the new configuration

    def cleanup(self):
        """Clean up resources"""
        self.stepper_controller.cleanup()


# Example usage
if __name__ == "__main__":
    # Create controller
    controller = PipettingController()

    try:
        # Example: Transfer from A12 to A15 with quantity repetition
        step = PipettingStep(
            pickup_well="A12",
            dropoff_well="B3",
            rinse_well="H12",
            volume_ml=1.0,
            wait_time=2,
            cycles=1,
            repetition_mode='quantity',
            repetition_quantity=3,
            pipette_count=3  # Using 3 pipettes
        )

        controller.execute_sequence([step])

        # Return home
        controller.home()

    except KeyboardInterrupt:
        print("\nInterrupted by user")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        controller.cleanup()
