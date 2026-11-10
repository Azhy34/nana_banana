"""
KIE Nano Banana image generator (Google Gemini image models through KIE).

Models (verified against api_truth/kie/*.schema.json):
  nano-banana-2    Gemini 3.1 Flash Image   2K = 12 credits
  nano-banana-2-1  newer update             2K =  6 credits

How it follows the web app ("сборка"):
  - prompt text = services/promptGenerator.ts buildGeminiPrompt() via reels_pipeline.prompts
  - references = REFERENCE_IMAGE_1 wallpaper + REFERENCE_IMAGE_2 Craft Lambda texture, with the same
    labels as services/geminiService.ts (KIE has no per-image text parts, so the labels are the
    first lines of the prompt and image_input order matches)
  - negatives stay inside the prompt text (KIE nano-banana has no negative_prompt field)
Every call is journaled in telemetry.jsonl, failures included, with real credits (balance before/after).
"""

import json
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from api_discovery.kie_kling.client import KieKlingClient
from api_discovery.kie_kling.models import NanoBanana2Input, NanoBananaTaskCreateRequest

from . import kie_capabilities as caps
from . import live_price
from .config import PipelineConfig
from .preflight import PreflightShield
from .prompts import build_batch_prompts, load_spec
from .telemetry import TelemetryLogger

# The file tag of each photo model (<scene>__<tag>.png). Every model needs its schema snapshot api_truth/kie/<model>.schema.json.
MODEL_TAG = {"nano-banana-2-1": "nb21", "nano-banana-2": "nb2",
             "gpt-image-2-image-to-image": "gpt2", "grok-imagine-image-2-0/image-edit": "grok2"}
IMAGE_MODELS = ("nano-banana-2-1", "nano-banana-2")  # the Nano Banana family: ONE node (MoonbloomKieImage, `model` dropdown, pydantic shield); first = default
# Every other photo model has its OWN node, built from the model's schema (comfy_nodes/moonbloom_nodes.py): class name -> KIE model.
# To add a model: its schema snapshot (api_truth/refresh_api_truth.py KIE_MODELS), one line here, one tag in MODEL_TAG.
OTHER_IMAGE_NODES = {"MoonbloomKieGptImage2": "gpt-image-2-image-to-image", "MoonbloomKieGrokImagineEdit": "grok-imagine-image-2-0/image-edit"}
OTHER_IMAGE_MODELS = tuple(OTHER_IMAGE_NODES.values())
ALL_IMAGE_MODELS = IMAGE_MODELS + OTHER_IMAGE_MODELS
NODE_OF_MODEL = {model: name for name, model in OTHER_IMAGE_NODES.items()}  # the Nano Banana family is MoonbloomKieImage
CREDITS_2K = {"nano-banana-2": 12, "nano-banana-2-1": 6}  # FALLBACK only: quotes read the live KIE price (live_price.py)
CREDIT_USD = 0.005

# Same wording as services/geminiService.ts (generateBatchWithGemini, texture branch).
WALLPAPER_LABEL = (
    "REFERENCE_IMAGE_1 (Wallpaper Graphic Artwork): This is the exact wallpaper graphic design to display on the "
    "accent wall. Preserve all colors, illustrations, lines, and composition 1:1 without alteration."
)
TEXTURE_LABEL = (
    "REFERENCE_IMAGE_2 (Physical Material Texture Reference - Craft Lambda Non-Woven Sand Texture): This is a macro "
    "photograph of the real physical wallpaper material. Extract and copy ONLY the physical surface micro-relief: the "
    "fine-grain sand texture (Sandstruktur), non-woven paper fleece substrate, and ultra-matte chalky finish under "
    "natural daylight. DO NOT copy or transfer any graphic drawings or gold leaf designs from REFERENCE_IMAGE_2. "
    "Only transfer its physical paper texture and tactile surface grain onto the wall."
)


def split_prompt(prompt: str) -> Dict[str, Any]:
    """The positive part and the Avoid list of an app prompt (the models have no negative field: the list is the tail of the text)."""
    at = prompt.rfind(" Avoid:")
    if at < 0:
        return {"positive_chars": len(prompt), "avoid_items": []}
    tail = prompt[at + len(" Avoid:"):].strip().rstrip(".")
    return {"positive_chars": at, "avoid_items": [item.strip() for item in tail.split(",") if item.strip()]}


