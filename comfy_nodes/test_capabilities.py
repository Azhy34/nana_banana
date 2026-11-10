"""Offline tests (no ComfyUI, no KIE, no credits): the node lists come from KIE's own schema, paid nodes start free,
the capability cards have one shape, a workflow is checked like ComfyUI will check it, and a run needs exactly one window.

Run: py -3.12 -X utf8 -m pytest comfy_nodes -q
"""

import copy
import importlib.util
import json
import re
import typing
from pathlib import Path

import pytest

from api_discovery.kie_kling import models as kie_models
from comfy_nodes import bridge_logic
from comfy_nodes import moonbloom_nodes as nodes
from reels_pipeline import kie_capabilities as caps
from reels_pipeline import node_cards
from reels_pipeline.kie_generator import ALL_IMAGE_MODELS, IMAGE_MODELS, MODEL_TAG, NODE_OF_MODEL, OTHER_IMAGE_MODELS, OTHER_IMAGE_NODES
from reels_pipeline.live_price import KLING_MODEL

ROOT = Path(__file__).resolve().parent.parent


def _builder():
    spec = importlib.util.spec_from_file_location("build_comfy_workflows", ROOT / "scripts" / "build_comfy_workflows.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _server_entry(name, cls):
    """What ComfyUI's /object_info answers for one class (the same keys as server.py node_info(), through JSON like the real thing)."""
    inputs = cls.INPUT_TYPES()
    entry = {
        "input": inputs, "input_order": {k: list(v) for k, v in inputs.items()},
        "output": list(cls.RETURN_TYPES), "output_name": list(getattr(cls, "RETURN_NAMES", cls.RETURN_TYPES)),
        "name": name, "display_name": nodes.NODE_DISPLAY_NAME_MAPPINGS.get(name, name), "category": cls.CATEGORY,
        "output_node": bool(getattr(cls, "OUTPUT_NODE", False)), "description": getattr(cls, "DESCRIPTION", ""),
    }
    return json.loads(json.dumps(entry))


# The two core nodes of our boards, exactly as the running ComfyUI describes them (taken from its /object_info).
CORE = {
    "PreviewImage": {"input": {"required": {"images": ["IMAGE"]}, "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"}},
                     "input_order": {"required": ["images"], "hidden": ["prompt", "extra_pnginfo"]}, "output": [], "output_name": [],
                     "name": "PreviewImage", "display_name": "Preview Image", "category": "image", "output_node": True},
    "PreviewAny": {"input": {"required": {"source": ["*", {}]}}, "input_order": {"required": ["source"]}, "output": ["STRING"],
                   "output_name": ["STRING"], "name": "PreviewAny", "display_name": "Preview as Text", "category": "utilities", "output_node": True},
}


@pytest.fixture
def live_info():
    return {**CORE, **{name: _server_entry(name, cls) for name, cls in nodes.NODE_CLASS_MAPPINGS.items()}}


# ------------------------------------------------------------------ the lists come from KIE's schema

def test_every_model_has_a_schema_snapshot_and_the_default_is_the_cheaper_one():
    for model in (*ALL_IMAGE_MODELS, KLING_MODEL):
        assert caps.schema_path(model).is_file(), f"no schema snapshot for {model}: py -3.12 -X utf8 api_truth/refresh_api_truth.py --only kie"
    assert set(ALL_IMAGE_MODELS) == set(MODEL_TAG) and IMAGE_MODELS[0] == "nano-banana-2-1"
    assert len(set(MODEL_TAG.values())) == len(MODEL_TAG)                                # a file tag identifies one model only


def test_node_dropdowns_are_what_the_owner_chose_and_kie_still_lists_all_of_it():
    required = nodes.MoonbloomKieImage.INPUT_TYPES()["required"]
    # `choices` silently drops a value KIE removed; these equalities turn that into a failing test instead of a quiet change
    assert required["aspect_ratio"][0] == list(nodes.ETSY_ASPECT_RATIOS)
    assert required["resolution"][0] == list(nodes.RESOLUTIONS)
    assert required["model"][0] == list(IMAGE_MODELS)
    assert caps.unsupported(IMAGE_MODELS, "aspect_ratio", required["aspect_ratio"][0]) == []
    assert caps.unsupported(IMAGE_MODELS, "resolution", required["resolution"][0]) == []
    assert nodes.MoonbloomKieKling.INPUT_TYPES()["required"]["duration"][0] == list(nodes.DURATIONS)
    assert caps.unsupported(KLING_MODEL, "duration", nodes.DURATIONS) == []
    assert required["aspect_ratio"][1]["default"] == "9:16" and required["resolution"][1]["default"] == "2K"


