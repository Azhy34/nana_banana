"""
Thin FastAPI gateway between the agent and ComfyUI / KIE.

Step A (this file): read-only. It answers "is the pipeline healthy?" and
"which nodes / endpoints / fields really exist?" from api_truth/ snapshots or
the live ComfyUI. Nothing here creates a task or spends KIE credits.

Run on demand from the nana_banana root (not a daemon):
    py -3.12 -X utf8 -m uvicorn reels_pipeline.api:app --port 8765

Reference for the agent: GET /openapi.json (human view: /docs).
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import __version__
from . import kie_capabilities as caps
from .comfy_client import ComfyClient
from .config import PipelineConfig
from .kie_generator import CREDITS_2K, IMAGE_MODELS, KieNanoBananaGenerator
from .kling_bridge import CREDITS as KLING_CREDITS, KlingBridge, MotionGuardError
from .live_price import KLING_MODEL
from .preflight import PreflightShield
from .prompts import build_batch_prompts, load_spec

TRUTH_DIR = PipelineConfig.ROOT_DIR / "api_truth"
OBJECT_INFO_PATH = TRUTH_DIR / "comfy" / "object_info.json"
KIE_DIR = TRUTH_DIR / "kie"
MANIFEST_PATH = TRUTH_DIR / "MANIFEST.json"
VIDEO_CREDITS = KLING_CREDITS[("5", False)]  # fallback estimate for Kling 2.6, 5 s, no sound; a real run is quoted at the live KIE price
REFRESH_HINT = "py -3.12 -X utf8 api_truth/refresh_api_truth.py"

class UTF8JSONResponse(JSONResponse):
    """Declare the charset: Windows PowerShell 5.1 otherwise decodes UTF-8 JSON as Latin-1 (Cyrillic breaks)."""
    media_type = "application/json; charset=utf-8"


app = FastAPI(
    title="Moonbloom reels gateway",
    version=__version__,
    default_response_class=UTF8JSONResponse,
    description=(
        "Agent-facing gateway for the wallpaper reels pipeline (ComfyUI + KIE). "
        "Read-only endpoints in this version: health, node and KIE schema discovery, telemetry. "
        "Source of truth for fields and nodes is api_truth/ (see /truth)."
    ),
)


# ------------------------------------------------------------------ helpers

def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _age_hours(path: Path) -> Optional[float]:
    if not path.exists():
        return None
    modified = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    return round((datetime.now(timezone.utc) - modified).total_seconds() / 3600, 1)


def _object_info(live: bool) -> Dict[str, Any]:
    if live:
        try:
            return ComfyClient().get_node_info()
        except Exception as exc:
            raise HTTPException(503, f"ComfyUI is not reachable at {PipelineConfig.COMFY_BASE_URL}: {type(exc).__name__}")
    if not OBJECT_INFO_PATH.exists():
        raise HTTPException(404, f"No node snapshot yet. Start ComfyUI in Comfy Desktop and run: {REFRESH_HINT} --only comfy")
    return _read_json(OBJECT_INFO_PATH)


def _slug(model: str) -> str:
    return model.replace("/", "__")


def _kie_summary(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Reduce a KIE OpenAPI document to: call path, required fields, and every input field."""
    openapi = doc.get("openapi") or {}
    for path, methods in (openapi.get("paths") or {}).items():
        for method, op in methods.items():
            if method.lower() != "post":
                continue
            schema = op["requestBody"]["content"]["application/json"]["schema"]
            input_schema = (schema.get("properties") or {}).get("input") or {}
            branches = input_schema.get("oneOf") or [input_schema]
            shapes = []
            for branch in branches:
                required = set(branch.get("required") or [])
                fields = []
                for name, spec in (branch.get("properties") or {}).items():
                    fields.append({
                        "name": name,
                        "type": spec.get("type"),
                        "required": name in required,
                        "enum": spec.get("enum"),
                        "default": spec.get("default"),
                        "max_items": spec.get("maxItems"),
                        "max_length": spec.get("maxLength"),
                        "description": re.sub(r"\s+", " ", spec.get("description") or "")[:240],
                    })
                shapes.append(fields)
            return {
                "method": method.upper(),
                "path": path,
                "top_level_required": schema.get("required"),
                "input_shapes": shapes,
            }
    return {"method": None, "path": None, "note": "no POST operation found in the schema"}


def _kie_catalog() -> Dict[str, Any]:
    path = KIE_DIR / "catalog_subset.json"
    return _read_json(path).get("models", {}) if path.exists() else {}


# ------------------------------------------------------------------ models

class HealthReport(BaseModel):
    ready_for_video: bool = Field(description=f"KIE balance covers one {VIDEO_CREDITS}-credit Kling clip")
    ready_for_graph: bool = Field(description="ComfyUI answers on its local port")
    kie: Dict[str, Any]
    comfy: Dict[str, Any]
    snapshots: Dict[str, Any]


# ------------------------------------------------------------------ routes

@app.get("/", include_in_schema=False)
def index() -> Dict[str, str]:
    return {"docs": "/docs", "openapi": "/openapi.json", "truth": "/truth", "health": "/health"}


