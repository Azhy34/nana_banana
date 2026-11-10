#!/usr/bin/env python3
"""
Build the ComfyUI workflows (API format) for a listing spec and check them against the node classes.

  py -3.12 -X utf8 scripts/build_comfy_workflows.py                 # checks against our own node classes (offline)
  py -3.12 -X utf8 scripts/build_comfy_workflows.py --verify-live   # also against the running ComfyUI's GET /object_info; nothing is
                                                                    # written if an active board fails; refreshes api_truth/comfy/node_cards

Writes into workflows/:
  listing45_interiors_api.json          3 branches: Scene -> KIE Image -> Preview  (PAID: 3 images)
  listing45_interiors_dryrun_api.json   same graph with dry_run=true on every paid node (validates, sends nothing)
  listing45_interiors_nb21_api.json     PAID, model nano-banana-2-1 (6 credits per image, 18 for the three)
  listing45_girl_nb21_api.json          THE board of the girl's-room scenes, one workflow: Wallpaper -> Design -> KIE Image
                                        (nano-banana-2-1, reuse_existing) for spec cards 4-5 (frames exist) and 6-8 (new ideas:
                                        door entry, sun shadows, side depth), plus a Kling 2.6 node (starts dry_run, the price of kling_bridge.CREDITS when
                                        switched to paid) for each scene of specs/listing45_video.json: 6 (the woman leaves and
                                        closes the door) and 8 (first-person walk-in). 6 credits per missing frame
  (each scene also has a "Preview as Text" node that shows the full prompt in the ComfyUI window)
  moonbloom_photos_api.json             THE PHOTO BOARD (owner 05.11): Wallpaper -> Design -> KIE Image for the cards in work only
                                        (specs/active_board.json, at most 3 chains), thumbnails in the preview
  moonbloom_video_api.json              THE VIDEO BOARD: Frame Picker (a finished photo from the frames folder) -> Kling 2.6 for the
                                        clips in work (at most 2), every Kling node starts as dry_run
  The two moonbloom_* boards are the ones the owner keeps open, one tab each (comfy_nodes/bridge_logic.py TAB_TITLES);
  listing45_girl_nb21_api.json (the old giant board of every scene) is kept only for old callers.

API format = {node_id: {"class_type", "inputs"}}, links are [node_id, output_index]. Run with POST /prompt
(see api_truth/comfy_routes.md) or load the file into ComfyUI. Image model default: nano-banana-2
(Gemini 3.1 Flash Image); switch the `model` input to nano-banana-2-1 for the cheaper update.
"""

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from comfy_nodes.moonbloom_nodes import NODE_CLASS_MAPPINGS  # noqa: E402
from reels_pipeline.kie_generator import IMAGE_MODELS, NODE_OF_MODEL, OTHER_IMAGE_NODES  # noqa: E402
from reels_pipeline.board_layout import BAY_MODELS, MAX_PHOTO_BOARD_NODES, MAX_PHOTO_CHAINS, chain_nodes, supported_models  # noqa: E402,F401
from reels_pipeline.prompts import clip_prompt  # noqa: E402

IMAGE_CLASSES = ("MoonbloomKieImage", *OTHER_IMAGE_NODES)  # every node that makes a photo on KIE

SPEC_FILE = "listing45_interiors.json"
ASPECT_RATIO = "9:16"  # same as "aspect_ratio" in specs/listing45_interiors.json
VIDEO_SPEC_FILE = "listing45_video.json"
GIRL_CARDS = ("l45_scene_02_girl_armchair", "l45_scene_03_girl_nook")
IDEA_CARDS = ("l45_scene_06_entering_door", "l45_scene_07_sun_shadows", "l45_scene_08_side_depth")  # new dynamic ideas
FINAL_CARDS = ("l45_scene_09_full_mural_final", "l45_scene_10_full_mural_angle")  # the last frame of the reel: the whole mural, school-age room (6-10)
OUT_DIR = ROOT / "workflows"
ACTIVE_FILE = "active_board.json"
MAX_VIDEO_CLIPS = 3  # the owner animates the best 3 photos of a set (was 2: a clip chain is four light nodes)
MAX_EXPLICIT_CLIPS = 4  # active_board.json video.explicit_clips: clips of frame files by path and model (Kling 2.6 / Omni 1.2 comparison, 10.11)