def test_choices_keep_the_preferred_order_drop_what_the_schema_lacks_and_never_come_back_empty():
    assert caps.choices("nano-banana-2-1", "resolution", ("4K", "bogus", "1K")) == ["4K", "1K"]
    assert caps.choices("nano-banana-2-1", "resolution", ("bogus",)) == ["1K", "2K", "4K"]       # nothing left: the schema's own list
    assert caps.choices(IMAGE_MODELS, "resolution") == ["1K", "2K", "4K"]
    pattern = caps.pattern(IMAGE_MODELS, "resolution")
    assert re.fullmatch(pattern, "2K") and not re.fullmatch(pattern, "8K") and not re.fullmatch(pattern, "2K2K")
    assert caps.choices("nano-banana-2-1", "prompt") == []                                      # not an enum field


def test_a_node_that_serves_several_models_offers_only_what_all_of_them_accept(monkeypatch):
    monkeypatch.setattr(caps, "enum", lambda model, field: {"a": ["x", "y", "z"], "b": ["y", "z", "w"]}[model])
    assert caps.choices(["a", "b"], "f") == ["y", "z"]
    assert caps.choices(["a", "b"], "f", ("z", "x", "y")) == ["z", "y"]
    assert caps.unsupported(["a", "b"], "f", ["x", "y", "w"]) == ["w", "x"]


def test_describe_shows_the_whole_capability_of_a_model():
    photo = caps.describe("nano-banana-2-1")
    assert photo["prompt"]["required"] is True and photo["prompt"]["maxLength"] == 20000
    assert photo["image_input"]["maxItems"] == 10 and "21:9" in photo["aspect_ratio"]["enum"] and photo["resolution"]["default"] == "1K"
    clip = caps.describe(KLING_MODEL)
    assert set(clip) == {"prompt", "image_urls", "sound", "duration"} and clip["duration"]["enum"] == ["5", "10"]
    assert caps.required_fields(KLING_MODEL) == ["prompt", "image_urls", "sound", "duration"]


def _literal(model_class, field):
    return list(typing.get_args(model_class.model_fields[field].annotation))


def test_the_pydantic_shield_agrees_with_kie_schema():
    for model in IMAGE_MODELS:
        assert sorted(_literal(kie_models.NanoBanana2Input, "aspect_ratio")) == sorted(caps.enum(model, "aspect_ratio"))
        assert sorted(_literal(kie_models.NanoBanana2Input, "resolution")) == sorted(caps.enum(model, "resolution"))
        assert sorted(_literal(kie_models.NanoBanana2Input, "output_format")) == sorted(caps.enum(model, "output_format"))
    assert sorted(_literal(kie_models.Kling26Input, "duration")) == sorted(caps.enum(KLING_MODEL, "duration"))
    assert sorted(set(typing.get_args(kie_models.NanoBananaTaskCreateRequest.model_fields["model"].annotation))) == sorted(IMAGE_MODELS)


# ------------------------------------------------------------------ paid nodes start free; one window per paid run

@pytest.mark.core
def test_paid_nodes_start_as_dry_run():
    for cls in (nodes.MoonbloomKieImage, nodes.MoonbloomKieKling):
        dry = cls.INPUT_TYPES()["required"]["dry_run"]
        assert dry[1]["default"] is True and "credits" in dry[1]["tooltip"]


