"""
Bridge to the web app's prompt logic.

services/promptGenerator.ts (buildGeminiPrompt) is the project's source of truth for photo prompts.
We do not re-implement it in Python (it would drift): scripts/build_batch_prompts.mjs bundles that
file with esbuild and runs it, and this module calls the script.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import PipelineConfig

SCRIPT = PipelineConfig.ROOT_DIR / "scripts" / "build_batch_prompts.mjs"
_NODE_FALLBACKS = (r"C:\Program Files\nodejs\node.exe", r"C:\Program Files (x86)\nodejs\node.exe")


def _find_node() -> str:
    found = shutil.which("node")
    if found:
        return found
    for candidate in _NODE_FALLBACKS:  # GUI apps such as Comfy Desktop may start without node on PATH
        if os.path.exists(candidate):
            return candidate
    raise RuntimeError("Node.js not found: needed to run services/promptGenerator.ts via scripts/build_batch_prompts.mjs")


def _bridge_stamp() -> str:
    """Changes when any file the Node bridge reads changes (the answers cached below are then dropped)."""
    root = PipelineConfig.ROOT_DIR
    files = (SCRIPT, root / "services" / "promptGenerator.ts", root / "Promt" / "trends.json")
    return "|".join(str(f.stat().st_mtime_ns) if f.exists() else "-" for f in files)


def _run_bridge(spec: Dict[str, Any]) -> Any:
    proc = subprocess.run(
        [_find_node(), str(SCRIPT)],
        input=json.dumps(spec, ensure_ascii=False),
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=str(PipelineConfig.ROOT_DIR),
        timeout=90,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"build_batch_prompts.mjs failed (exit {proc.returncode}): {proc.stderr.strip()[:800]}")
    return json.loads(proc.stdout)


def build_batch_prompts(
    cards: List[Dict[str, Any]],
    aspect_ratio: str = "9:16",
    age_group: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    cards: [{"id": str, "ageGroup": str, "tags": {...overrides of BatchPromptTags}}]
    Returns [{"id", "tags", "prompt"}]. Tags not overridden are random, exactly as in the app.
    """
    spec: Dict[str, Any] = {"aspect_ratio": aspect_ratio, "cards": cards}
    if age_group:
        spec["ageGroup"] = age_group
    return _run_bridge(spec)


# ------------------------------------------------------------------ the "brief" prompt
# The short prompt for a reference image is built by services/promptGenerator.ts (buildBriefPrompt), the same file that builds the web
# app's prompt, from the same styles and variables (Promt/trends.json): ONE source of truth for the site and for the boards, whatever
# generates the picture. This module only calls it through the Node bridge. Nothing random: the same input is always the same text.
# What the code does NOT know is how the product sits on the wall; that is a fact of the LISTING, so it lives in the spec of the
# listing, key "brief": "product": "the wall mural" (what image 1 is), "product_short": "the mural", "wall_rule": "It covers ...".
BRIEF_RULE_KEYS = ("product", "product_short", "wall_rule")
PEOPLE_MODES = ("none", "from_behind")
_BRIEF_CACHE: Dict[str, str] = {}
_BRIEF_CACHE_STAMP = ""


def _brief_texts() -> Dict[str, str]:
    """The fixed sentences of the brief (intro, texture, uninhabited, people, anchor), read from the TS code, not copied."""
    key = "texts|" + _bridge_stamp()
    if key not in _BRIEF_CACHE:
        _BRIEF_CACHE[key] = json.dumps(_run_bridge({"briefTexts": True}))
    return json.loads(_BRIEF_CACHE[key])


_TEXT_OF = {"BRIEF_INTRO": "intro", "BRIEF_TEXTURE": "texture", "BRIEF_UNINHABITED": "uninhabited", "BRIEF_PEOPLE": "people", "BRIEF_ANCHOR": "anchor"}


