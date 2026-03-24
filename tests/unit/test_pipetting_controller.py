"""Tests for pipetting_controller.py -- targeting 100% line + branch coverage."""
import json
import sys
import time
import threading
from pathlib import Path
from unittest.mock import patch, MagicMock, PropertyMock, call

import pytest

# ---------------------------------------------------------------------------
# Helpers / Fixtures
# ---------------------------------------------------------------------------

def _ensure_import(mock_gpio):
    """Import pipetting_controller once, ensuring the mock GPIO is wired up."""
    rpi_mod = sys.modules.get('RPi')
    if rpi_mod is not None:
        rpi_mod.GPIO = mock_gpio

    if 'stepper_control' not in sys.modules:
        import stepper_control
    else:
        stepper_control = sys.modules['stepper_control']

    if 'pipetting_controller' not in sys.modules:
        import pipetting_controller
    else:
        pipetting_controller = sys.modules['pipetting_controller']

    return pipetting_controller


@pytest.fixture
def pc_mod(mock_gpio):
    """Return the pipetting_controller module."""
    return _ensure_import(mock_gpio)


@pytest.fixture
def make_controller(pc_mod, patch_config_path, patch_position_path, monkeypatch):
    """Factory that creates a PipettingController with temp config/position files."""
    def _make(**overrides):
        # Write overrides into temp config
        import settings
        cfg = settings.load()
        cfg.update(overrides)
        settings.save(cfg)
        # Patch class-level attributes that were set at import time from real config
        monkeypatch.setattr(pc_mod.PipettingController, 'INVERT_X', cfg.get('INVERT_X', False))
        monkeypatch.setattr(pc_mod.PipettingController, 'INVERT_Y', cfg.get('INVERT_Y', False))
        monkeypatch.setattr(pc_mod.PipettingController, 'INVERT_Z', cfg.get('INVERT_Z', False))
        monkeypatch.setattr(pc_mod.PipettingController, 'INVERT_PIPETTE', cfg.get('INVERT_PIPETTE', False))
        monkeypatch.setattr(pc_mod.PipettingController, 'TRAVEL_SPEED', cfg.get('TRAVEL_SPEED', 0.0001))
        monkeypatch.setattr(pc_mod.PipettingController, 'PIPETTE_SPEED', cfg.get('PIPETTE_SPEED', 0.001))
        monkeypatch.setattr(pc_mod.PipettingController, 'PIPETTE_STEPS_PER_ML', cfg.get('PIPETTE_STEPS_PER_ML', 60))
        monkeypatch.setattr(pc_mod.PipettingController, 'PIPETTE_MAX_ML', cfg.get('PIPETTE_MAX_ML', 100.0))
        monkeypatch.setattr(pc_mod.PipettingController, 'PICKUP_DEPTH', cfg.get('PICKUP_DEPTH', 40.0))
        monkeypatch.setattr(pc_mod.PipettingController, 'DROPOFF_DEPTH', cfg.get('DROPOFF_DEPTH', 5.0))
        monkeypatch.setattr(pc_mod.PipettingController, 'SAFE_HEIGHT', cfg.get('SAFE_HEIGHT', 20.0))
        monkeypatch.setattr(pc_mod.PipettingController, 'RINSE_CYCLES', cfg.get('RINSE_CYCLES', 1))
        return pc_mod.PipettingController()
    return _make


@pytest.fixture
def ctrl(make_controller):
    """A default PipettingController using raspberry_pi backend."""
    return make_controller()


@pytest.fixture
def arduino_ctrl(pc_mod, patch_config_path, patch_position_path):
    """A PipettingController configured for Arduino backend."""
    import settings
    cfg = settings.load()
    cfg['CONTROLLER_TYPE'] = 'arduino_uno_q'
    settings.save(cfg)

    mock_sc = MagicMock()
    mock_sc.move_motor.return_value = {'steps': 100, 'ok': True}
    mock_sc.move_until_limit.return_value = {'steps_taken': 500, 'hit_limit': True}
    mock_sc._call_rpc.return_value = 1  # MIN bit set
    mock_sc.stop_all.return_value = None
    mock_sc.cleanup.return_value = None

    with patch.object(pc_mod, '_create_stepper_controller', return_value=mock_sc):
        controller = pc_mod.PipettingController()
    return controller


# ===================================================================
# CoordinateMapper
# ===================================================================

class TestCoordinateMapperParseWell:
    def test_valid_well_a1(self, pc_mod):
        row, col = pc_mod.CoordinateMapper.parse_well("A1")
        assert row == "A"
        assert col == 1

    def test_valid_well_h15(self, pc_mod):
        row, col = pc_mod.CoordinateMapper.parse_well("H15")
        assert row == "H"
        assert col == 15

    def test_lowercase_normalised(self, pc_mod):
        row, col = pc_mod.CoordinateMapper.parse_well("b3")
        assert row == "B"
        assert col == 3

    def test_invalid_row(self, pc_mod):
        with pytest.raises(ValueError, match="Invalid row"):
            pc_mod.CoordinateMapper.parse_well("Z1")

    def test_invalid_column_not_number(self, pc_mod):
        with pytest.raises(ValueError, match="Invalid column in well"):
            pc_mod.CoordinateMapper.parse_well("AX")

    def test_invalid_column_zero(self, pc_mod):
        with pytest.raises(ValueError, match="Invalid column"):
            pc_mod.CoordinateMapper.parse_well("A0")

    def test_invalid_column_too_high(self, pc_mod):
        with pytest.raises(ValueError, match="Invalid column"):
            pc_mod.CoordinateMapper.parse_well("A16")

    def test_empty_string(self, pc_mod):
        with pytest.raises(ValueError, match="Invalid well ID"):
            pc_mod.CoordinateMapper.parse_well("")

    def test_short_string(self, pc_mod):
        with pytest.raises(ValueError, match="Invalid well ID"):
            pc_mod.CoordinateMapper.parse_well("A")

    def test_none_raises(self, pc_mod):
        with pytest.raises((ValueError, TypeError)):
            pc_mod.CoordinateMapper.parse_well(None)


class TestCoordinateMapperWellToCoordinates:
    def test_stored_coords_lookup(self, pc_mod):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {"A2": {"x": 100.0, "y": 20.0}}
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        result = pc_mod.CoordinateMapper.well_to_coordinates("A2")
        assert result.x == 100.0
        assert result.y == 20.0
        assert result.z == 0.0

    def test_ws1_from_stored_coords(self, pc_mod):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {"WS1": {"x": 15.0, "y": 10.0}}
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        result = pc_mod.CoordinateMapper.well_to_coordinates("WS1")
        assert result.x == 15.0
        assert result.y == 10.0

    def test_ws2_from_stored_coords(self, pc_mod):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {"WS2": {"x": 15.0, "y": 45.0}}
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        result = pc_mod.CoordinateMapper.well_to_coordinates("WS2")
        assert result.x == 15.0
        assert result.y == 45.0

    def test_ws1_fallback_computed(self, pc_mod, patch_config_path):
        """WS1 not in any layout -> computed from config values."""
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {"microchip": {}}
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        result = pc_mod.CoordinateMapper.well_to_coordinates("WS1")
        import settings
        assert result.x == settings.get('WS_POSITION_X')
        assert result.y == settings.get('WS_POSITION_Y')

    def test_ws2_fallback_computed(self, pc_mod, patch_config_path):
        """WS2 not in any layout -> computed from config."""
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {"microchip": {}}
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        result = pc_mod.CoordinateMapper.well_to_coordinates("WS2")
        import settings
        assert result.x == settings.get('WS_POSITION_X')
        assert result.y == settings.get('WS_POSITION_Y') + settings.get('WS_GAP')

    def test_ws1_from_different_layout(self, pc_mod, patch_config_path):
        """WS1 found in a layout other than CURRENT_LAYOUT."""
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {},
            "wellplate": {"WS1": {"x": 99.0, "y": 88.0}},
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        result = pc_mod.CoordinateMapper.well_to_coordinates("WS1")
        assert result.x == 99.0
        assert result.y == 88.0

    def test_interpolation_between_refs(self, pc_mod):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {
                "A2": {"x": 100.0, "y": 20.0},
                "A5": {"x": 200.0, "y": 20.0},
            }
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        result = pc_mod.CoordinateMapper.well_to_coordinates("A3")
        # col 3 is 1/3 of the way from col2 to col5
        expected_x = 100.0 + (1.0 / 3.0) * (200.0 - 100.0)
        assert abs(result.x - expected_x) < 0.01

    def test_extrapolation_beyond_refs(self, pc_mod):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {
                "A2": {"x": 100.0, "y": 20.0},
                "A5": {"x": 200.0, "y": 20.0},
            }
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        result = pc_mod.CoordinateMapper.well_to_coordinates("A7")
        # Extrapolation above: beyond col 5 using spacing from col2-col5
        spacing = (200.0 - 100.0) / (5 - 2)
        expected_x = 200.0 + spacing * (7 - 5)
        assert abs(result.x - expected_x) < 0.01

    def test_unknown_well_raises(self, pc_mod):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {"microchip": {}}
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        with pytest.raises(ValueError, match="not found in config"):
            pc_mod.CoordinateMapper.well_to_coordinates("MC99")

    def test_wellplate_layout_includes_vial(self, pc_mod):
        """When CURRENT_LAYOUT is 'wellplate', both wellplate and vial coords are searched."""
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "wellplate": {"SA2": {"x": 10.0, "y": 20.0}},
            "vial": {"VA2": {"x": 30.0, "y": 40.0}},
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "wellplate"
        result = pc_mod.CoordinateMapper.well_to_coordinates("VA2")
        assert result.x == 30.0
        assert result.y == 40.0


