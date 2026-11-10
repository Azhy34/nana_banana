"""
Pre-flight safety shield for reels_pipeline.
Prevents:
- KIE API code=400 (Image fetch failed due to magic bytes / MIME mismatch)
- KIE API code=402 (Insufficient credits mid-generation)
- ComfyUI connection errors
"""

import hashlib
import io
import os
import tempfile
from pathlib import Path
from typing import Dict, Optional, Tuple
from PIL import Image, ImageOps
import requests

from .config import PipelineConfig

# Normalized copies for upload live here, NOT next to the originals (no clutter in listing folders).
UPLOAD_CACHE = Path(tempfile.gettempdir()) / "nana_banana_upload"
KIE_BASE64_LIMIT = 9_500_000  # KIE base64 upload limit is 10 MB; keep a margin


class PreflightShield:
    @staticmethod
    def _flatten_rgb(img: Image.Image) -> Image.Image:
        """Convert any mode (RGBA/P/L/...) to plain RGB; transparency goes onto white."""
        if img.mode in ("RGBA", "LA", "P"):
            rgba = img.convert("RGBA")
            background = Image.new("RGB", rgba.size, (255, 255, 255))
            background.paste(rgba, mask=rgba.split()[-1])
            return background
        return img if img.mode == "RGB" else img.convert("RGB")

    @staticmethod
    def _cache_path(src: Path, tag: str, ext: str) -> Path:
        UPLOAD_CACHE.mkdir(parents=True, exist_ok=True)
        key = hashlib.sha1(f"{src}|{src.stat().st_mtime_ns}|{tag}".encode("utf-8")).hexdigest()[:12]
        return UPLOAD_CACHE / f"{tag}_{key}.{ext}"  # ASCII-only name on purpose

    @classmethod
    def prepare_reference(cls, input_path: Path, tag: str = "ref", max_side: int = 2400, prefer_png: bool = True) -> Path:
        """
        Re-encode a reference image (wallpaper, texture) so bytes, MIME type and extension always agree.
        Keeps the original aspect ratio (never stretches); only downscales when the long side exceeds
        max_side (project rule: very large wallpapers cause moire in the model's vision preprocessor).
        PNG for artwork (lossless), falls back to JPEG q95 when PNG would exceed the upload limit.
        """
        src = Path(input_path).resolve()
        if not src.exists():
            raise FileNotFoundError(f"Reference image not found: {src}")
        with Image.open(src) as opened:
            img = cls._flatten_rgb(opened)
            if max(img.size) > max_side:
                scale = max_side / max(img.size)
                img = img.resize((round(img.width * scale), round(img.height * scale)), Image.Resampling.LANCZOS)
            out = cls._cache_path(src, tag, "png" if prefer_png else "jpg")
            if prefer_png:
                img.save(out, format="PNG")
                if out.stat().st_size > KIE_BASE64_LIMIT:
                    out = cls._cache_path(src, tag, "jpg")
                    img.save(out, format="JPEG", quality=95, subsampling=0)
            else:
                img.save(out, format="JPEG", quality=95, subsampling=0)
        expected = "png" if out.suffix == ".png" else "jpeg"
        detected = cls.inspect_magic_bytes(out)
        if detected != expected:
            raise ValueError(f"Magic bytes verification failed on {out}: expected '{expected}', got '{detected}'")
        return out

    @staticmethod
    def inspect_magic_bytes(file_path: Path) -> str:
        """Returns detected format based on magic bytes: 'jpeg', 'png', 'webp', or 'unknown'."""
        with open(file_path, "rb") as f:
            header = f.read(16)
        if header.startswith(b"\xff\xd8"):
            return "jpeg"
        if header.startswith(b"\x89PNG\r\n\x1a\n"):
            return "png"
        if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
            return "webp"
        return "unknown"

    @classmethod
    def normalize_image_for_kling(
        cls,
        input_path: Path,
        output_path: Optional[Path] = None,
        target_size: Tuple[int, int] = (1080, 1920),
    ) -> Path:
        """
        Validates magic bytes and normalizes image to exact 1080x1920 standard JFIF JPEG.
        Eliminates Kling image fetch/decode errors (code 400).
        """
        input_path = Path(input_path).resolve()
        if not input_path.exists():
            raise FileNotFoundError(f"Input image not found: {input_path}")

        if output_path is None:
            output_path = cls._cache_path(input_path, "kling_in", "jpg")
        else:
            output_path = Path(output_path).resolve()

        with Image.open(input_path) as img:
            # Convert RGBA / P palette to standard RGB
            if img.mode in ("RGBA", "LA", "P"):
                # Create white background for transparency
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                img = background
            elif img.mode != "RGB":
                img = img.convert("RGB")

            # Cover-crop to the target ratio (never stretch), then Lanczos resize to the exact size.
            if img.size != target_size:
                img = ImageOps.fit(img, target_size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))

            # Save strictly as baseline JPEG with JFIF header
            img.save(output_path, format="JPEG", quality=95, subsampling=0)

        # Final verification of magic bytes on disk
        detected = cls.inspect_magic_bytes(output_path)
        if detected != "jpeg":
            raise ValueError(f"Magic bytes verification failed on {output_path}: expected 'jpeg', got '{detected}'")

        return output_path

    @staticmethod
    def check_kie_credits(min_credits: Optional[int] = None) -> Tuple[bool, int, str]:
        """
        Pre-flight check against KIE balance API. min_credits defaults to one 5 s Kling clip without sound.
        Returns (is_sufficient, current_balance, status_message).
        """
        if min_credits is None:
            from .kling_bridge import CREDITS  # lazy: kling_bridge imports this module
            min_credits = CREDITS[("5", False)]
        api_key = PipelineConfig.get_kie_key()
        try:
            resp = requests.get(
                "https://api.kie.ai/api/v1/chat/credit",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                credits = int(data.get("data", 0))
                if credits >= min_credits:
                    return True, credits, f"Credits sufficient: {credits} available (needed {min_credits})"
                return False, credits, f"Insufficient credits: {credits} available (needed {min_credits})"
            return False, 0, f"KIE Credit check HTTP error {resp.status_code}: {resp.text}"
        except Exception as e:
            return False, 0, f"KIE Credit check failed with exception: {str(e)}"

    @staticmethod
    def check_comfy_health(base_url: Optional[str] = None) -> Tuple[bool, Dict]:
        """Checks if ComfyUI local server is active and returning HTTP 200."""
        url = (base_url or PipelineConfig.COMFY_BASE_URL).rstrip("/")
        try:
            resp = requests.get(f"{url}/system_stats", timeout=3)
            if resp.status_code == 200:
                return True, resp.json()
            return False, {"error": f"HTTP {resp.status_code}"}
        except Exception as e:
            return False, {"error": str(e)}
