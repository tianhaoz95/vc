"""Plan file management – read tasks, mark tasks done or undone."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


# Matches a GitHub-flavoured markdown task list item.
# Group 1: leading whitespace + ``- [``
# Group 2: the check character (``x`` / ``X`` = done, space = open)
# Group 3: ``] `` + the rest of the line (task text)
_TASK_RE = re.compile(r"^(\s*-\s*\[)([ xX])(\]\s*.+)$")


@dataclass
class Task:
    """A single task extracted from a markdown plan file."""

    text: str
    done: bool
    line_index: int


class PlanManager:
    """Read and modify a markdown task-list plan file.

    Args:
        path: Path to the plan markdown file.
    """

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _read_lines(self) -> list[str]:
        return self.path.read_text(encoding="utf-8").splitlines(keepends=True)

    def _write_lines(self, lines: list[str]) -> None:
        self.path.write_text("".join(lines), encoding="utf-8")

    @staticmethod
    def _parse_task(line: str, index: int) -> Optional[Task]:
        m = _TASK_RE.match(line.rstrip("\n"))
        if not m:
            return None
        check_char = m.group(2)
        done = check_char.lower() == "x"
        text = m.group(3).lstrip("] ").strip()
        return Task(text=text, done=done, line_index=index)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_tasks(self) -> list[Task]:
        """Return all tasks (both open and done) from the plan file."""
        lines = self._read_lines()
        tasks: list[Task] = []
        for i, line in enumerate(lines):
            task = self._parse_task(line, i)
            if task is not None:
                tasks.append(task)
        return tasks

    def get_next_open_task(self) -> Optional[Task]:
        """Return the first open (unchecked) task, or *None* if all are done."""
        for task in self.get_tasks():
            if not task.done:
                return task
        return None

    def mark_task_done(self, task: Task) -> None:
        """Mark *task* as completed (``[x]``) in the plan file."""
        lines = self._read_lines()
        line = lines[task.line_index]
        m = _TASK_RE.match(line.rstrip("\n"))
        if m:
            lines[task.line_index] = m.group(1) + "x" + m.group(3) + "\n"
            self._write_lines(lines)

    def mark_task_open(self, task: Task) -> None:
        """Un-check *task* (back to ``[ ]``) in the plan file."""
        lines = self._read_lines()
        line = lines[task.line_index]
        m = _TASK_RE.match(line.rstrip("\n"))
        if m:
            lines[task.line_index] = m.group(1) + " " + m.group(3) + "\n"
            self._write_lines(lines)

    def update_task_text(self, task: Task, new_text: str) -> None:
        """Replace the text of *task* in the plan file."""
        lines = self._read_lines()
        line = lines[task.line_index]
        m = _TASK_RE.match(line.rstrip("\n"))
        if m:
            # m.group(3) starts with ']' and some whitespace.
            # We want to keep the ']' and the checkmark char, but replace the rest.
            # Actually, mark_task_done and mark_task_open keep m.group(3) as is.
            # m.group(3) is "]" + whitespace + text.
            # Let's find where the text starts in m.group(3).
            text_match = re.match(r"^(\]\s*)(.+)$", m.group(3))
            if text_match:
                lines[task.line_index] = (
                    m.group(1) + m.group(2) + text_match.group(1) + new_text + "\n"
                )
                self._write_lines(lines)

    def all_tasks_done(self) -> bool:
        """Return *True* when every task in the plan is checked."""
        tasks = self.get_tasks()
        return bool(tasks) and all(t.done for t in tasks)