@app.get("/health", response_model=HealthReport, summary="Is the pipeline ready? (KIE balance, ComfyUI, snapshots)")
def health() -> HealthReport:
    try:
        kie_ok, balance, message = PreflightShield.check_kie_credits(min_credits=VIDEO_CREDITS)
        kie: Dict[str, Any] = {"balance_credits": balance, "message": message}
    except Exception as exc:  # e.g. key missing in .env.local
        kie_ok, kie = False, {"balance_credits": None, "message": f"{type(exc).__name__}: {exc}"}

    comfy_ok, data = PreflightShield.check_comfy_health()
    comfy: Dict[str, Any] = {"online": comfy_ok, "url": PipelineConfig.COMFY_BASE_URL}
    if comfy_ok:
        device = (data.get("devices") or [{}])[0]
        comfy.update({
            "version": (data.get("system") or {}).get("comfyui_version"),
            "device": device.get("name"),
            "vram_total_mb": round(device.get("vram_total", 0) / 1024 / 1024),
        })
    else:
        comfy["hint"] = "Start the server from Comfy Desktop (it listens on 127.0.0.1:8188)."

    snapshots = {
        "object_info_age_h": _age_hours(OBJECT_INFO_PATH),
        "kie_schemas": sorted(p.name.replace(".schema.json", "") for p in KIE_DIR.glob("*.schema.json")) if KIE_DIR.exists() else [],
        "refresh": REFRESH_HINT,
    }
    return HealthReport(ready_for_video=kie_ok, ready_for_graph=comfy_ok, kie=kie, comfy=comfy, snapshots=snapshots)


@app.get("/truth", summary="What snapshots exist, when they were taken, and whether they are fresh")
def truth() -> Dict[str, Any]:
    manifest = _read_json(MANIFEST_PATH) if MANIFEST_PATH.exists() else {"items": []}
    return {
        "manifest": manifest,
        "files": {
            str(p.relative_to(TRUTH_DIR)).replace("\\", "/"): {"age_h": _age_hours(p), "bytes": p.stat().st_size}
            for p in sorted(TRUTH_DIR.rglob("*")) if p.is_file() and p.suffix in {".json", ".md"}
        },
        "refresh": REFRESH_HINT,
    }


@app.get("/nodes", summary="Search ComfyUI nodes of this installation (snapshot by default)")
def nodes(
    q: str = Query("", description="substring of class name, display name or category, e.g. 'moonbloom', 'KSampler', 'Kling'"),
    category: str = Query("", description="category prefix, e.g. 'Moonbloom' or 'api node'"),
    live: bool = Query(False, description="ask the running ComfyUI instead of the snapshot"),
    limit: int = Query(50, ge=1, le=500),
) -> Dict[str, Any]:
    info = _object_info(live)
    needle, cat = q.lower(), category.lower()
    found: List[Dict[str, Any]] = []
    for cls, spec in info.items():
        display = spec.get("display_name") or ""
        category_name = spec.get("category") or ""
        if needle and needle not in f"{cls} {display} {category_name}".lower():
            continue
        if cat and not category_name.lower().startswith(cat):
            continue
        found.append({
            "class": cls,
            "display_name": display,
            "category": category_name,
            "output_node": bool(spec.get("output_node")),
            "required_inputs": list((spec.get("input") or {}).get("required", {}).keys()),
            "outputs": spec.get("output"),
        })
    return {"source": "live" if live else "snapshot", "total_nodes": len(info), "matched": len(found), "nodes": found[:limit]}


@app.get("/nodes/{node_class}", summary="Full definition of one ComfyUI node (inputs, outputs, category)")
def node(node_class: str, live: bool = Query(False)) -> Dict[str, Any]:
    info = _object_info(live)
    if node_class not in info:
        close = [c for c in info if node_class.lower() in c.lower()][:10]
        raise HTTPException(404, f"Unknown node class '{node_class}'. Similar: {close}")
    return {"source": "live" if live else "snapshot", "class": node_class, "definition": info[node_class]}


@app.get("/kie/models", summary="KIE models we use: call path, price, 24h reliability")
def kie_models() -> Dict[str, Any]:
    catalog = _kie_catalog()
    out = []
    for path in sorted(KIE_DIR.glob("*.schema.json")) if KIE_DIR.exists() else []:
        doc = _read_json(path)
        model = doc.get("model") or path.name.replace(".schema.json", "")
        info = catalog.get(model, {})
        out.append({
            "model": model,
            "title": info.get("title"),
            "call": f"{_kie_summary(doc).get('method')} {_kie_summary(doc).get('path')}",
            "price": info.get("price"),
            "avg_success_rate_24h": (info.get("success_rate") or {}).get("avg_success_rate_24h"),
            "snapshot_age_h": _age_hours(path),
        })
    return {"models": out, "refresh": f"{REFRESH_HINT} --only kie"}


