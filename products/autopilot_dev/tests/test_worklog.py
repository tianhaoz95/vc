"""Tests for autopilot_dev.worklog."""

from pathlib import Path

import pytest

from autopilot_dev.worklog import WorklogManager


@pytest.fixture()
def workdir(tmp_path: Path) -> Path:
    return tmp_path


class TestExists:
    def test_false_when_no_file(self, workdir):
        wm = WorklogManager(workdir)
        assert wm.exists() is False

    def test_true_when_file_present(self, workdir):
        (workdir / "worklog.md").write_text("content", encoding="utf-8")
        wm = WorklogManager(workdir)
        assert wm.exists() is True


class TestRead:
    def test_reads_content(self, workdir):
        (workdir / "worklog.md").write_text("hello world", encoding="utf-8")
        wm = WorklogManager(workdir)
        assert wm.read() == "hello world"

    def test_raises_when_missing(self, workdir):
        wm = WorklogManager(workdir)
        with pytest.raises(FileNotFoundError):
            wm.read()


class TestWrite:
    def test_creates_file(self, workdir):
        wm = WorklogManager(workdir)
        wm.write("new content")
        assert (workdir / "worklog.md").read_text(encoding="utf-8") == "new content"

    def test_overwrites_existing(self, workdir):
        wm = WorklogManager(workdir)
        wm.write("first")
        wm.write("second")
        assert wm.read() == "second"


class TestDelete:
    def test_deletes_existing_file(self, workdir):
        wm = WorklogManager(workdir)
        wm.write("something")
        wm.delete()
        assert not wm.exists()

    def test_no_error_when_missing(self, workdir):
        wm = WorklogManager(workdir)
        wm.delete()  # should not raise


class TestAppend:
    def test_appends_to_existing(self, workdir):
        wm = WorklogManager(workdir)
        wm.write("line one\n")
        wm.append("line two")
        assert wm.read() == "line one\nline two"

    def test_creates_when_missing(self, workdir):
        wm = WorklogManager(workdir)
        wm.append("only line")
        assert wm.read() == "only line"

    def test_adds_separator_when_needed(self, workdir):
        wm = WorklogManager(workdir)
        wm.write("no newline at end")
        wm.append("second part")
        content = wm.read()
        assert "no newline at end\nsecond part" == content
