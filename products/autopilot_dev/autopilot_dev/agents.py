"""Agent abstraction for CLI coding agents (copilot, gemini, etc.)."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AgentSpec:
    """Parsed specification for a CLI coding agent."""

    cli: str
    model: Optional[str] = None

    def __str__(self) -> str:
        if self.model:
            return f"{self.cli}:{self.model}"
        return self.cli


def parse_agent_spec(spec: str) -> AgentSpec:
    """Parse an agent spec string like ``copilot:gpt-5-mini`` or ``gemini``.

    Args:
        spec: Agent specification string in the format ``<cli>[:<model>]``.

    Returns:
        An :class:`AgentSpec` with the CLI name and optional model.

    Raises:
        ValueError: If the spec string is empty or malformed.
    """
    spec = spec.strip()
    if not spec:
        raise ValueError("Agent spec must not be empty.")
    parts = spec.split(":", 1)
    cli = parts[0].strip()
    if not cli:
        raise ValueError(f"Invalid agent spec: {spec!r}. CLI name is empty.")
    model = parts[1].strip() if len(parts) == 2 else None
    if model == "":
        model = None
    return AgentSpec(cli=cli, model=model)


def build_agent_command(spec: AgentSpec, prompt: str) -> list[str]:
    """Build the subprocess command list for invoking a coding agent.

    Supported CLIs:
    - ``copilot``: Invokes ``gh copilot suggest -t shell [--model <model>]``
      with the prompt passed as the final positional argument.
    - ``gemini``: Invokes ``gemini [--model <model>]`` with the prompt passed
      as a positional argument.
    - Any other value: Invokes the CLI binary directly with ``[--model <model>]``
      (if a model is set) and the prompt appended at the end.

    Args:
        spec: The parsed :class:`AgentSpec`.
        prompt: The full prompt text to pass to the agent.

    Returns:
        A list of strings suitable for ``subprocess.run(cmd, ...)``.
    """
    if spec.cli == "copilot":
        cmd = ["copilot", "suggest", "-t", "shell"]
        if spec.model:
            cmd += ["--model", spec.model]
        cmd.append(prompt)
    elif spec.cli == "gemini":
        cmd = ["gemini"]
        if spec.model:
            cmd += ["--model", spec.model]
        cmd.append(prompt)
    else:
        cmd = [spec.cli]
        if spec.model:
            cmd += ["--model", spec.model]
        cmd.append(prompt)
    return cmd


@dataclass
class AgentRunner:
    """Runs a CLI coding agent with a given prompt.

    Attributes:
        spec: The :class:`AgentSpec` for this agent.
        timeout: Maximum seconds to wait for the agent to complete.
        extra_env: Optional extra environment variables to set for the process.
    """

    spec: AgentSpec
    timeout: Optional[int] = None
    extra_env: dict = field(default_factory=dict)

    def run(self, prompt: str) -> subprocess.CompletedProcess:
        """Invoke the agent with *prompt* and return the completed process.

        Args:
            prompt: The task description / instructions for the agent.

        Returns:
            A :class:`subprocess.CompletedProcess` instance.
        """
        import os

        cmd = build_agent_command(self.spec, prompt)
        env = {**os.environ, **self.extra_env} if self.extra_env else None
        return subprocess.run(
            cmd,
            timeout=self.timeout,
            env=env,
        )
