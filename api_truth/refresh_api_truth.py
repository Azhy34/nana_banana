#!/usr/bin/env python3
"""
Refresh the API "source of truth" snapshots for the reels pipeline.

Read-only GET requests only: nothing here creates a task or spends KIE credits.

Writes into api_truth/:
  comfy/object_info.json   <- GET {COMFY}/object_info    (needs ComfyUI running)
  comfy/system_stats.json  <- GET {COMFY}/system_stats   (needs ComfyUI running)
  kie/<model>.schema.json  <- GET api.kie.ai/api/v1/models/{model}/schema
  kie/catalog_subset.json  <- catalog entry + price + 24h success rate per model
  docs/comfy/*.md          <- official ComfyUI docs pages, fetched by exact URL (docs.comfy.org, .md of each page)
  docs/kie/*.md            <- official KIE docs pages, fetched by exact URL (docs.kie.ai)
  MANIFEST.json            <- what was fetched, when, size, hash, status

Usage (from the nana_banana root):
  py -3.12 -X utf8 api_truth/refresh_api_truth.py            # everything
  py -3.12 -X utf8 api_truth/refresh_api_truth.py --only kie # or: --only comfy, --only docs

Secrets: the KIE key is read via PipelineConfig and is never printed or written.
"""

import argparse
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reels_pipeline.config import PipelineConfig  # noqa: E402

TRUTH_DIR = ROOT / "api_truth"
COMFY_URL = PipelineConfig.COMFY_BASE_URL.rstrip("/")
KIE_URL = "https://api.kie.ai"

# Models the pipeline actually calls. Add a model here to snapshot its schema.
KIE_MODELS: List[str] = [
    "kling-2.6/image-to-video",  # video
    "nano-banana-2",             # photo: Gemini 3.1 Flash Image
    "nano-banana-2-1",           # photo: newer update, cheaper
    "gpt-image-2-image-to-image",              # photo: OpenAI, 20000-char prompt, 16 references, 1K/2K/4K, flat price
    "grok-imagine-image-2-0/image-edit",       # photo: xAI, 8000-char prompt, 5 references, no resolution field, 4 credits
    "grok-imagine-video-1-5-preview",          # video: xAI, 1-15 s, 9:16, 480p/720p/1080p, enable_audio, first/last frame, loop, keyframes
    "grok-imagine/image-to-video",             # video: xAI, 6-30 s, audio cannot be turned off, aspect follows the image
    "google/gemini-omni-flash-1-2",            # video: Google Omni 1.2 Flash, 3-15 s (3-10 with first+last frame), 9 credits/s at 720p, audio always on (added 10.11)
]


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def slug(model: str) -> str:
    return model.replace("/", "__")


def write_json(path: Path, obj: Any) -> Dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, indent=1)
    path.write_text(text, encoding="utf-8")
    raw = text.encode("utf-8")
    return {
        "file": str(path.relative_to(TRUTH_DIR)).replace("\\", "/"),
        "bytes": len(raw),
        "sha256_12": hashlib.sha256(raw).hexdigest()[:12],
    }


def entry(name: str, status: str, detail: str = "", **extra: Any) -> Dict[str, Any]:
    item: Dict[str, Any] = {"name": name, "status": status, "fetched_at": now_iso(), "detail": detail}
    item.update(extra)
    return item


# ---------------------------------------------------------------- ComfyUI

def refresh_comfy() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    try:
        stats = requests.get(f"{COMFY_URL}/system_stats", timeout=5)
        stats.raise_for_status()
    except Exception as exc:  # server off is a normal state
        msg = f"ComfyUI not reachable at {COMFY_URL}: {type(exc).__name__}. Start it from Comfy Desktop and rerun."
        return [entry("comfy/object_info", "offline", msg), entry("comfy/system_stats", "offline", msg)]

    stats_json = stats.json()
    meta = write_json(TRUTH_DIR / "comfy" / "system_stats.json", stats_json)
    out.append(entry("comfy/system_stats", "ok", comfyui_version=stats_json.get("system", {}).get("comfyui_version"), **meta))

    try:
        info = requests.get(f"{COMFY_URL}/object_info", timeout=60)
        info.raise_for_status()
        info_json = info.json()
        meta = write_json(TRUTH_DIR / "comfy" / "object_info.json", info_json)
        mine = sorted(k for k, v in info_json.items() if str(v.get("category", "")).lower().startswith("moonbloom"))
        out.append(entry("comfy/object_info", "ok", node_count=len(info_json), moonbloom_nodes=mine, **meta))
    except Exception as exc:
        out.append(entry("comfy/object_info", "error", f"{type(exc).__name__}: {exc}"))
    return out


