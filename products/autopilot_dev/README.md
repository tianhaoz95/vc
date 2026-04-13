# autopilot-dev

**autopilot-dev** is an autonomous agent loop that drives CLI coding agents through a markdown task plan. A *worker* agent picks up the next task, implements it, and marks it done; a *reviewer* agent then verifies the work. If the reviewer finds issues it writes findings back to `worklog.md` and un-checks the task so the worker can try again in the next iteration.

---

## Features

- 🔄 **Worker → Reviewer loop** with a configurable maximum iteration count.
- 📝 **Markdown task plan** (`plan.md`) as the single source of truth for progress.
- 📋 **Worklog** (`worklog.md`) acts as a structured communication channel between agents.
- 🤖 **Flexible agent support** – any CLI coding agent (`copilot`, `gemini`, or a custom binary) with an optional model flag.
- 📦 **Pip-installable** directly from the GitHub URL.

---

## Installation

### From GitHub (recommended)

```bash
pip install "git+https://github.com/tianhaoz95/vc.git#subdirectory=products/autopilot_dev"
```

### From a local clone

```bash
git clone https://github.com/tianhaoz95/vc.git
cd vc/products/autopilot_dev
pip install -e .
```

---

## Quick Start

1. **Create a plan file** (e.g. `plan.md`):

   ```markdown
   # My Project Plan

   - [ ] Add user authentication
   - [ ] Write unit tests for auth module
   - [ ] Update API documentation
   ```

2. **Run autopilot**:

   ```bash
   autopilot --plan plan.md --max-loop 100 --worker copilot:gpt-5-mini --reviewer gemini
   ```

   **OR generate a plan automatically**:

   ```bash
   autopilot --planner copilot:claude-sonnet-4.6 --goal "build a todo app" --max-loop 100 --worker gemini --reviewer gemini
   ```

   This runs up to 100 worker → reviewer iterations until all tasks are checked.

---

## CLI Reference

```
autopilot [--plan PATH | --planner CLI[:MODEL] --goal TEXT] --max-loop N --worker CLI[:MODEL] --reviewer CLI[:MODEL] [options]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--plan PATH` | ❌* | Path to the markdown plan file. |
| `--planner CLI[:MODEL]` | ❌* | Planner agent spec to generate a plan from a goal. |
| `--goal TEXT` | ❌* | The high-level goal to be planned. |
| `--max-loop N` | ✅ | Maximum number of worker→reviewer iterations (positive integer). |
| `--worker CLI[:MODEL]` | ✅ | Worker agent spec – e.g. `copilot:gpt-5-mini` or `gemini:gemini-2.0`. |
| `--reviewer CLI[:MODEL]` | ✅ | Reviewer agent spec – e.g. `gemini` or `copilot:gpt-4o`. |
| `--final-reviewer CLI[:MODEL]` | ❌ | Optional final reviewer agent spec for a full project audit. |
| `--self-check-round N` | ❌ | Number of self-check rounds for the worker (default: 0). |
| `--workdir DIR` | ❌ | Directory for `worklog.md` (default: current directory). |
| `--timeout SECONDS` | ❌ | Per-agent subprocess timeout in seconds. |
| `--verbose` / `-v` | ❌ | Enable DEBUG-level logging. |

\* *Either `--plan` OR both `--planner` and `--goal` must be provided.*

### Agent spec format

```
<cli>[:<model>]
```

- `copilot:gpt-5-mini` → invokes `gh copilot suggest -t shell --model gpt-5-mini`
- `gemini` → invokes `gemini` (model chosen automatically by the CLI)
- `gemini:gemini-2.0` → invokes `gemini --model gemini-2.0`

---

## How It Works