@pytest.mark.core
def test_the_photo_board_starts_free_like_the_video_board(tmp_path):
    b = _builder()
    photos = b.photos_board()
    images = [k for k, v in photos.items() if v["class_type"] == "MoonbloomKieImage"]
    assert images and all(photos[k]["inputs"]["dry_run"] is True for k in images)
    assert bridge_logic.max_credits(photos) == 0                              # the Queue button of the window cannot spend credits
    paid = bridge_logic.apply_overrides(photos, {images[0]: {"dry_run": False}})  # a paid card is a separate, explicit step
    assert paid[images[0]]["inputs"]["dry_run"] is False and photos[images[0]]["inputs"]["dry_run"] is True


@pytest.mark.core
def test_a_board_goes_to_exactly_one_window_and_a_paid_run_needs_exactly_one():
    assert "no ComfyUI window" in bridge_logic.window_problem(False, 0)      # nobody receives it: not "ok"
    assert "no ComfyUI window" in bridge_logic.window_problem(True, 0)
    assert "paid 2 times" in bridge_logic.window_problem(True, 2)            # every window would queue the run
    assert bridge_logic.window_problem(True, 1) is None
    assert bridge_logic.window_problem(False, 1) is None
    assert bridge_logic.window_problem(False, 3) is None                     # opening (no run) in several windows spends nothing


# ------------------------------------------------------------------ the capability card

def test_normalize_input_knows_both_ways_comfyui_writes_a_dropdown():
    old = node_cards.normalize_input([["a", "b"], {"default": "a"}])
    new = node_cards.normalize_input(["COMBO", {"options": ["a", "b"], "default": "a"}])
    assert old == new == {"type": "COMBO", "choices": ["a", "b"], "default": "a"}
    assert node_cards.normalize_input(["INT", {"default": 0, "min": 0, "max": 4294967295}]) == {"type": "INT", "default": 0, "min": 0, "max": 4294967295}
    assert node_cards.normalize_input(["STRING", {"multiline": True, "forceInput": True}]) == {"type": "STRING", "multiline": True, "forceInput": True}
    assert node_cards.normalize_input(["IMAGE"]) == {"type": "IMAGE"}
    dynamic = node_cards.normalize_input(["COMFY_DYNAMICCOMBO_V3", {"options": [
        {"key": "pro", "inputs": {"required": {"size": ["COMBO", {"options": ["1K"]}]}}}, {"key": "lite", "inputs": {}}]}])
    assert dynamic["type"] == "DYNAMIC_COMBO" and dynamic["choices"] == ["pro", "lite"]
    assert dynamic["variants"]["pro"]["size"]["choices"] == ["1K"] and dynamic["variants"]["lite"] == {}


def test_the_card_of_our_paid_photo_node_has_the_agreed_shape(live_info):
    c = node_cards.card(live_info["MoonbloomKieImage"])
    assert list(c)[:6] == ["class_name", "display_name", "category", "required_inputs", "optional_inputs", "outputs"]
    assert c["class_name"] == "MoonbloomKieImage" and c["category"] == "Moonbloom"
    required = c["required_inputs"]
    assert list(required) == list(nodes.MoonbloomKieImage.INPUT_TYPES()["required"])        # order of the node is kept
    assert required["model"] == {"type": "COMBO", "choices": list(IMAGE_MODELS), "default": IMAGE_MODELS[0]}
    assert required["prompt"] == {"type": "STRING", "multiline": True, "forceInput": True}
    assert required["dry_run"]["type"] == "BOOLEAN" and required["dry_run"]["default"] is True
    assert list(c["optional_inputs"]) == ["texture_path", "reference_labels"]                  # labels: ON for the app's full prompt, OFF for the brief one
    assert c["outputs"] == {"types": ["IMAGE", "STRING", "STRING"], "names": ["image", "image_path", "report"]}
    assert c["output_node"] is True and json.loads(json.dumps(c)) == c


def test_every_node_of_ours_gets_a_card_that_lists_exactly_its_inputs(live_info):
    for name, cls in nodes.NODE_CLASS_MAPPINGS.items():
        c = node_cards.card(live_info[name])
        spec = cls.INPUT_TYPES()
        assert list(c["required_inputs"]) == list(spec["required"]) and list(c["optional_inputs"]) == list(spec.get("optional", {}))
        assert c["outputs"]["types"] == list(cls.RETURN_TYPES)