def _usage_from(result_json: Optional[str]) -> Dict[str, int]:
    """Token counts, IF the model's answer carries any (KIE bills photo models in credits and, so far, returns none)."""
    try:
        data = json.loads(result_json or "{}")
    except ValueError:
        return {}
    found: Dict[str, int] = {}

    def walk(node: Any, path: str = "") -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                walk(value, f"{path}.{key}" if path else key)
        elif isinstance(node, (int, float)) and not isinstance(node, bool) and re.search(r"token|usage", path, re.IGNORECASE):
            found[path] = int(node)

    walk(data)
    return found


def _as_png(path: Path) -> Dict[str, Any]:
    """The file is stored as .png: make it a real PNG when the model answered with another format. Returns pixel size and the old format."""
    from PIL import Image

    with Image.open(path) as image:
        size, source = list(image.size), image.format
        converted = None if source == "PNG" else image.convert("RGBA" if "A" in image.getbands() else "RGB")
    if converted is not None:
        converted.save(path, "PNG")
    return {"output_px": size, "converted_from": None if source == "PNG" else source}


PROMPT_LOG_DIR: Optional[Path] = None  # None = runs/prompts of the project (git-ignored); tests point it to a temp folder


def prompt_log_path(out_path: Path) -> Path:
    """Where the prompt log of a picture lives: runs/prompts/<picture>.prompt.json, NOT next to the picture (the folder of the listing holds
    only pictures). Old logs that still sit next to a picture are found by `find_prompt_log`."""
    folder = PROMPT_LOG_DIR or (PipelineConfig.ROOT_DIR / "runs" / "prompts")
    return folder / f"{Path(out_path).stem}.prompt.json"


def find_prompt_log(picture: Path) -> Optional[Path]:
    """The prompt log of a finished picture: the project's log folder first, then the old place next to the picture."""
    for candidate in (prompt_log_path(picture), Path(picture).with_suffix(".prompt.json")):
        if candidate.is_file():
            return candidate
    return None


def _slim_echo(echo: Any, prompt: str) -> Any:
    """KIE's echo of the request repeats the whole prompt; keep the rest (references, ratio, size, model) and say where the text is."""
    if not isinstance(echo, dict) or not isinstance(echo.get("input"), str):
        return echo
    try:
        body = json.loads(echo["input"])
    except ValueError:
        return echo
    if isinstance(body, dict) and isinstance(body.get("prompt"), str):
        body["prompt"] = "(the text of prompt_sent_to_kie_prefix + prompt)"
        return {**echo, "input": body}
    return echo


