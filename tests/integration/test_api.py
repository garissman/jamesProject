"""Integration tests for all FastAPI API endpoints in main.py.

Covers every REST endpoint reachable via the API, using TestClient
as a context manager so the lifespan (PipettingController init) fires.
"""
import json
from unittest.mock import MagicMock, PropertyMock

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_mock_controller():
    """Return a MagicMock that behaves like a PipettingController instance.

    Sets up the key attributes that endpoint code reads directly
    (current_position, controller_type, stepper_controller, etc.).
    """
    ctrl = MagicMock()
    ctrl.controller_type = "raspberry_pi"
    ctrl.current_pipette_count = 3
    ctrl.layout_type = "microchip"
    ctrl.current_operation = "idle"
    ctrl.operation_well = None
    ctrl.current_step_index = None
    ctrl.total_steps = None
    ctrl.pipette_ml = 0.0
    ctrl.current_position = MagicMock(x=0.0, y=0.0, z=70.0)
    ctrl.get_current_well.return_value = "WS1"
    ctrl.get_logs.return_value = []
    ctrl.get_axis_positions.return_value = {"x": 0.0, "y": 0.0, "z": 70.0, "pipette": 0.0}

    # Stepper controller sub-mock (used by limit-switch / MCU endpoints)
    sc = MagicMock()
    sc.check_all_limit_switches.return_value = {
        1: {"min": False, "max": False},
        2: {"min": False, "max": False},
        3: {"min": False, "max": False},
        4: {"min": False, "max": False},
    }
    sc.motors = {1: MagicMock(), 2: MagicMock(), 3: MagicMock(), 4: MagicMock()}
    sc.LIMIT_SWITCH_PINS = {
        1: (10, 11), 2: (12, 13), 3: (14, 15), 4: (16, 17)
    }
    sc.lock = MagicMock()
    sc.lock.locked.return_value = False
    ctrl.stepper_controller = sc

    # mapper needed by set-position endpoint
    ctrl.mapper = MagicMock()
    ctrl.mapper.STEPS_PER_MM_X = 200
    ctrl.mapper.STEPS_PER_MM_Y = 200
    ctrl.mapper.STEPS_PER_MM_Z = 200

    return ctrl


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def client(mock_gpio, patch_config_path, tmp_path, monkeypatch):
    """TestClient with a fully-mocked PipettingController.

    * Patches PipettingController in main so the lifespan creates a MagicMock.
    * Uses ``with TestClient(app)`` to trigger the lifespan startup/shutdown.
    * Redirects file paths (SCHEDULED_PROGRAM_FILE, PROGRAMS_DIR)
      to tmp_path for test isolation.
    """
    mock_ctrl = _build_mock_controller()

    import main

    # Replace PipettingController class in main module so lifespan() creates our mock
    monkeypatch.setattr(main, "PipettingController", lambda: mock_ctrl)

    # Redirect program file paths
    sched_file = tmp_path / "scheduled_program.json"
    programs_dir = tmp_path / "programs"
    programs_dir.mkdir(exist_ok=True)
    monkeypatch.setattr(main, "SCHEDULED_PROGRAM_FILE", sched_file)
    monkeypatch.setattr(main, "PROGRAMS_DIR", programs_dir)

    with TestClient(main.app) as tc:
        # Ensure is_executing is False
        main.is_executing = False
        main.drift_test_running = False
        main.drift_test_results = {
            "status": "idle",
            "current_cycle": 0,
            "total_cycles": 0,
            "cycles": [],
            "summary": None,
            "error": None,
        }
        yield tc

    # Restore module state
    main.is_executing = False
    main.drift_test_running = False


@pytest.fixture
def client_no_controller(client, monkeypatch):
    """Same client but with pipetting_controller set to None (for 503 tests)."""
    import main
    monkeypatch.setattr(main, "pipetting_controller", None)
    return client


# ---------------------------------------------------------------------------
# Minimal step payload helper
# ---------------------------------------------------------------------------

def _step_payload(**overrides):
    """Build a valid PipettingStepRequest dict with sensible defaults."""
    base = {
        "stepType": "pipette",
        "pickupWell": "A2",
        "dropoffWell": "A5",
        "rinseWell": "WS2",
        "washWell": "WS1",
        "sampleVolume": 1.0,
        "waitTime": 0,
        "cycles": 1,
        "repetitionMode": "quantity",
        "repetitionQuantity": 1,
        "repetitionInterval": None,
        "repetitionDuration": None,
        "pipetteCount": 3,
    }
    base.update(overrides)
    return base


# ===================================================================
# GET /api/items
# ===================================================================

class TestGetItems:
    def test_returns_items(self, client):
        r = client.get("/api/items")
        assert r.status_code == 200
        items = r.json()
        assert len(items) == 2
        assert items[0]["name"] == "Item 1"


# ===================================================================
# POST /api/items
# ===================================================================

class TestCreateItem:
    def test_creates_item(self, client):
        r = client.post("/api/items", json={"name": "Widget", "price": 5.0})
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == 3
        assert data["name"] == "Widget"
        assert data["price"] == 5.0


# ===================================================================
# POST /api/pipetting/execute
# ===================================================================

class TestExecutePipetting:
    def test_success(self, client, monkeypatch):
        # Patch threading.Thread so we don't start a real thread
        mock_thread = MagicMock()
        monkeypatch.setattr("main.threading.Thread", lambda **kw: mock_thread)

        r = client.post("/api/pipetting/execute", json={
            "steps": [_step_payload()]
        })
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "success"
        assert data["steps_executed"] == 1
        mock_thread.start.assert_called_once()

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.post("/api/pipetting/execute", json={
            "steps": [_step_payload()]
        })
        assert r.status_code == 503

    def test_already_executing_409(self, client, monkeypatch):
        import main
        monkeypatch.setattr(main, "is_executing", True)
        r = client.post("/api/pipetting/execute", json={
            "steps": [_step_payload()]
        })
        assert r.status_code == 409

    def test_invalid_input_422(self, client):
        # Empty steps list
        r = client.post("/api/pipetting/execute", json={"steps": []})
        assert r.status_code == 422

    def test_missing_steps_422(self, client):
        r = client.post("/api/pipetting/execute", json={})
        assert r.status_code == 422

    def test_multiple_steps(self, client, monkeypatch):
        mock_thread = MagicMock()
        monkeypatch.setattr("main.threading.Thread", lambda **kw: mock_thread)

        r = client.post("/api/pipetting/execute", json={
            "steps": [_step_payload(), _step_payload(pickupWell="B2")]
        })
        assert r.status_code == 200
        assert r.json()["steps_executed"] == 2

    def test_value_error_400(self, client, monkeypatch):
        """When PipettingStep construction raises ValueError, endpoint returns 400."""
        from pipetting_controller import PipettingStep

        def bad_init(self, *args, **kwargs):
            raise ValueError("bad step")
        monkeypatch.setattr(PipettingStep, "__init__", bad_init)

        r = client.post("/api/pipetting/execute", json={
            "steps": [_step_payload()]
        })
        assert r.status_code == 400
        assert "bad step" in r.json()["detail"]


# ===================================================================
# POST /api/pipetting/stop
# ===================================================================

class TestStopPipetting:
    def test_success(self, client):
        r = client.post("/api/pipetting/stop")
        assert r.status_code == 200
        assert r.json()["status"] == "success"

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.post("/api/pipetting/stop")
        assert r.status_code == 503


# ===================================================================
# POST /api/pipetting/home
# ===================================================================