def interiors(dry_run: bool, model: str = "nano-banana-2", cards: tuple = (1, 2, 3)) -> dict:
    graph: dict = {}
    n = 0
    for card_number in cards:
        scene, image, preview, prompt_view = str(n + 1), str(n + 2), str(n + 3), str(n + 4)
        n += 4
        graph[scene] = {"class_type": "MoonbloomListingScene",
                        "inputs": {"spec_file": SPEC_FILE, "card_number": card_number, "variation": 0}}
        # Shows the full prompt text in the ComfyUI window (core node "Preview as Text").
        graph[prompt_view] = {"class_type": "PreviewAny", "inputs": {"source": [scene, 0]}}
        graph[image] = {"class_type": "MoonbloomKieImage", "inputs": {
            "prompt": [scene, 0], "scene_id": [scene, 1], "wallpaper_path": [scene, 2], "texture_path": [scene, 3],
            "out_dir": [scene, 4], "listing": [scene, 5],
            # A combo widget cannot take a link (ComfyUI: return_type_mismatch), so the ratio is a literal.
            "aspect_ratio": ASPECT_RATIO,
            "model": model, "resolution": "2K", "use_texture": True, "reuse_existing": True, "dry_run": dry_run}}
        graph[preview] = {"class_type": "PreviewImage", "inputs": {"images": [image, 0]}}
    return graph


def image_node(model: str, inputs: dict) -> dict:
    """
    The photo node of a model with the common inputs. The Nano Banana family is one node with a `model` dropdown; every other model
    has its own node (kie_generator.OTHER_IMAGE_NODES) that has only the fields the model has: a model without a resolution
    field gets none, the others are made at 2K (the minimum quality).
    """
    own = NODE_OF_MODEL.get(model)
    if own is None:
        return {"class_type": "MoonbloomKieImage", "inputs": {**inputs, "model": model, "resolution": "2K"}}
    node_inputs = dict(inputs)
    if "resolution" in NODE_CLASS_MAPPINGS[own].INPUT_TYPES()["required"]:
        node_inputs["resolution"] = "2K"
    return {"class_type": own, "inputs": node_inputs}


def design_inputs(card: dict, aspect: str, prompt_mode: str = "full", listing_brief: dict = None) -> dict:
    """Spec card -> inputs of the MoonbloomDesign node (what you would click in the app's Batch card)."""
    inputs = _design_inputs(card, aspect)
    if prompt_mode.split("-")[0] == "brief":  # the short prompt: the card's own three texts (subject, scene, framing), light and camera from its tags
        flags = prompt_mode.split("-")[1:]  # "nogear": no camera / lens / aperture in the text; "anchor": one explicit sentence about image 1
        unknown = set(flags) - {"nogear", "anchor"}
        assert not unknown, f"unknown brief option {sorted(unknown)} (known: nogear, anchor)"
        missing = [k for k in ("subject", "scene", "framing") if not card.get(k)]
        assert not missing, f"card {card['id']} has no {missing}: a brief prompt needs them"
        rules = listing_brief or {}
        no_rules = [k for k in ("product", "product_short", "wall_rule") if not rules.get(k)]
        assert not no_rules, f"the spec of the listing has no brief rules {no_rules}: how the product sits on the wall is a fact of the listing"
        # The result file is <scene_id>__<model tag>.png: every prompt variant needs its own name, otherwise reuse_existing would hand
        # back the picture of another variant for 0 credits and nothing would be generated (the A/B test would compare nothing).
        inputs.update({"prompt_mode": "brief", "scene_id": f"{card['id']}_{prompt_mode.replace('-', '_')}", "brief_subject": card["subject"],
                       "brief_scene": card["scene"], "brief_framing": card["framing"], "with_texture": True, "brief_people": card.get("people", "none"),
                       "brief_product": rules["product"], "brief_product_short": rules["product_short"], "brief_wall_rule": rules["wall_rule"]})
        if "anchor" in flags:
            inputs["brief_anchor"] = True
        if "nogear" in flags:
            inputs.update({"camera_body": "random", "lens": "random", "aperture": "random"})  # random = not pinned = not in the brief text
    return inputs


