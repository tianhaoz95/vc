"""Prompt templates for the worker and reviewer agents."""

from __future__ import annotations

from autopilot_dev.agents import AgentSpec

# ---------------------------------------------------------------------------
# Worker prompt
# ---------------------------------------------------------------------------

_WORKER_PROMPT_TEMPLATE = """\
You are an autonomous coding agent. Your job is to complete the next open task \
from the project plan.

## Your instructions

1. Read the plan file at `{plan_path}` and identify the **first unchecked task** \
(i.e., `- [ ] ...`).
2. Check whether `./worklog.md` exists.
   - If **`./worklog.md` exists**: The previous attempt was reviewed and found to \
be incomplete. Read `./worklog.md` carefully to understand the reviewer's findings \
and what still needs to be fixed. Address **all** issues noted by the reviewer.
   - If **`./worklog.md` does not exist**: Create `./worklog.md` now. It must \
contain:
     - The task you are working on.
     - A step-by-step description of what you plan to do.
     - A list of **verifiable deliverables** (concrete, testable outcomes that a \
reviewer can check, e.g. "Running `pytest` exits with code 0", "File `foo.py` \
exists and contains function `bar`").
3. Implement the task. Write code, run builds, run tests – do whatever is \
required to complete the task fully.
4. Make sure **all verifiable deliverables** listed in `./worklog.md` are \
satisfied before finishing.
5. Once the task is complete and all deliverables pass, mark the task as done \
in `{plan_path}` by changing `- [ ]` to `- [x]` for that task line.

## Important notes
- Another coding agent will review your work and verify every deliverable in \
`./worklog.md`. Do not mark the task done unless you are confident everything \
works.
- Do **not** delete `./worklog.md`; that is the reviewer's job.
- Only work on **one** task per invocation.
"""


def build_worker_prompt(plan_path: str) -> str:
    """Return the prompt to send to the worker agent.

    Args:
        plan_path: Path to the plan markdown file.

    Returns:
        A fully formatted prompt string.
    """
    return _WORKER_PROMPT_TEMPLATE.format(plan_path=plan_path)


# ---------------------------------------------------------------------------
# Reviewer prompt
# ---------------------------------------------------------------------------

_REVIEWER_PROMPT_TEMPLATE = """\
You are an autonomous code-review agent. Your job is to verify the work done \
by a coding agent.

## Your instructions

1. Read `./worklog.md` to understand:
   - What task was being worked on.
   - What the **verifiable deliverables** are.
2. Verify **every** deliverable listed in `./worklog.md` by inspecting the code, \
running commands, checking outputs, etc.
3. If **all deliverables are satisfied**:
   - Delete `./worklog.md` (the task is finished).
   - Do NOT modify `{plan_path}`; the worker already marked the task done.
4. If **any deliverable is NOT satisfied** (or if there are other problems):
   - Overwrite `./worklog.md` with a revised version that:
     - Keeps the original task description.
     - Adds a **Reviewer Findings** section that clearly describes every issue \
found, with enough detail for the worker agent to understand and fix them.
   - In `{plan_path}`, change the task's `- [x]` back to `- [ ]` so the worker \
picks it up again in the next iteration.

## Important notes
- Be thorough. The worker will only see what you write in `./worklog.md`.
- Do not modify any source files; only `./worklog.md` and `{plan_path}`.
"""


def build_reviewer_prompt(plan_path: str) -> str:
    """Return the prompt to send to the reviewer agent.

    Args:
        plan_path: Path to the plan markdown file.

    Returns:
        A fully formatted prompt string.
    """
    return _REVIEWER_PROMPT_TEMPLATE.format(plan_path=plan_path)
