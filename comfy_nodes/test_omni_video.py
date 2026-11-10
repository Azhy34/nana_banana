"""Offline tests for the Gemini Omni 1.2 Flash video path (reels_pipeline/omni_video_bridge.py, the MoonbloomKieOmniVideo node, its price in bridge_logic.max_credits,
the explicit clips of the video board). No ComfyUI, no KIE, no credits: the price text and the client are stand-ins.

Run: py -3.12 -X utf8 -m pytest comfy_nodes/test_omni_video.py -o addopts="" -q     (pytest.ini keeps only `core` tests by default)
"""

import importlib.util
import math
from pathlib import Path
from types import SimpleNamespace

import pytest

from comfy_nodes import bridge_logic
from comfy_nodes import moonbloom_nodes as nodes
from reels_pipeline import live_price
from reels_pipeline import omni_video_bridge as ob

ROOT = Path(__file__).resolve().parent.parent
PRICE_TEXT = "- 360P: 4 credits/s ($0.02) - 720P: 9 credits/s ($0.045) - 1080P: 10 credits/s ($0.05) - 4K: 22 credits/s ($0.11) Billed per second of output."
PROMPT = "Locked-off camera on a tripod. Fine dust drifts through the sunbeam. The mural on the wall stays perfectly still and unchanged."


def test_the_price_text_of_kie_is_read_per_resolution_and_an_ambiguous_text_is_never_guessed():
    assert live_price.parse_omni_per_second(PRICE_TEXT) == {"360p": 4, "720p": 9, "1080p": 10, "4k": 22}
    assert live_price.parse_omni_per_second("720P: 9 credits/s and 720P: 12 credits/s") == {}      # one label, two rates: no quote with money
    assert live_price.parse_omni_per_second("63 credits per video") == {}                          # a per-clip text (Omni 1.1) is not a per-second quote


def test_a_request_is_built_from_the_schema_in_the_two_modes_and_rules_are_checked_locally():
    body = ob.build_input(PROMPT, "https://x/a.jpg", "720p", 5)
    assert body == {"prompt": PROMPT, "duration": 5, "aspect_ratio": "9:16", "resolution": "720p", "first_frame_url": "https://x/a.jpg"}
    assert ob.build_input(PROMPT, "https://x/a.jpg", "720p", 6, "https://x/b.jpg", seed=12345)["last_frame_url"] == "https://x/b.jpg"
    assert ob.problems_of(PROMPT, "720p", 5) == [] and ob.problems_of(PROMPT, "1080p", 10, with_last_frame=True) == []
    assert any("takes 3-10" in p for p in ob.problems_of(PROMPT, "720p", 12, with_last_frame=True))     # first + last frame: 3-10 s
    assert ob.problems_of(PROMPT, "720p", 12) == []                                                      # first frame only: up to 15 s
    assert any("360p" in p for p in ob.problems_of(PROMPT, "360p", 5))                                  # the owner never uses 360p
    assert any("control tag" in p for p in ob.problems_of("<FIRST_FRAME> a room", "720p", 5))           # Google: deprecated control tags
    assert any("control tag" in p for p in ob.problems_of("@image_1 a room", "720p", 5))
    assert any("quotation" in p for p in ob.problems_of('She says "hello"', "720p", 5))                 # a quoted line would be SPOKEN
    assert any("seed" in p for p in ob.problems_of(PROMPT, "720p", 5, seed=5))
    assert ob.clip_name("l11_b5c_omni", "720p", 5) != ob.clip_name("l11_b5c_omni", "720p", 5, last_frame=True)   # another mode is another file


def test_the_node_is_registered_offers_no_360p_and_a_dry_run_always_runs_again():
    cls = nodes.NODE_CLASS_MAPPINGS["MoonbloomKieOmniVideo"]
    required = cls.INPUT_TYPES()["required"]
    assert required["resolution"][0] == ["720p", "1080p", "4k"] and required["duration"][1]["min"] == 3 and required["duration"][1]["max"] == 15
    assert required["dry_run"][1]["default"] is True                                                    # every paid node starts as a free dry run
    assert math.isnan(cls.IS_CHANGED(dry_run=True)) and cls.IS_CHANGED(dry_run=False) == nodes.CODE_STAMP
    assert "MoonbloomKieOmniVideo" in bridge_logic.PAID_NODES