def _design_inputs(card: dict, aspect: str) -> dict:
    options = NODE_CLASS_MAPPINGS["MoonbloomDesign"].INPUT_TYPES()["required"]
    tags = dict(card.get("tags", {}))
    key_object = tags.get("keyObject")
    in_list = key_object in options["key_object"][0]
    inputs = {
        "scene_id": card["id"], "aspect_ratio": aspect, "age_group": card.get("ageGroup", "vorschul"),
        "style": tags.get("style", "random"), "color": tags.get("color", "random"),
        "key_object": key_object if in_list else ("custom (key_object_custom)" if key_object else "random"),
        "lighting": tags.get("lighting", "random"), "camera_angle": tags.get("cameraAngle", "random"),
        "camera_elevation": tags.get("cameraElevation", "random"), "camera_distance": tags.get("cameraDistance", "random"),
        "brand": tags.get("brand", "random"), "composition": tags.get("compositionStrategy", "random"),
        "clean_random_details": bool(card.get("cleanRandomDetails", False)), "variation": int(card.get("variation", 0)),
    }
    if key_object and not in_list:
        inputs["key_object_custom"] = key_object
    for tag, field in (("cameraBody", "camera_body"), ("lens", "lens"), ("aperture", "aperture"), ("depthOfField", "depth_of_field")):
        if tags.get(tag):  # optional node inputs: only a card that pins them sets them, the rest stay random as in the app
            inputs[field] = tags[tag]
    if tags.get("accessories"):
        inputs["accessories"] = "\n".join(tags["accessories"])
    if card.get("extraPrompt"):
        inputs["extra_prompt"] = card["extraPrompt"]
    if tags.get("wallArchitecture"):  # the Design node defaults to full-wall; a card may say otherwise
        inputs["wall_architecture"] = tags["wallArchitecture"]
    if card.get("stripRegex"):  # the card's own clean-up rules: without them the board prompt differs from the spec prompt
        inputs["strip_regex"] = "\n".join(card["stripRegex"])
    return inputs


def active_set() -> dict:
    """The generated file of the set named in specs/active_board.json (`set`), {} when there is none: its cards and clips (made by
    scripts/director.py from the kits, the roles and the facts of the listing) join the ones written by hand in the specs."""
    from reels_pipeline.director import load_generated

    try:
        return load_generated(json.loads((ROOT / "specs" / ACTIVE_FILE).read_text(encoding="utf-8")).get("set"))
    except FileNotFoundError:
        return {}


def load_video_spec(file: str = VIDEO_SPEC_FILE) -> dict:
    return json.loads((ROOT / "specs" / file).read_text(encoding="utf-8"))


def chain_models(spec, aspect: str) -> list:
    """The models whose nodes a chain carries. `spec` is one model id (just that node, as always), "all" (the owner's three models:
    Banana 2.1, GPT Image 2, Grok) or a list of model ids; a list or "all" keeps only the models whose schema accepts the format."""
    if isinstance(spec, str) and spec != "all":
        return [spec]
    wanted = list(BAY_MODELS) if spec == "all" else list(spec)
    models = supported_models(wanted, aspect)
    if not models:
        raise ValueError(f"no model of {wanted} accepts the format {aspect}")
    return models


