"""Tests for autopilot_dev.loop."""

import textwrap
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from autopilot_dev.agents import AgentSpec
from autopilot_dev.loop import AgentLoop, LoopConfig, LoopResult


@pytest.fixture()
def all_open_plan(tmp_path: Path) -> Path:
    p = tmp_path / "plan.md"
    p.write_text("- [ ] Task A\n- [ ] Task B\n", encoding="utf-8")
    return p


@pytest.fixture()
def all_done_plan(tmp_path: Path) -> Path:
    p = tmp_path / "plan.md"
    p.write_text("- [x] Task A\n- [x] Task B\n", encoding="utf-8")
    return p


def _make_config(plan_path, max_loops=5, workdir="."):
    return LoopConfig(
        plan_path=str(plan_path),
        max_loops=max_loops,
        worker_spec=AgentSpec(cli="copilot", model="gpt-5-mini"),
        reviewer_spec=AgentSpec(cli="gemini", model=None),
        workdir=workdir,
    )


class TestAgentLoopAllDoneUpfront:
    def test_stops_early_when_plan_already_done(self, all_done_plan):
        config = _make_config(all_done_plan)
        loop = AgentLoop(config)

        mock_result = MagicMock()
        mock_result.returncode = 0
        with patch("autopilot_dev.loop.AgentRunner.run", return_value=mock_result):
            result = loop.run()

        assert result.all_tasks_done is True
        assert result.stopped_early is True
        assert result.iterations_run == 0


class TestAgentLoopMaxLoops:
    def test_runs_exactly_max_loops(self, all_open_plan, tmp_path):
        config = _make_config(all_open_plan, max_loops=3, workdir=str(tmp_path))
        loop = AgentLoop(config)

        mock_result = MagicMock()
        mock_result.returncode = 0
        with patch("autopilot_dev.loop.AgentRunner.run", return_value=mock_result) as mock_run:
            result = loop.run()

        # worker + reviewer called per iteration → 3 × 2 = 6 calls
        assert mock_run.call_count == 6
        assert result.iterations_run == 3
        assert result.stopped_early is False

    def test_stops_early_once_all_done(self, tmp_path):
        plan = tmp_path / "plan.md"
        plan.write_text("- [ ] Only task\n", encoding="utf-8")
        config = _make_config(plan, max_loops=10, workdir=str(tmp_path))
        loop = AgentLoop(config)

        call_count = 0

        def fake_run(prompt):
            nonlocal call_count
            call_count += 1
            # Simulate worker marking task done on first call (iteration 1, worker call)
            if call_count == 1:
                plan.write_text("- [x] Only task\n", encoding="utf-8")
            result = MagicMock()
            result.returncode = 0
            return result

        with patch("autopilot_dev.loop.AgentRunner.run", side_effect=fake_run):
            result = loop.run()

        # After iteration 1: worker (call 1) + reviewer (call 2) → plan is done →
        # iteration 2 starts, sees all_tasks_done → stops
        assert result.all_tasks_done is True
        assert result.stopped_early is True
        assert result.iterations_run == 1


class TestAgentLoopPrompts:
    def test_worker_receives_plan_path(self, all_open_plan, tmp_path):
        config = _make_config(all_open_plan, max_loops=1, workdir=str(tmp_path))
        loop = AgentLoop(config)

        captured_prompts = []

        def fake_run(prompt):
            captured_prompts.append(prompt)
            result = MagicMock()
            result.returncode = 0
            return result

        with patch("autopilot_dev.loop.AgentRunner.run", side_effect=fake_run):
            loop.run()

        # First call is the worker prompt
        assert str(all_open_plan) in captured_prompts[0]

    def test_reviewer_receives_plan_path(self, all_open_plan, tmp_path):
        config = _make_config(all_open_plan, max_loops=1, workdir=str(tmp_path))
        loop = AgentLoop(config)

        captured_prompts = []

        def fake_run(prompt):
            captured_prompts.append(prompt)
            result = MagicMock()
            result.returncode = 0
            return result

        with patch("autopilot_dev.loop.AgentRunner.run", side_effect=fake_run):
            loop.run()

        # Second call is the reviewer prompt
        assert str(all_open_plan) in captured_prompts[1]