@app.get("/kie/models/{model:path}", summary="Exact request fields of one KIE model (from its official schema)")
def kie_model(model: str) -> Dict[str, Any]:
    path = KIE_DIR / f"{_slug(model)}.schema.json"
    if not path.exists():
        raise HTTPException(404, f"No schema snapshot for '{model}'. Add it to KIE_MODELS in api_truth/refresh_api_truth.py and run: {REFRESH_HINT} --only kie")
    info = _kie_catalog().get(model, {})
    return {
        "model": model,
        "schema_file": f"api_truth/kie/{path.name}",
        "snapshot_age_h": _age_hours(path),
        "request": _kie_summary(_read_json(path)),
        "price": info.get("price"),
        "success_rate_24h": info.get("success_rate"),
        "note": "Request body is {model, input:{...}}; upload files first to kieai.redpandaai.co and pass the returned downloadUrl.",
    }


@app.get("/telemetry", summary="Last records of the pipeline journal (reels_pipeline/telemetry.jsonl)")
def telemetry(limit: int = Query(10, ge=1, le=200)) -> Dict[str, Any]:
    path = PipelineConfig.TELEMETRY_LOG_PATH
    if not path.exists():
        return {"total": 0, "records": []}
    records = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return {"total": len(records), "records": records[-limit:]}


# ------------------------------------------------------------------ paid jobs (dry_run is ON by default)

class ImageJob(BaseModel):
    spec_file: str = Field(default="listing45_interiors.json", description="file in specs/")
    cards: List[str] = Field(default_factory=list, description="card ids; empty = all cards of the spec")
    models: List[str] = Field(default_factory=lambda: ["nano-banana-2"], description="nano-banana-2 (12 cr at 2K) and/or nano-banana-2-1 (6 cr)")
    resolution: str = Field(default="2K", pattern=caps.pattern(IMAGE_MODELS, "resolution"))  # allowed values: KIE's own schema
    overwrite: bool = False
    dry_run: bool = Field(default=True, description="true = build prompts, validate, price; sends nothing. Set false to spend credits.")


class VideoJob(BaseModel):
    image_path: str
    out_dir: str
    scene_id: str = "scene_01"
    listing: str = ""
    duration: str = Field(default="5", pattern=caps.pattern(KLING_MODEL, "duration"))  # allowed values: KIE's own schema
    sound: bool = False
    min_motion_delta: float = 15.0
    prompt_suffix: str = ""
    dry_run: bool = Field(default=True, description=f"true = validate and price ({VIDEO_CREDITS} credits for 5 s); sends nothing. Set false to spend.")


@app.post("/jobs/image", summary="Generate interior photos for a listing spec on KIE Nano Banana (dry_run by default)")
def jobs_image(job: ImageJob) -> Dict[str, Any]:
    spec_path = PipelineConfig.ROOT_DIR / "specs" / job.spec_file
    if not spec_path.exists():
        raise HTTPException(404, f"No spec {job.spec_file} in specs/")
    spec = load_spec(spec_path)
    cards = [c for c in spec["cards"] if not job.cards or c["id"] in job.cards]
    if not cards:
        raise HTTPException(422, f"No card of {job.spec_file} matches {job.cards}")
    expected = sum(CREDITS_2K.get(m, 0) for m in job.models) * len(cards) if job.resolution == "2K" else None
    if job.dry_run:
        prompts = build_batch_prompts(cards, aspect_ratio=spec.get("aspect_ratio", "9:16"))
        return {"dry_run": True, "calls": len(prompts) * len(job.models), "expected_credits": expected,
                "cards": [{"id": p["id"], "prompt_chars": len(p["prompt"]), "key_object": p["tags"]["keyObject"]} for p in prompts],
                "note": "nothing was sent; repeat with dry_run=false to generate"}
    results = KieNanoBananaGenerator().generate_from_spec(
        spec_path, models=job.models, only=job.cards or None, resolution=job.resolution, overwrite=job.overwrite)
    return {"dry_run": False, "expected_credits": expected, "results": results,
            "failed": [r for r in results if not r.get("ok")]}


@app.post("/jobs/video", summary="Animate one approved 9:16 frame on KIE Kling 2.6 (dry_run by default)")
def jobs_video(job: VideoJob) -> Dict[str, Any]:
    image = Path(job.image_path)
    if not image.exists():
        raise HTTPException(404, f"image_path does not exist: {job.image_path}")
    out = Path(job.out_dir) / f"{job.scene_id}__kling26_pushin_9x16.mp4"
    bridge = KlingBridge()
    try:
        bridge.animate_interior_scene(
            image_path=image, output_mp4_path=out, listing_name=job.listing, scene_name=job.scene_id,
            custom_prompt_suffix=job.prompt_suffix, duration=job.duration, sound=job.sound,
            min_motion_delta=job.min_motion_delta, dry_run=job.dry_run)
    except MotionGuardError as exc:  # paid and downloaded, but frozen: report, keep the file
        return {"ok": False, "frozen": True, "error": str(exc), "result": bridge.last_result}
    except RuntimeError as exc:
        raise HTTPException(502, f"{exc} | result: {bridge.last_result}")
    return {"ok": True, "result": bridge.last_result}
