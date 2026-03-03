"""
JSON-backed runtime configuration — replaces .env / python-dotenv.

All settings are read from and written to config.json at runtime,
so changes take effect immediately without a server restart.
"""
import json
from pathlib import Path
from typing import Any

CONFIG_FILE = Path(__file__).parent / "config.json"

# Default values (used when config.json is absent or a key is missing)
DEFAULTS: dict[str, Any] = {
    "BED_OFFSET_X":           70.0,
    "BED_OFFSET_Y":           15.0,
    "WELL_SPACING":           4.0,
    "WELL_DIAMETER":          8.0,
    "WELL_HEIGHT":           14.0,
    "VIAL_WELL_SPACING":     45.0,
    "VIAL_WELL_DIAMETER":     8.0,
    "VIAL_WELL_HEIGHT":      14.0,
    "STEPS_PER_MM_X":       100,
    "STEPS_PER_MM_Y":       100,
    "STEPS_PER_MM_Z":       100,
    "PIPETTE_STEPS_PER_ML": 1000,
    "PIPETTE_MAX_ML":         10.0,
    "PICKUP_DEPTH":          10.0,
    "DROPOFF_DEPTH":          5.0,
    "SAFE_HEIGHT":           20.0,
    "RINSE_CYCLES":           3,
    "TRAVEL_SPEED":           0.001,
    "PIPETTE_SPEED":          0.002,
    "WS_POSITION_X":          0.0,
    "WS_POSITION_Y":          5.0,
    "WS_HEIGHT":             15.0,
    "WS_WIDTH":              60.0,
    "WS_GAP":                 1.0,
    "INVERT_X":               False,
    "INVERT_Y":               False,
    "INVERT_Z":               False,
    "INVERT_PIPETTE":         False,
    "CONTROLLER_TYPE":        "raspberry_pi",
    "LAYOUT_COORDINATES": {
        "microchip": {
            "A2": None, "B2": None, "C2": None, "D2": None,
            "E2": None, "F2": None, "G2": None, "H2": None,
            "MC1": None,
            "A5": None, "B5": None, "C5": None, "D5": None,
            "E5": None, "F5": None, "G5": None, "H5": None,
            "MC2": None,
            "A8": None, "B8": None, "C8": None, "D8": None,
            "E8": None, "F8": None, "G8": None, "H8": None,
            "MC3": None,
            "A11": None, "B11": None, "C11": None, "D11": None,
            "E11": None, "F11": None, "G11": None, "H11": None,
            "MC4": None,
            "A14": None, "B14": None, "C14": None, "D14": None,
            "E14": None, "F14": None, "G14": None, "H14": None,
            "MC5": None,
        },
        "vial": {
            "VA2": None, "VB2": None, "VC2": None, "VD2": None, "VE2": None,
        },
        "wellplate": {
            "SA2": None, "SB2": None, "SC2": None, "SD2": None,
            "SE2": None, "SF2": None, "SG2": None, "SH2": None,
            "SI2": None, "SJ2": None, "SK2": None, "SL2": None,
            "SA5": None, "SB5": None, "SC5": None, "SD5": None,
            "SE5": None, "SF5": None, "SG5": None, "SH5": None,
            "SI5": None, "SJ5": None, "SK5": None, "SL5": None,
        },
    },
}


def _deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge *override* into *base* so new default keys aren't lost."""
    merged = dict(base)
    for key, val in override.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(val, dict):
            merged[key] = _deep_merge(merged[key], val)
        else:
            merged[key] = val
    return merged


def load() -> dict[str, Any]:
    """Load all settings, merging saved values over defaults (deep for nested dicts)."""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE) as f:
                saved = json.load(f)
            return _deep_merge(DEFAULTS, saved)
        except Exception as e:
            print(f"Warning: could not read {CONFIG_FILE}: {e}")
    return dict(DEFAULTS)


def save(cfg: dict[str, Any]) -> None:
    """Persist settings dict to config.json."""
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)


def get(key: str, default: Any = None) -> Any:
    """Read a single setting value at runtime (always re-reads the file)."""
    return load().get(key, DEFAULTS.get(key, default))
