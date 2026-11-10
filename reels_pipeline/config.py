"""
Configuration and environment management for reels_pipeline.
Adheres to Zero Leak Policy and Karpathy simplicity.
"""

import os
from pathlib import Path
from typing import Optional


class PipelineConfig:
    ROOT_DIR: Path = Path(__file__).resolve().parent.parent
    ENV_LOCAL_PATH: Path = ROOT_DIR / ".env.local"
    TELEMETRY_LOG_PATH: Path = ROOT_DIR / "reels_pipeline" / "telemetry.jsonl"
    COMFY_BASE_URL: str = os.getenv("COMFY_BASE_URL", "http://127.0.0.1:8188")
    DEFAULT_DESKTOP_DIR: Path = Path(r"C:\Users\Mikhail\Desktop\Обои")

    # Only the keys this package uses are exported. .env.local also holds Vercel, Replicate, OpenRouter,
    # Stitch tokens etc.; this module is imported inside the ComfyUI process, which must not receive them.
    ENV_ALLOWLIST = ("KIE_API_KEY", "GEMINI_API_KEY")

    @classmethod
    def load_env(cls) -> None:
        """Loads the allow-listed variables from .env.local into os.environ if not already present."""
        if cls.ENV_LOCAL_PATH.exists():
            for line in cls.ENV_LOCAL_PATH.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    if key in cls.ENV_ALLOWLIST and key not in os.environ:
                        os.environ[key] = val

    @classmethod
    def get_gemini_key(cls) -> str:
        cls.load_env()
        key = os.getenv("GEMINI_API_KEY")
        if not key:
            raise ValueError("GEMINI_API_KEY is not set in environment or .env.local")
        return key

    @classmethod
    def get_kie_key(cls) -> str:
        cls.load_env()
        key = os.getenv("KIE_API_KEY")
        if not key:
            raise ValueError("KIE_API_KEY is not set in environment or .env.local")
        return key


# Auto-load on import
PipelineConfig.load_env()

