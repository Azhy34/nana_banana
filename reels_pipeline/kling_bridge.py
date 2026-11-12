"""
Bridge to KIE Kling 2.6 image-to-video (63 credits for 5 s without sound, 1080p; the price changes, see CREDITS).

The request is built strictly from the official KIE schema (api_truth/kie/kling-2.6__image-to-video.schema.json):
    model "kling-2.6/image-to-video", input {prompt, image_urls[1], sound(bool), duration("5"|"10")}
There is NO negative_prompt / mode / cfg_scale / aspect_ratio field: those belong to ComfyUI's partner
node "KlingImage2VideoNode" and must not be sent to KIE. The aspect ratio follows the input image (9:16).

Prompt rules come from .agents/skills/creative-ad-auditor: real motion only (a person, light, a forward walk-in with parallax;
a plain zoom is not ordered), faces never shown, NO pedestal up / tilt up / crane up, NO motion verbs attached to furniture,
INANIMATE 2D INK LOCK, GEOMETRIC & FURNITURE LOCK, 5 s per shot. The clip prompts are in specs/listing45_video.json;
DEFAULT_PROMPT below is the old zoom prompt and is not used for new clips.
The price is read live from KIE before a paid run (live_price.py); a paid run refuses when it cannot be read.
After the download the motion guard checks that the clip is not frozen. Every call is journaled with
real credits (balance before/after), failures included.
"""

import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from api_discovery.kie_kling.client import KieKlingClient
from api_discovery.kie_kling.models import Kling26Input, KlingTaskCreateRequest

from . import live_price
from .config import PipelineConfig
from . import mural_lock
from .motion_guard import MIN_FIRST_LAST_DELTA, check_motion
from .preflight import PreflightShield
from .telemetry import TelemetryLogger

CREDIT_USD = 0.005
# FALLBACK only. The price a clip is quoted and billed at is read live from KIE (live_price.py); KIE changes it
# (55 / 110 / 110 / 220 until 04.11.2026, then 63 / 126 / 126 / 252). This table is used for offline estimates and
# when KIE does not answer; a paid run refuses in that case instead of trusting it.
CREDITS = {("5", False): 63, ("10", False): 126, ("5", True): 126, ("10", True): 252}


def price_for(duration: str, sound: bool) -> Tuple[Optional[int], str]:
    """(credits, source) for one clip: live from KIE, else the fallback table with the source saying so."""
    return live_price.pick(live_price.kling_credits(duration, sound), CREDITS.get((duration, sound)))

DEFAULT_PROMPT = (
    "Ultra-slow continuous cinematic Steadicam forward push-in along the central Z-axis toward the wallpaper wall "
    "at natural eye level. Warm grazing morning sunlight from the window. "
    "INANIMATE 2D INK LOCK: The wallpaper design is strictly flat 2D printed ink on textured wallpaper. "
    "Completely static 2D artwork, zero biological animation, zero morphing, zero waving edges. "
    "GEOMETRIC & FURNITURE LOCK: All wooden furniture, bed, tables, chairs, poufs, rug, toys, and architecture remain "
    "100% frozen, solid, and bolted to the floor. Zero warping, zero morphing, zero shifting objects across the floor."
)


class MotionGuardError(RuntimeError):
    """The clip was generated and paid for, but it is frozen. The file is kept for inspection."""


