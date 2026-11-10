"""
Bridge to KIE Gemini Omni 1.2 Flash (Google) image-to-video: a THIRD video model next to Kling 2.6 (kling_bridge.py stays the working one;
Grok video was thrown out by the owner on 08.11, grok_video_bridge.py is an archive).

KIE model google/gemini-omni-flash-1-2, request built strictly from its snapshot api_truth/kie/google__gemini-omni-flash-1-2.schema.json
(GET /api/v1/models/{m}/schema, taken 10.11.2026). ONE mode per request; this bridge uses two of them:
  B  first frame only          first_frame_url                         duration 3-15 (integer)
  C  first frame + last frame  first_frame_url + last_frame_url        duration 3-10 (the model interpolates between them)
(A reference images and D video edit are not used here; image_urls must not be sent with a first frame.)
Billed per second of OUTPUT: the rate per resolution is read live (live_price.omni_video_credits); a paid run refuses when it cannot be read.
The owner never uses 360p: only 720p, 1080p and 4k are offered. The sound is always generated and cannot be turned off (cut it in the editor).
Google's guide: the prompt describes MOTION in plain words, roles of the pictures in words (never control tags such as <FIRST_FRAME>), one continuous
shot, no quotation marks. Same safety as Kling: dry_run first, the live quote, the balance, the real bill from KIE, the motion guard, the journal.
"""

import re
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
MODEL = live_price.OMNI_MODEL
MODEL_TAG = "omni12"
RESOLUTIONS = ("720p", "1080p", "4k")  # 360p is in KIE's schema but never used (owner 10.11)
DURATION_B = (3, 15)  # first frame only
DURATION_C = (3, 10)  # first + last frame
CONTROL_TAGS = re.compile(r"<[A-Za-z_]+\d*>|@image[_ ]?\d|@first_frame|@last_frame|@keyframe", re.IGNORECASE)  # Google: deprecated, unsupported in future models


class MotionGuardError(RuntimeError):
    """The clip was generated and paid for, but it is frozen. The file is kept for inspection."""


def clip_name(scene_id: str, resolution: str, duration: int, last_frame: bool = False) -> str:
    """The file a clip is saved to. Resolution, length and mode are part of the name: another setting is another clip (reuse_existing)."""
    return f"{scene_id}__{MODEL_TAG}_{resolution}_{int(duration)}s{'_fl' if last_frame else ''}_9x16.mp4"


def build_input(prompt: str, first_url: str, resolution: str, duration: int, last_url: Optional[str] = None, seed: Optional[int] = None) -> Dict[str, Any]:
    """The `input` of createTask from the schema: mode B (first frame) or C (first + last frame); the seed only when asked for (10000-99999)."""
    body: Dict[str, Any] = {"prompt": prompt, "duration": int(duration), "aspect_ratio": "9:16", "resolution": resolution, "first_frame_url": first_url}
    if last_url:
        body["last_frame_url"] = last_url
    if seed is not None:
        body["seeds"] = int(seed)
    return body


def problems_of(prompt: str, resolution: str, duration: int, with_last_frame: bool = False, seed: Optional[int] = None) -> list:
    """Everything that would make KIE refuse the request (or that the owner / Google ruled out), found locally: the schema snapshot + the rules of the modes."""
    low, high = DURATION_C if with_last_frame else DURATION_B
    out = [] if low <= int(duration) <= high else [f"duration {duration} s: {'first+last frame' if with_last_frame else 'first frame only'} takes {low}-{high} s"]
    if resolution not in RESOLUTIONS:
        out.append(f"resolution {resolution!r}: only {RESOLUTIONS} (360p is never used, owner 10.11)")
    if CONTROL_TAGS.search(prompt):
        out.append("the prompt has a control tag (<FIRST_FRAME>, @image_1 ...): Google deprecated them, describe the role of each picture in words")
    if '"' in prompt:
        out.append("the prompt has a quotation mark: Google's guide says no quotation marks (dialogue in quotes is SPOKEN)")
    if seed is not None and not 10000 <= int(seed) <= 99999:
        out.append(f"seed {seed}: KIE takes 10000-99999")
    placeholder = "https://example.invalid/placeholder.jpg"
    return out + caps.validate_input(MODEL, build_input(prompt, placeholder, resolution, duration, placeholder if with_last_frame else None, seed))


