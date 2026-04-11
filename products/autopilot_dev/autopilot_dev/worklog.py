"""Worklog file management – create, read, and delete ./worklog.md."""

from __future__ import annotations

from pathlib import Path


WORKLOG_FILENAME = "worklog.md"


class WorklogManager:
    """Manage the worklog file used to communicate between worker and reviewer.

    Args:
        directory: The directory where ``worklog.md`` lives (defaults to the
            current working directory).
    """

    def __init__(self, directory: str | Path = ".") -> None:
        self.path = Path(directory) / WORKLOG_FILENAME

    def exists(self) -> bool:
        """Return *True* if a worklog file is present."""
        return self.path.exists()

    def read(self) -> str:
        """Return the contents of the worklog file.

        Raises:
            FileNotFoundError: If the worklog does not exist.
        """
        return self.path.read_text(encoding="utf-8")

    def write(self, content: str) -> None:
        """Write *content* to the worklog file, creating it if necessary."""
        self.path.write_text(content, encoding="utf-8")

    def delete(self) -> None:
        """Delete the worklog file if it exists."""
        if self.path.exists():
            self.path.unlink()

    def append(self, content: str) -> None:
        """Append *content* to the worklog file.

        If the file does not exist it is created.
        """
        existing = self.read() if self.exists() else ""
        separator = "\n" if existing and not existing.endswith("\n") else ""
        self.write(existing + separator + content)
