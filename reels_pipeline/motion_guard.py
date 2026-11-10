"""
Motion guard: reject frozen videos before they reach an ad.

A model that takes "static" literally produces a clip that barely moves. We measure the mean absolute
difference (0-255 grey scale, 270x480) between the first and the last frame.

Calibration (04.11.2026, three accepted Kling 2.6 push-ins of Listing 44):
  first-vs-last = 30.8 / 36.3 / 31.6, mean frame-to-frame step 2.0-3.0.
Frozen clips measure < 5 (rule in .agents/skills/creative-ad-auditor and the veo-video-generator skill).
The threshold 15 sits at about half of the healthy minimum.
"""

from pathlib import Path
from typing import Any, Dict, List

import numpy as np

MIN_FIRST_LAST_DELTA = 15.0
SIZE = (270, 480)  # width, height


def _grey_frames_cv2(path: Path) -> List[np.ndarray]:
    import cv2

    cap = cv2.VideoCapture(str(path))
    frames: List[np.ndarray] = []
    ok, frame = cap.read()
    while ok:
        small = cv2.resize(frame, SIZE, interpolation=cv2.INTER_AREA)
        frames.append(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32))
        ok, frame = cap.read()
    cap.release()
    return frames


def _grey_frames_av(path: Path) -> List[np.ndarray]:
    import av  # PyAV ships with ComfyUI; OpenCV does not

    frames: List[np.ndarray] = []
    with av.open(str(path)) as container:
        for frame in container.decode(video=0):
            frames.append(frame.to_ndarray(width=SIZE[0], height=SIZE[1], format="gray").astype(np.float32))
    return frames


def measure_motion(path: Path) -> Dict[str, Any]:
    path = Path(path)
    backend = "cv2"
    try:
        frames = _grey_frames_cv2(path)
    except ImportError:
        backend = "av"
        frames = _grey_frames_av(path)
    if len(frames) < 2:
        raise ValueError(f"Video has fewer than 2 decodable frames: {path}")
    steps = [float(np.mean(np.abs(frames[i + 1] - frames[i]))) for i in range(len(frames) - 1)]
    return {
        "first_last_delta": round(float(np.mean(np.abs(frames[-1] - frames[0]))), 2),
        "mean_step_delta": round(float(np.mean(steps)), 3),
        "frames": len(frames),
        "backend": backend,
    }


def check_motion(path: Path, min_delta: float = MIN_FIRST_LAST_DELTA) -> Dict[str, Any]:
    """measure_motion() plus a verdict: ok=False means the clip is frozen (do not use, regenerate)."""
    result = measure_motion(path)
    result["min_delta"] = min_delta
    result["ok"] = result["first_last_delta"] >= min_delta
    return result
