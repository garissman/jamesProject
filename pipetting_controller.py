"""
Pipetting Controller for Laboratory Sampler
Handles coordinate mapping and pipetting workflows
"""

import json
import threading
import time
from dataclasses import dataclass
from enum import IntEnum
from pathlib import Path
from typing import Tuple, Optional

import settings


class Direction(IntEnum):
    """Motor rotation direction — shared enum used by both controller backends."""
    COUNTERCLOCKWISE = 0
    CLOCKWISE = 1


def _create_stepper_controller(controller_type: str):
    """Factory: import and instantiate the right StepperController backend."""
    if controller_type == 'arduino_uno_q':
        from stepper_control_arduino import StepperController
    else:
        from stepper_control import StepperController
    return StepperController()


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
    wash_well: Optional[str] = None
    cycles: int = 1
    repetition_mode: str = 'quantity'  # 'quantity' or 'timeFrequency'
    repetition_quantity: int = 1
    repetition_interval: Optional[int] = None  # seconds
    repetition_duration: Optional[int] = None  # seconds
    pipette_count: int = 3  # 1 or 3 pipettes (default: 3)
    step_type: str = 'pipette'  # 'pipette', 'home', or 'wait'


class CoordinateMapper:
    """Maps well positions to physical coordinates - supports multiple layout types"""

    # Well plate configuration from CLAUDE.md (default/legacy layout)
    ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    COLUMNS = list(range(1, 16))  # 1-15 (extended for MicroChip layout)

    # Motor configuration (steps per mm - adjust based on your stepper setup)
    STEPS_PER_MM_X = settings.get('STEPS_PER_MM_X')
    STEPS_PER_MM_Y = settings.get('STEPS_PER_MM_Y')
    STEPS_PER_MM_Z = settings.get('STEPS_PER_MM_Z')

    # Per-layout stored coordinates (loaded from config.json LAYOUT_COORDINATES)
    LAYOUT_COORDINATES: dict = {}
    CURRENT_LAYOUT: str = "microchip"

    @staticmethod
    def _ws_coordinates(station: str) -> WellCoordinates:
        """Compute WS1/WS2 center coordinates from current config values.
        WS_POSITION_X/Y is the exact target position for WS1.
        WS2 is offset from WS1 by WS_HEIGHT + WS_GAP in Y."""
        ws_pos_x    = settings.get('WS_POSITION_X')
        ws_pos_y    = settings.get('WS_POSITION_Y')
        settings.get('WS_HEIGHT')
        ws_gap      = settings.get('WS_GAP')

        center_x = ws_pos_x
        if station == 'WS1':
            center_y = ws_pos_y
        else:  # WS2
            center_y = ws_pos_y + ws_gap

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
        # Check stored layout coordinates first (per-layout mapping from config.json)
        layout_keys = [CoordinateMapper.CURRENT_LAYOUT]
        if CoordinateMapper.CURRENT_LAYOUT == 'wellplate':
            layout_keys.append('vial')
        layout_coords = {}
        for key in layout_keys:
            layout_coords.update(CoordinateMapper.LAYOUT_COORDINATES.get(key, {}))
        for well_id, stored in layout_coords.items():
            if stored is not None:
                if abs(coords.x - stored["x"]) < 1.0 and abs(coords.y - stored["y"]) < 1.0:
                    return well_id

        # Check if at a washing station position
        for ws_id in ('WS1', 'WS2'):
            ws_coords = CoordinateMapper._ws_coordinates(ws_id)
            if abs(coords.x - ws_coords.x) < 1.0 and abs(coords.y - ws_coords.y) < 1.0:
                return ws_id

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
    def _interpolate_from_refs(row: str, column: int, layout_coords: dict) -> Optional[WellCoordinates]:
        """Interpolate well coordinates from calibrated reference points.

        Finds the two nearest calibrated columns for the same row and
        linearly interpolates X.  Y is taken from the nearest reference.
        Returns None if fewer than 2 reference columns exist for this row.
        """
        # Collect calibrated columns for this row
        refs = {}  # col -> {x, y}
        for wid, coord in layout_coords.items():
            try:
                r, c = CoordinateMapper.parse_well(wid)
            except (ValueError, IndexError):
                continue
            if r == row:
                refs[c] = coord

        if len(refs) < 2:
            return None

        sorted_cols = sorted(refs.keys())

        # Exact match
        if column in refs:
            return WellCoordinates(x=refs[column]["x"], y=refs[column]["y"], z=0.0)

        # Find surrounding reference columns
        lower = None
        upper = None
        for c in sorted_cols:
            if c < column:
                lower = c
            elif c > column and upper is None:
                upper = c

        if lower is not None and upper is not None:
            # Interpolate between lower and upper
            t = (column - lower) / (upper - lower)
            x = refs[lower]["x"] + t * (refs[upper]["x"] - refs[lower]["x"])
            y = refs[lower]["y"] + t * (refs[upper]["y"] - refs[lower]["y"])
        elif lower is not None:
            # Extrapolate from last two refs below
            prev = sorted_cols[sorted_cols.index(lower) - 1] if sorted_cols.index(lower) > 0 else None
            if prev is not None:
                spacing_x = (refs[lower]["x"] - refs[prev]["x"]) / (lower - prev)
                x = refs[lower]["x"] + spacing_x * (column - lower)
            else:  # pragma: no cover – unreachable: len(refs)>=2 guarantees prev exists
                x = refs[lower]["x"]
            y = refs[lower]["y"]
        elif upper is not None:
            # Extrapolate from first two refs above
            nxt_idx = sorted_cols.index(upper) + 1
            nxt = sorted_cols[nxt_idx] if nxt_idx < len(sorted_cols) else None
            if nxt is not None:
                spacing_x = (refs[nxt]["x"] - refs[upper]["x"]) / (nxt - upper)
                x = refs[upper]["x"] + spacing_x * (column - upper)
            else:  # pragma: no cover – unreachable: len(refs)>=2 guarantees nxt exists
                x = refs[upper]["x"]
            y = refs[upper]["y"]
        else:  # pragma: no cover – unreachable: len(refs)>=2 guarantees lower or upper
            return None

        return WellCoordinates(x=x, y=y, z=0.0)

    @staticmethod
    def well_to_coordinates(well_id: str) -> WellCoordinates:
        """
        Convert well ID to physical coordinates - supports multiple layout types

        Args:
            well_id: Well identifier (e.g., 'A12', 'R1', 'V3', 'LA1', 'SA2')

        Returns:
            WellCoordinates with x, y, z positions
        """
        # Check stored coordinates first (per-layout mapping from config.json)
        # "wellplate" layout includes both "wellplate" and "vial" coordinate sections
        layout_keys = [CoordinateMapper.CURRENT_LAYOUT]
        if CoordinateMapper.CURRENT_LAYOUT == 'wellplate':
            layout_keys.append('vial')
        layout_coords = {}
        for key in layout_keys:
            layout_coords.update(CoordinateMapper.LAYOUT_COORDINATES.get(key, {}))
        stored = layout_coords.get(well_id)
        if stored is not None:
            return WellCoordinates(x=stored["x"], y=stored["y"], z=0.0)

        # WS1/WS2 are shared across layouts — check all layouts if not in current
        if well_id in ('WS1', 'WS2'):
            for lname, lcoords in CoordinateMapper.LAYOUT_COORDINATES.items():
                ws_stored = lcoords.get(well_id)
                if ws_stored is not None:
                    return WellCoordinates(x=ws_stored["x"], y=ws_stored["y"], z=0.0)
            # Fall back to computed coordinates from config
            return CoordinateMapper._ws_coordinates(well_id)

        # Standard well format (A1-H15) — try interpolation from calibrated refs
        try:
            row, column = CoordinateMapper.parse_well(well_id)
            ref = CoordinateMapper._interpolate_from_refs(row, column, layout_coords)
            if ref is not None:
                return ref
        except (ValueError, IndexError):
            pass

        raise ValueError(f"Well '{well_id}' not found in config coordinates. Please calibrate this location.")

    @staticmethod
    def coordinates_to_steps(coords: WellCoordinates) -> Tuple[int, int, int]:
        """
        Convert physical coordinates to motor steps.
        Reads STEPS_PER_MM from config at call time to stay in sync.

        Args:
            coords: WellCoordinates

        Returns:
            Tuple of (x_steps, y_steps, z_steps)
        """
        spm_x = settings.get('STEPS_PER_MM_X')
        spm_y = settings.get('STEPS_PER_MM_Y')
        spm_z = settings.get('STEPS_PER_MM_Z')

        x_steps = int(coords.x * spm_x)
        y_steps = int(coords.y * spm_y)
        z_steps = int(coords.z * spm_z)

        return x_steps, y_steps, z_steps