def __getattr__(name: str) -> str:  # BRIEF_TEXTURE & co. exist for the tests and the director, without a second copy of the words
    if name in _TEXT_OF:
        return _brief_texts()[_TEXT_OF[name]]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def build_brief_prompts(items: List[Dict[str, Any]]) -> List[str]:
    """Several brief prompts in one call of the bridge; an item is the input of buildBriefPrompt (subject, scene, framing, lighting,
    cameraBody, lens, aperture, withTexture, anchor, people, rules). A bad item raises ValueError with the message of the TS code."""
    global _BRIEF_CACHE_STAMP
    stamp = _bridge_stamp()
    if stamp != _BRIEF_CACHE_STAMP:
        _BRIEF_CACHE.clear()
        _BRIEF_CACHE_STAMP = stamp
    keys = [json.dumps(item, sort_keys=True, ensure_ascii=False) for item in items]
    todo = sorted({k for k in keys if k not in _BRIEF_CACHE})
    if todo:
        for key, answer in zip(todo, _run_bridge({"brief": [json.loads(k) for k in todo]})):
            if "error" in answer:
                raise ValueError(answer["error"])
            _BRIEF_CACHE[key] = answer["text"]
    return [_BRIEF_CACHE[k] for k in keys]


def build_brief_prompt(subject: str, scene: str, framing: str, lighting: str = "", camera_body: str = "", lens: str = "",
                       aperture: str = "", with_texture: bool = True, anchor: bool = False,
                       rules: Optional[Dict[str, str]] = None, people: str = "none", style: str = "", color: str = "") -> str:
    """The short, structured prompt: what the photo is (in the chosen style), the two references by number, the scene (with the
    accent colour), light and camera, and the real-photograph line. `style` and `color` are names of Promt/trends.json."""
    return build_brief_prompts([{"subject": subject, "scene": scene, "framing": framing, "lighting": lighting, "cameraBody": camera_body,
                                 "lens": lens, "aperture": aperture, "withTexture": with_texture, "anchor": anchor,
                                 "people": people, "style": style, "color": color, "rules": rules}])[0]


# ------------------------------------------------------------------ the clip (Kling) prompt
# Kling's own guide (kling.ai/quickstart/image-to-video-guide): for image-to-video the prompt is "subject + movement": the scene is already
# in the picture, so only the motion is described, and it must be physically plausible. A painting-like picture tends to be answered with a
# pan across the painting: that is what the product lock (the painting is flat printed ink and never moves) is for. The locks are facts of
# the LISTING and live in its spec (key "lock"); a clip only brings its camera + motion text and the furniture of its frame.

def clip_prompt(clip: Dict[str, Any], video_spec: Dict[str, Any]) -> str:
    """The Kling prompt of one clip: motion text + the listing's product lock + the furniture lock for the clip's items."""
    if clip.get("prompt"):  # an old-style clip that carries its whole text
        return clip["prompt"]
    lock = video_spec.get("lock") or {}
    missing = [k for k in ("product", "furniture") if not lock.get(k)] + [k for k in ("motion", "items") if not clip.get(k)]
    if missing:
        raise ValueError(f"clip {clip.get('scene_id')!r}: cannot build the prompt, missing {missing} (the listing's `lock` and the clip's `motion` and `items`)")
    text = f"{clip['motion'].strip()} {lock['product'].strip()} {lock['furniture'].strip().format(items=clip['items'].strip())}"
    if clip.get("people") and lock.get("people"):  # a person in the frame: the head stays as in the first frame (a face that Kling invents is plastic)
        text += " " + lock["people"].strip()
    return text


def load_spec(spec_path: Path) -> Dict[str, Any]:
    return json.loads(Path(spec_path).read_text(encoding="utf-8"))


_OPTIONS_CACHE: Optional[Dict[str, Any]] = None


def tag_options() -> Dict[str, Any]:
    """
    The dropdown lists of the app's Batch card (TAG_OPTIONS + key objects per age group), read from
    services/promptGenerator.ts so the ComfyUI "Design" node offers exactly what the app offers.
    Cached per process: after editing Promt/trends.json restart the ComfyUI instance to refresh the lists.
    """
    global _OPTIONS_CACHE
    if _OPTIONS_CACHE is None:
        proc = subprocess.run(
            [_find_node(), str(SCRIPT)], input=json.dumps({"options": True}), capture_output=True,
            text=True, encoding="utf-8", cwd=str(PipelineConfig.ROOT_DIR), timeout=90,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"build_batch_prompts.mjs options failed: {proc.stderr.strip()[:400]}")
        _OPTIONS_CACHE = json.loads(proc.stdout)
    return _OPTIONS_CACHE
