"""Mock replacement for RPi.GPIO used in tests.

Tracks all GPIO calls, supports limit-switch simulation, and provides
helpers for inspecting what the code-under-test did with the pins.
"""

# ── GPIO constants ──────────────────────────────────────────────────
BCM = 11
OUT = 0
IN = 1
LOW = 0
HIGH = 1
PUD_UP = 22
FALLING = 32

# ── Internal state ──────────────────────────────────────────────────
_call_log: list[dict] = []
_pin_states: dict[int, int] = {}
_pin_modes: dict[int, int] = {}
_event_callbacks: dict[int, list] = {}
_limit_triggers: dict[int, int] = {}  # pin -> after_n_outputs remaining
_output_count: int = 0


def reset():
    """Clear all internal state between tests."""
    global _output_count
    _call_log.clear()
    _pin_states.clear()
    _pin_modes.clear()
    _event_callbacks.clear()
    _limit_triggers.clear()
    _output_count = 0


# ── Public helpers ──────────────────────────────────────────────────

def get_call_log() -> list[dict]:
    """Return a copy of every recorded GPIO call."""
    return list(_call_log)


def set_pin_state(pin: int, value: int):
    """Directly set the readable state of *pin*."""
    _pin_states[pin] = value


def schedule_limit_trigger(pin: int, after_n_outputs: int):
    """After *after_n_outputs* ``output()`` calls, drive *pin* LOW and
    fire any registered event-detect callbacks for that pin."""
    _limit_triggers[pin] = after_n_outputs


# ── RPi.GPIO API surface ───────────────────────────────────────────

def setmode(mode):
    _call_log.append({"function": "setmode", "mode": mode})


def setwarnings(flag):
    _call_log.append({"function": "setwarnings", "flag": flag})


def setup(pin, mode, pull_up_down=None, initial=None):
    _call_log.append({
        "function": "setup",
        "pin": pin,
        "mode": mode,
        "pull_up_down": pull_up_down,
        "initial": initial,
    })
    _pin_modes[pin] = mode
    if initial is not None:
        _pin_states[pin] = initial
    elif mode == IN and pull_up_down == PUD_UP:
        _pin_states[pin] = HIGH


def output(pin, value):
    global _output_count
    _call_log.append({"function": "output", "pin": pin, "value": value})
    _pin_states[pin] = value
    _output_count += 1

    # Check every scheduled trigger
    for trigger_pin in list(_limit_triggers):
        _limit_triggers[trigger_pin] -= 1
        if _limit_triggers[trigger_pin] <= 0:
            # Fire the limit switch: drive pin LOW and invoke callbacks
            _pin_states[trigger_pin] = LOW
            del _limit_triggers[trigger_pin]
            for cb in _event_callbacks.get(trigger_pin, []):
                cb(trigger_pin)


def input(pin):
    _call_log.append({"function": "input", "pin": pin})
    return _pin_states.get(pin, HIGH)


def add_event_detect(pin, edge, callback=None, bouncetime=None):
    _call_log.append({
        "function": "add_event_detect",
        "pin": pin,
        "edge": edge,
        "callback": callback,
        "bouncetime": bouncetime,
    })
    if callback is not None:
        _event_callbacks.setdefault(pin, []).append(callback)


def remove_event_detect(pin):
    _call_log.append({"function": "remove_event_detect", "pin": pin})
    _event_callbacks.pop(pin, None)


def cleanup():
    _call_log.append({"function": "cleanup"})
