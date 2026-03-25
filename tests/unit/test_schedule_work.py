"""Tests for schedule_work.py — periodic scheduler for run_program.py."""

import sys
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# call_run_program
# ---------------------------------------------------------------------------

class TestCallRunProgram:
    """Tests for the call_run_program() function."""

    def test_subprocess_args_and_cwd(self, monkeypatch):
        """Verify subprocess.run is called with correct args and cwd."""
        import schedule_work

        mock_result = MagicMock()
        mock_result.returncode = 0

        with patch("schedule_work.subprocess.run", return_value=mock_result) as mock_run:
            schedule_work.call_run_program()

            mock_run.assert_called_once_with(
                [sys.executable, str(schedule_work.RUN_SCRIPT)],
                cwd=str(schedule_work.PROJECT_DIR),
            )

    def test_returncode_zero(self, monkeypatch, capsys):
        """returncode 0 should print OK message."""
        import schedule_work

        mock_result = MagicMock()
        mock_result.returncode = 0

        with patch("schedule_work.subprocess.run", return_value=mock_result):
            schedule_work.call_run_program()

        captured = capsys.readouterr()
        assert "exited OK" in captured.out

    def test_returncode_nonzero(self, monkeypatch, capsys):
        """Non-zero returncode should print error code."""
        import schedule_work

        mock_result = MagicMock()
        mock_result.returncode = 42

        with patch("schedule_work.subprocess.run", return_value=mock_result):
            schedule_work.call_run_program()

        captured = capsys.readouterr()
        assert "exited with code 42" in captured.out


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

class TestMain:
    """Tests for the main() function."""

    def test_run_script_missing(self, monkeypatch):
        """When RUN_SCRIPT doesn't exist, should sys.exit(1)."""
        import schedule_work

        missing = Path("/tmp/nonexistent_run_program.py")
        monkeypatch.setattr(schedule_work, "RUN_SCRIPT", missing)
        monkeypatch.setattr(sys, "argv", ["schedule_work.py"])

        with pytest.raises(SystemExit) as exc_info:
            schedule_work.main()
        assert exc_info.value.code == 1

    def test_interval_argument(self, monkeypatch, tmp_path):
        """Verify --interval argument is parsed and used."""
        import schedule_work

        # Create a fake script file so the exists() check passes
        fake_script = tmp_path / "run_program.py"
        fake_script.write_text("# fake")
        monkeypatch.setattr(schedule_work, "RUN_SCRIPT", fake_script)

        monkeypatch.setattr(sys, "argv", ["schedule_work.py", "--interval", "30"])

        call_count = 0

        def fake_call():
            nonlocal call_count
            call_count += 1
            raise KeyboardInterrupt

        monkeypatch.setattr(schedule_work, "call_run_program", fake_call)
        monkeypatch.setattr(time, "sleep", lambda s: None)

        schedule_work.main()  # should exit cleanly via KeyboardInterrupt handler
        assert call_count == 1

    def test_default_interval(self, monkeypatch, tmp_path):
        """Default interval should be 60 seconds."""
        import schedule_work

        fake_script = tmp_path / "run_program.py"
        fake_script.write_text("# fake")
        monkeypatch.setattr(schedule_work, "RUN_SCRIPT", fake_script)
        monkeypatch.setattr(sys, "argv", ["schedule_work.py"])

        sleep_values = []

        def track_sleep(seconds):
            sleep_values.append(seconds)
            # After recording the sleep value, raise KeyboardInterrupt to stop the loop
            raise KeyboardInterrupt

        monkeypatch.setattr(schedule_work, "call_run_program", lambda: None)
        monkeypatch.setattr(time, "sleep", track_sleep)

        schedule_work.main()
        assert sleep_values == [60]

    def test_keyboard_interrupt_handling(self, monkeypatch, tmp_path, capsys):
        """KeyboardInterrupt should exit cleanly with a message."""
        import schedule_work

        fake_script = tmp_path / "run_program.py"
        fake_script.write_text("# fake")
        monkeypatch.setattr(schedule_work, "RUN_SCRIPT", fake_script)
        monkeypatch.setattr(sys, "argv", ["schedule_work.py"])

        def interrupt_on_call():
            raise KeyboardInterrupt

        monkeypatch.setattr(schedule_work, "call_run_program", interrupt_on_call)
        monkeypatch.setattr(time, "sleep", lambda s: None)

        schedule_work.main()

        captured = capsys.readouterr()
        assert "Scheduler stopped at" in captured.out

    def test_loop_runs_multiple_times(self, monkeypatch, tmp_path):
        """The loop should call call_run_program repeatedly until interrupted."""
        import schedule_work

        fake_script = tmp_path / "run_program.py"
        fake_script.write_text("# fake")
        monkeypatch.setattr(schedule_work, "RUN_SCRIPT", fake_script)
        monkeypatch.setattr(sys, "argv", ["schedule_work.py", "--interval", "5"])

        call_count = 0

        def counting_call():
            nonlocal call_count
            call_count += 1

        def sleep_then_interrupt(seconds):
            if call_count >= 3:
                raise KeyboardInterrupt

        monkeypatch.setattr(schedule_work, "call_run_program", counting_call)
        monkeypatch.setattr(time, "sleep", sleep_then_interrupt)

        schedule_work.main()
        assert call_count == 3