class KlingBridge:
    def __init__(self, api_key: Optional[str] = None):
        self.client = KieKlingClient(api_key=api_key or PipelineConfig.get_kie_key())
        self.last_result: Dict[str, Any] = {}

    def _balance(self) -> Optional[float]:
        res = self.client.get_credits()
        return float(res.data.data) if res.success and res.data else None

    def build_request(self, image_url: str, prompt: str, duration: str, sound: bool) -> KlingTaskCreateRequest:
        """Local validation against the official schema limits (prompt <= 2500, 1 image, duration 5|10)."""
        return KlingTaskCreateRequest(
            model="kling-2.6/image-to-video",
            input=Kling26Input(prompt=prompt, image_urls=[image_url], sound=sound, duration=duration),  # type: ignore[arg-type]
        )

    def animate_interior_scene(
        self,
        image_path: Path,
        output_mp4_path: Path,
        listing_name: str = "Листинг",
        scene_name: str = "scene_01",
        custom_prompt_suffix: str = "",
        trace_id: Optional[str] = None,
        prompt: Optional[str] = None,
        duration: str = "5",
        sound: bool = False,
        min_motion_delta: float = MIN_FIRST_LAST_DELTA,
        dry_run: bool = False,
        motion_zone: Optional[str] = None,
    ) -> Path:
        """
        Animate one approved 9:16 interior. Returns the MP4 path; details are in self.last_result.
        Raises RuntimeError on API problems and MotionGuardError when the clip is frozen.
        motion_zone (a polygon in fractions of the frame, see mural_lock.py): the clip is shot with a LOCKED camera and after the download every pixel outside the
        zone is made equal to the first frame, so the mural cannot move; the model's own file is kept as <name>__raw.mp4. min_motion_delta is then measured in the zone.
        dry_run=True validates everything locally (prompt, request shape, balance, cost) and sends nothing.
        """
        trace_id = trace_id or TelemetryLogger.generate_trace_id()
        image_path = Path(image_path).resolve()
        output_mp4_path = Path(output_mp4_path).resolve()
        positive = (prompt or DEFAULT_PROMPT) + (f" {custom_prompt_suffix}" if custom_prompt_suffix else "")
        cost, price_source = price_for(duration, sound)  # live from KIE; the table only when KIE does not answer
        started = time.time()
        result: Dict[str, Any] = {
            "ok": False, "dry_run": dry_run, "scene": scene_name, "image": str(image_path), "out": str(output_mp4_path),
            "prompt": positive, "prompt_chars": len(positive), "task_id": None, "expected_credits": cost, "credits_spent": None, "balance_before": None,
            "balance_after": None, "motion": None, "error": None,
        }
        self.last_result = result
        status, error = "failed", None
        try:
            self.build_request("https://example.invalid/placeholder.jpg", positive, duration, sound)  # schema check
            zone = mural_lock.parse_zone(motion_zone)  # a bad zone is refused BEFORE anything is paid
            result["motion_zone"] = zone or None
            if zone:  # the lock must be able to run IN THIS PROCESS (ComfyUI's Python) before a single credit is spent
                result["lock_selfcheck"] = {k: mural_lock.self_check()[k] for k in ("ok", "frames")}
            result["price_source"] = price_source
            if price_source != "live":
                result["price_warning"] = f"KIE price could not be read; showing the fallback table value {cost}"
                if not dry_run:
                    raise RuntimeError("KIE price could not be read, so the cost is unknown. Nothing was spent; try again.")
            result["balance_before"] = self._balance()
            if result["balance_before"] is not None and result["balance_before"] < cost:
                raise RuntimeError(f"KIE balance {result['balance_before']} is below the {cost} credits this clip costs")
            if dry_run:
                result.update(ok=True)
                status = "dry_run"
                return output_mp4_path

            output_mp4_path.parent.mkdir(parents=True, exist_ok=True)
            prepared = PreflightShield.normalize_image_for_kling(image_path)  # real JPEG bytes, 1080x1920 cover-crop
            uploaded = self.client.upload_file(prepared, upload_path="nana-banana/kling")
            if not uploaded.success or not uploaded.data:
                err = uploaded.error
                raise RuntimeError(f"upload failed: [{err.code if err else '?'}] {err.msg if err else 'unknown'}")

            created = self.client.create_kling_task(self.build_request(uploaded.data.data.download_url, positive, duration, sound))
            if not created.success or not created.data:
                err = created.error
                raise RuntimeError(f"createTask failed: [{err.code if err else '?'}] {err.msg if err else 'unknown'}")
            result["task_id"] = created.data.data.task_id

            done = self.client.poll_and_download(result["task_id"], output_mp4_path, timeout_seconds=480, poll_interval=5)
            if not done.success:
                err = done.error
                raise RuntimeError(err.msg if err else "poll/download failed")

            info = self.client.last_task_info
            result["balance_after"] = self._balance()
            bill = live_price.billing(info.get("credits_consumed"), result["balance_before"], result["balance_after"], cost)
            result["credits_spent"] = bill["billed"]
            result["credits_source"] = bill["billed_source"]  # kie_task = KIE's own creditsConsumed of this task
            result["billing_warning"] = bill["billing_warning"]  # set when KIE billed another number than the quote

            if zone:
                result["lock"], result["motion"] = mural_lock.lock_in_place(output_mp4_path, zone, min_motion_delta)
            else:
                result["motion"] = check_motion(output_mp4_path, min_motion_delta)
            if not result["motion"]["ok"]:
                status = "failed_motion"
                raise MotionGuardError(
                    f"frozen clip: first-vs-last delta {result['motion']['first_last_delta']} < {min_motion_delta} "
                    f"(file kept: {output_mp4_path.name}); regenerate with an explicit forward push-in"
                )
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
                stage="kling_video_generation",
                trace_id=trace_id,
                listing=listing_name,
                duration_ms=int(result["duration_s"] * 1000),
                status=status,
                model="kling-2.6",
                credits_spent=credits,
                cost_usd=credits * CREDIT_USD,
                output_path=str(output_mp4_path) if (result["ok"] and not dry_run) or status == "failed_motion" else None,
                error_message=error,
                extra={
                    "scene": scene_name, "task_id": result["task_id"], "duration": duration, "sound": sound,
                    "expected_credits": cost, "price_source": result.get("price_source"),
                    "credits_source": result.get("credits_source"), "billing_warning": result.get("billing_warning"),
                    "balance_before": result["balance_before"],
                    "balance_after": result["balance_after"], "motion": result["motion"], "dry_run": dry_run, "lock_selfcheck": result.get("lock_selfcheck"),
                },
            )