@pytest.mark.core
def test_a_paid_omni_node_is_priced_live_and_a_dry_run_or_an_existing_file_costs_nothing(monkeypatch, tmp_path):
    monkeypatch.setattr(live_price, "fetch_pricing_desc", lambda model, attempts=3: PRICE_TEXT)
    inputs = {"image_path": "a.png", "scene_id": "clip", "out_dir": str(tmp_path), "listing": "L", "resolution": "720p", "duration": 5, "min_motion_delta": 2.0,
              "reuse_existing": True, "dry_run": False, "prompt_override": PROMPT}
    graph = {"1": {"class_type": "MoonbloomKieOmniVideo", "inputs": dict(inputs)}}
    assert bridge_logic.max_credits(graph) == 45                                                         # 9 credits a second x 5 s, the live rate
    graph["1"]["inputs"].update(resolution="1080p", duration=6)
    assert bridge_logic.max_credits(graph) == 60
    graph["1"]["inputs"]["dry_run"] = True
    assert bridge_logic.max_credits(graph) == 0                                                          # a dry run is free
    graph["1"]["inputs"].update(dry_run=False, resolution="720p", duration=5)
    (tmp_path / ob.clip_name("clip", "720p", 5)).write_bytes(b"x")
    assert bridge_logic.max_credits(graph) == 0                                                          # the clip is on disk: reused, free
    (tmp_path / ob.clip_name("clip", "720p", 5)).unlink()
    monkeypatch.setattr(live_price, "fetch_pricing_desc", lambda model, attempts=3: "63 credits per video")
    assert bridge_logic.max_credits(graph) is None                                                       # a price we cannot read: the run is refused, never guessed


@pytest.mark.core
def test_the_bridge_dry_run_quotes_and_refuses_without_uploading_or_creating_a_task(monkeypatch, tmp_path):
    monkeypatch.setattr(live_price, "fetch_pricing_desc", lambda model, attempts=3: PRICE_TEXT)
    monkeypatch.setattr(ob.TelemetryLogger, "log_event", staticmethod(lambda **kw: None))

    class Client:
        def get_credits(self):
            return SimpleNamespace(success=True, data=SimpleNamespace(data=141.0))

        def upload_file(self, *a, **k):
            raise AssertionError("a dry run must not upload")

        def create_task(self, *a, **k):
            raise AssertionError("a dry run must not create a task")

    bridge = ob.OmniVideoBridge.__new__(ob.OmniVideoBridge)
    bridge.client, bridge.last_result = Client(), {}
    first, last = tmp_path / "a.png", tmp_path / "b.png"
    first.write_bytes(b"x"), last.write_bytes(b"x")
    bridge.animate(first, tmp_path / "o.mp4", PROMPT, resolution="720p", duration=6, last_image_path=last, dry_run=True)
    assert bridge.last_result["expected_credits"] == 54 and bridge.last_result["mode"] == "first+last frame" and bridge.last_result["balance_before"] == 141.0
    with pytest.raises(RuntimeError, match="360p"):
        bridge.animate(first, tmp_path / "o.mp4", PROMPT, resolution="360p", duration=5, dry_run=True)
    monkeypatch.setattr(live_price, "fetch_pricing_desc", lambda model, attempts=3: "")
    with pytest.raises(RuntimeError, match="price could not be read"):
        bridge.animate(first, tmp_path / "o.mp4", PROMPT, resolution="720p", duration=5, dry_run=False)   # unknown price: nothing is spent
    bridge.client.get_credits = lambda: SimpleNamespace(success=True, data=SimpleNamespace(data=10.0))
    monkeypatch.setattr(live_price, "fetch_pricing_desc", lambda model, attempts=3: PRICE_TEXT)
    with pytest.raises(RuntimeError, match="below"):
        bridge.animate(first, tmp_path / "o.mp4", PROMPT, resolution="720p", duration=5, dry_run=False)   # the balance does not cover it


def test_the_video_board_puts_kling_and_omni_on_the_same_frame_and_both_start_as_a_dry_run():
    spec = importlib.util.spec_from_file_location("build_comfy_workflows", ROOT / "scripts" / "build_comfy_workflows.py")
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    active = {"video": {"scenes": [], "video_spec": "listing11_video.json", "explicit_clips": [
        {"id": "k", "model": "kling26", "image": "a.png", "out_dir": "out", "duration": 5, "prompt": PROMPT},
        {"id": "o", "model": "omni12", "image": "a.png", "last_image": "b.png", "out_dir": "out", "duration": 6, "resolution": "720p", "prompt": PROMPT},
    ]}}
    graph = builder.video_board(active)
    by_class = {v["class_type"]: v["inputs"] for v in graph.values() if v["class_type"] != "PreviewAny"}
    assert set(by_class) == {"MoonbloomKieKling", "MoonbloomKieOmniVideo"}
    assert by_class["MoonbloomKieKling"]["dry_run"] is True and by_class["MoonbloomKieOmniVideo"]["dry_run"] is True      # a board never starts paid
    assert by_class["MoonbloomKieKling"]["image_path"] == by_class["MoonbloomKieOmniVideo"]["image_path"] == "a.png"        # the SAME frame: a fair comparison
    assert by_class["MoonbloomKieOmniVideo"]["last_image_path"] == "b.png"
    builder.check("test", graph)                                                                                            # classes, required inputs, link types
    active["video"]["explicit_clips"][0]["model"] = "veo"
    with pytest.raises(ValueError, match="not 'kling26' or 'omni12'"):
        builder.video_board(active)