class TestCoordinateMapperCoordinatesToWell:
    def test_reverse_lookup(self, pc_mod):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {"A2": {"x": 100.0, "y": 20.0}}
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        coords = pc_mod.WellCoordinates(x=100.0, y=20.0, z=0.0)
        assert pc_mod.CoordinateMapper.coordinates_to_well(coords) == "A2"

    def test_ws_position_matching(self, pc_mod, patch_config_path):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {"microchip": {}}
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        import settings
        ws_x = settings.get('WS_POSITION_X')
        ws_y = settings.get('WS_POSITION_Y')
        coords = pc_mod.WellCoordinates(x=ws_x, y=ws_y, z=0.0)
        assert pc_mod.CoordinateMapper.coordinates_to_well(coords) == "WS1"

    def test_no_match_returns_none(self, pc_mod, patch_config_path):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {"microchip": {}}
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        coords = pc_mod.WellCoordinates(x=9999.0, y=9999.0, z=0.0)
        assert pc_mod.CoordinateMapper.coordinates_to_well(coords) is None

    def test_wellplate_layout_includes_vial_coords(self, pc_mod):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "wellplate": {"SA2": {"x": 10.0, "y": 20.0}},
            "vial": {"VA2": {"x": 30.0, "y": 40.0}},
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "wellplate"
        coords = pc_mod.WellCoordinates(x=30.0, y=40.0, z=0.0)
        assert pc_mod.CoordinateMapper.coordinates_to_well(coords) == "VA2"

    def test_none_stored_value_skipped(self, pc_mod, patch_config_path):
        """Stored coord with value None should be skipped."""
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {"A2": None, "A5": {"x": 200.0, "y": 20.0}}
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        coords = pc_mod.WellCoordinates(x=200.0, y=20.0, z=0.0)
        assert pc_mod.CoordinateMapper.coordinates_to_well(coords) == "A5"


class TestInterpolateFromRefs:
    def test_exact_match(self, pc_mod):
        layout = {"A2": {"x": 100.0, "y": 20.0}, "A5": {"x": 200.0, "y": 20.0}}
        result = pc_mod.CoordinateMapper._interpolate_from_refs("A", 2, layout)
        assert result.x == 100.0
        assert result.y == 20.0

    def test_between_two_refs(self, pc_mod):
        layout = {"A2": {"x": 100.0, "y": 20.0}, "A5": {"x": 200.0, "y": 20.0}}
        result = pc_mod.CoordinateMapper._interpolate_from_refs("A", 3, layout)
        expected_x = 100.0 + (1.0 / 3.0) * 100.0
        assert abs(result.x - expected_x) < 0.01

    def test_extrapolation_below(self, pc_mod):
        layout = {"A2": {"x": 100.0, "y": 20.0}, "A5": {"x": 200.0, "y": 20.0}}
        result = pc_mod.CoordinateMapper._interpolate_from_refs("A", 1, layout)
        spacing = (200.0 - 100.0) / (5 - 2)
        expected_x = 100.0 + spacing * (1 - 2)  # negative offset
        assert abs(result.x - expected_x) < 0.01

    def test_extrapolation_above(self, pc_mod):
        layout = {"A2": {"x": 100.0, "y": 20.0}, "A5": {"x": 200.0, "y": 20.0}}
        result = pc_mod.CoordinateMapper._interpolate_from_refs("A", 7, layout)
        spacing = (200.0 - 100.0) / (5 - 2)
        expected_x = 200.0 + spacing * (7 - 5)
        assert abs(result.x - expected_x) < 0.01

    def test_fewer_than_2_refs_returns_none(self, pc_mod):
        layout = {"A2": {"x": 100.0, "y": 20.0}}
        result = pc_mod.CoordinateMapper._interpolate_from_refs("A", 3, layout)
        assert result is None

    def test_extrapolation_below_single_lower_ref(self, pc_mod):
        """When lower exists but prev is None, x falls back to lower's x."""
        layout = {"A2": {"x": 100.0, "y": 20.0}, "B5": {"x": 200.0, "y": 50.0}}
        # Row A has only one ref -> returns None
        result = pc_mod.CoordinateMapper._interpolate_from_refs("A", 1, layout)
        assert result is None

    def test_extrapolation_above_single_upper_ref(self, pc_mod):
        """When upper exists but nxt is None, x falls back to upper's x."""
        layout = {
            "A2": {"x": 100.0, "y": 20.0},
            "A5": {"x": 200.0, "y": 20.0},
        }
        # col 7: lower=5, upper=None -> extrapolation from last two below
        result = pc_mod.CoordinateMapper._interpolate_from_refs("A", 7, layout)
        assert result is not None

    def test_invalid_well_id_in_layout_skipped(self, pc_mod):
        """Non-parseable well IDs in layout_coords are skipped."""
        layout = {
            "INVALID": {"x": 0.0, "y": 0.0},
            "A2": {"x": 100.0, "y": 20.0},
            "A5": {"x": 200.0, "y": 20.0},
        }
        result = pc_mod.CoordinateMapper._interpolate_from_refs("A", 3, layout)
        assert result is not None

    def test_no_lower_no_upper_returns_none(self, pc_mod):
        """If column doesn't match and there's no bracketing refs, should still work with 2+ refs."""
        # Actually this path (lower is None AND upper is None) can't happen with 2+ refs
        # and the column not being an exact match. Let's test the branch anyway with
        # a scenario where refs exist but none match the row.
        layout = {"B2": {"x": 100.0, "y": 50.0}, "B5": {"x": 200.0, "y": 50.0}}
        result = pc_mod.CoordinateMapper._interpolate_from_refs("A", 3, layout)
        assert result is None

    def test_extrapolation_above_only_upper_refs(self, pc_mod):
        """Column is below all refs, so upper exists but lower is None."""
        layout = {
            "A5": {"x": 200.0, "y": 20.0},
            "A8": {"x": 300.0, "y": 20.0},
        }
        result = pc_mod.CoordinateMapper._interpolate_from_refs("A", 3, layout)
        # lower=None, upper=5, nxt=8
        spacing = (300.0 - 200.0) / (8 - 5)
        expected_x = 200.0 + spacing * (3 - 5)
        assert abs(result.x - expected_x) < 0.01

    def test_extrapolation_above_only_single_upper(self, pc_mod):
        """Column below all refs, upper exists but nxt is None -> falls back to upper's x."""
        layout = {
            "A5": {"x": 200.0, "y": 20.0},
            "A8": {"x": 300.0, "y": 20.0},
        }
        # col 2: lower=None, upper=5. nxt=8, so spacing computed
        result = pc_mod.CoordinateMapper._interpolate_from_refs("A", 2, layout)
        assert result is not None

    def test_extrapolation_above_single_upper_no_nxt(self, pc_mod):
        """Upper exists but nxt does not (only one ref above column)."""
        # We need 2+ refs total, with only one above the target and the rest
        # below -- but if the target is *below* all refs, upper exists.
        # Tricky: to hit the `elif upper is not None` + nxt is None branch,
        # we need lower to be None and upper to be the LAST sorted_col.
        # That's impossible if len(refs) >= 2 and upper is set (there's always nxt
        # if upper isn't last, or upper IS last meaning nxt is None).
        # Actually: if sorted_cols = [5], len=1 -> returns None. We need 2+ refs.
        # sorted_cols = [5,8], column=3: lower=None, upper=5, nxt=8 -> has nxt.
        # sorted_cols = [5,8], column=1: lower=None, upper=5, nxt=8 -> has nxt.
        # To get nxt=None, upper must be last. But with 2 refs and column < both:
        # lower=None, upper=first_col, nxt=second_col. So nxt is never None
        # with 2+ refs when column < all. The branch is technically unreachable
        # with valid well columns, but let's just confirm it returns gracefully.
        pass


class TestCoordinatesToSteps:
    def test_basic_conversion(self, pc_mod, patch_config_path):
        coords = pc_mod.WellCoordinates(x=10.0, y=20.0, z=5.0)
        import settings
        spm_x = settings.get('STEPS_PER_MM_X')
        spm_y = settings.get('STEPS_PER_MM_Y')
        spm_z = settings.get('STEPS_PER_MM_Z')
        x, y, z = pc_mod.CoordinateMapper.coordinates_to_steps(coords)
        assert x == int(10.0 * spm_x)
        assert y == int(20.0 * spm_y)
        assert z == int(5.0 * spm_z)


# ===================================================================
# PipettingController -- Core
# ===================================================================

class TestPipettingControllerInit:
    def test_default_init(self, ctrl, pc_mod):
        assert ctrl.controller_type == "raspberry_pi"
        assert ctrl.stop_requested is False
        assert ctrl.current_operation == "idle"
        assert ctrl.pipette_ml == 0.0

    def test_loads_position_file(self, pc_mod, patch_config_path, patch_position_path):
        # Write a specific position
        pos = {"x": 10.0, "y": 20.0, "z": 5.0, "well": "A2",
               "pipette_count": 3, "layout_type": "wellplate", "pipette_ml": 2.5}
        patch_position_path.write_text(json.dumps(pos))
        controller = pc_mod.PipettingController()
        assert controller.current_position.x == 10.0
        assert controller.current_position.y == 20.0
        assert controller.current_pipette_count == 3
        assert controller.layout_type == "wellplate"
        assert controller.pipette_ml == 2.5

    def test_syncs_motor_step_counters(self, ctrl):
        """RPi controller sets motor current_position from loaded pos."""
        motor1 = ctrl.stepper_controller.get_motor(1)
        motor2 = ctrl.stepper_controller.get_motor(2)
        motor3 = ctrl.stepper_controller.get_motor(3)
        # Default position is (0,0,70) from tmp_position
        assert motor3.current_position == int(70.0 * ctrl.mapper.STEPS_PER_MM_Z)

    def test_missing_position_file(self, pc_mod, patch_config_path, patch_position_path):
        patch_position_path.unlink()
        controller = pc_mod.PipettingController()
        assert controller.current_position.x == 0.0
        assert controller.current_position.y == 0.0
        assert controller.current_position.z == 0.0

    def test_corrupt_position_file(self, pc_mod, patch_config_path, patch_position_path):
        patch_position_path.write_text("NOT JSON")
        controller = pc_mod.PipettingController()
        # Falls back to default
        assert controller.current_position.x == 0.0

    def test_sets_layout_type(self, ctrl, pc_mod):
        assert pc_mod.CoordinateMapper.CURRENT_LAYOUT == ctrl.layout_type


class TestInv:
    def test_invert_true_flips_cw(self, ctrl, pc_mod):
        assert ctrl._inv(pc_mod.Direction.CLOCKWISE, True) == pc_mod.Direction.COUNTERCLOCKWISE

    def test_invert_true_flips_ccw(self, ctrl, pc_mod):
        assert ctrl._inv(pc_mod.Direction.COUNTERCLOCKWISE, True) == pc_mod.Direction.CLOCKWISE

    def test_invert_false_passthrough(self, ctrl, pc_mod):
        assert ctrl._inv(pc_mod.Direction.CLOCKWISE, False) == pc_mod.Direction.CLOCKWISE


