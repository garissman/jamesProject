"""Tests for helper functions in main.py (not API endpoints).

Targets:
    - _sanitize_program_name
    - run_pipetting_sequence
    - _move_until_limit_rpi
    - _move_until_limit_arduino
    - _refresh_limit_cache
    - run_drift_test
"""
import sys
import time
from unittest.mock import MagicMock, patch, PropertyMock

import pytest


# ---------------------------------------------------------------------------
# Helpers to safely import main.py in the test environment
# ---------------------------------------------------------------------------

def _ensure_main_imported(mock_gpio):
    """Import the main module, ensuring GPIO mock is wired."""
    rpi_mod = sys.modules.get("RPi")
    if rpi_mod is not None:
        rpi_mod.GPIO = mock_gpio

    if "stepper_control" not in sys.modules:
        import stepper_control  # noqa: F401
    if "pipetting_controller" not in sys.modules:
        import pipetting_controller  # noqa: F401
    if "main" not in sys.modules:
        import main  # noqa: F401

    return sys.modules["main"]


@pytest.fixture
def main_mod(mock_gpio):
    """Return the main module."""
    return _ensure_main_imported(mock_gpio)


# ===================================================================
# _sanitize_program_name
# ===================================================================

class TestSanitizeProgramName:
    """Tests for _sanitize_program_name()."""

    def test_valid_name_passthrough(self, main_mod):
        assert main_mod._sanitize_program_name("my-program_1") == "my-program_1"

    def test_strips_invalid_chars(self, main_mod):
        assert main_mod._sanitize_program_name("hello!@#$%world") == "helloworld"

    def test_empty_string_returns_untitled(self, main_mod):
        assert main_mod._sanitize_program_name("") == "untitled"

    def test_whitespace_only_returns_untitled(self, main_mod):
        assert main_mod._sanitize_program_name("   ") == "untitled"

    def test_special_chars_only_returns_untitled(self, main_mod):
        assert main_mod._sanitize_program_name("!@#$%^&*()") == "untitled"

    def test_preserves_spaces_between_words(self, main_mod):
        result = main_mod._sanitize_program_name("my program")
        assert result == "my program"

    def test_strips_leading_trailing_whitespace(self, main_mod):
        result = main_mod._sanitize_program_name("  hello  ")
        assert result == "hello"


# ===================================================================
# run_pipetting_sequence
# ===================================================================

class TestRunPipettingSequence:
    """Tests for run_pipetting_sequence()."""

    def test_successful_execution(self, main_mod, monkeypatch):
        mock_ctrl = MagicMock()
        monkeypatch.setattr(main_mod, "pipetting_controller", mock_ctrl)
        monkeypatch.setattr(main_mod, "is_executing", False)

        steps = [MagicMock(), MagicMock()]
        main_mod.run_pipetting_sequence(steps)

        mock_ctrl.execute_sequence.assert_called_once_with(steps)
        # After completion, is_executing must be False
        assert main_mod.is_executing is False

    def test_sets_is_executing_true_during_run(self, main_mod, monkeypatch):
        mock_ctrl = MagicMock()
        captured = {}

        def capture_flag(steps_data):
            captured["during"] = main_mod.is_executing

        mock_ctrl.execute_sequence.side_effect = capture_flag
        monkeypatch.setattr(main_mod, "pipetting_controller", mock_ctrl)
        monkeypatch.setattr(main_mod, "is_executing", False)

        main_mod.run_pipetting_sequence([MagicMock()])
        assert captured["during"] is True
        assert main_mod.is_executing is False

    def test_exception_clears_is_executing(self, main_mod, monkeypatch):
        mock_ctrl = MagicMock()
        mock_ctrl.execute_sequence.side_effect = RuntimeError("motor fault")
        monkeypatch.setattr(main_mod, "pipetting_controller", mock_ctrl)
        monkeypatch.setattr(main_mod, "is_executing", False)

        # Should not raise
        main_mod.run_pipetting_sequence([MagicMock()])
        assert main_mod.is_executing is False


# ===================================================================
# _move_until_limit_rpi
# ===================================================================