def test_save_cards_rewrites_only_what_changed(live_info, tmp_path):
    names = ["MoonbloomKieImage", "MoonbloomKieKling"]
    assert node_cards.save_cards(live_info, names, tmp_path) == names
    assert node_cards.save_cards(live_info, names, tmp_path) == []                          # nothing changed: nothing touched
    saved = json.loads((tmp_path / "MoonbloomKieImage.json").read_text(encoding="utf-8"))
    assert saved["_meta"]["source"] == "live GET /object_info" and saved["class_name"] == "MoonbloomKieImage"
    changed = copy.deepcopy(live_info)
    changed["MoonbloomKieKling"]["input"]["required"]["duration"][1]["default"] = "10"
    assert node_cards.save_cards(changed, names, tmp_path) == ["MoonbloomKieKling"]
    assert set(json.loads((tmp_path / "index.json").read_text(encoding="utf-8"))) == set(names)


def test_the_snapshot_copy_knows_all_of_our_nodes():
    snapshot = json.loads((ROOT / "api_truth" / "comfy" / "object_info.json").read_text(encoding="utf-8"))
    ours = sorted(n for n in snapshot if n.startswith("Moonbloom"))
    assert ours == sorted(nodes.NODE_CLASS_MAPPINGS), \
        "the copy of /object_info is out of date: py -3.12 -X utf8 api_truth/refresh_api_truth.py --only comfy (ComfyUI must run)"


# ------------------------------------------------------------------ the photo board builds the SAME prompt as its spec card

SPEC = json.loads((ROOT / "specs" / "listing45_interiors.json").read_text(encoding="utf-8"))
CARDS = {c["id"]: c for c in SPEC["cards"]}
APP_SENTENCES = ("The focal furniture piece is", "Authentic lived-in details")  # the app's own random sentences the final cards cut


def _design_inputs_of(graph, scene_id):
    return next(v["inputs"] for v in graph.values() if v["class_type"] == "MoonbloomDesign" and v["inputs"]["scene_id"] == scene_id)


def _chain_of(scene_id):
    """The board chain of one spec card, whatever is on the active board right now."""
    return _builder().designs(True, "nano-banana-2-1", (scene_id,))


@pytest.mark.parametrize("scene_id", ["l45_scene_09_full_mural_final", "l45_scene_10_full_mural_angle"])
def test_the_board_card_cuts_the_same_app_sentences_as_its_spec_card(scene_id):
    inputs = _design_inputs_of(_chain_of(scene_id), scene_id)
    assert inputs["strip_regex"].splitlines() == CARDS[scene_id]["stripRegex"]            # rules travel from the spec to the node, spaces intact
    prompt, built_id = nodes.MoonbloomDesign().build(**inputs)
    assert built_id == scene_id
    for sentence in APP_SENTENCES:
        assert sentence not in prompt, f"{scene_id}: the board prompt still has the app sentence {sentence!r}"
    spec_prompt = nodes.build_batch_prompts([{**CARDS[scene_id], "seed": 0}], aspect_ratio="9:16")[0]["prompt"]
    for sentence in APP_SENTENCES:
        assert sentence not in spec_prompt
    assert CARDS[scene_id]["extraPrompt"] in prompt                                         # the card's own text is what is left


def test_design_without_rules_keeps_the_app_sentences_and_rules_keep_trailing_spaces():
    base = {"scene_id": "x", "aspect_ratio": "9:16", "age_group": "schulkind", "style": "Japandi 2.0", "color": "Dusty Rose",
            "key_object": "custom (key_object_custom)", "key_object_custom": "Large plush cream dot floor rug",
            "lighting": "random", "camera_angle": "random", "camera_elevation": "random", "camera_distance": "random", "brand": "random",
            "composition": "unobstructed", "clean_random_details": True, "variation": 0}
    assert all(s in nodes.MoonbloomDesign().build(**base)[0] for s in APP_SENTENCES)        # nothing is cut unless the card says so
    rule = "The focal furniture piece is an? [^.]*\\. Layout: \\. "
    only_focal = nodes.MoonbloomDesign().build(**base, strip_regex=rule + "\n\n")[0]        # a blank line is no rule; the trailing space stays
    assert APP_SENTENCES[0] not in only_focal and APP_SENTENCES[1] in only_focal