def designs(dry_run: bool, model: str, card_ids: tuple, video: bool = False, video_dry_run: bool = True, spec_file: str = SPEC_FILE) -> dict:
    """
    ONE chain per scene: wallpaper (reference image) -> Design -> KIE Image -> preview,
    and with video=True the chain continues for the scenes that have a clip in specs/listing45_video.json: the frame the
    KIE Image node produced (its image_path output) goes straight into KIE Kling 2.6, with a window for the exact
    prompt/price report. The clip's full `prompt` (or prompt_suffix on top of DEFAULT_PROMPT) comes from that spec.
    The Kling node starts as dry_run (free): switching it to paid is a separate, explicit step with the credit number.
    """
    spec = json.loads((ROOT / "specs" / spec_file).read_text(encoding="utf-8"))
    generated = active_set()
    by_id = {c["id"]: c for c in spec["cards"] + generated.get("cards", [])}
    vspec = load_video_spec() if video else {}
    clips = {f["scene_id"]: f for f in vspec.get("frames", []) + generated.get("clips", [])}
    graph: dict = {"1": {"class_type": "MoonbloomWallpaper", "inputs": {
        "wallpaper_path": spec["wallpaper"], "use_texture": True, "out_dir": spec["out_dir"]}},
        "2": {"class_type": "PreviewImage", "inputs": {"images": ["1", 0]}}}
    n = 2
    for entry in card_ids:
        # an entry is a card id, or (card id, model), or (card id, model, prompt mode): the same card on several models or in
        # both prompt modes = a comparison board
        card_id, chain_model, prompt_mode = (tuple(entry) + (model, "full")[len(entry) - 1:]) if isinstance(entry, (tuple, list)) else (entry, model, "full")
        aspect = by_id[card_id].get("aspectRatio") or spec.get("aspect_ratio", "9:16")  # a card may have its own format (2:3, 4:3)
        models = chain_models(chain_model, aspect)  # one KIE node per model; a single model keeps the five-node chain and its node ids
        has_clip = video and card_id in clips and len(models) == 1
        step = 2 + 3 * len(models) + (2 if has_clip else 0)
        ids = [str(n + i) for i in range(1, step + 1)]
        n += step
        design, text = ids[:2]
        graph[design] = {"class_type": "MoonbloomDesign", "inputs": design_inputs(by_id[card_id], aspect, prompt_mode, spec.get("brief"))}
        graph[text] = {"class_type": "PreviewAny", "inputs": {"source": [design, 0]}}
        for index, one_model in enumerate(models):
            image, preview, image_report = ids[2 + 3 * index: 5 + 3 * index]
            graph[image] = image_node(one_model, {
                "prompt": [design, 0], "scene_id": [design, 1], "wallpaper_path": ["1", 1], "texture_path": ["1", 2],
                "out_dir": ["1", 3], "listing": ["1", 4], "aspect_ratio": aspect,
                "use_texture": True, "reuse_existing": True, "dry_run": dry_run,
                **({"reference_labels": False} if prompt_mode.startswith("brief") else {})})  # brief: the prompt assigns the roles of the references itself
            graph[preview] = {"class_type": "PreviewImage", "inputs": {"images": [image, 0]}}
            # The photo's report (live price, balance, request check; in a dry run this is the only thing the node shows, the
            # picture is a blank placeholder) in a window, like the Kling report of the video board.
            graph[image_report] = {"class_type": "PreviewAny", "inputs": {"source": [image, 2]}}
        if has_clip:
            kling, report = ids[5:]
            clip = clips[card_id]
            graph[kling] = {"class_type": "MoonbloomKieKling", "inputs": {
                "image_path": [image, 1], "scene_id": [design, 1], "out_dir": ["1", 3], "listing": ["1", 4],
                "duration": vspec["duration"], "sound": vspec["sound"],
                "min_motion_delta": clip.get("min_motion_delta", vspec["min_motion_delta"]),
                "reuse_existing": True, "dry_run": video_dry_run,
                "prompt_suffix": clip.get("prompt_suffix", ""), "prompt_override": clip_prompt(clip, vspec)}}
            graph[report] = {"class_type": "PreviewAny", "inputs": {"source": [kling, 1]}}  # report: prompt, price, motion
    return graph


def load_active() -> dict:
    return json.loads((ROOT / "specs" / ACTIVE_FILE).read_text(encoding="utf-8"))


