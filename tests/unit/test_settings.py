"""Tests for settings.py — JSON-backed configuration module."""
import json

import settings


# ── _deep_merge ──────────────────────────────────────────────────────────────

def test_deep_merge_scalar_override():
    """Override replaces an existing scalar value."""
    base = {"a": 1, "b": 2}
    override = {"a": 99}
    result = settings._deep_merge(base, override)
    assert result["a"] == 99
    assert result["b"] == 2


def test_deep_merge_nested_dicts():
    """Nested dicts are merged recursively, not replaced wholesale."""
    base = {"outer": {"keep": 1, "change": 2}}
    override = {"outer": {"change": 99, "added": 3}}
    result = settings._deep_merge(base, override)
    assert result["outer"]["keep"] == 1
    assert result["outer"]["change"] == 99
    assert result["outer"]["added"] == 3


def test_deep_merge_new_key_preserved():
    """Override can introduce keys that are absent from base."""
    base = {"a": 1}
    override = {"b": 2}
    result = settings._deep_merge(base, override)
    assert result == {"a": 1, "b": 2}


# ── load ─────────────────────────────────────────────────────────────────────

def test_load_missing_file_returns_defaults(patch_config_path):
    """When the config file does not exist, load() returns a copy of DEFAULTS."""
    patch_config_path.unlink()  # remove the temp config file
    result = settings.load()
    assert result == settings.DEFAULTS
    # Ensure it is a copy, not the same object
    assert result is not settings.DEFAULTS


def test_load_valid_config_merges_over_defaults(patch_config_path):
    """Saved values override defaults; default-only keys are preserved."""
    result = settings.load()
    # sample_config.json sets STEPS_PER_MM_X to 200 (default is 100)
    assert result["STEPS_PER_MM_X"] == 200
    # BED_OFFSET_X is only in defaults, should still be present
    assert result["BED_OFFSET_X"] == settings.DEFAULTS["BED_OFFSET_X"]


def test_load_corrupt_json_falls_back_to_defaults(patch_config_path):
    """Invalid JSON causes load() to return defaults gracefully."""
    patch_config_path.write_text("{not valid json!!!")
    result = settings.load()
    assert result == settings.DEFAULTS


# ── save ─────────────────────────────────────────────────────────────────────

def test_save_writes_valid_json(patch_config_path):
    """save() writes a file that can be parsed as valid JSON."""
    data = {"FOO": "bar", "NUM": 42}
    settings.save(data)
    raw = patch_config_path.read_text()
    parsed = json.loads(raw)
    assert parsed == data


def test_save_then_load_round_trip(patch_config_path):
    """Data saved with save() is returned (merged over defaults) by load()."""
    cfg = dict(settings.DEFAULTS)
    cfg["STEPS_PER_MM_X"] = 999
    settings.save(cfg)
    loaded = settings.load()
    assert loaded["STEPS_PER_MM_X"] == 999
    assert loaded == cfg


# ── get ──────────────────────────────────────────────────────────────────────

def test_get_existing_key(patch_config_path):
    """get() returns the stored value for a key that exists."""
    result = settings.get("STEPS_PER_MM_X")
    # sample_config.json has STEPS_PER_MM_X = 200
    assert result == 200


def test_get_missing_key_no_default(patch_config_path):
    """get() returns None for an unknown key when no default is given."""
    result = settings.get("TOTALLY_MISSING_KEY")
    assert result is None


def test_get_missing_key_with_default(patch_config_path):
    """get() returns the caller-supplied default for an unknown key."""
    result = settings.get("TOTALLY_MISSING_KEY", "fallback")
    assert result == "fallback"
