"""Offline tests (no ComfyUI, no KIE, no credits) of the two one-command tools: scripts/run_board.py (reels_pipeline/board_run.py) and
scripts/add_model.py (reels_pipeline/onboarding.py).

Run: py -3.12 -X utf8 -m pytest comfy_nodes -q
"""

import json
from pathlib import Path
from types import SimpleNamespace as NS

import pytest
from PIL import Image

from reels_pipeline import board_run, onboarding
from reels_pipeline import kie_capabilities as caps

GPT, GROK, BANANA, KLING = "gpt-image-2-image-to-image", "grok-imagine-image-2-0/image-edit", "nano-banana-2-1", "kling-2.6/image-to-video"


# ------------------------------------------------------------------ board_run: the money gate

@pytest.mark.parametrize("credits, confirm, expected", [
    (None, 18, "cannot be priced"),                      # a paid node without a readable price: refused whatever the number
    (18.0, None, "--confirm 18"),                        # no number: the quote is shown, nothing starts
    (18.0, 17.0, "live quote is 18"),                    # a wrong number: nothing starts
    (18.0, 18.0, None),                                  # the number equals the live quote: go
    (0.0, None, None),                                   # nothing to pay (all files exist or all dry runs): no number needed
])
@pytest.mark.core
def test_a_paid_run_starts_only_when_the_confirmed_number_equals_the_live_quote(credits, confirm, expected):
    problem = board_run.check_confirm(credits, confirm)
    assert (problem is None) if expected is None else (expected in problem)


@pytest.mark.core
def test_the_quote_counts_the_paid_nodes_of_a_real_board(monkeypatch):
    from comfy_nodes import bridge_logic

    graph = board_run.load_graph("photos")
    ids = board_run.paid_node_ids(graph)
    assert ids and all(graph[i]["class_type"] in bridge_logic.PAID_NODES for i in ids)
    seen = {}
    monkeypatch.setattr(bridge_logic, "max_credits", lambda g: seen.update(dry=[v["inputs"]["dry_run"] for k, v in g.items() if k in ids]) or 7.0)
    assert board_run.quote(graph, ids) == 7.0 and seen["dry"] == [False] * len(ids)     # the quote is asked for the board with the nodes switched to paid
    assert all(graph[i]["inputs"]["dry_run"] is True for i in ids)                      # ... and the board itself is not changed


# ------------------------------------------------------------------ board_run: reading what the nodes made

REPORTS = {
    "dry": {"ok": True, "dry_run": True, "model": GPT, "expected_credits": 10, "balance": 809.0, "schema_problems": [],
            "request_preview": {"prompt": {"chars_sent": 1762}}},
    "paid": {"ok": True, "model": BANANA, "credits_spent": 6.0, "balance_before": 809.0, "balance_after": 803.0, "output_px": [1696, 2528],
             "duration_s": 41.0, "out_path": "C:/x/scene__nb21.png", "billing_warning": None},
    "reused": {"ok": True, "reused": True, "path": "C:/x/scene__gpt2.png"},
}


def test_describe_turns_a_node_report_into_one_flat_row():
    dry = board_run.describe("12", json.dumps(REPORTS["dry"]))
    assert (dry["mode"], dry["credits"], dry["prompt_chars"], dry["balance"]) == ("dry run", 10, 1762, 809.0)
    paid = board_run.describe("7", json.dumps(REPORTS["paid"]))
    assert (paid["mode"], paid["credits"], paid["px"], paid["balance"], paid["file"]) == ("paid", 6.0, [1696, 2528], 803.0, "C:/x/scene__nb21.png")
    assert board_run.describe("9", json.dumps(REPORTS["reused"]))["mode"] == "reused"
    assert board_run.describe("4", "Create a photorealistic photograph of a room") is None      # a prompt window is not a report
    assert board_run.describe("4", "{not json") is None