def photos_board(active: dict = None) -> dict:
    """
    The photo board: only the cards in work. Finished frames stay on disk and are not pulled into the board.
    Every KIE Image node starts as dry_run (free: validates, shows the live price), like every Kling node of the video board:
    the Queue button of the window must never spend credits by itself. A paid card is switched ONE at a time with
    POST /moonbloom/open {"set": {"<node id>": {"dry_run": false}}, "run": true, "confirm_credits": N}.
    """
    photos = (active or load_active())["photos"]
    default_model = photos.get("model", IMAGE_MODELS[0])
    # an entry of `cards` is a card id (the board's model) or {"id", "model", "prompt": "full" | "brief"}: the same card on three models
    # or in both prompt modes = a comparison board
    # `models` (on the board or on an entry): "all" or a list = one KIE node of every such model in the chain, the model that PAYS is chosen at
    # run time (run_board.py --paid <model tag>); without it a chain has the one node of its `model`, as before.
    board_models = photos.get("models")
    cards = tuple((c, board_models or default_model, "full") if isinstance(c, str)
                  else (c["id"], c.get("models") or board_models or c.get("model", default_model), c.get("prompt", "full"))
                  for c in photos["cards"])
    assert len(cards) <= MAX_PHOTO_CHAINS, f"the photo board holds at most {MAX_PHOTO_CHAINS} chains, got {len(cards)}"
    graph = designs(True, default_model, cards, spec_file=photos.get("spec", SPEC_FILE))  # `spec`: the listing of the cards (default: Listing 45)
    assert len(graph) <= MAX_PHOTO_BOARD_NODES, (f"the photo board has {len(graph)} nodes, the budget is {MAX_PHOTO_BOARD_NODES}: "
                                                 "fewer chains or fewer models (a board is small on purpose)")
    return graph


