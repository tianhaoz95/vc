"""Tests for autopilot_dev.cli (argument parsing and main entry point)."""

import textwrap
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from autopilot_dev.cli import main, _build_parser
from autopilot_dev.loop import LoopResult


@pytest.fixture()
def plan_file(tmp_path: Path) -> Path:
    p = tmp_path / "plan.md"
    p.write_text("- [x] Done task\n", encoding="utf-8")
    return p


class TestParser:
    def test_required_args_parsed(self, plan_file):
        parser = _build_parser()
        args = parser.parse_args([
            "--plan", str(plan_file),
            "--max-loop", "10",
            "--worker", "copilot:gpt-5-mini",
            "--reviewer", "gemini",
        ])
        assert args.plan == str(plan_file)
        assert args.max_loop == 10
        assert args.worker == "copilot:gpt-5-mini"
        assert args.reviewer == "gemini"

    def test_workdir_defaults_to_dot(self, plan_file):
        parser = _build_parser()
        args = parser.parse_args([
            "--plan", str(plan_file),
            "--max-loop", "5",
            "--worker", "copilot",
            "--reviewer", "gemini",
        ])
        assert args.workdir == "."

    def test_timeout_default_none(self, plan_file):
        parser = _build_parser()
        args = parser.parse_args([
            "--plan", str(plan_file),
            "--max-loop", "5",
            "--worker", "copilot",
            "--reviewer", "gemini",
        ])
        assert args.timeout is None

    def test_verbose_flag(self, plan_file):
        parser = _build_parser()
        args = parser.parse_args([
            "--plan", str(plan_file),
            "--max-loop", "5",
            "--worker", "copilot",
            "--reviewer", "gemini",
            "--verbose",
        ])
        assert args.verbose is True

    def test_missing_plan_exits(self):
        parser = _build_parser()
        with pytest.raises(SystemExit):
            parser.parse_args(["--max-loop", "5", "--worker", "copilot", "--reviewer", "gemini"])

    def test_missing_worker_exits(self, plan_file):
        parser = _build_parser()
        with pytest.raises(SystemExit):
            parser.parse_args(["--plan", str(plan_file), "--max-loop", "5", "--reviewer", "gemini"])


class TestMain:
    def _default_argv(self, plan_file):
        return [
            "--plan", str(plan_file),
            "--max-loop", "5",
            "--worker", "copilot:gpt-5-mini",
            "--reviewer", "gemini",
        ]

    def test_returns_zero_when_all_tasks_done(self, plan_file):
        fake_result = LoopResult(iterations_run=0, all_tasks_done=True, stopped_early=True)
        with patch("autopilot_dev.cli.AgentLoop") as MockLoop:
            MockLoop.return_value.run.return_value = fake_result
            rc = main(self._default_argv(plan_file))
        assert rc == 0

    def test_returns_nonzero_when_tasks_incomplete(self, plan_file):
        fake_result = LoopResult(iterations_run=5, all_tasks_done=False, stopped_early=False)
        with patch("autopilot_dev.cli.AgentLoop") as MockLoop:
            MockLoop.return_value.run.return_value = fake_result
            rc = main(self._default_argv(plan_file))
        assert rc == 1

    def test_passes_correct_worker_spec(self, plan_file):
        fake_result = LoopResult(iterations_run=0, all_tasks_done=True, stopped_early=True)
        with patch("autopilot_dev.cli.AgentLoop") as MockLoop:
            MockLoop.return_value.run.return_value = fake_result
            main(self._default_argv(plan_file))
        config = MockLoop.call_args[0][0]
        assert config.worker_spec.cli == "copilot"
        assert config.worker_spec.model == "gpt-5-mini"

    def test_passes_correct_reviewer_spec(self, plan_file):
        fake_result = LoopResult(iterations_run=0, all_tasks_done=True, stopped_early=True)
        with patch("autopilot_dev.cli.AgentLoop") as MockLoop:
            MockLoop.return_value.run.return_value = fake_result
            main(self._default_argv(plan_file))
        config = MockLoop.call_args[0][0]
        assert config.reviewer_spec.cli == "gemini"
        assert config.reviewer_spec.model is None

    def test_passes_max_loops(self, plan_file):
        fake_result = LoopResult(iterations_run=0, all_tasks_done=True, stopped_early=True)
        with patch("autopilot_dev.cli.AgentLoop") as MockLoop:
            MockLoop.return_value.run.return_value = fake_result
            main(self._default_argv(plan_file))
        config = MockLoop.call_args[0][0]
        assert config.max_loops == 5

    def test_invalid_worker_spec_exits(self, plan_file):
        argv = [
            "--plan", str(plan_file),
            "--max-loop", "5",
            "--worker", ":invalid",
            "--reviewer", "gemini",
        ]
        with pytest.raises(SystemExit):
            main(argv)

    def test_zero_max_loop_exits(self, plan_file):
        argv = [
            "--plan", str(plan_file),
            "--max-loop", "0",
            "--worker", "copilot",
            "--reviewer", "gemini",
        ]
        with pytest.raises(SystemExit):
            main(argv)