class TestHomePipetting:
    def test_success(self, client):
        r = client.post("/api/pipetting/home")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "success"
        assert "home" in data["message"].lower()

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.post("/api/pipetting/home")
        assert r.status_code == 503


# ===================================================================
# POST /api/pipetting/move-to-well
# ===================================================================

class TestMoveToWell:
    def test_success(self, client):
        r = client.post("/api/pipetting/move-to-well", json={"wellId": "A2"})
        assert r.status_code == 200
        assert r.json()["status"] == "success"

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.post("/api/pipetting/move-to-well", json={"wellId": "A2"})
        assert r.status_code == 503

    def test_move_to_well_exception_500(self, client, monkeypatch):
        import main
        main.pipetting_controller.move_to_well.side_effect = RuntimeError("motor jam")
        r = client.post("/api/pipetting/move-to-well", json={"wellId": "A2"})
        assert r.status_code == 500
        main.pipetting_controller.move_to_well.side_effect = None


# ===================================================================
# GET /api/pipetting/status
# ===================================================================

class TestPipettingStatus:
    def test_initialized(self, client):
        r = client.get("/api/pipetting/status")
        assert r.status_code == 200
        data = r.json()
        assert data["initialized"] is True
        assert "position" in data
        assert "is_executing" in data

    def test_not_initialized(self, client_no_controller):
        r = client_no_controller.get("/api/pipetting/status")
        assert r.status_code == 200
        data = r.json()
        assert data["initialized"] is False
        assert data["is_executing"] is False

    def test_status_exception_returns_false(self, client, monkeypatch):
        """When accessing attributes raises, status returns initialized=False."""
        import main
        # Make current_position raise via a property
        broken_ctrl = MagicMock()
        type(broken_ctrl).current_position = PropertyMock(side_effect=RuntimeError("broken"))
        monkeypatch.setattr(main, "pipetting_controller", broken_ctrl)
        r = client.get("/api/pipetting/status")
        assert r.status_code == 200
        data = r.json()
        assert data["initialized"] is False


# ===================================================================
# GET /api/pipetting/logs
# ===================================================================

class TestPipettingLogs:
    def test_with_logs(self, client):
        import main
        main.pipetting_controller.get_logs.return_value = ["log1", "log2"]
        r = client.get("/api/pipetting/logs")
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 2

    def test_with_no_logs(self, client):
        import main
        main.pipetting_controller.get_logs.return_value = []
        r = client.get("/api/pipetting/logs")
        assert r.status_code == 200
        assert r.json()["count"] == 0

    def test_not_initialized(self, client_no_controller):
        r = client_no_controller.get("/api/pipetting/logs")
        assert r.status_code == 200
        data = r.json()
        assert data["logs"] == []

    def test_logs_with_custom_last_n(self, client):
        import main
        main.pipetting_controller.get_logs.return_value = ["a"]
        r = client.get("/api/pipetting/logs?last_n=10")
        assert r.status_code == 200
        main.pipetting_controller.get_logs.assert_called_with(10)

    def test_logs_exception(self, client):
        import main
        main.pipetting_controller.get_logs.side_effect = RuntimeError("fail")
        r = client.get("/api/pipetting/logs")
        assert r.status_code == 200
        data = r.json()
        assert data["logs"] == []
        assert "Error" in data["message"]
        main.pipetting_controller.get_logs.side_effect = None


# ===================================================================
# POST /api/pipetting/set-pipette-count
# ===================================================================

class TestSetPipetteCount:
    def test_valid_count_1(self, client):
        r = client.post("/api/pipetting/set-pipette-count", json={"pipetteCount": 1})
        assert r.status_code == 200
        assert r.json()["pipette_count"] == 1

    def test_valid_count_3(self, client):
        r = client.post("/api/pipetting/set-pipette-count", json={"pipetteCount": 3})
        assert r.status_code == 200
        assert r.json()["pipette_count"] == 3

    def test_invalid_count_0_422(self, client):
        r = client.post("/api/pipetting/set-pipette-count", json={"pipetteCount": 0})
        assert r.status_code == 422

    def test_invalid_count_5_422(self, client):
        r = client.post("/api/pipetting/set-pipette-count", json={"pipetteCount": 5})
        assert r.status_code == 422

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.post("/api/pipetting/set-pipette-count", json={"pipetteCount": 1})
        assert r.status_code == 503

    def test_value_error_from_controller(self, client):
        import main
        main.pipetting_controller.set_pipette_count.side_effect = ValueError("bad count")
        r = client.post("/api/pipetting/set-pipette-count", json={"pipetteCount": 2})
        assert r.status_code == 400
        main.pipetting_controller.set_pipette_count.side_effect = None


# ===================================================================
# POST /api/pipetting/set-layout-type
# ===================================================================

class TestSetLayoutType:
    def test_microchip(self, client):
        r = client.post("/api/pipetting/set-layout-type", json={"layoutType": "microchip"})
        assert r.status_code == 200
        assert r.json()["layout_type"] == "microchip"

    def test_wellplate(self, client):
        r = client.post("/api/pipetting/set-layout-type", json={"layoutType": "wellplate"})
        assert r.status_code == 200
        assert r.json()["layout_type"] == "wellplate"

    def test_invalid_400(self, client):
        r = client.post("/api/pipetting/set-layout-type", json={"layoutType": "invalid"})
        assert r.status_code == 400

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.post("/api/pipetting/set-layout-type", json={"layoutType": "microchip"})
        assert r.status_code == 503


# ===================================================================
# POST /api/pipetting/set-layout
# ===================================================================

class TestSetLayout:
    def test_success_microchip(self, client):
        r = client.post("/api/pipetting/set-layout", json={"layoutType": "microchip"})
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "success"
        assert data["layout_type"] == "microchip"

    def test_success_wellplate(self, client):
        r = client.post("/api/pipetting/set-layout", json={"layoutType": "wellplate"})
        assert r.status_code == 200

    def test_invalid_layout_400(self, client):
        r = client.post("/api/pipetting/set-layout", json={"layoutType": "invalid"})
        assert r.status_code == 400

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.post("/api/pipetting/set-layout", json={"layoutType": "microchip"})
        assert r.status_code == 503

    def test_first_mapped_well_returned(self, client, monkeypatch):
        """When layout coords have a mapped well, it appears in the response."""
        from pipetting_controller import CoordinateMapper
        monkeypatch.setattr(CoordinateMapper, "LAYOUT_COORDINATES", {
            "microchip": {"A2": {"x": 10.0, "y": 20.0}, "B2": None}
        })
        r = client.post("/api/pipetting/set-layout", json={"layoutType": "microchip"})
        assert r.status_code == 200
        assert r.json()["first_mapped_well"] == "A2"

    def test_first_mapped_well_none_when_all_none(self, client, monkeypatch):
        """When all coordinates are None, first_mapped_well is None."""
        from pipetting_controller import CoordinateMapper
        monkeypatch.setattr(CoordinateMapper, "LAYOUT_COORDINATES", {
            "microchip": {"A2": None, "B2": None}
        })
        r = client.post("/api/pipetting/set-layout", json={"layoutType": "microchip"})
        assert r.status_code == 200
        assert r.json()["first_mapped_well"] is None


# ===================================================================
# POST /api/pipetting/toggle-z
# ===================================================================

