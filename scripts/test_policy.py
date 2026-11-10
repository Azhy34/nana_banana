#!/usr/bin/env python3
"""
When tests are needed in this project, decided from what changed since the last accepted state. Prints 1-3 lines, runs nothing unless `--run`.

THE POLICY (CLAUDE.md "Tests policy"):
  everyday work   generation, data (Promt/trends.json, specs, sets, listings), documents, skills, memory  ->  NO TESTS. The process checks itself:
                  director.py plan|show|card, build_comfy_workflows.py --verify-live, run_board.py dry run (live price, request check, balance),
                  a paid run starts only when the confirmed number equals the live quote.
  paid path code  payment, quote, --paid, the bridge, the KIE request, dry_run defaults  ->  the CORE once (pytest -q: ~55 tests, a few seconds)
  new node / new KIE model / new set type / new prompt-builder logic (`--new`)  ->  ACCEPTANCE once: the tests of that area + 2-4 new tests of
                  the new thing + --verify-live + a dry run + one paid trial frame on the owner's "yes"; afterwards the area is not re-run.
  a mistake cost credits  ->  one regression test of that mistake (marked `core` if it guards money).

  py -3.12 -X utf8 scripts/test_policy.py              # what changed since the last accepted state and what that means
  py -3.12 -X utf8 scripts/test_policy.py --run        # do exactly that (quietly) and accept the state when it passes
  py -3.12 -X utf8 scripts/test_policy.py --new        # the work was a NEW node / logic: acceptance tests of the touched areas
  py -3.12 -X utf8 scripts/test_policy.py --accept     # nothing to run: just mark the current state as accepted

"Changed" = files newer than the stamp file `.test_policy_stamp` (a project file is untracked or modified in git: mtime is the reliable signal).
"""

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STAMP = ROOT / ".test_policy_stamp"
SCAN = ("comfy_nodes", "reels_pipeline", "scripts", "services", "api", "api_discovery", "specs", "Promt", ".claude", ".agents", "hooks")
SKIP_DIRS = {"__pycache__", "node_modules", "dist", ".git", "test-results", "playwright-report"}
PYTEST = [sys.executable, "-X", "utf8", "-m", "pytest"]

# Code of the PAID PATH: a change here is covered by the CORE once.
MONEY = ("comfy_nodes/bridge_logic.py", "comfy_nodes/moonbloom_nodes.py", "reels_pipeline/board_run.py", "reels_pipeline/kie_generator.py",
         "reels_pipeline/live_price.py", "reels_pipeline/kie_capabilities.py", "reels_pipeline/preflight.py", "reels_pipeline/kling_bridge.py",
         "scripts/run_board.py", "api_discovery/kie_kling/")

# Areas: touched paths -> the tests of the area (the ACCEPTANCE of a NEW node / logic there).
AREAS = {
    "KIE model or photo node": (("reels_pipeline/kie_generator.py", "reels_pipeline/onboarding.py", "reels_pipeline/kie_capabilities.py",
                                 "reels_pipeline/live_price.py", "comfy_nodes/moonbloom_nodes.py", "scripts/add_model.py"),
                                ("comfy_nodes/test_kie_models.py", "comfy_nodes/test_capabilities.py", "comfy_nodes/test_tools.py")),
    "boards and the bridge": (("scripts/build_comfy_workflows.py", "comfy_nodes/bridge_logic.py", "reels_pipeline/board_layout.py",
                               "reels_pipeline/board_run.py", "scripts/run_board.py"),
                              ("comfy_nodes/test_board_bay.py", "comfy_nodes/test_capabilities.py", "comfy_nodes/test_video_nodes.py", "comfy_nodes/test_tools.py")),
    "prompt builder": (("services/promptGenerator.ts", "scripts/build_batch_prompts.mjs", "reels_pipeline/prompts.py"),
                       ("comfy_nodes/test_brief_prompt.py", "comfy_nodes/test_trends_single_source.py")),
    "directors and sets": (("reels_pipeline/director.py", "reels_pipeline/carousel.py", "reels_pipeline/destinations.py", "scripts/director.py",
                            "scripts/new_listing.py", "scripts/export_ads.py"),
                           ("comfy_nodes/test_director.py", "comfy_nodes/test_carousel.py", "comfy_nodes/test_destinations.py")),
    "video / Kling": (("reels_pipeline/kling_bridge.py", "reels_pipeline/motion_guard.py"), ("comfy_nodes/test_video_nodes.py",)),
    "node hot reload": (("comfy_nodes/hot_reload.py",), ("comfy_nodes/test_hot_reload.py",)),
}


