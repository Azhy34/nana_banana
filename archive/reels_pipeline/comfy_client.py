"""
Direct Python client for local ComfyUI Server (http://127.0.0.1:8188).
Provides REST + WebSocket interaction without external wrapper bloat.
"""

import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional
import requests

from .config import PipelineConfig


class ComfyClient:
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or PipelineConfig.COMFY_BASE_URL).rstrip("/")
        self.client_id = uuid.uuid4().hex

    def get_system_stats(self) -> Dict[str, Any]:
        """Returns ComfyUI system stats."""
        resp = requests.get(f"{self.base_url}/system_stats", timeout=5)
        resp.raise_for_status()
        return resp.json()

    def get_node_info(self, node_class: Optional[str] = None) -> Dict[str, Any]:
        """Returns node schema info. If node_class is omitted, returns all 1000+ nodes."""
        endpoint = f"{self.base_url}/object_info"
        if node_class:
            endpoint = f"{endpoint}/{node_class}"
        resp = requests.get(endpoint, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def upload_image(self, file_path: Path, subfolder: str = "", overwrite: bool = True) -> Dict[str, Any]:
        """Uploads an image file to ComfyUI input directory."""
        file_path = Path(file_path).resolve()
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        url = f"{self.base_url}/upload/image"
        with open(file_path, "rb") as f:
            files = {"image": (file_path.name, f, "image/png" if file_path.suffix.lower() == ".png" else "image/jpeg")}
            data = {"overwrite": "true" if overwrite else "false", "subfolder": subfolder}
            resp = requests.post(url, files=files, data=data, timeout=30)
            resp.raise_for_status()
            return resp.json()

    def queue_prompt(self, prompt_graph: Dict[str, Any]) -> str:
        """Submits a workflow execution graph and returns prompt_id."""
        url = f"{self.base_url}/prompt"
        payload = {
            "prompt": prompt_graph,
            "client_id": self.client_id,
        }
        resp = requests.post(url, json=payload, timeout=10)
        resp.raise_for_status()
        res_data = resp.json()
        if "error" in res_data:
            raise RuntimeError(f"ComfyUI prompt error: {res_data['error']}")
        return res_data["prompt_id"]

    def get_history(self, prompt_id: str) -> Optional[Dict[str, Any]]:
        """Fetches execution history for prompt_id."""
        url = f"{self.base_url}/history/{prompt_id}"
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            history = resp.json()
            return history.get(prompt_id)
        return None

    def wait_for_completion(self, prompt_id: str, timeout_sec: int = 120, poll_interval: float = 1.0) -> Dict[str, Any]:
        """Polls history until the prompt execution finishes."""
        start_time = time.time()
        while time.time() - start_time < timeout_sec:
            history = self.get_history(prompt_id)
            if history:
                status = history.get("status", {})
                if status.get("completed", False) or "outputs" in history:
                    return history
                if status.get("status_str") == "error":
                    raise RuntimeError(f"Workflow execution failed: {status.get('messages')}")
            time.sleep(poll_interval)
        raise TimeoutError(f"ComfyUI execution timed out after {timeout_sec}s for prompt {prompt_id}")

    def download_output_image(self, filename: str, subfolder: str = "", folder_type: str = "output", dest_path: Optional[Path] = None) -> Path:
        """Downloads an output image from ComfyUI /view endpoint."""
        url = f"{self.base_url}/view"
        params = {"filename": filename, "subfolder": subfolder, "type": folder_type}
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()

        if dest_path is None:
            dest_path = Path("output") / filename
        dest_path = Path(dest_path).resolve()
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        dest_path.write_bytes(resp.content)
        return dest_path

