# autopilot-dev – Agent Architecture & Development Guide

A CLI tool that orchestrates autonomous coding agents through a markdown task plan using a **worker → reviewer** loop pattern.

## Project Overview

- **Core Purpose:** Automate multi-step coding tasks by running CLI coding agents (e.g. GitHub Copilot, Gemini) in a structured loop, with automatic quality gating via a reviewer agent.
- **Primary Technologies:** Python 3.10+, argparse, subprocess, pytest.
- **Entry point:** `autopilot` CLI command (registered via `pyproject.toml` script).

## Architecture

```
autopilot_dev/
├── cli.py       → argparse entry point; validates args; calls AgentLoop
├── loop.py      → AgentLoop: the main iteration engine
├── agents.py    → AgentSpec dataclass; parse_agent_spec(); build_agent_command(); AgentRunner
├── plan.py      → PlanManager: read tasks, mark done/open, all_tasks_done()
├── prompts.py   → build_worker_prompt() / build_reviewer_prompt()
└── worklog.py   → WorklogManager: create, read, append, delete worklog.md
```

### Data Flow per Iteration

```
cli.py
  └─ AgentLoop.run()
       ├─ PlanManager.all_tasks_done() ──→ exit early if True
       ├─ AgentRunner(worker).run(build_worker_prompt(plan_path))
       │      subprocess: gh copilot suggest -t shell [--model M] PROMPT
       └─ AgentRunner(reviewer).run(build_reviewer_prompt(plan_path))
              subprocess: gemini [--model M] PROMPT
```

### worklog.md State Machine

```
[absent] ──(worker creates)──→ [worker draft]
                                     │
                         (reviewer verifies)
                            ┌────────┴───────┐
                       pass │                │ fail
                            ↓                ↓
                       [deleted]    [reviewer findings]
                                         │
                                (worker fixes next iter)
                                         ↓
                                  [worker draft]  → ...
```

## Key Modules

### `agents.py`

- **`parse_agent_spec(spec: str) → AgentSpec`** – splits `"copilot:gpt-5-mini"` into `AgentSpec(cli="copilot", model="gpt-5-mini")`.
- **`build_agent_command(spec, prompt) → list[str]`** – constructs the subprocess command. `copilot` maps to `gh copilot suggest -t shell`; `gemini` maps to `gemini`; unknown CLIs are passed through directly.
- **`AgentRunner.run(prompt) → CompletedProcess`** – thin wrapper around `subprocess.run()`.

### `plan.py`

- Parses `- [ ] Task` / `- [x] Task` patterns with a single regex.
- **`get_next_open_task()`** – returns the first unchecked task or `None`.
- **`mark_task_done(task)` / `mark_task_open(task)`** – mutate the file in-place by rewriting only the matched line.
- **`all_tasks_done()`** – returns `True` only if there is at least one task and all are checked.

### `prompts.py`

- Contains the full natural-language instructions for each agent role.
- Worker prompt: find next task, check/create worklog.md, implement, build/test, mark done.
- Reviewer prompt: read worklog.md, verify deliverables, delete on pass or write findings and uncheck on fail.

### `worklog.py`

- Simple file wrapper around `./worklog.md` (location controlled by `workdir` config).
- Methods: `exists()`, `read()`, `write(content)`, `append(content)`, `delete()`.

### `loop.py`

- **`LoopConfig`** dataclass: all parameters in one place.
- **`AgentLoop.run() → LoopResult`**: the main loop. Checks `all_tasks_done()` before each iteration. Runs worker then reviewer. Returns `LoopResult(iterations_run, all_tasks_done, stopped_early)`.

### `cli.py`

- Builds the `argparse` parser with `--plan`, `--max-loop`, `--worker`, `--reviewer`, `--workdir`, `--timeout`, `--verbose`.
- Validates `--max-loop > 0` and both agent specs.
- Returns exit code `0` (all done) or `1` (loop exhausted).

## Building and Running

### Prerequisites

- Python 3.10+
- `gh` CLI with Copilot extension (for `copilot` worker)
- `gemini` CLI (for `gemini` reviewer/worker)

### Installation

```bash
# From GitHub
pip install "git+https://github.com/tianhaoz95/vc.git#subdirectory=products/autopilot_dev"

# Local editable install
pip install -e .
```

### Running Tests

```bash
pip install -r requirements.txt
python -m pytest tests/ -v
```

### Coverage Check

```bash
python -m pytest tests/ --cov=autopilot_dev --cov-report=term-missing
```

## Development Conventions

### Adding a New Agent CLI

1. Add a new `elif spec.cli == "my-agent":` branch in `build_agent_command()` in `agents.py`.
2. Add corresponding tests in `tests/test_agents.py`.

### Modifying Prompts

- Edit `prompts.py`. The prompts are the primary interface between `autopilot` and the coding agents. Keep them precise and unambiguous.
- Add or update tests in `tests/test_prompts.py` to verify key phrases.

### Testing

- All modules have a corresponding `tests/test_<module>.py`.
- Use `unittest.mock.patch` for subprocess mocking (no extra dependencies).
- Use `pytest`'s `tmp_path` fixture for file I/O tests.
- Do **not** invoke real CLI tools in tests.

## Packaging

`pyproject.toml` defines the package. The `autopilot` script entry point maps to `autopilot_dev.cli:main`. Install from GitHub with:

```bash
pip install "git+https://github.com/tianhaoz95/vc.git#subdirectory=products/autopilot_dev"
```