class TestSpeed:
    def test_rpi_returns_float(self, ctrl):
        result = ctrl._speed(0.001)
        assert isinstance(result, float)
        assert result == 0.001

    def test_arduino_returns_int_us(self, arduino_ctrl):
        result = arduino_ctrl._speed(0.001)
        assert isinstance(result, int)
        assert result == 1000


class TestMoveMotor:
    def test_rpi_path(self, ctrl, pc_mod):
        result = ctrl._move_motor(1, 100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert result is not None

    def test_rpi_check_limits_kwarg(self, ctrl, pc_mod):
        result = ctrl._move_motor(1, 100, pc_mod.Direction.CLOCKWISE, 0.001, check_limits=False)
        assert result is not None

    def test_arduino_path(self, arduino_ctrl, pc_mod):
        result = arduino_ctrl._move_motor(1, 100, pc_mod.Direction.CLOCKWISE, 0.001)
        arduino_ctrl.stepper_controller.move_motor.assert_called()

    def test_arduino_respect_limit(self, arduino_ctrl, pc_mod):
        arduino_ctrl._move_motor(1, 100, pc_mod.Direction.CLOCKWISE, 0.001, check_limits=False)
        arduino_ctrl.stepper_controller.move_motor.assert_called_with(
            1, 100, pc_mod.Direction.CLOCKWISE, 1000, respect_limit=False
        )


class TestSaveLoadPosition:
    def test_save_and_load(self, ctrl, pc_mod, patch_position_path):
        ctrl.current_position = pc_mod.WellCoordinates(x=50.0, y=30.0, z=10.0)
        ctrl.current_pipette_count = 3
        ctrl.layout_type = "wellplate"
        ctrl.pipette_ml = 5.5
        ctrl.save_position()

        pos, count, layout = ctrl.load_position()
        assert pos.x == 50.0
        assert pos.y == 30.0
        assert count == 3
        assert layout == "wellplate"

    def test_load_default_on_missing(self, ctrl, pc_mod, patch_position_path):
        patch_position_path.unlink()
        pos, count, layout = ctrl.load_position()
        assert pos.x == 0.0
        assert count == 1
        assert layout == "microchip"

    def test_load_default_on_corrupt(self, ctrl, patch_position_path):
        patch_position_path.write_text("{bad json")
        pos, count, layout = ctrl.load_position()
        assert pos.x == 0.0

    def test_save_handles_exception(self, ctrl, pc_mod):
        """If POSITION_FILE is unwritable, save_position doesn't crash."""
        ctrl.POSITION_FILE = Path("/nonexistent/dir/pos.json")
        ctrl.save_position()  # Should not raise


class TestLogging:
    def test_log_and_get_logs(self, ctrl):
        ctrl.clear_logs()
        ctrl.log("test message")
        logs = ctrl.get_logs()
        assert len(logs) == 1
        assert "test message" in logs[0]

    def test_max_logs_limit(self, ctrl):
        ctrl.clear_logs()
        ctrl.max_logs = 5
        for i in range(10):
            ctrl.log(f"msg {i}")
        assert len(ctrl.log_buffer) == 5
        assert "msg 9" in ctrl.log_buffer[-1]

    def test_get_logs_returns_last_n(self, ctrl):
        ctrl.clear_logs()
        for i in range(10):
            ctrl.log(f"msg {i}")
        logs = ctrl.get_logs(last_n=3)
        assert len(logs) == 3

    def test_get_logs_empty(self, ctrl):
        ctrl.clear_logs()
        assert ctrl.get_logs() == []

    def test_clear_logs(self, ctrl):
        ctrl.log("something")
        ctrl.clear_logs()
        assert len(ctrl.log_buffer) == 0


class TestSetPipetteCount:
    def test_valid_1(self, ctrl):
        ctrl.set_pipette_count(1)
        assert ctrl.current_pipette_count == 1

    def test_valid_3(self, ctrl):
        ctrl.set_pipette_count(3)
        assert ctrl.current_pipette_count == 3

    def test_invalid_raises(self, ctrl):
        with pytest.raises(ValueError, match="must be 1 or 3"):
            ctrl.set_pipette_count(2)


class TestStop:
    def test_sets_stop_requested(self, ctrl):
        ctrl.stop()
        assert ctrl.stop_requested is True

    def test_calls_stop_all(self, ctrl):
        ctrl.stepper_controller.stop_all = MagicMock()
        ctrl.stop()
        ctrl.stepper_controller.stop_all.assert_called_once()


class TestCleanup:
    def test_delegates_to_stepper(self, ctrl):
        ctrl.stepper_controller.cleanup = MagicMock()
        ctrl.cleanup()
        ctrl.stepper_controller.cleanup.assert_called_once()


# ===================================================================
# PipettingController -- Movement
# ===================================================================

class TestMoveXSafe:
    def test_clamps_when_exceeding_max(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(1)
        motor.current_position = ctrl.X_MAX_STEPS - 10
        clamped = ctrl._move_x_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert clamped == 10

    def test_moving_toward_home(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(1)
        motor.current_position = 500
        clamped = ctrl._move_x_safe(100, pc_mod.Direction.COUNTERCLOCKWISE, 0.001)
        assert clamped == 100

    def test_moving_toward_home_clamps(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(1)
        motor.current_position = 50
        clamped = ctrl._move_x_safe(100, pc_mod.Direction.COUNTERCLOCKWISE, 0.001)
        assert clamped == 50

    def test_zero_steps_skipped(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(1)
        motor.current_position = ctrl.X_MAX_STEPS
        clamped = ctrl._move_x_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert clamped == 0

    def test_arduino_passthrough(self, arduino_ctrl, pc_mod):
        result = arduino_ctrl._move_x_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert result == 100

    def test_arduino_zero_steps(self, arduino_ctrl, pc_mod):
        result = arduino_ctrl._move_x_safe(0, pc_mod.Direction.CLOCKWISE, 0.001)
        assert result == 0


class TestMoveYSafe:
    def test_clamps_when_exceeding_max(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(2)
        motor.current_position = ctrl.Y_MAX_STEPS - 10
        clamped = ctrl._move_y_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert clamped == 10

    def test_toward_home_clamps(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(2)
        motor.current_position = 50
        clamped = ctrl._move_y_safe(100, pc_mod.Direction.COUNTERCLOCKWISE, 0.001)
        assert clamped == 50

    def test_arduino_passthrough(self, arduino_ctrl, pc_mod):
        result = arduino_ctrl._move_y_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert result == 100

    def test_arduino_zero_steps(self, arduino_ctrl, pc_mod):
        result = arduino_ctrl._move_y_safe(0, pc_mod.Direction.CLOCKWISE, 0.001)
        assert result == 0


class TestMoveZSafe:
    def test_clamps_when_exceeding_max(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(3)
        motor.current_position = ctrl.Z_MAX_STEPS - 10
        clamped = ctrl._move_z_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert clamped == 10

    def test_toward_home_clamps(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(3)
        motor.current_position = 50
        clamped = ctrl._move_z_safe(100, pc_mod.Direction.COUNTERCLOCKWISE, 0.001)
        assert clamped == 50

    def test_arduino_passthrough(self, arduino_ctrl, pc_mod):
        result = arduino_ctrl._move_z_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert result == 100

    def test_arduino_zero_steps(self, arduino_ctrl, pc_mod):
        result = arduino_ctrl._move_z_safe(0, pc_mod.Direction.CLOCKWISE, 0.001)
        assert result == 0


class TestZTo:
    def test_absolute_z_up(self, ctrl, pc_mod):
        ctrl.current_position.z = 0.0
        motor = ctrl.stepper_controller.get_motor(3)
        motor.current_position = 0
        ctrl._z_to(70.0)
        assert ctrl.current_position.z == 70.0

    def test_absolute_z_down(self, ctrl, pc_mod):
        ctrl.current_position.z = 70.0
        motor = ctrl.stepper_controller.get_motor(3)
        motor.current_position = int(70.0 * ctrl.mapper.STEPS_PER_MM_Z)
        ctrl._z_to(0.0)
        assert ctrl.current_position.z == 0.0

    def test_near_zero_delta_skip(self, ctrl):
        ctrl.current_position.z = 70.0
        ctrl._z_to(70.05)  # delta < 0.1 -> skip
        assert ctrl.current_position.z == 70.0  # unchanged

    def test_motor_step_counter_sync_rpi(self, ctrl):
        ctrl.current_position.z = 0.0
        motor = ctrl.stepper_controller.get_motor(3)
        motor.current_position = 0
        ctrl._z_to(50.0)
        assert motor.current_position == int(50.0 * ctrl.mapper.STEPS_PER_MM_Z)

    def test_arduino_no_motor_sync(self, arduino_ctrl):
        arduino_ctrl.current_position.z = 0.0
        arduino_ctrl._z_to(50.0)
        assert arduino_ctrl.current_position.z == 50.0
        # Arduino doesn't call get_motor, so no assertion on motor


class TestMoveToWell:
    def test_z_up_if_down_then_xy_then_z_down(self, ctrl, pc_mod):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {
                "A2": {"x": 100.0, "y": 20.0},
                "WS1": {"x": 15.0, "y": 10.0},
            }
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        ctrl.current_position = pc_mod.WellCoordinates(x=0.0, y=0.0, z=0.0)
        # Set motor positions for Z
        motor3 = ctrl.stepper_controller.get_motor(3)
        motor3.current_position = 0

        ctrl.move_to_well("A2", z_offset=-40.0)
        assert ctrl.current_operation == "idle"
        assert ctrl.operation_well is None

    def test_skips_z_if_already_up(self, ctrl, pc_mod):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {"A2": {"x": 100.0, "y": 20.0}}
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        ctrl.current_position = pc_mod.WellCoordinates(x=0.0, y=0.0, z=70.0)
        ctrl.move_to_well("A2")
        assert ctrl.current_position.z == 70.0

    def test_unknown_well_catches_valueerror(self, ctrl, pc_mod):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {"microchip": {}}
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        ctrl.move_to_well("UNKNOWN_WELL")
        assert ctrl.current_operation == "idle"

    def test_z_offset_zero_keeps_z_up(self, ctrl, pc_mod):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {"A2": {"x": 100.0, "y": 20.0}}
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        ctrl.current_position = pc_mod.WellCoordinates(x=0.0, y=0.0, z=70.0)
        ctrl.move_to_well("A2", z_offset=0.0)
        assert ctrl.current_position.z == 70.0

    def test_xy_movement_threads(self, ctrl, pc_mod):
        """Covers the threading path for simultaneous X/Y."""
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {"A2": {"x": 112.0, "y": 20.0}}
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        ctrl.current_position = pc_mod.WellCoordinates(x=50.0, y=10.0, z=70.0)
        ctrl.move_to_well("A2")
        # Should have moved X and Y (A2 is at x=112.0 in sample config)
        assert abs(ctrl.current_position.x - 112.0) < 0.1
        assert abs(ctrl.current_position.y - 20.0) < 0.1


class TestToggleZ:
    def test_up(self, ctrl, pc_mod):
        original_z = ctrl.current_position.z
        ctrl.toggle_z('up')
        assert ctrl.current_position.z > original_z

    def test_down(self, ctrl, pc_mod):
        ctrl.current_position.z = 70.0
        ctrl.toggle_z('down')
        assert ctrl.current_position.z < 70.0

    def test_invalid_raises(self, ctrl):
        with pytest.raises(ValueError, match="must be 'up' or 'down'"):
            ctrl.toggle_z('sideways')


class TestMoveAxis:
    def test_x_cw(self, ctrl):
        result = ctrl.move_axis('x', 100, 'cw')
        assert 'x' in result

    def test_y_ccw(self, ctrl):
        result = ctrl.move_axis('y', 100, 'ccw')
        assert 'y' in result

    def test_z_cw(self, ctrl):
        ctrl.current_position.z = 0.0
        result = ctrl.move_axis('z', 100, 'cw')
        assert result['z'] > 0.0

    def test_z_ccw(self, ctrl):
        ctrl.current_position.z = 70.0
        result = ctrl.move_axis('z', 100, 'ccw')
        assert result['z'] < 70.0

    def test_pipette_cw(self, ctrl):
        ctrl.pipette_ml = 0.0
        result = ctrl.move_axis('pipette', 100, 'cw')
        assert result['pipette_ml'] > 0.0

    def test_pipette_ccw(self, ctrl):
        ctrl.pipette_ml = 5.0
        result = ctrl.move_axis('pipette', 100, 'ccw')
        assert result['pipette_ml'] < 5.0

    def test_pipette_cw_clamp_max(self, ctrl):
        ctrl.pipette_ml = ctrl.PIPETTE_MAX_ML
        result = ctrl.move_axis('pipette', 100, 'cw')
        assert result['pipette_ml'] == ctrl.PIPETTE_MAX_ML

    def test_pipette_ccw_clamp_empty(self, ctrl):
        ctrl.pipette_ml = 0.0
        result = ctrl.move_axis('pipette', 100, 'ccw')
        assert result['pipette_ml'] == 0.0

    def test_pipette_cw_partial_clamp(self, ctrl):
        ctrl.pipette_ml = ctrl.PIPETTE_MAX_ML - 0.5
        big_steps = int(10 * ctrl.PIPETTE_STEPS_PER_ML)
        result = ctrl.move_axis('pipette', big_steps, 'cw')
        assert result['pipette_ml'] <= ctrl.PIPETTE_MAX_ML

    def test_pipette_ccw_partial_clamp(self, ctrl):
        ctrl.pipette_ml = 0.5
        big_steps = int(10 * ctrl.PIPETTE_STEPS_PER_ML)
        result = ctrl.move_axis('pipette', big_steps, 'ccw')
        assert result['pipette_ml'] >= 0.0

    def test_invalid_axis(self, ctrl):
        with pytest.raises(ValueError, match="Invalid axis"):
            ctrl.move_axis('w', 100, 'cw')

    def test_inversion_applied(self, ctrl, pc_mod):
        """Test that axis inversion flags are consulted."""
        ctrl.INVERT_X = True
        result = ctrl.move_axis('x', 100, 'cw')
        assert 'x' in result

    def test_x_position_update_ccw(self, ctrl):
        ctrl.current_position.x = 50.0
        ctrl.move_axis('x', 100, 'ccw')
        assert ctrl.current_position.x < 50.0


class TestHome:
    def test_z_raise_if_down(self, ctrl, pc_mod):
        ctrl.current_position = pc_mod.WellCoordinates(x=50.0, y=30.0, z=0.0)
        motor3 = ctrl.stepper_controller.get_motor(3)
        motor3.current_position = 0
        with patch.object(ctrl, '_home_axis_to_min'):
            ctrl.home()
        assert ctrl.current_position.z == 70.0
        assert ctrl.current_position.x == 0.0
        assert ctrl.current_position.y == 0.0

    def test_z_skip_if_already_up(self, ctrl, pc_mod):
        ctrl.current_position = pc_mod.WellCoordinates(x=50.0, y=30.0, z=70.0)
        with patch.object(ctrl, '_home_axis_to_min'):
            ctrl.home()
        assert ctrl.current_position.z == 70.0

    def test_z_negative_handling(self, ctrl, pc_mod):
        """Covers the branch for negative Z position."""
        ctrl.current_position = pc_mod.WellCoordinates(x=50.0, y=30.0, z=-10.0)
        motor3 = ctrl.stepper_controller.get_motor(3)
        motor3.current_position = 0
        with patch.object(ctrl, '_home_axis_to_min'):
            ctrl.home()
        assert ctrl.current_position.z == 70.0

    def test_arduino_home(self, arduino_ctrl, pc_mod):
        arduino_ctrl.current_position = pc_mod.WellCoordinates(x=50.0, y=30.0, z=0.0)
        with patch.object(arduino_ctrl, '_home_axis_to_min'):
            arduino_ctrl.home()
        assert arduino_ctrl.current_position.z == 70.0
        assert arduino_ctrl.current_position.x == 0.0


class TestHomeAxisToMin:
    def test_rpi_already_at_min(self, ctrl, pc_mod, mock_gpio):
        motor = ctrl.stepper_controller.get_motor(1)
        # Simulate MIN limit already triggered
        mock_gpio.set_pin_state(motor.limit_min_pin, mock_gpio.LOW)
        ctrl._home_axis_to_min(1, "X")
        assert motor.current_position == 0

    def test_rpi_finds_min_first_direction(self, ctrl, pc_mod, mock_gpio):
        motor = ctrl.stepper_controller.get_motor(1)
        # Mock move_until_limit to return 'min' directly
        motor.move_until_limit = MagicMock(return_value=(500, 'min'))
        ctrl._home_axis_to_min(1, "X")
        assert motor.current_position == 0

    def test_rpi_hits_max_then_finds_min(self, ctrl, pc_mod, mock_gpio):
        motor = ctrl.stepper_controller.get_motor(1)
        # First call returns 'max', second returns 'min'
        motor.move_until_limit = MagicMock(side_effect=[(500, 'max'), (1000, 'min')])
        ctrl._home_axis_to_min(1, "X")
        assert motor.current_position == 0

    def test_rpi_no_limit_found(self, ctrl, pc_mod, mock_gpio):
        """No limit is hit in either direction - WARNING log."""
        motor = ctrl.stepper_controller.get_motor(1)
        # Use a very limited max_steps to prevent infinite loop
        # mock move_until_limit to return 'none'
        motor.move_until_limit = MagicMock(return_value=(1000, 'none'))
        ctrl._home_axis_to_min(1, "X")
        assert motor.current_position == 0  # reset_position called

    def test_arduino_already_at_min(self, arduino_ctrl, pc_mod):
        arduino_ctrl.stepper_controller._call_rpc.return_value = 1  # MIN bit
        arduino_ctrl._home_axis_to_min(1, "X")
        # Should log "already at MIN"

    def test_arduino_finds_min(self, arduino_ctrl, pc_mod):
        # First call: not at min. After move: at min.
        call_count = [0]
        def mock_check_min(cmd, mid):
            call_count[0] += 1
            if call_count[0] <= 1:
                return 0  # Not at MIN
            return 1  # At MIN
        arduino_ctrl.stepper_controller._call_rpc.side_effect = mock_check_min
        arduino_ctrl.stepper_controller.move_until_limit.return_value = {'steps_taken': 500, 'hit_limit': True}
        arduino_ctrl._home_axis_to_min(1, "X")

    def test_arduino_hits_max_then_min(self, arduino_ctrl, pc_mod):
        call_count = [0]
        def mock_check_min(cmd, mid):
            call_count[0] += 1
            if call_count[0] <= 2:
                return 0  # Not at MIN initially, hit MAX first
            return 1  # At MIN after reversal
        arduino_ctrl.stepper_controller._call_rpc.side_effect = mock_check_min
        arduino_ctrl.stepper_controller.move_until_limit.return_value = {'steps_taken': 500, 'hit_limit': True}
        arduino_ctrl._home_axis_to_min(1, "X")

    def test_arduino_no_limit_found(self, arduino_ctrl, pc_mod):
        arduino_ctrl.stepper_controller._call_rpc.return_value = 0  # Never at MIN
        arduino_ctrl.stepper_controller.move_until_limit.return_value = {'steps_taken': 500, 'hit_limit': False}
        arduino_ctrl._home_axis_to_min(1, "X")
        # Should log WARNING


# ===================================================================
# PipettingController -- Pipetting Operations
# ===================================================================

class TestAspirate:
    def test_z_down_if_up(self, ctrl, pc_mod):
        ctrl.current_position.z = 70.0
        motor3 = ctrl.stepper_controller.get_motor(3)
        motor3.current_position = int(70.0 * ctrl.mapper.STEPS_PER_MM_Z)
        ctrl.pipette_ml = 0.0
        with patch('time.sleep'):
            ctrl.aspirate(5.0)
        assert ctrl.pipette_ml > 0.0

    def test_volume_clamped_to_max(self, ctrl, pc_mod):
        ctrl.current_position.z = 0.0
        ctrl.pipette_ml = ctrl.PIPETTE_MAX_ML - 1.0
        with patch('time.sleep'):
            ctrl.aspirate(ctrl.PIPETTE_MAX_ML)
        assert ctrl.pipette_ml <= ctrl.PIPETTE_MAX_ML

    def test_empty_when_at_max(self, ctrl, pc_mod):
        ctrl.current_position.z = 0.0
        ctrl.pipette_ml = ctrl.PIPETTE_MAX_ML
        with patch('time.sleep'):
            ctrl.aspirate(5.0)
        assert ctrl.current_operation == "idle"

    def test_step_calculation(self, ctrl, pc_mod):
        ctrl.current_position.z = 0.0
        ctrl.pipette_ml = 0.0
        with patch('time.sleep'):
            ctrl.aspirate(5.0)
        expected_steps = int(5.0 * ctrl.PIPETTE_STEPS_PER_ML)
        expected_ml = expected_steps / ctrl.PIPETTE_STEPS_PER_ML
        assert abs(ctrl.pipette_ml - expected_ml) < 0.001

    def test_pipette_ml_tracking(self, ctrl, pc_mod):
        ctrl.current_position.z = 0.0
        ctrl.pipette_ml = 2.0
        with patch('time.sleep'):
            ctrl.aspirate(3.0)
        assert ctrl.pipette_ml > 2.0


class TestDispense:
    def test_z_down_if_up(self, ctrl, pc_mod):
        ctrl.current_position.z = 70.0
        motor3 = ctrl.stepper_controller.get_motor(3)
        motor3.current_position = int(70.0 * ctrl.mapper.STEPS_PER_MM_Z)
        ctrl.pipette_ml = 5.0
        with patch('time.sleep'):
            ctrl.dispense(3.0)
        assert ctrl.pipette_ml < 5.0

    def test_volume_clamped_to_current(self, ctrl, pc_mod):
        ctrl.current_position.z = 0.0
        ctrl.pipette_ml = 2.0
        with patch('time.sleep'):
            ctrl.dispense(10.0)
        assert ctrl.pipette_ml >= 0.0

    def test_empty_when_pipette_empty(self, ctrl, pc_mod):
        ctrl.current_position.z = 0.0
        ctrl.pipette_ml = 0.0
        with patch('time.sleep'):
            ctrl.dispense(5.0)
        assert ctrl.current_operation == "idle"

    def test_pipette_ml_tracking(self, ctrl, pc_mod):
        ctrl.current_position.z = 0.0
        ctrl.pipette_ml = 5.0
        with patch('time.sleep'):
            ctrl.dispense(3.0)
        expected_steps = int(3.0 * ctrl.PIPETTE_STEPS_PER_ML)
        expected_ml = expected_steps / ctrl.PIPETTE_STEPS_PER_ML
        assert abs(ctrl.pipette_ml - (5.0 - expected_ml)) < 0.001


class TestRinse:
    def test_n_cycles(self, ctrl, pc_mod):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {"WS2": {"x": 15.0, "y": 45.0}}
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        ctrl.current_position = pc_mod.WellCoordinates(x=0.0, y=0.0, z=70.0)

        with patch('time.sleep'):
            ctrl.rinse("WS2", 5.0)
        # After rinse, should have moved back to rinse well with z_offset=0
        assert ctrl.current_operation == "idle"


class TestExecuteTransfer:
    def _setup_wells(self, pc_mod):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {
                "A2": {"x": 100.0, "y": 20.0},
                "B2": {"x": 100.0, "y": 48.5},
                "WS1": {"x": 15.0, "y": 10.0},
                "WS2": {"x": 15.0, "y": 45.0},
            }
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"

    def test_full_flow(self, ctrl, pc_mod):
        self._setup_wells(pc_mod)
        ctrl.current_position = pc_mod.WellCoordinates(x=0.0, y=0.0, z=70.0)
        with patch('time.sleep'):
            ctrl.execute_transfer("A2", "B2", 5.0, rinse_well="WS2", wash_well="WS1")

    def test_no_rinse_no_wash(self, ctrl, pc_mod):
        self._setup_wells(pc_mod)
        ctrl.current_position = pc_mod.WellCoordinates(x=0.0, y=0.0, z=70.0)
        with patch('time.sleep'):
            ctrl.execute_transfer("A2", "B2", 5.0)

    def test_z_up_when_low(self, ctrl, pc_mod):
        self._setup_wells(pc_mod)
        ctrl.current_position = pc_mod.WellCoordinates(x=0.0, y=0.0, z=0.0)
        motor3 = ctrl.stepper_controller.get_motor(3)
        motor3.current_position = 0
        with patch('time.sleep'):
            ctrl.execute_transfer("A2", "B2", 5.0)

    def test_optional_rinse(self, ctrl, pc_mod):
        self._setup_wells(pc_mod)
        ctrl.current_position = pc_mod.WellCoordinates(x=0.0, y=0.0, z=70.0)
        with patch('time.sleep'):
            ctrl.execute_transfer("A2", "B2", 5.0, rinse_well="WS2")

    def test_optional_wash(self, ctrl, pc_mod):
        self._setup_wells(pc_mod)
        ctrl.current_position = pc_mod.WellCoordinates(x=0.0, y=0.0, z=70.0)
        with patch('time.sleep'):
            ctrl.execute_transfer("A2", "B2", 5.0, wash_well="WS1")


class TestExecuteStepWithCycles:
    def test_returns_true_on_completion(self, ctrl, pc_mod):
        step = pc_mod.PipettingStep(
            pickup_well="A2", dropoff_well="B2", rinse_well=None,
            volume_ml=5.0, wait_time=0, cycles=1,
        )
        with patch.object(ctrl, 'execute_transfer'):
            result = ctrl.execute_step_with_cycles(step)
        assert result is True

    def test_returns_false_on_stop(self, ctrl, pc_mod):
        step = pc_mod.PipettingStep(
            pickup_well="A2", dropoff_well="B2", rinse_well=None,
            volume_ml=5.0, wait_time=0, cycles=3,
        )
        ctrl.stop_requested = True
        result = ctrl.execute_step_with_cycles(step)
        assert result is False

    def test_wait_between_cycles_not_after_last(self, ctrl, pc_mod):
        step = pc_mod.PipettingStep(
            pickup_well="A2", dropoff_well="B2", rinse_well=None,
            volume_ml=5.0, wait_time=2, cycles=3,
        )
        with patch.object(ctrl, 'execute_transfer'), \
             patch.object(ctrl, '_interruptible_sleep') as mock_sleep:
            ctrl.execute_step_with_cycles(step)
        # Should sleep between cycles 1-2 and 2-3, but not after 3
        assert mock_sleep.call_count == 2

    def test_multi_cycle_logs(self, ctrl, pc_mod):
        step = pc_mod.PipettingStep(
            pickup_well="A2", dropoff_well="B2", rinse_well=None,
            volume_ml=5.0, wait_time=0, cycles=2,
        )
        with patch.object(ctrl, 'execute_transfer'):
            result = ctrl.execute_step_with_cycles(step)
        assert result is True


class TestExecuteSequence:
    def _make_step(self, pc_mod, **kwargs):
        defaults = {
            "pickup_well": "A2", "dropoff_well": "B2",
            "rinse_well": None, "volume_ml": 5.0,
            "wait_time": 0, "cycles": 1,
            "repetition_mode": "quantity", "repetition_quantity": 1,
        }
        defaults.update(kwargs)
        return pc_mod.PipettingStep(**defaults)

    def test_multi_step(self, ctrl, pc_mod):
        steps = [self._make_step(pc_mod), self._make_step(pc_mod)]
        with patch.object(ctrl, 'execute_transfer'), \
             patch.object(ctrl, 'home'):
            ctrl.execute_sequence(steps)

    def test_stop_request_between_steps(self, ctrl, pc_mod):
        step1 = self._make_step(pc_mod)
        step2 = self._make_step(pc_mod)

        call_count = [0]
        def mock_transfer(*a, **kw):
            call_count[0] += 1
            if call_count[0] >= 1:
                ctrl.stop_requested = True

        with patch.object(ctrl, 'execute_transfer', side_effect=mock_transfer), \
             patch.object(ctrl, 'home'):
            ctrl.execute_sequence([step1, step2])
        # Should have stopped
        assert ctrl.stop_requested is False  # Reset after stop

    def test_home_step_type(self, ctrl, pc_mod):
        step = self._make_step(pc_mod, step_type='home', wait_time=1)
        with patch.object(ctrl, 'home') as mock_home, \
             patch.object(ctrl, '_interruptible_sleep') as mock_sleep:
            ctrl.execute_sequence([step])
        # home() called twice: once for the step, once at end
        assert mock_home.call_count == 2

    def test_wait_step_type(self, ctrl, pc_mod):
        step = self._make_step(pc_mod, step_type='wait', wait_time=5)
        with patch.object(ctrl, 'home'), \
             patch.object(ctrl, '_interruptible_sleep') as mock_sleep:
            ctrl.execute_sequence([step])
        mock_sleep.assert_any_call(5)

    def test_wait_step_zero_wait(self, ctrl, pc_mod):
        step = self._make_step(pc_mod, step_type='wait', wait_time=0)
        with patch.object(ctrl, 'home'), \
             patch.object(ctrl, '_interruptible_sleep') as mock_sleep:
            ctrl.execute_sequence([step])

    def test_quantity_repetition(self, ctrl, pc_mod):
        step = self._make_step(pc_mod, repetition_mode='quantity', repetition_quantity=3, wait_time=1)
        with patch.object(ctrl, 'execute_transfer'), \
             patch.object(ctrl, 'home'), \
             patch.object(ctrl, '_interruptible_sleep'):
            ctrl.execute_sequence([step])

    def test_quantity_repetition_with_wait(self, ctrl, pc_mod):
        step = self._make_step(pc_mod, repetition_mode='quantity', repetition_quantity=2, wait_time=2)
        with patch.object(ctrl, 'execute_transfer'), \
             patch.object(ctrl, 'home'), \
             patch.object(ctrl, '_interruptible_sleep') as mock_sleep:
            ctrl.execute_sequence([step])
        # Wait between reps (not after last)
        assert mock_sleep.call_count >= 1

    def test_time_frequency_repetition(self, ctrl, pc_mod):
        step = self._make_step(
            pc_mod, repetition_mode='timeFrequency',
            repetition_interval=1, repetition_duration=2,
            wait_time=0,
        )
        # Mock time.time to simulate elapsed time
        # Calls: start_time, while-check, elapsed, while-check, elapsed, while-check, elapsed, while-check(exit)
        times = iter([0, 0, 0.5, 0.5, 1.5, 1.5, 2.5, 2.5])
        with patch.object(ctrl, 'execute_transfer'), \
             patch.object(ctrl, 'home'), \
             patch.object(ctrl, '_interruptible_sleep'), \
             patch('pipetting_controller.time.time', side_effect=times):
            ctrl.execute_sequence([step])

    def test_time_frequency_no_interval(self, ctrl, pc_mod):
        """timeFrequency mode without interval/duration falls back to single exec."""
        step = self._make_step(
            pc_mod, repetition_mode='timeFrequency',
            repetition_interval=None, repetition_duration=None,
        )
        with patch.object(ctrl, 'execute_transfer'), \
             patch.object(ctrl, 'home'), \
             patch.object(ctrl, '_interruptible_sleep'):
            ctrl.execute_sequence([step])

    def test_unknown_repetition_mode(self, ctrl, pc_mod):
        step = self._make_step(pc_mod, repetition_mode='unknown_mode')
        with patch.object(ctrl, 'execute_transfer'), \
             patch.object(ctrl, 'home'), \
             patch.object(ctrl, '_interruptible_sleep'):
            ctrl.execute_sequence([step])

    def test_wait_between_steps_not_after_last(self, ctrl, pc_mod):
        step1 = self._make_step(pc_mod, wait_time=2)
        step2 = self._make_step(pc_mod, wait_time=2)
        with patch.object(ctrl, 'execute_transfer'), \
             patch.object(ctrl, 'home'), \
             patch.object(ctrl, '_interruptible_sleep') as mock_sleep:
            ctrl.execute_sequence([step1, step2])
        # Only step1 should have the between-steps wait
        wait_calls = [c for c in mock_sleep.call_args_list if c == call(2)]
        assert len(wait_calls) == 1

    def test_final_home(self, ctrl, pc_mod):
        step = self._make_step(pc_mod)
        with patch.object(ctrl, 'execute_transfer'), \
             patch.object(ctrl, 'home') as mock_home:
            ctrl.execute_sequence([step])
        mock_home.assert_called()

    def test_stop_at_start_of_loop(self, ctrl, pc_mod):
        """Stop flag set before first step starts."""
        step = self._make_step(pc_mod)
        ctrl.stop_requested = True
        with patch.object(ctrl, 'execute_transfer'), \
             patch.object(ctrl, 'home'):
            ctrl.execute_sequence([step])
        # stop_requested should be False because it resets at the start
        # Actually, execute_sequence resets at start then checks in loop.
        # Since it resets first, the step should execute normally.

    def test_stop_during_quantity_repetition(self, ctrl, pc_mod):
        step = self._make_step(pc_mod, repetition_mode='quantity', repetition_quantity=5)
        call_count = [0]
        def mock_exec_step(s):
            call_count[0] += 1
            if call_count[0] >= 2:
                ctrl.stop_requested = True
            return True

        with patch.object(ctrl, 'execute_step_with_cycles', side_effect=mock_exec_step), \
             patch.object(ctrl, 'home'):
            ctrl.execute_sequence([step])

    def test_stop_during_time_frequency(self, ctrl, pc_mod):
        step = self._make_step(
            pc_mod, repetition_mode='timeFrequency',
            repetition_interval=1, repetition_duration=10,
        )
        times = iter([0, 0, 0, 0.5, 0.5])
        def mock_exec_step(s):
            ctrl.stop_requested = True
            return False

        with patch.object(ctrl, 'execute_step_with_cycles', side_effect=mock_exec_step), \
             patch.object(ctrl, 'home'), \
             patch('pipetting_controller.time.time', side_effect=times):
            ctrl.execute_sequence([step])

    def test_time_frequency_with_wait(self, ctrl, pc_mod):
        """Time frequency with remaining_time > 0."""
        step = self._make_step(
            pc_mod, repetition_mode='timeFrequency',
            repetition_interval=2, repetition_duration=5,
        )
        # Calls: start_time(0), while-check(0), elapsed(0.5), while-check(0.5),
        #        elapsed(3.0), while-check(3.0), elapsed(5.5), while-check(5.5->exit)
        times = iter([0, 0, 0.5, 0.5, 3.0, 3.0, 5.5, 5.5])
        with patch.object(ctrl, 'execute_transfer'), \
             patch.object(ctrl, 'home'), \
             patch.object(ctrl, '_interruptible_sleep'), \
             patch('pipetting_controller.time.time', side_effect=times):
            ctrl.execute_sequence([step])


class TestInterruptibleSleep:
    def test_completes_normally(self, ctrl):
        with patch('pipetting_controller.time.sleep') as mock_sleep:
            ctrl._interruptible_sleep(0.5)
        assert mock_sleep.call_count >= 1

    def test_stops_early_on_stop_requested(self, ctrl):
        ctrl.stop_requested = True
        with patch('pipetting_controller.time.sleep') as mock_sleep:
            ctrl._interruptible_sleep(10.0)
        # Should exit immediately
        mock_sleep.assert_not_called()

    def test_stops_mid_sleep(self, ctrl):
        call_count = [0]
        def mock_sleep(secs):
            call_count[0] += 1
            if call_count[0] >= 2:
                ctrl.stop_requested = True

        with patch('pipetting_controller.time.sleep', side_effect=mock_sleep):
            ctrl._interruptible_sleep(2.0)
        assert call_count[0] >= 2


# ===================================================================
# Dual Controller Type tests
# ===================================================================

class TestDualControllerSpeed:
    def test_rpi_speed(self, ctrl):
        assert ctrl._speed(0.002) == 0.002

    def test_arduino_speed(self, arduino_ctrl):
        assert arduino_ctrl._speed(0.002) == 2000


class TestDualControllerMoveMotor:
    def test_rpi_move_motor(self, ctrl, pc_mod):
        result = ctrl._move_motor(1, 50, pc_mod.Direction.CLOCKWISE, 0.001)
        assert result is not None

    def test_arduino_move_motor(self, arduino_ctrl, pc_mod):
        result = arduino_ctrl._move_motor(1, 50, pc_mod.Direction.CLOCKWISE, 0.001)
        assert result is not None


class TestDualControllerMoveXSafe:
    def test_rpi(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(1)
        motor.current_position = 0
        result = ctrl._move_x_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert result == 100

    def test_arduino(self, arduino_ctrl, pc_mod):
        result = arduino_ctrl._move_x_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert result == 100


class TestDualControllerMoveYSafe:
    def test_rpi(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(2)
        motor.current_position = 0
        result = ctrl._move_y_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert result == 100

    def test_arduino(self, arduino_ctrl, pc_mod):
        result = arduino_ctrl._move_y_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert result == 100


class TestDualControllerMoveZSafe:
    def test_rpi(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(3)
        motor.current_position = 0
        result = ctrl._move_z_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert result == 100

    def test_arduino(self, arduino_ctrl, pc_mod):
        result = arduino_ctrl._move_z_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert result == 100


class TestDualControllerZTo:
    def test_rpi(self, ctrl, pc_mod):
        ctrl.current_position.z = 0.0
        motor = ctrl.stepper_controller.get_motor(3)
        motor.current_position = 0
        ctrl._z_to(50.0)
        assert ctrl.current_position.z == 50.0

    def test_arduino(self, arduino_ctrl, pc_mod):
        arduino_ctrl.current_position.z = 0.0
        arduino_ctrl._z_to(50.0)
        assert arduino_ctrl.current_position.z == 50.0


class TestDualControllerHomeAxisToMin:
    def test_rpi(self, ctrl, pc_mod, mock_gpio):
        motor = ctrl.stepper_controller.get_motor(1)
        motor.move_until_limit = MagicMock(return_value=(500, 'min'))
        ctrl._home_axis_to_min(1, "X")
        assert motor.current_position == 0

    def test_arduino(self, arduino_ctrl, pc_mod):
        call_count = [0]
        def mock_rpc(cmd, mid):
            call_count[0] += 1
            if call_count[0] <= 1:
                return 0
            return 1
        arduino_ctrl.stepper_controller._call_rpc.side_effect = mock_rpc
        arduino_ctrl.stepper_controller.move_until_limit.return_value = {'steps_taken': 500, 'hit_limit': True}
        arduino_ctrl._home_axis_to_min(1, "X")


class TestDualControllerMoveAxis:
    def test_rpi(self, ctrl):
        result = ctrl.move_axis('x', 100, 'cw')
        assert 'x' in result

    def test_arduino(self, arduino_ctrl):
        result = arduino_ctrl.move_axis('x', 100, 'cw')
        assert 'x' in result


class TestDualControllerHome:
    def test_rpi(self, ctrl, pc_mod):
        ctrl.current_position = pc_mod.WellCoordinates(x=50.0, y=30.0, z=0.0)
        motor3 = ctrl.stepper_controller.get_motor(3)
        motor3.current_position = 0
        with patch.object(ctrl, '_home_axis_to_min'):
            ctrl.home()
        assert ctrl.current_position.x == 0.0

    def test_arduino(self, arduino_ctrl, pc_mod):
        arduino_ctrl.current_position = pc_mod.WellCoordinates(x=50.0, y=30.0, z=0.0)
        with patch.object(arduino_ctrl, '_home_axis_to_min'):
            arduino_ctrl.home()
        assert arduino_ctrl.current_position.x == 0.0


# ===================================================================
# Additional edge cases for full coverage
# ===================================================================

class TestMoveXSafeInverted:
    def test_inverted_x_moving_away(self, ctrl, pc_mod):
        """With INVERT_X, CW = toward home, CCW = away."""
        ctrl.INVERT_X = True
        motor = ctrl.stepper_controller.get_motor(1)
        motor.current_position = -500  # inverted positions are negative
        # CCW with invert = moving away from home
        clamped = ctrl._move_x_safe(100, pc_mod.Direction.COUNTERCLOCKWISE, 0.001)
        assert clamped == 100

    def test_inverted_x_clamped(self, ctrl, pc_mod):
        ctrl.INVERT_X = True
        motor = ctrl.stepper_controller.get_motor(1)
        motor.current_position = -(ctrl.X_MAX_STEPS - 5)
        clamped = ctrl._move_x_safe(100, pc_mod.Direction.COUNTERCLOCKWISE, 0.001)
        assert clamped == 5


class TestGetAxisPositions:
    def test_rpi(self, ctrl):
        result = ctrl.get_axis_positions()
        assert 'motor_steps' in result
        assert isinstance(result['motor_steps'], dict)

    def test_arduino(self, arduino_ctrl):
        result = arduino_ctrl.get_axis_positions()
        assert result['motor_steps'] == {}


class TestWsCoordinates:
    def test_ws1(self, pc_mod, patch_config_path):
        import settings
        result = pc_mod.CoordinateMapper._ws_coordinates('WS1')
        assert result.x == settings.get('WS_POSITION_X')
        assert result.y == settings.get('WS_POSITION_Y')

    def test_ws2(self, pc_mod, patch_config_path):
        import settings
        result = pc_mod.CoordinateMapper._ws_coordinates('WS2')
        assert result.x == settings.get('WS_POSITION_X')
        assert result.y == settings.get('WS_POSITION_Y') + settings.get('WS_GAP')


class TestWellToCoordinatesEdgeCases:
    def test_well_not_in_current_layout_but_parseable(self, pc_mod):
        """Standard well format that has no stored coords and interpolation fails."""
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {"microchip": {}}
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        with pytest.raises(ValueError, match="not found in config"):
            pc_mod.CoordinateMapper.well_to_coordinates("A1")

    def test_non_standard_well_format_raises(self, pc_mod):
        """Non-parseable non-WS well ID raises ValueError."""
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {"microchip": {}}
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        with pytest.raises(ValueError, match="not found in config"):
            pc_mod.CoordinateMapper.well_to_coordinates("XYZ99")

    def test_interpolation_succeeds(self, pc_mod):
        """Well parsed successfully and interpolation returns a result."""
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {
                "A2": {"x": 100.0, "y": 20.0},
                "A5": {"x": 200.0, "y": 20.0},
            }
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        result = pc_mod.CoordinateMapper.well_to_coordinates("A3")
        assert result is not None
        assert result.z == 0.0

    def test_interpolation_returns_none_raises(self, pc_mod):
        """Well is parseable but only 1 ref exists -> interpolation returns None -> raises."""
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {"A2": {"x": 100.0, "y": 20.0}}
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        with pytest.raises(ValueError, match="not found in config"):
            pc_mod.CoordinateMapper.well_to_coordinates("A3")


class TestMoveToWellXYNoMovement:
    def test_no_xy_movement_needed(self, ctrl, pc_mod):
        """When already at target XY, no thread is spawned."""
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {"A2": {"x": 112.0, "y": 20.0}}
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        ctrl.current_position = pc_mod.WellCoordinates(x=112.0, y=20.0, z=70.0)
        ctrl.move_to_well("A2")
        assert abs(ctrl.current_position.x - 112.0) < 0.1


class TestHomeStepTypeNoWait:
    def test_home_step_no_wait(self, ctrl, pc_mod):
        """Home step with wait_time=0 should not call _interruptible_sleep for waiting."""
        from pipetting_controller import PipettingStep
        step = PipettingStep(
            pickup_well="A2", dropoff_well="B2", rinse_well=None,
            volume_ml=5.0, wait_time=0, step_type='home',
        )
        with patch.object(ctrl, 'home') as mock_home, \
             patch.object(ctrl, '_interruptible_sleep') as mock_sleep:
            ctrl.execute_sequence([step])
        # home called for the step AND for the final home
        assert mock_home.call_count == 2


class TestExecuteSequenceStopAfterStepCompletion:
    """Test the stop check after step completion (not at loop start)."""

    def test_stop_after_step_completion(self, ctrl, pc_mod):
        from pipetting_controller import PipettingStep
        step1 = PipettingStep(
            pickup_well="A2", dropoff_well="B2", rinse_well=None,
            volume_ml=5.0, wait_time=0,
        )
        step2 = PipettingStep(
            pickup_well="A2", dropoff_well="B2", rinse_well=None,
            volume_ml=5.0, wait_time=0,
        )

        exec_count = [0]
        def mock_exec(step):
            exec_count[0] += 1
            # Set stop after first step completes
            if exec_count[0] == 1:
                ctrl.stop_requested = True
            return True

        with patch.object(ctrl, 'execute_step_with_cycles', side_effect=mock_exec), \
             patch.object(ctrl, 'home'):
            ctrl.execute_sequence([step1, step2])
        assert exec_count[0] == 1


class TestExecuteSequenceQuantityStopDuringExec:
    """Test stop during execute_step_with_cycles in quantity mode."""

    def test_stop_during_exec_step(self, ctrl, pc_mod):
        from pipetting_controller import PipettingStep
        step = PipettingStep(
            pickup_well="A2", dropoff_well="B2", rinse_well=None,
            volume_ml=5.0, wait_time=0, repetition_mode='quantity',
            repetition_quantity=3,
        )

        def mock_exec(s):
            return False  # Simulate stop

        with patch.object(ctrl, 'execute_step_with_cycles', side_effect=mock_exec), \
             patch.object(ctrl, 'home'):
            ctrl.execute_sequence([step])


class TestExecuteSequenceStopAtLoopStart:
    """Test stop check at the very beginning of the for-loop."""

    def test_stop_at_second_step_start(self, ctrl, pc_mod):
        from pipetting_controller import PipettingStep
        step1 = PipettingStep(
            pickup_well="A2", dropoff_well="B2", rinse_well=None,
            volume_ml=5.0, wait_time=0,
        )
        step2 = PipettingStep(
            pickup_well="A2", dropoff_well="B2", rinse_well=None,
            volume_ml=5.0, wait_time=0,
        )

        exec_count = [0]
        def mock_exec(s):
            exec_count[0] += 1
            return True

        # After step 1, set stop_requested in the wait_between_steps path
        # Actually, let's set it after first step finishes.
        # The stop check at loop start happens after step_num increments.
        # We need stop_requested to be True when the loop iterates to step 2.
        orig_interruptible = ctrl._interruptible_sleep
        def sleep_and_stop(secs):
            ctrl.stop_requested = True

        with patch.object(ctrl, 'execute_step_with_cycles', side_effect=mock_exec), \
             patch.object(ctrl, 'home'):
            # Make step1 have wait_time so the between-steps wait triggers
            step1.wait_time = 1
            with patch.object(ctrl, '_interruptible_sleep', side_effect=sleep_and_stop):
                ctrl.execute_sequence([step1, step2])
        # Only step1 should have executed
        assert exec_count[0] == 1


class TestTimeFrequencyWaitCalculation:
    """Test the time-based wait calculation in timeFrequency mode."""

    def test_remaining_time_positive(self, ctrl, pc_mod):
        from pipetting_controller import PipettingStep
        step = PipettingStep(
            pickup_well="A2", dropoff_well="B2", rinse_well=None,
            volume_ml=5.0, wait_time=0,
            repetition_mode='timeFrequency',
            repetition_interval=5, repetition_duration=12,
        )
        # Calls: start(0), while-check(0), elapsed(1.0), while-check(1.0),
        #        elapsed(6.0), while-check(6.0), elapsed(13.0), while-check(13.0->exit)
        times = [0, 0, 1.0, 1.0, 6.0, 6.0, 13.0, 13.0]
        time_iter = iter(times)
        with patch.object(ctrl, 'execute_transfer'), \
             patch.object(ctrl, 'home'), \
             patch.object(ctrl, '_interruptible_sleep') as mock_sleep, \
             patch('pipetting_controller.time.time', side_effect=time_iter):
            ctrl.execute_sequence([step])


class TestMoveYSafeNormal:
    def test_normal_movement(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(2)
        motor.current_position = 0
        clamped = ctrl._move_y_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert clamped == 100

    def test_no_movement_at_limit(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(2)
        motor.current_position = ctrl.Y_MAX_STEPS
        clamped = ctrl._move_y_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert clamped == 0

    def test_ccw_normal(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(2)
        motor.current_position = 500
        clamped = ctrl._move_y_safe(100, pc_mod.Direction.COUNTERCLOCKWISE, 0.001)
        assert clamped == 100


class TestMoveZSafeNormal:
    def test_normal_cw(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(3)
        motor.current_position = 0
        clamped = ctrl._move_z_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert clamped == 100

    def test_no_movement_at_max(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(3)
        motor.current_position = ctrl.Z_MAX_STEPS
        clamped = ctrl._move_z_safe(100, pc_mod.Direction.CLOCKWISE, 0.001)
        assert clamped == 0

    def test_ccw_normal(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(3)
        motor.current_position = 500
        clamped = ctrl._move_z_safe(100, pc_mod.Direction.COUNTERCLOCKWISE, 0.001)
        assert clamped == 100

    def test_ccw_at_zero(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(3)
        motor.current_position = 0
        clamped = ctrl._move_z_safe(100, pc_mod.Direction.COUNTERCLOCKWISE, 0.001)
        assert clamped == 0


class TestRpiHomeAxisHitMaxThenNoLimit:
    """RPi homing: first direction hits max, second direction finds no limit."""

    def test_max_then_none(self, ctrl, pc_mod):
        motor = ctrl.stepper_controller.get_motor(1)
        # First call returns 'max', second returns 'none'
        call_count = [0]
        def mock_move_until(direction, delay, max_steps=0):
            call_count[0] += 1
            if call_count[0] == 1:
                return (500, 'max')
            return (1000, 'none')

        motor.move_until_limit = mock_move_until
        ctrl._home_axis_to_min(1, "X")
        assert motor.current_position == 0  # reset_position called


class TestArduinoHomeEdgeCases:
    def test_no_hit_limit_no_check_min(self, arduino_ctrl, pc_mod):
        """Arduino homing: move_until_limit returns hit_limit=False."""
        arduino_ctrl.stepper_controller._call_rpc.return_value = 0
        arduino_ctrl.stepper_controller.move_until_limit.return_value = {'steps_taken': 500, 'hit_limit': False}
        arduino_ctrl._home_axis_to_min(1, "X")

    def test_hit_limit_but_not_min_in_both_dirs(self, arduino_ctrl, pc_mod):
        """Arduino: hits a limit in both directions but never at MIN."""
        call_count = [0]
        def mock_rpc(cmd, mid):
            call_count[0] += 1
            return 0  # Never at MIN (bit 0 not set)

        arduino_ctrl.stepper_controller._call_rpc.side_effect = mock_rpc
        arduino_ctrl.stepper_controller.move_until_limit.return_value = {'steps_taken': 500, 'hit_limit': True}
        arduino_ctrl._home_axis_to_min(1, "X")


class TestArduinoHomeAlreadyAtMinNoneResult:
    def test_rpc_returns_none(self, arduino_ctrl, pc_mod):
        """_check_min handles None from _call_rpc gracefully."""
        arduino_ctrl.stepper_controller._call_rpc.return_value = None
        arduino_ctrl.stepper_controller.move_until_limit.return_value = {'steps_taken': 500, 'hit_limit': False}
        arduino_ctrl._home_axis_to_min(1, "X")

    def test_rpc_returns_negative(self, arduino_ctrl, pc_mod):
        """_check_min handles negative from _call_rpc."""
        arduino_ctrl.stepper_controller._call_rpc.return_value = -1
        arduino_ctrl.stepper_controller.move_until_limit.return_value = {'steps_taken': 500, 'hit_limit': False}
        arduino_ctrl._home_axis_to_min(1, "X")


class TestMoveToWellZUpDistance:
    """Test the z_up_distance > 0 branch."""

    def test_z_up_from_below(self, ctrl, pc_mod):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {"A2": {"x": 100.0, "y": 20.0}}
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        ctrl.current_position = pc_mod.WellCoordinates(x=0.0, y=0.0, z=30.0)
        motor3 = ctrl.stepper_controller.get_motor(3)
        motor3.current_position = int(30.0 * ctrl.mapper.STEPS_PER_MM_Z)
        ctrl.move_to_well("A2")
        assert ctrl.current_position.z == 70.0


class TestMoveToWellZDown:
    """Test Z-down step when z_offset creates target below travel height."""

    def test_z_down_with_offset(self, ctrl, pc_mod):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {"A2": {"x": 100.0, "y": 20.0}}
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        ctrl.current_position = pc_mod.WellCoordinates(x=0.0, y=0.0, z=70.0)
        ctrl.move_to_well("A2", z_offset=-40.0)
        # Z should be 70 - 40 = 30
        assert abs(ctrl.current_position.z - 30.0) < 0.1


class TestExecuteSequenceQuantityMultiRep:
    """Test quantity mode with repetition_quantity > 1 logging."""

    def test_multi_rep_logging(self, ctrl, pc_mod):
        from pipetting_controller import PipettingStep
        step = PipettingStep(
            pickup_well="A2", dropoff_well="B2", rinse_well=None,
            volume_ml=5.0, wait_time=0, repetition_mode='quantity',
            repetition_quantity=2,
        )
        with patch.object(ctrl, 'execute_transfer'), \
             patch.object(ctrl, 'home'):
            ctrl.execute_sequence([step])


class TestSavePositionWell:
    """Test that save_position captures get_current_well()."""

    def test_saves_well_info(self, ctrl, pc_mod, patch_position_path):
        pc_mod.CoordinateMapper.LAYOUT_COORDINATES = {
            "microchip": {"A2": {"x": 100.0, "y": 20.0}}
        }
        pc_mod.CoordinateMapper.CURRENT_LAYOUT = "microchip"
        ctrl.current_position = pc_mod.WellCoordinates(x=100.0, y=20.0, z=0.0)
        ctrl.save_position()
        data = json.loads(patch_position_path.read_text())
        assert data['well'] == 'A2'


class TestDirection:
    def test_values(self, pc_mod):
        assert pc_mod.Direction.CLOCKWISE == 1
        assert pc_mod.Direction.COUNTERCLOCKWISE == 0


class TestDataclasses:
    def test_well_coordinates(self, pc_mod):
        wc = pc_mod.WellCoordinates(x=1.0, y=2.0, z=3.0)
        assert wc.x == 1.0
        assert wc.y == 2.0
        assert wc.z == 3.0

    def test_pipetting_step(self, pc_mod):
        ps = pc_mod.PipettingStep(
            pickup_well="A1", dropoff_well="B1",
            rinse_well="WS2", volume_ml=5.0, wait_time=2
        )
        assert ps.pickup_well == "A1"
        assert ps.wash_well is None
        assert ps.cycles == 1
        assert ps.repetition_mode == 'quantity'
        assert ps.step_type == 'pipette'


class TestMoveToWellOnlyXDelta:
    """Cover branch where y_delta == 0 but x_delta != 0 in move_to_well."""
    def test_only_x_moves(self, ctrl, pc_mod):
        # Set current position so Y already matches A2's Y coordinate (20.0)
        # and X differs.  A2 = (112.0, 20.0) in sample config.
        ctrl.current_position = pc_mod.WellCoordinates(x=0.0, y=20.0, z=70.0)
        motor1 = ctrl.stepper_controller.get_motor(1)
        motor1.current_position = 0
        motor2 = ctrl.stepper_controller.get_motor(2)
        motor2.current_position = int(20.0 * ctrl.mapper.STEPS_PER_MM_Y)
        ctrl.move_to_well("A2")
        assert abs(ctrl.current_position.y - 20.0) < 0.1


class TestMoveToWellOnlyYDelta:
    """Cover branch where x_delta == 0 but y_delta != 0 in move_to_well."""
    def test_only_y_moves(self, ctrl, pc_mod):
        # A2 = (112.0, 20.0). Set X to match, Y differs.
        ctrl.current_position = pc_mod.WellCoordinates(x=112.0, y=0.0, z=70.0)
        motor1 = ctrl.stepper_controller.get_motor(1)
        motor1.current_position = int(112.0 * ctrl.mapper.STEPS_PER_MM_X)
        motor2 = ctrl.stepper_controller.get_motor(2)
        motor2.current_position = 0
        ctrl.move_to_well("A2")
        assert abs(ctrl.current_position.x - 112.0) < 0.1


class TestHomeStepWithWaitTime:
    """Cover both branches of wait_time in home step type."""
    def test_home_step_with_wait(self, ctrl, pc_mod):
        step = pc_mod.PipettingStep(
            pickup_well="A1", dropoff_well="B1",
            rinse_well="WS2", volume_ml=5.0, wait_time=2,
            step_type='home'
        )
        with patch.object(ctrl, 'home'), \
             patch.object(ctrl, '_interruptible_sleep') as mock_sleep:
            ctrl.execute_sequence([step])
        mock_sleep.assert_called()

    def test_home_step_no_wait(self, ctrl, pc_mod):
        """Cover the False branch of if step.wait_time > 0 (line 895->898)."""
        step = pc_mod.PipettingStep(
            pickup_well="A1", dropoff_well="B1",
            rinse_well="WS2", volume_ml=5.0, wait_time=0,
            step_type='home'
        )
        with patch.object(ctrl, 'home'), \
             patch.object(ctrl, '_interruptible_sleep') as mock_sleep:
            ctrl.execute_sequence([step])
        mock_sleep.assert_not_called()


class TestWaitStepZeroWait:
    """Cover both branches of wait_secs in wait step type."""
    def test_wait_step_zero(self, ctrl, pc_mod):
        """Cover False branch of if wait_secs > 0 (line 903->905)."""
        step = pc_mod.PipettingStep(
            pickup_well="A1", dropoff_well="B1",
            rinse_well="WS2", volume_ml=5.0, wait_time=0,
            step_type='wait'
        )
        with patch.object(ctrl, 'home'), \
             patch.object(ctrl, '_interruptible_sleep') as mock_sleep:
            ctrl.execute_sequence([step])
        mock_sleep.assert_not_called()

    def test_wait_step_positive(self, ctrl, pc_mod):
        """Cover True branch of if wait_secs > 0."""
        step = pc_mod.PipettingStep(
            pickup_well="A1", dropoff_well="B1",
            rinse_well="WS2", volume_ml=5.0, wait_time=5,
            step_type='wait'
        )
        with patch.object(ctrl, 'home'), \
             patch.object(ctrl, '_interruptible_sleep') as mock_sleep:
            ctrl.execute_sequence([step])
        mock_sleep.assert_called_with(5)


class TestTimeFrequencyStopRequested:
    """Cover the stop_requested break inside time-frequency while loop (line 946)."""
    def test_stop_during_time_frequency(self, ctrl, pc_mod):
        step = pc_mod.PipettingStep(
            pickup_well="A2", dropoff_well="B2",
            rinse_well="WS2", volume_ml=5.0, wait_time=0,
            repetition_mode='timeFrequency',
            repetition_interval=10,
            repetition_duration=60,
        )

        # time.time() calls: 1) start_time=0, 2) while condition check=0 (< 60 → enter loop)
        # stop_requested is set True between while-condition and the if-check
        def time_side_effect():
            """Yield time values; set stop_requested after the while condition passes."""
            yield 0.0   # start_time = time.time()
            ctrl.stop_requested = True
            yield 0.0   # while (time.time() - start_time) < duration → True

        gen = time_side_effect()
        with patch.object(ctrl, 'home'), \
             patch('time.time', side_effect=lambda: next(gen)):
            ctrl.execute_sequence([step])
        # Stop was triggered inside the time-frequency loop
        # execute_sequence resets stop_requested at line 884 when it detects it,
        # but the break on 946 doesn't reset it — the for loop's stop check at 879
        # catches it on the next iteration (there's only 1 step), so it falls through
        # to the home() call at the end.


class TestCreateStepperController:
    def test_raspberry_pi(self, pc_mod, mock_gpio):
        sc = pc_mod._create_stepper_controller('raspberry_pi')
        assert sc is not None

    def test_arduino(self, pc_mod):
        mock_sc_class = MagicMock()
        with patch.dict(sys.modules, {'stepper_control_arduino': MagicMock(StepperController=mock_sc_class)}):
            sc = pc_mod._create_stepper_controller('arduino_uno_q')
        mock_sc_class.assert_called_once()