class TestToggleZ:
    def test_up(self, client):
        r = client.post("/api/pipetting/toggle-z", json={"direction": "up"})
        assert r.status_code == 200
        assert r.json()["direction"] == "up"

    def test_down(self, client):
        r = client.post("/api/pipetting/toggle-z", json={"direction": "down"})
        assert r.status_code == 200
        assert r.json()["direction"] == "down"

    def test_invalid_direction_400(self, client):
        r = client.post("/api/pipetting/toggle-z", json={"direction": "left"})
        assert r.status_code == 400

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.post("/api/pipetting/toggle-z", json={"direction": "up"})
        assert r.status_code == 503


# ===================================================================
# POST /api/pipetting/aspirate
# ===================================================================

class TestAspirate:
    def test_success(self, client):
        r = client.post("/api/pipetting/aspirate", json={"volume": 5.0})
        assert r.status_code == 200
        assert r.json()["volume"] == 5.0

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.post("/api/pipetting/aspirate", json={"volume": 1.0})
        assert r.status_code == 503

    def test_invalid_volume_422(self, client):
        r = client.post("/api/pipetting/aspirate", json={"volume": 0})
        assert r.status_code == 422

    def test_exception_500(self, client):
        import main
        main.pipetting_controller.aspirate.side_effect = RuntimeError("pump error")
        r = client.post("/api/pipetting/aspirate", json={"volume": 1.0})
        assert r.status_code == 500
        main.pipetting_controller.aspirate.side_effect = None


# ===================================================================
# POST /api/pipetting/dispense
# ===================================================================

class TestDispense:
    def test_success(self, client):
        r = client.post("/api/pipetting/dispense", json={"volume": 5.0})
        assert r.status_code == 200
        assert r.json()["volume"] == 5.0

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.post("/api/pipetting/dispense", json={"volume": 1.0})
        assert r.status_code == 503

    def test_invalid_volume_422(self, client):
        r = client.post("/api/pipetting/dispense", json={"volume": -1.0})
        assert r.status_code == 422

    def test_exception_500(self, client):
        import main
        main.pipetting_controller.dispense.side_effect = RuntimeError("pump error")
        r = client.post("/api/pipetting/dispense", json={"volume": 1.0})
        assert r.status_code == 500
        main.pipetting_controller.dispense.side_effect = None


# ===================================================================
# POST /api/pipetting/set-controller-type
# ===================================================================

class TestSetControllerType:
    def test_raspberry_pi(self, client, monkeypatch):
        # Patch PipettingController() call inside the endpoint
        mock_new_ctrl = MagicMock()
        monkeypatch.setattr("main.PipettingController", lambda: mock_new_ctrl)
        r = client.post("/api/pipetting/set-controller-type", json={
            "controllerType": "raspberry_pi"
        })
        assert r.status_code == 200
        assert r.json()["controller_type"] == "raspberry_pi"

    def test_arduino_uno_q(self, client, monkeypatch):
        mock_new_ctrl = MagicMock()
        monkeypatch.setattr("main.PipettingController", lambda: mock_new_ctrl)
        r = client.post("/api/pipetting/set-controller-type", json={
            "controllerType": "arduino_uno_q"
        })
        assert r.status_code == 200
        assert r.json()["controller_type"] == "arduino_uno_q"

    def test_invalid_type_400(self, client):
        r = client.post("/api/pipetting/set-controller-type", json={
            "controllerType": "unknown"
        })
        assert r.status_code == 400

    def test_cleanup_error_does_not_fail(self, client, monkeypatch):
        """Even if cleanup raises, the endpoint still reinitializes."""
        import main
        main.pipetting_controller.cleanup.side_effect = RuntimeError("cleanup oops")
        mock_new_ctrl = MagicMock()
        monkeypatch.setattr("main.PipettingController", lambda: mock_new_ctrl)
        r = client.post("/api/pipetting/set-controller-type", json={
            "controllerType": "raspberry_pi"
        })
        assert r.status_code == 200
        main.pipetting_controller.cleanup.side_effect = None


# ===================================================================
# POST /api/axis/move
# ===================================================================

class TestAxisMove:
    def test_x_cw(self, client):
        import main
        main.pipetting_controller.move_axis.return_value = {"x": 10.0, "y": 0.0, "z": 0.0}
        r = client.post("/api/axis/move", json={"axis": "x", "steps": 100, "direction": "cw"})
        assert r.status_code == 200
        assert r.json()["status"] == "success"

    def test_y_ccw(self, client):
        import main
        main.pipetting_controller.move_axis.return_value = {"x": 0.0, "y": 5.0, "z": 0.0}
        r = client.post("/api/axis/move", json={"axis": "y", "steps": 50, "direction": "ccw"})
        assert r.status_code == 200

    def test_z_axis(self, client):
        import main
        main.pipetting_controller.move_axis.return_value = {"x": 0.0, "y": 0.0, "z": 1.0}
        r = client.post("/api/axis/move", json={"axis": "z", "steps": 10, "direction": "cw"})
        assert r.status_code == 200

    def test_pipette_axis(self, client):
        import main
        main.pipetting_controller.move_axis.return_value = {"x": 0.0, "y": 0.0, "z": 0.0, "pipette": 1.0}
        r = client.post("/api/axis/move", json={"axis": "pipette", "steps": 200, "direction": "ccw"})
        assert r.status_code == 200

    def test_invalid_axis_400(self, client):
        r = client.post("/api/axis/move", json={"axis": "w", "steps": 10, "direction": "cw"})
        assert r.status_code == 400

    def test_invalid_direction_400(self, client):
        r = client.post("/api/axis/move", json={"axis": "x", "steps": 10, "direction": "up"})
        assert r.status_code == 400

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.post("/api/axis/move", json={"axis": "x", "steps": 10, "direction": "cw"})
        assert r.status_code == 503

    def test_steps_validation(self, client):
        # steps must be > 0
        r = client.post("/api/axis/move", json={"axis": "x", "steps": 0, "direction": "cw"})
        assert r.status_code == 422


# ===================================================================
# GET /api/axis/positions
# ===================================================================

class TestAxisPositions:
    def test_success(self, client):
        import main
        main.pipetting_controller.get_axis_positions.return_value = {
            "x": 1.0, "y": 2.0, "z": 3.0, "pipette": 0.0
        }
        r = client.get("/api/axis/positions")
        assert r.status_code == 200
        assert r.json()["positions"]["x"] == 1.0

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.get("/api/axis/positions")
        assert r.status_code == 503


# ===================================================================
# POST /api/axis/set-position
# ===================================================================

class TestSetPosition:
    def test_success(self, client):
        import main
        main.pipetting_controller.get_axis_positions.return_value = {
            "x": 10.0, "y": 20.0, "z": 30.0, "pipette": 0.0
        }
        # Ensure controller_type is not arduino to exercise the RPi path
        main.pipetting_controller.controller_type = "raspberry_pi"
        r = client.post("/api/axis/set-position", json={
            "x": 10.0, "y": 20.0, "z": 30.0, "pipette_ml": 0.5
        })
        assert r.status_code == 200
        assert r.json()["status"] == "success"

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.post("/api/axis/set-position", json={
            "x": 0, "y": 0, "z": 0, "pipette_ml": 0
        })
        assert r.status_code == 503

    def test_arduino_path(self, client):
        """Arduino path skips per-motor step counter reset."""
        import main
        main.pipetting_controller.controller_type = "arduino_uno_q"
        main.pipetting_controller.get_axis_positions.return_value = {
            "x": 5.0, "y": 5.0, "z": 5.0, "pipette": 0.0
        }
        r = client.post("/api/axis/set-position", json={
            "x": 5.0, "y": 5.0, "z": 5.0, "pipette_ml": 0.0
        })
        assert r.status_code == 200
        # Reset
        main.pipetting_controller.controller_type = "raspberry_pi"