# ---------------------------------------------------------------- KIE

def kie_get(path: str, headers: Dict[str, str], params: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """GET with a polite pause and retry: KIE answers code=429 when called too fast."""
    body: Dict[str, Any] = {}
    for attempt in range(4):
        time.sleep(0.6 + attempt * 1.5)
        resp = requests.get(f"{KIE_URL}{path}", headers=headers, params=params, timeout=30)
        body = resp.json()
        if body.get("code") != 429:
            break
    if body.get("code") != 200:
        raise RuntimeError(f"KIE code={body.get('code')} msg={body.get('msg')}")
    return body["data"]


def compact_success_rate(data: Dict[str, Any]) -> Dict[str, Any]:
    points = data.get("points") or []
    rates = [p["successRate"] for p in points if p.get("successRate") is not None]
    return {
        "buckets_total": len(points),
        "buckets_with_traffic": len(rates),
        "avg_success_rate_24h": round(sum(rates) / len(rates), 1) if rates else None,
        "last_bucket": points[-1] if points else None,
    }


def refresh_kie() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    try:
        key = PipelineConfig.get_kie_key()
    except Exception as exc:
        return [entry("kie/*", "error", str(exc))]
    headers = {"Authorization": f"Bearer {key}"}

    try:
        balance = kie_get("/api/v1/chat/credit", headers)
        out.append(entry("kie/balance", "ok", f"credits: {balance}", balance_credits=balance))
    except Exception as exc:
        out.append(entry("kie/balance", "error", f"{type(exc).__name__}: {exc}"))

    catalog_subset: Dict[str, Any] = {}
    for model in KIE_MODELS:
        name = f"kie/{model}"
        try:
            data = kie_get(f"/api/v1/models/{model}/schema", headers)
            if not data.get("openapi"):
                out.append(entry(name, "error", "schema.openapi is null (not synced on KIE side)"))
                continue
            meta = write_json(TRUTH_DIR / "kie" / f"{slug(model)}.schema.json", data)
            paths = list(data["openapi"].get("paths", {}).keys())
            out.append(entry(name, "ok", paths=paths, **meta))
        except Exception as exc:
            out.append(entry(name, "error", f"schema: {type(exc).__name__}: {exc}"))
            continue

        info: Dict[str, Any] = {}
        for label, path in (("price", "price"), ("success_rate", "success-rate")):
            try:
                d = kie_get(f"/api/v1/models/{model}/{path}", headers)
                info[label] = d.get("pricingDesc") if label == "price" else compact_success_rate(d)
            except Exception as exc:
                info[label] = f"unavailable: {type(exc).__name__}: {exc}"
        catalog_subset[model] = info

    if catalog_subset:
        try:
            cat = kie_get("/api/v1/models", headers)
            by_id = {m.get("model"): m for m in cat.get("models", [])}
            for model, info in catalog_subset.items():
                m = by_id.get(model, {})
                info.update({k: m.get(k) for k in ("title", "provider", "taskType", "pricingDesc") if m.get(k) is not None})
        except Exception as exc:
            out.append(entry("kie/catalog", "error", f"{type(exc).__name__}: {exc}"))
        meta = write_json(TRUTH_DIR / "kie" / "catalog_subset.json", {"fetched_at": now_iso(), "models": catalog_subset})
        out.append(entry("kie/catalog_subset", "ok", f"{len(catalog_subset)} models", **meta))
    return out


# ---------------------------------------------------------------- official docs pages (exact URLs, no search)

COMFY_DOCS = "https://docs.comfy.org"
KIE_DOCS = "https://docs.kie.ai"

# Add a page here to keep it as a snapshot. Both sites serve the markdown of every page at <url>.md and an index at /llms.txt.
DOC_PAGES: Dict[str, Dict[str, str]] = {
    "comfy": {
        "llms-index": f"{COMFY_DOCS}/llms.txt",
        "server-routes": f"{COMFY_DOCS}/development/comfyui-server/comms_routes.md",
        "server-messages": f"{COMFY_DOCS}/development/comfyui-server/comms_messages.md",
        "custom-node-lifecycle": f"{COMFY_DOCS}/custom-nodes/backend/lifecycle.md",
        "custom-node-properties": f"{COMFY_DOCS}/custom-nodes/backend/server_overview.md",
        "js-extensions": f"{COMFY_DOCS}/custom-nodes/js/javascript_overview.md",
        "js-hooks": f"{COMFY_DOCS}/custom-nodes/js/javascript_hooks.md",
        "js-objects": f"{COMFY_DOCS}/custom-nodes/js/javascript_objects_and_hijacking.md",
        "js-toast": f"{COMFY_DOCS}/custom-nodes/js/javascript_toast.md",
        "node-PreviewAny": f"{COMFY_DOCS}/built-in-nodes/PreviewAny.md",
        "node-PreviewImage": f"{COMFY_DOCS}/built-in-nodes/PreviewImage.md",
        "node-LoadImage": f"{COMFY_DOCS}/built-in-nodes/LoadImage.md",
    },
    "kie": {
        "llms-index": f"{KIE_DOCS}/llms.txt",
        "nano-banana-2-1": f"{KIE_DOCS}/market/google/nanobanana-2-1.md",
        "nano-banana-2": f"{KIE_DOCS}/market/google/nanobanana2.md",
        "kling-2.6-image-to-video": f"{KIE_DOCS}/market/kling/image-to-video.md",
        "get-task-detail": f"{KIE_DOCS}/market/common/get-task-detail.md",
        "get-account-credits": f"{KIE_DOCS}/common-api/get-account-credits.md",
        "file-upload-quickstart": f"{KIE_DOCS}/file-upload-api/quickstart.md",
        "file-upload-base64": f"{KIE_DOCS}/file-upload-api/upload-file-base-64.md",
    },
}


def refresh_docs() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for provider, pages in DOC_PAGES.items():
        for name, url in pages.items():
            item = f"docs/{provider}/{name}"
            try:
                resp = requests.get(url, timeout=30)
                resp.raise_for_status()
                text = resp.content.decode("utf-8")
                if text.lstrip().lower().startswith("<!doctype html") or "<html" in text[:300].lower():
                    raise ValueError("got an HTML page, not markdown (the .md URL does not exist for this page)")
                path = TRUTH_DIR / "docs" / provider / f"{name}.md"
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf-8")
                raw = text.encode("utf-8")
                out.append(entry(item, "ok", url, url=url, file=str(path.relative_to(TRUTH_DIR)).replace("\\", "/"),
                                 bytes=len(raw), sha256_12=hashlib.sha256(raw).hexdigest()[:12]))
            except Exception as exc:
                out.append(entry(item, "error", f"{type(exc).__name__}: {exc}", url=url))
            time.sleep(0.3)
    return out


# ---------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh api_truth snapshots (read-only, no credits).")
    parser.add_argument("--only", choices=["comfy", "kie", "docs"], help="refresh only one source")
    args = parser.parse_args()

    items: List[Dict[str, Any]] = []
    if args.only in (None, "comfy"):
        items += refresh_comfy()
    if args.only in (None, "kie"):
        items += refresh_kie()
    if args.only in (None, "docs"):
        items += refresh_docs()

    # Keep previous entries for sources not refreshed in this run.
    manifest_path = TRUTH_DIR / "MANIFEST.json"
    previous: Dict[str, Any] = {}
    if manifest_path.exists():
        try:
            previous = {e["name"]: e for e in json.loads(manifest_path.read_text(encoding="utf-8")).get("items", [])}
        except Exception:
            previous = {}
    for it in items:
        if it["status"] != "ok" and previous.get(it["name"], {}).get("status") == "ok":
            it["note"] = "refresh failed, previous good snapshot kept on disk"
            it["last_ok_at"] = previous[it["name"]].get("fetched_at")
        previous[it["name"]] = it
    write_json(manifest_path, {"updated_at": now_iso(), "items": list(previous.values())})

    width = max(len(i["name"]) for i in items)
    for it in items:
        print(f"{it['status']:8} {it['name']:<{width}}  {str(it.get('detail') or it.get('file') or '')[:110]}")
    return 0 if any(i["status"] == "ok" for i in items) else 1


if __name__ == "__main__":
    raise SystemExit(main())
