"""Offline tests of the DESTINATIONS (owner 06.11): where a generated picture goes, what ratio and pixels it needs there, and the delivery
file cut from a finished frame. reels_pipeline/destinations.py, specs/ad_formats.json, the `for` of a carousel pair. No ComfyUI, no KIE, no
credits, nothing uploaded.

Run: py -3.12 -X utf8 -m pytest comfy_nodes/test_destinations.py -q
"""

import hashlib
import json
import shutil
from pathlib import Path

import pytest
from PIL import Image

from reels_pipeline import carousel, destinations, director

ROOT = Path(__file__).resolve().parent.parent
SET_ID = "l2_carousel01"


@pytest.fixture
def specs(tmp_path, monkeypatch):
    folder = tmp_path / "specs"
    shutil.copytree(ROOT / "specs", folder)
    monkeypatch.setattr(director, "SPECS", folder)
    return folder


def _edit(specs, change):
    path = specs / "sets" / f"{SET_ID}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    change(data)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def _frame(tmp_path, width, height, name="frame.png"):
    path = tmp_path / name
    Image.new("RGB", (width, height), (200, 180, 160)).save(path)
    return path


def test_every_destination_says_why_where_and_how_and_asks_for_a_frame_a_model_can_make():
    assert destinations.registry_problems() == []
    banana = set(carousel._model_formats("nano-banana-2-1"))
    for dest_id, d in destinations.registry().items():
        if d["ratio"]:
            assert d["generate_as"] in banana, f"{dest_id}: no KIE model makes the frame {d['generate_as']}"
    assert destinations.serving("4:5") == ["meta_feed_ad"] and "meta_stories_reels" in destinations.serving("9:16")
    google = destinations.registry()["google_search_landscape"]
    assert google["ratio"] == "1.91:1" and google["generate_as"] == "16:9" and 0 < google["crop_max"] < 0.1, "1.91:1 is a small centre crop of 16:9"
    feed = destinations.registry()["feed_main"]
    assert feed["status"] == "open" and feed["ratio"] is None, "the main feed image is an owner decision, not a ratio we invented"


def test_a_pair_names_its_frame_by_the_destinations_it_serves_and_a_contradiction_is_a_problem(specs):
    plan = director.plan_set(SET_ID)
    assert plan["problems"] == []
    assert [(p["pair"], p["format"], p["serves"]) for p in plan["pairs"]] == [("a", "9:16", ["meta_stories_reels"]), ("b", "4:5", ["meta_feed_ad"])]
    assert all(c["reel"]["serves"] == ["meta_feed_ad"] for c in plan["cards"] if c["aspectRatio"] == "4:5")

    _edit(specs, lambda d: d["pairs"][1].update({"for": [], "format": "2:3"}))                       # the old way still works
    assert director.plan_set(SET_ID)["pairs"][1]["serves"] == ["pinterest_pin"]

    _edit(specs, lambda d: d["pairs"][1].update({"for": ["google_search_landscape"], "format": ""}))  # 1.91:1 is generated as 16:9
    landscape = director.plan_set(SET_ID)
    assert landscape["problems"] == [] and landscape["pairs"][1]["format"] == "16:9"

    for change, expected in (
        (lambda d: d["pairs"][1].update({"for": ["meta_feed_ad"], "format": "9:16"}), "contradicts"),
        (lambda d: d["pairs"][1].update({"for": ["feed_main"], "format": ""}), "no fixed ratio"),
        (lambda d: d["pairs"][1].update({"for": ["meta_feed_ad", "pinterest_pin"], "format": "4:5"}), "contradicts"),
        (lambda d: d["pairs"][1].update({"for": ["nowhere"], "format": ""}), "unknown destination"),
    ):
        _edit(specs, lambda d: d["pairs"][1].update({"for": ["meta_feed_ad"], "format": ""}))        # back to a good pair, then break it
        _edit(specs, change)
        assert any(expected in p for p in director.plan_set(SET_ID)["problems"]), expected


def test_a_frame_fits_a_destination_by_ratio_crop_and_pixels():
    fit = destinations.fit
    assert fit("meta_feed_ad", 1856, 2304)["ok"] and fit("meta_feed_ad", 1856, 2304)["crop"] is None     # a 2K Banana 4:5 frame
    assert "ratio" in fit("meta_stories_reels", 1856, 2304)["problems"][0], "a 4:5 frame is no 9:16"
    land = fit("google_search_landscape", 2752, 1536)                                                 # a 2K 16:9 frame
    assert land["ok"] and land["crop"] and abs(land["size"][0] / land["size"][1] / 1.91 - 1) < 0.01
    assert not fit("google_search_landscape", 1800, 1344)["ok"], "a 4:3 frame would lose 30% of its height: refused, never silently cut"
    assert "below the minimum" in fit("meta_feed_ad", 480, 600)["problems"][0]
    assert destinations.serves_label(1856, 2304) == "meta_feed_ad" and destinations.serves_label(1536, 2752) == "meta_stories_reels"
    assert destinations.serves_label(2752, 1536) == "google_search_landscape(crop)"