# ===================================================================
# GET /api/config
# ===================================================================

class TestGetConfig:
    def test_returns_config(self, client):
        r = client.get("/api/config")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "success"
        assert "config" in data
        assert "STEPS_PER_MM_X" in data["config"]


# ===================================================================
# POST /api/config
# ===================================================================

class TestPostConfig:
    def _full_config(self):
        return {
            "STEPS_PER_MM_X": 200,
            "STEPS_PER_MM_Y": 200,
            "STEPS_PER_MM_Z": 200,
            "PIPETTE_STEPS_PER_ML": 60,
            "PIPETTE_MAX_ML": 100.0,
            "PICKUP_DEPTH": 40.0,
            "DROPOFF_DEPTH": 5.0,
            "SAFE_HEIGHT": 20.0,
            "RINSE_CYCLES": 1,
            "TRAVEL_SPEED": 0.0001,
            "PIPETTE_SPEED": 0.001,
            "WS_POSITION_X": 50.0,
            "WS_POSITION_Y": 13.0,
            "WS_HEIGHT": 15.0,
            "WS_WIDTH": 60.0,
            "WS_GAP": 14.0,
            "INVERT_X": False,
            "INVERT_Y": False,
            "INVERT_Z": False,
            "INVERT_PIPETTE": False,
            "CONTROLLER_TYPE": "raspberry_pi",
        }

    def test_save_and_reinitialize(self, client, monkeypatch):
        mock_new_ctrl = MagicMock()
        monkeypatch.setattr("main.PipettingController", lambda: mock_new_ctrl)
        r = client.post("/api/config", json=self._full_config())
        assert r.status_code == 200
        assert r.json()["status"] == "success"

    def test_reinit_fails_still_success(self, client, monkeypatch):
        """When PipettingController() raises during reinit, endpoint still succeeds."""
        monkeypatch.setattr("main.PipettingController", MagicMock(side_effect=RuntimeError("init fail")))
        r = client.post("/api/config", json=self._full_config())
        assert r.status_code == 200

    def test_cleanup_error_during_reinit(self, client, monkeypatch):
        """If cleanup raises, reinit still proceeds."""
        import main
        main.pipetting_controller.cleanup.side_effect = RuntimeError("oops")
        mock_new_ctrl = MagicMock()
        monkeypatch.setattr("main.PipettingController", lambda: mock_new_ctrl)
        r = client.post("/api/config", json=self._full_config())
        assert r.status_code == 200
        main.pipetting_controller.cleanup.side_effect = None


# ===================================================================
# POST /api/coordinates/capture
# ===================================================================

