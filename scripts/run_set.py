#!/usr/bin/env python3
"""
One command for the deterministic chain of a set, and ONE compact report instead of ten tool outputs in the chat.
It calls the existing CLIs as subprocesses (director.py, run_board.py, export_ads.py), never imports their internals.

  py -3.12 -X utf8 scripts/run_set.py l45_set01 --until photos   # director plan -> build -> photos <round> -> run_board photos (free dry run), per round
  py -3.12 -X utf8 scripts/run_set.py l45_set01 --until video    # needs the owner's picks (director.py pick); then run_board video (free dry run)
  py -3.12 -X utf8 scripts/run_set.py l45_set01 --until export   # export_ads.py <set> WITHOUT --write: only the plan of the delivery files
  py -3.12 -X utf8 scripts/run_set.py l45_set01 --until photos --round 1     # only one round (reel: 1 = s1-s3, 2 = s4-s6; carousel: round = pair)

Safety: this script has NO option that spends credits or writes delivery files. It never passes --paid, --confirm or --write, never starts
ComfyUI and calls no network beyond the one local check of port 8188 (and what run_board.py's free dry run does itself). A paid step is
printed as a command for the owner's "yes" with the credit number (CLAUDE.md, step 5).

Writes runs/<set>/report.md (full) and appends one JSON line to runs/run_set_log.jsonl (seconds per stage: cost/time per set can be summed
later). Prints at most 30 lines. Exit 0 = every stage passed, 1 = a stage failed, 2 = the call itself is wrong.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

SCRIPTS = ROOT / "scripts"
SETS = ROOT / "specs" / "sets"
SPECS = ROOT / "specs"
ACTIVE = SPECS / "active_board.json"
WORKFLOWS = ROOT / "workflows"
BOARD_FILES = {"photos": "moonbloom_photos_api.json", "video": "moonbloom_video_api.json"}
RUNS = ROOT / "runs"
FORBIDDEN_FLAGS = ("--paid", "--confirm", "--write")  # anything that spends credits or writes delivery files: not available here
ROUNDS = {1: ("s1", "s2", "s3"), 2: ("s4", "s5", "s6")}  # the rounds of a reel set, as in scripts/director.py
MAX_STDOUT_LINES = 30
TAIL_LINES = 15
NA = "n/a"
PICK_MESSAGE = "owner has not picked frames: run director.py pick {set} s2 s3 s6"
COMFY_MESSAGE = "ComfyUI does not answer on {url}: start it yourself (this script never starts it), then run again"

Runner = Callable[[Sequence[str]], "tuple[int, str, float]"]


class Stage:
    def __init__(self, name: str, script: str, args: Sequence[str]):
        self.name, self.script, self.args = name, script, list(args)

    def argv(self) -> List[str]:
        out = [sys.executable, "-X", "utf8", str(SCRIPTS / self.script), *self.args]
        forbidden = [a for a in out if a in FORBIDDEN_FLAGS]
        if forbidden:
            raise ValueError(f"run_set.py never passes {forbidden}: {self.name}")
        return out

    def short(self) -> str:
        return " ".join([self.script, *self.args])


# ------------------------------------------------------------------ the chain

def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def rounds_of(generated: dict) -> List[int]:
    """The rounds a built set has: a carousel round is a pair; a reel round holds the slots s1-s3 / s4-s6 that the set really has."""
    if generated.get("type") == "carousel":
        return list(range(1, len(generated.get("pairs", [])) + 1))
    have = {s.get("slot") for s in generated.get("slots", [])}
    return [r for r, slots in ROUNDS.items() if have & set(slots)]


def picks_of(set_id: str, active: dict, generated: dict, video_spec: dict) -> List[str]:
    """The scenes the owner picked for THIS set (director.py pick writes the `video` block of specs/active_board.json together with `set`)."""
    scenes = (active.get("video") or {}).get("scenes") or []
    if active.get("set") != set_id:
        return []
    known = {c.get("id") for c in generated.get("cards", [])} | {f.get("scene_id") for f in video_spec.get("frames", [])}
    return [s for s in scenes if s in known]


def comfy_reachable(base: Optional[str] = None) -> bool:
    if base is None:
        from reels_pipeline.config import PipelineConfig

        base = PipelineConfig.COMFY_BASE_URL
    try:
        with urllib.request.urlopen(base.rstrip("/") + "/system_stats", timeout=3) as resp:
            return resp.status == 200
    except Exception:  # noqa: BLE001  any failure = not reachable
        return False


def run_subprocess(argv: Sequence[str]) -> "tuple[int, str, float]":
    start = time.time()
    try:
        done = subprocess.run(list(argv), cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=1500,
                              env={**os.environ, "PYTHONIOENCODING": "utf-8"})
        out = (done.stdout or "") + (("\n" + done.stderr) if done.stderr else "")
        return done.returncode, out, round(time.time() - start, 1)
    except subprocess.TimeoutExpired as exc:
        return 124, f"timeout after {exc.timeout:g} s", round(time.time() - start, 1)


def run_chain(set_id: str, until: str, only_round: Optional[int] = None, *, runner: Runner = run_subprocess,
              comfy_ok: Callable[[], bool] = comfy_reachable, sets_dir: Path = SETS, active_path: Path = ACTIVE,
              workflows_dir: Optional[Path] = WORKFLOWS) -> dict:
    """Runs the stages one after another; stops at the first failure. Returns {"stages": [...], "ok", "failed", "next", "messages"}."""
    result: dict = {"set": set_id, "until": until, "stages": [], "ok": True, "failed": None, "messages": [], "next": ""}
    start = time.time()

    def stage(st: Stage) -> bool:
        code, out, seconds = runner(st.argv())
        entry = {"name": st.name, "command": st.short(), "exit": code, "seconds": seconds, "output": out, "summary": summarise(st, out)}
        result["stages"].append(entry)
        if code != 0:
            result["ok"], result["failed"] = False, st.name
        return code == 0

    def stop(name: str, command: str, message: str) -> None:
        result["stages"].append({"name": name, "command": command, "exit": NA, "seconds": 0, "output": message, "summary": message})
        result["ok"], result["failed"] = False, name

    def board(board_name: str) -> bool:
        if not comfy_ok():
            from reels_pipeline.config import PipelineConfig

            stop("comfy", "GET /system_stats", COMFY_MESSAGE.format(url=PipelineConfig.COMFY_BASE_URL))
            return False
        # the board file is built from active_board.json by build_comfy_workflows.py: without this step run_board dry-runs the PREVIOUS set's board
        if not stage(Stage("boards", "build_comfy_workflows.py", [])):
            return False
        if workflows_dir is not None:  # the board must really hold THIS set (10.11: a dry run of Listing 11 had run the board of Listing 7)
            board_file = workflows_dir / BOARD_FILES[board_name]
            text = board_file.read_text(encoding="utf-8") if board_file.is_file() else ""
            if set_id not in text:
                stop("board", board_file.name, f"{board_file.name} does not contain {set_id}: the board is not built for this set, nothing was run")
                return False
        return stage(Stage(f"run_board {board_name}", "run_board.py", [board_name]))

    if until == "photos":
        ok = stage(Stage("plan", "director.py", ["plan", set_id])) and stage(Stage("build", "director.py", ["build", set_id]))
        generated = _read_json(sets_dir / f"{set_id}.generated.json") if ok else {}
        rounds = [only_round] if only_round else rounds_of(generated)
        if ok and not rounds:
            stop("rounds", "", f"the built set {set_id} has no photo round")
            ok = False
        for number in rounds if ok else []:
            if not (stage(Stage(f"photos r{number}", "director.py", ["photos", set_id, str(number)])) and board("photos")):
                break
        if result["ok"]:
            result["next"] = (f"pay on the owner's yes with the live number: first `py -3.12 -X utf8 scripts/run_board.py photos --paid all` (prints the quote, starts nothing), "
                              f"then the same with `--confirm N`; judge the frames by eye, then `director.py pick {set_id} s2 s3 s6`")
    elif until == "video":
        generated = _read_json(sets_dir / f"{set_id}.generated.json")
        set_spec = _read_json(sets_dir / f"{set_id}.json")
        if generated.get("type") == "carousel":
            stop("pick", "", "a carousel set has no video stage (its pairs are the slides): use --until export")
        else:
            picks = picks_of(set_id, _read_json(active_path), generated, _read_json(SPECS / set_spec.get("video_spec", "")) if set_spec.get("video_spec") else {})
            if not picks:
                stop("pick", "specs/active_board.json", PICK_MESSAGE.format(set=set_id))
            else:
                result["messages"].append(f"picked: {picks}")
                if board("video"):
                    result["next"] = ("pay on the owner's yes with the live number: first `py -3.12 -X utf8 scripts/run_board.py video --paid all` (prints the quote, starts nothing), "
                                      "then the same with `--confirm N`; Kling only for approved frames")
    elif until == "export":
        if stage(Stage("export plan", "export_ads.py", [set_id])):
            result["next"] = f"if the plan is right: `py -3.12 -X utf8 scripts/export_ads.py {set_id} --write` (writes the delivery files into exports/; uploads nothing)"
    else:
        raise ValueError(f"--until {until}")
    if not result["ok"] and not result["next"]:
        result["next"] = "fix the failed stage (its last lines are in the report), then run the same command again"
    result["seconds"] = round(time.time() - start, 1)
    return result


# ------------------------------------------------------------------ reading the output of the commands (defensive: n/a when a number is not there)

def _first(pattern: str, text: str, group: int = 1, flags: int = re.M) -> str:
    m = re.search(pattern, text, flags)
    return m.group(group) if m else NA


def summarise(st: Stage, out: str) -> str:
    """One short phrase with the key result of a stage."""
    try:
        if st.script == "director.py" and st.args[0] == "plan":
            problems = len(re.findall(r"^\s+- ", out.split("PROBLEMS:", 1)[1], re.M)) if "PROBLEMS:" in out else 0
            cards = _first(r"^(?:set|carousel) \S+: (\d+ (?:slots|pairs)[^\n]*)", out)
            return f"{cards}; problems {problems}; clips ~{_first(r'clips if every slot follows the advice: ~(\d+) credits', out)} credits (estimate)"
        if st.script == "director.py" and st.args[0] == "build":
            return _first(r"^written: (\S+)", out)
        if st.script == "director.py" and st.args[0] == "photos":
            return f"cards {_first(r'photo board = round \d+[^:]*: (\[[^\]]*\])', out)}; models {_first(r'models on the board: (\S+)', out)}"
        if st.script == "run_board.py":
            rows = re.findall(r"^\s+node\s+\d+\s+(\S+)\s+(.+?)\s+credits\s+(\S+)", out, re.M)
            by_model: Dict[str, float] = {}
            for model, _mode, credits in rows:
                if re.fullmatch(r"[\d.]+", credits):
                    by_model[model] = by_model.get(model, 0) + float(credits)
            prices = ", ".join(f"{m.split('/')[0][:18]} {c:g}" for m, c in by_model.items()) or NA
            return (f"{len(rows)} nodes; run {_first(r'^run: (\S+)', out)}; dry-run credits by model or scene: {prices}; spent {_first(r'spent ([\d.]+) credits', out)}; "
                    f"balance {_first(r'balance now ([\d.]+)', out)}; windows {_first(r'windows: (\d+)', out)}; {_first(r'^finished in (\S+) s', out)} s")
        if st.script == "export_ads.py":
            ok = len(re.findall(r": ok ->", out))
            no = len(re.findall(r": NO ", out))
            missing = len(re.findall(r"not generated yet", out))
            return f"{ok} files would be written; {no} do not fit; {missing} frames not generated yet"
    except Exception:  # noqa: BLE001  a summary that cannot be read must never break a report
        pass
    return NA


def warnings_of(stages: Sequence[dict]) -> List[str]:
    keys = ("!!", "WARN", "NOTE", "hint:", "PROBLEM", "refused", "REFUSED", ": NO ", "not generated yet")
    seen: List[str] = []
    for s in stages:
        for line in str(s.get("output", "")).splitlines():
            if any(k in line for k in keys) and line.strip() not in seen:
                seen.append(line.strip())
    return seen


def errors_of(result: dict) -> List[str]:
    if result["ok"]:
        return []
    failed = next((s for s in result["stages"] if s["name"] == result["failed"]), None)
    if not failed:
        return []
    return [f"stage {failed['name']} exit {failed['exit']}, last lines:"] + [ln for ln in str(failed["output"]).strip().splitlines()[-TAIL_LINES:]]


# ------------------------------------------------------------------ the report

def _cut(text: object, width: int = 150) -> str:
    text = str(text).replace("|", "/")
    return text if len(text) <= width else text[: width - 1] + "…"


def format_report(result: dict, limit: Optional[int] = None) -> str:
    """The report. limit=None: the full text for report.md; limit=N: at most N lines for the chat (the next step always stays)."""
    stages = result["stages"]
    verdict = "OK" if result["ok"] else f"FAILED at stage {result['failed']}"
    head = f"run_set {result['set']} --until {result['until']}: {verdict}, {result.get('seconds', NA)} s total"
    table = ["| stage | command | exit | s | key result |", "|---|---|---|---|---|"]
    for s in stages:
        table.append(f"| {_cut(s['name'], 20)} | {_cut(s['command'], 44)} | {s['exit']} | {s['seconds']} | {_cut(s['summary'], 110)} |")
    warn, err = warnings_of(stages), errors_of(result)
    tail = f"next step: {result['next'] or NA}"
    blocks = [("warnings", warn[:10]), ("errors", err[:10] if limit else err), ("notes", result["messages"][:10])]
    lines = [head, *table]
    for title, items in blocks:
        if items:
            lines += [f"{title}:"] + [f"  {_cut(i, 160 if limit else 400)}" for i in items]
    if limit and len(lines) + 1 > limit:
        keep = limit - 2
        lines = lines[:keep] + [f"... cut, full text: runs/{result['set']}/report.md"]
    return "\n".join(lines + [tail])


def write_outputs(result: dict, runs_dir: Path = RUNS) -> Path:
    folder = runs_dir / result["set"]
    folder.mkdir(parents=True, exist_ok=True)
    report = folder / "report.md"
    report.write_text(format_report(result) + "\n", encoding="utf-8")
    entry = {"set": result["set"], "until": result["until"], "ok": result["ok"], "failed": result["failed"], "seconds": result.get("seconds"),
             "stages": [{"name": s["name"], "exit": s["exit"], "seconds": s["seconds"]} for s in result["stages"]],
             "time": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    with (runs_dir / "run_set_log.jsonl").open("a", encoding="utf-8") as log:
        log.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return report


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("set", help="a set of specs/sets (reel or carousel)")
    parser.add_argument("--until", required=True, choices=("photos", "video", "export"))
    parser.add_argument("--round", type=int, default=None, help="photos only: run just this round (default: every round the set has)")
    args = parser.parse_args(argv)
    if not (SETS / f"{args.set}.json").is_file():
        print(f"no set {args.set} in specs/sets: {sorted(p.stem for p in SETS.glob('*.json') if not p.stem.endswith('.generated'))}")
        return 2
    result = run_chain(args.set, args.until, args.round)
    write_outputs(result)
    print(format_report(result, MAX_STDOUT_LINES))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
