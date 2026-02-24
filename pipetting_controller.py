"""
Pipetting Controller for Laboratory Sampler
Handles coordinate mapping and pipetting workflows
"""

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Tuple, Optional

import settings
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
    """Maps well positions to physical coordinates - supports multiple layout types"""

    # Well plate configuration from CLAUDE.md (default/legacy layout)
    ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    COLUMNS = list(range(1, 13))  # 1-12

    # Physical dimensions - read from config.json at import time
    WELL_SPACING = settings.get('WELL_SPACING')   # mm between wells
    WELL_DIAMETER = settings.get('WELL_DIAMETER')  # mm
    WELL_HEIGHT = settings.get('WELL_HEIGHT')      # mm

    # Motor configuration (steps per mm - adjust based on your stepper setup)
    STEPS_PER_MM_X = settings.get('STEPS_PER_MM_X')  # Adjust based on calibration
    STEPS_PER_MM_Y = settings.get('STEPS_PER_MM_Y')  # Adjust based on calibration
    STEPS_PER_MM_Z = settings.get('STEPS_PER_MM_Z')  # Adjust based on calibration

    # Origin offset (position of well A1)
    ORIGIN_X = 0.0  # mm
    ORIGIN_Y = 0.0  # mm

    # Vial Layout physical dimensions - read from config.json at import time
    SMALL_WELL_SPACING = settings.get('VIAL_WELL_SPACING')   # mm between small wells
    VIAL_WELL_DIAMETER = settings.get('VIAL_WELL_DIAMETER')  # mm
    VIAL_WELL_HEIGHT   = settings.get('VIAL_WELL_HEIGHT')    # mm

    # Layout-specific coordinate mappings
    # MicroChip Layout coordinates (non-WS entries only; WS computed dynamically)
    MICROCHIP_COORDS = {
        # MicroChips (bottom)
        'MC1': (80, 300, 0),
        'MC2': (140, 300, 0),
        'MC3': (200, 300, 0),
        'MC4': (260, 300, 0),
        'MC5': (320, 300, 0),
    }

    # Vial Layout coordinates (non-WS entries only)
    WELLPLATE_COORDS = {}

    @staticmethod
    def _ws_coordinates(station: str) -> WellCoordinates:
        """Compute WS1/WS2 center coordinates from current config values."""
        ws_offset_y = settings.get('WS_OFFSET_Y')
        ws_height   = settings.get('WS_HEIGHT')
        ws_width    = settings.get('WS_WIDTH')
        ws_gap      = settings.get('WS_GAP')

        center_x = ws_width / 2
        if station == 'WS1':
            center_y = ws_offset_y + ws_height / 2
        else:  # WS2
            center_y = ws_offset_y + ws_height + ws_gap + ws_height / 2

        return WellCoordinates(x=center_x, y=center_y, z=0.0)

    @staticmethod
    def coordinates_to_well(coords: WellCoordinates) -> Optional[str]:
        """
        Convert physical coordinates back to well ID

        Args:
            coords: WellCoordinates with x, y position

        Returns:
            Well ID (e.g., 'A1') or None if not at a well position
        """
        # Check if at a washing station position
        for ws_id in ('WS1', 'WS2'):
            ws_coords = CoordinateMapper._ws_coordinates(ws_id)
            if abs(coords.x - ws_coords.x) < 1.0 and abs(coords.y - ws_coords.y) < 1.0:
                return ws_id

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
            well_id: Well identifier (e.g., 'A12', 'H1', 'A15')

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
        # Extended range for MicroChip layout (up to 15 columns)
        if column < 1 or column > 15:
            raise ValueError(f"Invalid column {column}. Must be 1-15")

        return row, column

    @staticmethod
    def well_to_coordinates(well_id: str) -> WellCoordinates:
        """
        Convert well ID to physical coordinates - supports multiple layout types

        Args:
            well_id: Well identifier (e.g., 'A12', 'R1', 'V3', 'LA1', 'SA2')

        Returns:
            WellCoordinates with x, y, z positions
        """
        # Washing stations — computed dynamically from config
        if well_id in ('WS1', 'WS2'):
            return CoordinateMapper._ws_coordinates(well_id)

        # Check for MicroChip layout special wells
        if well_id in CoordinateMapper.MICROCHIP_COORDS:
            coords = CoordinateMapper.MICROCHIP_COORDS[well_id]
            return WellCoordinates(x=coords[0], y=coords[1], z=coords[2])

        # Check for WellPlate layout special wells
        if well_id in CoordinateMapper.WELLPLATE_COORDS:
            coords = CoordinateMapper.WELLPLATE_COORDS[well_id]
            return WellCoordinates(x=coords[0], y=coords[1], z=coords[2])

        # Handle Vial Layout vials (VA1, VA2, etc.)
        if well_id.startswith('V') and len(well_id) >= 3:
            row_char = well_id[1]
            col_num = int(well_id[2:])
            # Vials: 5 rows (A-E) x 3 columns
            vial_rows = ['A', 'B', 'C', 'D', 'E']
            if row_char in vial_rows and 1 <= col_num <= 3:
                row_index = vial_rows.index(row_char)
                col_index = col_num - 1
                # Vials positioned on left side, aligned with small well grid
                # 1 vial = 2 small wells in height
                vial_spacing_y = 2 * CoordinateMapper.SMALL_WELL_SPACING  # 2 * 45 = 90mm
                x = CoordinateMapper.ORIGIN_X + 20 + (col_index * vial_spacing_y)  # Same spacing in X
                y = CoordinateMapper.ORIGIN_Y + 60 + (row_index * vial_spacing_y)  # 90mm spacing in Y
                return WellCoordinates(x=x, y=y, z=0.0)

        # Handle WellPlate small wells (SA1, SA2, etc.)
        if well_id.startswith('S') and len(well_id) >= 3:
            row_char = well_id[1]
            col_num = int(well_id[2:])
            # Small wells: 12 rows (A-L) x 6 columns
            small_well_rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
            if row_char in small_well_rows and 1 <= col_num <= 6:
                row_index = small_well_rows.index(row_char)
                col_index = col_num - 1
                # Small wells positioned on right side
                x = CoordinateMapper.ORIGIN_X + 280 + (col_index * CoordinateMapper.SMALL_WELL_SPACING)
                y = CoordinateMapper.ORIGIN_Y + 60 + (row_index * CoordinateMapper.SMALL_WELL_SPACING)
                return WellCoordinates(x=x, y=y, z=0.0)

        # Standard well format (A1-H15 for MicroChip, A1-H12 for legacy)
        try:
            row, column = CoordinateMapper.parse_well(well_id)

            # Calculate row index (A=0, B=1, etc.)
            row_index = CoordinateMapper.ROWS.index(row)

            # Calculate column index (1=0, 2=1, etc.)
            column_index = column - 1

            # For MicroChip layout (8x15), wells start at offset
            # For legacy layout (8x12), use standard spacing
            well_offset_x = 70   # A1 is 70mm to the right of home
            well_offset_y = 15   # A1 is 15mm up from home

            # Calculate physical coordinates
            # X increases with column number
            x = CoordinateMapper.ORIGIN_X + well_offset_x + (
                    column_index * CoordinateMapper.WELL_SPACING)

            # Y increases with row letter (A to H)
            y = CoordinateMapper.ORIGIN_Y + well_offset_y + (
                row_index * CoordinateMapper.WELL_SPACING)

            # Z is at top of well (0), adjust during pipetting
            z = 0.0

            return WellCoordinates(x=x, y=y, z=z)
        except (ValueError, IndexError):
            raise ValueError(f"Invalid well ID: {well_id}")

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

    # Pipette parameters - read from config.json at import time
    PIPETTE_STEPS_PER_ML = settings.get('PIPETTE_STEPS_PER_ML')  # Steps to aspirate/dispense 1mL
    PICKUP_DEPTH  = settings.get('PICKUP_DEPTH')   # mm to descend into well for pickup
    DROPOFF_DEPTH = settings.get('DROPOFF_DEPTH')  # mm to descend into well for dropoff
    SAFE_HEIGHT   = settings.get('SAFE_HEIGHT')    # mm above well for travel
    RINSE_CYCLES  = settings.get('RINSE_CYCLES')   # Number of rinse cycles

    # Movement speeds - read from config.json at import time
    TRAVEL_SPEED  = settings.get('TRAVEL_SPEED')   # Fast movement delay (seconds between steps)
    PIPETTE_SPEED = settings.get('PIPETTE_SPEED')  # Slower for pipetting operations

    # Motor inversion flags - flip physical direction for reversed-mounted motors
    INVERT_X       = settings.get('INVERT_X')
    INVERT_Y       = settings.get('INVERT_Y')
    INVERT_Z       = settings.get('INVERT_Z')
    INVERT_PIPETTE = settings.get('INVERT_PIPETTE')

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
        self.layout_type = "microchip"  # Current layout type: microchip or wellplate

        # Load last known position or default to home (WS1 - Washing Station 1)
        self.current_position, self.current_pipette_count, self.layout_type = self.load_position()
        self.log(f"Pipetting controller initialized at position: {self.get_current_well() or 'Unknown'}")
        self.log(f"Pipette configuration: {self.current_pipette_count} pipette(s)")

    @staticmethod
    def _inv(direction: Direction, invert: bool) -> Direction:
        """Flip direction if the invert flag is set (for reversed-mounted motors)."""
        if invert:
            return Direction.COUNTERCLOCKWISE if direction == Direction.CLOCKWISE else Direction.CLOCKWISE
        return direction

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
        """Save current position, pipette count, and layout type to file for recovery after interruption"""
        try:
            position_data = {
                "x": self.current_position.x,
                "y": self.current_position.y,
                "z": self.current_position.z,
                "well": self.get_current_well(),
                "pipette_count": self.current_pipette_count,
                "layout_type": self.layout_type
            }
            with open(self.POSITION_FILE, 'w') as f:
                json.dump(position_data, f, indent=2)
        except Exception as e:
            print(f"Warning: Could not save position to file: {e}")

    def load_position(self) -> tuple[WellCoordinates, int, str]:
        """Load last known position, pipette count, and layout type from file"""
        try:
            if self.POSITION_FILE.exists():
                with open(self.POSITION_FILE, 'r') as f:
                    position_data = json.load(f)
                # Note: can't use self.log here as it's called before __init__ completes
                print(f"Loaded last position from file: {position_data.get('well', 'Unknown')}")
                pipette_count = position_data.get('pipette_count', 1)  # Default to 1 if not found
                layout_type = position_data.get('layout_type', 'microchip')  # Default to microchip
                print(f"Loaded pipette configuration: {pipette_count} pipette(s)")
                print(f"Loaded layout type: {layout_type}")
                return (
                    WellCoordinates(
                        x=position_data.get('x', 0.0),
                        y=position_data.get('y', 0.0),
                        z=position_data.get('z', 0.0)
                    ),
                    pipette_count,
                    layout_type
                )
        except Exception as e:
            print(f"Warning: Could not load position from file: {e}")

        # Default to home position (WS1 - Washing Station 1) with 1 pipette and microchip layout
        print("Using default home position (WS1 - Washing Station 1), 1 pipette, and microchip layout")
        # WS1 coordinates from MICROCHIP_COORDS: (0, 0, 0)
        return WellCoordinates(x=0.0, y=0.0, z=0.0), 1, "microchip"

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
            self.stepper_controller.move_motor(3, safe_z_steps, self._inv(Direction.CLOCKWISE, self.INVERT_Z), self.TRAVEL_SPEED)

        # Move X and Y
        if x_delta != 0:
            direction = self._inv(Direction.CLOCKWISE if x_delta > 0 else Direction.COUNTERCLOCKWISE, self.INVERT_X)
            self.stepper_controller.move_motor(1, abs(x_delta), direction, self.TRAVEL_SPEED)

        if y_delta != 0:
            direction = self._inv(Direction.CLOCKWISE if y_delta > 0 else Direction.COUNTERCLOCKWISE, self.INVERT_Y)
            self.stepper_controller.move_motor(2, abs(y_delta), direction, self.TRAVEL_SPEED)

        # Move Z to target position
        if z_delta != 0:
            # Account for safe height movement
            if z_delta < 0:
                total_z = abs(z_delta) + int(self.SAFE_HEIGHT * self.mapper.STEPS_PER_MM_Z)
                self.stepper_controller.move_motor(3, total_z, self._inv(Direction.COUNTERCLOCKWISE, self.INVERT_Z), self.TRAVEL_SPEED)
            else:
                self.stepper_controller.move_motor(3, abs(z_delta), self._inv(Direction.CLOCKWISE, self.INVERT_Z), self.TRAVEL_SPEED)

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
        self.stepper_controller.move_motor(4, steps, self._inv(Direction.CLOCKWISE, self.INVERT_PIPETTE), self.PIPETTE_SPEED)
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
        self.stepper_controller.move_motor(4, steps, self._inv(Direction.COUNTERCLOCKWISE, self.INVERT_PIPETTE), self.PIPETTE_SPEED)
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
        steps = int(volume_ml)
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

    def _home_axis_to_min(self, motor_id: int, axis_name: str, first_direction: Direction = Direction.CLOCKWISE):
        """
        Home a single axis to its MIN limit switch.
        Tries first_direction, then reverses if it hits MAX instead.
        """
        motor = self.stepper_controller.get_motor(motor_id)

        if motor.check_min_limit():
            self.log(f"{axis_name} axis already at MIN limit")
            motor.reset_position()
            return

        self.log(f"Homing {axis_name} axis to MIN limit...")

        second_direction = Direction.COUNTERCLOCKWISE if first_direction == Direction.CLOCKWISE else Direction.CLOCKWISE

        for direction in [first_direction, second_direction]:
            steps, hit = motor.move_until_limit(direction, self.TRAVEL_SPEED)
            self.log(f"{axis_name} axis: moved {direction.name} {steps} steps, hit {hit}")

            if hit == 'min':
                self.log(f"{axis_name} axis: reached MIN limit")
                motor.reset_position()
                return

            # Hit MAX or no limit — try the other direction
            if hit == 'max':
                self.log(f"{axis_name} axis: hit MAX, reversing...")
                continue

            # 'none' — max steps reached without hitting any limit
            self.log(f"{axis_name} axis: WARNING - no limit found in {direction.name}")

        self.log(f"{axis_name} axis: WARNING - could not reach MIN limit")
        motor.reset_position()

    def home(self):
        """Return to home position by moving X and Y axes to their MIN limit switches"""
        self.log("Homing all axes to MIN limit switches...")

        # Raise Z to safe height first
        self.log("Raising Z to safe height...")
        if self.current_position.z < 0:
            safe_z_steps = int(abs(self.current_position.z) * self.mapper.STEPS_PER_MM_Z)
            self.stepper_controller.move_motor(3, safe_z_steps, self._inv(Direction.CLOCKWISE, self.INVERT_Z), self.TRAVEL_SPEED)
            self.current_position.z = 0.0

        # Home X axis to MIN limit switch (CW goes toward MIN on X)
        self._home_axis_to_min(1, "X", Direction.CLOCKWISE)

        # Home Y axis to MIN limit switch (CCW goes toward MIN on Y)
        self._home_axis_to_min(2, "Y", Direction.COUNTERCLOCKWISE)

        # Position is now at origin (both axes at MIN limits)
        self.current_position = WellCoordinates(x=0.0, y=0.0, z=0.0)
        self.save_position()
        self.log("Home complete - position reset to origin (0, 0, 0)")

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

    def toggle_z(self, direction: str):
        """
        Toggle the Z-axis up or down

        Args:
            direction: 'up' or 'down'
        """
        if direction == 'up':
            # Move Z up by SAFE_HEIGHT
            z_steps = int(self.SAFE_HEIGHT * self.mapper.STEPS_PER_MM_Z)
            self.stepper_controller.move_motor(3, z_steps, self._inv(Direction.CLOCKWISE, self.INVERT_Z), self.TRAVEL_SPEED)
            self.current_position.z += self.SAFE_HEIGHT
            self.log(f"Z-axis moved UP ({self.SAFE_HEIGHT}mm)")
        elif direction == 'down':
            # Move Z down by SAFE_HEIGHT
            z_steps = int(self.SAFE_HEIGHT * self.mapper.STEPS_PER_MM_Z)
            self.stepper_controller.move_motor(3, z_steps, self._inv(Direction.COUNTERCLOCKWISE, self.INVERT_Z), self.TRAVEL_SPEED)
            self.current_position.z -= self.SAFE_HEIGHT
            self.log(f"Z-axis moved DOWN ({self.SAFE_HEIGHT}mm)")
        else:
            raise ValueError("Direction must be 'up' or 'down'")

        self.save_position()

    def move_axis(self, axis: str, steps: int, direction: str) -> dict:
        """
        Move a specific axis by a number of steps

        Args:
            axis: 'x', 'y', 'z', or 'pipette'
            steps: Number of steps to move (positive integer)
            direction: 'cw' (clockwise) or 'ccw' (counterclockwise)

        Returns:
            dict with axis positions
        """
        axis = axis.lower()
        steps = abs(steps)

        # Map axis to motor ID
        axis_motor_map = {
            'x': 1,
            'y': 2,
            'z': 3,
            'pipette': 4
        }

        if axis not in axis_motor_map:
            raise ValueError(f"Invalid axis: {axis}. Must be 'x', 'y', 'z', or 'pipette'")

        motor_id = axis_motor_map[axis]
        invert_map = {'x': self.INVERT_X, 'y': self.INVERT_Y, 'z': self.INVERT_Z, 'pipette': self.INVERT_PIPETTE}
        raw_direction = Direction.CLOCKWISE if direction == 'cw' else Direction.COUNTERCLOCKWISE
        motor_direction = self._inv(raw_direction, invert_map[axis])

        self.log(f"Moving {axis.upper()}-axis: {steps} steps {direction.upper()}")
        self.stepper_controller.move_motor(motor_id, steps, motor_direction, self.TRAVEL_SPEED)

        # Update position tracking for X, Y, Z axes
        if axis == 'x':
            delta = steps / self.mapper.STEPS_PER_MM_X
            self.current_position.x += delta if direction == 'cw' else -delta
        elif axis == 'y':
            delta = steps / self.mapper.STEPS_PER_MM_Y
            self.current_position.y += delta if direction == 'cw' else -delta
        elif axis == 'z':
            delta = steps / self.mapper.STEPS_PER_MM_Z
            self.current_position.z += delta if direction == 'cw' else -delta

        self.save_position()

        # Return current positions
        return self.get_axis_positions()

    def get_axis_positions(self) -> dict:
        """
        Get current positions of all axes

        Returns:
            dict with x, y, z positions in mm and motor step counts
        """
        motor_positions = self.stepper_controller.get_all_positions()
        return {
            'x': round(self.current_position.x, 2),
            'y': round(self.current_position.y, 2),
            'z': round(self.current_position.z, 2),
            'motor_steps': motor_positions
        }

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
