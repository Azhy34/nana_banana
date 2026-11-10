"""
What a KIE model accepts, read from the snapshot of its OWN schema (one source instead of lists typed in five places).

Source of truth: api_truth/kie/<model>.schema.json = the answer of GET /api/v1/models/{model}/schema (OpenAPI), refreshed by
  py -3.12 -X utf8 api_truth/refresh_api_truth.py --only kie
The dropdowns of the ComfyUI nodes, the FastAPI gateway and the CLI take their allowed values from here; the tests compare the
rest (pydantic Literals in api_discovery, node defaults) with the same files, so a change at KIE shows up as a failing test,
not as a node that silently offers an old value.

A node may offer only a SUBSET of what the model supports (the owner's choice, e.g. the Etsy picture formats): pass it as `prefer`.
The subset keeps its order (the first value is the default), and values the schema no longer lists are dropped.

Add a model: put it in KIE_MODELS of api_truth/refresh_api_truth.py, refresh, write its node (see .agents/skills/comfy-pipeline/SKILL.md).
"""

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

from .config import PipelineConfig

SCHEMA_DIR = PipelineConfig.ROOT_DIR / "api_truth" / "kie"
CREATE_TASK = "/api/v1/jobs/createTask"
DETAIL_KEYS = ("enum", "default", "maxItems", "maxLength", "minimum", "maximum")

_cache: Dict[str, Tuple[int, Dict[str, Any], List[str]]] = {}


def schema_path(model: str) -> Path:
    """kling-2.6/image-to-video -> api_truth/kie/kling-2.6__image-to-video.schema.json (same slug as refresh_api_truth.py)."""
    return SCHEMA_DIR / f"{model.replace('/', '__')}.schema.json"


def _load(model: str) -> Tuple[Dict[str, Any], List[str]]:
    path = schema_path(model)
    stamp = path.stat().st_mtime_ns  # FileNotFoundError = the schema of this model was never snapshotted: refresh it
    hit = _cache.get(model)
    if hit and hit[0] == stamp:
        return hit[1], hit[2]
    doc = json.loads(path.read_text(encoding="utf-8"))
    body = doc["openapi"]["paths"][CREATE_TASK]["post"]["requestBody"]["content"]["application/json"]["schema"]
    inner = body["properties"]["input"]
    props, required = inner.get("properties", {}), list(inner.get("required", []))
    _cache[model] = (stamp, props, required)
    return props, required


def input_fields(model: str) -> Dict[str, Dict[str, Any]]:
    """The fields of the model's `input` object: {name: JSON-schema fragment}."""
    return _load(model)[0]


def required_fields(model: str) -> List[str]:
    return list(_load(model)[1])


def enum(model: str, field: str) -> List[str]:
    """Every value KIE allows for an enum field (as strings); [] when the field is not an enum."""
    return [str(v) for v in input_fields(model).get(field, {}).get("enum", [])]


def choices(models: Union[str, Sequence[str]], field: str, prefer: Sequence[str] = ()) -> List[str]:
    """
    Values to offer in a dropdown. With several models: only what ALL of them accept (a node that serves both).
    With `prefer`: that subset in that order, minus whatever the schema does not list; never empty.
    """
    names = [models] if isinstance(models, str) else list(models)
    allowed: List[str] = []
    for index, model in enumerate(names):
        values = enum(model, field)
        allowed = values if index == 0 else [v for v in allowed if v in values]
    if not prefer:
        return allowed
    return [v for v in prefer if v in allowed] or allowed


def pattern(models: Union[str, Sequence[str]], field: str, prefer: Sequence[str] = ()) -> str:
    """The same values as a regular expression, for pydantic Field(pattern=...)."""
    return "^(" + "|".join(re.escape(v) for v in choices(models, field, prefer)) + ")$"


def unsupported(models: Union[str, Sequence[str]], field: str, values: Sequence[Any]) -> List[str]:
    """Which of `values` some model does not accept: used by the tests that compare our own lists with the schema."""
    names = [models] if isinstance(models, str) else list(models)
    return sorted({str(v) for v in values for m in names if str(v) not in enum(m, field)})


REF_FIELD_NAMES = ("image_input", "input_urls", "image_urls")  # what KIE's photo models call the array of reference images
NO_NEGATIVE = "none: the model has no negative field, the Avoid list stays inside the prompt text"
NO_RESOLUTION = "none: the model has no resolution field, the size is set by the model (measured after a run)"


