"""Tests for autopilot_dev.plan."""

import textwrap
from pathlib import Path

import pytest

from autopilot_dev.plan import PlanManager, Task


@pytest.fixture()
def plan_file(tmp_path: Path) -> Path:
    content = textwrap.dedent("""\
        # My Plan

        - [ ] Task one
        - [ ] Task two
        - [x] Task three (already done)
        - [ ] Task four
    """)
    p = tmp_path / "plan.md"
    p.write_text(content, encoding="utf-8")
    return p


class TestGetTasks:
    def test_returns_all_tasks(self, plan_file):
        pm = PlanManager(plan_file)
        tasks = pm.get_tasks()
        assert len(tasks) == 4

    def test_done_flag_correct(self, plan_file):
        pm = PlanManager(plan_file)
        tasks = pm.get_tasks()
        assert tasks[0].done is False
        assert tasks[1].done is False
        assert tasks[2].done is True
        assert tasks[3].done is False

    def test_text_extracted(self, plan_file):
        pm = PlanManager(plan_file)
        tasks = pm.get_tasks()
        assert tasks[0].text == "Task one"
        assert tasks[2].text == "Task three (already done)"

    def test_uppercase_x_treated_as_done(self, tmp_path):
        p = tmp_path / "plan.md"
        p.write_text("- [X] Done task\n", encoding="utf-8")
        pm = PlanManager(p)
        tasks = pm.get_tasks()
        assert len(tasks) == 1
        assert tasks[0].done is True

    def test_non_task_lines_ignored(self, tmp_path):
        p = tmp_path / "plan.md"
        p.write_text("# Header\nSome text\n- [ ] Real task\n", encoding="utf-8")
        pm = PlanManager(p)
        tasks = pm.get_tasks()
        assert len(tasks) == 1


class TestGetNextOpenTask:
    def test_returns_first_open(self, plan_file):
        pm = PlanManager(plan_file)
        task = pm.get_next_open_task()
        assert task is not None
        assert task.text == "Task one"

    def test_returns_none_when_all_done(self, tmp_path):
        p = tmp_path / "plan.md"
        p.write_text("- [x] Done\n", encoding="utf-8")
        pm = PlanManager(p)
        assert pm.get_next_open_task() is None

    def test_skips_done_tasks(self, tmp_path):
        p = tmp_path / "plan.md"
        p.write_text("- [x] Done\n- [ ] Open\n", encoding="utf-8")
        pm = PlanManager(p)
        task = pm.get_next_open_task()
        assert task is not None
        assert task.text == "Open"


class TestMarkTaskDone:
    def test_marks_open_task_done(self, plan_file):
        pm = PlanManager(plan_file)
        task = pm.get_next_open_task()
        assert task is not None
        pm.mark_task_done(task)

        content = plan_file.read_text(encoding="utf-8")
        assert "- [x] Task one" in content

    def test_already_done_task_stays_done(self, plan_file):
        pm = PlanManager(plan_file)
        tasks = pm.get_tasks()
        done_task = tasks[2]  # "Task three (already done)"
        pm.mark_task_done(done_task)
        content = plan_file.read_text(encoding="utf-8")
        assert "- [x] Task three (already done)" in content


class TestMarkTaskOpen:
    def test_unchecks_done_task(self, plan_file):
        pm = PlanManager(plan_file)
        tasks = pm.get_tasks()
        done_task = tasks[2]
        pm.mark_task_open(done_task)
        content = plan_file.read_text(encoding="utf-8")
        assert "- [ ] Task three (already done)" in content


class TestAllTasksDone:
    def test_false_when_open_tasks_remain(self, plan_file):
        pm = PlanManager(plan_file)
        assert pm.all_tasks_done() is False

    def test_true_when_all_done(self, tmp_path):
        p = tmp_path / "plan.md"
        p.write_text("- [x] A\n- [x] B\n", encoding="utf-8")
        pm = PlanManager(p)
        assert pm.all_tasks_done() is True

    def test_false_for_empty_plan(self, tmp_path):
        p = tmp_path / "plan.md"
        p.write_text("# No tasks here\n", encoding="utf-8")
        pm = PlanManager(p)
        assert pm.all_tasks_done() is False
