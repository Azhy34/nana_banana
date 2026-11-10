"""
Capability cards of ComfyUI nodes, read from the LIVE server, and the check of a workflow against them.

GET /object_info answers from the nodes that are loaded RIGHT NOW (ComfyUI server.py: for every request it calls INPUT_TYPES() of
every class in nodes.NODE_CLASS_MAPPINGS), so it is the truth about what a board can use. The file api_truth/comfy/object_info.json
is only a copy from the day it was taken: nothing here reads it, and a server that does not answer is an error, not a reason to
trust the copy.

card(info) turns one /object_info entry into one flat shape, the same for any node (ours, built-in, partner):
  {class_name, display_name, category,
   required_inputs / optional_inputs: {name: {type, choices (COMBO), default, min, max, step, multiline, forceInput, tooltip}},
   outputs: {types, names}, output_node, hidden_inputs, ...}
validate_graph() checks an API-format workflow against the same data the way ComfyUI will (it names ComfyUI's own error codes).
Used by scripts/comfy_node_info.py (card) and scripts/build_comfy_workflows.py (--verify-live).
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import requests

from .config import PipelineConfig

CARDS_DIR = PipelineConfig.ROOT_DIR / "api_truth" / "comfy" / "node_cards"
OPTION_KEYS = ("default", "min", "max", "step", "multiline", "forceInput", "tooltip")


class ComfyOffline(RuntimeError):
    """ComfyUI does not answer. Nothing is read from the snapshot instead."""


def fetch_object_info(base_url: Optional[str] = None, timeout: float = 60.0) -> Dict[str, Any]:
    url = (base_url or PipelineConfig.COMFY_BASE_URL).rstrip("/") + "/object_info"
    try:
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        raise ComfyOffline(f"ComfyUI does not answer at {url} ({type(exc).__name__}: {exc}). Start it; the snapshot is not a substitute.") from exc


def _kind_and_options(spec: Any):
    if not isinstance(spec, (list, tuple)) or not spec:
        return spec, {}
    return spec[0], (spec[1] if len(spec) > 1 and isinstance(spec[1], dict) else {})


def normalize_input(spec: Any) -> Dict[str, Any]:
    """One input as /object_info writes it -> {type, choices, default, ...}. Knows both ways ComfyUI writes a dropdown."""
    kind, opts = _kind_and_options(spec)
    out: Dict[str, Any] = {}
    if isinstance(kind, list):  # classic dropdown: [[values...], {options}]
        out["type"], out["choices"] = "COMBO", list(kind)
    elif kind == "COMBO":  # newer dropdown: ["COMBO", {"options": [...]}]
        out["type"], out["choices"] = "COMBO", list(opts.get("options", []))
    elif kind == "COMFY_DYNAMICCOMBO_V3":  # the choice decides which further inputs exist
        options = opts.get("options", [])
        out["type"], out["choices"] = "DYNAMIC_COMBO", [o.get("key") for o in options]
        out["variants"] = {o.get("key"): {name: normalize_input(sub) for group in (o.get("inputs") or {}).values()
                                          for name, sub in (group or {}).items()} for o in options}
    else:
        out["type"] = kind
    out.update({k: opts[k] for k in OPTION_KEYS if k in opts})
    return out


def card(info: Dict[str, Any]) -> Dict[str, Any]:
    """One /object_info entry -> the flat capability card of the node."""
    inputs, order = info.get("input") or {}, info.get("input_order") or {}

    def group(name: str) -> Dict[str, Any]:
        specs = inputs.get(name) or {}
        return {key: normalize_input(specs[key]) for key in (order.get(name) or list(specs)) if key in specs}

    out: Dict[str, Any] = {
        "class_name": info.get("name"), "display_name": info.get("display_name"), "category": info.get("category"),
        "required_inputs": group("required"), "optional_inputs": group("optional"),
        "outputs": {"types": list(info.get("output") or []), "names": list(info.get("output_name") or [])},
        "output_node": bool(info.get("output_node")),
        "hidden_inputs": list(inputs.get("hidden") or {}),
    }
    for key in ("api_node", "deprecated", "experimental"):
        if info.get(key):
            out[key] = True  # api_node = a partner node that bills Comfy credits, not KIE credits
    if info.get("description"):
        out["description"] = info["description"]
    if info.get("python_module"):
        out["python_module"] = info["python_module"]
    return out


# ------------------------------------------------------------------ check a workflow like ComfyUI will

def _is_link(value: Any) -> bool:
    return isinstance(value, list) and len(value) == 2 and isinstance(value[1], int) and not isinstance(value[1], bool)


def _check_literal(where: str, spec: Dict[str, Any], value: Any) -> List[str]:
    kind = spec.get("type")
    if kind in ("COMBO", "DYNAMIC_COMBO"):
        return [] if value in spec.get("choices", []) else [f"{where}={value!r} is not one of {spec.get('choices')} (value_not_in_list)"]
    if kind == "BOOLEAN":
        return [] if isinstance(value, bool) else [f"{where}={value!r} must be true or false (invalid_input_type)"]
    if kind == "STRING":
        return [] if isinstance(value, str) else [f"{where}={value!r} must be text (invalid_input_type)"]
    if kind in ("INT", "FLOAT"):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or (kind == "INT" and isinstance(value, float) and value != int(value)):
            return [f"{where}={value!r} must be a number (invalid_input_type)"]
        if "min" in spec and value < spec["min"]:
            return [f"{where}={value!r} is below the minimum {spec['min']} (value_smaller_than_min)"]
        if "max" in spec and value > spec["max"]:
            return [f"{where}={value!r} is above the maximum {spec['max']} (value_bigger_than_max)"]
        return []
    return [f"{where} is a {kind} input: it takes a link from another node, not a typed value"]


def validate_graph(name: str, graph: Dict[str, Any], object_info: Dict[str, Any]) -> List[str]:
    """Problems of an API-format workflow against the nodes that are loaded in ComfyUI now ([] = ComfyUI will accept it)."""
    problems: List[str] = []
    cards: Dict[str, Dict[str, Any]] = {}

    def card_of(cls: str) -> Optional[Dict[str, Any]]:
        if cls not in object_info:
            return None
        if cls not in cards:
            cards[cls] = card(object_info[cls])
        return cards[cls]

    for node_id, node in graph.items():
        cls = node.get("class_type")
        c = card_of(cls)
        head = f"{name}: node {node_id} ({cls})"
        if c is None:
            problems.append(f"{head}: this class is not loaded in ComfyUI (missing_node_type)")
            continue
        known = {**c["required_inputs"], **c["optional_inputs"]}
        given = node.get("inputs", {})
        problems += [f"{head}: required input {key!r} is missing (required_input_missing)" for key in c["required_inputs"] if key not in given]
        for key, value in given.items():
            where = f"{head}.{key}"
            if key not in known:
                problems.append(f"{where}: the node has no such input (it has: {', '.join(known) or 'none'})")
                continue
            spec = known[key]
            if not _is_link(value):
                problems += _check_literal(where, spec, value)
                continue
            src_id, slot = str(value[0]), value[1]
            if src_id not in graph:
                problems.append(f"{where}: links to node {src_id}, which is not in the workflow")
                continue
            src = card_of(graph[src_id].get("class_type"))
            if src is None:  # reported once, on the source node itself
                continue
            types = src["outputs"]["types"]
            if slot >= len(types):
                problems.append(f"{where}: links to output {slot} of node {src_id}, which has only {len(types)}")
                continue
            want, got = spec.get("type"), str(types[slot])
            if want in ("COMBO", "DYNAMIC_COMBO"):
                problems.append(f"{where}: a dropdown takes a typed value, not a link (return_type_mismatch)")
            elif want != "*" and got != "*" and got not in str(want).split(","):
                problems.append(f"{where}: expects {want}, but is linked to a {got} output (return_type_mismatch)")
    return problems


# ------------------------------------------------------------------ keep the cards of our own nodes on disk

def save_cards(object_info: Dict[str, Any], names: Iterable[str], out_dir: Optional[Path] = None) -> List[str]:
    """
    Write api_truth/comfy/node_cards/<Class>.json (+ index.json) for the given classes from the LIVE data. A file is rewritten only
    when the card itself changed, so a re-run does not touch anything. Returns the classes that changed.
    """
    out_dir = Path(out_dir or CARDS_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    changed, index = [], {}
    for name in sorted(set(names)):
        body = card(object_info[name])
        path = out_dir / f"{name}.json"
        old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        old.pop("_meta", None)
        if old != body:
            payload = {"_meta": {"source": "live GET /object_info", "fetched_at": stamp}, **body}
            path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
            changed.append(name)
        index[name] = {"display_name": body["display_name"], "category": body["category"],
                       "required": list(body["required_inputs"]), "optional": list(body["optional_inputs"]),
                       "outputs": body["outputs"]["names"]}
    (out_dir / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    return changed
