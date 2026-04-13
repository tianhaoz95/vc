"""Agent loop orchestration."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from autopilot_dev.agents import AgentRunner, AgentSpec
from autopilot_dev.plan import PlanManager
from autopilot_dev.prompts import (
    build_final_reviewer_prompt,
    build_reviewer_prompt,
    build_worker_prompt,
)
from autopilot_dev.worklog import WorklogManager

logger = logging.getLogger(__name__)


@dataclass
class LoopConfig:
    """Configuration for an :class:`AgentLoop` run.

    Attributes:
        plan_path: Path to the markdown plan file.
        max_loops: Maximum number of worker→reviewer iterations.
        worker_spec: Parsed :class:`AgentSpec` for the worker agent.
        reviewer_spec: Parsed :class:`AgentSpec` for the reviewer agent.
        workdir: Working directory used to locate ``worklog.md``.
        agent_timeout: Optional timeout (seconds) for each agent invocation.
        self_check_round: Number of self-check rounds for the worker agent.
        final_reviewer_spec: Optional :class:`AgentSpec` for the final reviewer.
    """

    plan_path: str
    max_loops: int
    worker_spec: AgentSpec
    reviewer_spec: AgentSpec
    workdir: str = "."
    agent_timeout: Optional[int] = None
    self_check_round: int = 0
    final_reviewer_spec: Optional[AgentSpec] = None


@dataclass
class LoopResult:
    """Result of a completed :class:`AgentLoop` run.

    Attributes:
        iterations_run: How many worker→reviewer cycles were executed.
        all_tasks_done: Whether every task in the plan was completed.
        stopped_early: Whether the loop exited before reaching *max_loops*.
    """

    iterations_run: int
    all_tasks_done: bool
    stopped_early: bool


class AgentLoop:
    """Orchestrate the worker ↔ reviewer coding-agent loop.

    Each iteration:
    1. Runs the *worker* agent with instructions to pick up the next open task,
       check/create ``worklog.md``, implement the task, and mark it done.
    2. Runs the *reviewer* agent to verify the work.  If the work passes, the
       reviewer deletes ``worklog.md``.  Otherwise it writes findings back into
       ``worklog.md`` and un-checks the task so the worker retries next round.

    The loop ends when:
    - All tasks in the plan are checked, OR
    - *max_loops* iterations have been reached.

    Args:
        config: :class:`LoopConfig` with all run parameters.
    """

    def __init__(self, config: LoopConfig) -> None:
        self.config = config
        self._plan = PlanManager(config.plan_path)
        self._worklog = WorklogManager(config.workdir)
        self._worker = AgentRunner(
            spec=config.worker_spec,
            timeout=config.agent_timeout,
        )
        self._reviewer = AgentRunner(
            spec=config.reviewer_spec,
            timeout=config.agent_timeout,
        )
        self._final_reviewer = None
        if config.final_reviewer_spec:
            self._final_reviewer = AgentRunner(
                spec=config.final_reviewer_spec,
                timeout=config.agent_timeout,
            )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self) -> LoopResult:
        """Execute the agent loop and return a :class:`LoopResult`."""
        iterations_run = 0
        stopped_early = False

        while True:
            for i in range(self.config.max_loops):
                task = self._plan.get_next_open_task()
                if task is None:
                    logger.info("All tasks complete (checking for final review).")
                    stopped_early = True
                    break

                logger.info("--- Iteration %d / %d ---", i + 1, self.config.max_loops)
                self._run_worker()

                # Optional self-check rounds
                for j in range(self.config.self_check_round):
                    logger.info(
                        "--- Self-check round %d / %d for task: %s ---",
                        j + 1,
                        self.config.self_check_round,
                        task.text,
                    )
                    # Un-check the task so the worker picks it up again.
                    self._plan.mark_task_open(task)
                    self._run_worker(is_self_check=True)

                self._run_reviewer()
                iterations_run += 1

            # End of loops OR all tasks done
            if self._final_reviewer:
                pass_review, fail_task_text, findings = self._run_final_reviewer()
                if pass_review:
                    print("<final_review>PASS</final_review>")
                    break
                else:
                    print("<final_review>FAIL</final_review>")
                    self._handle_final_review_failure(fail_task_text, findings)
                    # Restart the loop
                    stopped_early = False
                    continue
            else:
                break

        all_done = self._plan.all_tasks_done()
        logger.info(
            "Loop finished after %d iteration(s). All tasks done: %s",
            iterations_run,
            all_done,
        )
        return LoopResult(
            iterations_run=iterations_run,
            all_tasks_done=all_done,
            stopped_early=stopped_early,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _run_final_reviewer(self) -> tuple[bool, Optional[str], Optional[str]]:
        prompt = build_final_reviewer_prompt(self.config.plan_path)
        logger.info("Running final reviewer agent: %s", self.config.final_reviewer_spec)
        result = self._final_reviewer.run(prompt)
        output = (result.stdout or "") + (result.stderr or "")

        if "<final_review>PASS</final_review>" in output:
            return True, None, None

        import re

        fail_task = None
        findings = None
        m = re.search(r"FAIL_TASK:\s*(.*?)\s*\|\s*FINDINGS:\s*(.*)", output)
        if m:
            fail_task = m.group(1).strip()
            findings = m.group(2).strip()

        return False, fail_task, findings

    def _handle_final_review_failure(
        self, fail_task_text: Optional[str], findings: Optional[str]
    ) -> None:
        if not fail_task_text:
            # If we don't know which task failed, un-check the last one?
            tasks = self._plan.get_tasks()
            if tasks:
                self._plan.mark_task_open(tasks[-1])
            return

        tasks = self._plan.get_tasks()
        for t in tasks:
            if fail_task_text.strip() == t.text.strip() or fail_task_text.strip() in t.text:
                new_text = f"{t.text} | FAILURE: {findings}"
                self._plan.update_task_text(t, new_text)
                self._plan.mark_task_open(t)
                return

    def _run_worker(self, is_self_check: bool = False) -> None:
        prompt = build_worker_prompt(self.config.plan_path, is_self_check=is_self_check)
        logger.info(
            "Running worker agent (self-check=%s): %s",
            is_self_check,
            self.config.worker_spec,
        )
        result = self._worker.run(prompt)
        logger.info("Worker agent exited with code %s", result.returncode)

    def _run_reviewer(self) -> None:
        prompt = build_reviewer_prompt(self.config.plan_path)
        logger.info("Running reviewer agent: %s", self.config.reviewer_spec)
        result = self._reviewer.run(prompt)
        logger.info("Reviewer agent exited with code %s", result.returncode)
