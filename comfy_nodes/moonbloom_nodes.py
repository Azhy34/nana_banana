"""
Moonbloom ComfyUI nodes: wallpaper -> Design (prompt from the app) -> KIE photo (Nano Banana) -> Kling 2.6 clip, plus the
Frame Picker of the video board. Two boards, one tab each: see .agents/skills/comfy-pipeline/SKILL.md.

Thin wrappers only. All logic lives in reels_pipeline (shared with the CLI and the FastAPI gateway):
  prompts      -> services/promptGenerator.ts buildGeminiPrompt() via scripts/build_batch_prompts.mjs
  photos       -> KIE nano-banana-2 / nano-banana-2-1 (reels_pipeline.kie_generator)
  video        -> KIE kling-2.6/image-to-video (reels_pipeline.kling_bridge) + motion guard
Paid nodes have `dry_run` (validate and price only) and `reuse_existing` (default on: never pay twice
for a file that is already on disk). ComfyUI caches a node whose inputs did not change.
Do NOT use ComfyUI's partner nodes for this: they bill Comfy credits and have other fields than KIE.
"""

import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import torch
from PIL import Image

from reels_pipeline import kie_capabilities as caps
from reels_pipeline.config import PipelineConfig
from reels_pipeline.kie_generator import IMAGE_MODELS, MODEL_TAG, OTHER_IMAGE_NODES, KieImageGenerator, KieNanoBananaGenerator  # noqa: F401
from reels_pipeline.grok_video_bridge import MODEL_TAG as GROK_VIDEO_TAG, PREVIEW as GROK_VIDEO_PREVIEW, GrokVideoBridge, clip_name as grok_clip_name
from reels_pipeline.kling_bridge import DEFAULT_PROMPT, KlingBridge
from reels_pipeline.omni_video_bridge import RESOLUTIONS as OMNI_RESOLUTIONS, OmniVideoBridge, clip_name as omni_clip_name
from reels_pipeline.live_price import GROK_VIDEO_MODELS, KLING_MODEL
from reels_pipeline.prompts import build_batch_prompts, build_brief_prompt, load_spec, tag_options

SPECS_DIR = PipelineConfig.ROOT_DIR / "specs"
CATEGORY = "Moonbloom"
# The picture formats the owner uses for Etsy (first = default). KIE's schema allows more; only these are offered, and only
# those the schema still lists (reels_pipeline/kie_capabilities.py). The values of the other KIE dropdowns come from the schema too.
ETSY_ASPECT_RATIOS = ("9:16", "4:5", "4:3", "2:3", "3:2", "16:9", "1:1")
RESOLUTIONS = ("2K", "4K")  # owner 06.11: 2K is the minimum quality, 1K is never offered (the price depends on the size)
DURATIONS = ("5", "10")
REFERENCE_LABELS_INPUT = ("BOOLEAN", {"default": True, "tooltip": "ON: the long labels 'REFERENCE_IMAGE_1 / REFERENCE_IMAGE_2 ...' are put before the prompt (the app's full prompt needs them). "
                                      "OFF: the prompt itself says what image 1 and image 2 are (the brief prompt does)."})
DRY_RUN_TIP = "ON (default): only checks the request and shows the LIVE price, nothing is sent and no credits are spent. OFF: pays KIE credits."
DEFAULT_TEXTURE = PipelineConfig.ROOT_DIR / "public" / "textures" / "craft_lambda.jpg"
RANDOM = "random"
CUSTOM = "custom (key_object_custom)"
PROMPT_SOURCES = ("services/promptGenerator.ts", "Promt/trends.json", "scripts/build_batch_prompts.mjs")


def _mtimes(paths) -> str:
    return "|".join(str(p.stat().st_mtime_ns) if p.exists() else "-" for p in paths)


# Part of IS_CHANGED of the prompt-building nodes: after a hot reload (new code) ComfyUI rebuilds their
# cached outputs instead of showing results of the old code.
CODE_STAMP = _mtimes(sorted((PipelineConfig.ROOT_DIR / "comfy_nodes").glob("*.py"))
                     + sorted((PipelineConfig.ROOT_DIR / "reels_pipeline").glob("*.py")))


def _spec_files() -> List[str]:
    return sorted(p.name for p in SPECS_DIR.glob("*.json")) or ["(no spec files)"]


PREVIEW_MAX_SIDE = 768  # the canvas preview is a thumbnail: a 1536x2752 PNG per node made every tab heavy (owner 05.11)


def _to_tensor(path: Path, max_side: int = 0) -> "torch.Tensor":
    """The picture as a ComfyUI IMAGE. max_side > 0 shrinks it (long side) for a preview; the file on disk is never touched."""
    img = Image.open(path).convert("RGB")
    if max_side and max(img.size) > max_side:
        img.thumbnail((max_side, max_side), Image.LANCZOS)
    arr = np.asarray(img).astype(np.float32) / 255.0
    return torch.from_numpy(arr)[None, ...]


def _blank_tensor() -> "torch.Tensor":
    return torch.zeros((1, 64, 64, 3), dtype=torch.float32)