class TestMoveUntilLimitRpi:
    """Tests for _move_until_limit_rpi()."""

    def test_returns_steps_and_hit_true(self, main_mod):
        motor = MagicMock()
        motor.move_until_limit.return_value = (500, "min")
        steps, hit = main_mod._move_until_limit_rpi(motor, "cw", 0.001)
        assert steps == 500
        assert hit is True
        motor.move_until_limit.assert_called_once_with("cw", 0.001, override_min_delay=True)

    def test_returns_hit_false_when_none(self, main_mod):
        motor = MagicMock()
        motor.move_until_limit.return_value = (1000, "none")
        steps, hit = main_mod._move_until_limit_rpi(motor, "ccw", 0.002)
        assert steps == 1000
        assert hit is False


# ===================================================================
# _move_until_limit_arduino
# ===================================================================

class TestMoveUntilLimitArduino:
    """Tests for _move_until_limit_arduino()."""

    def test_converts_delay_to_microseconds(self, main_mod, monkeypatch):
        stepper = MagicMock()
        stepper.move_until_limit.return_value = {"steps_taken": 200, "hit_limit": True}
        # Patch _refresh_limit_cache to track call
        refresh_mock = MagicMock()
        monkeypatch.setattr(main_mod, "_refresh_limit_cache", refresh_mock)

        # 0.001s = 1000µs
        steps, hit = main_mod._move_until_limit_arduino(stepper, 1, "cw", 0.001)
        assert steps == 200
        assert hit is True
        stepper.move_until_limit.assert_called_once_with(1, "cw", 1000)
        refresh_mock.assert_called_once_with(stepper)

    def test_minimum_delay_clamped_to_50(self, main_mod, monkeypatch):
        stepper = MagicMock()
        stepper.move_until_limit.return_value = {"steps_taken": 10, "hit_limit": False}
        monkeypatch.setattr(main_mod, "_refresh_limit_cache", MagicMock())

        # Very small delay → should clamp to 50µs
        main_mod._move_until_limit_arduino(stepper, 2, "ccw", 0.00001)
        stepper.move_until_limit.assert_called_once_with(2, "ccw", 50)

    def test_refresh_cache_called(self, main_mod, monkeypatch):
        stepper = MagicMock()
        stepper.move_until_limit.return_value = {"steps_taken": 0, "hit_limit": False}
        refresh_mock = MagicMock()
        monkeypatch.setattr(main_mod, "_refresh_limit_cache", refresh_mock)

        main_mod._move_until_limit_arduino(stepper, 3, "cw", 0.01)
        refresh_mock.assert_called_once_with(stepper)


# ===================================================================
# _refresh_limit_cache
# ===================================================================

class TestRefreshLimitCache:
    """Tests for _refresh_limit_cache()."""

    def test_updates_last_result(self, main_mod, monkeypatch):
        monkeypatch.setattr("time.sleep", lambda _: None)

        stepper = MagicMock()
        stepper.get_limit_states.return_value = [
            {"motor_id": 1, "min_triggered": False, "max_triggered": True,
             "limit_min_pin": 10, "limit_max_pin": 11},
            {"motor_id": 2, "min_triggered": True, "max_triggered": False,
             "limit_min_pin": 12, "limit_max_pin": 13},
        ]

        main_mod._refresh_limit_cache(stepper)

        cached = main_mod.get_limit_switches._last_result
        assert cached["status"] == "success"
        assert cached["limit_states"][1] == {"min": False, "max": True}
        assert cached["limit_states"][2] == {"min": True, "max": False}
        assert cached["pin_configuration"][1] == {"min_pin": 10, "max_pin": 11}
        assert cached["pin_configuration"][2] == {"min_pin": 12, "max_pin": 13}
        assert len(cached["limits"]) == 2

    def test_exception_logs_warning(self, main_mod, monkeypatch, capsys):
        monkeypatch.setattr("time.sleep", lambda _: None)

        stepper = MagicMock()
        stepper.get_limit_states.side_effect = RuntimeError("comm error")

        # Should not raise
        main_mod._refresh_limit_cache(stepper)

        captured = capsys.readouterr()
        assert "Warning: failed to refresh limit cache" in captured.out


