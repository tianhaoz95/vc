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


class TestAgentLoopSelfCheck:
    def test_runs_self_check_rounds(self, all_open_plan, tmp_path):
        # 1 iteration, 2 self-check rounds.
        # Expect: 1 (worker) + 2 (self-checks) + 1 (reviewer) = 4 calls
        config = _make_config(all_open_plan, max_loops=1, workdir=str(tmp_path))
        config.self_check_round = 2
        loop = AgentLoop(config)

        mock_result = MagicMock()
        mock_result.returncode = 0
        with patch("autopilot_dev.loop.AgentRunner.run", return_value=mock_result) as mock_run:
            loop.run()

        assert mock_run.call_count == 4
        # Verify that mark_task_open was called twice (for the 2 self-check rounds)
        # We can't easily check PlanManager calls if it's not mocked, 
        # but we can verify the total call count.
    def test_worker_receives_self_check_prompt(self, all_open_plan, tmp_path):
        config = _make_config(all_open_plan, max_loops=1, workdir=str(tmp_path))
        config.self_check_round = 1
        loop = AgentLoop(config)

        captured_prompts = []

        def fake_run(prompt):
            captured_prompts.append(prompt)
            result = MagicMock()
            result.returncode = 0
            return result

        with patch("autopilot_dev.loop.AgentRunner.run", side_effect=fake_run):
            loop.run()

        # Call 1: Worker
        # Call 2: Self-check Worker
        # Call 3: Reviewer
        assert "self-check round" not in captured_prompts[0].lower()
        assert "self-check round" in captured_prompts[1].lower()
        assert "Review your own work" in captured_prompts[1]
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


class TestAgentLoopFinalReview:
    def test_final_review_pass(self, all_done_plan, tmp_path):
        config = _make_config(all_done_plan, max_loops=1, workdir=str(tmp_path))
        config.final_reviewer_spec = AgentSpec(cli="gemini-final")
        loop = AgentLoop(config)

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "<final_review>PASS</final_review>"
        mock_result.stderr = ""

        with patch("autopilot_dev.loop.AgentRunner.run", return_value=mock_result) as mock_run:
            result = loop.run()

        # all_done_plan means 0 iterations of worker-reviewer in first pass of run().
        # Plus 1 call for final reviewer.
        assert mock_run.call_count == 1
        assert result.all_tasks_done is True

    def test_final_review_fail_then_pass(self, all_done_plan, tmp_path):
        config = _make_config(all_done_plan, max_loops=1, workdir=str(tmp_path))
        config.final_reviewer_spec = AgentSpec(cli="gemini-final")
        loop = AgentLoop(config)

        call_count = 0

        def fake_run(prompt):
            nonlocal call_count
            call_count += 1
            res = MagicMock()
            res.returncode = 0
            if call_count == 1:  # First final review
                res.stdout = (
                    "FAIL_TASK: Task A | FINDINGS: Missing something\n"
                    "<final_review>FAIL</final_review>"
                )
            elif call_count == 2:  # Worker (after restart)
                # simulate fixing task A
                all_done_plan.write_text(
                    "- [x] Task A | FAILURE: Missing something\n- [x] Task B\n",
                    encoding="utf-8",
                )
                res.stdout = "Fixed it"
            elif call_count == 3:  # Reviewer
                res.stdout = "Review pass"
            else:  # Second final review
                res.stdout = "<final_review>PASS</final_review>"
            res.stderr = ""
            return res

        with patch("autopilot_dev.loop.AgentRunner.run", side_effect=fake_run) as mock_run:
            result = loop.run()

        # 1. Final Review (Fail) -> task A unchecked
        # 2. Worker (fix Task A)
        # 3. Reviewer
        # 4. Final Review (Pass)
        assert call_count == 4
        assert result.all_tasks_done is True
        # Check plan file was updated
        content = all_done_plan.read_text()
        assert "FAILURE: Missing something" in content