class OmniVideoBridge:
    def __init__(self, api_key: Optional[str] = None):
        self.client = KieKlingClient(api_key=api_key or PipelineConfig.get_kie_key())
        self.last_result: Dict[str, Any] = {}

    def _balance(self) -> Optional[float]:
        res = self.client.get_credits()
        return float(res.data.data) if res.success and res.data else None

    def _upload(self, image_path: Path) -> str:
        prepared = PreflightShield.normalize_image_for_kling(image_path)  # real JPEG bytes, 1080x1920 cover-crop (9:16)
        uploaded = self.client.upload_file(prepared, upload_path="nana-banana/omni")
        if not uploaded.success or not uploaded.data:
            err = uploaded.error
            raise RuntimeError(f"upload failed: [{err.code if err else '?'}] {err.msg if err else 'unknown'}")
        return uploaded.data.data.download_url

    def animate(self, image_path: Path, output_mp4_path: Path, prompt: str, resolution: str = "720p", duration: int = 5, last_image_path: Optional[Path] = None,
                seed: Optional[int] = None, listing_name: str = "Листинг", scene_name: str = "scene_01", min_motion_delta: float = MIN_FIRST_LAST_DELTA,
                dry_run: bool = False, trace_id: Optional[str] = None) -> Path:
        """Animate one approved 9:16 frame (with `last_image_path`: from that frame to the other one). Returns the MP4 path; details in self.last_result.
        dry_run validates, prices and sends nothing."""
        trace_id = trace_id or TelemetryLogger.generate_trace_id()
        image_path, output_mp4_path = Path(image_path).resolve(), Path(output_mp4_path).resolve()
        last_image_path = Path(last_image_path).resolve() if last_image_path else None
        cost = live_price.omni_video_credits(resolution, int(duration)) if resolution in RESOLUTIONS else None
        price_source = "live" if cost is not None else f"none ({live_price.last_error or 'no per-second price in the KIE text'})"
        started = time.time()
        result: Dict[str, Any] = {
            "ok": False, "dry_run": dry_run, "scene": scene_name, "model": MODEL, "mode": "first+last frame" if last_image_path else "first frame",
            "resolution": resolution, "duration": int(duration), "sound": "always on (KIE: cannot be turned off)",
            "image": str(image_path), "last_image": str(last_image_path) if last_image_path else None, "out": str(output_mp4_path),
            "prompt": prompt, "prompt_chars": len(prompt), "task_id": None, "expected_credits": cost, "price_source": price_source,
            "credits_spent": None, "balance_before": None, "balance_after": None, "motion": None, "error": None,
        }
        self.last_result = result
        status, error = "failed", None
        try:
            found = problems_of(prompt, resolution, duration, with_last_frame=last_image_path is not None, seed=seed)
            if last_image_path and not last_image_path.exists():
                found.append(f"last frame not found: {last_image_path}")
            if found:
                result["schema_problems"] = found
                raise RuntimeError("request does not match KIE's schema or our rules: " + "; ".join(found))
            if cost is None and not dry_run:
                raise RuntimeError("KIE price could not be read for this resolution, so the cost is unknown. Nothing was spent.")
            result["balance_before"] = self._balance()
            if cost is not None and result["balance_before"] is not None and result["balance_before"] < cost:
                raise RuntimeError(f"KIE balance {result['balance_before']} is below the {cost} credits this clip costs")
            if dry_run:
                result.update(ok=True)
                status = "dry_run"
                return output_mp4_path

            output_mp4_path.parent.mkdir(parents=True, exist_ok=True)
            first_url = self._upload(image_path)
            last_url = self._upload(last_image_path) if last_image_path else None
            created = self.client.create_task(MODEL, build_input(prompt, first_url, resolution, duration, last_url, seed))
            if not created.success or not created.data:
                err = created.error
                raise RuntimeError(f"createTask failed: [{err.code if err else '?'}] {err.msg if err else 'unknown'}")
            result["task_id"] = created.data.data.task_id

            done = self.client.poll_and_download(result["task_id"], output_mp4_path, timeout_seconds=900, poll_interval=5)
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
                stage="omni_video_generation", trace_id=trace_id, listing=listing_name, duration_ms=int(result["duration_s"] * 1000), status=status,
                model=MODEL, credits_spent=credits, cost_usd=credits * CREDIT_USD,
                output_path=str(output_mp4_path) if (result["ok"] and not dry_run) or status == "failed_motion" else None, error_message=error,
                extra={"scene": scene_name, "task_id": result["task_id"], "resolution": resolution, "duration": int(duration), "mode": result["mode"],
                       "expected_credits": cost, "price_source": price_source, "credits_source": result.get("credits_source"),
                       "billing_warning": result.get("billing_warning"), "balance_before": result["balance_before"],
                       "balance_after": result["balance_after"], "motion": result["motion"], "dry_run": dry_run},
            )
