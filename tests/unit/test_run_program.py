"""Tests for run_program.py — schedule-based pipetting program executor."""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import URLError

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_program(tmp_path, *, steps=None, schedule=None, execution=None):
    """Create a scheduled_program.json in tmp_path and return its Path."""
    data = {}
    if steps is not None:
        data["steps"] = steps
    if schedule is not None:
        data["schedule"] = schedule
    if execution is not None:
        data["execution"] = execution
    p = tmp_path / "scheduled_program.json"
    p.write_text(json.dumps(data, indent=2))
    return p


def _load_program(path):
    return json.loads(path.read_text())


# ---------------------------------------------------------------------------
# should_run_now
# ---------------------------------------------------------------------------

class TestShouldRunNow:
    """Tests for the should_run_now() function."""

    def test_schedule_disabled(self, monkeypatch):
        """When schedule.enabled is False, should return False."""
        import run_program
        data = {"schedule": {"enabled": False, "cronExpression": "* * * * *"}}
        assert run_program.should_run_now(data) is False

    def test_no_cron_expression(self, monkeypatch):
        """When cronExpression is empty, should return False."""
        import run_program
        data = {"schedule": {"enabled": True, "cronExpression": ""}}
        assert run_program.should_run_now(data) is False

    def test_no_cron_expression_none(self, monkeypatch):
        """When cronExpression is None, should return False."""
        import run_program
        data = {"schedule": {"enabled": True, "cronExpression": None}}
        assert run_program.should_run_now(data) is False

    def test_no_schedule_key(self, monkeypatch):
        """When schedule key is missing entirely, should return False."""
        import run_program
        data = {}
        assert run_program.should_run_now(data) is False

    def test_matching_cron(self, monkeypatch):
        """When cron matches (prev fire < 60s ago), should return True."""
        import run_program

        now = datetime.now()
        mock_croniter_instance = MagicMock()
        # prev_fire is 10 seconds ago → diff < 60 → True
        mock_croniter_instance.get_prev.return_value = now - timedelta(seconds=10)

        mock_croniter_class = MagicMock(return_value=mock_croniter_instance)
        mock_module = MagicMock()
        mock_module.croniter = mock_croniter_class

        monkeypatch.setitem(sys.modules, "croniter", mock_module)

        data = {"schedule": {"enabled": True, "cronExpression": "* * * * *"}}
        assert run_program.should_run_now(data) is True

    def test_non_matching_cron(self, monkeypatch):
        """When cron doesn't match (prev fire > 60s ago), should return False."""
        import run_program

        now = datetime.now()
        mock_croniter_instance = MagicMock()
        # prev_fire is 120 seconds ago → diff >= 60 → False
        mock_croniter_instance.get_prev.return_value = now - timedelta(seconds=120)

        mock_croniter_class = MagicMock(return_value=mock_croniter_instance)
        mock_module = MagicMock()
        mock_module.croniter = mock_croniter_class

        monkeypatch.setitem(sys.modules, "croniter", mock_module)

        data = {"schedule": {"enabled": True, "cronExpression": "0 3 * * *"}}
        assert run_program.should_run_now(data) is False

    def test_missing_croniter_import(self, monkeypatch):
        """When croniter is not installed, should call sys.exit(1)."""
        import run_program

        # Remove croniter from sys.modules so the import inside the function fails
        monkeypatch.delitem(sys.modules, "croniter", raising=False)

        # Patch the builtins __import__ to raise ImportError for croniter
        original_import = __builtins__.__import__ if hasattr(__builtins__, '__import__') else __import__

        def fake_import(name, *args, **kwargs):
            if name == "croniter":
                raise ImportError("No module named 'croniter'")
            return original_import(name, *args, **kwargs)

        monkeypatch.setattr("builtins.__import__", fake_import)

        data = {"schedule": {"enabled": True, "cronExpression": "* * * * *"}}
        with pytest.raises(SystemExit) as exc_info:
            run_program.should_run_now(data)
        assert exc_info.value.code == 1


# ---------------------------------------------------------------------------
# update_status
# ---------------------------------------------------------------------------