class PipettingController:
    """High-level controller for pipetting operations"""

    # Pipette parameters - read from config.json at import time
    PIPETTE_STEPS_PER_ML = settings.get('PIPETTE_STEPS_PER_ML')  # Steps to aspirate/dispense 1µL
    PIPETTE_MAX_ML       = settings.get('PIPETTE_MAX_ML')       # Maximum pipette volume in µL
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

    # Axis software travel limits (steps from home/min to max)
    X_MAX_STEPS = 104000
    Y_MAX_STEPS = 674000
    Z_MAX_STEPS = 14000

    # Position persistence
    POSITION_FILE = Path(__file__).parent / "pipette_position.json"

    def __init__(self):
        """Initialize the pipetting controller"""
        self.controller_type = settings.get('CONTROLLER_TYPE')
        self.stepper_controller = _create_stepper_controller(self.controller_type)
        self.mapper = CoordinateMapper()
        self.stop_requested = False
        self.motor_stopped = bool(settings.get('MOTOR_STOP'))  # Persisted motor interlock
        self.log_buffer = []  # Store log messages for UI display
        self.max_logs = 100  # Maximum number of logs to keep
        self.current_pipette_count = 1  # Current pipette configuration (default: 1)
        self.current_operation = "idle"  # Current operation: idle, moving, aspirating, dispensing
        self.operation_well = None  # Well where current operation is happening
        self.current_step_index = None  # 0-based index of step currently executing
        self.total_steps = None  # Total number of steps in current sequence
        self.layout_type = "microchip"  # Current layout type: microchip or wellplate
        CoordinateMapper.CURRENT_LAYOUT = self.layout_type
        self.pipette_ml = 0.0  # Current pipette volume in µL

        # Load stored per-layout coordinates so get_current_well() resolves correctly
        cfg = settings.load()
        CoordinateMapper.LAYOUT_COORDINATES = cfg.get("LAYOUT_COORDINATES", {})

        # Load last known position or default to home (WS1 - Washing Station 1)
        self.current_position, self.current_pipette_count, self.layout_type = self.load_position()
        CoordinateMapper.CURRENT_LAYOUT = self.layout_type
        # Load pipette_ml from saved position file
        try:
            if self.POSITION_FILE.exists():
                with open(self.POSITION_FILE, 'r') as f:
                    saved = json.load(f)
                self.pipette_ml = saved.get('pipette_ml', 0.0)
        except Exception:
            pass
        # Sync motor step counters with persisted position so _move_*_safe
        # allows movement in both directions after a restart.
        if self.controller_type != 'arduino_uno_q':
            x_steps = int(self.current_position.x * self.mapper.STEPS_PER_MM_X)
            y_steps = int(self.current_position.y * self.mapper.STEPS_PER_MM_Y)
            z_steps = int(self.current_position.z * self.mapper.STEPS_PER_MM_Z)
            # When inverted, motor position counts in the negative direction
            self.stepper_controller.get_motor(1).current_position = -x_steps if self.INVERT_X else x_steps
            self.stepper_controller.get_motor(2).current_position = -y_steps if self.INVERT_Y else y_steps
            self.stepper_controller.get_motor(3).current_position = z_steps

        self.log(f"Pipetting controller initialized at position: {self.get_current_well() or 'Unknown'}")
        self.log(f"Pipette configuration: {self.current_pipette_count} pipette(s)")

    @staticmethod
    def _inv(direction: Direction, invert: bool) -> Direction:
        """Flip direction if the invert flag is set (for reversed-mounted motors)."""
        if invert:
            return Direction.COUNTERCLOCKWISE if direction == Direction.CLOCKWISE else Direction.CLOCKWISE
        return direction

    def _speed(self, seconds: float):
        """Convert speed to controller-appropriate unit.

        RPi expects delay in seconds (float).
        Arduino expects delay_us in microseconds (int).
        """
        if self.controller_type == 'arduino_uno_q':
            return int(seconds * 1_000_000)
        return seconds

    def _move_motor(self, motor_id: int, steps: int, direction: Direction, speed: float, **kwargs):
        """Wrapper around stepper_controller.move_motor that normalises the interface.

        RPi signature:  move_motor(id, steps, Direction, delay_s, check_limits) -> (steps, LimitSwitchState)
        Arduino signature: move_motor(id, steps, Direction, delay_us) -> dict
        """
        if self.motor_stopped:
            self.log(f"Motor stopped — ignoring move command (motor {motor_id}, {steps} steps)")
            return None
        converted_speed = self._speed(speed)
        check_limits = kwargs.get('check_limits', True)
        if self.controller_type == 'arduino_uno_q':
            result = self.stepper_controller.move_motor(motor_id, steps, direction, converted_speed, respect_limit=check_limits)
            self.log(f"Arduino RPC move result: motor={motor_id}, steps={steps}, dir={direction}, delay_us={converted_speed}, check_limits={check_limits}, result={result}")
            return result
        else:
            return self.stepper_controller.move_motor(motor_id, steps, direction, converted_speed, check_limits=check_limits)

    def _move_x_safe(self, steps: int, direction: Direction, speed: float) -> int:
        """Move X-axis motor with software step limit enforcement.

        Clamps the requested steps so the motor position stays within
        [0, X_MAX_STEPS] (or [-X_MAX_STEPS, 0] when INVERT_X is True).
        Returns the number of steps actually commanded.
        """
        if self.controller_type == 'arduino_uno_q':
            if steps > 0:
                self._move_motor(1, steps, direction, speed, check_limits=False)
            return steps

        motor = self.stepper_controller.get_motor(1)
        pos = motor.current_position
        travel = abs(pos)

        # When inverted, CW/CCW swap meaning relative to home.
        # XOR determines if we're moving away from home or toward it.
        moving_away = (direction == Direction.CLOCKWISE) != self.INVERT_X

        if moving_away:
            max_allowed = max(0, self.X_MAX_STEPS - travel)
        else:
            max_allowed = max(0, travel)

        clamped = min(steps, max_allowed)
        if clamped < steps:
            self.log(f"X-axis: clamped {steps} -> {clamped} steps (limit: {self.X_MAX_STEPS})")
        if clamped > 0:
            self._move_motor(1, clamped, direction, speed, check_limits=False)
        return clamped

    def _move_z_safe(self, steps: int, direction: Direction, speed: float) -> int:
        """Move Z-axis motor with software step limit enforcement.

        Clamps the requested steps so the motor position stays within
        [0, Z_MAX_STEPS].  Returns the number of steps actually commanded.
        """
        if self.controller_type == 'arduino_uno_q':
            # Arduino doesn't expose get_motor(); skip software clamping
            if steps > 0:
                self._move_motor(3, steps, direction, speed)
            return steps

        motor = self.stepper_controller.get_motor(3)
        pos = motor.current_position

        if direction == Direction.CLOCKWISE:
            max_allowed = max(0, self.Z_MAX_STEPS - pos)
        else:
            max_allowed = max(0, pos)

        clamped = min(steps, max_allowed)
        if clamped < steps:
            self.log(f"Z-axis: clamped {steps} -> {clamped} steps (limit: {self.Z_MAX_STEPS})")
        if clamped > 0:
            self._move_motor(3, clamped, direction, speed)
        return clamped

    def _move_y_safe(self, steps: int, direction: Direction, speed: float) -> int:
        """Move Y-axis motor with software step limit enforcement.

        Clamps the requested steps so the motor position stays within
        [0, Y_MAX_STEPS].  Returns the number of steps actually commanded.
        """
        if self.controller_type == 'arduino_uno_q':
            if steps > 0:
                self._move_motor(2, steps, direction, speed, check_limits=False)
            return steps

        motor = self.stepper_controller.get_motor(2)
        pos = motor.current_position

        if direction == Direction.CLOCKWISE:
            max_allowed = max(0, self.Y_MAX_STEPS - pos)
        else:
            max_allowed = max(0, pos)

        clamped = min(steps, max_allowed)
        if clamped < steps:
            self.log(f"Y-axis: clamped {steps} -> {clamped} steps (limit: {self.Y_MAX_STEPS})")
        if clamped > 0:
            self._move_motor(2, clamped, direction, speed, check_limits=False)
        return clamped

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
                "layout_type": self.layout_type,
                "pipette_ml": self.pipette_ml
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
        if self.motor_stopped:
            self.log(f"Motor stop engaged — ignoring move to {well_id}")
            return
        self.current_operation = "moving"
        self.operation_well = well_id
        self.log(f"Moving to well {well_id}...")

        # Reload config so we always use the latest coordinates and step values
        cfg = settings.load()
        CoordinateMapper.LAYOUT_COORDINATES = cfg.get("LAYOUT_COORDINATES", {})
        CoordinateMapper.STEPS_PER_MM_X = cfg.get('STEPS_PER_MM_X', 100)
        CoordinateMapper.STEPS_PER_MM_Y = cfg.get('STEPS_PER_MM_Y', 100)
        CoordinateMapper.STEPS_PER_MM_Z = cfg.get('STEPS_PER_MM_Z', 100)

        # Get target coordinates
        Z_UP_POSITION = 70.0
        try:
            target_coords = self.mapper.well_to_coordinates(well_id)
        except ValueError:
            self.log(f"Well '{well_id}' not found in config coordinates. Please calibrate this location.")
            self.current_operation = "idle"
            self.operation_well = None
            return
        self.log(f"  Config coordinates for {well_id}: X={target_coords.x:.2f}, Y={target_coords.y:.2f} (layout={CoordinateMapper.CURRENT_LAYOUT})")
        # z_offset is negative for depth (e.g., -40 = go 40mm below travel height)
        # Wells return z=0 as placeholder; actual Z target = travel height + offset
        if z_offset != 0.0:
            target_coords.z = Z_UP_POSITION + z_offset

        # Convert to steps
        target_steps = self.mapper.coordinates_to_steps(target_coords)
        current_steps = self.mapper.coordinates_to_steps(self.current_position)

        # Calculate relative movements
        x_delta = target_steps[0] - current_steps[0]
        y_delta = target_steps[1] - current_steps[1]

        # Step 1: Move Z up only if Z is currently down (below safe travel height)
        z_is_up = self.current_position.z >= Z_UP_POSITION
        if not z_is_up:
            z_up_distance = Z_UP_POSITION - self.current_position.z
            if z_up_distance > 0:  # pragma: no cover – always True when z_is_up is False
                z_up_steps = int(z_up_distance * self.mapper.STEPS_PER_MM_Z)
                self.log(f"  Step 1: Z up to {Z_UP_POSITION}mm ({z_up_steps} steps)")
                self._move_z_safe(z_up_steps, self._inv(Direction.CLOCKWISE, self.INVERT_Z), self.TRAVEL_SPEED)
                self.current_position.z = Z_UP_POSITION
        else:
            self.log(f"  Step 1: Z already up ({self.current_position.z:.1f}mm), skipping")

        # Step 2: Move X and Y simultaneously
        if x_delta != 0 or y_delta != 0:
            self.log(f"  Step 2: Moving X ({x_delta} steps) and Y ({y_delta} steps) simultaneously")
            threads = []
            if y_delta != 0:
                y_dir = self._inv(Direction.CLOCKWISE if y_delta > 0 else Direction.COUNTERCLOCKWISE, self.INVERT_Y)
                t_y = threading.Thread(target=self._move_y_safe, args=(abs(y_delta), y_dir, self.TRAVEL_SPEED))
                threads.append(t_y)
            if x_delta != 0:
                x_dir = self._inv(Direction.CLOCKWISE if x_delta > 0 else Direction.COUNTERCLOCKWISE, self.INVERT_X)
                t_x = threading.Thread(target=self._move_x_safe, args=(abs(x_delta), x_dir, self.TRAVEL_SPEED))
                threads.append(t_x)
            for t in threads:
                t.start()
            for t in threads:
                t.join()

        # Step 3: Move Z down only if a real Z target was specified (z_offset != 0)
        # Well coordinates return z=0.0 as a placeholder — keep Z up when just
        # moving between wells so it doesn't plunge down unnecessarily.
        if z_offset != 0.0:
            z_down_distance = Z_UP_POSITION - target_coords.z
            if z_down_distance > 0:  # pragma: no cover – always True: z_offset is always negative
                z_down_steps = int(z_down_distance * self.mapper.STEPS_PER_MM_Z)
                self.log(f"  Step 3: Z down to {target_coords.z}mm ({z_down_steps} steps)")
                self._move_z_safe(z_down_steps, self._inv(Direction.COUNTERCLOCKWISE, self.INVERT_Z), self.TRAVEL_SPEED)

        # Update current position — keep Z at travel height when no z_offset
        target_coords.z = target_coords.z if z_offset != 0.0 else Z_UP_POSITION
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
            volume_ml: Volume to aspirate in µL
        """
        if self.motor_stopped:
            self.log("Motor stop engaged — ignoring aspirate")
            return
        # Ensure Z is down before aspirating
        if self.current_position.z > 1.0:
            self.log(f"  Z is up ({self.current_position.z:.1f}mm), moving down before aspirate")
            self._z_to(0.0)
        self.current_operation = "aspirating"
        self.operation_well = self.get_current_well()
        # Clamp to max pipette capacity
        allowed = max(0.0, self.PIPETTE_MAX_ML - self.pipette_ml)
        if volume_ml > allowed:
            self.log(f"  Pipette limit: clamped {volume_ml} µL -> {allowed:.3f} µL (max {self.PIPETTE_MAX_ML} µL)")
            volume_ml = allowed
        if volume_ml <= 0:
            self.log(f"  Pipette already at max capacity ({self.PIPETTE_MAX_ML} µL) — skipping aspirate")
            self.current_operation = "idle"
            self.operation_well = None
            return
        steps = int(volume_ml * self.PIPETTE_STEPS_PER_ML)
        actual_ml = steps / self.PIPETTE_STEPS_PER_ML
        self.log(f"  Aspirating {actual_ml:.3f} µL ({steps} steps)...")
        self._move_motor(4, steps, self._inv(Direction.CLOCKWISE, self.INVERT_PIPETTE), self.PIPETTE_SPEED)
        self.pipette_ml += actual_ml
        self.save_position()
        time.sleep(0.5)  # Allow liquid to settle
        self.current_operation = "idle"
        self.operation_well = None

    def dispense(self, volume_ml: float):
        """
        Dispense liquid from pipette

        Args:
            volume_ml: Volume to dispense in µL
        """
        if self.motor_stopped:
            self.log("Motor stop engaged — ignoring dispense")
            return
        # Ensure Z is down before dispensing
        if self.current_position.z > 1.0:
            self.log(f"  Z is up ({self.current_position.z:.1f}mm), moving down before dispense")
            self._z_to(0.0)
        self.current_operation = "dispensing"
        self.operation_well = self.get_current_well()
        # Clamp to what's actually in the pipette
        if volume_ml > self.pipette_ml:
            self.log(f"  Pipette limit: clamped {volume_ml} µL -> {self.pipette_ml:.3f} µL (current volume)")
            volume_ml = self.pipette_ml
        if volume_ml <= 0:
            self.log("  Pipette is empty — skipping dispense")
            self.current_operation = "idle"
            self.operation_well = None
            return
        steps = int(volume_ml * self.PIPETTE_STEPS_PER_ML)
        actual_ml = steps / self.PIPETTE_STEPS_PER_ML
        self.log(f"  Dispensing {actual_ml:.3f} µL ({steps} steps)...")
        self._move_motor(4, steps, self._inv(Direction.COUNTERCLOCKWISE, self.INVERT_PIPETTE), self.PIPETTE_SPEED)
        self.pipette_ml = max(0.0, self.pipette_ml - actual_ml)
        self.save_position()
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

    def _z_to(self, target_z: float):
        """Move Z axis to an absolute position in mm"""
        if self.motor_stopped:
            return
        delta = target_z - self.current_position.z
        if abs(delta) < 0.1:
            return
        steps = int(abs(delta) * self.mapper.STEPS_PER_MM_Z)
        if delta > 0:
            self.log(f"  Z up to {target_z:.1f}mm ({steps} steps)")
            self._move_z_safe(steps, self._inv(Direction.CLOCKWISE, self.INVERT_Z), self.TRAVEL_SPEED)
        else:
            self.log(f"  Z down to {target_z:.1f}mm ({steps} steps)")
            self._move_z_safe(steps, self._inv(Direction.COUNTERCLOCKWISE, self.INVERT_Z), self.TRAVEL_SPEED)
        self.current_position.z = target_z
        # Sync motor step counter to match logical Z position
        if self.controller_type != 'arduino_uno_q':
            z_motor = self.stepper_controller.get_motor(3)
            z_motor.current_position = int(target_z * self.mapper.STEPS_PER_MM_Z)
        self.save_position()

    def execute_transfer(self, pickup_well: str, dropoff_well: str,
                         volume_ml: float, rinse_well: Optional[str] = None,
                         wash_well: Optional[str] = None):
        """
        Execute a single liquid transfer

        Args:
            pickup_well: Source well ID
            dropoff_well: Destination well ID
            volume_ml: Volume to transfer in µL
            rinse_well: Optional well for rinsing after transfer
            wash_well: Optional well for washing after rinse
        """
        Z_UP = 70.0
        self.log(f"Transfer: {pickup_well} -> {dropoff_well} ({volume_ml} µL)")

        # 1. Ensure Z is up
        if self.current_position.z < Z_UP:
            self._z_to(Z_UP)

        # 2. Move to pickup well (X/Y only, Z stays up)
        self.move_to_well(pickup_well)

        # 3. Z down
        self._z_to(0.0)

        # 4. Collect
        self.aspirate(volume_ml)

        # 5. Z up
        self._z_to(Z_UP)

        # 6. Move to dropoff well (X/Y only)
        self.move_to_well(dropoff_well)

        # 7. Z down
        self._z_to(0.0)

        # 8. Dispense
        self.dispense(volume_ml)

        # 9. Z up
        self._z_to(Z_UP)

        # 10-13. Rinse if specified
        if rinse_well:
            # 10. Move to rinse well (X/Y only)
            self.move_to_well(rinse_well)

            # 11. Z down
            self._z_to(0.0)

            # 11. Rinse cycles
            for i in range(self.RINSE_CYCLES):
                self.log(f"  Rinse cycle {i + 1}/{self.RINSE_CYCLES}")
                self.aspirate(volume_ml)
                self.dispense(volume_ml)

            # 12. Z up
            self._z_to(Z_UP)

        # 13-16. Wash if specified
        if wash_well:
            # 13. Move to wash well (X/Y only)
            self.move_to_well(wash_well)

            # 14. Z down
            self._z_to(0.0)

            # 15. Wash cycles
            for i in range(self.RINSE_CYCLES):
                self.log(f"  Wash cycle {i + 1}/{self.RINSE_CYCLES}")
                self.aspirate(volume_ml)
                self.dispense(volume_ml)

            # 16. Z up
            self._z_to(Z_UP)

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
                step.rinse_well,
                step.wash_well
            )

            # Wait between cycles
            if step.wait_time > 0 and cycle < step.cycles - 1:
                self.log(f"  Waiting {step.wait_time} seconds...")
                self._interruptible_sleep(step.wait_time)

        return True

    def execute_sequence(self, steps: list[PipettingStep]):
        """
        Execute a complete pipetting sequence

        Args:
            steps: List of PipettingStep objects
        """
        # Reset stop flag at the start
        self.stop_requested = False

        # Reload config so we always use the latest coordinates and step values
        cfg = settings.load()
        CoordinateMapper.LAYOUT_COORDINATES = cfg.get("LAYOUT_COORDINATES", {})
        CoordinateMapper.STEPS_PER_MM_X = cfg.get('STEPS_PER_MM_X', 100)
        CoordinateMapper.STEPS_PER_MM_Y = cfg.get('STEPS_PER_MM_Y', 100)
        CoordinateMapper.STEPS_PER_MM_Z = cfg.get('STEPS_PER_MM_Z', 100)

        self.total_steps = len(steps)
        self.current_step_index = 0

        self.log("=" * 60)
        self.log(f"EXECUTING PIPETTING SEQUENCE ({len(steps)} steps)")
        self.log("=" * 60)

        for step_num, step in enumerate(steps, 1):
            self.current_step_index = step_num - 1
            # Check for stop request
            if self.stop_requested:
                self.log("=" * 60)
                self.log("EXECUTION STOPPED BY USER")
                self.log(f"Completed {step_num - 1} of {len(steps)} steps")
                self.log("=" * 60)
                self.stop_requested = False
                self.current_step_index = None
                self.total_steps = None
                return

            self.log(f"--- Step {step_num}/{len(steps)} ---")

            # Handle special step types
            if step.step_type == 'home':
                self.log("Action: Go Home")
                self.home()
                if step.wait_time > 0:  # pragma: no branch
                    self.log(f"  Waiting {step.wait_time} seconds...")
                    self._interruptible_sleep(step.wait_time)
                continue

            if step.step_type == 'wait':
                wait_secs = step.wait_time if step.wait_time > 0 else 0
                self.log(f"Action: Wait {wait_secs} seconds")
                if wait_secs > 0:  # pragma: no branch
                    self._interruptible_sleep(wait_secs)
                continue

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
                            self._interruptible_sleep(step.wait_time)

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
                            self._interruptible_sleep(min(remaining_time, step.repetition_duration - elapsed))
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
                self.current_step_index = None
                self.total_steps = None
                return

            # Wait before next step (if not the last step)
            if step.wait_time > 0 and step_num < len(steps):
                self.log(f"  Waiting {step.wait_time} seconds before next step...")
                self._interruptible_sleep(step.wait_time)

        self.current_step_index = None
        self.total_steps = None
        self.log("=" * 60)
        self.log("SEQUENCE COMPLETE — returning home")
        self.log("=" * 60)
        self.home()

    def _interruptible_sleep(self, seconds):
        """Sleep in small increments so stop_requested is checked promptly."""
        elapsed = 0.0
        while elapsed < seconds:
            if self.stop_requested:
                return
            chunk = min(0.25, seconds - elapsed)
            time.sleep(chunk)
            elapsed += chunk

    def stop(self):
        """Request to stop the current execution"""
        self.log("Stop requested...")
        self.stop_requested = True
        self.stepper_controller.stop_all()

    def set_motor_stop(self, stopped: bool):
        """Toggle motor interlock. When stopped, no steps are sent to motors."""
        self.motor_stopped = stopped
        if stopped:
            # Immediately halt any running motors
            self.stepper_controller.stop_all()
            self.log("Motor stop ENGAGED — motors will not move")
        else:
            self.log("Motor stop RELEASED — motors can move")
        # Persist to config
        cfg = settings.load()
        cfg['MOTOR_STOP'] = stopped
        settings.save(cfg)

    def _home_axis_to_min(self, motor_id: int, axis_name: str, first_direction: Direction = Direction.CLOCKWISE):
        """
        Home a single axis to its MIN limit switch.
        Tries first_direction, then reverses if it hits MAX instead.
        """
        if self.motor_stopped:
            self.log(f"Motor stop engaged — skipping {axis_name} homing")
            return

        if self.controller_type == 'arduino_uno_q':
            # Arduino: use move_until_limit which properly finds the MIN limit
            # Use single get_limit RPC (not get_limit_states which queries all 4 motors)
            def _check_min(mid):
                result = self.stepper_controller._call_rpc("get_limit", mid)
                return bool(result is not None and result >= 0 and (result & 1))

            if _check_min(motor_id):
                self.log(f"{axis_name} axis already at MIN limit")
                return

            self.log(f"Homing {axis_name} axis to MIN limit...")
            speed = self._speed(self.TRAVEL_SPEED)

            # first_direction is already the correct hardware direction toward MIN
            second_direction = Direction.COUNTERCLOCKWISE if first_direction == Direction.CLOCKWISE else Direction.CLOCKWISE

            for direction in [first_direction, second_direction]:
                result = self.stepper_controller.move_until_limit(motor_id, direction, speed)
                self.log(f"{axis_name} axis: moved {direction.name} {result['steps_taken']} steps, hit_limit={result['hit_limit']}")
                time.sleep(0.1)  # Let MCU settle before next RPC

                if result['hit_limit']:
                    # Single RPC to check which limit we hit
                    if _check_min(motor_id):
                        self.log(f"{axis_name} axis: reached MIN limit")
                        return
                    else:
                        self.log(f"{axis_name} axis: hit MAX limit, reversing...")
                        continue

                self.log(f"{axis_name} axis: WARNING - no limit found in {direction.name}")

            self.log(f"{axis_name} axis: WARNING - could not reach MIN limit")
            return

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
        if self.motor_stopped:
            self.log("Motor stop engaged — ignoring home")
            return
        self.log("Homing all axes to MIN limit switches...")

        # Raise Z to safe height only if Z is currently down
        z_target_mm = 70.0
        z_is_up = self.current_position.z >= z_target_mm

        if z_is_up:
            self.log(f"Z already up ({self.current_position.z:.1f}mm), skipping Z raise")
        else:
            self.log("Raising Z to safe height...")
            if self.current_position.z < 0:
                safe_z_steps = int(abs(self.current_position.z) * self.mapper.STEPS_PER_MM_Z)
                self._move_z_safe(safe_z_steps, self._inv(Direction.CLOCKWISE, self.INVERT_Z), self.TRAVEL_SPEED)
                self.current_position.z = 0.0

            if self.controller_type == 'arduino_uno_q':
                z_steps = int(z_target_mm * self.mapper.STEPS_PER_MM_Z)
                self.log(f"Moving Z-axis to {z_target_mm}mm CW ({z_steps} steps)...")
                self._move_z_safe(z_steps, Direction.CLOCKWISE, self.TRAVEL_SPEED)
            else:
                z_motor = self.stepper_controller.get_motor(3)
                z_steps = int(z_target_mm * self.mapper.STEPS_PER_MM_Z)
                self.log(f"Moving Z-axis to {z_target_mm}mm CW ({z_steps} steps)...")
                z_motor.reset_position()
                self._move_z_safe(z_steps, Direction.CLOCKWISE, self.TRAVEL_SPEED)
                self.log(f"Z-axis at {z_motor.current_position} steps")

        # Home X and Y axes simultaneously to MIN limit switches
        t_x = threading.Thread(target=self._home_axis_to_min, args=(1, "X", Direction.CLOCKWISE))
        t_y = threading.Thread(target=self._home_axis_to_min, args=(2, "Y", Direction.COUNTERCLOCKWISE))
        t_x.start()
        t_y.start()
        t_x.join()
        t_y.join()

        # Position is now at origin (X/Y at MIN limits, Z at 75mm)
        self.current_position = WellCoordinates(x=0.0, y=0.0, z=z_target_mm)
        self.save_position()
        self.log(f"Home complete - position: X=0, Y=0, Z={z_target_mm:.1f}mm")

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
        if self.motor_stopped:
            self.log("Motor stop engaged — ignoring Z toggle")
            return
        Z_TOGGLE_STEPS = int(70.0 * self.mapper.STEPS_PER_MM_Z)

        if direction == 'up':
            self._move_motor(3, Z_TOGGLE_STEPS, self._inv(Direction.CLOCKWISE, self.INVERT_Z), self.TRAVEL_SPEED, check_limits=False)
            distance_mm = Z_TOGGLE_STEPS / self.mapper.STEPS_PER_MM_Z
            self.current_position.z += distance_mm
            self.log(f"Z-axis moved UP {Z_TOGGLE_STEPS} steps ({distance_mm:.1f}mm)")
        elif direction == 'down':
            self._move_motor(3, Z_TOGGLE_STEPS, self._inv(Direction.COUNTERCLOCKWISE, self.INVERT_Z), self.TRAVEL_SPEED, check_limits=False)
            distance_mm = Z_TOGGLE_STEPS / self.mapper.STEPS_PER_MM_Z
            self.current_position.z -= distance_mm
            self.log(f"Z-axis moved DOWN {Z_TOGGLE_STEPS} steps ({distance_mm:.1f}mm)")
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
        if self.motor_stopped:
            self.log("Motor stop engaged — ignoring axis move")
            return self.get_axis_positions()
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

        # Clamp pipette manual jog to limits
        if axis == 'pipette':
            delta_ml = steps / self.PIPETTE_STEPS_PER_ML
            if direction == 'cw':
                allowed_ml = max(0.0, self.PIPETTE_MAX_ML - self.pipette_ml)
                if delta_ml > allowed_ml:
                    steps = int(allowed_ml * self.PIPETTE_STEPS_PER_ML)
                    self.log(f"Pipette limit: clamped to {steps} steps (max {self.PIPETTE_MAX_ML} µL)")
                if steps <= 0:
                    self.log(f"Pipette at max capacity ({self.PIPETTE_MAX_ML} µL) — skipping")
                    return self.get_axis_positions()
            else:
                allowed_ml = self.pipette_ml
                if delta_ml > allowed_ml:
                    steps = int(allowed_ml * self.PIPETTE_STEPS_PER_ML)
                    self.log(f"Pipette limit: clamped to {steps} steps (pipette at {self.pipette_ml:.3f} µL)")
                if steps <= 0:
                    self.log("Pipette is empty — skipping")
                    return self.get_axis_positions()

        self.log(f"Moving {axis.upper()}-axis: {steps} steps {direction.upper()}")
        if axis == 'x':
            self._move_x_safe(steps, motor_direction, self.TRAVEL_SPEED)
        elif axis == 'y':
            self._move_y_safe(steps, motor_direction, self.TRAVEL_SPEED)
        else:
            self._move_motor(motor_id, steps, motor_direction, self.TRAVEL_SPEED, check_limits=False)

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
        elif axis == 'pipette':  # pragma: no branch – always reached: axis validated above
            delta = steps / self.PIPETTE_STEPS_PER_ML
            if direction == 'cw':
                self.pipette_ml = min(self.PIPETTE_MAX_ML, self.pipette_ml + delta)
            else:
                self.pipette_ml = max(0.0, self.pipette_ml - delta)

        self.save_position()

        # Return current positions
        return self.get_axis_positions()

    def get_axis_positions(self) -> dict:
        """
        Get current positions of all axes

        Returns:
            dict with x, y, z positions in mm and motor step counts
        """
        if self.controller_type == 'arduino_uno_q':
            motor_positions = {}  # Arduino doesn't expose per-motor step counters
        else:
            motor_positions = self.stepper_controller.get_all_positions()
        return {
            'x': self.current_position.x,
            'y': self.current_position.y,
            'z': self.current_position.z,
            'pipette_ml': self.pipette_ml,
            'motor_steps': motor_positions
        }

    def cleanup(self):
        """Clean up resources"""
        self.stepper_controller.cleanup()


# Example usage
if __name__ == "__main__":  # pragma: no cover
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
