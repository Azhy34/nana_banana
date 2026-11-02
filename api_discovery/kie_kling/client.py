"""
Production Two-Layer Shield Client for KIE.ai Kling Video Models.
Follows api-discovery standard:
- Local Pydantic V2 input validation before network touch
- Rate-limiting backoff against KIE 429
- Pre-flight credit check against KIE 402
- Zero secret leak policy
"""

import base64
import os
import time
from pathlib import Path
from typing import Optional, Union
import requests

from .models import (
    KieApiErrorResponse,
    KieBase64UploadRequest,
    KieCreditResponse,
    KieFileUploadResponse,
    Kling26Input,
    Kling30OmniInput,
    KlingRecordInfoResponse,
    KlingTaskCreateRequest,
    KlingTaskCreateResponse,
    TwoLayerResult,
)


class KieKlingClient:
    BASE_API_URL = "https://api.kie.ai"
    UPLOAD_API_URL = "https://kieai.redpandaai.co"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or self._load_api_key()
        if not self.api_key:
            raise ValueError("KIE_API_KEY must be provided or set in environment / .env.local")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    @staticmethod
    def _load_api_key() -> Optional[str]:
        if "KIE_API_KEY" in os.environ:
            return os.environ["KIE_API_KEY"].strip()
        env_path = Path(".env.local")
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("KIE_API_KEY="):
                    return line.split("=", 1)[1].strip()
        return None

    def _safe_request(self, method: str, url: str, **kwargs) -> requests.Response:
        """Executes request with rate-limit 429 auto-retry and backoff."""
        max_retries = 3
        backoff = 2.0
        for attempt in range(max_retries):
            resp = requests.request(method, url, **kwargs)
            if resp.status_code == 429 or (resp.headers.get("content-type", "").startswith("application/json") and resp.json().get("code") == 429):
                print(f"[KIE Warning] Rate limit 429 hit. Backing off for {backoff}s (attempt {attempt+1}/{max_retries})...")
                time.sleep(backoff)
                backoff *= 2
                continue
            return resp
        return resp

    def get_credits(self) -> TwoLayerResult[KieCreditResponse]:
        """Layer 1 Shield: Query account credit balance."""
        try:
            resp = self._safe_request("GET", f"{self.BASE_API_URL}/api/v1/chat/credit", headers=self.headers)
            raw = resp.json()
            if raw.get("code") == 200:
                parsed = KieCreditResponse.model_validate(raw)
                return TwoLayerResult[KieCreditResponse](success=True, data=parsed, raw_status_code=resp.status_code)
            error = KieApiErrorResponse.model_validate(raw)
            return TwoLayerResult[KieCreditResponse](success=False, error=error, raw_status_code=resp.status_code)
        except Exception as e:
            return TwoLayerResult[KieCreditResponse](
                success=False,
                error=KieApiErrorResponse(code=500, msg=f"Network/parsing exception: {str(e)}"),
                raw_status_code=500
            )

    def upload_file(self, file_path: Union[str, Path], upload_path: str = "nana-banana/runs") -> TwoLayerResult[KieFileUploadResponse]:
        """Uploads a local image to KIE temporary CDN (valid 24h)."""
        path = Path(file_path)
        if not path.exists():
            return TwoLayerResult[KieFileUploadResponse](
                success=False,
                error=KieApiErrorResponse(code=404, msg=f"Input file not found: {file_path}"),
                raw_status_code=404
            )

        try:
            content_bytes = path.read_bytes()
            ext = path.suffix.lstrip(".").lower() or "png"
            base64_str = f"data:image/{ext};base64," + base64.b64encode(content_bytes).decode("ascii")

            req_payload = KieBase64UploadRequest(
                base64Data=base64_str,
                uploadPath=upload_path,
                fileName=path.name
            )

            resp = self._safe_request(
                "POST",
                f"{self.UPLOAD_API_URL}/api/file-base64-upload",
                headers=self.headers,
                json=req_payload.model_dump(by_alias=True)
            )
            raw = resp.json()
            if raw.get("code") == 200 and raw.get("success"):
                parsed = KieFileUploadResponse.model_validate(raw)
                return TwoLayerResult[KieFileUploadResponse](success=True, data=parsed, raw_status_code=resp.status_code)

            error = KieApiErrorResponse.model_validate(raw)
            return TwoLayerResult[KieFileUploadResponse](success=False, error=error, raw_status_code=resp.status_code)
        except Exception as e:
            return TwoLayerResult[KieFileUploadResponse](
                success=False,
                error=KieApiErrorResponse(code=500, msg=f"Upload error: {str(e)}"),
                raw_status_code=500
            )

    def create_kling_task(self, request: KlingTaskCreateRequest) -> TwoLayerResult[KlingTaskCreateResponse]:
        """Submits video generation task with local validation."""
        try:
            payload = request.model_dump(by_alias=True, exclude_none=True)
            resp = self._safe_request(
                "POST",
                f"{self.BASE_API_URL}/api/v1/jobs/createTask",
                headers=self.headers,
                json=payload
            )
            raw = resp.json()
            if raw.get("code") == 200 and raw.get("data", {}).get("taskId"):
                parsed = KlingTaskCreateResponse.model_validate(raw)
                return TwoLayerResult[KlingTaskCreateResponse](success=True, data=parsed, raw_status_code=resp.status_code)

            error = KieApiErrorResponse.model_validate(raw)
            return TwoLayerResult[KlingTaskCreateResponse](success=False, error=error, raw_status_code=resp.status_code)
        except Exception as e:
            return TwoLayerResult[KlingTaskCreateResponse](
                success=False,
                error=KieApiErrorResponse(code=500, msg=f"Task creation error: {str(e)}"),
                raw_status_code=500
            )

    def get_task_status(self, task_id: str) -> TwoLayerResult[KlingRecordInfoResponse]:
        """Queries status of an ongoing video task."""
        try:
            resp = self._safe_request(
                "GET",
                f"{self.BASE_API_URL}/api/v1/jobs/recordInfo",
                headers=self.headers,
                params={"taskId": task_id}
            )
            raw = resp.json()
            if raw.get("code") == 200:
                parsed = KlingRecordInfoResponse.model_validate(raw)
                return TwoLayerResult[KlingRecordInfoResponse](success=True, data=parsed, raw_status_code=resp.status_code)

            error = KieApiErrorResponse.model_validate(raw)
            return TwoLayerResult[KlingRecordInfoResponse](success=False, error=error, raw_status_code=resp.status_code)
        except Exception as e:
            return TwoLayerResult[KlingRecordInfoResponse](
                success=False,
                error=KieApiErrorResponse(code=500, msg=f"Status query error: {str(e)}"),
                raw_status_code=500
            )

    def poll_and_download(
        self,
        task_id: str,
        output_file: Union[str, Path],
        timeout_seconds: int = 360,
        poll_interval: int = 5
    ) -> TwoLayerResult[Path]:
        """Polls task until success or failure, then downloads the MP4."""
        out_path = Path(output_file)
        start_time = time.time()

        print(f"[Poll] Monitoring task {task_id} (timeout: {timeout_seconds}s)...")
        while (time.time() - start_time) < timeout_seconds:
            status_res = self.get_task_status(task_id)
            if not status_res.success or not status_res.data or not status_res.data.data:
                print(f"[Poll Warning] Temporary query issue: {status_res.error.msg if status_res.error else 'Unknown'}")
                time.sleep(poll_interval)
                continue

            state = status_res.data.data.state
            elapsed = int(time.time() - start_time)
            print(f"[Poll] {elapsed}s: state = {state}")

            if state == "success":
                urls = []
                if status_res.data.data.response and status_res.data.data.response.result_urls:
                    urls = status_res.data.data.response.result_urls
                elif status_res.data.data.result_json:
                    import json
                    try:
                        urls = json.loads(status_res.data.data.result_json).get("resultUrls", [])
                    except Exception:
                        pass

                if not urls:
                    return TwoLayerResult[Path](
                        success=False,
                        error=KieApiErrorResponse(code=500, msg="Task succeeded but resultUrls is empty"),
                        raw_status_code=500
                    )

                video_url = urls[0]
                print(f"[Download] Downloading video from {video_url}...")
                dl_resp = requests.get(video_url, stream=True)
                if dl_resp.status_code != 200:
                    return TwoLayerResult[Path](
                        success=False,
                        error=KieApiErrorResponse(code=dl_resp.status_code, msg=f"Download failed HTTP {dl_resp.status_code}"),
                        raw_status_code=dl_resp.status_code
                    )

                out_path.parent.mkdir(parents=True, exist_ok=True)
                with open(out_path, "wb") as f:
                    for chunk in dl_resp.iter_content(chunk_size=65536):
                        f.write(chunk)

                size_mb = out_path.stat().st_size / (1024 * 1024)
                print(f"[Success] Saved {out_path} ({size_mb:.2f} MB) in {elapsed}s!")

                # Record structured telemetry to gemini_sessions.json
                self._log_session_event(
                    task_id=task_id,
                    model=status_res.data.data.model,
                    credits_consumed=status_res.data.data.credits_consumed or 55.0,
                    duration_sec=elapsed,
                    video_url=video_url,
                    output_file=str(out_path)
                )

                return TwoLayerResult[Path](success=True, data=out_path, raw_status_code=200)

            if state == "fail":
                fail_code = status_res.data.data.fail_code or "Unknown"
                fail_msg = status_res.data.data.fail_msg or "Unknown error"
                return TwoLayerResult[Path](
                    success=False,
                    error=KieApiErrorResponse(code=500, msg=f"Generation failed: [{fail_code}] {fail_msg}"),
                    raw_status_code=500
                )

            time.sleep(poll_interval)

        return TwoLayerResult[Path](
            success=False,
            error=KieApiErrorResponse(code=504, msg=f"Task timed out after {timeout_seconds}s"),
            raw_status_code=504
        )

    def _log_session_event(self, task_id: str, model: str, credits_consumed: float, duration_sec: int, video_url: str, output_file: str):
        """Appends structured telemetry event to gemini_sessions.json and outputs structured log."""
        import json
        from datetime import datetime, timezone

        session_id = os.environ.get("SESSION_ID", "gmc-DS-006")
        cost_usd = round(credits_consumed * 0.005, 4)
        event_record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "sessionId": session_id,
            "model": model,
            "cost": cost_usd,
            "creditsConsumed": credits_consumed,
            "duration": float(duration_sec),
            "status": "success",
            "taskId": task_id,
            "videoUrl": video_url,
            "outputFile": output_file
        }

        # Structured stdout per log-trace-debugger
        print(json.dumps({
            "message": f"[KIE KLING LOG] [Session: {session_id}] [Model: {model}] [Status: success] cost=${cost_usd} duration={duration_sec}s taskId={task_id}",
            "severity": "INFO",
            "labels": {"sessionId": session_id, "model": model, "status": "success", "taskId": task_id}
        }))

        # Persistence to gemini_sessions.json
        sess_file = Path("gemini_sessions.json")
        try:
            sess_data = json.loads(sess_file.read_text(encoding="utf-8")) if sess_file.exists() else {}
            if session_id not in sess_data:
                sess_data[session_id] = {"createdTime": datetime.now(timezone.utc).isoformat(), "events": []}
            sess_data[session_id]["events"].append(event_record)
            sess_file.write_text(json.dumps(sess_data, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception as e:
            print(f"[Log Warning] Could not persist to gemini_sessions.json: {e}")