def _preview_video_ui(video_path: Path) -> Dict[str, Any]:
    """
    Show a finished clip in the ComfyUI window the way the built-in SaveVideo does
    (comfy_api.latest._ui.PreviewVideo -> {"images": [...], "animated": (True,)}).
    The window fetches files only from ComfyUI's output/input/temp folders, so a copy goes to temp/moonbloom/.
    """
    try:
        import folder_paths  # only importable inside ComfyUI

        temp_root = Path(folder_paths.get_temp_directory())
    except Exception:
        temp_root = Path(tempfile.gettempdir())
    sub = "moonbloom"
    dest_dir = temp_root / sub
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / Path(video_path).name
    shutil.copy2(video_path, dest)
    return {"images": [{"filename": dest.name, "subfolder": sub, "type": "temp"}], "animated": (True,)}


class MoonbloomListingScene:
    """Pick one card of a listing spec and build its prompt with the web app's own prompt logic."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "spec_file": (_spec_files(),),
            "card_number": ("INT", {"default": 1, "min": 1, "max": 20}),
            "variation": ("INT", {"default": 0, "min": 0, "max": 9999,
                                  "tooltip": "Change to re-roll the random trend picks (accessories, toys) of the prompt."}),
        }}

    RETURN_TYPES = ("STRING",) * 7
    RETURN_NAMES = ("prompt", "scene_id", "wallpaper_path", "texture_path", "out_dir", "listing", "aspect_ratio")
    FUNCTION = "build"
    CATEGORY = CATEGORY

    @classmethod
    def IS_CHANGED(cls, spec_file, card_number, variation):
        # ComfyUI reuses a node's last output while its inputs are unchanged. The prompt also depends on files,
        # so the value below changes (and the prompt is rebuilt) whenever the spec or a prompt source is edited.
        root = PipelineConfig.ROOT_DIR
        sources = [SPECS_DIR / spec_file, root / "services" / "promptGenerator.ts",
                   root / "Promt" / "trends.json", root / "scripts" / "build_batch_prompts.mjs"]
        return "|".join(str(p.stat().st_mtime_ns) if p.exists() else "-" for p in sources) + "|" + CODE_STAMP

    def build(self, spec_file: str, card_number: int, variation: int):
        spec = load_spec(SPECS_DIR / spec_file)
        cards = spec["cards"]
        if not 1 <= card_number <= len(cards):
            raise ValueError(f"{spec_file} has {len(cards)} cards, card_number={card_number}")
        card = {**cards[card_number - 1], "seed": int(variation)}  # the seed makes the prompt repeatable; another number re-rolls it
        aspect = card.get("aspectRatio") or spec.get("aspect_ratio", "9:16")  # a card may have its own format
        if aspect != "9:16":  # the app would roll scallop-trim (mural only on the lower two thirds) for these ratios
            card["tags"] = {"wallArchitecture": "full-wall", **card.get("tags", {})}
        built = build_batch_prompts([card], aspect_ratio=aspect)[0]
        texture = str(PipelineConfig.ROOT_DIR / spec["texture"]) if spec.get("texture") else ""
        return (built["prompt"], built["id"], spec["wallpaper"], texture, spec["out_dir"], spec.get("listing", ""), aspect)


class MoonbloomWallpaper:
    """The listing's wallpaper artwork: the reference every creative is built on. Shows it on the canvas."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "wallpaper_path": ("STRING", {"default": "", "tooltip": "Full path to the wallpaper artwork file (PNG/JPG)."}),
                "use_texture": ("BOOLEAN", {"default": True, "tooltip": "Also send the Craft Lambda paper texture as REFERENCE_IMAGE_2, like the app."}),
            },
            "optional": {
                "out_dir": ("STRING", {"default": "", "tooltip": "Where results go. Empty = the wallpaper's folder."}),
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("wallpaper", "wallpaper_path", "texture_path", "out_dir", "listing")
    FUNCTION = "load"
    CATEGORY = CATEGORY

    @classmethod
    def IS_CHANGED(cls, wallpaper_path, use_texture, out_dir=""):
        return f"{_mtimes([Path(wallpaper_path)]) if wallpaper_path else '-'}|{use_texture}|{out_dir}|{CODE_STAMP}"

    def load(self, wallpaper_path, use_texture, out_dir=""):
        path = Path(wallpaper_path.strip().strip('"'))
        if not path.is_file():
            raise FileNotFoundError(f"Wallpaper file not found: {wallpaper_path!r}")
        folder = Path(out_dir.strip()) if out_dir.strip() else path.parent
        texture = str(DEFAULT_TEXTURE) if use_texture and DEFAULT_TEXTURE.exists() else ""
        return (_to_tensor(path, PREVIEW_MAX_SIDE), str(path), texture, str(folder), path.parent.name)


class MoonbloomDesign:
    """One creative's design, chosen like a card in the app's Batch Generator; the prompt is built by the app's code."""

    @classmethod
    def INPUT_TYPES(cls):
        o = tag_options()
        key_objects = sorted({k for ks in o["keyObjectsByAge"].values() for k in ks})
        r = lambda items: [RANDOM] + list(items)  # noqa: E731
        return {
            "required": {
                "scene_id": ("STRING", {"default": "scene_01", "tooltip": "File name of the result: <scene_id>__nb21.png"}),
                # the same list as the KIE nodes (specs/ad_formats.json asks for 1:1 and 16:9 too): a ratio the Design node lacked made a valid set an invalid board
                "aspect_ratio": (list(ETSY_ASPECT_RATIOS), {"default": "9:16", "tooltip": "Set the same ratio on the KIE Image node."}),
                "age_group": (list(o["ageGroups"]), {"default": "vorschul"}),
                "style": (r(o["styles"]),),
                "color": (r(o["colors"]),),
                "key_object": ([RANDOM, CUSTOM] + key_objects, {"tooltip": "random = picked for the age group, as in the app"}),
                "lighting": (r(o["lighting"]),),
                "camera_angle": (r(o["cameraAngles"]),),
                "camera_elevation": (r(o["cameraElevations"]),),
                "camera_distance": (r(o["cameraDistances"]),),
                "brand": (r(o["brands"]),),
                "composition": (["unobstructed", "natural", RANDOM], {"default": "unobstructed"}),
                "clean_random_details": ("BOOLEAN", {"default": True, "tooltip": "Drop the app's random toys/decor that clash with a custom design."}),
                "variation": ("INT", {"default": 0, "min": 0, "max": 9999, "tooltip": "The seed of whatever is left random (brand, toys, decor): the same number always builds the same prompt, "
                                      "even after a reload or restart; change it to re-roll."}),
            },
            "optional": {
                "key_object_custom": ("STRING", {"default": "", "tooltip": "Used when key_object is 'custom'."}),
                "accessories": ("STRING", {"multiline": True, "default": "", "tooltip": "One per line; empty = random, as in the app."}),
                "extra_prompt": ("STRING", {"multiline": True, "default": "", "tooltip": "Free text added before the Avoid list."}),
                "strip_regex": ("STRING", {"multiline": True, "default": "", "tooltip": "One regular expression per line (spaces count). Whatever it matches is cut from the app's prompt, "
                                          "like `stripRegex` of a spec card: use it to drop the app's own focal-furniture / lived-in sentences that contradict the card."}),
                "wall_architecture": (["full-wall", "scallop-trim", RANDOM], {"default": "full-wall", "tooltip": "full-wall = the mural covers the whole wall (a mural listing). The app rolls scallop-trim "
                                      "(wallpaper only on the lower two thirds under a scalloped moulding) in 35% of the builds for every ratio except 9:16; random = like the app."}),
                "prompt_mode": (["full", "brief"], {"default": "full", "tooltip": "full = the web app's long prompt (written for generating a room from nothing, about 6 000 characters). "
                                "brief = a short structured prompt for a reference image (about 1 200 characters): what the photo is, the two references by number, the scene, light and camera. "
                                "brief uses the style and the colour you pick here (their words come from Promt/trends.json, the same file the web app reads), brief_subject / brief_scene / brief_framing, lighting, camera_body, lens, aperture and with_texture, and ignores the rest. "
                                "Aspect ratio, size and quality are fields of the request, never part of the text."}),
                "brief_subject": ("STRING", {"default": "", "tooltip": "brief: what the room is, e.g. 'a calm Japandi nursery for a baby under 2 years'."}),
                "brief_scene": ("STRING", {"multiline": True, "default": "", "tooltip": "brief: what is in the room, described positively (the only things in it, sizes, palette)."}),
                "brief_framing": ("STRING", {"multiline": True, "default": "", "tooltip": "brief: where the camera stands and what the frame shows (corners, ceiling line, floor)."}),
                "brief_product": ("STRING", {"default": "", "tooltip": "brief: what image 1 is, e.g. 'the wall mural' (from the listing's spec, key brief)."}),
                "brief_product_short": ("STRING", {"default": "", "tooltip": "brief: the short name of the product, e.g. 'the mural' (used in 'even on the mural')."}),
                "brief_wall_rule": ("STRING", {"multiline": True, "default": "", "tooltip": "brief: how the product sits on the wall, e.g. 'It covers the whole feature wall edge to edge, floor to ceiling...'. A fact of the listing: a scalloped-trim wallpaper covers only the lower two thirds."}),
                "brief_people": (["none", "from_behind"], {"default": "none", "tooltip": "brief: none = the room is empty of people; from_behind = a person is allowed, strictly from behind or in a half-turn from behind, never a face (owner rule)."}),
                "brief_anchor": ("BOOLEAN", {"default": False, "tooltip": "brief: add one sentence that tells the model to reproduce image 1 (the mural) unchanged on the wall."}),
                "with_texture": ("BOOLEAN", {"default": True, "tooltip": "brief: mention image 2 (the paper texture). Switch off when the KIE node does not send the texture."}),
                # the app picks these at random on every build; optional so boards made before still load
                "camera_body": (r(o["cameraBodies"]), {"tooltip": "random = picked by the app each build"}),
                "lens": (r(o["lenses"]), {"tooltip": "a wide 28mm suits a spacious room; random = picked by the app each build"}),
                "aperture": (r(o["apertures"]), {"tooltip": "higher f = more of the room sharp"}),
                "depth_of_field": (r(o["depthOfField"]), {"tooltip": "deep keeps the whole mural sharp"}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "scene_id")
    FUNCTION = "build"
    CATEGORY = CATEGORY

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        root = PipelineConfig.ROOT_DIR
        return _mtimes([root / p for p in PROMPT_SOURCES]) + "|" + CODE_STAMP + "|" + json.dumps(kwargs, sort_keys=True, ensure_ascii=False)

    def build(self, scene_id, aspect_ratio, age_group, style, color, key_object, lighting, camera_angle,
              camera_elevation, camera_distance, brand, composition, clean_random_details, variation,
              key_object_custom="", accessories="", extra_prompt="", strip_regex="", wall_architecture="full-wall",
              camera_body=RANDOM, lens=RANDOM, aperture=RANDOM, depth_of_field=RANDOM,
              prompt_mode="full", brief_subject="", brief_scene="", brief_framing="", with_texture=True, brief_anchor=False,
              brief_product="", brief_product_short="", brief_wall_rule="", brief_people="none"):
        if prompt_mode == "brief":  # no app prompt, nothing random: the same inputs always give the same short text
            pinned = lambda value: "" if value == RANDOM else value  # noqa: E731
            return (build_brief_prompt(brief_subject, brief_scene, brief_framing, pinned(lighting), pinned(camera_body),
                                       pinned(lens), pinned(aperture), bool(with_texture), bool(brief_anchor),
                                       {"product": brief_product, "product_short": brief_product_short, "wall_rule": brief_wall_rule}, brief_people,
                                       style=pinned(style), color=pinned(color)), scene_id)
        chosen = {"style": style, "color": color, "lighting": lighting, "cameraAngle": camera_angle,
                  "cameraElevation": camera_elevation, "cameraDistance": camera_distance, "brand": brand,
                  "compositionStrategy": composition, "cameraBody": camera_body, "lens": lens,
                  "aperture": aperture, "depthOfField": depth_of_field}
        tags = {k: v for k, v in chosen.items() if v != RANDOM}
        if wall_architecture != RANDOM:
            tags["wallArchitecture"] = wall_architecture
        if key_object == CUSTOM:
            if not key_object_custom.strip():
                raise ValueError("key_object is 'custom' but key_object_custom is empty")
            tags["keyObject"] = key_object_custom.strip()
        elif key_object != RANDOM:
            tags["keyObject"] = key_object
        items = [line.strip() for line in accessories.splitlines() if line.strip()]
        if items:
            tags["accessories"] = items
        card = {"id": scene_id, "ageGroup": age_group, "tags": tags, "cleanRandomDetails": bool(clean_random_details),
                "seed": int(variation)}  # `variation` is the seed: same inputs = same prompt (dry run == paid run, also after a restart)
        # Lines are NOT stripped: a trailing space is part of a rule (e.g. "...Layout: \. ").
        rules = [line for line in strip_regex.splitlines() if line.strip()]
        if rules:
            card["stripRegex"] = rules
        if extra_prompt.strip():
            card["extraPrompt"] = extra_prompt.strip()
        built = build_batch_prompts([card], aspect_ratio=aspect_ratio)[0]
        return (built["prompt"], scene_id)


class MoonbloomKieImage:
    """Generate one 9:16 interior on KIE Nano Banana. Paid: 6 credits (nano-banana-2-1) / 12 (nano-banana-2) at 2K."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"multiline": True, "forceInput": True}),
                "scene_id": ("STRING", {"default": "scene_01"}),
                "wallpaper_path": ("STRING", {"default": ""}),
                "out_dir": ("STRING", {"default": ""}),
                "listing": ("STRING", {"default": ""}),
                # the three dropdowns below come from KIE's own schema (api_truth/kie/<model>.schema.json), not from typed lists
                "aspect_ratio": (caps.choices(IMAGE_MODELS, "aspect_ratio", ETSY_ASPECT_RATIOS), {"default": "9:16"}),
                "model": (list(IMAGE_MODELS), {"default": IMAGE_MODELS[0]}),
                "resolution": (caps.choices(IMAGE_MODELS, "resolution", RESOLUTIONS), {"default": "2K"}),
                "use_texture": ("BOOLEAN", {"default": True}),
                "reuse_existing": ("BOOLEAN", {"default": True}),
                "dry_run": ("BOOLEAN", {"default": True, "tooltip": DRY_RUN_TIP}),
            },
            "optional": {"texture_path": ("STRING", {"default": ""}), "reference_labels": REFERENCE_LABELS_INPUT},
        }

    RETURN_TYPES = ("IMAGE", "STRING", "STRING")
    RETURN_NAMES = ("image", "image_path", "report")
    FUNCTION = "generate"
    CATEGORY = CATEGORY
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, dry_run=True, **kwargs):
        # A dry run is free and shows the LIVE price and balance, so it runs again every time; a paid run keeps the cache.
        return float("nan") if dry_run else CODE_STAMP

    def generate(self, prompt, scene_id, wallpaper_path, out_dir, listing, aspect_ratio, model, resolution,
                 use_texture, reuse_existing, dry_run, texture_path="", reference_labels=True):
        return _run_kie_image(model, prompt, scene_id, wallpaper_path, out_dir, listing, aspect_ratio, resolution,
                              use_texture, reuse_existing, dry_run, texture_path, reference_labels)


def _run_kie_image(model, prompt, scene_id, wallpaper_path, out_dir, listing, aspect_ratio, resolution,
                   use_texture, reuse_existing, dry_run, texture_path="", reference_labels=True):
    """What every KIE photo node does: a free check (dry run) or one paid generation. All logic is in reels_pipeline."""
    gen = KieImageGenerator()
    texture = Path(texture_path) if (use_texture and texture_path) else None
    if dry_run:
        report = gen.check_image_request(prompt=prompt, model=model, resolution=resolution, aspect_ratio=aspect_ratio,
                                         with_texture=texture is not None, reference_labels=reference_labels)
        return (_blank_tensor(), "", json.dumps(report, ensure_ascii=False))

    out_path = Path(out_dir) / f"{scene_id}__{MODEL_TAG.get(model, model)}.png"
    if reuse_existing and out_path.exists():
        return (_to_tensor(out_path, PREVIEW_MAX_SIDE), str(out_path), json.dumps({"ok": True, "reused": True, "path": str(out_path)}))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    record: Dict[str, Any] = gen.generate_image(
        prompt=prompt, wallpaper=Path(wallpaper_path), out_path=out_path, model=model, texture=texture,
        aspect_ratio=aspect_ratio, resolution=resolution, listing=listing, scene_id=scene_id, reference_labels=reference_labels,
    )
    if not record["ok"]:
        raise RuntimeError(f"KIE image failed: {record['error']}")
    return (_to_tensor(out_path, PREVIEW_MAX_SIDE), str(out_path), json.dumps(record, ensure_ascii=False))


MODEL_LABELS = {"gpt-image-2-image-to-image": "GPT Image 2", "grok-imagine-image-2-0/image-edit": "Grok Imagine 2.0 Edit"}


def make_kie_image_node(class_name: str, model: str):
    """
    ONE MODEL = ONE NODE, without hand-written code per model: the class is built from KIE's own schema of the model
    (api_truth/kie/<model>.schema.json). Only the fields the model HAS become inputs (Grok Edit has no resolution), the dropdown
    values and the tooltips come from the schema, so opening the node shows what the model can do. Add a model: see kie_generator.OTHER_IMAGE_NODES.
    """

    class _KieImageNode:
        MODEL = model

        @classmethod
        def INPUT_TYPES(cls):
            fields, info = caps.input_fields(cls.MODEL), caps.summary(cls.MODEL)
            ratios = caps.choices(cls.MODEL, "aspect_ratio", ETSY_ASPECT_RATIOS)
            limit = info["prompt"]["max_chars"]
            required = {
                "prompt": ("STRING", {"multiline": True, "forceInput": True,
                                      "tooltip": f"Positive prompt (from the Design node). KIE limit: {limit} characters. Negative prompt: {info['prompt']['negative_prompt']}."}),
                "scene_id": ("STRING", {"default": "scene_01"}),
                "wallpaper_path": ("STRING", {"default": ""}),
                "out_dir": ("STRING", {"default": ""}),
                "listing": ("STRING", {"default": ""}),
                "aspect_ratio": (ratios, {"default": "9:16" if "9:16" in ratios else ratios[0],
                                          "tooltip": f"KIE allows: {', '.join(info['aspect_ratios'] or [])}. Offered: the Etsy formats this model supports."}),
            }
            if "resolution" in fields:  # 2K is the minimum quality; the price per size is in the report of a dry run
                sizes = caps.choices(cls.MODEL, "resolution", RESOLUTIONS)
                required["resolution"] = (sizes, {"default": "2K" if "2K" in sizes else sizes[0],
                                                  "tooltip": f"KIE sells: {', '.join(info['resolutions'])}. 2K is the minimum quality here. "
                                                             f"{info['notes'].get('resolution', '')}"[:480]})
            required.update({
                "use_texture": ("BOOLEAN", {"default": True}),
                "reuse_existing": ("BOOLEAN", {"default": True}),
                "dry_run": ("BOOLEAN", {"default": True, "tooltip": DRY_RUN_TIP}),
            })
            return {"required": required, "optional": {"texture_path": ("STRING", {"default": ""}), "reference_labels": REFERENCE_LABELS_INPUT}}

        RETURN_TYPES = ("IMAGE", "STRING", "STRING")
        RETURN_NAMES = ("image", "image_path", "report")
        FUNCTION = "generate"
        CATEGORY = CATEGORY
        OUTPUT_NODE = True

        @classmethod
        def IS_CHANGED(cls, dry_run=True, **kwargs):
            return float("nan") if dry_run else CODE_STAMP

        def generate(self, prompt, scene_id, wallpaper_path, out_dir, listing, aspect_ratio, use_texture, reuse_existing,
                     dry_run, resolution=None, texture_path="", reference_labels=True):
            return _run_kie_image(self.MODEL, prompt, scene_id, wallpaper_path, out_dir, listing, aspect_ratio, resolution,
                                  use_texture, reuse_existing, dry_run, texture_path, reference_labels)

    _KieImageNode.__name__ = _KieImageNode.__qualname__ = class_name
    _KieImageNode.__doc__ = f"One picture on KIE {model} (paid). Built from the model's schema."
    return _KieImageNode


class MoonbloomKieKling:
    """Animate one approved 9:16 interior as a 5 s clip on KIE Kling 2.6 (the motion comes from the prompt). Paid: see kling_bridge.CREDITS."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_path": ("STRING", {"default": ""}),
                "scene_id": ("STRING", {"default": "scene_01"}),
                "out_dir": ("STRING", {"default": ""}),
                "listing": ("STRING", {"default": ""}),
                "duration": (caps.choices(KLING_MODEL, "duration", DURATIONS), {"default": "5"}),  # allowed values: KIE's schema
                "sound": ("BOOLEAN", {"default": False}),
                "min_motion_delta": ("FLOAT", {"default": 15.0, "min": 0.0, "max": 100.0, "step": 0.5}),
                "reuse_existing": ("BOOLEAN", {"default": True}),
                "dry_run": ("BOOLEAN", {"default": True, "tooltip": DRY_RUN_TIP}),
            },
            "optional": {
                "prompt_suffix": ("STRING", {"multiline": True, "default": ""}),
                "prompt_override": ("STRING", {"multiline": True, "default": ""}),
                "motion_zone": ("STRING", {"default": "", "tooltip": "MURAL LOCK (locked camera only): a polygon [[x, y], ...] or 'x0,y0,x1,y1' in fractions of the frame. Outside it every frame of the file is the first frame, so the wall cannot move. Empty = no lock."}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "BOOLEAN")
    RETURN_NAMES = ("video_path", "report", "motion_ok")
    FUNCTION = "animate"
    CATEGORY = CATEGORY
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, dry_run=False, **kwargs):
        # A dry run is free and shows the LIVE price and balance, so it always runs again (NaN never equals itself).
        # A paid run keeps ComfyUI's cache: the same inputs never spend credits twice (new code also re-runs it).
        return float("nan") if dry_run else CODE_STAMP

    def animate(self, image_path, scene_id, out_dir, listing, duration, sound, min_motion_delta,
                reuse_existing, dry_run, prompt_suffix="", prompt_override="", motion_zone=""):
        if not image_path or not Path(image_path).exists():
            raise FileNotFoundError(f"image_path does not exist: {image_path!r} (pick the approved frame first)")
        out_path = Path(out_dir) / f"{scene_id}__kling26_pushin_9x16.mp4"
        if reuse_existing and out_path.exists() and not dry_run:
            report = json.dumps({"ok": True, "reused": True, "path": str(out_path)}, ensure_ascii=False)
            return {"ui": _preview_video_ui(out_path), "result": (str(out_path), report, True)}
        bridge = KlingBridge()
        bridge.animate_interior_scene(
            image_path=Path(image_path), output_mp4_path=out_path, listing_name=listing, scene_name=scene_id,
            custom_prompt_suffix=prompt_suffix.strip(), prompt=prompt_override.strip() or DEFAULT_PROMPT,
            duration=duration, sound=sound, min_motion_delta=min_motion_delta, dry_run=dry_run, motion_zone=motion_zone.strip() or None,
        )  # raises RuntimeError / MotionGuardError: ComfyUI shows it on the node
        result = bridge.last_result
        motion_ok = bool((result.get("motion") or {}).get("ok", dry_run))
        outputs = (str(out_path) if not dry_run else "", json.dumps(result, ensure_ascii=False), motion_ok)
        if dry_run or not out_path.exists():
            return outputs
        return {"ui": _preview_video_ui(out_path), "result": outputs}


# REMOVED FROM THE BOARDS 08.11 by the owner (Grok video: the mural moved, a child's body was distorted). Not registered in NODE_CLASS_MAPPINGS: ComfyUI does not load it.
class MoonbloomKieGrokVideo:
    """Animate one approved 9:16 frame as a clip on KIE Grok Imagine (xAI), next to Kling 2.6 on the same frame. Paid: live price per second."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_path": ("STRING", {"default": ""}),
                "scene_id": ("STRING", {"default": "scene_01"}),
                "out_dir": ("STRING", {"default": ""}),
                "listing": ("STRING", {"default": ""}),
                "model": (list(GROK_VIDEO_MODELS), {"default": GROK_VIDEO_PREVIEW}),
                "resolution": (caps.choices(GROK_VIDEO_PREVIEW, "resolution"), {"default": "720p"}),  # KIE defaults to 480p: always set here
                "duration": ("INT", {"default": 5, "min": 1, "max": 30, "tooltip": "Seconds. 1.5 Preview: 1-15. The older model: 6-30."}),
                "enable_audio": ("BOOLEAN", {"default": False, "tooltip": "1.5 Preview only. The older model always has a sound track."}),
                "min_motion_delta": ("FLOAT", {"default": 15.0, "min": 0.0, "max": 100.0, "step": 0.5}),
                "reuse_existing": ("BOOLEAN", {"default": True}),
                "dry_run": ("BOOLEAN", {"default": True, "tooltip": DRY_RUN_TIP}),
            },
            "optional": {
                "prompt_override": ("STRING", {"multiline": True, "default": ""}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "BOOLEAN")
    RETURN_NAMES = ("video_path", "report", "motion_ok")
    FUNCTION = "animate"
    CATEGORY = CATEGORY
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, dry_run=False, **kwargs):
        return float("nan") if dry_run else CODE_STAMP  # same rule as Kling: a dry run is always fresh, a paid run never spends twice

    def animate(self, image_path, scene_id, out_dir, listing, model, resolution, duration, enable_audio, min_motion_delta,
                reuse_existing, dry_run, prompt_override=""):
        if not image_path or not Path(image_path).exists():
            raise FileNotFoundError(f"image_path does not exist: {image_path!r} (pick the approved frame first)")
        if not prompt_override.strip():
            raise ValueError("prompt_override is empty: the motion of the clip comes from the prompt")
        out_path = Path(out_dir) / grok_clip_name(scene_id, model, resolution, duration)
        if reuse_existing and out_path.exists() and not dry_run:
            report = json.dumps({"ok": True, "reused": True, "path": str(out_path)}, ensure_ascii=False)
            return {"ui": _preview_video_ui(out_path), "result": (str(out_path), report, True)}
        bridge = GrokVideoBridge()
        try:
            bridge.animate(image_path=Path(image_path), output_mp4_path=out_path, prompt=prompt_override.strip(), model=model, resolution=resolution,
                           duration=duration, enable_audio=enable_audio, listing_name=listing, scene_name=scene_id,
                           min_motion_delta=min_motion_delta, dry_run=dry_run)
        finally:
            result = bridge.last_result  # a failed run still says what it priced and what happened (the exception shows on the node)
        motion_ok = bool((result.get("motion") or {}).get("ok", dry_run))
        outputs = (str(out_path) if not dry_run else "", json.dumps(result, ensure_ascii=False), motion_ok)
        if dry_run or not out_path.exists():
            return outputs
        return {"ui": _preview_video_ui(out_path), "result": outputs}


FRAME_PATTERN = "*__*.png"  # <scene_id>__<model tag>.png: what the photo nodes write


def frames_dir() -> Path:
    """The folder of the photos the video board animates: `out_dir` of the listing spec (the folder the photo board writes to).
    MOONBLOOM_FRAMES_DIR overrides it (tests, another listing)."""
    if os.environ.get("MOONBLOOM_FRAMES_DIR"):
        return Path(os.environ["MOONBLOOM_FRAMES_DIR"])
    try:
        listing = "listing45_interiors.json"  # the video block of the active board may name the listing of its set (`spec`)
        try:
            active = json.loads((PipelineConfig.ROOT_DIR / "specs" / "active_board.json").read_text(encoding="utf-8"))
            listing = (active.get("video") or {}).get("spec") or listing
        except Exception:
            pass
        spec = json.loads((PipelineConfig.ROOT_DIR / "specs" / listing).read_text(encoding="utf-8"))
        return Path(spec["out_dir"])
    except Exception:
        return Path.home() / "Desktop" / "Обои" / "Листинг 45"


def list_frames() -> List[str]:
    """Photo file names of the frames folder, newest first (what the video board's picker offers)."""
    folder = frames_dir()
    if not folder.is_dir():
        return []
    files = sorted(folder.glob(FRAME_PATTERN), key=lambda f: f.stat().st_mtime, reverse=True)
    return [f.name for f in files]


class MoonbloomFramePicker:
    """
    Video board: pick a finished photo from the frames folder and hand it to a video node. This is how a photo made on the
    photo board arrives at the video board: through the folder on disk, not through a wire between two tabs.
    """

    @classmethod
    def INPUT_TYPES(cls):
        frames = list_frames() or ["(no frames yet)"]
        return {"required": {"frame": (frames, {"tooltip": "Newest photos first; the list refreshes with the node definitions."})}}

    RETURN_TYPES = ("IMAGE", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("image", "image_path", "scene_id", "out_dir", "listing")
    FUNCTION = "pick"
    CATEGORY = CATEGORY

    @classmethod
    def IS_CHANGED(cls, frame):
        path = frames_dir() / frame
        return f"{_mtimes([path]) if path.is_file() else '-'}|{frame}|{CODE_STAMP}"

    def pick(self, frame):
        folder = frames_dir()
        path = (folder / Path(frame).name).resolve()  # a plain file name only: no paths out of the folder
        if path.parent != folder.resolve() or not path.is_file():
            raise FileNotFoundError(f"frame not found in {folder}: {frame!r}")
        return (_to_tensor(path, PREVIEW_MAX_SIDE), str(path), path.stem.split("__")[0], str(folder), folder.name)


class MoonbloomImageFile:
    """Show any image file on the canvas and pass its path on (for example the approved frame for the Kling node)."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"image_path": ("STRING", {"default": "", "tooltip": "Full path to a PNG/JPG file."})}}

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("image", "image_path")
    FUNCTION = "load"
    CATEGORY = CATEGORY

    @classmethod
    def IS_CHANGED(cls, image_path):
        return f"{_mtimes([Path(image_path)]) if image_path else '-'}|{CODE_STAMP}"

    def load(self, image_path):
        path = Path(image_path.strip().strip('"'))
        if not path.is_file():
            raise FileNotFoundError(f"Image file not found: {image_path!r}")
        return (_to_tensor(path, PREVIEW_MAX_SIDE), str(path))


class MoonbloomKieOmniVideo:
    """Animate one approved 9:16 frame as a clip on KIE Gemini Omni 1.2 Flash (Google), next to Kling 2.6 on the same frame (added 10.11.2026 to compare them).
    With `last_image_path` the clip goes from the first frame to that one (3-10 s), without it from the first frame only (3-15 s). Paid: live price per second. The sound is always on."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_path": ("STRING", {"default": ""}),
                "scene_id": ("STRING", {"default": "scene_01"}),
                "out_dir": ("STRING", {"default": ""}),
                "listing": ("STRING", {"default": ""}),
                "resolution": (list(OMNI_RESOLUTIONS), {"default": "720p"}),  # 360p is in KIE's schema but never used (owner)
                "duration": ("INT", {"default": 5, "min": 3, "max": 15, "tooltip": "Seconds. First frame only: 3-15. With a last frame: 3-10."}),
                "min_motion_delta": ("FLOAT", {"default": 15.0, "min": 0.0, "max": 100.0, "step": 0.5}),
                "reuse_existing": ("BOOLEAN", {"default": True}),
                "dry_run": ("BOOLEAN", {"default": True, "tooltip": DRY_RUN_TIP}),
            },
            "optional": {
                "last_image_path": ("STRING", {"default": "", "tooltip": "A file path: the clip ends on this frame (the model interpolates). Empty = first frame only."}),
                "prompt_override": ("STRING", {"multiline": True, "default": ""}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 99999, "tooltip": "0 = random; otherwise 10000-99999 (KIE's range)."}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "BOOLEAN")
    RETURN_NAMES = ("video_path", "report", "motion_ok")
    FUNCTION = "animate"
    CATEGORY = CATEGORY
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, dry_run=False, **kwargs):
        return float("nan") if dry_run else CODE_STAMP  # same rule as Kling: a dry run is always fresh, a paid run never spends twice

    def animate(self, image_path, scene_id, out_dir, listing, resolution, duration, min_motion_delta, reuse_existing, dry_run,
                last_image_path="", prompt_override="", seed=0):
        if not image_path or not Path(image_path).exists():
            raise FileNotFoundError(f"image_path does not exist: {image_path!r} (pick the approved frame first)")
        if not prompt_override.strip():
            raise ValueError("prompt_override is empty: the motion of the clip comes from the prompt")
        last = last_image_path.strip()
        out_path = Path(out_dir) / omni_clip_name(scene_id, resolution, duration, bool(last))
        if reuse_existing and out_path.exists() and not dry_run:
            report = json.dumps({"ok": True, "reused": True, "path": str(out_path)}, ensure_ascii=False)
            return {"ui": _preview_video_ui(out_path), "result": (str(out_path), report, True)}
        bridge = OmniVideoBridge()
        try:
            bridge.animate(image_path=Path(image_path), output_mp4_path=out_path, prompt=prompt_override.strip(), resolution=resolution, duration=duration,
                           last_image_path=Path(last) if last else None, seed=seed or None, listing_name=listing, scene_name=scene_id,
                           min_motion_delta=min_motion_delta, dry_run=dry_run)
        finally:
            result = bridge.last_result  # a failed run still says what it priced and what happened (the exception shows on the node)
        motion_ok = bool((result.get("motion") or {}).get("ok", dry_run))
        outputs = (str(out_path) if not dry_run else "", json.dumps(result, ensure_ascii=False), motion_ok)
        if dry_run or not out_path.exists():
            return outputs
        return {"ui": _preview_video_ui(out_path), "result": outputs}


NODE_CLASS_MAPPINGS = {
    "MoonbloomWallpaper": MoonbloomWallpaper,
    "MoonbloomImageFile": MoonbloomImageFile,
    "MoonbloomFramePicker": MoonbloomFramePicker,
    "MoonbloomDesign": MoonbloomDesign,
    "MoonbloomListingScene": MoonbloomListingScene,
    "MoonbloomKieImage": MoonbloomKieImage,
    "MoonbloomKieKling": MoonbloomKieKling,
    "MoonbloomKieOmniVideo": MoonbloomKieOmniVideo,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MoonbloomWallpaper": "Moonbloom Wallpaper (the reference image)",
    "MoonbloomImageFile": "Moonbloom Image File (show a frame, pass its path)",
    "MoonbloomFramePicker": "Moonbloom Frame Picker (video board: choose a finished photo)",
    "MoonbloomDesign": "Moonbloom Design (choose design, prompt from the app)",
    "MoonbloomListingScene": "Moonbloom Listing Scene (prompt from the app)",
    "MoonbloomKieImage": "Moonbloom KIE Image (Nano Banana, paid)",
    "MoonbloomKieKling": "Moonbloom KIE Kling 2.6 Push-in (paid)",
    "MoonbloomKieOmniVideo": "Moonbloom KIE Gemini Omni 1.2 Video (paid)",
}

for _class_name, _model in OTHER_IMAGE_NODES.items():  # one node per other KIE photo model, built from its schema
    NODE_CLASS_MAPPINGS[_class_name] = make_kie_image_node(_class_name, _model)
    NODE_DISPLAY_NAME_MAPPINGS[_class_name] = f"Moonbloom KIE Image ({MODEL_LABELS.get(_model, _model)}, paid)"

# Lets the assistant open a workflow in the owner's ComfyUI window (see comfy_nodes/ui_bridge.py).
# Must never break the nodes themselves, so any problem here is only reported.
try:
    from comfy_nodes.ui_bridge import register_routes as _register_ui_routes

    _register_ui_routes()
except Exception as exc:  # noqa: BLE001
    print(f"[Moonbloom] UI bridge not loaded: {exc}")