```
┌──────────────────────────────────────────────────────┐
│                   autopilot loop                     │
│                                                      │
│  for i in range(max_loop):                           │
│    if all tasks done → exit ✅                        │
│                                                      │
│    ┌── WORKER AGENT ──────────────────────────────┐  │
│    │ 1. Read plan.md → find first unchecked task  │  │
│    │ 2. Check worklog.md                          │  │
│    │    • exists  → address reviewer's findings   │  │
│    │    • missing → create worklog.md with task   │  │
│    │               description & deliverables     │  │
│    │ 3. Implement task, run build & tests         │  │
│    │ 4. Mark task [x] in plan.md                 │  │
│    └──────────────────────────────────────────────┘  │
│                                                      │
│    ┌── REVIEWER AGENT ────────────────────────────┐  │
│    │ 1. Read worklog.md (task + deliverables)     │  │
│    │ 2. Verify every deliverable                  │  │
│    │    • all pass → delete worklog.md ✅          │  │
│    │    • any fail → write findings to worklog.md │  │
│    │               → uncheck task in plan.md      │  │
│    └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### worklog.md lifecycle

| State | Meaning |
|-------|---------|
| Does not exist | No work in progress; worker will pick the next task. |
| Exists (worker wrote it) | Task is being worked on; contains description + deliverables. |
| Exists (reviewer wrote findings) | Work was rejected; contains reviewer findings for the worker to address. |
| Deleted by reviewer | Task fully verified and complete. |

---

## Supported Agents

| CLI name | Invocation | Notes |
|----------|-----------|-------|
| `copilot` | `gh copilot suggest -t shell [--model MODEL] PROMPT` | Requires [GitHub CLI](https://cli.github.com/) with Copilot extension. |
| `gemini` | `gemini [--model MODEL] PROMPT` | Requires [Gemini CLI](https://github.com/google-gemini/gemini-cli). |
| any other | `<cli> [--model MODEL] PROMPT` | Generic fallback. |

---

## Plan File Format

`autopilot` reads **GitHub-flavoured Markdown task lists**:

```markdown
- [ ] Open task
- [x] Completed task
- [X] Also completed (capital X is fine)
```

Only standard `- [ ]` / `- [x]` list items are treated as tasks; all other lines are ignored.

---

## Development

### Setup

All Python-related work and tests MUST be performed within a `.venv` environment. If it doesn't exist, create it using:

```bash
uv venv --seed
source .venv/bin/activate
```

### Running Tests

```bash
# Ensure .venv is activated
pip install -r requirements.txt
python -m pytest tests/ -v
```

### Coverage

```bash
python -m pytest tests/ --cov=autopilot_dev --cov-report=term-missing
```

### Project Layout

```
products/autopilot_dev/
├── autopilot_dev/
│   ├── __init__.py     # Package version
│   ├── cli.py          # argparse CLI entry point (autopilot command)
│   ├── loop.py         # AgentLoop – orchestrates the worker/reviewer cycle
│   ├── agents.py       # AgentSpec, AgentRunner – parses specs, builds commands
│   ├── plan.py         # PlanManager – reads and modifies the markdown plan
│   ├── prompts.py      # Prompt templates for worker and reviewer agents
│   └── worklog.py      # WorklogManager – creates, reads, deletes worklog.md
├── tests/
│   ├── test_agents.py
│   ├── test_cli.py
│   ├── test_loop.py
│   ├── test_plan.py
│   ├── test_prompts.py
│   └── test_worklog.py
├── pyproject.toml
├── requirements.txt
├── README.md
└── GEMINI.md
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All tasks in the plan are completed. |
| `1` | Loop ended (`--max-loop` reached) with tasks still open. |
lan
│   ├── prompts.py      # Prompt templates for worker and reviewer agents
│   └── worklog.py      # WorklogManager – creates, reads, deletes worklog.md
├── tests/
│   ├── test_agents.py
│   ├── test_cli.py
│   ├── test_loop.py
│   ├── test_plan.py
│   ├── test_prompts.py
│   └── test_worklog.py
├── pyproject.toml
├── requirements.txt
├── README.md
└── GEMINI.md
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All tasks in the plan are completed. |
| `1` | Loop ended (`--max-loop` reached) with tasks still open. |