def test_read_results_and_the_table_name_the_error_and_the_spend():
    run = {"status": {"status_str": "success", "completed": True, "messages": []},
           "outputs": {"4": {"text": ["a prompt window"]}, "12": {"text": [json.dumps(REPORTS["paid"])]}, "7": {"text": [json.dumps(REPORTS["dry"])]}}}
    result = board_run.read_results(run)
    assert [r["node"] for r in result["rows"]] == ["7", "12"] and result["error"] is None            # sorted by node id, the prompt window skipped
    table = board_run.format_table(result)
    assert "paid" in table and "dry run" in table and "spent 6 credits, balance now 803" in table and "scene__nb21.png" in table
    failed = {"status": {"status_str": "error", "completed": False, "messages": [
        ["execution_error", {"node_type": "MoonbloomKieGrokImagineEdit", "exception_message": "KIE image failed: [500] internal error\n"}]]}, "outputs": {}}
    err = board_run.read_results(failed)
    assert err["error"].startswith("MoonbloomKieGrokImagineEdit: KIE image failed") and "ERROR" in board_run.format_table(err)


def test_a_stale_node_object_gets_the_hint_to_reload():
    assert "--reload" in board_run.hint_for("MoonbloomDesign: build() got an unexpected keyword argument 'brief_product'")
    assert board_run.hint_for("KIE image failed: [500]") is None and board_run.hint_for(None) is None


def test_the_contact_sheet_goes_to_the_temp_folder_and_needs_finished_files(tmp_path):
    a, b = tmp_path / "a__nb21.png", tmp_path / "b__gpt2.png"
    Image.new("RGB", (40, 60), (200, 150, 170)).save(a)
    Image.new("RGB", (60, 40), (150, 170, 200)).save(b)
    rows = [{"file": str(a), "model": BANANA}, {"file": str(b), "model": GPT}, {"file": str(tmp_path / "missing.png"), "model": GROK}, {"file": None, "model": GROK}]
    out = board_run.contact_sheet(rows, tmp_path / "sheet.jpg", height=100)
    assert out == tmp_path / "sheet.jpg" and Image.open(out).size[1] == 134                       # two tiles of the existing files, one 100 px row + a label strip
    assert board_run.contact_sheet([{"file": None, "model": GROK}]) is None                         # nothing finished: no sheet


def test_wait_sees_a_fast_free_run_that_ends_between_two_polls(monkeypatch):
    """The bug that hung the first version: waiting for 'the queue was busy' never ends when the run is shorter than one poll."""
    answers = {"/history": iter(["old", "old", "new", "new"]), "/queue": iter([{"queue_running": [], "queue_pending": []}] * 4)}

    def fake_get(url, timeout=0):
        key = "/history" if "/history" in url else "/queue"
        item = next(answers[key])
        return NS(json=lambda: {item: {}} if key == "/history" else item)

    monkeypatch.setattr(board_run.requests, "get", fake_get)
    monkeypatch.setattr(board_run.time, "sleep", lambda s: None)
    assert board_run.wait_queue("old", timeout=30) >= 0                                             # a NEW run id in the history, queue empty: done
    monkeypatch.setattr(board_run.requests, "get", lambda url, timeout=0: NS(json=lambda: {"old": {}} if "/history" in url else {"queue_running": [], "queue_pending": []}))
    clock = iter(range(0, 100, 20))
    monkeypatch.setattr(board_run.time, "time", lambda: next(clock))
    with pytest.raises(TimeoutError):                                                               # no new run ever appears: stops, does not hang
        board_run.wait_queue("old", timeout=30)


# ------------------------------------------------------------------ onboarding: can the pipeline use the model?

def test_the_models_we_already_use_are_ready_and_a_video_model_is_not():
    for model in (BANANA, GPT, GROK):
        report = onboarding.assess(model)
        assert report["ready"] and report["blockers"] == [], model
    assert any("no 4:3" in w or "'4:3'" in w for w in onboarding.assess(GROK)["warnings"])          # Grok has no 4:3: said, not hidden
    assert any("no resolution field" in w for w in onboarding.assess(GROK)["warnings"])
    video = onboarding.assess(KLING)
    assert not video["ready"] and any("VIDEO model" in b for b in video["blockers"])              # it has an image array too: only its duration / sound give it away