def _changed(since: float) -> list:
    found = []
    for top in SCAN:
        base = ROOT / top
        for folder, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for name in files:
                path = Path(folder) / name
                if path.suffix in (".py", ".ts", ".mjs", ".json", ".md", ".cjs") and path.stat().st_mtime > since:
                    found.append(path.relative_to(ROOT).as_posix())
    return sorted(found)


def _hits(paths, prefixes) -> list:
    return [p for p in paths if any(p == x or (x.endswith("/") and p.startswith(x)) for x in prefixes)]


def decide(paths: list, new: bool) -> dict:
    """{"action": "nothing" | "core" | "acceptance", "files": [...], "why": str}."""
    code = [p for p in paths if p.endswith((".py", ".ts", ".mjs", ".cjs")) and not p.startswith(("comfy_nodes/test_", "api_discovery/kie_kling/test_"))]
    money = _hits(code, MONEY)
    areas = {name: _hits(code, prefixes) for name, (prefixes, _) in AREAS.items() if _hits(code, prefixes)}
    if new and areas:
        files = sorted({f for name in areas for f in AREAS[name][1]})
        return {"action": "acceptance", "files": files, "why": "new node / logic in: " + ", ".join(areas)}
    if money:
        return {"action": "core", "files": [], "why": f"the paid path was touched: {', '.join(money[:4])}{' ...' if len(money) > 4 else ''}"}
    if code:
        return {"action": "nothing", "files": [], "why": f"code outside the paid path ({', '.join(code[:3])}): the dry run is the check; use --new for a new node or logic"}
    return {"action": "nothing", "files": [], "why": "data, documents or skills only"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--new", action="store_true", help="the change is a NEW node / model / set type / builder logic: acceptance of the touched areas")
    parser.add_argument("--accept", action="store_true", help="mark the current state as accepted without running anything")
    args = parser.parse_args()
    if args.accept or not STAMP.exists():
        STAMP.write_text(str(time.time()), encoding="utf-8")
        print("baseline set: the current state is accepted" if args.accept else "no baseline yet: the current state is taken as accepted (nothing to run)")
        return 0
    changed = _changed(float(STAMP.read_text(encoding="utf-8")))
    verdict = decide(changed, args.new)
    label = {"nothing": "NO TESTS", "core": "CORE (pytest -q)", "acceptance": "ACCEPTANCE"}[verdict["action"]]
    print(f"{len(changed)} files changed since the last accepted state -> {label}: {verdict['why']}")
    if verdict["files"]:
        print("tests of the area:", " ".join(verdict["files"]))
    if not args.run or verdict["action"] == "nothing":
        if args.run:
            STAMP.write_text(str(time.time()), encoding="utf-8")
        return 0
    command = PYTEST + ["-q", "-p", "no:cacheprovider"] + (["-m", ""] + verdict["files"] if verdict["action"] == "acceptance" else [])
    done = subprocess.run(command, cwd=str(ROOT), capture_output=True, text=True, encoding="utf-8")
    last = [ln for ln in done.stdout.strip().splitlines() if ln.strip()][-1:] or [done.stderr.strip()[-200:]]
    print(("PASSED: " if done.returncode == 0 else "FAILED: ") + last[0])
    if done.returncode == 0:
        STAMP.write_text(str(time.time()), encoding="utf-8")
    return done.returncode


if __name__ == "__main__":
    raise SystemExit(main())