# ===================================================================
# run_drift_test
# ===================================================================

def _make_mock_controller(controller_type="rpi", has_limits=True, invert_x=False):
    """Build a mock pipetting_controller with the necessary attributes."""
    ctrl = MagicMock()
    ctrl.controller_type = controller_type

    motor = MagicMock()
    motor.limit_min_pin = 10 if has_limits else None
    motor.limit_max_pin = 11 if has_limits else None

    ctrl.stepper_controller.get_motor.return_value = motor

    return ctrl


class TestRunDriftTest:
    """Tests for run_drift_test()."""

    def test_controller_not_initialized(self, main_mod, monkeypatch):
        monkeypatch.setattr(main_mod, "pipetting_controller", None)
        monkeypatch.setattr(main_mod, "drift_test_running", True)

        main_mod.run_drift_test(cycles=1, motor_speed=0.001, steps_per_mm=200, motor_num=1)

        assert main_mod.drift_test_results["status"] == "error"
        assert "not initialized" in main_mod.drift_test_results["error"]
        assert main_mod.drift_test_running is False

    def test_no_limit_switches_rpi(self, main_mod, monkeypatch):
        ctrl = _make_mock_controller(controller_type="rpi", has_limits=False)
        monkeypatch.setattr(main_mod, "pipetting_controller", ctrl)
        monkeypatch.setattr(main_mod, "drift_test_running", True)

        main_mod.run_drift_test(cycles=1, motor_speed=0.001, steps_per_mm=200, motor_num=1)

        assert main_mod.drift_test_results["status"] == "error"
        assert "No limit switches" in main_mod.drift_test_results["error"]

    def test_rpi_path_successful_single_cycle(self, main_mod, monkeypatch):
        """RPi path: finds limit on first try, runs 1 cycle, calculates drift."""
        ctrl = _make_mock_controller(controller_type="rpi", has_limits=True)
        monkeypatch.setattr(main_mod, "pipetting_controller", ctrl)
        monkeypatch.setattr(main_mod, "drift_test_running", True)
        monkeypatch.setattr("time.sleep", lambda _: None)
        monkeypatch.setattr("time.time", MagicMock(side_effect=[
            # homing move: not timed explicitly
            # cycle 1: cycle_start, fwd_start, fwd_end, back_start, back_end, cycle_end
            100.0, 100.0, 100.5, 100.5, 101.0, 101.0,
        ]))

        # Homing: first direction hits limit
        # Cycle 1: forward 1000 steps, backward 998 steps
        call_count = [0]
        def mock_move_rpi(motor, direction, speed):
            call_count[0] += 1
            if call_count[0] == 1:  # homing move
                return (500, True)
            elif call_count[0] == 2:  # forward
                return (1000, True)
            else:  # backward
                return (998, True)

        monkeypatch.setattr(main_mod, "_move_until_limit_rpi", mock_move_rpi)

        main_mod.run_drift_test(cycles=1, motor_speed=0.001, steps_per_mm=200, motor_num=1)

        result = main_mod.drift_test_results
        assert result["status"] == "completed"
        assert len(result["cycles"]) == 1
        assert result["cycles"][0]["forward_steps"] == 1000
        assert result["cycles"][0]["backward_steps"] == 998
        assert result["cycles"][0]["step_difference"] == 2
        assert result["cycles"][0]["drift_mm"] == 0.01  # 2/200
        assert result["summary"] is not None
        assert result["summary"]["total_cycles"] == 1
        assert result["error"] is None
        # n==1 path: deltas should be [0]
        assert result["summary"]["avg_fwd_delta"] == 0
        assert result["summary"]["avg_bwd_delta"] == 0

    def test_arduino_path_successful(self, main_mod, monkeypatch):
        """Arduino path: runs 1 cycle successfully."""
        ctrl = _make_mock_controller(controller_type="arduino_uno_q")
        monkeypatch.setattr(main_mod, "pipetting_controller", ctrl)
        monkeypatch.setattr(main_mod, "drift_test_running", True)
        monkeypatch.setattr("time.sleep", lambda _: None)
        monkeypatch.setattr("time.time", MagicMock(side_effect=[
            100.0, 100.0, 100.5, 100.5, 101.0, 101.0,
        ]))

        call_count = [0]
        def mock_move_arduino(stepper, motor_num, direction, speed):
            call_count[0] += 1
            if call_count[0] == 1:  # homing
                return (300, True)
            elif call_count[0] == 2:  # forward
                return (800, True)
            else:  # backward
                return (795, True)

        monkeypatch.setattr(main_mod, "_move_until_limit_arduino", mock_move_arduino)

        main_mod.run_drift_test(cycles=1, motor_speed=0.001, steps_per_mm=200, motor_num=1)

        result = main_mod.drift_test_results
        assert result["status"] == "completed"
        assert result["cycles"][0]["forward_steps"] == 800
        assert result["cycles"][0]["backward_steps"] == 795

    def test_both_directions_fail_to_find_limit(self, main_mod, monkeypatch):
        """Both CW and CCW fail to hit a limit → error."""
        ctrl = _make_mock_controller(controller_type="rpi", has_limits=True)
        monkeypatch.setattr(main_mod, "pipetting_controller", ctrl)
        monkeypatch.setattr(main_mod, "drift_test_running", True)

        def mock_move_rpi(motor, direction, speed):
            return (10000, False)  # never hits limit

        monkeypatch.setattr(main_mod, "_move_until_limit_rpi", mock_move_rpi)

        main_mod.run_drift_test(cycles=1, motor_speed=0.001, steps_per_mm=200, motor_num=1)

        result = main_mod.drift_test_results
        assert result["status"] == "error"
        assert "Could not find any limit switch" in result["error"]

    def test_first_direction_misses_second_hits(self, main_mod, monkeypatch):
        """First direction fails, second direction finds limit, then cycles run."""
        ctrl = _make_mock_controller(controller_type="rpi", has_limits=True)
        monkeypatch.setattr(main_mod, "pipetting_controller", ctrl)
        monkeypatch.setattr(main_mod, "drift_test_running", True)
        monkeypatch.setattr("time.sleep", lambda _: None)
        monkeypatch.setattr("time.time", MagicMock(side_effect=[
            100.0, 100.0, 100.5, 100.5, 101.0, 101.0,
        ]))

        call_count = [0]
        def mock_move_rpi(motor, direction, speed):
            call_count[0] += 1
            if call_count[0] == 1:  # first homing direction: miss
                return (10000, False)
            elif call_count[0] == 2:  # second homing direction: hit
                return (500, True)
            elif call_count[0] == 3:  # forward
                return (1000, True)
            else:  # backward
                return (1000, True)

        monkeypatch.setattr(main_mod, "_move_until_limit_rpi", mock_move_rpi)

        main_mod.run_drift_test(cycles=1, motor_speed=0.001, steps_per_mm=200, motor_num=1)

        result = main_mod.drift_test_results
        assert result["status"] == "completed"

    def test_stop_requested_mid_cycle(self, main_mod, monkeypatch):
        """drift_test_running set to False mid-cycle → stopped status."""
        ctrl = _make_mock_controller(controller_type="rpi", has_limits=True)
        monkeypatch.setattr(main_mod, "pipetting_controller", ctrl)
        # Start True, but set to False before cycle loop checks
        monkeypatch.setattr(main_mod, "drift_test_running", True)

        def mock_move_rpi(motor, direction, speed):
            return (500, True)

        monkeypatch.setattr(main_mod, "_move_until_limit_rpi", mock_move_rpi)

        # After homing, set drift_test_running to False so the cycle loop breaks
        original_move = main_mod._move_until_limit_rpi
        call_count = [0]
        def mock_move_and_stop(motor, direction, speed):
            call_count[0] += 1
            if call_count[0] == 1:  # homing
                # Stop before cycle starts
                main_mod.drift_test_running = False
                return (500, True)
            return (100, True)

        monkeypatch.setattr(main_mod, "_move_until_limit_rpi", mock_move_and_stop)

        main_mod.run_drift_test(cycles=5, motor_speed=0.001, steps_per_mm=200, motor_num=1)

        result = main_mod.drift_test_results
        assert result["status"] == "stopped"
        assert len(result["cycles"]) == 0

    def test_multi_cycle_with_inter_cycle_deltas(self, main_mod, monkeypatch):
        """n>1 cycles: inter-cycle deltas are calculated from cycles[1:]."""
        ctrl = _make_mock_controller(controller_type="rpi", has_limits=True)
        monkeypatch.setattr(main_mod, "pipetting_controller", ctrl)
        monkeypatch.setattr(main_mod, "drift_test_running", True)
        monkeypatch.setattr("time.sleep", lambda _: None)

        # We need 6 time calls per cycle + extra
        time_vals = []
        for i in range(3):  # 3 cycles
            base = 100.0 + i * 2.0
            time_vals.extend([base, base, base + 0.5, base + 0.5, base + 1.0, base + 1.0])
        monkeypatch.setattr("time.time", MagicMock(side_effect=time_vals))

        call_count = [0]
        # Homing: hit. Then 3 cycles of forward/backward with varying steps.
        cycle_data = [
            # cycle 1: fwd 1000, back 995
            (1000, True), (995, True),
            # cycle 2: fwd 1002, back 997
            (1002, True), (997, True),
            # cycle 3: fwd 1001, back 994
            (1001, True), (994, True),
        ]

        def mock_move_rpi(motor, direction, speed):
            call_count[0] += 1
            if call_count[0] == 1:  # homing
                return (500, True)
            idx = call_count[0] - 2
            return cycle_data[idx]

        monkeypatch.setattr(main_mod, "_move_until_limit_rpi", mock_move_rpi)

        main_mod.run_drift_test(cycles=3, motor_speed=0.001, steps_per_mm=200, motor_num=1)

        result = main_mod.drift_test_results
        assert result["status"] == "completed"
        assert len(result["cycles"]) == 3

        summary = result["summary"]
        assert summary["total_cycles"] == 3
        # Check inter-cycle deltas are computed from cycles[1:]
        # Cycle 2: fwd_delta = 1002-1000 = 2, bwd_delta = 997-995 = 2
        # Cycle 3: fwd_delta = 1001-1002 = -1 (abs=1), bwd_delta = 994-997 = -3 (abs=3)
        assert summary["max_fwd_delta"] == 2  # max(2, 1)
        assert summary["max_bwd_delta"] == 3  # max(2, 3)

    def test_motor_inversion_applied(self, main_mod, monkeypatch):
        """When INVERT_X is True, directions are flipped in the drift test."""
        from pipetting_controller import Direction, PipettingController

        ctrl = _make_mock_controller(controller_type="rpi", has_limits=True)
        monkeypatch.setattr(main_mod, "pipetting_controller", ctrl)
        monkeypatch.setattr(main_mod, "drift_test_running", True)
        monkeypatch.setattr("time.sleep", lambda _: None)
        monkeypatch.setattr("time.time", MagicMock(side_effect=[
            100.0, 100.0, 100.5, 100.5, 101.0, 101.0,
        ]))

        # Set INVERT_X = True
        monkeypatch.setattr(PipettingController, "INVERT_X", True)

        directions_seen = []
        call_count = [0]

        def mock_move_rpi(motor, direction, speed):
            call_count[0] += 1
            directions_seen.append(direction)
            return (500, True)

        monkeypatch.setattr(main_mod, "_move_until_limit_rpi", mock_move_rpi)

        main_mod.run_drift_test(cycles=1, motor_speed=0.001, steps_per_mm=200, motor_num=1)

        # With inversion, the first homing direction should be CCW (inverted from CW)
        assert directions_seen[0] == Direction.COUNTERCLOCKWISE
        assert main_mod.drift_test_results["status"] == "completed"

    def test_motor_y_axis(self, main_mod, monkeypatch):
        """Test motor_num=2 (Y-axis) uses correct motor name."""
        ctrl = _make_mock_controller(controller_type="rpi", has_limits=True)
        monkeypatch.setattr(main_mod, "pipetting_controller", ctrl)
        monkeypatch.setattr(main_mod, "drift_test_running", True)
        monkeypatch.setattr("time.sleep", lambda _: None)
        monkeypatch.setattr("time.time", MagicMock(side_effect=[
            100.0, 100.0, 100.5, 100.5, 101.0, 101.0,
        ]))

        def mock_move_rpi(motor, direction, speed):
            return (500, True)
        monkeypatch.setattr(main_mod, "_move_until_limit_rpi", mock_move_rpi)

        main_mod.run_drift_test(cycles=1, motor_speed=0.001, steps_per_mm=200, motor_num=2)

        result = main_mod.drift_test_results
        assert result["motor_name"] == "Y-Axis"
        assert result["motor"] == 2

    def test_drift_test_running_cleared_on_error(self, main_mod, monkeypatch):
        """drift_test_running is set to False in the finally block, even on error."""
        monkeypatch.setattr(main_mod, "pipetting_controller", None)
        monkeypatch.setattr(main_mod, "drift_test_running", True)

        main_mod.run_drift_test(cycles=1, motor_speed=0.001, steps_per_mm=200)

        assert main_mod.drift_test_running is False
        assert "end_time" in main_mod.drift_test_results

    def test_end_time_always_set(self, main_mod, monkeypatch):
        """end_time is set in the finally block."""
        ctrl = _make_mock_controller(controller_type="rpi", has_limits=True)
        monkeypatch.setattr(main_mod, "pipetting_controller", ctrl)
        monkeypatch.setattr(main_mod, "drift_test_running", True)
        monkeypatch.setattr("time.sleep", lambda _: None)
        monkeypatch.setattr("time.time", MagicMock(side_effect=[
            100.0, 100.0, 100.5, 100.5, 101.0, 101.0,
        ]))

        def mock_move_rpi(motor, direction, speed):
            return (500, True)
        monkeypatch.setattr(main_mod, "_move_until_limit_rpi", mock_move_rpi)

        main_mod.run_drift_test(cycles=1, motor_speed=0.001, steps_per_mm=200, motor_num=1)

        assert "end_time" in main_mod.drift_test_results
        assert main_mod.drift_test_results["end_time"] is not None

    def test_arduino_skips_limit_check(self, main_mod, monkeypatch):
        """Arduino path skips the RPi limit pin validation."""
        ctrl = _make_mock_controller(controller_type="arduino_uno_q")
        # Even though motor has no limit pins, Arduino should not check them
        ctrl.stepper_controller.get_motor.return_value.limit_min_pin = None
        ctrl.stepper_controller.get_motor.return_value.limit_max_pin = None
        monkeypatch.setattr(main_mod, "pipetting_controller", ctrl)
        monkeypatch.setattr(main_mod, "drift_test_running", True)
        monkeypatch.setattr("time.sleep", lambda _: None)
        monkeypatch.setattr("time.time", MagicMock(side_effect=[
            100.0, 100.0, 100.5, 100.5, 101.0, 101.0,
        ]))

        def mock_move_arduino(stepper, motor_num, direction, speed):
            return (400, True)
        monkeypatch.setattr(main_mod, "_move_until_limit_arduino", mock_move_arduino)

        main_mod.run_drift_test(cycles=1, motor_speed=0.001, steps_per_mm=200, motor_num=1)

        # Should complete without the "No limit switches" error
        assert main_mod.drift_test_results["status"] == "completed"

    def test_stopped_mid_cycle_has_no_summary_when_no_cycles(self, main_mod, monkeypatch):
        """When stopped before any cycle completes, summary is computed (empty cycles list)."""
        ctrl = _make_mock_controller(controller_type="rpi", has_limits=True)
        monkeypatch.setattr(main_mod, "pipetting_controller", ctrl)
        monkeypatch.setattr(main_mod, "drift_test_running", True)

        def mock_move_rpi(motor, direction, speed):
            # Stop after homing
            main_mod.drift_test_running = False
            return (500, True)
        monkeypatch.setattr(main_mod, "_move_until_limit_rpi", mock_move_rpi)

        main_mod.run_drift_test(cycles=3, motor_speed=0.001, steps_per_mm=200, motor_num=1)

        result = main_mod.drift_test_results
        assert result["status"] == "stopped"
        # No cycles completed, so summary should remain None (the if-branch is skipped)
        assert result["summary"] is None
