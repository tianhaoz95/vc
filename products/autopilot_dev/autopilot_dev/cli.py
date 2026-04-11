"""CLI entry point for the ``autopilot`` command."""

from __future__ import annotations

import argparse
import logging
import sys

from autopilot_dev.agents import parse_agent_spec
from autopilot_dev.loop import AgentLoop, LoopConfig


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="autopilot",
        description=(
            "Run an autonomous worker→reviewer coding-agent loop driven by a "
            "markdown task plan."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  autopilot --plan plan.md --max-loop 100 --worker copilot:gpt-5-mini --reviewer gemini
  autopilot --plan tasks.md --max-loop 20  --worker copilot:gpt-4o       --reviewer gemini
  autopilot --plan plan.md --max-loop 5   --worker gemini:gemini-2.0     --reviewer copilot
""",
    )
    parser.add_argument(
        "--plan",
        required=True,
        metavar="PATH",
        help="Path to the markdown plan file containing the task list.",
    )
    parser.add_argument(
        "--max-loop",
        required=True,
        type=int,
        metavar="N",
        help="Maximum number of worker→reviewer iterations to run.",
    )
    parser.add_argument(
        "--worker",
        required=True,
        metavar="CLI[:MODEL]",
        help=(
            "Worker agent spec. Format: <cli>[:<model>]. "
            "Example: ``copilot:gpt-5-mini`` or ``gemini:gemini-2.0``."
        ),
    )
    parser.add_argument(
        "--reviewer",
        required=True,
        metavar="CLI[:MODEL]",
        help=(
            "Reviewer agent spec. Format: <cli>[:<model>]. "
            "Example: ``gemini`` or ``copilot:gpt-4o``."
        ),
    )
    parser.add_argument(
        "--workdir",
        default=".",
        metavar="DIR",
        help="Working directory where worklog.md is created (default: current dir).",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=None,
        metavar="SECONDS",
        help="Optional per-agent timeout in seconds.",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable verbose (DEBUG-level) logging.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """Parse arguments, configure logging, and run the agent loop.

    Args:
        argv: Argument list (defaults to ``sys.argv[1:]``).

    Returns:
        Exit code: 0 on success, non-zero on error.
    """
    parser = _build_parser()
    args = parser.parse_args(argv)

    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )

    try:
        worker_spec = parse_agent_spec(args.worker)
    except ValueError as exc:
        parser.error(f"--worker: {exc}")
        return 1  # unreachable, but satisfies type checkers

    try:
        reviewer_spec = parse_agent_spec(args.reviewer)
    except ValueError as exc:
        parser.error(f"--reviewer: {exc}")
        return 1

    if args.max_loop < 1:
        parser.error("--max-loop must be a positive integer.")
        return 1

    config = LoopConfig(
        plan_path=args.plan,
        max_loops=args.max_loop,
        worker_spec=worker_spec,
        reviewer_spec=reviewer_spec,
        workdir=args.workdir,
        agent_timeout=args.timeout,
    )

    loop = AgentLoop(config)
    result = loop.run()

    if result.all_tasks_done:
        print("✅ All tasks completed successfully.")
        return 0
    else:
        print(
            f"⚠️  Loop finished after {result.iterations_run} iteration(s) "
            "but not all tasks are done."
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