def test_a_delivery_file_is_a_jpeg_of_the_exact_ratio_with_the_ai_label_and_a_frame_that_does_not_fit_writes_nothing(tmp_path):
    out = tmp_path / "x" / "meta.jpg"
    result = destinations.render(_frame(tmp_path, 1856, 2304), "meta_feed_ad", out)
    data = out.read_bytes()
    assert data[:2] == b"\xff\xd8" and Image.open(out).size == (1856, 2304) and result["sha256"] == hashlib.sha256(data).hexdigest()
    assert destinations.read_ai_label(data) == destinations.AI_LABEL_URI
    assert b"trainedAlgorithmicMedia" in Image.open(out).info["xmp"], "the imaging library sees the same label, our reader is not the only one"

    wide = destinations.render(_frame(tmp_path, 2752, 1536, "wide.png"), "google_search_landscape", tmp_path / "land.jpg")
    assert wide["cropped"] and abs(wide["size"][0] / wide["size"][1] / 1.91 - 1) < 0.01

    with pytest.raises(ValueError, match="ratio"):
        destinations.render(_frame(tmp_path, 1856, 2304, "no.png"), "meta_stories_reels", tmp_path / "no.jpg")
    assert not (tmp_path / "no.jpg").exists()
    assert destinations.export_name("c1", "meta_feed_ad", (1856, 2304), "WA-001") == "WA-001__c1__meta_feed_ad__1856x2304.jpg"


def test_the_name_of_a_frame_says_the_platform_it_goes_to():
    assert destinations.registry_problems() == []
    assert all(i.startswith(d["tag"] + "_") for i, d in destinations.registry().items()), "a destination id starts with its platform tag"
    assert {d["tag"] for d in destinations.registry().values()} == {"meta", "pinterest", "google", "etsy", "feed"}
    ids = [c["id"] for c in director.plan_set(SET_ID)["cards"]]
    assert ids == ["l2_carousel01_a1_amber_meta_9x16", "l2_carousel01_a2_rose_meta_9x16", "l2_carousel01_b1_blue_meta_4x5", "l2_carousel01_b2_yellow_meta_4x5"]
    assert destinations.platform_tag("pinterest_pin") == "pinterest" and destinations.platform_tag("google_search_landscape") == "google"


def test_a_pack_is_one_design_in_a_frame_per_destination_ratio_and_destinations_of_one_ratio_share_a_frame(specs):
    pack = ["meta_stories_reels", "meta_feed_ad", "pinterest_pin"]
    _edit(specs, lambda d: d["pairs"][1].update({"for": pack, "format": "", "colorways": ["Cool Blue"]}))
    plan = director.plan_set(SET_ID)
    assert plan["problems"] == []
    cards = [c for c in plan["cards"] if c["reel"]["pair"] == "b"]
    assert [(c["aspectRatio"], c["id"]) for c in cards] == [("9:16", "l2_carousel01_b1_blue_meta_9x16"), ("4:5", "l2_carousel01_b2_blue_meta_4x5"),
                                                            ("2:3", "l2_carousel01_b3_blue_pinterest_2x3")]
    assert len({c["seedKey"] for c in cards}) == 1 and {c["tags"]["style"] for c in cards} == {"Scandi"}, "one design: the same style, object, colour, light, seed"
    pair = plan["pairs"][1]
    assert pair["format"] == "9:16+4:5+2:3" and pair["serves"] == pack and [f["format"] for f in pair["frames"]] == ["9:16", "4:5", "2:3"]

    _edit(specs, lambda d: d["pairs"][1].update({"for": ["meta_square", "google_search_square"], "colorways": ["Cool Blue", "Butter Yellow"]}))
    squares = director.plan_set(SET_ID)
    assert squares["problems"] == [] and [f["serves"] for f in squares["pairs"][1]["frames"]] == [["meta_square", "google_search_square"]]
    assert [c["id"] for c in squares["cards"] if c["reel"]["pair"] == "b"] == ["l2_carousel01_b1_blue_meta_1x1", "l2_carousel01_b2_yellow_meta_1x1"]

    _edit(specs, lambda d: d["pairs"][1].update({"for": pack + ["etsy_gallery"], "colorways": ["Cool Blue"]}))
    assert any("do not fit one board" in p for p in director.plan_set(SET_ID)["problems"]), "four frames are more than one board holds"