class KieImageGenerator:
    """One generator for every KIE photo model (the same journal, prompt file, live price and bill)."""

    def __init__(self, api_key: Optional[str] = None):
        self.client = KieKlingClient(api_key=api_key or PipelineConfig.get_kie_key())
        self._url_cache: Dict[str, str] = {}

    # ------------------------------------------------------------ helpers

    def balance(self) -> Optional[float]:
        res = self.client.get_credits()
        return float(res.data.data) if res.success and res.data else None

    def upload_reference(self, path: Path, tag: str) -> str:
        """Normalize (real bytes, no stretching) and upload once per run; returns the KIE CDN URL."""
        key = f"{Path(path).resolve()}|{tag}"
        if key not in self._url_cache:
            prepared = PreflightShield.prepare_reference(Path(path), tag=tag, prefer_png=(tag == "wallpaper"))
            res = self.client.upload_file(prepared, upload_path="nana-banana/refs")
            if not res.success or not res.data:
                err = res.error
                raise RuntimeError(f"upload of {tag} failed: [{err.code if err else '?'}] {err.msg if err else 'unknown'}")
            self._url_cache[key] = res.data.data.download_url
        return self._url_cache[key]

    # ------------------------------------------------------------ one image

    @staticmethod
    def with_reference_labels(prompt: str, with_texture: bool = True) -> str:
        """The long labels that say what image 1 and image 2 are (same wording as services/geminiService.ts); brief mode does without."""
        labels = [WALLPAPER_LABEL] + ([TEXTURE_LABEL] if with_texture else [])
        return "\n".join(labels) + "\n\n" + prompt

    def check_image_request(
        self, *, prompt: str, model: str, resolution: Optional[str] = "2K", aspect_ratio: str = "9:16", with_texture: bool = True,
        reference_labels: bool = True,
    ) -> Dict[str, Any]:
        """
        Dry run: build the exact request, validate it against KIE's own schema of the model, read the live price and the balance,
        send nothing. `request_preview` is the capability of the model at a glance: which fields go out with which values, the
        prompt against its limit (positive part and Avoid list apart), the references against their maximum, which usual fields
        this model does not have, the price at every size KIE sells.
        """
        refs = ["https://example.invalid/wallpaper.png"] + (["https://example.invalid/texture.jpg"] if with_texture else [])
        full_prompt = self.with_reference_labels(prompt, with_texture) if reference_labels else prompt
        body = caps.build_input(model, full_prompt, refs, aspect_ratio, resolution, "png")
        problems = caps.validate_input(model, body)
        if model in IMAGE_MODELS:  # the Nano Banana family also goes through its pydantic shield
            NanoBananaTaskCreateRequest(
                model=model,  # type: ignore[arg-type]
                input=NanoBanana2Input(
                    prompt=full_prompt, image_input=refs, aspect_ratio=aspect_ratio,  # type: ignore[arg-type]
                    resolution=resolution, output_format="png",  # type: ignore[arg-type]
                ),
            )
        desc = live_price.fetch_pricing_desc(model)
        table = live_price.parse_price_table(desc)
        expected = live_price.parse_image(desc, resolution) if desc else None  # live from KIE
        price_source = "live"
        if expected is None:
            expected, price_source = CREDITS_2K.get(model) if resolution == "2K" else None, "table (live price could not be read)"
        balance = self.balance()
        ref_field, limit = caps.ref_field(model), caps.prompt_limit(model)
        usual = {"aspect_ratio": aspect_ratio, "resolution": resolution, "output_format": "png"}
        preview = {
            "fields_sent": {k: v for k, v in body.items() if k not in ("prompt", ref_field)},
            "references": {"field": ref_field, "count": len(refs), "max": caps.input_fields(model).get(ref_field, {}).get("maxItems")},
            "prompt": {"chars_sent": len(full_prompt), "approx_tokens": round(len(full_prompt) / 4),  # an estimate: every model has its own tokenizer
                       "labels_added": reference_labels,  # False: the prompt itself assigns the roles of the two references (brief mode)
                       "limit": limit, "negative_field": caps.summary(model)["prompt"]["negative_prompt"], **split_prompt(prompt)},
            "not_in_this_model": sorted(k for k, v in usual.items() if v and k not in body),
            "price": {"selected": expected, "per_size": table or "cannot be quoted in advance (billed per token?)", "unit": "credits"},
        }
        return {
            "ok": not problems, "dry_run": True, "model": model, "resolution": resolution, "references": len(refs),
            "prompt_chars": len(prompt), "expected_credits": expected, "price_source": price_source, "balance": balance,
            "enough_balance": None if (balance is None or expected is None) else balance >= expected,
            "schema_problems": problems, "request_preview": preview,
        }

    def generate_image(
        self,
        *,
        prompt: str,
        wallpaper: Path,
        out_path: Path,
        model: str = "nano-banana-2",
        texture: Optional[Path] = None,
        aspect_ratio: str = "9:16",
        resolution: str = "2K",
        listing: str = "",
        scene_id: str = "",
        trace_id: Optional[str] = None,
        timeout: int = 360,
        reference_labels: bool = True,
    ) -> Dict[str, Any]:
        """Generate one image. Never raises for API problems: returns a record with ok=False and the error."""
        trace_id = trace_id or TelemetryLogger.generate_trace_id()
        out_path = Path(out_path)
        started = time.time()
        record: Dict[str, Any] = {
            "ok": False, "scene_id": scene_id, "model": model, "out_path": str(out_path), "task_id": None,
            "credits_spent": None, "balance_before": None, "balance_after": None, "duration_s": None, "error": None,
        }
        record["balance_before"] = self.balance()
        quoted = live_price.image_credits(model, resolution)  # the price KIE asks for this photo right now
        record["expected_credits"] = quoted if quoted is not None else (CREDITS_2K.get(model) if resolution == "2K" else None)
        record["price_source"] = "live" if quoted is not None else "table (live price could not be read)"
        record["resolution"] = resolution  # None for a model that has no resolution field
        sent_prompt: Optional[str] = None
        try:
            urls = [self.upload_reference(wallpaper, "wallpaper")]
            if texture:
                urls.append(self.upload_reference(texture, "texture"))
            full_prompt = self.with_reference_labels(prompt, bool(texture)) if reference_labels else prompt
            sent_prompt = full_prompt

            # The body comes from the model's own schema (field names, which fields exist) and is checked against it first.
            body = caps.build_input(model, full_prompt, urls, aspect_ratio, resolution, "png")
            problems = caps.validate_input(model, body)
            if problems:
                raise RuntimeError(f"the request does not fit KIE's schema of {model}: {'; '.join(problems)}")
            record["fields_sent"] = {k: v for k, v in body.items() if k not in ("prompt", caps.ref_field(model))}
            if model in IMAGE_MODELS:  # the Nano Banana family keeps its typed pydantic request
                request = NanoBananaTaskCreateRequest(
                    model=model,  # type: ignore[arg-type]
                    input=NanoBanana2Input(
                        prompt=full_prompt, image_input=urls, aspect_ratio=aspect_ratio,  # type: ignore[arg-type]
                        resolution=resolution, output_format="png",  # type: ignore[arg-type]
                    ),
                )
                created = self.client.create_image_task(request)
            else:
                created = self.client.create_task(model, body)
            if not created.success or not created.data:
                err = created.error
                raise RuntimeError(f"createTask failed: [{err.code if err else '?'}] {err.msg if err else 'unknown'}")
            record["task_id"] = created.data.data.task_id

            done = self.client.poll_and_download(record["task_id"], out_path, timeout_seconds=timeout, poll_interval=4)
            if not done.success:
                err = done.error
                raise RuntimeError(f"{err.msg if err else 'poll/download failed'}")

            info = self.client.last_task_info
            record["balance_after"] = self.balance()
            bill = live_price.billing(info.get("credits_consumed"), record["balance_before"], record["balance_after"], record["expected_credits"])
            record.update(ok=True, credits_spent=bill["billed"], credits_source=bill["billed_source"],
                          billing_warning=bill["billing_warning"], kie_cost_time_s=info.get("cost_time_s"))
            record["usage"] = _usage_from(info.get("result_json"))  # token counts if the answer has any (KIE bills credits)
            try:  # what KIE really received, and what size came back: for a model without a resolution field this is the only truth
                record["kie_echo"] = json.loads(info["param"]) if info.get("param") else None
            except ValueError:
                record["kie_echo"] = info.get("param")
            try:
                record.update(_as_png(out_path))
            except Exception as exc:  # measuring must never turn a picture that is already paid for into a failure
                record.update(output_px=None, size_error=f"{type(exc).__name__}: {exc}")
        except Exception as exc:  # keep batch runs alive; the journal records the reason
            record["error"] = str(exc)
            record["balance_after"] = self.balance()

        record["duration_s"] = round(time.time() - started, 1)
        credits = record["credits_spent"] or 0
        self._write_prompt_sidecar(out_path, record, prompt, sent_prompt, trace_id, resolution, aspect_ratio, wallpaper, texture)
        TelemetryLogger.log_event(
            stage="kie_image",
            trace_id=trace_id,
            listing=listing,
            duration_ms=int(record["duration_s"] * 1000),
            status="success" if record["ok"] else "failed",
            model=model,
            credits_spent=credits,
            cost_usd=credits * CREDIT_USD,
            tokens=record.get("usage") or None,  # KIE bills credits and returns no token counts; kept if a model ever does
            output_path=record["out_path"] if record["ok"] else None,
            error_message=record["error"],
            extra={
                "scene_id": scene_id, "task_id": record["task_id"], "resolution": resolution,
                "aspect_ratio": aspect_ratio, "prompt_chars": len(prompt), "references": 2 if texture else 1,
                "output_px": record.get("output_px"), "fields_sent": record.get("fields_sent"),
                "balance_before": record["balance_before"], "balance_after": record["balance_after"],
                "expected_credits": record["expected_credits"], "price_source": record["price_source"],
                "credits_source": record.get("credits_source"), "billing_warning": record.get("billing_warning"),
                "prompt_file": record.get("prompt_file"), "prompt_sha256": record.get("prompt_sha256"),
            },
        )
        return record

    @staticmethod
    def _write_prompt_sidecar(out_path: Path, record: Dict[str, Any], prompt: str, sent_prompt: Optional[str], trace_id: str,
                              resolution: Optional[str], aspect_ratio: str, wallpaper: Path, texture: Optional[Path]) -> None:
        """
        runs/prompts/<picture>.prompt.json (not next to the picture): the exact prompt (buildGeminiPrompt has random picks, so a good picture
        cannot be repeated without it), the text really sent to KIE, model, size, references, the price and the real bill.
        The web app logs the prompt in /api/log-event; this is the same for the ComfyUI path. Written for failures too.
        """
        import hashlib

        record["prompt_sha256"] = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
        # the text sent to KIE is the reference header lines + the prompt: keep the header only (the prompt is stored once)
        prefix = sent_prompt[:-len(prompt)] if sent_prompt and sent_prompt.endswith(prompt) else sent_prompt
        sidecar = prompt_log_path(out_path)
        try:
            sidecar.parent.mkdir(parents=True, exist_ok=True)
            sidecar.write_text(json.dumps({
                "scene_id": record["scene_id"], "model": record["model"], "resolution": resolution, "aspect_ratio": aspect_ratio,
                "prompt": prompt, "prompt_sent_to_kie_prefix": prefix, "prompt_sha256": record["prompt_sha256"],
                "references": {"wallpaper": str(wallpaper), "texture": str(texture) if texture else None},
                "trace_id": trace_id, "task_id": record["task_id"], "ok": record["ok"], "error": record["error"],
                "expected_credits": record.get("expected_credits"), "price_source": record.get("price_source"),
                "credits_spent": record["credits_spent"], "credits_source": record.get("credits_source"),
                "balance_before": record["balance_before"], "balance_after": record["balance_after"],
                "fields_sent": record.get("fields_sent"), "kie_echo": _slim_echo(record.get("kie_echo"), prompt),
                "output_px": record.get("output_px"), "converted_from": record.get("converted_from"), "usage": record.get("usage"),
                "written_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }, ensure_ascii=False, indent=1), encoding="utf-8")
            record["prompt_file"] = str(sidecar)
        except OSError as exc:  # a full disk must not hide the picture that was already paid for
            record["prompt_file"] = None
            record["prompt_file_error"] = str(exc)

    # ------------------------------------------------------------ a whole spec (several cards x models)

    def generate_from_spec(
        self,
        spec_path: Path,
        models: Sequence[str] = ("nano-banana-2-1",),
        only: Optional[Sequence[str]] = None,
        resolution: str = "2K",
        overwrite: bool = False,
        trace_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        spec_path = Path(spec_path)
        spec = load_spec(spec_path)
        trace_id = trace_id or TelemetryLogger.generate_trace_id()
        cards = [c for c in spec["cards"] if not only or c["id"] in only]
        prompts = build_batch_prompts(cards, aspect_ratio=spec.get("aspect_ratio", "9:16"))

        root = PipelineConfig.ROOT_DIR
        wallpaper = Path(spec["wallpaper"])
        texture = (root / spec["texture"]) if spec.get("texture") else None
        out_dir = Path(spec["out_dir"])
        out_dir.mkdir(parents=True, exist_ok=True)
        runs_dir = root / "runs" / spec_path.stem
        runs_dir.mkdir(parents=True, exist_ok=True)

        results: List[Dict[str, Any]] = []
        for card in prompts:
            card_results = []
            for model in models:
                out_path = out_dir / f"{card['id']}__{MODEL_TAG.get(model, model)}.png"
                if out_path.exists() and not overwrite:
                    card_results.append({"ok": True, "scene_id": card["id"], "model": model, "out_path": str(out_path), "skipped": "exists"})
                    continue
                print(f"[KIE image] {card['id']} on {model} ({resolution}, {spec.get('aspect_ratio', '9:16')}) ...")
                card_results.append(self.generate_image(
                    prompt=card["prompt"], wallpaper=wallpaper, out_path=out_path, model=model, texture=texture,
                    aspect_ratio=spec.get("aspect_ratio", "9:16"), resolution=resolution,
                    listing=spec.get("listing", ""), scene_id=card["id"], trace_id=trace_id,
                ))
            # Sidecar: exact tags + prompt actually sent (random trend picks make prompts non-reproducible otherwise).
            (runs_dir / f"{card['id']}.json").write_text(
                json.dumps({"tags": card["tags"], "prompt": card["prompt"], "results": card_results}, ensure_ascii=False, indent=1),
                encoding="utf-8",
            )
            results.extend(card_results)
        return results

    # ------------------------------------------------------------ backwards compatibility (server.py FastMCP)

    def generate_listing45_scenes(
        self,
        wallpaper_path: Optional[Path] = None,
        output_dir: Optional[Path] = None,
        listing_name: str = "Листинг 45",
        resolution: str = "2K",
        trace_id: Optional[str] = None,
    ) -> List[Path]:
        spec_path = PipelineConfig.ROOT_DIR / "specs" / "listing45_interiors.json"
        results = self.generate_from_spec(spec_path, resolution=resolution, trace_id=trace_id)
        return [Path(r["out_path"]) for r in results if r.get("ok")]


# The old name stays importable (the gateway, the CLI and the tests use it): the generator now serves every KIE photo model.
KieNanoBananaGenerator = KieImageGenerator
