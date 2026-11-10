"""
Onboarding of a new KIE photo model (scripts/add_model.py): answer "can our pipeline use this model, and what exactly must be written?"
from the model's OWN schema (api_truth/kie/<model>.schema.json) and its live price, then write the three registry lines.

The factory of nodes (comfy_nodes/moonbloom_nodes.make_kie_image_node) builds a node for any model whose request is: prompt, an array of
reference images, aspect_ratio, resolution, output_format (the last three optional). Anything else REQUIRED by the schema (for example
`quality`) is a blocker until the factory learns it; the report says so instead of leaving it to be found out at a paid run.
"""

import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

from . import kie_capabilities as caps

FACTORY_FIELDS = {"prompt", "aspect_ratio", "resolution", "output_format"}  # plus the reference field of the model
WANTED_RATIOS = ("9:16", "4:3", "2:3")  # the formats the owner uses
VIDEO_FIELDS = ("duration", "sound", "fps", "video_url", "video_urls")  # a photo model has none of these: they mean the output is a video
BRIEF_CHARS = 1500  # the short prompt of a card is about 1,100-1,800 characters
FULL_PROMPT_CHARS = 6300  # the web app's full prompt with the reference labels


def snapshot_schema(model: str, attempts: int = 6) -> Path:
    """GET /api/v1/models/{model}/schema (read-only, no credits) -> api_truth/kie/<model>.schema.json. Raises when KIE has no schema."""
    import json

    from .config import PipelineConfig

    headers = {"Authorization": f"Bearer {PipelineConfig.get_kie_key()}"}
    for attempt in range(attempts):
        body = requests.get(f"https://api.kie.ai/api/v1/models/{model}/schema", headers=headers, timeout=40).json()
        if body.get("code") == 429:  # KIE rate limit: wait and ask again
            time.sleep(2 + attempt)
            continue
        data = body.get("data")
        if not data or not data.get("openapi"):
            raise RuntimeError(f"KIE has no schema for {model!r} (code {body.get('code')}: {body.get('msg')}); check the exact id in GET /api/v1/models")
        path = caps.schema_path(model)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        caps._cache.pop(model, None)
        return path
    raise RuntimeError("KIE kept answering 429 (too many requests); try again in a minute")


def assess(model: str, price_table: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """{"ready", "blockers", "warnings", "summary"}: can the pipeline use the model as it is. price_table: live prices, None = not asked."""
    fields = caps.input_fields(model)
    ref = caps.ref_field(model)
    blockers: List[str] = []
    warnings: List[str] = []
    video = [k for k in VIDEO_FIELDS if k in fields]
    if video:
        blockers.append(f"it looks like a VIDEO model (fields {video}): this tool registers photo models; video goes through the Kling node")
    if not ref:
        blockers.append("the model takes no reference images: it cannot put our wallpaper into a room (text-to-image is not for us)")
    unsupported = [k for k in caps.required_fields(model) if k not in FACTORY_FIELDS and k != ref]
    if unsupported:
        blockers.append(f"the schema REQUIRES fields the node factory does not know: {unsupported} "
                        "(teach make_kie_image_node about them first, e.g. an enum dropdown with a default)")
    ratios = caps.enum(model, "aspect_ratio")
    if "aspect_ratio" in fields and ratios:
        have = [r for r in WANTED_RATIOS if r in ratios]
        if not have:
            blockers.append(f"none of our formats {list(WANTED_RATIOS)} is offered (it has {ratios})")
        elif len(have) < len(WANTED_RATIOS):
            warnings.append(f"no {[r for r in WANTED_RATIOS if r not in ratios]} (we use {list(WANTED_RATIOS)}); the node will offer only {have}")
    elif "aspect_ratio" not in fields:
        warnings.append("no aspect_ratio field: the frame follows the first reference image")
    sizes = caps.enum(model, "resolution")
    if "resolution" in fields and sizes and "2K" not in sizes:
        blockers.append(f"no 2K (the owner's minimum quality); it has {sizes}")
    if "resolution" not in fields:
        warnings.append("no resolution field: the size is set by the model, measure the pixels after a run")
    limit = caps.prompt_limit(model)
    if limit is not None and limit < BRIEF_CHARS:
        blockers.append(f"the prompt limit is {limit} characters: even the short brief prompt (about {BRIEF_CHARS}) does not fit")
    elif limit is not None and limit < FULL_PROMPT_CHARS:
        warnings.append(f"the prompt limit is {limit}: the web app's full prompt (about {FULL_PROMPT_CHARS}) does not fit, use prompt_mode=brief")
    if ref:
        maximum = fields.get(ref, {}).get("maxItems")
        if isinstance(maximum, int) and maximum < 2:
            blockers.append(f"it takes only {maximum} reference image(s): we send two (the mural and the paper texture)")
    if price_table is not None and not price_table:
        warnings.append("the price cannot be quoted in advance (billed per token or an unreadable text): the paid guard will refuse a paid run")
    return {"ready": not blockers, "blockers": blockers, "warnings": warnings, "summary": caps.summary(model)}


def node_class_for(model: str) -> str:
    return "MoonbloomKie" + "".join(part.capitalize() for part in re.split(r"[^A-Za-z0-9]+", model) if part)


def register(kie_models_text: str, generator_text: str, model: str, node_class: str, tag: str) -> Dict[str, str]:
    """
    The three registry edits as new texts (nothing is written here): the model in KIE_MODELS (api_truth/refresh_api_truth.py), its file
    tag in MODEL_TAG and its node in OTHER_IMAGE_NODES (reels_pipeline/kie_generator.py). Raises when any of them already exists.
    """
    if f'"{model}"' in kie_models_text.split("KIE_MODELS", 1)[-1].split("]", 1)[0]:
        raise ValueError(f"{model} is already in KIE_MODELS")
    if re.search(rf'"{re.escape(model)}"\s*:', generator_text):
        raise ValueError(f"{model} is already registered in kie_generator.py")
    if re.search(rf'"{re.escape(tag)}"', generator_text):
        raise ValueError(f"the file tag {tag!r} is already used: a tag identifies one model")
    if f'"{node_class}"' in generator_text:
        raise ValueError(f"the node class {node_class} already exists")
    models_text = re.sub(r"(KIE_MODELS: List\[str\] = \[.*?)(\n\])", lambda m: f'{m.group(1)}\n    "{model}",{m.group(2)}', kie_models_text, count=1, flags=re.DOTALL)
    gen = re.sub(r"(MODEL_TAG = \{.*?)\}", lambda m: f'{m.group(1)},\n             "{model}": "{tag}"}}', generator_text, count=1, flags=re.DOTALL)
    gen = re.sub(r"(OTHER_IMAGE_NODES = \{.*?)\}", lambda m: f'{m.group(1)},\n                     "{node_class}": "{model}"}}', gen, count=1, flags=re.DOTALL)
    if models_text == kie_models_text or gen.count(model) < 2:
        raise RuntimeError("could not find the registry blocks to edit (KIE_MODELS / MODEL_TAG / OTHER_IMAGE_NODES): the files changed shape, edit by hand")
    return {"kie_models": models_text, "generator": gen}
