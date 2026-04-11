"""Tests for autopilot_dev.agents."""

import pytest
from unittest.mock import patch, MagicMock

from autopilot_dev.agents import (
    AgentSpec,
    AgentRunner,
    build_agent_command,
    parse_agent_spec,
)


class TestParseAgentSpec:
    def test_cli_only(self):
        spec = parse_agent_spec("gemini")
        assert spec.cli == "gemini"
        assert spec.model is None

    def test_cli_with_model(self):
        spec = parse_agent_spec("copilot:gpt-5-mini")
        assert spec.cli == "copilot"
        assert spec.model == "gpt-5-mini"

    def test_cli_with_model_containing_dash(self):
        spec = parse_agent_spec("gemini:gemini-2.0-flash")
        assert spec.cli == "gemini"
        assert spec.model == "gemini-2.0-flash"

    def test_strips_whitespace(self):
        spec = parse_agent_spec("  copilot : gpt-4o  ")
        assert spec.cli == "copilot"
        assert spec.model == "gpt-4o"

    def test_empty_string_raises(self):
        with pytest.raises(ValueError, match="must not be empty"):
            parse_agent_spec("")

    def test_only_whitespace_raises(self):
        with pytest.raises(ValueError, match="must not be empty"):
            parse_agent_spec("   ")

    def test_colon_with_empty_cli_raises(self):
        with pytest.raises(ValueError, match="CLI name is empty"):
            parse_agent_spec(":gpt-5")

    def test_trailing_colon_gives_no_model(self):
        spec = parse_agent_spec("copilot:")
        assert spec.cli == "copilot"
        assert spec.model is None

    def test_str_with_model(self):
        spec = AgentSpec(cli="copilot", model="gpt-5-mini")
        assert str(spec) == "copilot:gpt-5-mini"

    def test_str_without_model(self):
        spec = AgentSpec(cli="gemini", model=None)
        assert str(spec) == "gemini"


class TestBuildAgentCommand:
    def test_copilot_no_model(self):
        spec = AgentSpec(cli="copilot", model=None)
        cmd = build_agent_command(spec, "do the thing")
        assert cmd == ["gh", "copilot", "suggest", "-t", "shell", "do the thing"]

    def test_copilot_with_model(self):
        spec = AgentSpec(cli="copilot", model="gpt-5-mini")
        cmd = build_agent_command(spec, "do the thing")
        assert cmd == [
            "gh", "copilot", "suggest", "-t", "shell",
            "--model", "gpt-5-mini",
            "do the thing",
        ]

    def test_gemini_no_model(self):
        spec = AgentSpec(cli="gemini", model=None)
        cmd = build_agent_command(spec, "review this")
        assert cmd == ["gemini", "review this"]

    def test_gemini_with_model(self):
        spec = AgentSpec(cli="gemini", model="gemini-2.0")
        cmd = build_agent_command(spec, "review this")
        assert cmd == ["gemini", "--model", "gemini-2.0", "review this"]

    def test_unknown_cli_no_model(self):
        spec = AgentSpec(cli="my-agent", model=None)
        cmd = build_agent_command(spec, "hello")
        assert cmd == ["my-agent", "hello"]

    def test_unknown_cli_with_model(self):
        spec = AgentSpec(cli="my-agent", model="v2")
        cmd = build_agent_command(spec, "hello")
        assert cmd == ["my-agent", "--model", "v2", "hello"]


class TestAgentRunner:
    def test_run_calls_subprocess(self):
        mock_result = MagicMock()
        mock_result.returncode = 0

        spec = AgentSpec(cli="gemini", model=None)
        runner = AgentRunner(spec=spec)

        with patch("autopilot_dev.agents.subprocess.run", return_value=mock_result) as mock_run:
            result = runner.run("some prompt")
            mock_run.assert_called_once()
            call_args = mock_run.call_args
            assert call_args[0][0] == ["gemini", "some prompt"]
            assert result.returncode == 0

    def test_run_passes_timeout(self):
        mock_result = MagicMock()
        mock_result.returncode = 0

        spec = AgentSpec(cli="gemini", model=None)
        runner = AgentRunner(spec=spec, timeout=30)

        with patch("autopilot_dev.agents.subprocess.run", return_value=mock_result) as mock_run:
            runner.run("prompt")
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["timeout"] == 30

    def test_run_passes_extra_env(self):
        mock_result = MagicMock()
        mock_result.returncode = 0

        spec = AgentSpec(cli="gemini", model=None)
        runner = AgentRunner(spec=spec, extra_env={"MY_VAR": "val"})

        with patch("autopilot_dev.agents.subprocess.run", return_value=mock_result) as mock_run:
            runner.run("prompt")
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["env"]["MY_VAR"] == "val"
