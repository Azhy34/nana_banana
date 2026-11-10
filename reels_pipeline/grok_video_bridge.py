"""
Bridge to KIE Grok Imagine image-to-video (xAI). A SECOND video model next to Kling 2.6 (kling_bridge.py stays the working one).

Two KIE models, requests built strictly from their snapshots in api_truth/kie (schema = GET /api/v1/models/{m}/schema):
  grok-imagine-video-1-5-preview  input {prompt<=4096, image_urls[1], aspect_ratio, resolution 480p|720p|1080p, duration 1..15 (integer),
                                  enable_audio (bool); also first_frame_url / last_frame_url / loop_url / keyframes, not used yet}
  grok-imagine/image-to-video     input {prompt<=5000, image_urls[<=7, ONE at 1080p], mode, duration "6".."30" (text), resolution, aspect_ratio
                                  (ignored for one image: the video follows the picture)}; KIE says audio cannot be turned off here
The resolution defaults to 480p at KIE, so it is ALWAYS sent. The price is per second and per resolution, read live (live_price.py);
a paid run refuses when it cannot be read. Dialogue written in a prompt is SPOKEN: clip prompts carry none.
Same safety as Kling: dry_run first, the live quote, the balance, the real bill from KIE, the motion guard, the journal.
"""

import time
from pathlib import Path
from typing import Any, Dict, Optional

from api_discovery.kie_kling.client import KieKlingClient

from . import kie_capabilities as caps
from . import live_price
from .config import PipelineConfig
from .motion_guard import MIN_FIRST_LAST_DELTA, check_motion
from .preflight import PreflightShield
from .telemetry import TelemetryLogger

CREDIT_USD = 0.005
PREVIEW, STABLE = live_price.GROK_VIDEO_MODELS
MODEL_TAG = {PREVIEW: "grok15", STABLE: "groki2v"}  # short tags in the file name and in `run_board.py --paid <tag>`
DURATION_RANGE = {PREVIEW: (1, 15), STABLE: (6, 30)}  # seconds, from the schemas


class MotionGuardError(RuntimeError):
    """The clip was generated and paid for, but it is frozen. The file is kept for inspection."""


def clip_name(scene_id: str, model: str, resolution: str, duration: int) -> str:
    """The file a clip is saved to. Resolution and length are part of the name: another setting is another clip (reuse_existing)."""
    return f"{scene_id}__{MODEL_TAG.get(model, 'grok')}_{resolution}_{duration}s_9x16.mp4"


def build_input(model: str, prompt: str, image_url: str, resolution: str, duration: int, enable_audio: bool = False) -> Dict[str, Any]:
    """The `input` of createTask for the model, from its schema; the sound switch only where the model has it."""
    body: Dict[str, Any] = {"prompt": prompt, "image_urls": [image_url], "aspect_ratio": "9:16", "resolution": resolution}
    if model == PREVIEW:
        body.update(duration=int(duration), enable_audio=bool(enable_audio))
    else:
        body.update(duration=str(int(duration)), mode="normal")  # the older model takes the length as text and has no sound switch
    return body


def problems_of(model: str, prompt: str, resolution: str, duration: int, image_url: str = "https://example.invalid/placeholder.jpg") -> list:
    """Everything that would make KIE refuse the request, found locally (the schema snapshot + the length range of the model)."""
    low, high = DURATION_RANGE[model]
    out = [] if low <= int(duration) <= high else [f"duration {duration} s: {model} takes {low}-{high} s"]
    return out + caps.validate_input(model, build_input(model, prompt, image_url, resolution, duration))


