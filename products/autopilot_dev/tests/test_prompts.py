"""Tests for autopilot_dev.prompts."""

from autopilot_dev.prompts import build_reviewer_prompt, build_worker_prompt


class TestBuildWorkerPrompt:
    def test_contains_plan_path(self):
        prompt = build_worker_prompt("my_plan.md")
        assert "my_plan.md" in prompt

    def test_mentions_worklog(self):
        prompt = build_worker_prompt("plan.md")
        assert "worklog.md" in prompt

    def test_mentions_verifiable_deliverables(self):
        prompt = build_worker_prompt("plan.md")
        assert "verifiable deliverable" in prompt.lower()

    def test_mentions_marking_done(self):
        prompt = build_worker_prompt("plan.md")
        assert "[x]" in prompt

    def test_is_non_empty_string(self):
        prompt = build_worker_prompt("plan.md")
        assert isinstance(prompt, str) and len(prompt) > 50

    def test_contains_self_check_instructions(self):
        prompt = build_worker_prompt("plan.md", is_self_check=True)
        assert "self-check round" in prompt.lower()
        assert "Review your own work" in prompt


class TestBuildReviewerPrompt:
    def test_contains_plan_path(self):
        prompt = build_reviewer_prompt("my_plan.md")
        assert "my_plan.md" in prompt

    def test_mentions_worklog(self):
        prompt = build_reviewer_prompt("plan.md")
        assert "worklog.md" in prompt

    def test_mentions_delete_worklog(self):
        prompt = build_reviewer_prompt("plan.md")
        assert "delete" in prompt.lower()

    def test_mentions_unchecking_task(self):
        prompt = build_reviewer_prompt("plan.md")
        assert "[ ]" in prompt

    def test_is_non_empty_string(self):
        prompt = build_reviewer_prompt("plan.md")
        assert isinstance(prompt, str) and len(prompt) > 50


class TestBuildPlannerPrompt:
    def test_contains_goal(self):
        from autopilot_dev.prompts import build_planner_prompt
        prompt = build_planner_prompt("build a website")
        assert "build a goal" not in prompt # just checking
        assert "build a website" in prompt

    def test_mentions_task_format(self):
        from autopilot_dev.prompts import build_planner_prompt
        prompt = build_planner_prompt("goal")
        assert "- [ ]" in prompt