def _fake_schema(tmp_path, model, properties, required):
    doc = {"model": model, "openapi": {"paths": {caps.CREATE_TASK: {"post": {"requestBody": {"content": {"application/json": {"schema": {
        "properties": {"input": {"properties": properties, "required": required}}}}}}}}}}}
    (tmp_path / f"{model.replace('/', '__')}.schema.json").write_text(json.dumps(doc), encoding="utf-8")


def test_the_blockers_are_found_in_the_schema_not_at_a_paid_run(tmp_path, monkeypatch):
    monkeypatch.setattr(caps, "SCHEMA_DIR", tmp_path)
    refs = {"type": "array", "items": {"type": "string"}, "maxItems": 10}
    ratios = {"type": "string", "enum": ["1:1", "2:3", "9:16"]}
    _fake_schema(tmp_path, "fake/quality", {"prompt": {"type": "string", "maxLength": 5000}, "image_urls": refs, "aspect_ratio": ratios,
                                          "quality": {"type": "string", "enum": ["basic", "high"]}}, ["prompt", "image_urls", "quality"])
    r = onboarding.assess("fake/quality", {})
    assert not r["ready"] and any("'quality'" in b for b in r["blockers"])                            # a required field the factory does not know
    assert any("full prompt" in w and "brief" in w for w in r["warnings"]) and any("cannot be quoted" in w for w in r["warnings"])
    assert any("'4:3'" in w for w in r["warnings"])
    _fake_schema(tmp_path, "fake/small", {"prompt": {"type": "string", "maxLength": 800}, "image_urls": {**refs, "maxItems": 1},
                                        "resolution": {"type": "string", "enum": ["1K"]}, "aspect_ratio": {"type": "string", "enum": ["1:1"]}}, ["prompt"])
    text = " | ".join(onboarding.assess("fake/small")["blockers"])
    for expected in ("none of our formats", "no 2K", "does not fit", "takes only 1 reference"):
        assert expected in text, expected


def test_register_writes_the_three_lines_and_refuses_duplicates():
    models = 'KIE_MODELS: List[str] = [\n    "a",  # photo\n    "b",\n]\n'
    generator = ('MODEL_TAG = {"a": "aa", "b": "bb"}\nOTHER_IMAGE_NODES = {"MoonbloomKieB": "b"}\n')
    new = onboarding.register(models, generator, "vendor/new-model", "MoonbloomKieNewModel", "nm")
    assert '    "vendor/new-model",\n]' in new["kie_models"]
    assert '"vendor/new-model": "nm"}' in new["generator"] and '"MoonbloomKieNewModel": "vendor/new-model"}' in new["generator"]
    for args, message in ((("b", "MoonbloomKieZ", "zz"), "already registered"), (("c", "MoonbloomKieB", "cc"), "already exists"),
                          (("c", "MoonbloomKieC", "bb"), "tag")):
        with pytest.raises(ValueError, match=message):
            onboarding.register(models, generator, *args)
    with pytest.raises(RuntimeError, match="registry blocks"):
        onboarding.register("nothing here", "nothing here", "x/y", "MoonbloomKieXY", "xy")
    assert onboarding.node_class_for("gpt-image-2-image-to-image") == "MoonbloomKieGptImage2ImageToImage"


def test_the_real_registry_files_still_have_the_shape_register_edits():
    root = Path(__file__).resolve().parent.parent
    new = onboarding.register((root / "api_truth" / "refresh_api_truth.py").read_text(encoding="utf-8"),
                              (root / "reels_pipeline" / "kie_generator.py").read_text(encoding="utf-8"), "vendor/probe", "MoonbloomKieProbe", "prb")
    compile(new["generator"], "kie_generator.py", "exec")                                              # the edited text is still valid Python
    compile(new["kie_models"], "refresh_api_truth.py", "exec")
    assert '"MoonbloomKieProbe": "vendor/probe"' in new["generator"] and '"vendor/probe",' in new["kie_models"]
