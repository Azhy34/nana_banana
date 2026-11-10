"""Offline tests for the Kling node, the one-board workflow, the bridge pricing and the face rule
(no ComfyUI, no KIE, no credits).

Run: py -3.12 -X utf8 -m pytest comfy_nodes -q
"""

import importlib.util
import json
from pathlib import Path

import pytest
from PIL import Image

from comfy_nodes import bridge_logic
from comfy_nodes import moonbloom_nodes as nodes
from reels_pipeline import kling_bridge, live_price
from reels_pipeline.kling_bridge import CREDITS, KlingBridge
from reels_pipeline.prompts import build_batch_prompts, clip_prompt

ROOT = Path(__file__).resolve().parent.parent
VIDEO_SPEC = json.loads((ROOT / "specs" / "listing45_video.json").read_text(encoding="utf-8"))
INTERIORS_SPEC = json.loads((ROOT / "specs" / "listing45_interiors.json").read_text(encoding="utf-8"))
CLIPS = VIDEO_SPEC["frames"]
SCENES = [f["scene_id"] for f in CLIPS]

# Rules of .agents/skills/creative-ad-auditor: camera bans, no motion verbs attached to furniture, and the owner's 04.11
# decision that a plain zoom/push-in is not ordered from Kling.
BANNED = ("pedestal", "crane up", "tilt up", "gliding", "sliding", "rolling", "passing", "orbit", "pan left", "pan right",
          "zoom", "push-in", "dolly in")


