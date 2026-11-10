"""Acceptance tests of the Grok video node (new node, once): request shape, live quote by resolution, paid-path guard. No network, no credits."""

import pytest

from comfy_nodes import bridge_logic
from comfy_nodes import moonbloom_nodes as nodes
from reels_pipeline import grok_video_bridge as gv
from reels_pipeline import live_price

PREVIEW_TEXT = ("2.4 credits per second for 480p (≈ $0.012), 4.5 credits per second for 720p (≈ $0.0225), "
                "8 credits per second for 720p (≈ $0.04)— video generation is about 90% of official pricing.")
PREVIEW_TEXT_NEW = ("480p: 2.4 credits per second (≈ $0.012), 720p: 4.5 credits per second (≈ $0.0225), "
                    "1080p: 8 credits per second (≈ $0.04) — approximately 84% below official pricing.")   # KIE reworded it on 08.11
STABLE_TEXT = "• 480p Output: 2.4 credits / sec        • 720p Output: 4.5 credits / sec       • 1080p Output: 8 credits / sec"


def test_per_second_price_is_read_from_both_kie_wordings():
    want = {"480p": 2.4, "720p": 4.5, "1080p": 8}
    assert live_price.parse_per_second(PREVIEW_TEXT)[0] == want       # 720p named twice: read by position
    assert live_price.parse_per_second(STABLE_TEXT) == (want, "")
    assert live_price.parse_per_second(PREVIEW_TEXT_NEW) == (want, "")      # the reworded text: unambiguous, no position guess, no note
    assert live_price.parse_per_second("63 credits per video") == ({}, "")
    assert live_price.parse_per_second("4 credits per second for 480p, 9 credits per second for 480p")[0] == {}  # ambiguous: never guessed


def test_request_matches_each_models_own_schema():
    p = gv.build_input(gv.PREVIEW, "a child walks", "https://x/y.jpg", "1080p", 5)
    assert p["resolution"] == "1080p" and p["aspect_ratio"] == "9:16" and p["duration"] == 5 and p["enable_audio"] is False
    s = gv.build_input(gv.STABLE, "a child walks", "https://x/y.jpg", "720p", 6)
    assert s["duration"] == "6" and "enable_audio" not in s
    assert gv.problems_of(gv.PREVIEW, "p", "720p", 5) == []
    assert gv.problems_of(gv.STABLE, "p", "720p", 6) == []
    assert gv.problems_of(gv.STABLE, "p", "720p", 5)                   # the older model takes 6-30 s
    assert gv.problems_of(gv.PREVIEW, "p", "4k", 5)                    # not a resolution of the model
    assert gv.problems_of(gv.PREVIEW, "x" * 5000, "720p", 5)           # prompt over 4096


@pytest.mark.core
def test_grok_node_is_priced_by_resolution_and_a_dry_run_is_free(monkeypatch, tmp_path):
    monkeypatch.setattr(live_price, "fetch_pricing_desc", lambda model, attempts=3: PREVIEW_TEXT)
    graph = {"1": {"class_type": bridge_logic.GROK_VIDEO_NODE, "inputs": {
        "scene_id": "s", "out_dir": str(tmp_path), "model": gv.PREVIEW, "resolution": "1080p", "duration": 5, "dry_run": True, "reuse_existing": True}}}
    assert bridge_logic.max_credits(graph) == 0                         # dry run: free
    graph["1"]["inputs"]["dry_run"] = False
    assert bridge_logic.max_credits(graph) == 40                        # 8 credits x 5 s, the number the owner must confirm
    graph["1"]["inputs"]["resolution"] = "720p"
    assert bridge_logic.max_credits(graph) == 22.5
    (tmp_path / gv.clip_name("s", gv.PREVIEW, "720p", 5)).write_bytes(b"clip")
    assert bridge_logic.max_credits(graph) == 0                         # the clip is on disk: reuse_existing, nothing to pay
    monkeypatch.setattr(live_price, "fetch_pricing_desc", lambda model, attempts=3: "no per-second price here")
    graph["1"]["inputs"]["reuse_existing"] = False
    assert bridge_logic.max_credits(graph) is None                      # cannot be priced: the bridge refuses to run


@pytest.mark.core
def test_the_grok_video_node_is_not_registered_any_more():
    # the owner threw Grok video out on 08.11: the node must not appear in ComfyUI (it stays in the file only as an archive)
    assert "MoonbloomKieGrokVideo" not in nodes.NODE_CLASS_MAPPINGS
    assert "MoonbloomKieGrokVideo" not in nodes.NODE_DISPLAY_NAME_MAPPINGS