def test_the_same_variation_builds_the_same_prompt_and_another_one_re_rolls_it():
    inputs = _design_inputs_of(_chain_of("l45_scene_10_full_mural_angle"), "l45_scene_10_full_mural_angle")
    inputs = {**inputs, "brand": "random"}                                                  # leave the brand to chance: the seed decides it
    first, again = (nodes.MoonbloomDesign().build(**{**inputs, "variation": 7})[0] for _ in range(2))
    assert first == again                                                                   # a dry run and the paid run get the same text
    others = {nodes.MoonbloomDesign().build(**{**inputs, "variation": v})[0] for v in (1, 2, 3, 4)}
    assert len(others | {first}) > 1                                                        # another number re-rolls what was left random
    scene = nodes.MoonbloomListingScene().build("listing45_interiors.json", 9, 3)[0]
    assert scene == nodes.MoonbloomListingScene().build("listing45_interiors.json", 9, 3)[0]


# ------------------------------------------------------------------ the six test cards (06.11): other formats, other styles

NEW_CARDS = [c for c in SPEC["cards"] if re.match(r"l45_scene_1[1-6]_", c["id"])]
ROUND_A, ROUND_B = NEW_CARDS[:3], NEW_CARDS[3:]


def test_the_six_cards_cover_every_age_group_twice_both_formats_three_times_and_several_styles():
    assert len(NEW_CARDS) == 6
    ages = sorted(c["ageGroup"] for c in NEW_CARDS)
    assert ages == ["baby", "baby", "schulkind", "schulkind", "vorschul", "vorschul"]       # owner: under 2 / 2-5 / 6-10
    assert sorted(c["aspectRatio"] for c in NEW_CARDS) == ["2:3"] * 3 + ["4:3"] * 3
    assert len({c["tags"]["style"] for c in NEW_CARDS}) >= 5
    for part in (ROUND_A, ROUND_B):                                                          # each round of three mixes both formats and all ages
        assert {c["aspectRatio"] for c in part} == {"2:3", "4:3"} and {c["ageGroup"] for c in part} == {"baby", "vorschul", "schulkind"}
    for c in NEW_CARDS:
        text = c["extraPrompt"]
        assert c["cleanRandomDetails"] is True and c["tags"]["compositionStrategy"] == "unobstructed"
        assert "no cobalt blue" in text and "painted figure skater is fully visible" in text and "Nothing stands in front of the mural" in text
        assert re.search(r"\bno bed\b|NO BED|NO CRIB", text), c["id"]                      # owner 05.11: beds are often out of scale
        assert not re.search(r"\b(woman|man|girl herself|mother|father|boy)\b", text), c["id"]   # no people in these frames: faces are never shown
        assert c["tags"]["aperture"] == "f/8.0 aperture" and c["tags"]["depthOfField"] == "deep depth of field"   # a sharp mural, never a shallow blur
        assert f"FRAMING FOR {c['aspectRatio']}" in text


def test_a_card_format_reaches_both_nodes_of_its_chain_and_the_rounds_fit_the_board():
    b = _builder()
    for card in NEW_CARDS:
        graph = b.designs(True, "nano-banana-2-1", (card["id"],))
        design = next(v for v in graph.values() if v["class_type"] == "MoonbloomDesign")["inputs"]
        image = next(v for v in graph.values() if v["class_type"] == "MoonbloomKieImage")["inputs"]
        assert design["aspect_ratio"] == image["aspect_ratio"] == card["aspectRatio"]
        b.check(card["id"], graph)
    for part in (ROUND_A, ROUND_B):
        graph = b.designs(True, "nano-banana-2-1", tuple(c["id"] for c in part))
        assert len(graph) == 2 + 5 * 3 and len(part) <= b.MAX_PHOTO_CHAINS