class GrokVideoBridge:
    def __init__(self, api_key: Optional[str] = None):
        self.client = KieKlingClient(api_key=api_key or PipelineConfig.get_kie_key())
        self.last_result: Dict[str, Any] = {}

    def _balance(self) -> Optional[float]:
        res = self.client.get_credits()
        return float(res.data.data) if res.success and res.data else None

    def animate(self, image_path: Path, output_mp4_path: Path, prompt: str, model: str = PREVIEW, resolution: str = "720p", duration: int = 5,
                enable_audio: bool = False, listing_name: str = "Листинг", scene_name: str = "scene_01", min_motion_delta: float = MIN_FIRST_LAST_DELTA,
                dry_run: bool = False, trace_id: Optional[str] = None) -> Path:
        """Animate one approved 9:16 frame. Returns the MP4 path; details in self.last_result. dry_run validates, prices and sends nothing."""
        trace_id = trace_id or TelemetryLogger.generate_trace_id()
        image_path, output_mp4_path = Path(image_path).resolve(), Path(output_mp4_path).resolve()
        cost, price_note = live_price.grok_video_credits(model, resolution, int(duration))
        price_source = "live" if cost is not None else f"none ({live_price.last_error or 'no per-second price in the KIE text'})"
        started = time.time()
        result: Dict[str, Any] = {
            "ok": False, "dry_run": dry_run, "scene": scene_name, "model": model, "resolution": resolution, "duration": int(duration),
            "enable_audio": bool(enable_audio) if model == PREVIEW else "n/a (this model cannot turn the sound off)",
            "image": str(image_path), "out": str(output_mp4_path), "prompt": prompt, "prompt_chars": len(prompt), "task_id": None,
            "expected_credits": cost, "price_source": price_source, "price_note": price_note or None, "credits_spent": None,
            "balance_before": None, "balance_after": None, "motion": None, "error": None,
        }
        self.last_result = result
        status, error = "failed", None
        try:
            found = problems_of(model, prompt, resolution, duration)
            if found:
                result["schema_problems"] = found
                raise RuntimeError("request does not match KIE's schema: " + "; ".join(found))
            if cost is None:
                if not dry_run:
                    raise RuntimeError("KIE price could not be read for this model and resolution, so the cost is unknown. Nothing was spent.")
            result["balance_before"] = self._balance()
            if cost is not None and result["balance_before"] is not None and result["balance_before"] < cost:
                raise RuntimeError(f"KIE balance {result['balance_before']} is below the {cost} credits this clip costs")
            if dry_run:
                result.update(ok=True)
                status = "dry_run"
                return output_mp4_path

            output_mp4_path.parent.mkdir(parents=True, exist_ok=True)
            prepared = PreflightShield.normalize_image_for_kling(image_path)  # real JPEG bytes, 1080x1920 cover-crop (9:16)
            uploaded = self.client.upload_file(prepared, upload_path="nana-banana/grok")
            if not uploaded.success or not uploaded.data:
                err = uploaded.error
                raise RuntimeError(f"upload failed: [{err.code if err else '?'}] {err.msg if err else 'unknown'}")
            body = build_input(model, prompt, uploaded.data.data.download_url, resolution, duration, enable_audio)
            created = self.client.create_task(model, body)
            if not created.success or not created.data:
                err = created.error
                raise RuntimeError(f"createTask failed: [{err.code if err else '?'}] {err.msg if err else 'unknown'}")
            result["task_id"] = created.data.data.task_id

            done = self.client.poll_and_download(result["task_id"], output_mp4_path, timeout_seconds=600, poll_interval=5)
            if not done.success:
                err = done.error
                raise RuntimeError(err.msg if err else "poll/download failed")

            info = self.client.last_task_info
            result["balance_after"] = self._balance()
            bill = live_price.billing(info.get("credits_consumed"), result["balance_before"], result["balance_after"], cost)
            result["credits_spent"], result["credits_source"], result["billing_warning"] = bill["billed"], bill["billed_source"], bill["billing_warning"]
            result["motion"] = check_motion(output_mp4_path, min_motion_delta)
            if not result["motion"]["ok"]:
                status = "failed_motion"
                raise MotionGuardError(f"frozen clip: first-vs-last delta {result['motion']['first_last_delta']} < {min_motion_delta} (file kept: {output_mp4_path.name})")
            result["ok"] = True
            status = "success"
            return output_mp4_path
        except Exception as exc:
            error = str(exc)
            result["error"] = error
            if result["balance_after"] is None and not dry_run:
                result["balance_after"] = self._balance()
            raise
        finally:
            result["duration_s"] = round(time.time() - started, 1)
            credits = result["credits_spent"] or 0
            TelemetryLogger.log_event(
                stage="grok_video_generation", trace_id=trace_id, listing=listing_name, duration_ms=int(result["duration_s"] * 1000), status=status,
                model=model, credits_spent=credits, cost_usd=credits * CREDIT_USD,
                output_path=str(output_mp4_path) if (result["ok"] and not dry_run) or status == "failed_motion" else None, error_message=error,
                extra={"scene": scene_name, "task_id": result["task_id"], "resolution": resolution, "duration": int(duration),
                       "expected_credits": cost, "price_source": price_source, "credits_source": result.get("credits_source"),
                       "billing_warning": result.get("billing_warning"), "balance_before": result["balance_before"],
                       "balance_after": result["balance_after"], "motion": result["motion"], "dry_run": dry_run},
            )