def video_board(active: dict = None) -> dict:
    """
    The video board: per clip in work a Frame Picker (starts on the clip's own scene frame, can be swapped for any finished photo)
    -> Kling 2.6 (prompt of the clip from specs/listing45_video.json, starts as dry_run) -> report window; the picked photo is
    shown as a thumbnail. Photos arrive through the frames folder on disk, not through a wire between two tabs.
    """
    video = (active or load_active())["video"]
    scenes = list(video["scenes"])
    assert len(scenes) <= MAX_VIDEO_CLIPS, f"the video board holds at most {MAX_VIDEO_CLIPS} clips, got {len(scenes)}"
    vspec = load_video_spec(video.get("video_spec") or VIDEO_SPEC_FILE)  # a set of another listing names its own Kling locks
    clips = {f["scene_id"]: f for f in vspec["frames"] + active_set().get("clips", [])}
    graph: dict = {}
    n = 0
    for scene in scenes:
        clip = clips[scene]
        picker, preview, kling, report = (str(n + i) for i in (1, 2, 3, 4))
        n += 4
        graph[picker] = {"class_type": "MoonbloomFramePicker", "inputs": {"frame": clip.get("frame_file") or f"{clip.get('frame_scene_id', scene)}__nb21.png"}}
        graph[preview] = {"class_type": "PreviewImage", "inputs": {"images": [picker, 0]}}
        graph[kling] = {"class_type": "MoonbloomKieKling", "inputs": {
            "image_path": [picker, 1], "scene_id": [picker, 2], "out_dir": [picker, 3], "listing": [picker, 4],
            "duration": vspec["duration"], "sound": vspec["sound"],
            "min_motion_delta": clip.get("min_motion_delta", vspec["min_motion_delta"]),
            "reuse_existing": True, "dry_run": True,
            "prompt_suffix": clip.get("prompt_suffix", ""), "prompt_override": clip_prompt(clip, vspec)}}
        graph[report] = {"class_type": "PreviewAny", "inputs": {"source": [kling, 1]}}  # report: prompt, price, motion
        grok = video.get("grok")  # optional: a Grok video node on the SAME frame next to Kling (a comparison; Kling stays the working model)
        if grok and scene in set(grok.get("scenes") or scenes):
            g_node, g_report = str(n + 1), str(n + 2)
            n += 2
            graph[g_node] = {"class_type": "MoonbloomKieGrokVideo", "inputs": {
                "image_path": [picker, 1], "scene_id": [picker, 2], "out_dir": [picker, 3], "listing": [picker, 4],
                "model": grok.get("model", "grok-imagine-video-1-5-preview"), "resolution": grok.get("resolution", "720p"),
                "duration": int(grok.get("duration", 5)), "enable_audio": bool(grok.get("enable_audio", False)),
                "min_motion_delta": clip.get("min_motion_delta", vspec["min_motion_delta"]),
                "reuse_existing": True, "dry_run": True, "prompt_override": clip_prompt(clip, vspec)}}
            graph[g_report] = {"class_type": "PreviewAny", "inputs": {"source": [g_node, 1]}}
    for clip in video.get("explicit_clips") or []:  # a clip of any frame file on disk (not a set scene), on a named model: the 10.11 Kling 2.6 / Omni 1.2 comparison
        node, report = str(n + 1), str(n + 2)
        n += 2
        base = {"image_path": clip["image"], "scene_id": clip["id"], "out_dir": clip["out_dir"], "listing": clip.get("listing", ""),
                "min_motion_delta": clip.get("min_motion_delta", 2.0), "reuse_existing": True, "dry_run": True}
        if clip["model"] == "omni12":
            inputs = {**base, "resolution": clip.get("resolution", "720p"), "duration": int(clip.get("duration", 5)), "prompt_override": clip["prompt"]}
            if clip.get("last_image"):
                inputs["last_image_path"] = clip["last_image"]
            graph[node] = {"class_type": "MoonbloomKieOmniVideo", "inputs": inputs}
        elif clip["model"] == "kling26":
            graph[node] = {"class_type": "MoonbloomKieKling", "inputs": {**base, "duration": str(clip.get("duration", 5)), "sound": bool(clip.get("sound", False)),
                                                                          "prompt_suffix": "", "prompt_override": clip["prompt"]}}
        else:
            raise ValueError(f"explicit clip {clip['id']!r}: model {clip['model']!r} is not 'kling26' or 'omni12'")
        graph[report] = {"class_type": "PreviewAny", "inputs": {"source": [node, 1]}}  # report: prompt, price, motion
    assert len(video.get("explicit_clips") or []) <= MAX_EXPLICIT_CLIPS, f"the video board holds at most {MAX_EXPLICIT_CLIPS} explicit clips"
    return graph


def check(name: str, graph: dict) -> None:
    """Every node class exists, every required input is present, every link points at a real output slot."""
    builtin_outputs = {"PreviewImage": 0, "PreviewAny": 0}  # core nodes: class name is enough
    for node_id, node in graph.items():
        cls = node["class_type"]
        defs: dict = {}
        if cls in NODE_CLASS_MAPPINGS:
            spec = NODE_CLASS_MAPPINGS[cls].INPUT_TYPES()
            defs = {**spec["required"], **spec.get("optional", {})}
            missing = [k for k in spec["required"] if k not in node["inputs"]]
            assert not missing, f"{name}: node {node_id} ({cls}) misses required inputs {missing}"
        else:
            assert cls in builtin_outputs, f"{name}: unknown node class {cls}"
        for key, value in node["inputs"].items():
            if isinstance(value, list):
                src, slot = value
                src_cls = NODE_CLASS_MAPPINGS[graph[src]["class_type"]]
                assert slot < len(src_cls.RETURN_TYPES), f"{name}: node {node_id}.{key} links to missing output slot {slot} of {src}"
                if key in defs:  # ComfyUI rejects a link whose type differs from the input (a combo list never takes a link)
                    want, got = defs[key][0], src_cls.RETURN_TYPES[slot]
                    assert want == got, f"{name}: node {node_id}.{key} expects {want}, but is linked to a {got} output (return_type_mismatch)"
            elif key in defs and isinstance(defs[key][0], list):  # ComfyUI: value_not_in_list
                assert value in defs[key][0], f"{name}: node {node_id}.{key}={value!r} is not one of the node's options (value_not_in_list)"
    # The prompt is framed for the Design node's ratio and the picture is requested in the KIE Image node's ratio: two separate
    # dropdowns that must say the same (a combo cannot take a link, so they are typed twice).
    for node_id, node in graph.items():
        source = node["inputs"].get("prompt")
        if node["class_type"] in IMAGE_CLASSES and isinstance(source, list) and graph[source[0]]["class_type"] == "MoonbloomDesign":
            design_ratio, image_ratio = graph[source[0]]["inputs"].get("aspect_ratio"), node["inputs"].get("aspect_ratio")
            assert design_ratio == image_ratio, \
                f"{name}: Design {source[0]} is framed for {design_ratio}, but KIE Image {node_id} asks for {image_ratio}"