def _board_builder():
    import importlib.util

    spec = importlib.util.spec_from_file_location("build_comfy_workflows_dest", ROOT / "scripts" / "build_comfy_workflows.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _board_of(builder, plan, models):
    builder.active_set = lambda: plan
    cards = [{"id": c["id"], "prompt": "full"} for c in plan["cards"]]
    graph = builder.photos_board({"photos": {"model": "nano-banana-2-1", "spec": "listing02_interiors.json", "cards": cards, "models": models}})
    builder.check("photos", graph)  # raises on a value the ComfyUI node would refuse
    return graph


def test_every_destination_of_the_registry_goes_all_the_way_from_a_set_to_a_valid_board():
    """The Design node once lacked 1:1 and 16:9: `director plan` said fine and the board was refused. Every destination with a ratio is a set
    of one pair, planned, and put on the photo board, which must pass the node check."""
    from comfy_nodes import moonbloom_nodes as nodes

    assert set(carousel.FORMATS) <= set(nodes.ETSY_ASPECT_RATIOS)
    assert nodes.MoonbloomDesign.INPUT_TYPES()["required"]["aspect_ratio"][0] == list(nodes.ETSY_ASPECT_RATIOS)
    builder = _board_builder()
    spec = json.loads((ROOT / "specs" / "sets" / f"{SET_ID}.json").read_text(encoding="utf-8"))
    seen = []
    for dest_id, d in destinations.registry().items():
        if not d["ratio"]:
            continue
        pair = {**spec["pairs"][1], "for": [dest_id], "colorways": ["Cool Blue", "Butter Yellow"], "purpose": "stories_carousel"}
        plan = carousel.plan_carousel({**spec, "pairs": [pair]})
        assert plan["problems"] == [], (dest_id, plan["problems"])
        graph = _board_of(builder, plan, "all")
        assert {c["aspectRatio"] for c in plan["cards"]} == {d["generate_as"]} and graph, dest_id
        seen.append(d["generate_as"])
    assert set(seen) >= {"9:16", "4:5", "2:3", "4:3", "16:9", "1:1"}, "every frame ratio of the registry was tried"


def test_a_pack_of_three_sizes_is_one_valid_board_with_the_model_of_the_set():
    builder = _board_builder()
    spec = json.loads((ROOT / "specs" / "sets" / f"{SET_ID}.json").read_text(encoding="utf-8"))
    pair = {**spec["pairs"][1], "for": ["meta_stories_reels", "meta_feed_ad", "pinterest_pin"], "colorways": ["Cool Blue"]}
    plan = carousel.plan_carousel({**spec, "pairs": [pair]})
    assert plan["problems"] == [] and [c["aspectRatio"] for c in plan["cards"]] == ["9:16", "4:5", "2:3"]
    assert len(_board_of(builder, plan, ["nano-banana-2-1"])) == 17
    with pytest.raises(AssertionError, match="budget"):
        _board_of(builder, plan, "all")                                                       # three models x three frames is a giant board: the director falls back to one model


# ------------------------------------------------------------------ a reel is different designs, a carousel pair is one design (owner 06.11)

def test_a_carousel_pair_for_the_reels_frame_is_refused_unless_it_is_a_stories_carousel(specs):
    _edit(specs, lambda d: d["pairs"][0].pop("purpose"))
    assert any("must be DIFFERENT designs" in p for p in director.plan_set(SET_ID)["problems"]), "two colours of one room are not a reel"
    _edit(specs, lambda d: d["pairs"][0].update({"purpose": "stories_carousel"}))
    assert director.plan_set(SET_ID)["problems"] == []


def _reel_slots(specs, first, second):
    path = specs / "sets" / "l2_reel01.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["slots"] = [{"slot": "s1", "role": first[0], "kit": first[1]}, {"slot": "s2", "role": second[0], "kit": second[1]}]
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return director.plan_set("l2_reel01")["problems"]


def test_the_frames_of_a_reel_must_differ_in_style_side_and_kind_of_person(specs):
    assert _reel_slots(specs, ("life", "baby_play_mat"), ("life", "arch_poufs")) == [], "the reel the owner chose: a mother with a baby, a small girl"
    assert any("different styles" in p for p in _reel_slots(specs, ("life", "arch_poufs"), ("product", "flower_table")))      # one style, Playful Curves
    assert any("same side" in p for p in _reel_slots(specs, ("life", "baby_play_mat"), ("life", "nursing_chair")))               # both shot from the right
    assert any("same kind of person" in p for p in _reel_slots(specs, ("product", "baby_play_mat"), ("product", "arch_poufs")))  # nobody in either
    assert any("used twice" in p for p in _reel_slots(specs, ("life", "arch_poufs"), ("hook", "arch_poufs")))


def test_a_clip_with_a_person_gets_the_people_lock_and_a_clip_without_one_does_not():
    from reels_pipeline.prompts import clip_prompt

    lock = {"product": "P.", "furniture": "F {items}.", "people": "PEOPLE LOCK: head as in the first frame."}
    clip = {"scene_id": "x", "motion": "M.", "items": "bed"}
    assert clip_prompt({**clip, "people": True}, {"lock": lock}).endswith("PEOPLE LOCK: head as in the first frame.")
    assert "PEOPLE LOCK" not in clip_prompt(clip, {"lock": lock}) and "PEOPLE LOCK" not in clip_prompt({**clip, "people": True}, {"lock": {k: v for k, v in lock.items() if k != "people"}})
    for name in ("listing02_video.json", "listing45_video.json"):
        assert "PEOPLE LOCK" in json.loads((ROOT / "specs" / name).read_text(encoding="utf-8"))["lock"]["people"], name


def test_the_play_role_names_its_own_person_and_a_reel_may_have_two_made_photos():
    plan = director.plan_set("l3_reel01")
    assert plan["problems"] == [] and [c["id"] for c in plan["cards"]] == ["l3_reel01_s2_leave"]
    play = plan["clips"][0]["motion"]
    assert "toddler boy" in play and "back to the camera" in play and "does not move at all" in play and "does not touch it" in play, "a 2-3 year old boy (Listing 3 is a boy's wallpaper), from behind, a still camera, the door stays"
    assert plan["clips"][0]["people"] is True


# ------------------------------------------------------------------ step 0: the audience of the wallpaper decides the room (owner 06.11)

def _set_slots(specs, set_id, slots, **constraints):
    path = specs / "sets" / f"{set_id}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["slots"] = slots
    data["constraints"] = {"min_styles": 1, "distinct_kits": True, **constraints}
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return director.plan_set(set_id)["problems"]


def test_a_reel_takes_only_kits_that_suit_the_audience_of_the_wallpaper(specs):
    assert _set_slots(specs, "l3_reel01", [{"slot": "s2", "role": "play", "kit": "boy_train"}]) == []
    problems = _set_slots(specs, "l3_reel01", [{"slot": "s2", "role": "play", "kit": "teddy_rug"}])                # a pink girl's kit in a boy's blue room
    assert any("is for a 'girl' room" in p and "'boy'" in p for p in problems)
    neutral = _set_slots(specs, "l3_reel01", [{"slot": "s2", "role": "play", "kit": "neutral_blocks"}])
    assert not any("is for a" in p for p in neutral), "a neutral kit suits a boy's wallpaper (it may still be taken by the reel of another listing: that is a different rule)"
    plan = director.plan_set("l3_reel01")
    assert "toddler boy" in plan["clips"][0]["motion"] and "navy" in plan["clips"][0]["motion"], "the person follows the audience of the kit"
    listing = specs / "listing03_interiors.json"
    data = json.loads(listing.read_text(encoding="utf-8"))
    data.pop("audience")
    listing.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    assert any("no `audience`" in p for p in director.plan_set("l3_reel01")["problems"]), "LOOK at the wallpaper first"


def test_a_design_kit_is_not_repeated_in_the_reel_of_another_listing(specs):
    assert any("already made the reel l2_reel01" in p for p in _set_slots(specs, "l3_reel01", [{"slot": "s2", "role": "play", "kit": "baby_play_mat"}], shared_kits_ok=False)), "the mother on the play mat is Listing 2's design"
    assert not any("already made" in p for p in _set_slots(specs, "l3_reel01", [{"slot": "s2", "role": "play", "kit": "boy_train"}]))


def test_the_listing_check_asks_for_the_audience():
    import importlib.util

    spec = importlib.util.spec_from_file_location("new_listing_audience", ROOT / "scripts" / "new_listing.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.check("listing03_interiors.json") == []
    assert all(json.loads((ROOT / "specs" / f).read_text(encoding="utf-8")).get("audience") in module.AUDIENCES for f in ("listing02_interiors.json", "listing03_interiors.json", "listing45_interiors.json"))