def ref_field(model: str) -> Optional[str]:
    """The name of the field that carries the reference images (an array of strings), read from the schema."""
    fields = input_fields(model)
    for name in REF_FIELD_NAMES:
        if fields.get(name, {}).get("type") == "array":
            return name
    return next((k for k, v in fields.items() if v.get("type") == "array" and v.get("items", {}).get("type") == "string"), None)


def prompt_limit(model: str) -> Optional[int]:
    """Characters KIE accepts in the prompt: `maxLength`, else the number its own description states ("up to 20,000 characters")."""
    spec = input_fields(model).get("prompt", {})
    if isinstance(spec.get("maxLength"), int):
        return spec["maxLength"]
    found = re.search(r"up to ([\d,]+) characters", spec.get("description", ""))
    return int(found.group(1).replace(",", "")) if found else None


def build_input(model: str, prompt: str, refs: Sequence[str] = (), aspect_ratio: Optional[str] = None,
                resolution: Optional[str] = None, output_format: Optional[str] = "png") -> Dict[str, Any]:
    """
    The `input` of a createTask for this model, from its schema: the reference field is whatever the model calls it, and a
    format / size / output field is set only when the model HAS it (Grok Edit has no resolution, GPT Image 2 no output_format).
    """
    fields = input_fields(model)
    body: Dict[str, Any] = {"prompt": prompt}
    if refs:
        field = ref_field(model)
        if not field:
            raise ValueError(f"{model} takes no reference images")
        body[field] = list(refs)
    if aspect_ratio and "aspect_ratio" in fields:
        body["aspect_ratio"] = aspect_ratio
    if resolution and "resolution" in fields:
        body["resolution"] = resolution
    if output_format and "output_format" in fields:
        allowed = enum(model, "output_format")
        body["output_format"] = output_format if output_format in allowed else (allowed[0] if allowed else output_format)
    return body


def validate_input(model: str, body: Dict[str, Any]) -> List[str]:
    """Problems of a request body against KIE's own schema of the model ([] = KIE should accept it)."""
    fields, problems = input_fields(model), []
    problems += [f"required field {k!r} is missing" for k in required_fields(model) if k not in body]
    for key, value in body.items():
        spec = fields.get(key)
        if spec is None:
            problems.append(f"{key!r} is not a field of {model} (it has: {', '.join(fields)})")
            continue
        if spec.get("enum") and str(value) not in [str(v) for v in spec["enum"]]:
            problems.append(f"{key}={value!r} is not one of {spec['enum']}")
        if spec.get("type") == "array":
            if not isinstance(value, list):
                problems.append(f"{key} must be a list")
            elif isinstance(spec.get("maxItems"), int) and len(value) > spec["maxItems"]:
                problems.append(f"{key} has {len(value)} items, the model takes at most {spec['maxItems']}")
        if spec.get("type") == "string" and not isinstance(value, str):
            problems.append(f"{key} must be text")
    limit = prompt_limit(model)
    if limit and isinstance(body.get("prompt"), str) and len(body["prompt"]) > limit:
        problems.append(f"the prompt has {len(body['prompt'])} characters, the model takes at most {limit}")
    return problems


def summary(model: str) -> Dict[str, Any]:
    """What the model accepts, in the words the owner asks about: prompt limit, negative prompt, references, ratios, sizes."""
    fields = input_fields(model)
    negatives = [k for k in fields if "negative" in k]
    ref = ref_field(model)
    handled = {"prompt", "aspect_ratio", "resolution", "output_format", ref}
    notes = {k: re.sub(r"\s+", " ", fields[k].get("description", ""))[:260] for k in ("resolution", "aspect_ratio") if fields.get(k, {}).get("description")}
    return {
        "model": model,
        "prompt": {"max_chars": prompt_limit(model), "negative_prompt": f"field {negatives[0]}" if negatives else NO_NEGATIVE},
        "references": {"field": ref, "max": fields.get(ref, {}).get("maxItems") if ref else None},
        "aspect_ratios": enum(model, "aspect_ratio") or None,
        "resolutions": enum(model, "resolution") or NO_RESOLUTION,
        "output_formats": enum(model, "output_format") or None,
        "required": required_fields(model),
        "other_fields": {k: {x: v[x] for x in ("type", "enum", "default") if x in v} for k, v in fields.items() if k not in handled},
        "notes": notes,
    }


def describe(model: str) -> Dict[str, Any]:
    """The whole capability of the model: {field: {type, required, enum, default, maxItems, ...}} (for the node cards)."""
    props, required = _load(model)
    out: Dict[str, Any] = {}
    for name, spec in props.items():
        item: Dict[str, Any] = {"type": spec.get("type"), "required": name in required}
        item.update({k: spec[k] for k in DETAIL_KEYS if k in spec})
        out[name] = item
    return out