@pytest.mark.parametrize("card", NEW_CARDS, ids=lambda c: c["id"])
def test_a_new_card_builds_a_full_wall_prompt_in_its_own_format_with_the_app_sentences_cut(card):
    inputs = _design_inputs_of(_chain_of(card["id"]), card["id"])
    for variation in (0, 1, 2, 3, 4, 5):                                                      # the app would roll scallop-trim in ~35% of non-9:16 builds
        prompt = nodes.MoonbloomDesign().build(**{**inputs, "variation": variation})[0]
        assert f"Aspect ratio: {card['aspectRatio']}." in prompt
        assert "FULL-HEIGHT 100% WALL COVERAGE" in prompt and "SCALLOPED WAVE TRIM" not in prompt
        assert "The focal furniture piece is" not in prompt and "Authentic lived-in" not in prompt
        assert "Dopamine Decor / Retro Kids aesthetic" not in prompt or card["tags"]["style"] == "Retro Kids 2026"
        assert card["extraPrompt"] in prompt


def test_the_wall_architecture_is_full_wall_unless_a_card_says_otherwise():
    optional = nodes.MoonbloomDesign.INPUT_TYPES()["optional"]["wall_architecture"]
    assert optional[0] == ["full-wall", "scallop-trim", "random"] and optional[1]["default"] == "full-wall"
    base = {"scene_id": "x", "aspect_ratio": "4:3", "age_group": "vorschul", "style": "random", "color": "random", "key_object": "random",
            "lighting": "random", "camera_angle": "random", "camera_elevation": "random", "camera_distance": "random", "brand": "random",
            "composition": "unobstructed", "clean_random_details": True, "variation": 0}
    for variation in range(6):
        assert "SCALLOPED WAVE TRIM" not in nodes.MoonbloomDesign().build(**{**base, "variation": variation})[0]
    assert "SCALLOPED WAVE TRIM" in nodes.MoonbloomDesign().build(**base, wall_architecture="scallop-trim")[0]   # still available when wanted


def test_a_listing_scene_uses_the_cards_own_format_and_keeps_the_wall_full():
    prompt, scene_id, *_rest, aspect = nodes.MoonbloomListingScene().build("listing45_interiors.json", 11, 0)
    assert scene_id == "l45_scene_11_baby_biophilic_43" and aspect == "4:3" and "Aspect ratio: 4:3." in prompt
    assert "FULL-HEIGHT 100% WALL COVERAGE" in prompt and "SCALLOPED WAVE TRIM" not in prompt


# ------------------------------------------------------------------ the photo board shows the report of every photo node

def test_every_photo_node_of_the_board_has_its_report_in_a_window():
    graph = _builder().photos_board()
    report_slot = nodes.MoonbloomKieImage.RETURN_NAMES.index("report")
    images = [k for k, v in graph.items() if v["class_type"] in _builder().IMAGE_CLASSES]
    designs = [k for k, v in graph.items() if v["class_type"] == "MoonbloomDesign"]
    assert len(designs) == len(_builder().load_active()["photos"]["cards"]) and len(graph) == 2 + 2 * len(designs) + 3 * len(images)   # a chain: design + text, then 3 nodes per model
    for k in images:                                                                          # every photo node has the same three outputs
        assert nodes.NODE_CLASS_MAPPINGS[graph[k]["class_type"]].RETURN_NAMES[report_slot] == "report"
    for image in images:
        windows = [v for v in graph.values() if v["class_type"] == "PreviewAny" and v["inputs"]["source"] == [image, report_slot]]
        assert len(windows) == 1, f"KIE Image {image}: its report (price, balance, request check) is not shown"


@pytest.mark.core
def test_design_and_image_node_must_agree_on_the_ratio():
    b = _builder()
    board = copy.deepcopy(b.photos_board())
    b.check("photos", board)                                                                # the real board agrees
    image = _kie_image(board)
    framed = board[board[image]["inputs"]["prompt"][0]]["inputs"]["aspect_ratio"]            # whatever the first card of the board uses
    board[image]["inputs"]["aspect_ratio"] = "16:9"
    with pytest.raises(AssertionError, match=f"is framed for {framed}, but KIE Image {image} asks for 16:9"):
        b.check("photos", board)


# ------------------------------------------------------------------ a workflow is checked like ComfyUI will check it

