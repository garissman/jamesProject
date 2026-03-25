"""Tests for stepper_control.py — targeting 100% line + branch coverage."""
import sys
from unittest.mock import patch

import pytest


# ---------------------------------------------------------------------------
# Helpers / Fixtures
# ---------------------------------------------------------------------------

def _ensure_import(mock_gpio):
    """
    Import stepper_control once, ensuring the mock GPIO is wired up.
    Reuses the same module object so coverage.py tracks one set of code objects.
    """
    # Fix: Python resolves `import RPi.GPIO as GPIO` by looking at RPi.GPIO attr,
    # NOT sys.modules['RPi.GPIO'].  Ensure the RPi mock's .GPIO is our mock.
    rpi_mod = sys.modules.get('RPi')
    if rpi_mod is not None:
        rpi_mod.GPIO = mock_gpio

    if 'stepper_control' not in sys.modules:
        import stepper_control
    else:
        stepper_control = sys.modules['stepper_control']

    assert stepper_control.GPIO_AVAILABLE is True
    assert stepper_control.GPIO is mock_gpio
    return stepper_control


@pytest.fixture
def sc(mock_gpio):
    """Return the stepper_control module."""
    return _ensure_import(mock_gpio)


@pytest.fixture
def motor(sc, mock_gpio):
    """A single StepperMotor with limit switches (pins 4/17, limits 26/21)."""
    m = sc.StepperMotor(
        pulse_pin=4, dir_pin=17, name="TestMotor",
        limit_min_pin=26, limit_max_pin=21,
    )
    mock_gpio.reset()  # Clear construction noise from call log
    return m


@pytest.fixture
def motor_no_limits(sc, mock_gpio):
    """A StepperMotor without limit switches."""
    m = sc.StepperMotor(pulse_pin=4, dir_pin=17, name="NoLimits")
    mock_gpio.reset()
    return m


# ===================================================================
# Enum tests
# ===================================================================

class TestEnums:
    def test_direction_values(self, sc):
        assert sc.Direction.CLOCKWISE.value == 1
        assert sc.Direction.COUNTERCLOCKWISE.value == 0

    def test_limit_switch_state_values(self, sc):
        assert sc.LimitSwitchState.NOT_TRIGGERED.value == 0
        assert sc.LimitSwitchState.MIN_TRIGGERED.value == 1
        assert sc.LimitSwitchState.MAX_TRIGGERED.value == 2


# ===================================================================
# StepperMotor — construction
# ===================================================================

class TestStepperMotorConstruction:
    def test_basic_attributes(self, sc, mock_gpio):
        m = sc.StepperMotor(4, 17, "M1", limit_min_pin=26, limit_max_pin=21)
        assert m.pulse_pin == 4
        assert m.dir_pin == 17
        assert m.name == "M1"
        assert m.limit_min_pin == 26
        assert m.limit_max_pin == 21
        assert m.current_position == 0
        assert m.stop_requested is False
        assert m.ignore_limits is False
        assert m.limit_triggered is None

    def test_gpio_calls_on_init(self, sc, mock_gpio):
        mock_gpio.reset()
        sc.StepperMotor(4, 17, "M1", limit_min_pin=26, limit_max_pin=21)
        log = mock_gpio.get_call_log()
        funcs = [c["function"] for c in log]
        assert "setmode" in funcs
        setup_calls = [c for c in log if c["function"] == "setup"]
        assert len(setup_calls) == 4  # pulse, dir, limit_min, limit_max
        event_calls = [c for c in log if c["function"] == "add_event_detect"]
        assert len(event_calls) == 2
        # Verify output calls set pins LOW
        output_calls = [c for c in log if c["function"] == "output"]
        assert {"function": "output", "pin": 4, "value": 0} in output_calls
        assert {"function": "output", "pin": 17, "value": 0} in output_calls

    def test_no_limit_pins(self, sc, mock_gpio):
        mock_gpio.reset()
        m = sc.StepperMotor(4, 17, "M1")
        assert m.limit_min_pin is None
        assert m.limit_max_pin is None
        log = mock_gpio.get_call_log()
        event_calls = [c for c in log if c["function"] == "add_event_detect"]
        assert len(event_calls) == 0

    def test_simulation_attributes(self, sc):
        m = sc.StepperMotor(4, 17, "M1")
        assert 8000 <= m.simulated_travel_range <= 12000
        assert 2000 <= m.simulated_position <= m.simulated_travel_range - 2000

    def test_event_detect_runtime_error_caught(self, sc, mock_gpio):
        """If add_event_detect raises RuntimeError, it is silently caught."""
        original = mock_gpio.add_event_detect
        calls = []

        def raising_add(pin, edge, callback=None, bouncetime=None):
            calls.append(pin)
            raise RuntimeError("Already added")

        mock_gpio.add_event_detect = raising_add
        try:
            m = sc.StepperMotor(4, 17, "M", limit_min_pin=26, limit_max_pin=21)
            assert len(calls) == 2  # Both limit pins attempted
            assert m.limit_min_pin == 26  # Motor still constructed
        finally:
            mock_gpio.add_event_detect = original


# ===================================================================
# StepperMotor — step()
# ===================================================================

