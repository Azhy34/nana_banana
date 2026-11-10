"""Offline tests of scripts/run_set.py (the one-command chain of a set): the stages it builds, where it stops, how it reports.
Subprocess, ComfyUI and KIE are replaced by fakes: nothing is started, nothing is spent.

Run: py -3.12 -X utf8 -m pytest comfy_nodes/test_run_set.py -q -m ""
"""

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("run_set", ROOT / "scripts" / "run_set.py")
run_set = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(run_set)

SET = "t_reel01"


@pytest.fixture
def data(tmp_path):
    sets = tmp_path / "sets"
    sets.mkdir()
    (sets / f"{SET}.json").write_text(json.dumps({"listing_spec": "x.json"}), encoding="utf-8")
    generated = {"slots": [{"slot": "s1", "card": f"{SET}_s1"}, {"slot": "s4", "card": f"{SET}_s4"}], "cards": [{"id": f"{SET}_s1"}, {"id": f"{SET}_s4"}]}
    (sets / f"{SET}.generated.json").write_text(json.dumps(generated), encoding="utf-8")
    active = tmp_path / "active_board.json"
    active.write_text(json.dumps({"set": SET, "video": {"scenes": [f"{SET}_s1"]}}), encoding="utf-8")
    return sets, active


def _recorder(fail_on=None):
    calls = []

    def runner(argv):
        calls.append(list(argv))
        failed = fail_on and fail_on in argv
        return (1, "line a\nline b\nboom", 0.2) if failed else (0, "", 0.1)

    return calls, runner


@pytest.mark.core
@pytest.mark.parametrize("until", ["photos", "video", "export"])
def test_no_stage_ever_carries_a_paid_or_writing_flag(data, until):
    sets, active = data
    calls, runner = _recorder()
    result = run_set.run_chain(SET, until, runner=runner, comfy_ok=lambda: True, sets_dir=sets, active_path=active, workflows_dir=None)
    assert result["ok"] and calls
    assert not [a for argv in calls for a in argv if a in run_set.FORBIDDEN_FLAGS]
    with pytest.raises(ValueError):
        run_set.Stage("x", "run_board.py", ["photos", "--paid", "all"]).argv()


def test_chain_stops_at_the_first_failing_stage_and_reports_its_tail(data):
    sets, active = data
    calls, runner = _recorder(fail_on="build")
    result = run_set.run_chain(SET, "photos", runner=runner, comfy_ok=lambda: True, sets_dir=sets, active_path=active, workflows_dir=None)
    assert [s["name"] for s in result["stages"]] == ["plan", "build"] and len(calls) == 2
    assert not result["ok"] and result["failed"] == "build"
    text = run_set.format_report(result)
    assert "FAILED at stage build" in text and "boom" in text


def test_video_without_picks_stops_with_the_pick_message(data):
    sets, active = data
    active.write_text(json.dumps({"set": "another_set", "video": {"scenes": [f"{SET}_s1"]}}), encoding="utf-8")
    calls, runner = _recorder()
    result = run_set.run_chain(SET, "video", runner=runner, comfy_ok=lambda: True, sets_dir=sets, active_path=active, workflows_dir=None)
    assert not calls and result["failed"] == "pick"
    assert f"run director.py pick {SET} s2 s3 s6" in run_set.format_report(result)


def test_report_survives_unreadable_output_and_stays_within_the_chat_limit():
    stage = run_set.Stage("run_board photos", "run_board.py", ["photos"])
    assert "n/a" in run_set.summarise(stage, "garbage without the known lines")
    stages = [{"name": f"s{i}", "command": "c", "exit": 0, "seconds": 1, "output": "!! warning %d" % i, "summary": run_set.NA} for i in range(40)]
    result = {"set": SET, "until": "photos", "stages": stages, "ok": True, "failed": None, "messages": [], "next": "do this", "seconds": 1}
    shown = run_set.format_report(result, run_set.MAX_STDOUT_LINES).splitlines()
    assert len(shown) <= run_set.MAX_STDOUT_LINES and shown[-1] == "next step: do this"


def test_stale_board_stops_before_run_board(data, tmp_path):
    """10.11: a dry run of Listing 11 had run the board file of Listing 7: the board must hold THIS set or nothing runs."""
    sets, active = data
    (tmp_path / "moonbloom_photos_api.json").write_text('{"1": {"title": "other_set_s1_gaze"}}', encoding="utf-8")
    calls, runner = _recorder()
    result = run_set.run_chain(SET, "photos", runner=runner, comfy_ok=lambda: True, sets_dir=sets, active_path=active, workflows_dir=tmp_path)
    assert not result["ok"] and result["failed"] == "board"
    assert not any("run_board.py" in " ".join(argv) for argv in calls)
    assert any("build_comfy_workflows.py" in " ".join(argv) for argv in calls)