def _boards():
    b = _builder()
    return b, {"moonbloom_photos_api.json": b.photos_board(), "moonbloom_video_api.json": b.video_board()}


@pytest.mark.core
def test_both_active_boards_pass_the_live_check(live_info):
    _, boards = _boards()
    for name, graph in boards.items():
        assert node_cards.validate_graph(name, graph, live_info) == [], name


def _kie_image(graph):
    return next(k for k, v in graph.items() if v["class_type"] == "MoonbloomKieImage")


@pytest.mark.parametrize("mutate, expected", [
    (lambda g, k: g[k]["inputs"].__setitem__("model", "nano-banana-pro"), "value_not_in_list"),
    (lambda g, k: g[k]["inputs"].__setitem__("resolution", "8K"), "value_not_in_list"),
    (lambda g, k: g[k]["inputs"].__setitem__("model_name", "kling-v2-6"), "the node has no such input"),   # the 03.11 mistake: partner-node fields
    (lambda g, k: g[k]["inputs"].pop("prompt"), "required_input_missing"),
    (lambda g, k: g[k]["inputs"].__setitem__("dry_run", "false"), "invalid_input_type"),
    (lambda g, k: g[k]["inputs"].__setitem__("aspect_ratio", [g[k]["inputs"]["prompt"][0], 0]), "return_type_mismatch"),  # a dropdown never takes a link
    (lambda g, k: g[k]["inputs"].__setitem__("scene_id", ["no-such-node", 0]), "not in the workflow"),
    (lambda g, k: g[k]["inputs"].__setitem__("scene_id", [g[k]["inputs"]["prompt"][0], 9]), "which has only"),
    (lambda g, k: g[k].__setitem__("class_type", "NoSuchNode"), "missing_node_type"),
])
@pytest.mark.core
def test_the_live_check_finds_what_comfyui_would_reject(live_info, mutate, expected):
    _, boards = _boards()
    graph = copy.deepcopy(boards["moonbloom_photos_api.json"])
    mutate(graph, _kie_image(graph))
    problems = node_cards.validate_graph("photos", graph, live_info)
    assert any(expected in line for line in problems), problems


def test_the_live_check_sees_a_changed_node_that_our_own_classes_do_not(live_info):
    # ComfyUI loaded an older/newer version of the node than the code in the repository: only the live data shows it
    _, boards = _boards()
    drifted = copy.deepcopy(live_info)
    drifted["MoonbloomKieImage"]["input"]["required"]["model"] = [["nano-banana-2"], {"default": "nano-banana-2"}]
    problems = node_cards.validate_graph("photos", boards["moonbloom_photos_api.json"], drifted)
    assert any("value_not_in_list" in line and "nano-banana-2-1" in line for line in problems)


def test_verify_live_blocks_on_an_active_board_and_refuses_to_run_offline(live_info, monkeypatch, tmp_path, capsys):
    b, boards = _boards()
    monkeypatch.setattr(node_cards, "CARDS_DIR", tmp_path)
    monkeypatch.setattr(node_cards, "fetch_object_info", lambda *a, **k: live_info)
    assert b.verify_live(boards) == 0 and (tmp_path / "MoonbloomKieImage.json").is_file()
    broken = {**boards, "moonbloom_photos_api.json": copy.deepcopy(boards["moonbloom_photos_api.json"])}
    broken["moonbloom_photos_api.json"][_kie_image(broken["moonbloom_photos_api.json"])]["inputs"]["resolution"] = "8K"
    assert b.verify_live(broken) == 1
    legacy = {**boards, "listing45_girl_nb21_api.json": {"1": {"class_type": "NoSuchNode", "inputs": {}}}}
    assert b.verify_live(legacy) == 0                                                    # a legacy board only warns
    assert "warn live check listing45_girl_nb21_api.json" in capsys.readouterr().out

    def offline(*a, **k):
        raise node_cards.ComfyOffline("ComfyUI does not answer")
    monkeypatch.setattr(node_cards, "fetch_object_info", offline)
    assert b.verify_live(boards) == 2                                                    # no silent fallback to the copy