class TestStepperMotorStep:
    @patch("time.sleep")
    def test_basic_cw_stepping(self, mock_sleep, motor, sc, mock_gpio):
        steps_done, limit = motor.step(sc.Direction.CLOCKWISE, steps=10, delay=0.001)
        assert steps_done == 10
        assert limit == sc.LimitSwitchState.NOT_TRIGGERED
        assert motor.current_position == 10

    @patch("time.sleep")
    def test_basic_ccw_stepping(self, mock_sleep, motor, sc, mock_gpio):
        steps_done, limit = motor.step(sc.Direction.COUNTERCLOCKWISE, steps=10, delay=0.001)
        assert steps_done == 10
        assert limit == sc.LimitSwitchState.NOT_TRIGGERED
        assert motor.current_position == -10

    @patch("time.sleep")
    def test_position_tracking_multiple_moves(self, mock_sleep, motor, sc, mock_gpio):
        motor.step(sc.Direction.CLOCKWISE, steps=100, delay=0.001)
        motor.step(sc.Direction.COUNTERCLOCKWISE, steps=30, delay=0.001)
        assert motor.current_position == 70

    @patch("time.sleep")
    def test_direction_gpio_output(self, mock_sleep, motor, sc, mock_gpio):
        motor.step(sc.Direction.CLOCKWISE, steps=1, delay=0.001)
        log = mock_gpio.get_call_log()
        dir_outputs = [c for c in log if c["function"] == "output" and c["pin"] == 17]
        assert dir_outputs[0]["value"] == 1  # CW = 1

        mock_gpio.reset()
        motor.step(sc.Direction.COUNTERCLOCKWISE, steps=1, delay=0.001)
        log = mock_gpio.get_call_log()
        dir_outputs = [c for c in log if c["function"] == "output" and c["pin"] == 17]
        assert dir_outputs[0]["value"] == 0  # CCW = 0

    @patch("time.sleep")
    def test_trapezoidal_acceleration_ramp(self, mock_sleep, motor, sc, mock_gpio):
        """Verify delay decreases (ramp-up) then increases (ramp-down)."""
        motor.step(sc.Direction.CLOCKWISE, steps=100, delay=0.001)
        delays = [call.args[0] for call in mock_sleep.call_args_list]
        first = delays[0]
        mid = delays[len(delays) // 2]
        last = delays[-2]
        assert first > mid, "Should accelerate from start"
        assert last > mid, "Should decelerate at end"

    @patch("time.sleep")
    def test_zero_accel_steps_constant_delay(self, mock_sleep, motor, sc, mock_gpio):
        """steps < 4 → accel_steps = 0 → constant delay."""
        motor.step(sc.Direction.CLOCKWISE, steps=3, delay=0.002)
        delays = [call.args[0] for call in mock_sleep.call_args_list]
        assert all(d == 0.002 for d in delays)

    @patch("time.sleep")
    def test_check_limits_stops_on_min(self, mock_sleep, motor, sc, mock_gpio):
        """Trigger min limit mid-move via schedule_limit_trigger."""
        # Each step: 2 output() calls (HIGH + LOW on pulse).
        # Plus 1 initial direction output. After N outputs, pin 26 goes LOW.
        # Next check_min_limit() (via GPIO.input) reads LOW → stop.
        mock_gpio.schedule_limit_trigger(26, after_n_outputs=7)
        steps_done, limit = motor.step(sc.Direction.COUNTERCLOCKWISE, steps=100, delay=0.001)
        assert steps_done < 100
        assert limit == sc.LimitSwitchState.MIN_TRIGGERED

    @patch("time.sleep")
    def test_check_limits_stops_on_max(self, mock_sleep, motor, sc, mock_gpio):
        mock_gpio.schedule_limit_trigger(21, after_n_outputs=7)
        steps_done, limit = motor.step(sc.Direction.CLOCKWISE, steps=100, delay=0.001)
        assert steps_done < 100
        assert limit == sc.LimitSwitchState.MAX_TRIGGERED

    @patch("time.sleep")
    def test_started_at_min_moving_away_allowed(self, mock_sleep, motor, sc, mock_gpio):
        """If already at min limit at start, moving away does not stop immediately."""
        mock_gpio.set_pin_state(26, mock_gpio.LOW)  # min triggered
        steps_done, limit = motor.step(sc.Direction.CLOCKWISE, steps=20, delay=0.001)
        # min stays triggered the whole time, but started_at_min=True prevents stopping
        assert steps_done == 20
        assert limit == sc.LimitSwitchState.NOT_TRIGGERED

    @patch("time.sleep")
    def test_started_at_max_moving_away_allowed(self, mock_sleep, motor, sc, mock_gpio):
        mock_gpio.set_pin_state(21, mock_gpio.LOW)  # max triggered
        steps_done, limit = motor.step(sc.Direction.COUNTERCLOCKWISE, steps=20, delay=0.001)
        assert steps_done == 20
        assert limit == sc.LimitSwitchState.NOT_TRIGGERED

    @patch("time.sleep")
    def test_check_limits_false_suppresses_limit_stops(self, mock_sleep, motor, sc, mock_gpio):
        """check_limits=False → limit switches are not checked, ignore_limits=True."""
        mock_gpio.set_pin_state(26, mock_gpio.LOW)
        steps_done, limit = motor.step(sc.Direction.CW if hasattr(sc.Direction, 'CW') else sc.Direction.CLOCKWISE,
                                        steps=20, delay=0.001, check_limits=False)
        assert steps_done == 20
        assert limit == sc.LimitSwitchState.NOT_TRIGGERED
        # ignore_limits restored to False
        assert motor.ignore_limits is False

    @patch("time.sleep")
    def test_stop_requested_honored_when_left_starting_limits(self, mock_sleep, motor, sc, mock_gpio):
        """stop_requested=True causes early exit once left_starting_limits is True."""
        call_count = 0

        def sleep_side_effect(t):
            nonlocal call_count
            call_count += 1
            if call_count == 10:
                motor.stop_requested = True
                motor.limit_triggered = None  # user-initiated stop

        mock_sleep.side_effect = sleep_side_effect
        steps_done, limit = motor.step(sc.Direction.CLOCKWISE, steps=100, delay=0.001)
        assert steps_done < 100

    @patch("time.sleep")
    def test_stop_requested_cleared_while_at_starting_limit(self, mock_sleep, motor, sc, mock_gpio):
        """stop_requested is cleared each step while still at starting limit.
        Both limits must be triggered to keep left_starting_limits False."""
        mock_gpio.set_pin_state(26, mock_gpio.LOW)  # start at min
        mock_gpio.set_pin_state(21, mock_gpio.LOW)  # start at max too
        call_count = 0

        def sleep_side_effect(t):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                motor.stop_requested = True

        mock_sleep.side_effect = sleep_side_effect
        steps_done, _ = motor.step(sc.Direction.CLOCKWISE, steps=20, delay=0.001, check_limits=True)
        # Both limits stay triggered → left_starting_limits stays False
        # → stop_requested gets cleared at line 255
        assert steps_done == 20

    @patch("time.sleep")
    def test_check_limits_false_emi_noise_clears_limit_triggered(self, mock_sleep, motor, sc, mock_gpio):
        """check_limits=False: if limit_triggered is set (EMI noise), it gets cleared."""
        call_count = 0

        def sleep_side_effect(t):
            nonlocal call_count
            call_count += 1
            if call_count == 10:
                # Simulate EMI: stop_requested=True with limit_triggered set
                motor.stop_requested = True
                motor.limit_triggered = 'min'

        mock_sleep.side_effect = sleep_side_effect
        steps_done, _ = motor.step(sc.Direction.CLOCKWISE, steps=100, delay=0.001, check_limits=False)
        # The code at lines 203-205 clears both when check_limits=False and limit_triggered is not None
        assert steps_done == 100

    @patch("time.sleep")
    def test_step_gpio_pulse_pattern(self, mock_sleep, motor, sc, mock_gpio):
        """Each step: output(pulse, HIGH) → sleep → output(pulse, LOW) → sleep."""
        motor.step(sc.Direction.CLOCKWISE, steps=2, delay=0.001, check_limits=False)
        log = mock_gpio.get_call_log()
        pulse_outputs = [c for c in log if c["function"] == "output" and c["pin"] == 4]
        # 2 steps × (HIGH + LOW) = 4 pulse outputs
        assert len(pulse_outputs) == 4
        assert pulse_outputs[0]["value"] == mock_gpio.HIGH
        assert pulse_outputs[1]["value"] == mock_gpio.LOW
        assert pulse_outputs[2]["value"] == mock_gpio.HIGH
        assert pulse_outputs[3]["value"] == mock_gpio.LOW

    @patch("time.sleep")
    def test_started_at_both_limits(self, mock_sleep, motor, sc, mock_gpio):
        """Both limits triggered at start → can step without stopping."""
        mock_gpio.set_pin_state(26, mock_gpio.LOW)
        mock_gpio.set_pin_state(21, mock_gpio.LOW)
        steps_done, limit = motor.step(sc.Direction.CLOCKWISE, steps=10, delay=0.001, check_limits=True)
        assert steps_done == 10
        assert limit == sc.LimitSwitchState.NOT_TRIGGERED

    @patch("time.sleep")
    def test_leave_min_then_hit_max(self, mock_sleep, motor, sc, mock_gpio):
        """Start at min, leave it (min goes HIGH), then hit max (max goes LOW)."""
        mock_gpio.set_pin_state(26, mock_gpio.LOW)  # start at min
        call_count = 0

        def sleep_side_effect(t):
            nonlocal call_count
            call_count += 1
            if call_count == 8:
                mock_gpio.set_pin_state(26, mock_gpio.HIGH)  # leave min
            if call_count == 30:
                mock_gpio.set_pin_state(21, mock_gpio.LOW)   # hit max

        mock_sleep.side_effect = sleep_side_effect
        steps_done, limit = motor.step(sc.Direction.CLOCKWISE, steps=100, delay=0.001, check_limits=True)
        assert limit == sc.LimitSwitchState.MAX_TRIGGERED
        assert steps_done < 100

    @patch("time.sleep")
    def test_leave_max_then_hit_min(self, mock_sleep, motor, sc, mock_gpio):
        """Start at max, leave it, then hit min."""
        mock_gpio.set_pin_state(21, mock_gpio.LOW)  # start at max
        call_count = 0

        def sleep_side_effect(t):
            nonlocal call_count
            call_count += 1
            if call_count == 8:
                mock_gpio.set_pin_state(21, mock_gpio.HIGH)  # leave max
            if call_count == 30:
                mock_gpio.set_pin_state(26, mock_gpio.LOW)   # hit min

        mock_sleep.side_effect = sleep_side_effect
        steps_done, limit = motor.step(sc.Direction.COUNTERCLOCKWISE, steps=100, delay=0.001, check_limits=True)
        assert limit == sc.LimitSwitchState.MIN_TRIGGERED
        assert steps_done < 100

    @patch("time.sleep")
    def test_stop_requested_with_check_limits_true(self, mock_sleep, motor, sc, mock_gpio):
        """stop_requested with check_limits=True and limit_triggered=None → break."""
        call_count = 0

        def sleep_side_effect(t):
            nonlocal call_count
            call_count += 1
            if call_count == 10:
                motor.stop_requested = True
                motor.limit_triggered = None

        mock_sleep.side_effect = sleep_side_effect
        steps_done, _ = motor.step(sc.Direction.CLOCKWISE, steps=100, delay=0.001, check_limits=True)
        assert steps_done < 100


# ===================================================================
# StepperMotor — move_until_limit()
# ===================================================================

class TestMoveUntilLimit:
    @patch("time.sleep")
    def test_detects_min_limit(self, mock_sleep, motor, sc, mock_gpio):
        call_count = 0

        def sleep_side_effect(t):
            nonlocal call_count
            call_count += 1
            # After batch of 50: 50*2 output sleeps + 1 setup sleep + 1 EMI settle
            # Trigger on the EMI settle pause (which is after batch output calls)
            if call_count >= 103:
                mock_gpio.set_pin_state(26, mock_gpio.LOW)

        mock_sleep.side_effect = sleep_side_effect
        steps_taken, which = motor.move_until_limit(sc.Direction.COUNTERCLOCKWISE, delay=0.001, max_steps=500)
        assert which == 'min'
        assert steps_taken > 0

    @patch("time.sleep")
    def test_detects_max_limit(self, mock_sleep, motor, sc, mock_gpio):
        call_count = 0

        def sleep_side_effect(t):
            nonlocal call_count
            call_count += 1
            if call_count >= 103:
                mock_gpio.set_pin_state(21, mock_gpio.LOW)

        mock_sleep.side_effect = sleep_side_effect
        steps_taken, which = motor.move_until_limit(sc.Direction.CLOCKWISE, delay=0.001, max_steps=500)
        assert which == 'max'
        assert steps_taken > 0

    @patch("time.sleep")
    def test_max_steps_safety_cutoff(self, mock_sleep, motor, sc, mock_gpio):
        steps_taken, which = motor.move_until_limit(sc.Direction.CLOCKWISE, delay=0.001, max_steps=100)
        assert which == 'none'
        assert steps_taken == 100

    @patch("time.sleep")
    def test_batch_size_check_interval(self, mock_sleep, motor, sc, mock_gpio):
        """max_steps=100 → 2 batches of 50."""
        steps_taken, _ = motor.move_until_limit(sc.Direction.CLOCKWISE, delay=0.001, max_steps=100)
        assert steps_taken == 100

    @patch("time.sleep")
    def test_emi_settle_pause(self, mock_sleep, motor, sc, mock_gpio):
        motor.move_until_limit(sc.Direction.CLOCKWISE, delay=0.001, max_steps=50)
        sleep_args = [call.args[0] for call in mock_sleep.call_args_list]
        assert 0.005 in sleep_args  # direction setup sleep
        assert 0.001 in sleep_args  # EMI settle sleep

    @patch("time.sleep")
    def test_override_min_delay_true(self, mock_sleep, motor, sc, mock_gpio):
        motor.move_until_limit(sc.Direction.CLOCKWISE, delay=0.00001,
                               max_steps=50, override_min_delay=True)
        sleep_args = [call.args[0] for call in mock_sleep.call_args_list]
        step_delays = [d for d in sleep_args if d not in (0.005, 0.001)]
        assert all(d == 0.00001 for d in step_delays)

    @patch("time.sleep")
    def test_min_delay_clamp(self, mock_sleep, motor, sc, mock_gpio):
        motor.move_until_limit(sc.Direction.CLOCKWISE, delay=0.00001,
                               max_steps=50, override_min_delay=False)
        sleep_args = [call.args[0] for call in mock_sleep.call_args_list]
        step_delays = [d for d in sleep_args if d not in (0.005, 0.001)]
        assert all(d == 0.0001 for d in step_delays)

    @patch("time.sleep")
    def test_started_at_min_leaves_then_finds_max(self, mock_sleep, motor, sc, mock_gpio):
        mock_gpio.set_pin_state(26, mock_gpio.LOW)  # start at min
        call_count = 0

        def sleep_side_effect(t):
            nonlocal call_count
            call_count += 1
            if call_count == 103:
                mock_gpio.set_pin_state(26, mock_gpio.HIGH)  # leave min
            if call_count == 210:
                mock_gpio.set_pin_state(21, mock_gpio.LOW)  # hit max

        mock_sleep.side_effect = sleep_side_effect
        steps_taken, which = motor.move_until_limit(sc.Direction.CLOCKWISE, delay=0.001, max_steps=500)
        assert which == 'max'

    @patch("time.sleep")
    def test_started_at_max_leaves_then_finds_min(self, mock_sleep, motor, sc, mock_gpio):
        mock_gpio.set_pin_state(21, mock_gpio.LOW)  # start at max
        call_count = 0

        def sleep_side_effect(t):
            nonlocal call_count
            call_count += 1
            if call_count == 103:
                mock_gpio.set_pin_state(21, mock_gpio.HIGH)  # leave max
            if call_count == 210:
                mock_gpio.set_pin_state(26, mock_gpio.LOW)  # hit min

        mock_sleep.side_effect = sleep_side_effect
        steps_taken, which = motor.move_until_limit(sc.Direction.COUNTERCLOCKWISE, delay=0.001, max_steps=500)
        assert which == 'min'

    @patch("time.sleep")
    def test_ignore_limits_restored_after(self, mock_sleep, motor, sc, mock_gpio):
        assert motor.ignore_limits is False
        motor.move_until_limit(sc.Direction.CLOCKWISE, delay=0.001, max_steps=50)
        assert motor.ignore_limits is False

    @patch("time.sleep")
    def test_max_steps_zero_unlimited(self, mock_sleep, motor, sc, mock_gpio):
        """max_steps=0 means loop until a limit is hit."""
        call_count = 0

        def sleep_side_effect(t):
            nonlocal call_count
            call_count += 1
            if call_count >= 210:
                mock_gpio.set_pin_state(26, mock_gpio.LOW)

        mock_sleep.side_effect = sleep_side_effect
        steps_taken, which = motor.move_until_limit(sc.Direction.COUNTERCLOCKWISE, delay=0.001, max_steps=0)
        assert which == 'min'
        assert steps_taken > 0

    @patch("time.sleep")
    def test_partial_batch_at_end(self, mock_sleep, motor, sc, mock_gpio):
        """max_steps=75 → batch of 50, then batch of 25."""
        steps_taken, which = motor.move_until_limit(sc.Direction.CLOCKWISE, delay=0.001, max_steps=75)
        assert steps_taken == 75
        assert which == 'none'

    @patch("time.sleep")
    def test_both_limits_triggered_elif_false_branch(self, mock_sleep, sc, mock_gpio):
        """Start at both limits; both stay triggered so elif at line 338 evaluates False.
        This covers the 338->341 branch where started_at_max=True but check_max still triggered."""
        m = sc.StepperMotor(4, 17, "BothLim", limit_min_pin=26, limit_max_pin=21)
        mock_gpio.set_pin_state(26, mock_gpio.LOW)  # min triggered
        mock_gpio.set_pin_state(21, mock_gpio.LOW)  # max triggered
        # Both stay triggered → neither if nor elif body entered → continue at 341
        steps_taken, which = m.move_until_limit(sc.Direction.CLOCKWISE, delay=0.001, max_steps=100)
        assert which == 'none'
        assert steps_taken == 100

    @patch("time.sleep")
    def test_started_at_min_only_elif_false(self, mock_sleep, sc, mock_gpio):
        """Start at min only. The elif at 338 evaluates False (started_at_max=False)."""
        m = sc.StepperMotor(4, 17, "MinOnly", limit_min_pin=26, limit_max_pin=21)
        mock_gpio.set_pin_state(26, mock_gpio.LOW)  # min triggered
        # Min stays triggered → if at 335 is False, elif at 338 is False → 338->341
        steps_taken, which = m.move_until_limit(sc.Direction.CLOCKWISE, delay=0.001, max_steps=100)
        assert which == 'none'
        assert steps_taken == 100


# ===================================================================
# StepperMotor — move_until_any_limit()
# ===================================================================

class TestMoveUntilAnyLimit:
    @patch("time.sleep")
    def test_alias_delegates(self, mock_sleep, motor, sc, mock_gpio):
        steps_taken, which = motor.move_until_any_limit(sc.Direction.CLOCKWISE, delay=0.001, max_steps=50)
        assert steps_taken == 50
        assert which == 'none'


# ===================================================================
# StepperMotor — home()
# ===================================================================

class TestHome:
    @patch("time.sleep")
    def test_home_success(self, mock_sleep, motor, sc, mock_gpio):
        call_count = 0

        def sleep_side_effect(t):
            nonlocal call_count
            call_count += 1
            if call_count >= 103:
                mock_gpio.set_pin_state(26, mock_gpio.LOW)

        mock_sleep.side_effect = sleep_side_effect
        motor.current_position = 500
        result = motor.home(delay=0.001, max_steps=500)
        assert result is True
        assert motor.current_position == 0

    @patch("time.sleep")
    def test_home_no_min_pin(self, mock_sleep, motor_no_limits, sc):
        result = motor_no_limits.home()
        assert result is False

    @patch("time.sleep")
    def test_home_fails_no_limit_hit(self, mock_sleep, motor, sc, mock_gpio):
        motor.current_position = 500
        result = motor.home(delay=0.001, max_steps=50)
        assert result is False
        assert motor.current_position == 500  # not reset


# ===================================================================
# StepperMotor — check_limit_switch / check_min / check_max
# ===================================================================

class TestCheckLimitSwitch:
    def test_none_pin_returns_false(self, motor, sc):
        assert motor.check_limit_switch(None) is False

    def test_low_means_triggered(self, motor, sc, mock_gpio):
        mock_gpio.set_pin_state(26, mock_gpio.LOW)
        assert motor.check_limit_switch(26) is True

    def test_high_means_not_triggered(self, motor, sc, mock_gpio):
        mock_gpio.set_pin_state(26, mock_gpio.HIGH)
        assert motor.check_limit_switch(26) is False

    def test_check_min_limit_wrapper(self, motor, sc, mock_gpio):
        mock_gpio.set_pin_state(26, mock_gpio.LOW)
        assert motor.check_min_limit() is True
        mock_gpio.set_pin_state(26, mock_gpio.HIGH)
        assert motor.check_min_limit() is False

    def test_check_max_limit_wrapper(self, motor, sc, mock_gpio):
        mock_gpio.set_pin_state(21, mock_gpio.LOW)
        assert motor.check_max_limit() is True
        mock_gpio.set_pin_state(21, mock_gpio.HIGH)
        assert motor.check_max_limit() is False


# ===================================================================
# StepperMotor — get_limit_state()
# ===================================================================

class TestGetLimitState:
    def test_not_triggered(self, motor, sc, mock_gpio):
        assert motor.get_limit_state() == sc.LimitSwitchState.NOT_TRIGGERED

    def test_min_triggered(self, motor, sc, mock_gpio):
        mock_gpio.set_pin_state(26, mock_gpio.LOW)
        assert motor.get_limit_state() == sc.LimitSwitchState.MIN_TRIGGERED

    def test_max_triggered(self, motor, sc, mock_gpio):
        mock_gpio.set_pin_state(21, mock_gpio.LOW)
        assert motor.get_limit_state() == sc.LimitSwitchState.MAX_TRIGGERED

    def test_both_triggered_min_takes_precedence(self, motor, sc, mock_gpio):
        mock_gpio.set_pin_state(26, mock_gpio.LOW)
        mock_gpio.set_pin_state(21, mock_gpio.LOW)
        assert motor.get_limit_state() == sc.LimitSwitchState.MIN_TRIGGERED


# ===================================================================
# StepperMotor — callbacks, flag management, stop
# ===================================================================

class TestCallbacksAndFlags:
    def test_limit_min_callback_sets_flags(self, motor, sc):
        motor._limit_min_callback(26)
        assert motor.limit_triggered == 'min'
        assert motor.stop_requested is True

    def test_limit_max_callback_sets_flags(self, motor, sc):
        motor._limit_max_callback(21)
        assert motor.limit_triggered == 'max'
        assert motor.stop_requested is True

    def test_limit_min_callback_ignored_when_ignore_limits(self, motor, sc):
        motor.ignore_limits = True
        motor._limit_min_callback(26)
        assert motor.limit_triggered is None
        assert motor.stop_requested is False

    def test_limit_max_callback_ignored_when_ignore_limits(self, motor, sc):
        motor.ignore_limits = True
        motor._limit_max_callback(21)
        assert motor.limit_triggered is None
        assert motor.stop_requested is False

    def test_request_stop(self, motor, sc):
        motor.request_stop()
        assert motor.stop_requested is True

    def test_clear_limit_trigger(self, motor, sc):
        motor.limit_triggered = 'min'
        motor.stop_requested = True
        motor.clear_limit_trigger()
        assert motor.limit_triggered is None
        assert motor.stop_requested is False

    def test_stop_sets_pins_low(self, motor, sc, mock_gpio):
        motor.stop()
        log = mock_gpio.get_call_log()
        outputs = [c for c in log if c["function"] == "output"]
        assert {"function": "output", "pin": 4, "value": 0} in outputs
        assert {"function": "output", "pin": 17, "value": 0} in outputs


# ===================================================================
# StepperMotor — rotate_degrees
# ===================================================================

class TestRotateDegrees:
    @patch("time.sleep")
    def test_90_degrees(self, mock_sleep, motor, sc, mock_gpio):
        motor.rotate_degrees(90, sc.Direction.CLOCKWISE, steps_per_revolution=200, delay=0.001)
        assert motor.current_position == 50

    @patch("time.sleep")
    def test_180_degrees(self, mock_sleep, motor, sc, mock_gpio):
        motor.rotate_degrees(180, sc.Direction.CLOCKWISE, steps_per_revolution=200, delay=0.001)
        assert motor.current_position == 100

    @patch("time.sleep")
    def test_360_degrees(self, mock_sleep, motor, sc, mock_gpio):
        motor.rotate_degrees(360, sc.Direction.CLOCKWISE, steps_per_revolution=200, delay=0.001)
        assert motor.current_position == 200


# ===================================================================
# StepperMotor — position management
# ===================================================================

class TestPositionManagement:
    def test_get_position(self, motor, sc):
        motor.current_position = 42
        assert motor.get_position() == 42

    def test_reset_position(self, motor, sc):
        motor.current_position = 42
        motor.simulated_position = 5000
        motor.reset_position()
        assert motor.current_position == 0
        assert motor.simulated_position == 0


# ===================================================================
# StepperController — init
# ===================================================================

class TestStepperControllerInit:
    def test_creates_4_motors_with_limits(self, sc, mock_gpio):
        ctrl = sc.StepperController(use_limit_switches=True)
        assert len(ctrl.motors) == 4
        for mid in [1, 2, 3, 4]:
            assert ctrl.motors[mid].limit_min_pin is not None
            assert ctrl.motors[mid].limit_max_pin is not None

    def test_creates_4_motors_without_limits(self, sc, mock_gpio):
        ctrl = sc.StepperController(use_limit_switches=False)
        assert len(ctrl.motors) == 4
        for mid in [1, 2, 3, 4]:
            assert ctrl.motors[mid].limit_min_pin is None
            assert ctrl.motors[mid].limit_max_pin is None

    def test_motor_pins_match_config(self, sc, mock_gpio):
        ctrl = sc.StepperController(use_limit_switches=True)
        assert (ctrl.motors[1].pulse_pin, ctrl.motors[1].dir_pin) == (4, 17)
        assert (ctrl.motors[2].pulse_pin, ctrl.motors[2].dir_pin) == (27, 22)
        assert (ctrl.motors[3].pulse_pin, ctrl.motors[3].dir_pin) == (5, 6)
        assert (ctrl.motors[4].pulse_pin, ctrl.motors[4].dir_pin) == (13, 19)

    def test_limit_switch_pins_match_config(self, sc, mock_gpio):
        ctrl = sc.StepperController(use_limit_switches=True)
        assert (ctrl.motors[1].limit_min_pin, ctrl.motors[1].limit_max_pin) == (26, 21)
        assert (ctrl.motors[2].limit_min_pin, ctrl.motors[2].limit_max_pin) == (20, 16)
        assert (ctrl.motors[3].limit_min_pin, ctrl.motors[3].limit_max_pin) == (12, 25)
        assert (ctrl.motors[4].limit_min_pin, ctrl.motors[4].limit_max_pin) == (24, 23)


# ===================================================================
# StepperController — get_motor
# ===================================================================

class TestGetMotor:
    def test_valid_id(self, sc, mock_gpio):
        ctrl = sc.StepperController()
        m = ctrl.get_motor(1)
        assert isinstance(m, sc.StepperMotor)

    def test_invalid_id_raises(self, sc, mock_gpio):
        ctrl = sc.StepperController()
        with pytest.raises(ValueError, match="Invalid motor_id"):
            ctrl.get_motor(99)


# ===================================================================
# StepperController — move_motor
# ===================================================================

class TestControllerMoveMotor:
    @patch("time.sleep")
    def test_delegates_to_motor_step(self, mock_sleep, sc, mock_gpio):
        ctrl = sc.StepperController()
        steps_done, limit = ctrl.move_motor(1, 10, sc.Direction.CLOCKWISE, delay=0.001)
        assert steps_done == 10
        assert limit == sc.LimitSwitchState.NOT_TRIGGERED


# ===================================================================
# StepperController — move_motor_until_limit
# ===================================================================

class TestControllerMoveMotorUntilLimit:
    @patch("time.sleep")
    def test_delegates_to_motor(self, mock_sleep, sc, mock_gpio):
        ctrl = sc.StepperController()
        steps, which = ctrl.move_motor_until_limit(1, sc.Direction.CLOCKWISE, delay=0.001, max_steps=50)
        assert steps == 50
        assert which == 'none'


# ===================================================================
# StepperController — move_multiple
# ===================================================================

class TestControllerMoveMultiple:
    @patch("time.sleep")
    def test_executes_sequentially(self, mock_sleep, sc, mock_gpio):
        ctrl = sc.StepperController()
        movements = [
            (1, 10, sc.Direction.CLOCKWISE, 0.001),
            (2, 20, sc.Direction.COUNTERCLOCKWISE, 0.001),
        ]
        ctrl.move_multiple(movements)
        assert ctrl.get_motor(1).current_position == 10
        assert ctrl.get_motor(2).current_position == -20


# ===================================================================
# StepperController — check_limit_switch
# ===================================================================

class TestControllerCheckLimitSwitch:
    def test_both(self, sc, mock_gpio):
        ctrl = sc.StepperController()
        result = ctrl.check_limit_switch(1, 'both')
        assert result['motor_id'] == 1
        assert 'min_triggered' in result
        assert 'max_triggered' in result

    def test_min_only(self, sc, mock_gpio):
        ctrl = sc.StepperController()
        result = ctrl.check_limit_switch(1, 'min')
        assert 'min_triggered' in result
        assert 'max_triggered' not in result

    def test_max_only(self, sc, mock_gpio):
        ctrl = sc.StepperController()
        result = ctrl.check_limit_switch(1, 'max')
        assert 'max_triggered' in result
        assert 'min_triggered' not in result


# ===================================================================
# StepperController — check_all_limit_switches
# ===================================================================

class TestControllerCheckAll:
    def test_returns_all_motors(self, sc, mock_gpio):
        ctrl = sc.StepperController()
        result = ctrl.check_all_limit_switches()
        assert len(result) == 4
        for mid in [1, 2, 3, 4]:
            assert 'min' in result[mid]
            assert 'max' in result[mid]
            assert 'state' in result[mid]


# ===================================================================
# StepperController — get_all_positions / get_all_limit_states
# ===================================================================

class TestControllerPositionsAndStates:
    def test_get_all_positions(self, sc, mock_gpio):
        ctrl = sc.StepperController()
        positions = ctrl.get_all_positions()
        assert len(positions) == 4
        for mid in [1, 2, 3, 4]:
            assert positions[mid] == 0

    def test_get_all_limit_states(self, sc, mock_gpio):
        ctrl = sc.StepperController()
        states = ctrl.get_all_limit_states()
        assert len(states) == 4
        for mid in [1, 2, 3, 4]:
            assert states[mid] == 'NOT_TRIGGERED'


# ===================================================================
# StepperController — home_motor
# ===================================================================

class TestControllerHomeMotor:
    @patch("time.sleep")
    def test_delegates_to_motor_home(self, mock_sleep, sc, mock_gpio):
        ctrl = sc.StepperController()
        call_count = 0

        def sleep_side_effect(t):
            nonlocal call_count
            call_count += 1
            if call_count >= 103:
                mock_gpio.set_pin_state(26, mock_gpio.LOW)

        mock_sleep.side_effect = sleep_side_effect
        result = ctrl.home_motor(1, delay=0.001, max_steps=500)
        assert result is True


# ===================================================================
# StepperController — home_all
# ===================================================================

class TestControllerHomeAll:
    @patch("time.sleep")
    def test_with_limit_switches(self, mock_sleep, sc, mock_gpio):
        ctrl = sc.StepperController(use_limit_switches=True)
        call_count = 0

        def sleep_side_effect(t):
            nonlocal call_count
            call_count += 1
            if call_count == 103:
                mock_gpio.set_pin_state(26, mock_gpio.LOW)
            if call_count == 300:
                mock_gpio.set_pin_state(20, mock_gpio.LOW)
            if call_count == 500:
                mock_gpio.set_pin_state(12, mock_gpio.LOW)
            if call_count == 700:
                mock_gpio.set_pin_state(24, mock_gpio.LOW)

        mock_sleep.side_effect = sleep_side_effect
        ctrl.home_all(use_limits=True, delay=0.001, max_steps=5000)
        for mid in [1, 2, 3, 4]:
            assert ctrl.get_motor(mid).current_position == 0

    @patch("time.sleep")
    def test_without_limit_switches(self, mock_sleep, sc, mock_gpio):
        ctrl = sc.StepperController(use_limit_switches=False)
        ctrl.home_all(use_limits=True, delay=0.001)
        # No limit switches → just reset positions
        for mid in [1, 2, 3, 4]:
            assert ctrl.get_motor(mid).current_position == 0

    @patch("time.sleep")
    def test_use_limits_false(self, mock_sleep, sc, mock_gpio):
        ctrl = sc.StepperController(use_limit_switches=True)
        ctrl.get_motor(1).current_position = 100
        ctrl.home_all(use_limits=False, delay=0.001)
        for mid in [1, 2, 3, 4]:
            assert ctrl.get_motor(mid).current_position == 0

    @patch("time.sleep")
    def test_custom_home_sequence(self, mock_sleep, sc, mock_gpio):
        ctrl = sc.StepperController()
        sequence = [
            (1, 50, sc.Direction.COUNTERCLOCKWISE),
            (2, 30, sc.Direction.COUNTERCLOCKWISE),
        ]
        ctrl.home_all(home_sequence=sequence, delay=0.001)
        assert ctrl.get_motor(1).current_position == 0
        assert ctrl.get_motor(2).current_position == 0

    @patch("time.sleep")
    def test_motors_without_limit_pin_reset_only(self, mock_sleep, sc, mock_gpio):
        """When use_limit_switches=False, motors have no limit pins → positions just reset."""
        ctrl = sc.StepperController(use_limit_switches=False)
        ctrl.get_motor(1).current_position = 500
        ctrl.home_all(use_limits=True, delay=0.001)
        assert ctrl.get_motor(1).current_position == 0


# ===================================================================
# StepperController — stop_all
# ===================================================================

class TestControllerStopAll:
    def test_stops_all_motors(self, sc, mock_gpio):
        ctrl = sc.StepperController()
        ctrl.stop_all()
        for motor in ctrl.motors.values():
            assert motor.stop_requested is True


# ===================================================================
# StepperController — cleanup
# ===================================================================

class TestControllerCleanup:
    def test_calls_gpio_cleanup(self, sc, mock_gpio):
        ctrl = sc.StepperController()
        mock_gpio.reset()
        ctrl.cleanup()
        log = mock_gpio.get_call_log()
        funcs = [c["function"] for c in log]
        assert "cleanup" in funcs

    def test_stops_all_motors(self, sc, mock_gpio):
        ctrl = sc.StepperController()
        ctrl.cleanup()
        for motor in ctrl.motors.values():
            assert motor.stop_requested is True


# ===================================================================
# Simulation mode tests (GPIO_AVAILABLE = False)
# These cover the else/except branches that are skipped when GPIO is available.
# ===================================================================

class TestSimulationMode:
    """Tests that exercise code paths when GPIO_AVAILABLE is False.
    Uses monkeypatch so GPIO_AVAILABLE is restored after each test."""

    @patch("time.sleep")
    def test_construction_without_gpio(self, mock_sleep, sc, mock_gpio, monkeypatch):
        monkeypatch.setattr(sc, 'GPIO_AVAILABLE', False)
        mock_gpio.reset()
        m = sc.StepperMotor(4, 17, "SimMotor", limit_min_pin=26, limit_max_pin=21)
        log = mock_gpio.get_call_log()
        assert len(log) == 0  # no GPIO calls in sim mode
        assert m.pulse_pin == 4
        assert m.limit_min_pin == 26

    @patch("time.sleep")
    def test_step_simulation_cw(self, mock_sleep, sc, mock_gpio, monkeypatch):
        monkeypatch.setattr(sc, 'GPIO_AVAILABLE', False)
        m = sc.StepperMotor(4, 17, "Sim", limit_min_pin=26, limit_max_pin=21)
        initial_sim_pos = m.simulated_position
        steps_done, limit = m.step(sc.Direction.CLOCKWISE, steps=10, delay=0.001, check_limits=False)
        assert steps_done == 10
        assert m.simulated_position == initial_sim_pos + 10
        assert m.current_position == 10

    @patch("time.sleep")
    def test_step_simulation_ccw(self, mock_sleep, sc, mock_gpio, monkeypatch):
        monkeypatch.setattr(sc, 'GPIO_AVAILABLE', False)
        m = sc.StepperMotor(4, 17, "Sim", limit_min_pin=26, limit_max_pin=21)
        initial_sim_pos = m.simulated_position
        steps_done, limit = m.step(sc.Direction.COUNTERCLOCKWISE, steps=10, delay=0.001, check_limits=False)
        assert steps_done == 10
        assert m.simulated_position == initial_sim_pos - 10
        assert m.current_position == -10

    @patch("time.sleep")
    def test_step_simulation_delay_is_reduced(self, mock_sleep, sc, mock_gpio, monkeypatch):
        """In sim mode, sleep is called with current_delay * 0.01."""
        monkeypatch.setattr(sc, 'GPIO_AVAILABLE', False)
        m = sc.StepperMotor(4, 17, "Sim")
        m.step(sc.Direction.CLOCKWISE, steps=3, delay=0.002, check_limits=False)
        for call in mock_sleep.call_args_list:
            assert call.args[0] == pytest.approx(0.00002)

    @patch("time.sleep")
    def test_check_limit_switch_simulation_min(self, mock_sleep, sc, mock_gpio, monkeypatch):
        """Sim mode: min limit triggered when simulated_position <= 0."""
        monkeypatch.setattr(sc, 'GPIO_AVAILABLE', False)
        m = sc.StepperMotor(4, 17, "Sim", limit_min_pin=26, limit_max_pin=21)
        m.simulated_position = 0
        assert m.check_limit_switch(26) is True
        m.simulated_position = 1
        assert m.check_limit_switch(26) is False

    @patch("time.sleep")
    def test_check_limit_switch_simulation_max(self, mock_sleep, sc, mock_gpio, monkeypatch):
        """Sim mode: max limit triggered when simulated_position >= travel_range."""
        monkeypatch.setattr(sc, 'GPIO_AVAILABLE', False)
        m = sc.StepperMotor(4, 17, "Sim", limit_min_pin=26, limit_max_pin=21)
        m.simulated_position = m.simulated_travel_range
        assert m.check_limit_switch(21) is True
        m.simulated_position = m.simulated_travel_range - 1
        assert m.check_limit_switch(21) is False

    @patch("time.sleep")
    def test_check_limit_switch_simulation_unknown_pin(self, mock_sleep, sc, mock_gpio, monkeypatch):
        """Sim mode: unknown pin returns False."""
        monkeypatch.setattr(sc, 'GPIO_AVAILABLE', False)
        m = sc.StepperMotor(4, 17, "Sim", limit_min_pin=26, limit_max_pin=21)
        assert m.check_limit_switch(99) is False

    @patch("time.sleep")
    def test_move_until_limit_simulation(self, mock_sleep, sc, mock_gpio, monkeypatch):
        """Sim mode stepping in move_until_limit."""
        monkeypatch.setattr(sc, 'GPIO_AVAILABLE', False)
        m = sc.StepperMotor(4, 17, "Sim", limit_min_pin=26, limit_max_pin=21)
        m.simulated_position = 100
        steps_taken, which = m.move_until_limit(sc.Direction.COUNTERCLOCKWISE, delay=0.001, max_steps=200)
        assert which == 'min'
        assert steps_taken <= 200

    @patch("time.sleep")
    def test_move_until_limit_simulation_cw(self, mock_sleep, sc, mock_gpio, monkeypatch):
        """Sim mode: move CW toward max limit."""
        monkeypatch.setattr(sc, 'GPIO_AVAILABLE', False)
        m = sc.StepperMotor(4, 17, "Sim", limit_min_pin=26, limit_max_pin=21)
        m.simulated_position = m.simulated_travel_range - 60
        steps_taken, which = m.move_until_limit(sc.Direction.CLOCKWISE, delay=0.001, max_steps=200)
        assert which == 'max'

    def test_stop_without_gpio(self, sc, mock_gpio, monkeypatch):
        """stop() with GPIO_AVAILABLE=False does nothing (no error)."""
        monkeypatch.setattr(sc, 'GPIO_AVAILABLE', False)
        mock_gpio.reset()
        m = sc.StepperMotor(4, 17, "Sim")
        m.stop()
        log = mock_gpio.get_call_log()
        assert len(log) == 0

    def test_cleanup_without_gpio(self, sc, mock_gpio, monkeypatch):
        """cleanup() with GPIO_AVAILABLE=False skips GPIO.cleanup()."""
        monkeypatch.setattr(sc, 'GPIO_AVAILABLE', False)
        ctrl = sc.StepperController()
        mock_gpio.reset()
        ctrl.cleanup()
        log = mock_gpio.get_call_log()
        cleanup_calls = [c for c in log if c["function"] == "cleanup"]
        assert len(cleanup_calls) == 0


# ===================================================================
# home_all: motor with limit switches enabled but one motor missing limit pin
# Covers lines 599-602
# ===================================================================

class TestHomeAllMixedLimits:
    @patch("time.sleep")
    def test_motor_without_limit_pin_gets_reset(self, mock_sleep, sc, mock_gpio):
        """A motor with use_limit_switches=True but limit_min_pin=None gets reset_position."""
        ctrl = sc.StepperController(use_limit_switches=True)
        # Manually remove limit_min_pin from motor 1
        ctrl.motors[1].limit_min_pin = None
        ctrl.motors[1].current_position = 500

        # Trigger limits for motors 2-4
        call_count = 0

        def sleep_side_effect(t):
            nonlocal call_count
            call_count += 1
            if call_count == 103:
                mock_gpio.set_pin_state(20, mock_gpio.LOW)  # motor 2
            if call_count == 300:
                mock_gpio.set_pin_state(12, mock_gpio.LOW)  # motor 3
            if call_count == 500:
                mock_gpio.set_pin_state(24, mock_gpio.LOW)  # motor 4

        mock_sleep.side_effect = sleep_side_effect
        ctrl.home_all(use_limits=True, delay=0.001, max_steps=5000)
        # Motor 1: no limit_min_pin → reset_position called (lines 601-602)
        assert ctrl.get_motor(1).current_position == 0
        assert ctrl.get_motor(1).simulated_position == 0


# ===================================================================
# GPIO import failure (lines 12-14)
# ===================================================================

class TestGpioImportFailure:
    def test_import_failure_sets_gpio_available_false(self, mock_gpio, monkeypatch):
        """When RPi.GPIO import fails, GPIO_AVAILABLE = False."""
        # Remove the mock GPIO modules so the import fails
        monkeypatch.delitem(sys.modules, 'RPi.GPIO', raising=False)
        monkeypatch.delitem(sys.modules, 'RPi', raising=False)
        sys.modules.pop('stepper_control', None)
        import stepper_control
        assert stepper_control.GPIO_AVAILABLE is False
        # Cleanup: re-set for other tests
        sys.modules.pop('stepper_control', None)