def _builder():
    spec = importlib.util.spec_from_file_location("build_comfy_workflows", ROOT / "scripts" / "build_comfy_workflows.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _board_in(tmp_path):
    """The real board, with the wallpaper folder redirected to a scratch folder (prices depend on files on disk)."""
    b = _builder()
    board = b.designs(False, "nano-banana-2-1", b.GIRL_CARDS + b.IDEA_CARDS + b.FINAL_CARDS, video=True)
    board["1"]["inputs"]["out_dir"] = str(tmp_path)
    return b, board


def _kling_ids(board):
    return [k for k, v in board.items() if v["class_type"] == "MoonbloomKieKling"]


def _scene_of(board, node_id):
    return board[board[node_id]["inputs"]["scene_id"][0]]["inputs"]["scene_id"]


def _make_all_frames(tmp_path, b):
    for card in b.GIRL_CARDS + b.IDEA_CARDS + b.FINAL_CARDS:
        (tmp_path / f"{card}__nb21.png").write_bytes(b"frame")


# ------------------------------------------------------------------ the node

def test_preview_video_ui_copies_the_clip_and_has_the_official_shape(tmp_path):
    clip = tmp_path / "scene__kling26_pushin_9x16.mp4"
    clip.write_bytes(b"not a real mp4, only the copy is tested")
    ui = nodes._preview_video_ui(clip)
    assert ui["animated"] == (True,)
    assert ui["images"][0] == {"filename": clip.name, "subfolder": "moonbloom", "type": "temp"}
    assert (Path(nodes.tempfile.gettempdir()) / "moonbloom" / clip.name).read_bytes() == clip.read_bytes()


@pytest.mark.core
def test_a_dry_run_is_never_served_from_the_cache_but_a_paid_run_is():
    import math
    assert math.isnan(nodes.MoonbloomKieKling.IS_CHANGED(dry_run=True, scene_id="x"))   # NaN != NaN: ComfyUI runs it again
    assert nodes.MoonbloomKieKling.IS_CHANGED(dry_run=False, scene_id="x") == nodes.CODE_STAMP  # same inputs: no second spend


def test_image_file_node_loads_a_frame_and_passes_the_path(tmp_path):
    frame = tmp_path / "frame.png"
    Image.new("RGB", (48, 64), (200, 120, 160)).save(frame)
    image, path = nodes.MoonbloomImageFile().load(str(frame))
    assert tuple(image.shape) == (1, 64, 48, 3) and path == str(frame)
    with pytest.raises(FileNotFoundError):
        nodes.MoonbloomImageFile().load(str(tmp_path / "missing.png"))


# ------------------------------------------------------------------ the two clips (real motion, faces never shown)

@pytest.mark.parametrize("clip", CLIPS, ids=lambda f: f["scene_id"])
def test_each_clip_prompt_follows_the_rules_and_fits_kie(clip):
    positive = clip_prompt(clip, VIDEO_SPEC)
    assert len(positive) <= 2500, "KIE Kling 2.6 prompt limit"
    lowered = positive.lower()
    assert not [w for w in BANNED if w in lowered], "banned camera move, zoom or motion verb in the prompt"
    assert "inanimate 2d ink lock" in lowered and "furniture lock" in lowered
    assert "painted figure skater" in lowered                     # the product's hero is named and locked
    bridge = KlingBridge.__new__(KlingBridge)  # no client, no key; the request must pass the KIE schema model
    bridge.build_request("https://example.invalid/frame.jpg", positive, VIDEO_SPEC["duration"], VIDEO_SPEC["sound"])


@pytest.mark.core
def test_clip_with_a_person_never_shows_the_face_and_keeps_the_camera_still():
    clip = next(f for f in CLIPS if f["scene_id"] == "l45_scene_06_entering_door")
    lowered = clip_prompt(clip, VIDEO_SPEC).lower()
    assert "face is never visible" in lowered and "not even in profile" in lowered
    assert "does not move at all" in lowered                          # locked-off camera: the motion is the person and the door
    assert "closed" in lowered and "door" in lowered


def test_walk_in_clip_is_a_parallax_move_with_a_subtle_light_effect():
    clip = next(f for f in CLIPS if f["scene_id"] == "l45_scene_08_side_depth")
    lowered = clip_prompt(clip, VIDEO_SPEC).lower()
    assert "first-person walk-in" in lowered and "parallax" in lowered
    assert "no sideways drift" in lowered                             # a drift to the right would invent the cropped mural
    assert "never covers the painted figure skater" in lowered and "never changes the colours" in lowered


# ------------------------------------------------------------------ the rule: faces are never shown (photos)

def _prompts(*ids):
    cards = [c for c in INTERIORS_SPEC["cards"] if c["id"] in ids]
    return {p["id"]: p["prompt"] for p in build_batch_prompts(cards, aspect_ratio="9:16")}


@pytest.mark.core
def test_face_terms_close_every_avoid_list_and_the_people_rule_is_added_for_a_person():
    prompts = _prompts("l45_scene_06_entering_door", "l45_scene_07_sun_shadows")
    for pid, text in prompts.items():
        assert text.rstrip().endswith("visible human face, face in profile, person looking at the camera, front view of a person.")
    woman = prompts["l45_scene_06_entering_door"]
    assert "PEOPLE RULE" in woman and "not even in profile" in woman
    assert woman.index("PEOPLE RULE") < woman.index(" Avoid:")           # the rule stays before the negative list
    assert "PEOPLE RULE" not in prompts["l45_scene_07_sun_shadows"]      # no person in this card: no rule sentence


# ------------------------------------------------------------------ one board, one workflow

def test_board_is_one_workflow_from_wallpaper_to_clips(tmp_path):
    b, board = _board_in(tmp_path)
    b.check("girl_board", board)
    classes = [v["class_type"] for v in board.values()]
    assert classes.count("MoonbloomWallpaper") == 1 and classes.count("MoonbloomDesign") == 7
    assert classes.count("MoonbloomKieImage") == 7 and classes.count("MoonbloomKieKling") == len(CLIPS) == 2
    assert sorted(_scene_of(board, k) for k in _kling_ids(board)) == sorted(SCENES)
    by_scene = {f["scene_id"]: f for f in CLIPS}
    for kling_id in _kling_ids(board):
        kling = board[kling_id]["inputs"]
        src_id, slot = kling["image_path"]                         # the clip is fed by the photo node, not by a typed path
        assert board[src_id]["class_type"] == "MoonbloomKieImage" and slot == 1
        assert kling["dry_run"] is True                            # a clip is never paid by default
        clip = by_scene[_scene_of(board, kling_id)]
        assert kling["prompt_override"] == clip_prompt(clip, VIDEO_SPEC) and kling["prompt_suffix"] == ""
        assert kling["min_motion_delta"] == clip["min_motion_delta"]


def test_spec_scenes_are_cards_of_the_interiors_spec():
    assert set(SCENES) <= {c["id"] for c in INTERIORS_SPEC["cards"]}


@pytest.mark.core
def test_price_is_zero_while_frames_exist_and_clips_are_dry(tmp_path):
    b, board = _board_in(tmp_path)
    _make_all_frames(tmp_path, b)
    assert bridge_logic.max_credits(board) == 0


@pytest.mark.core
def test_a_missing_frame_is_counted_as_a_paid_photo(tmp_path):
    b, board = _board_in(tmp_path)
    _make_all_frames(tmp_path, b)
    (tmp_path / f"{b.IDEA_CARDS[0]}__nb21.png").unlink()              # one of the seven frames is missing
    assert bridge_logic.max_credits(board) == 6


CLIP = CREDITS[("5", False)]   # one 5 s clip without sound; KIE changes this price, so the tests read the table, not a literal


@pytest.mark.core
def test_switching_one_clip_to_paid_costs_one_clip_and_two_cost_double(tmp_path):
    b, board = _board_in(tmp_path)
    _make_all_frames(tmp_path, b)
    first, second = _kling_ids(board)
    one = bridge_logic.apply_overrides(board, {first: {"dry_run": False}})
    assert bridge_logic.max_credits(one) == CLIP
    both = bridge_logic.apply_overrides(board, {first: {"dry_run": False}, second: {"dry_run": False}})
    assert bridge_logic.max_credits(both) == 2 * CLIP
    assert board[first]["inputs"]["dry_run"] is True                 # the original graph is not modified


@pytest.mark.core
def test_a_finished_clip_is_not_paid_again(tmp_path):
    b, board = _board_in(tmp_path)
    _make_all_frames(tmp_path, b)
    first, second = _kling_ids(board)
    (tmp_path / f"{_scene_of(board, first)}__kling26_pushin_9x16.mp4").write_bytes(b"clip")
    paid = bridge_logic.apply_overrides(board, {first: {"dry_run": False}, second: {"dry_run": False}})
    assert bridge_logic.max_credits(paid) == CLIP                       # the first clip exists, only the second costs


@pytest.mark.core
def test_overrides_refuse_anything_but_dry_run_of_a_paid_node(tmp_path):
    _, board = _board_in(tmp_path)
    kling = _kling_ids(board)[0]
    with pytest.raises(ValueError):
        bridge_logic.apply_overrides(board, {"999": {"dry_run": False}})               # unknown node
    with pytest.raises(ValueError):
        bridge_logic.apply_overrides(board, {"1": {"dry_run": False}})                 # not a paid node (Wallpaper)
    with pytest.raises(ValueError):
        bridge_logic.apply_overrides(board, {kling: {"duration": "10"}})               # other inputs are not overridable
    with pytest.raises(ValueError):
        bridge_logic.apply_overrides(board, {kling: {"dry_run": "false"}})             # must be a real boolean


@pytest.mark.core
def test_unknown_link_is_priced_conservatively():
    graph = {"1": {"class_type": "MoonbloomKieKling", "inputs": {
        "image_path": "x.png", "scene_id": ["404", 0], "out_dir": "nowhere", "duration": "5", "sound": False,
        "dry_run": False, "reuse_existing": True}}}
    assert bridge_logic.max_credits(graph) == CLIP                     # cannot locate the clip file: counted, never too low
    graph["1"]["inputs"]["sound"] = True
    assert bridge_logic.max_credits(graph) == CREDITS[("5", True)]
    graph["1"]["inputs"]["duration"] = "7"
    assert bridge_logic.max_credits(graph) is None                     # cannot be priced: the bridge refuses to run it


# ------------------------------------------------------------------ prices are read live from KIE (it changed 55 -> 63 on 04.11)

PRICING_DESC = ("5-second video: 63 credits ($0.315) without audio, 126 credits ($0.63) with audio. "
                "10-second video: 126 credits ($0.63) without audio, 252 credits ($1.26) with audio. Flat rate per video.")
IMAGE_DESC = "4 credits ($0.02) for 1K, 6 credits ($0.03) for 2K, and 9 credits ($0.045) for 4K - 1K/2K 40% below official pricing."


def _envelope(text, code=200, msg="success"):
    data = {"pricingDesc": text} if text else None
    return {"code": code, "msg": msg, "data": data}


@pytest.fixture(autouse=True)
def kie_price_text(monkeypatch):
    """No test touches the network or the key: requests.get answers with KIE's typed price envelope built from fixed
    text (a test can replace the text). The patch sits on requests itself because the hot-reload tests re-import
    reels_pipeline modules, and a patch on one module object would miss the fresh copy."""
    texts = {"kling": PRICING_DESC, "image": IMAGE_DESC}
    sent = {"headers": None}

    def fake_get(url, headers=None, **kwargs):
        sent["headers"] = headers
        text = texts["kling" if "kling" in url else "image"]
        return type("R", (), {"json": lambda self: _envelope(text)})()

    monkeypatch.setattr("requests.get", fake_get)
    monkeypatch.setattr("time.sleep", lambda s: None)
    texts["sent"] = sent
    return texts


def test_prices_are_parsed_from_the_kie_text():
    assert [live_price.parse_kling(PRICING_DESC, d, s) for d in ("5", "10") for s in (False, True)] == [63, 126, 126, 252]
    assert [live_price.parse_image(IMAGE_DESC, r) for r in ("1K", "2K", "4K")] == [4, 6, 9]
    assert live_price.parse_kling(PRICING_DESC, "7", False) is None            # not a length KIE sells
    assert live_price.parse_kling("a text without any price", "5", False) is None
    assert live_price.parse_image("Nano Banana 2 - 8 credits ($0.04) for 1 K, 12 credits ($0.06) for 2 K", "2K") == 12


def test_a_refusal_is_retried_and_reported_with_kies_own_message(monkeypatch):
    answers = [RuntimeError("reset"), _envelope("", code=429, msg="Too many requests"), _envelope(PRICING_DESC)]
    seen = []

    def fake_get(*args, **kwargs):
        seen.append(1)
        item = answers.pop(0) if answers else _envelope("", code=401, msg="Unauthorized - Authentication failed")
        if isinstance(item, Exception):
            raise item
        return type("R", (), {"json": lambda self: item})()

    monkeypatch.setattr("requests.get", fake_get)
    assert live_price.kling_credits("5", False) == 63 and len(seen) == 3        # two failures, the third attempt reads it
    assert live_price.last_error == ""
    assert live_price.kling_credits("5", False) is None                         # KIE refuses every time: unknown, not a guess
    assert "401" in live_price.last_error and "Unauthorized" in live_price.last_error
    credits, source = live_price.pick(None, 63)
    assert credits == 63 and "401" in source                                    # the owner sees why the fallback was used


def test_the_price_request_carries_the_owner_key(kie_price_text):
    import importlib
    config = importlib.import_module("reels_pipeline.config")
    original = config.PipelineConfig.get_kie_key
    config.PipelineConfig.get_kie_key = staticmethod(lambda: "test-key")
    try:
        assert live_price.kling_credits("5", False) == 63
    finally:
        config.PipelineConfig.get_kie_key = original
    assert kie_price_text["sent"]["headers"] == {"Authorization": "Bearer test-key"}   # KIE answers code 401 without it


def test_pick_says_where_the_number_came_from():
    assert live_price.pick(70, 63) == (70, "live")                              # the live price wins over the table
    credits, source = live_price.pick(None, 63)
    assert credits == 63 and source.startswith("table")


def test_billing_takes_kies_own_number_and_flags_a_different_quote():
    ok = live_price.billing(63.0, 924.0, 861.0, 63)                         # KIE's creditsConsumed, equal to the quote
    assert ok == {"billed": 63.0, "billed_source": "kie_task", "billing_warning": None}
    drift = live_price.billing(70.0, 924.0, 854.0, 63)                      # KIE billed more than the quote: say so
    assert drift["billed"] == 70.0 and "billed 70.0" in drift["billing_warning"] and "quote was 63" in drift["billing_warning"]
    fallback = live_price.billing(None, 924.0, 861.0, 63)                   # no creditsConsumed in the task: balance difference
    assert fallback["billed"] == 63.0 and fallback["billed_source"] == "balance_diff" and fallback["billing_warning"] is None
    assert live_price.billing(None, None, 861.0, 63) == {"billed": None, "billed_source": "unknown", "billing_warning": None}


@pytest.mark.core
def test_the_quote_follows_the_live_price_not_the_table(tmp_path, kie_price_text):
    b, board = _board_in(tmp_path)
    _make_all_frames(tmp_path, b)
    first, second = _kling_ids(board)
    kie_price_text["kling"] = PRICING_DESC.replace("63 credits", "70 credits")   # KIE raises the price again
    assert bridge_logic.max_credits(bridge_logic.apply_overrides(board, {first: {"dry_run": False}})) == 70
    kie_price_text["image"] = IMAGE_DESC.replace("6 credits", "7 credits")
    (tmp_path / f"{b.IDEA_CARDS[0]}__nb21.png").unlink()                        # one photo is missing: quoted at the live photo price
    assert bridge_logic.max_credits(board) == 7


@pytest.mark.core
def test_a_paid_clip_refuses_when_the_price_cannot_be_read(monkeypatch, tmp_path, kie_price_text):
    kie_price_text["kling"] = ""                                                # KIE does not answer
    bridge = KlingBridge.__new__(KlingBridge)
    bridge._balance = lambda: 1000.0
    bridge.client = type("C", (), {"upload_file": lambda *a, **k: pytest.fail("no upload without a known price")})()
    monkeypatch.setattr(kling_bridge.TelemetryLogger, "log_event", staticmethod(lambda **k: None))
    with pytest.raises(RuntimeError, match="price could not be read"):
        bridge.animate_interior_scene(tmp_path / "f.png", tmp_path / "o.mp4", prompt="p", dry_run=False)
    assert bridge.last_result["credits_spent"] is None
    bridge.animate_interior_scene(tmp_path / "f.png", tmp_path / "o.mp4", prompt="p", dry_run=True)  # a dry run still works, with a warning
    assert bridge.last_result["ok"] and "could not be read" in bridge.last_result["price_warning"]
    assert bridge.last_result["expected_credits"] == CLIP                       # fallback table value, flagged above


@pytest.mark.core
def test_a_dry_run_reports_the_live_price(monkeypatch, tmp_path, kie_price_text):
    kie_price_text["kling"] = PRICING_DESC.replace("63 credits", "70 credits")
    bridge = KlingBridge.__new__(KlingBridge)
    bridge._balance = lambda: 1000.0
    monkeypatch.setattr(kling_bridge.TelemetryLogger, "log_event", staticmethod(lambda **k: None))
    bridge.animate_interior_scene(tmp_path / "f.png", tmp_path / "o.mp4", prompt="p", dry_run=True)
    assert bridge.last_result["expected_credits"] == 70 and bridge.last_result["price_source"] == "live"


def test_all_real_workflow_files_are_valid():
    b = _builder()
    for f in sorted((ROOT / "workflows").glob("listing45_*_api.json")):
        b.check(f.name, json.loads(f.read_text(encoding="utf-8")))


# ------------------------------------------------------------------ the three idea cards

IDEA_IDS = ("l45_scene_06_entering_door", "l45_scene_07_sun_shadows", "l45_scene_08_side_depth")


def test_idea_cards_exist_in_the_builder():
    assert tuple(_builder().IDEA_CARDS) == IDEA_IDS


@pytest.mark.parametrize("card_id", IDEA_IDS)
def test_idea_cards_keep_the_girl_palette_and_the_mural_visible(card_id):
    card = next(c for c in INTERIORS_SPEC["cards"] if c["id"] == card_id)
    extra = card["extraPrompt"]
    assert card.get("cleanRandomDetails") is True
    assert "GIRL'S ROOM" in extra
    assert "no cobalt" in extra.lower() or "no saturated red" in extra.lower()
    assert "painted figure skater is fully visible" in extra          # the product stays unobstructed
    assert card["tags"]["compositionStrategy"] == "unobstructed"


# ------------------------------------------------------------------ the final frame of the reel (whole mural, age 6-10)

def test_final_frame_shows_the_whole_mural_for_school_age():
    card = next(c for c in INTERIORS_SPEC["cards"] if c["id"] == "l45_scene_09_full_mural_final")
    extra = card["extraPrompt"]
    assert card["ageGroup"] == "schulkind" and card["cleanRandomDetails"] is True
    assert card["tags"]["compositionStrategy"] == "unobstructed" and "middle of the long side wall" in card["tags"]["cameraAngle"]
    assert "ALL FOUR edges of the mural" in extra and "WHOLE wall is inside the frame" in extra and "Nothing stands in front of the mural" in extra
    assert "painted figure skater is fully visible" in extra and "no shadow or glare" in extra
    assert "NO BED" in extra and "no sofa" in extra                                   # owner 05.11: a bed is often out of scale, keep the room almost empty
    assert "figure-skating dress" in extra and "hanging on a wooden hanger" in extra and "not on the mural" in extra
    assert not any("bed" in a.lower() for a in card["tags"]["accessories"]) and "bed" not in card["tags"]["keyObject"].lower()
    assert _builder().FINAL_CARDS == ("l45_scene_09_full_mural_final", "l45_scene_10_full_mural_angle")


def test_angled_final_frame_is_airy_without_a_stool_and_not_frontal():
    card = next(c for c in INTERIORS_SPEC["cards"] if c["id"] == "l45_scene_10_full_mural_angle")
    extra = card["extraPrompt"]
    assert "35-40 degrees" in extra and "NOT frontal" in extra and "not a narrow box" in extra   # owner 05.11: frontal looked like a cage
    assert "NO BED" in extra and "NO STOOL" in extra and "figure-skating dress" in extra and "not on the mural" in extra
    assert "far left corner" in card["tags"]["cameraAngle"] and card["tags"]["compositionStrategy"] == "unobstructed"
    prompt = _prompts("l45_scene_10_full_mural_angle")["l45_scene_10_full_mural_angle"]
    assert "focal furniture piece" not in prompt and "Layout: ." not in prompt        # no "rug crafted from solid wood"
    assert "crafted from" not in prompt.split("Avoid:")[0]
    assert "globe" not in prompt and "pinboard" not in prompt and "cushion" not in prompt     # random lived-in extras of the app are cut


def test_the_design_node_offers_camera_lens_aperture_and_depth_and_a_card_can_pin_them():
    from comfy_nodes.moonbloom_nodes import NODE_CLASS_MAPPINGS
    optional = NODE_CLASS_MAPPINGS["MoonbloomDesign"].INPUT_TYPES()["optional"]
    for name in ("camera_body", "lens", "aperture", "depth_of_field"):
        assert name in optional and optional[name][0][0] == "random"          # optional + random by default: old boards still load
    assert "28mm gentle wide lens" in optional["lens"][0] and "Canon EOS R5" in optional["camera_body"][0]
    card = next(c for c in INTERIORS_SPEC["cards"] if c["id"] == "l45_scene_10_full_mural_angle")
    inputs = _builder().design_inputs(card, "9:16")
    assert (inputs["camera_body"], inputs["lens"], inputs["aperture"], inputs["depth_of_field"]) == (
        "Canon EOS R5", "28mm gentle wide lens", "f/8.0 aperture", "deep depth of field")
    for _ in range(3):                                                         # no longer random: the same camera line every build
        assert "Canon EOS R5, 28mm gentle wide lens, f/8" in _prompts("l45_scene_10_full_mural_angle")["l45_scene_10_full_mural_angle"]
    assert "lens" not in _builder().design_inputs(INTERIORS_SPEC["cards"][0], "9:16")   # cards that do not pin it stay random


# ------------------------------------------------------------------ the exact prompt of every picture is saved (owner 05.11)

def _fake_kie_client(tmp_path, fail=False):
    from types import SimpleNamespace as NS

    def poll_and_download(task_id, out_path, **kwargs):
        if fail:
            return NS(success=False, error=NS(msg="generation failed", code=501))
        Path(out_path).write_bytes(b"png")
        return NS(success=True)

    return NS(
        get_credits=lambda: NS(success=True, data=NS(data=900.0)),
        upload_file=lambda *a, **k: NS(success=True, data=NS(data=NS(download_url="https://cdn.example/ref.png"))),
        create_image_task=lambda req: NS(success=True, data=NS(data=NS(task_id="task_1"))),
        poll_and_download=poll_and_download,
        last_task_info={"credits_consumed": 6.0, "cost_time_s": 30},
    )


def _generator(tmp_path, monkeypatch, fail=False):
    from reels_pipeline import kie_generator

    gen = kie_generator.KieNanoBananaGenerator.__new__(kie_generator.KieNanoBananaGenerator)
    gen.client = _fake_kie_client(tmp_path, fail)
    gen._url_cache = {}
    gen.upload_reference = lambda path, tag: f"https://cdn.example/{tag}.png"   # no real upload or image preparation
    logged = []
    monkeypatch.setattr(kie_generator.TelemetryLogger, "log_event", staticmethod(lambda **k: logged.append(k)))
    return gen, logged


def test_every_picture_gets_a_prompt_file_and_the_journal_points_to_it(tmp_path, monkeypatch):
    gen, logged = _generator(tmp_path, monkeypatch)
    out = tmp_path / "scene_x__nb21.png"
    record = gen.generate_image(prompt="THE EXACT PROMPT with random picks", wallpaper=tmp_path / "w.png", out_path=out,
                                model="nano-banana-2-1", texture=tmp_path / "t.jpg", scene_id="scene_x")
    from reels_pipeline import kie_generator

    side = kie_generator.prompt_log_path(out)
    assert not out.with_suffix(".prompt.json").exists(), "the folder of the pictures holds pictures only"
    data = json.loads(side.read_text(encoding="utf-8"))
    assert record["ok"] and record["prompt_file"] == str(side)
    assert data["prompt"] == "THE EXACT PROMPT with random picks"
    assert data["prompt_sent_to_kie_prefix"].startswith("REFERENCE_IMAGE_1") and "THE EXACT PROMPT" not in data["prompt_sent_to_kie_prefix"], "the prompt is stored once"
    assert data["model"] == "nano-banana-2-1" and data["credits_spent"] == 6.0 and data["credits_source"] == "kie_task"
    assert data["references"]["texture"] == str(tmp_path / "t.jpg") and data["task_id"] == "task_1" and data["ok"] is True
    extra = logged[-1]["extra"]
    assert extra["prompt_file"] == str(side) and extra["prompt_sha256"] == data["prompt_sha256"]


def test_a_failed_picture_keeps_its_prompt_too(tmp_path, monkeypatch):
    gen, logged = _generator(tmp_path, monkeypatch, fail=True)
    record = gen.generate_image(prompt="PROMPT OF A FAILED RUN", wallpaper=tmp_path / "w.png", out_path=tmp_path / "f__nb21.png",
                                model="nano-banana-2-1", scene_id="f")
    from reels_pipeline import kie_generator

    data = json.loads(kie_generator.prompt_log_path(tmp_path / "f__nb21.png").read_text(encoding="utf-8"))
    assert record["ok"] is False and data["ok"] is False and "generation failed" in data["error"]
    assert data["prompt"] == "PROMPT OF A FAILED RUN"


def test_the_kie_image_node_defaults_to_the_cheaper_model():
    model = nodes.MoonbloomKieImage.INPUT_TYPES()["required"]["model"]
    assert model[1]["default"] == "nano-banana-2-1" and model[0][0] == "nano-banana-2-1"


# ------------------------------------------------------------------ two boards, one tab each (owner 05.11)

@pytest.fixture
def frames(tmp_path, monkeypatch):
    """A frames folder with a photo for each scene of the video board (and nothing else)."""
    folder = tmp_path / "frames"
    folder.mkdir()
    scenes = json.loads((ROOT / "specs" / "active_board.json").read_text(encoding="utf-8"))["video"]["scenes"]
    for scene in scenes + [f"pad{i}" for i in range(max(0, 2 - len(scenes)))]:  # the live board may hold one clip: the tests below need two frames
        Image.new("RGB", (60, 100), (210, 190, 200)).save(folder / f"{scene}__nb21.png")
    monkeypatch.setenv("MOONBLOOM_FRAMES_DIR", str(folder))
    return folder


def test_the_preview_is_a_thumbnail_but_the_file_on_disk_is_untouched(tmp_path):
    big = tmp_path / "big.png"
    Image.new("RGB", (1536, 2752), (200, 150, 170)).save(big)
    thumb = nodes._to_tensor(big, nodes.PREVIEW_MAX_SIDE)
    assert max(thumb.shape[1:3]) == nodes.PREVIEW_MAX_SIDE and thumb.shape[1] > thumb.shape[2]   # tall, long side shrunk
    assert tuple(nodes._to_tensor(big).shape) == (1, 2752, 1536, 3)                              # no max_side: full size
    assert Image.open(big).size == (1536, 2752)


def test_frame_picker_lists_newest_first_and_hands_over_the_photo(frames):
    older, newer = sorted(frames.glob("*.png"), key=lambda f: f.name)
    import os as _os
    _os.utime(older, (1_000_000, 1_000_000))
    _os.utime(newer, (2_000_000, 2_000_000))
    assert nodes.list_frames()[0] == newer.name
    image, path, scene_id, out_dir, listing = nodes.MoonbloomFramePicker().pick(newer.name)
    assert tuple(image.shape)[0] == 1 and path == str(newer) and scene_id == newer.stem.split("__")[0]
    assert out_dir == str(frames) and listing == "frames"
    outside = frames.parent / "outside__nb21.png"                                       # a photo that is NOT in the frames folder
    Image.new("RGB", (8, 8)).save(outside)
    for bad in ("../x.png", "missing.png", str(outside)):
        with pytest.raises(FileNotFoundError):
            nodes.MoonbloomFramePicker().pick(bad)


@pytest.mark.core
def test_the_two_boards_are_small_valid_and_have_fixed_tab_titles():
    b = _builder()
    active = b.load_active()
    photos, video = b.photos_board(), b.video_board()
    b.check("photos", photos)
    b.check("video", video)
    photo_classes = [v["class_type"] for v in photos.values()]
    assert photo_classes.count("MoonbloomDesign") == len(active["photos"]["cards"]) <= b.MAX_PHOTO_CHAINS   # one chain per card; a chain has a photo node per model
    assert "MoonbloomKieKling" not in photo_classes and "MoonbloomFramePicker" not in photo_classes   # photos only
    video_classes = [v["class_type"] for v in video.values()]
    explicit = active["video"].get("explicit_clips") or []        # clips of frame files by path and model (10.11): a Kling clip of them is a Kling node too
    assert len(active["video"]["scenes"]) <= b.MAX_VIDEO_CLIPS and len(explicit) <= b.MAX_EXPLICIT_CLIPS
    assert video_classes.count("MoonbloomKieKling") == len(active["video"]["scenes"]) + sum(c["model"] == "kling26" for c in explicit)
    assert video_classes.count("MoonbloomKieOmniVideo") == sum(c["model"] == "omni12" for c in explicit)
    assert not set(b.IMAGE_CLASSES) & set(video_classes) and "MoonbloomDesign" not in video_classes   # video only
    assert len(photos) <= b.MAX_PHOTO_BOARD_NODES and len(video) <= 10                                  # a small board on purpose (the old giant one had 34 nodes)
    assert bridge_logic.tab_title("moonbloom_photos_api.json") == "Moonbloom Фото"
    assert bridge_logic.tab_title("moonbloom_video_api.json") == "Moonbloom Видео"
    assert bridge_logic.tab_title("other_api.json") == "other"


@pytest.mark.core
def test_a_board_that_grows_past_its_limit_is_refused():
    b = _builder()
    too_many = {"photos": {"cards": ["a", "b", "c", "d"]}, "video": {"scenes": ["w", "x", "y", "z"]}}
    with pytest.raises(AssertionError):
        b.photos_board(too_many)
    with pytest.raises(AssertionError):
        b.video_board(too_many)


def test_every_kling_node_of_the_video_board_starts_free_and_is_fed_by_a_picker(frames):
    b = _builder()
    video = b.video_board()
    for kling_id in _kling_ids(video):
        kling = video[kling_id]["inputs"]
        assert kling["dry_run"] is True and kling["prompt_override"]
        if not isinstance(kling["image_path"], list):  # an explicit clip (10.11) names its frame file by path: no picker, and it must start free too
            continue
        picker_id, slot = kling["image_path"]
        assert video[picker_id]["class_type"] == "MoonbloomFramePicker" and slot == 1
        assert kling["scene_id"] == [picker_id, 2] and kling["out_dir"] == [picker_id, 3]


def test_video_board_prices_follow_the_picked_frame_and_finished_clips_cost_nothing(frames):
    b = _builder()
    board = json.loads((ROOT / "specs" / "active_board.json").read_text(encoding="utf-8"))
    video_cfg = board["video"]
    clips_known = [c["scene_id"] for c in b.active_set().get("clips", [])]
    two = (video_cfg["scenes"] + [c for c in clips_known if c not in video_cfg["scenes"]])[:2]   # the live board may hold one clip: take two known clips
    video = b.video_board({"video": {**video_cfg, "scenes": two, "explicit_clips": []}})   # scene clips only: an explicit clip has no picker
    first, second = _kling_ids(video)
    paid = bridge_logic.apply_overrides(video, {first: {"dry_run": False}, second: {"dry_run": False}})
    assert bridge_logic.max_credits(paid) == 2 * CLIP                                    # no clip files yet: both cost
    scene = video[video[first]["inputs"]["image_path"][0]]["inputs"]["frame"].split("__")[0]
    (frames / f"{scene}__kling26_pushin_9x16.mp4").write_bytes(b"clip")
    assert bridge_logic.max_credits(paid) == CLIP                                        # one clip exists: only the other costs


def test_the_bridge_can_hand_a_photo_to_the_picker_but_nothing_else(frames):
    b = _builder()
    board = json.loads((ROOT / "specs" / "active_board.json").read_text(encoding="utf-8"))["video"]
    known = [c["scene_id"] for c in b.active_set().get("clips", [])]
    if not (board["scenes"] or known):
        pytest.skip("the live video board holds no scene clip (explicit clips only): there is no picker to test")
    video = b.video_board({"video": {**board, "scenes": board["scenes"] or known[:1], "explicit_clips": []}})
    picker = next(k for k, v in video.items() if v["class_type"] == "MoonbloomFramePicker")
    other = sorted(f.name for f in frames.glob("*.png"))[-1]
    out = bridge_logic.apply_overrides(video, {picker: {"frame": other}})
    assert out[picker]["inputs"]["frame"] == other and video[picker]["inputs"]["frame"] != "" and out is not video
    for bad in ({"frame": "../escape.png"}, {"frame": "missing.png"}, {"frame": 5}, {"other": "x"}):
        with pytest.raises(ValueError):
            bridge_logic.apply_overrides(video, {picker: bad})