class TestUpdateStatus:
    """Tests for the update_status() function."""

    def test_running_writes_started_at(self, monkeypatch, tmp_path):
        """status='running' should write startedAt to execution."""
        import run_program
        prog = _make_program(tmp_path, steps=[{"id": 1}])
        monkeypatch.setattr(run_program, "PROGRAM_FILE", prog)

        run_program.update_status("running")

        data = _load_program(prog)
        assert data["execution"]["status"] == "running"
        assert "startedAt" in data["execution"]
        assert "lastUpdated" in data["execution"]

    def test_idle_success(self, monkeypatch, tmp_path):
        """status='idle' without error writes lastResult='success'."""
        import run_program
        prog = _make_program(tmp_path, steps=[{"id": 1}])
        monkeypatch.setattr(run_program, "PROGRAM_FILE", prog)

        run_program.update_status("idle")

        data = _load_program(prog)
        assert data["execution"]["status"] == "idle"
        assert data["execution"]["lastResult"] == "success"
        assert "lastRunAt" in data["execution"]
        assert "lastError" not in data["execution"]

    def test_idle_with_error(self, monkeypatch, tmp_path):
        """status='idle' with error writes lastResult='error' and lastError."""
        import run_program
        prog = _make_program(tmp_path, steps=[{"id": 1}])
        monkeypatch.setattr(run_program, "PROGRAM_FILE", prog)

        run_program.update_status("idle", error="something broke")

        data = _load_program(prog)
        assert data["execution"]["status"] == "idle"
        assert data["execution"]["lastResult"] == "error"
        assert data["execution"]["lastError"] == "something broke"

    def test_other_status(self, monkeypatch, tmp_path):
        """A status that is neither 'idle' nor 'running' still writes the file."""
        import run_program
        prog = _make_program(tmp_path, steps=[{"id": 1}])
        monkeypatch.setattr(run_program, "PROGRAM_FILE", prog)

        run_program.update_status("unknown_status")

        data = _load_program(prog)
        assert data["execution"]["status"] == "unknown_status"
        assert "lastUpdated" in data["execution"]
        # Should NOT have idle- or running-specific keys
        assert "lastRunAt" not in data["execution"]
        assert "startedAt" not in data["execution"]

    def test_program_file_missing(self, monkeypatch, tmp_path):
        """When PROGRAM_FILE doesn't exist, should return early without error."""
        import run_program
        missing = tmp_path / "does_not_exist.json"
        monkeypatch.setattr(run_program, "PROGRAM_FILE", missing)

        # Should not raise
        run_program.update_status("running")


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

class TestMain:
    """Tests for the main() function."""

    def test_program_file_missing(self, monkeypatch, tmp_path):
        """When PROGRAM_FILE doesn't exist, should sys.exit(1)."""
        import run_program
        missing = tmp_path / "nonexistent.json"
        monkeypatch.setattr(run_program, "PROGRAM_FILE", missing)

        with pytest.raises(SystemExit) as exc_info:
            run_program.main()
        assert exc_info.value.code == 1

    def test_empty_steps(self, monkeypatch, tmp_path):
        """When steps list is empty, should sys.exit(1)."""
        import run_program
        prog = _make_program(tmp_path, steps=[], schedule={"enabled": True, "cronExpression": "* * * * *"})
        monkeypatch.setattr(run_program, "PROGRAM_FILE", prog)
        monkeypatch.setattr(run_program, "should_run_now", lambda data: True)

        with pytest.raises(SystemExit) as exc_info:
            run_program.main()
        assert exc_info.value.code == 1

    def test_should_run_now_false_returns_early(self, monkeypatch, tmp_path):
        """When should_run_now returns False, main() returns without executing."""
        import run_program
        prog = _make_program(
            tmp_path,
            steps=[{"pickup": "A1", "dropoff": "B1"}],
            schedule={"enabled": False},
        )
        monkeypatch.setattr(run_program, "PROGRAM_FILE", prog)

        # should_run_now returns False → main returns without executing
        monkeypatch.setattr(run_program, "should_run_now", lambda data: False)

        # If execution were attempted, this mock would be called
        with patch("run_program.urlopen") as mock_urlopen:
            run_program.main()
            mock_urlopen.assert_not_called()

    def test_successful_api_call(self, monkeypatch, tmp_path):
        """Successful API call updates status to idle/success."""
        import run_program
        prog = _make_program(
            tmp_path,
            steps=[{"pickup": "A1", "dropoff": "B1"}],
            schedule={"enabled": True, "cronExpression": "* * * * *"},
        )
        monkeypatch.setattr(run_program, "PROGRAM_FILE", prog)
        monkeypatch.setattr(run_program, "should_run_now", lambda data: True)

        # Mock urlopen context manager
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({"message": "Done"}).encode()
        mock_response.__enter__ = MagicMock(return_value=mock_response)
        mock_response.__exit__ = MagicMock(return_value=False)

        with patch("run_program.urlopen", return_value=mock_response):
            run_program.main()

        data = _load_program(prog)
        assert data["execution"]["status"] == "idle"
        assert data["execution"]["lastResult"] == "success"

    def test_url_error(self, monkeypatch, tmp_path):
        """URLError during API call updates status with error."""
        import run_program
        prog = _make_program(
            tmp_path,
            steps=[{"pickup": "A1", "dropoff": "B1"}],
            schedule={"enabled": True, "cronExpression": "* * * * *"},
        )
        monkeypatch.setattr(run_program, "PROGRAM_FILE", prog)
        monkeypatch.setattr(run_program, "should_run_now", lambda data: True)

        with patch("run_program.urlopen", side_effect=URLError("Connection refused")):
            run_program.main()

        data = _load_program(prog)
        assert data["execution"]["status"] == "idle"
        assert data["execution"]["lastResult"] == "error"
        assert "Connection refused" in data["execution"]["lastError"]

    def test_general_exception(self, monkeypatch, tmp_path):
        """General exception during API call updates status with error."""
        import run_program
        prog = _make_program(
            tmp_path,
            steps=[{"pickup": "A1", "dropoff": "B1"}],
            schedule={"enabled": True, "cronExpression": "* * * * *"},
        )
        monkeypatch.setattr(run_program, "PROGRAM_FILE", prog)
        monkeypatch.setattr(run_program, "should_run_now", lambda data: True)

        with patch("run_program.urlopen", side_effect=RuntimeError("unexpected")):
            run_program.main()

        data = _load_program(prog)
        assert data["execution"]["status"] == "idle"
        assert data["execution"]["lastResult"] == "error"