ACTIVE_BOARDS = ("moonbloom_photos_api.json", "moonbloom_video_api.json")  # the two boards the owner keeps open


def verify_live(files: dict) -> int:
    """
    Check every workflow against the nodes that are loaded in the RUNNING ComfyUI (GET /object_info: inputs, types, dropdown
    values, links), not against our own Python classes. Plain HTTP GET, read-only, no credits, no keys. A server that does not
    answer is an error. The two active boards must pass; the legacy boards only warn. Also refreshes api_truth/comfy/node_cards/.
    """
    from reels_pipeline import node_cards

    try:
        info = node_cards.fetch_object_info()
    except node_cards.ComfyOffline as exc:
        print(f"FAIL --verify-live: {exc}")
        return 2
    blocking = 0
    for name, graph in files.items():
        problems = node_cards.validate_graph(name, graph, info)
        kind = "ok  " if not problems else ("FAIL" if name in ACTIVE_BOARDS else "warn")
        print(f"{kind} live check {name}")
        for line in problems:
            print(f"      {line}")
        blocking += len(problems) if name in ACTIVE_BOARDS else 0
    ours = [n for n in info if n.startswith("Moonbloom")]
    changed = node_cards.save_cards(info, ours)
    print(f"live ComfyUI: {len(info)} nodes, ours {len(ours)}; cards in api_truth/comfy/node_cards: changed {changed or 'none'}")
    return 1 if blocking else 0


def main() -> int:
    live = "--verify-live" in sys.argv[1:]
    OUT_DIR.mkdir(exist_ok=True)
    files = {
        "listing45_interiors_api.json": interiors(False),
        "listing45_interiors_dryrun_api.json": interiors(True),
        "listing45_interiors_nb21_api.json": interiors(False, model="nano-banana-2-1"),
        # THE board of the girl's-room scenes, ONE workflow (owner 04.11: do not multiply boards):
        # Wallpaper -> Design -> KIE Image (nano-banana-2-1, reuse_existing) for scenes 2 and 3 (frames exist, 0 credits)
        # and the three new idea cards 6-8 (6 credits each). Free preview of every prompt = open this same workflow with all
        # image nodes switched to dry_run (comfy_nodes/bridge_logic.py "set"); paying = open it again without overrides,
        # with the credit number. Kling nodes with the new (non-zoom) motion prompts are added per scene afterwards.
        "listing45_girl_nb21_api.json": designs(False, "nano-banana-2-1", GIRL_CARDS + IDEA_CARDS + FINAL_CARDS, video=True),
        # THE TWO BOARDS the owner keeps open, one tab each (05.11): photos in work, and clips in work.
        "moonbloom_photos_api.json": photos_board(),
        "moonbloom_video_api.json": video_board(),
    }
    for name, graph in files.items():
        check(name, graph)
    if live:  # nothing is written when an active board does not pass the live server
        status = verify_live(files)
        if status:
            print("nothing was written")
            return status
    for name, graph in files.items():
        (OUT_DIR / name).write_text(json.dumps(graph, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"ok  {name}  ({len(graph)} nodes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
