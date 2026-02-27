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
}


def load() -> dict[str, Any]:
    """Load all settings, merging saved values over defaults."""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE) as f:
                saved = json.load(f)
            return {**DEFAULTS, **saved}
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
