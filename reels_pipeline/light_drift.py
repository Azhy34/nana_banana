"""
Light drift: a FREE, local "living photo" of a room: only the light moves, nothing else, no model and no credits (owner 12.11: the mural must never move).

From a finished room photo it makes a 5 s clip in which, INSIDE a zone (the floor), the patches of sunlight drift slowly and a few motes of dust float in the
beam. Outside the zone every frame is the photo itself (the same mask idea as reels_pipeline/mural_lock.py), so the wall, the curtain and the furniture cannot
move. The light is moved by shifting the LOW-FREQUENCY illumination of the zone (a heavy blur of its brightness) and multiplying the picture by the ratio: the
tiles and the rug stay where they are, only the light on them slides. PIL and numpy only (no OpenCV): it can run inside ComfyUI too.

A camera move ("flying into the room") is NOT done here: a plain push-in on the finished clip belongs to the edit, where it changes the scale of the picture and
never its drawing.
"""

import math
import random
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np

from . import mural_lock

SIZE = (1080, 1920)  # width, height of the clip, like the Kling clips of the same frame
BLUR_PX = 45  # the scale of a patch of light: the illumination layer is the brightness blurred by this radius
RATIO_LIMIT = 0.22  # the light of a pixel changes by at most 22 percent
BREATH = 0.015  # a slow +-1.5 percent breathing of the light of the whole zone
FEATHER = 60  # a wide soft edge (it lies INSIDE the zone): no step of brightness along the border


def _cover(image_path: Path, size: Tuple[int, int]) -> np.ndarray:
    """The photo cover-cropped to the clip size, float32 RGB 0..255."""
    from PIL import Image

    with Image.open(image_path) as image:
        image = image.convert("RGB")
        scale = max(size[0] / image.width, size[1] / image.height)
        resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
        left, top = (resized.width - size[0]) // 2, (resized.height - size[1]) // 2
        return np.asarray(resized.crop((left, top, left + size[0], top + size[1])), dtype=np.float32)


def _shifted(light: "Image.Image", dx: float, dy: float) -> np.ndarray:  # noqa: F821
    from PIL import Image

    moved = light.transform(light.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy), resample=Image.BICUBIC)
    return np.asarray(moved, dtype=np.float32)


def _motes(count: int, mask: np.ndarray, light: np.ndarray, rng: random.Random):
    """Dust: (x, y, vx, vy, radius, brightness, phase). They start where the zone is lit, drift slowly up and sideways."""
    ys, xs = np.nonzero(mask > 0.9)
    weights = light[ys, xs] ** 2
    weights = weights / weights.sum()
    picks = np.random.default_rng(rng.randrange(1 << 30)).choice(len(xs), size=count, p=weights)
    return [(float(xs[i]), float(ys[i]), rng.uniform(5, 14), rng.uniform(-24, -8), rng.uniform(1.3, 2.9), rng.uniform(40, 95), rng.uniform(0, 6.28)) for i in picks]


def _splat(radius: float) -> np.ndarray:
    size = int(math.ceil(radius * 3)) * 2 + 1
    axis = np.arange(size) - size // 2
    gx, gy = np.meshgrid(axis, axis)
    return np.exp(-(gx ** 2 + gy ** 2) / (2 * radius ** 2)).astype(np.float32)


def make_clip(image_path: Path, out_path: Path, zone: Any, seconds: float = 5.0, fps: int = 24, drift_px: float = 80.0, direction: Tuple[float, float] = (1.0, -0.35),
              dust: int = 90, seed: int = 1, size: Tuple[int, int] = SIZE, mote_gain: float = 1.7) -> Dict[str, Any]:
    """Write the clip and return a report: how still the outside of the zone is (read back from the file) and how much the light moves inside it."""
    import av
    from PIL import Image, ImageFilter

    points = mural_lock.parse_zone(zone)
    if not points:
        raise ValueError("a motion zone is needed: the light moves only inside it")
    base = _cover(Path(image_path), size)
    width, height = size
    mask = mural_lock.soft_mask(points, width, height, FEATHER)[..., None]
    luma = base @ np.array([0.299, 0.587, 0.114], np.float32)
    light_image = Image.fromarray(np.clip(luma, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius=BLUR_PX))
    light0 = np.asarray(light_image, dtype=np.float32) + 8.0
    rng = random.Random(seed)
    motes = _motes(dust, mask[..., 0], light0 / light0.max(), rng)
    frames = int(round(seconds * fps))
    norm = math.hypot(*direction)
    ux, uy = direction[0] / norm, direction[1] / norm
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with av.open(str(out_path), "w") as container:
        stream = container.add_stream("libx264", rate=fps)
        stream.width, stream.height, stream.pix_fmt = width, height, "yuv420p"
        stream.options = {"crf": "15", "preset": "medium", "profile": "high"}
        stream.codec_context.gop_size = fps * 2
        for t in range(frames):
            u = t / max(1, frames - 1)
            ease = 0.5 - 0.5 * math.cos(math.pi * u)  # the drift starts and ends softly
            moved = _shifted(light_image, ux * drift_px * ease, uy * drift_px * ease) + 8.0
            ratio = np.clip(moved / light0, 1 - RATIO_LIMIT, 1 + RATIO_LIMIT) * (1 + BREATH * math.sin(2 * math.pi * u))
            frame = base * (1 + mask * (ratio[..., None] - 1))
            glow = np.zeros((height, width), np.float32)
            for x, y, vx, vy, radius, bright, phase in motes:
                cx = x + vx * u * seconds + 6 * math.sin(phase + 2 * math.pi * u)
                cy = y + vy * u * seconds
                twinkle = 0.55 + 0.45 * math.sin(phase * 2 + 2 * math.pi * u * 1.5)
                splat = _splat(radius)
                half = splat.shape[0] // 2
                x0, y0 = int(round(cx)) - half, int(round(cy)) - half
                if x0 < 0 or y0 < 0 or x0 + splat.shape[1] > width or y0 + splat.shape[0] > height:
                    continue
                glow[y0:y0 + splat.shape[0], x0:x0 + splat.shape[1]] += splat * bright * mote_gain * twinkle
            frame = frame + (glow * mask[..., 0])[..., None] * np.array([1.0, 0.95, 0.85], np.float32)  # warm specks, only inside the zone
            rgb = np.clip(frame + 0.5, 0, 255).astype(np.uint8)
            video_frame = av.VideoFrame.from_ndarray(rgb, format="rgb24")
            for packet in stream.encode(video_frame.reformat(format="yuv420p")):
                container.mux(packet)
        for packet in stream.encode():
            container.mux(packet)
    return _measure(out_path, points, width, height)


def _measure(path: Path, points, width: int, height: int) -> Dict[str, Any]:
    """Read the file back: outside the zone (and its ring) every frame must equal the first one; inside, the light changes."""
    import av

    inside, ring, far = mural_lock._regions(points)
    first = None
    far_max = inside_max = 0.0
    count = 0
    with av.open(str(path)) as container:
        for frame in container.decode(video=0):
            small = mural_lock._grey_small(frame.to_ndarray(format="gray"))
            if first is None:
                first = small
            diff = np.abs(small - first)
            far_max = max(far_max, mural_lock._mean(diff, far))
            inside_max = max(inside_max, mural_lock._mean(diff, inside))
            count += 1
    return {"frames": count, "outside_zone_max_change": round(far_max, 3), "inside_zone_max_change": round(inside_max, 2), "out": str(path),
            "mbps": round(Path(path).stat().st_size * 8 / (count / 24.0) / 1e6, 1)}