class TestCaptureCoordinate:
    def test_success(self, client):
        import main
        main.pipetting_controller.current_position.x = 15.0
        main.pipetting_controller.current_position.y = 25.0
        r = client.post("/api/coordinates/capture", json={
            "layout": "microchip",
            "wellId": "A2",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "success"
        assert data["x"] == 15.0
        assert data["y"] == 25.0

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.post("/api/coordinates/capture", json={
            "layout": "microchip",
            "wellId": "A2",
        })
        assert r.status_code == 503


# ===================================================================
# POST /api/coordinates/save
# ===================================================================

class TestSaveCoordinate:
    def test_save_with_coords(self, client):
        r = client.post("/api/coordinates/save", json={
            "layout": "microchip",
            "wellId": "B2",
            "x": 50.0,
            "y": 60.0,
        })
        assert r.status_code == 200
        assert r.json()["status"] == "success"
        assert "Saved" in r.json()["message"]

    def test_clear_coordinate(self, client):
        r = client.post("/api/coordinates/save", json={
            "layout": "microchip",
            "wellId": "B2",
            "x": None,
            "y": None,
        })
        assert r.status_code == 200
        assert "Cleared" in r.json()["message"]


# ===================================================================
# GET /api/coordinates/{layout}
# ===================================================================

class TestGetCoordinates:
    def test_returns_stored(self, client):
        r = client.get("/api/coordinates/microchip")
        assert r.status_code == 200
        data = r.json()
        assert data["layout"] == "microchip"
        assert "coordinates" in data

    def test_unknown_layout_empty(self, client):
        r = client.get("/api/coordinates/nonexistent")
        assert r.status_code == 200
        assert r.json()["coordinates"] == {}


# ===================================================================
# POST /api/program/save
# ===================================================================

class TestProgramSave:
    def test_success(self, client):
        r = client.post("/api/program/save", json={
            "steps": [_step_payload()],
        })
        assert r.status_code == 200
        assert r.json()["status"] == "success"

    def test_with_schedule(self, client):
        r = client.post("/api/program/save", json={
            "steps": [_step_payload()],
            "schedule": {"cronExpression": "0 8 * * *", "enabled": True},
        })
        assert r.status_code == 200


# ===================================================================
# GET /api/program/load
# ===================================================================

class TestProgramLoad:
    def test_no_file(self, client):
        r = client.get("/api/program/load")
        assert r.status_code == 200
        data = r.json()
        assert data["steps"] == []

    def test_with_saved_file(self, client):
        # First save
        client.post("/api/program/save", json={
            "steps": [_step_payload()],
        })
        r = client.get("/api/program/load")
        assert r.status_code == 200
        data = r.json()
        assert len(data["steps"]) == 1

    def test_corrupt_file_500(self, client, monkeypatch):
        import main
        # Write corrupt JSON
        main.SCHEDULED_PROGRAM_FILE.write_text("{invalid json")
        r = client.get("/api/program/load")
        assert r.status_code == 500


# ===================================================================
# GET /api/program/status
# ===================================================================

class TestProgramStatus:
    def test_idle_no_file(self, client):
        r = client.get("/api/program/status")
        assert r.status_code == 200
        assert r.json()["execution"]["status"] == "idle"

    def test_with_execution_data(self, client):
        import main
        main.SCHEDULED_PROGRAM_FILE.write_text(json.dumps({
            "steps": [],
            "execution": {"status": "running"},
        }))
        r = client.get("/api/program/status")
        assert r.status_code == 200
        assert r.json()["execution"]["status"] == "running"

    def test_corrupt_file_returns_idle(self, client):
        import main
        main.SCHEDULED_PROGRAM_FILE.write_text("{bad json")
        r = client.get("/api/program/status")
        assert r.status_code == 200
        assert r.json()["execution"]["status"] == "idle"


# ===================================================================
# GET /api/programs/list
# ===================================================================

class TestProgramsList:
    def test_empty(self, client):
        r = client.get("/api/programs/list")
        assert r.status_code == 200
        assert r.json()["programs"] == []

    def test_populated(self, client):
        # Save two programs first
        client.post("/api/programs/save", json={
            "name": "test-prog",
            "steps": [_step_payload()],
        })
        r = client.get("/api/programs/list")
        assert r.status_code == 200
        progs = r.json()["programs"]
        assert len(progs) == 1
        assert progs[0]["name"] == "test-prog"

    def test_corrupt_file_skipped(self, client):
        """A corrupt JSON file in PROGRAMS_DIR is skipped gracefully."""
        import main
        (main.PROGRAMS_DIR / "broken.json").write_text("{not valid")
        r = client.get("/api/programs/list")
        assert r.status_code == 200
        # The broken file should be skipped
        for p in r.json()["programs"]:
            assert p["name"] != "broken"


# ===================================================================
# POST /api/programs/save
# ===================================================================

class TestProgramsSave:
    def test_new_program(self, client):
        r = client.post("/api/programs/save", json={
            "name": "my-prog",
            "steps": [_step_payload()],
        })
        assert r.status_code == 200
        assert r.json()["name"] == "my-prog"

    def test_overwrite_existing(self, client):
        client.post("/api/programs/save", json={
            "name": "my-prog",
            "steps": [_step_payload()],
        })
        # Overwrite
        r = client.post("/api/programs/save", json={
            "name": "my-prog",
            "steps": [_step_payload(), _step_payload()],
        })
        assert r.status_code == 200
        # Verify overwritten
        load_r = client.get("/api/programs/load/my-prog")
        assert len(load_r.json()["steps"]) == 2

    def test_with_schedule(self, client):
        r = client.post("/api/programs/save", json={
            "name": "sched-prog",
            "steps": [_step_payload()],
            "schedule": {"cronExpression": "30 9 * * 1-5", "enabled": True},
        })
        assert r.status_code == 200


# ===================================================================
# GET /api/programs/load/{name}
# ===================================================================

class TestProgramsLoad:
    def test_found(self, client):
        client.post("/api/programs/save", json={
            "name": "loadable",
            "steps": [_step_payload()],
        })
        r = client.get("/api/programs/load/loadable")
        assert r.status_code == 200
        assert r.json()["name"] == "loadable"
        assert len(r.json()["steps"]) == 1

    def test_not_found_404(self, client):
        r = client.get("/api/programs/load/nonexistent")
        assert r.status_code == 404


# ===================================================================
# DELETE /api/programs/{name}
# ===================================================================

class TestProgramsDelete:
    def test_found(self, client):
        client.post("/api/programs/save", json={
            "name": "deletable",
            "steps": [_step_payload()],
        })
        r = client.delete("/api/programs/deletable")
        assert r.status_code == 200
        assert "deleted" in r.json()["message"].lower()

    def test_not_found_404(self, client):
        r = client.delete("/api/programs/nonexistent")
        assert r.status_code == 404


# ===================================================================
# GET /api/programs/download/{name}
# ===================================================================

class TestProgramsDownload:
    def test_success(self, client):
        client.post("/api/programs/save", json={
            "name": "downloadable",
            "steps": [_step_payload()],
        })
        r = client.get("/api/programs/download/downloadable")
        assert r.status_code == 200
        assert "application/json" in r.headers["content-type"]

    def test_not_found_404(self, client):
        r = client.get("/api/programs/download/nonexistent")
        assert r.status_code == 404


# ===================================================================
# POST /api/drift-test/start
# ===================================================================

class TestDriftTestStart:
    def test_success(self, client, monkeypatch):
        import main
        mock_thread = MagicMock()
        monkeypatch.setattr("main.threading.Thread", lambda **kw: mock_thread)
        r = client.post("/api/drift-test/start", json={
            "cycles": 5,
            "motor_speed": 0.001,
            "steps_per_mm": 200,
            "motor": 1,
        })
        assert r.status_code == 200
        assert r.json()["status"] == "started"
        mock_thread.start.assert_called_once()
        # Reset
        main.drift_test_running = False

    def test_already_running_400(self, client, monkeypatch):
        import main
        monkeypatch.setattr(main, "drift_test_running", True)
        r = client.post("/api/drift-test/start", json={
            "cycles": 5,
            "motor_speed": 0.001,
            "steps_per_mm": 200,
            "motor": 1,
        })
        assert r.status_code == 400

    def test_not_initialized_503(self, client_no_controller, monkeypatch):
        import main
        monkeypatch.setattr(main, "drift_test_running", False)
        r = client_no_controller.post("/api/drift-test/start", json={
            "cycles": 5,
            "motor_speed": 0.001,
            "steps_per_mm": 200,
            "motor": 1,
        })
        assert r.status_code == 503


# ===================================================================
# POST /api/drift-test/stop
# ===================================================================

class TestDriftTestStop:
    def test_success(self, client, monkeypatch):
        import main
        monkeypatch.setattr(main, "drift_test_running", True)
        r = client.post("/api/drift-test/stop")
        assert r.status_code == 200
        assert r.json()["status"] == "stopping"

    def test_not_running_400(self, client):
        r = client.post("/api/drift-test/stop")
        assert r.status_code == 400


# ===================================================================
# GET /api/drift-test/status
# ===================================================================

class TestDriftTestStatus:
    def test_idle(self, client):
        r = client.get("/api/drift-test/status")
        assert r.status_code == 200
        data = r.json()
        assert data["running"] is False
        assert data["data"]["status"] == "idle"

    def test_running(self, client, monkeypatch):
        import main
        monkeypatch.setattr(main, "drift_test_running", True)
        monkeypatch.setattr(main, "drift_test_results", {
            "status": "running",
            "current_cycle": 3,
            "total_cycles": 10,
            "cycles": [],
            "summary": None,
            "error": None,
        })
        r = client.get("/api/drift-test/status")
        assert r.status_code == 200
        data = r.json()
        assert data["running"] is True
        assert data["data"]["status"] == "running"

    def test_completed(self, client, monkeypatch):
        import main
        monkeypatch.setattr(main, "drift_test_running", False)
        monkeypatch.setattr(main, "drift_test_results", {
            "status": "completed",
            "current_cycle": 10,
            "total_cycles": 10,
            "cycles": [{"drift_mm": 0.01}],
            "summary": {"total_cycles": 10},
            "error": None,
        })
        r = client.get("/api/drift-test/status")
        assert r.status_code == 200
        assert r.json()["data"]["status"] == "completed"


# ===================================================================
# POST /api/drift-test/clear
# ===================================================================

class TestDriftTestClear:
    def test_success(self, client):
        r = client.post("/api/drift-test/clear")
        assert r.status_code == 200
        assert r.json()["status"] == "success"

    def test_while_running_400(self, client, monkeypatch):
        import main
        monkeypatch.setattr(main, "drift_test_running", True)
        r = client.post("/api/drift-test/clear")
        assert r.status_code == 400


# ===================================================================
# GET /api/limit-switches  (RPi path)
# ===================================================================

class TestLimitSwitches:
    def test_rpi_path(self, client):
        import main
        main.pipetting_controller.controller_type = "raspberry_pi"
        r = client.get("/api/limit-switches")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "success"
        assert "limit_states" in data
        assert "pin_configuration" in data

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.get("/api/limit-switches")
        assert r.status_code == 503

    def test_arduino_path(self, client):
        import main
        main.pipetting_controller.controller_type = "arduino_uno_q"
        main.pipetting_controller.stepper_controller.lock.locked.return_value = False
        main.pipetting_controller.stepper_controller.get_limit_states.return_value = [
            {"motor_id": 1, "min_triggered": False, "max_triggered": True,
             "limit_min_pin": 10, "limit_max_pin": 11},
        ]
        r = client.get("/api/limit-switches")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "success"
        # JSON keys are strings, motor_id=1 -> key "1"
        assert data["limit_states"]["1"]["max"] is True
        # Reset
        main.pipetting_controller.controller_type = "raspberry_pi"

    def test_arduino_busy_with_cache(self, client):
        import main
        main.pipetting_controller.controller_type = "arduino_uno_q"
        main.pipetting_controller.stepper_controller.lock.locked.return_value = True

        # Set cached result
        main.get_limit_switches._last_result = {
            "status": "success",
            "limit_states": {1: {"min": False, "max": True}},
            "pin_configuration": {1: {"min_pin": 10, "max_pin": 11}},
            "limits": [],
        }
        r = client.get("/api/limit-switches")
        assert r.status_code == 200
        assert r.json()["status"] == "busy"
        # Reset
        main.pipetting_controller.controller_type = "raspberry_pi"
        main.pipetting_controller.stepper_controller.lock.locked.return_value = False
        if hasattr(main.get_limit_switches, "_last_result"):
            del main.get_limit_switches._last_result

    def test_arduino_busy_without_cache(self, client):
        import main
        main.pipetting_controller.controller_type = "arduino_uno_q"
        main.pipetting_controller.stepper_controller.lock.locked.return_value = True

        # Make sure there's no cached result
        if hasattr(main.get_limit_switches, "_last_result"):
            del main.get_limit_switches._last_result

        r = client.get("/api/limit-switches")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "busy"
        assert data["limit_states"] == {}
        # Reset
        main.pipetting_controller.controller_type = "raspberry_pi"
        main.pipetting_controller.stepper_controller.lock.locked.return_value = False


# ===================================================================
# POST /api/led/test
# ===================================================================

class TestLedTest:
    def test_wrong_controller_type_400(self, client):
        import main
        main.pipetting_controller.controller_type = "raspberry_pi"
        r = client.post("/api/led/test", json={"pattern": "all", "value": 0})
        assert r.status_code == 400

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.post("/api/led/test", json={"pattern": "all", "value": 0})
        assert r.status_code == 503

    def test_success_arduino(self, client):
        import main
        main.pipetting_controller.controller_type = "arduino_uno_q"
        main.pipetting_controller.stepper_controller.led_test.return_value = True
        r = client.post("/api/led/test", json={"pattern": "all", "value": 0})
        assert r.status_code == 200
        assert r.json()["status"] == "success"
        # Reset
        main.pipetting_controller.controller_type = "raspberry_pi"

    def test_led_test_returns_false(self, client):
        import main
        main.pipetting_controller.controller_type = "arduino_uno_q"
        main.pipetting_controller.stepper_controller.led_test.return_value = False
        r = client.post("/api/led/test", json={"pattern": "rgb", "value": 1})
        assert r.status_code == 200
        assert r.json()["status"] == "failed"
        # Reset
        main.pipetting_controller.controller_type = "raspberry_pi"


# ===================================================================
# GET /api/mcu/ping
# ===================================================================

class TestMcuPing:
    def test_wrong_controller_type_400(self, client):
        import main
        main.pipetting_controller.controller_type = "raspberry_pi"
        r = client.get("/api/mcu/ping")
        assert r.status_code == 400

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.get("/api/mcu/ping")
        assert r.status_code == 503

    def test_success_arduino(self, client):
        import main
        main.pipetting_controller.controller_type = "arduino_uno_q"
        main.pipetting_controller.stepper_controller.lock.locked.return_value = False
        main.pipetting_controller.stepper_controller.ping.return_value = True
        r = client.get("/api/mcu/ping")
        assert r.status_code == 200
        assert r.json()["connected"] is True
        # Reset
        main.pipetting_controller.controller_type = "raspberry_pi"

    def test_busy_when_locked(self, client):
        import main
        main.pipetting_controller.controller_type = "arduino_uno_q"
        main.pipetting_controller.stepper_controller.lock.locked.return_value = True
        r = client.get("/api/mcu/ping")
        assert r.status_code == 200
        assert r.json()["status"] == "busy"
        # Reset
        main.pipetting_controller.controller_type = "raspberry_pi"
        main.pipetting_controller.stepper_controller.lock.locked.return_value = False

    def test_ping_returns_false(self, client):
        import main
        main.pipetting_controller.controller_type = "arduino_uno_q"
        main.pipetting_controller.stepper_controller.lock.locked.return_value = False
        main.pipetting_controller.stepper_controller.ping.return_value = False
        r = client.get("/api/mcu/ping")
        assert r.status_code == 200
        assert r.json()["connected"] is False
        assert r.json()["status"] == "failed"
        # Reset
        main.pipetting_controller.controller_type = "raspberry_pi"


# ===================================================================
# GET /api/mcu/limits
# ===================================================================

class TestMcuLimits:
    def test_wrong_controller_type_400(self, client):
        import main
        main.pipetting_controller.controller_type = "raspberry_pi"
        r = client.get("/api/mcu/limits")
        assert r.status_code == 400

    def test_not_initialized_503(self, client_no_controller):
        r = client_no_controller.get("/api/mcu/limits")
        assert r.status_code == 503

    def test_success_arduino(self, client):
        import main
        main.pipetting_controller.controller_type = "arduino_uno_q"
        main.pipetting_controller.stepper_controller.lock.locked.return_value = False
        main.pipetting_controller.stepper_controller.get_limit_states.return_value = [
            {"motor_id": 1, "min_triggered": False, "max_triggered": False}
        ]
        r = client.get("/api/mcu/limits")
        assert r.status_code == 200
        assert r.json()["status"] == "success"
        # Reset
        main.pipetting_controller.controller_type = "raspberry_pi"

    def test_busy_when_locked(self, client):
        import main
        main.pipetting_controller.controller_type = "arduino_uno_q"
        main.pipetting_controller.stepper_controller.lock.locked.return_value = True
        r = client.get("/api/mcu/limits")
        assert r.status_code == 200
        assert r.json()["status"] == "busy"
        # Reset
        main.pipetting_controller.controller_type = "raspberry_pi"
        main.pipetting_controller.stepper_controller.lock.locked.return_value = False


# ===================================================================
# Edge case: execute endpoint with exception during step conversion
# ===================================================================

class TestExecuteEdgeCases:
    def test_general_exception_500(self, client, monkeypatch):
        """When an unexpected exception occurs during step conversion, endpoint returns 500."""
        from pipetting_controller import PipettingStep

        def bad_init(self, *args, **kwargs):
            raise RuntimeError("unexpected error")
        monkeypatch.setattr(PipettingStep, "__init__", bad_init)

        r = client.post("/api/pipetting/execute", json={
            "steps": [_step_payload()]
        })
        assert r.status_code == 500

    def test_home_step_type(self, client, monkeypatch):
        """Steps with stepType='home' are accepted."""
        mock_thread = MagicMock()
        monkeypatch.setattr("main.threading.Thread", lambda **kw: mock_thread)

        r = client.post("/api/pipetting/execute", json={
            "steps": [_step_payload(stepType="home")]
        })
        assert r.status_code == 200

    def test_wait_step_type(self, client, monkeypatch):
        """Steps with stepType='wait' are accepted."""
        mock_thread = MagicMock()
        monkeypatch.setattr("main.threading.Thread", lambda **kw: mock_thread)

        r = client.post("/api/pipetting/execute", json={
            "steps": [_step_payload(stepType="wait", waitTime=5)]
        })
        assert r.status_code == 200


# ===================================================================
# Edge cases for stop endpoint
# ===================================================================

class TestStopEdgeCases:
    def test_stop_exception_500(self, client):
        import main
        main.pipetting_controller.stop.side_effect = RuntimeError("can't stop")
        r = client.post("/api/pipetting/stop")
        assert r.status_code == 500
        main.pipetting_controller.stop.side_effect = None


# ===================================================================
# Edge cases for home endpoint
# ===================================================================

class TestHomeEdgeCases:
    def test_home_exception_500(self, client):
        import main
        main.pipetting_controller.home.side_effect = RuntimeError("motor stuck")
        r = client.post("/api/pipetting/home")
        assert r.status_code == 500
        main.pipetting_controller.home.side_effect = None

    def test_home_resets_is_executing(self, client, monkeypatch):
        """After home completes (even on error), is_executing is False and operation is idle."""
        import main
        main.pipetting_controller.home.side_effect = RuntimeError("fail")
        r = client.post("/api/pipetting/home")
        assert r.status_code == 500
        assert main.is_executing is False
        main.pipetting_controller.home.side_effect = None


# ===================================================================
# Edge cases for set-layout-type
# ===================================================================

class TestSetLayoutTypeEdgeCases:
    def test_exception_500(self, client):
        """When save_position raises, endpoint returns 500."""
        import main
        main.pipetting_controller.save_position.side_effect = RuntimeError("disk full")
        r = client.post("/api/pipetting/set-layout-type", json={"layoutType": "microchip"})
        assert r.status_code == 500
        main.pipetting_controller.save_position.side_effect = None


# ===================================================================
# Edge cases for set-layout
# ===================================================================

class TestSetLayoutEdgeCases:
    def test_exception_500(self, client):
        import main
        main.pipetting_controller.save_position.side_effect = RuntimeError("disk full")
        r = client.post("/api/pipetting/set-layout", json={"layoutType": "microchip"})
        assert r.status_code == 500
        main.pipetting_controller.save_position.side_effect = None


# ===================================================================
# Edge cases for toggle-z
# ===================================================================

class TestToggleZEdgeCases:
    def test_exception_500(self, client):
        import main
        main.pipetting_controller.toggle_z.side_effect = RuntimeError("z stuck")
        r = client.post("/api/pipetting/toggle-z", json={"direction": "up"})
        assert r.status_code == 500
        main.pipetting_controller.toggle_z.side_effect = None


# ===================================================================
# Edge cases for axis/move
# ===================================================================

class TestAxisMoveEdgeCases:
    def test_exception_500(self, client):
        import main
        main.pipetting_controller.move_axis.side_effect = RuntimeError("fail")
        r = client.post("/api/axis/move", json={"axis": "x", "steps": 10, "direction": "cw"})
        assert r.status_code == 500
        main.pipetting_controller.move_axis.side_effect = None


# ===================================================================
# Edge cases for axis/positions
# ===================================================================

class TestAxisPositionsEdgeCases:
    def test_exception_500(self, client):
        import main
        main.pipetting_controller.get_axis_positions.side_effect = RuntimeError("fail")
        r = client.get("/api/axis/positions")
        assert r.status_code == 500
        main.pipetting_controller.get_axis_positions.side_effect = None


# ===================================================================
# Edge cases for axis/set-position
# ===================================================================

class TestSetPositionEdgeCases:
    def test_exception_500(self, client, monkeypatch):
        import main
        # Make save_position raise to trigger the except block
        main.pipetting_controller.save_position.side_effect = RuntimeError("fail")
        r = client.post("/api/axis/set-position", json={
            "x": 0, "y": 0, "z": 0, "pipette_ml": 0
        })
        assert r.status_code == 500
        main.pipetting_controller.save_position.side_effect = None


# ===================================================================
# Edge cases for set-pipette-count
# ===================================================================

class TestSetPipetteCountEdgeCases:
    def test_generic_exception_500(self, client):
        import main
        main.pipetting_controller.set_pipette_count.side_effect = RuntimeError("unexpected")
        r = client.post("/api/pipetting/set-pipette-count", json={"pipetteCount": 1})
        assert r.status_code == 500
        main.pipetting_controller.set_pipette_count.side_effect = None


# ===================================================================
# Edge case: set-controller-type reinit failure
# ===================================================================

class TestSetControllerTypeEdgeCases:
    def test_reinit_exception_500(self, client, monkeypatch):
        monkeypatch.setattr("main.PipettingController", MagicMock(side_effect=RuntimeError("init fail")))
        r = client.post("/api/pipetting/set-controller-type", json={
            "controllerType": "raspberry_pi"
        })
        assert r.status_code == 500


# ===================================================================
# Edge case: limit switches RPi exception
# ===================================================================

class TestLimitSwitchesEdgeCases:
    def test_rpi_exception_500(self, client):
        import main
        main.pipetting_controller.controller_type = "raspberry_pi"
        main.pipetting_controller.stepper_controller.check_all_limit_switches.side_effect = RuntimeError("gpio error")
        r = client.get("/api/limit-switches")
        assert r.status_code == 500
        main.pipetting_controller.stepper_controller.check_all_limit_switches.side_effect = None

    def test_arduino_exception_500(self, client):
        import main
        main.pipetting_controller.controller_type = "arduino_uno_q"
        main.pipetting_controller.stepper_controller.lock.locked.return_value = False
        main.pipetting_controller.stepper_controller.get_limit_states.side_effect = RuntimeError("comm error")
        r = client.get("/api/limit-switches")
        assert r.status_code == 500
        # Reset
        main.pipetting_controller.controller_type = "raspberry_pi"
        main.pipetting_controller.stepper_controller.get_limit_states.side_effect = None


# ===================================================================
# Edge cases for LED/MCU endpoints
# ===================================================================

class TestLedMcuEdgeCases:
    def test_led_exception_500(self, client):
        import main
        main.pipetting_controller.controller_type = "arduino_uno_q"
        main.pipetting_controller.stepper_controller.led_test.side_effect = RuntimeError("hw error")
        r = client.post("/api/led/test", json={"pattern": "all", "value": 0})
        assert r.status_code == 500
        main.pipetting_controller.controller_type = "raspberry_pi"
        main.pipetting_controller.stepper_controller.led_test.side_effect = None

    def test_mcu_ping_exception_500(self, client):
        import main
        main.pipetting_controller.controller_type = "arduino_uno_q"
        main.pipetting_controller.stepper_controller.lock.locked.return_value = False
        main.pipetting_controller.stepper_controller.ping.side_effect = RuntimeError("timeout")
        r = client.get("/api/mcu/ping")
        assert r.status_code == 500
        main.pipetting_controller.controller_type = "raspberry_pi"
        main.pipetting_controller.stepper_controller.ping.side_effect = None

    def test_mcu_limits_exception_500(self, client):
        import main
        main.pipetting_controller.controller_type = "arduino_uno_q"
        main.pipetting_controller.stepper_controller.lock.locked.return_value = False
        main.pipetting_controller.stepper_controller.get_limit_states.side_effect = RuntimeError("fail")
        r = client.get("/api/mcu/limits")
        assert r.status_code == 500
        main.pipetting_controller.controller_type = "raspberry_pi"
        main.pipetting_controller.stepper_controller.get_limit_states.side_effect = None


# ===================================================================
# Edge cases for coordinate endpoints
# ===================================================================

class TestCoordinateEdgeCases:
    def test_capture_exception_500(self, client, monkeypatch):
        import main
        broken_ctrl = MagicMock()
        type(broken_ctrl).current_position = PropertyMock(side_effect=RuntimeError("broken"))
        monkeypatch.setattr(main, "pipetting_controller", broken_ctrl)
        r = client.post("/api/coordinates/capture", json={
            "layout": "microchip",
            "wellId": "C2",
        })
        assert r.status_code == 500

    def test_save_exception_500(self, client, monkeypatch):
        import settings as settings_mod
        monkeypatch.setattr(settings_mod, "load", MagicMock(side_effect=RuntimeError("no config")))
        r = client.post("/api/coordinates/save", json={
            "layout": "microchip",
            "wellId": "A2",
            "x": 1.0,
            "y": 2.0,
        })
        assert r.status_code == 500


# ===================================================================
# Drift test start motor names
# ===================================================================

class TestDriftTestMotorNames:
    def test_motor_2(self, client, monkeypatch):
        import main
        mock_thread = MagicMock()
        monkeypatch.setattr("main.threading.Thread", lambda **kw: mock_thread)
        r = client.post("/api/drift-test/start", json={
            "cycles": 1, "motor_speed": 0.001, "steps_per_mm": 200, "motor": 2,
        })
        assert r.status_code == 200
        assert r.json()["motor_name"] == "Y-Axis"
        main.drift_test_running = False

    def test_motor_3(self, client, monkeypatch):
        import main
        mock_thread = MagicMock()
        monkeypatch.setattr("main.threading.Thread", lambda **kw: mock_thread)
        r = client.post("/api/drift-test/start", json={
            "cycles": 1, "motor_speed": 0.001, "steps_per_mm": 200, "motor": 3,
        })
        assert r.status_code == 200
        assert r.json()["motor_name"] == "Z-Axis"
        main.drift_test_running = False

    def test_motor_4(self, client, monkeypatch):
        import main
        mock_thread = MagicMock()
        monkeypatch.setattr("main.threading.Thread", lambda **kw: mock_thread)
        r = client.post("/api/drift-test/start", json={
            "cycles": 1, "motor_speed": 0.001, "steps_per_mm": 200, "motor": 4,
        })
        assert r.status_code == 200
        assert r.json()["motor_name"] == "Pipette"
        main.drift_test_running = False


# ===================================================================
# Edge case: config GET exception
# ===================================================================

class TestGetConfigEdgeCases:
    def test_exception_500(self, client, monkeypatch):
        import settings as settings_mod
        monkeypatch.setattr(settings_mod, "load", MagicMock(side_effect=RuntimeError("bad file")))
        r = client.get("/api/config")
        assert r.status_code == 500


# ===================================================================
# Lifespan: PipettingController init failure (lines 44-46)
# ===================================================================

class TestLifespanInitFailure:
    def test_controller_init_failure(self, mock_gpio, patch_config_path, tmp_path, monkeypatch):
        """When PipettingController() raises during lifespan, controller is None."""
        import main

        # Reset to None so the lifespan's except branch leaves it as None
        monkeypatch.setattr(main, "pipetting_controller", None)
        monkeypatch.setattr(main, "PipettingController",
                            MagicMock(side_effect=RuntimeError("hardware missing")))

        sched_file = tmp_path / "scheduled_program.json"
        programs_dir = tmp_path / "programs"
        programs_dir.mkdir(exist_ok=True)
        monkeypatch.setattr(main, "SCHEDULED_PROGRAM_FILE", sched_file)
        monkeypatch.setattr(main, "PROGRAMS_DIR", programs_dir)

        with TestClient(main.app) as tc:
            # Controller should be None — status endpoint should reflect that
            r = tc.get("/api/pipetting/status")
            assert r.status_code == 200
            assert r.json()["initialized"] is False


# ===================================================================
# save_program_as: corrupt existing file (lines 322-323)
# ===================================================================

class TestProgramsSaveCorruptExisting:
    def test_overwrite_corrupt_existing(self, client):
        """When an existing program file is corrupt, save proceeds (ignores bad read)."""
        import main
        # Write a corrupt file in the programs dir
        corrupt = main.PROGRAMS_DIR / "corrupt-prog.json"
        corrupt.write_text("{not valid json")

        # Now save over it — the except: pass should kick in
        r = client.post("/api/programs/save", json={
            "name": "corrupt-prog",
            "steps": [_step_payload()],
        })
        assert r.status_code == 200
        assert r.json()["name"] == "corrupt-prog"


# ===================================================================
# load_program_by_name: corrupt file raises 500 (lines 351-352)
# ===================================================================

class TestProgramsLoadCorruptFile:
    def test_corrupt_file_500(self, client):
        import main
        corrupt = main.PROGRAMS_DIR / "bad-prog.json"
        corrupt.write_text("{not valid json")
        r = client.get("/api/programs/load/bad-prog")
        assert r.status_code == 500


# ===================================================================
# set-controller-type when controller is None (line 740->746 branch)
# ===================================================================

class TestSetControllerTypeNullController:
    def test_controller_none_before_switch(self, client, monkeypatch):
        """When pipetting_controller is None, skip cleanup and just init."""
        import main
        monkeypatch.setattr(main, "pipetting_controller", None)
        mock_new = _build_mock_controller()
        monkeypatch.setattr(main, "PipettingController", lambda: mock_new)
        r = client.post("/api/pipetting/set-controller-type", json={
            "controllerType": "raspberry_pi",
        })
        assert r.status_code == 200


# ===================================================================
# update_configuration when controller is None (line 1521->1527 branch)
# ===================================================================

class TestPostConfigNullController:
    def _full_config(self):
        return {
            "STEPS_PER_MM_X": 200,
            "STEPS_PER_MM_Y": 200,
            "STEPS_PER_MM_Z": 200,
            "PIPETTE_STEPS_PER_ML": 60,
            "PIPETTE_MAX_ML": 100.0,
            "PICKUP_DEPTH": 40.0,
            "DROPOFF_DEPTH": 5.0,
            "SAFE_HEIGHT": 20.0,
            "RINSE_CYCLES": 1,
            "TRAVEL_SPEED": 0.0001,
            "PIPETTE_SPEED": 0.001,
            "WS_POSITION_X": 50.0,
            "WS_POSITION_Y": 13.0,
            "WS_HEIGHT": 15.0,
            "WS_WIDTH": 60.0,
            "WS_GAP": 14.0,
            "INVERT_X": False,
            "INVERT_Y": False,
            "INVERT_Z": False,
            "INVERT_PIPETTE": False,
            "CONTROLLER_TYPE": "raspberry_pi",
        }

    def test_controller_none_before_reinit(self, client, monkeypatch):
        """When pipetting_controller is None, skip cleanup and just reinit."""
        import main
        monkeypatch.setattr(main, "pipetting_controller", None)
        mock_new = _build_mock_controller()
        monkeypatch.setattr(main, "PipettingController", lambda: mock_new)
        r = client.post("/api/config", json=self._full_config())
        assert r.status_code == 200


# ===================================================================
# update_configuration: outer except (lines 1539-1540)
# ===================================================================

class TestPostConfigOuterException:
    def test_settings_save_raises_500(self, client, monkeypatch):
        """When settings.save raises inside update_configuration, return 500."""
        import settings as settings_mod
        monkeypatch.setattr(settings_mod, "save",
                            MagicMock(side_effect=RuntimeError("disk full")))
        config = {
            "STEPS_PER_MM_X": 200,
            "STEPS_PER_MM_Y": 200,
            "STEPS_PER_MM_Z": 200,
            "PIPETTE_STEPS_PER_ML": 60,
            "PIPETTE_MAX_ML": 100.0,
            "PICKUP_DEPTH": 40.0,
            "DROPOFF_DEPTH": 5.0,
            "SAFE_HEIGHT": 20.0,
            "RINSE_CYCLES": 1,
            "TRAVEL_SPEED": 0.0001,
            "PIPETTE_SPEED": 0.001,
            "WS_POSITION_X": 50.0,
            "WS_POSITION_Y": 13.0,
            "WS_HEIGHT": 15.0,
            "WS_WIDTH": 60.0,
            "WS_GAP": 14.0,
            "INVERT_X": False,
            "INVERT_Y": False,
            "INVERT_Z": False,
            "INVERT_PIPETTE": False,
            "CONTROLLER_TYPE": "raspberry_pi",
        }
        r = client.post("/api/config", json=config)
        assert r.status_code == 500
