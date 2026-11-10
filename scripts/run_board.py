#!/usr/bin/env python3
"""
Run a ComfyUI board in ONE command: open it in the owner's window, wait, read what every node made, print a table, make a contact sheet.

  py -3.12 -X utf8 scripts/run_board.py photos                      # free: every paid node stays a dry run (live price, balance, request check)
  py -3.12 -X utf8 scripts/run_board.py photos --paid all           # prints the live quote, starts NOTHING
  py -3.12 -X utf8 scripts/run_board.py photos --paid all --confirm 18      # pays: only when 18 equals the live quote
  py -3.12 -X utf8 scripts/run_board.py photos --paid 5,10 --confirm 16     # only nodes 5 and 10
  py -3.12 -X utf8 scripts/run_board.py photos --paid nb21 --confirm 12     # every Banana 2.1 node (tags: nb21 nb2 gpt2 grok2); a card name narrows it
  (a board with several models per chain refuses `all`: the nodes of every model stay on the board, the model that pays is named here)
  py -3.12 -X utf8 scripts/run_board.py video
  py -3.12 -X utf8 scripts/run_board.py photos --reload             # after editing node code (resets cached node objects)

Needs ComfyUI running with exactly one window. Paid steps only with the owner's "yes" and the credit number (CLAUDE.md).
The logic is in reels_pipeline/board_run.py (tested offline).
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reels_pipeline import board_run  # noqa: E402
from reels_pipeline.config import PipelineConfig  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("board", help="photos | video | a workflows/*_api.json file name")
    parser.add_argument("--paid", default="", help="what to switch to PAID: node ids, model tags (nb21, gpt2, grok2, nb2), card names (comma list) or 'all'; default: none, a free dry run")
    parser.add_argument("--confirm", type=float, default=None, help="the credit number; must equal the live quote")
    parser.add_argument("--timeout", type=float, default=600.0)
    parser.add_argument("--no-sheet", action="store_true")
    parser.add_argument("--reload", action="store_true", help="first apply edited node code and reset ComfyUI's cached node objects")
    args = parser.parse_args()
    PipelineConfig.load_env()

    graph = board_run.load_graph(args.board)
    try:
        ids = board_run.resolve_paid(graph, args.paid)
    except ValueError as exc:
        print(exc)
        return 2
    if ids:
        credits = board_run.quote(graph, ids)
        problem = board_run.check_confirm(credits, args.confirm)
        if problem:
            print(problem)
            return 2
        print(f"paying for nodes {ids}: up to {credits:g} credits confirmed")
    if args.reload:
        done = board_run.reload_nodes()
        print("reload:", "ok" if done.get("ok") else f"FAILED {done.get('error')}")
        if not done.get("ok"):
            return 1
    before = board_run.last_prompt_id()
    reply = board_run.open_board(args.board, ids, args.confirm)
    if not reply.get("ok"):
        print(f"the bridge refused ({reply.get('status')}): {reply.get('error')}")
        return 1
    print(f"opened '{reply['tab']}' (windows: {reply['windows']}), waiting for the queue ...")
    try:
        seconds = board_run.wait_queue(before, args.timeout)
    except TimeoutError as exc:
        print(exc)
        return 1
    result = board_run.read_results(board_run.last_run())
    print(f"finished in {seconds:g} s")
    print(board_run.format_table(result))
    hint = board_run.hint_for(result["error"])
    if hint:
        print("hint:", hint)
    if not args.no_sheet:
        sheet = board_run.contact_sheet(result["rows"])
        if sheet:
            print(f"contact sheet: {sheet}")
    return 0 if result["completed"] and not result["error"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
