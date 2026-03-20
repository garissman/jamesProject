"""Shared test fixtures for the AutoSampler test suite."""
import json
import sys
import shutil
from pathlib import Path
from unittest.mock import MagicMock

import pytest

PROJECT_ROOT = Path(__file__).parent.parent
FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def mock_gpio(monkeypatch):
    """Replace RPi.GPIO with our mock before any imports that use it."""
    from tests.fixtures import mock_gpio as gpio_mock
    gpio_mock.reset()
    monkeypatch.setitem(sys.modules, 'RPi', MagicMock())
    monkeypatch.setitem(sys.modules, 'RPi.GPIO', gpio_mock)
    return gpio_mock


@pytest.fixture
def tmp_config(tmp_path):
    """Provide a temporary config.json for test isolation."""
    src = FIXTURES_DIR / "sample_config.json"
    dst = tmp_path / "config.json"
    shutil.copy(src, dst)
    return dst


@pytest.fixture
def tmp_position(tmp_path):
    """Provide a temporary pipette_position.json."""
    pos = {
        "x": 0.0, "y": 0.0, "z": 70.0,
        "well": "WS1", "pipette_count": 3,
        "layout_type": "microchip", "pipette_ml": 0.0
    }
    dst = tmp_path / "pipette_position.json"
    dst.write_text(json.dumps(pos, indent=2))
    return dst


@pytest.fixture
def patch_config_path(monkeypatch, tmp_config):
    """Redirect settings.CONFIG_FILE to the temp config."""
    import settings
    monkeypatch.setattr(settings, 'CONFIG_FILE', tmp_config)
    return tmp_config


@pytest.fixture
def patch_position_path(monkeypatch, tmp_position):
    """Redirect PipettingController.POSITION_FILE to temp position."""
    from pipetting_controller import PipettingController
    monkeypatch.setattr(PipettingController, 'POSITION_FILE', tmp_position)
    return tmp_position
