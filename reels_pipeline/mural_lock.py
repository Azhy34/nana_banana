"""
The mural lock: a clip whose wall CANNOT move (owner 12.11: "the wallpaper must stay still, strictly forbidden to move, forbid it at the node").

The video model cannot be forbidden anything: KIE Kling 2.6 has no negative prompt, no mask, no cfg scale and takes ONE picture. What the node can do is to
decide what ends up in the FILE. For a clip shot with a LOCKED camera (nothing in the frame changes its place except what acts) the node keeps the first frame
as a static plate and takes the video only inside a motion zone (a polygon around the child, the toy, the light on the floor); everywhere else, the mural and the
whole room, every frame of the file is the first frame. Whatever the model did to the wall in those 5 seconds is thrown away. Measured before this existed
(journal 08.11): Kling moved the painted balloon of Listing 7 by 41 px of 960 while the prompt said the wall stays still.

Not possible with a MOVING camera (a walk-in): there the whole picture legitimately changes. Such a clip has no zone and no lock.

The work is done in the YUV 4:2:0 planes of the source (no colour conversion, so outside the zone the picture is the source's own) and the result is encoded once
with H.264 (the file is saved twice: `<name>__raw.mp4` as the model made it, `<name>.mp4` locked). The report says how much the model moved the wall (what was
removed), how still the locked file really is (read back from the file), and whether motion reaches the edge of the zone (the lock would cut a moving hand).
"""

from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple, Union

import numpy as np

FEATHER_PX = 8  # the soft edge lies INSIDE the zone: outside the polygon the mask is exactly 0
RING_PX = 40  # a band outside the zone: motion there means the zone is too small
MAX_AREA = 0.5  # a zone larger than half of the frame is not a zone, it is the picture
SMALL = (270, 480)  # width, height of the measuring copies
RING_WARN = 3.0  # grey levels: a moving thing crosses the edge of the zone
LOCKED_STILL_MAX = 1.0  # grey levels: the locked region must not differ from the first frame by more than this (H.264 noise)

Point = Tuple[float, float]


def parse_zone(zone: Union[str, Sequence[Sequence[float]], None]) -> List[Point]:
    """A zone as a polygon of points in 0..1 of the frame (x to the right, y down). Accepts a JSON list [[x, y], ...] (string or list) or four numbers
    'x0,y0,x1,y1' (a rectangle). Empty = no lock. Raises ValueError on a bad zone."""
    import json

    if zone is None or (isinstance(zone, str) and not zone.strip()):
        return []
    if isinstance(zone, str):
        text = zone.strip()
        zone = json.loads(text) if text.startswith("[") else [float(v) for v in text.split(",")]
    if len(zone) == 4 and not isinstance(zone[0], (list, tuple)):
        x0, y0, x1, y1 = (float(v) for v in zone)
        zone = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    points = [(float(x), float(y)) for x, y in zone]
    if len(points) < 3:
        raise ValueError(f"a motion zone needs at least 3 points, got {len(points)}")
    if any(not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0) for x, y in points):
        raise ValueError("motion zone points are fractions of the frame, 0..1")
    area = abs(sum(points[i][0] * points[(i + 1) % len(points)][1] - points[(i + 1) % len(points)][0] * points[i][1] for i in range(len(points)))) / 2
    if area <= 0.0 or area > MAX_AREA:
        raise ValueError(f"the motion zone covers {area:.0%} of the frame: it must be more than 0 and at most {MAX_AREA:.0%}")
    return points


def zone_area(points: List[Point]) -> float:
    return abs(sum(points[i][0] * points[(i + 1) % len(points)][1] - points[(i + 1) % len(points)][0] * points[i][1] for i in range(len(points)))) / 2


def _polygon(points: List[Point], width: int, height: int) -> np.ndarray:
    import cv2

    mask = np.zeros((height, width), np.uint8)
    pts = np.array([[round(x * (width - 1)), round(y * (height - 1))] for x, y in points], np.int32)
    cv2.fillPoly(mask, [pts], 1)
    return mask


def soft_mask(points: List[Point], width: int, height: int, feather: int = FEATHER_PX) -> np.ndarray:
    """float32 0..1: 1 deep inside the zone, a soft edge inside it, exactly 0 outside the polygon."""
    import cv2

    inside = _polygon(points, width, height)
    core = cv2.erode(inside, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * feather + 1, 2 * feather + 1)))
    soft = cv2.GaussianBlur(core.astype(np.float32), (0, 0), sigmaX=feather / 3.0)
    return soft * inside


def _planes(arr: np.ndarray, width: int, height: int):
    """(Y, U, V) views of a yuv420p ndarray of PyAV: shape (height * 3 // 2, width)."""
    y = arr[:height]
    u = arr[height:height + height // 4].reshape(height // 2, width // 2)
    v = arr[height + height // 4:].reshape(height // 2, width // 2)
    return y, u, v


def _grey_small(y: np.ndarray) -> np.ndarray:
    import cv2

    return cv2.resize(y, SMALL, interpolation=cv2.INTER_AREA).astype(np.float32)


def _regions(points: List[Point]):
    """Boolean masks at the measuring size: inside the zone, the ring just outside it, and the far field (everything else: the mural and the room)."""
    import cv2

    inside = _polygon(points, SMALL[0], SMALL[1]).astype(bool)
    k = max(3, int(round(RING_PX * SMALL[0] / 1080.0)) * 2 + 1)
    grown = cv2.dilate(inside.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))).astype(bool)
    return inside, grown & ~inside, ~grown


def _mean(diff: np.ndarray, region: np.ndarray) -> float:
    return float(diff[region].mean()) if region.any() else 0.0


def lock_clip(raw_path: Path, out_path: Path, zone: Union[str, Sequence, None], crf: int = 15) -> Dict[str, Any]:
    """Write `out_path`: every frame = the first frame of `raw_path` outside the zone, the clip's own frame inside it (soft edge). Returns the report; raises
    ValueError for a bad zone or a clip with sound (a clip with a locked wall is silent: the sound models are not used for it)."""
    import av
    import cv2

    points = parse_zone(zone)
    if not points:
        raise ValueError("no motion zone: nothing to lock")
    raw_path, out_path = Path(raw_path), Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    inside_s, ring_s, far_s = _regions(points)
    plate = None
    first_small = None
    stats = {"inside_last": 0.0, "far_last": 0.0, "far_max": 0.0, "ring_max": 0.0, "inside_max": 0.0}
    frames = 0
    with av.open(str(raw_path)) as src:
        if src.streams.audio:
            raise ValueError("the clip has a sound track: the mural lock is for silent clips")
        stream = src.streams.video[0]
        width, height = stream.codec_context.width, stream.codec_context.height
        if width % 2 or height % 2:
            raise ValueError(f"odd frame size {width}x{height}")
        fps = stream.average_rate or 24
        mask_y = soft_mask(points, width, height)
        mask_c = np.clip(cv2.resize(mask_y, (width // 2, height // 2), interpolation=cv2.INTER_AREA), 0.0, 1.0)
        with av.open(str(out_path), "w") as dst:
            out_stream = dst.add_stream("libx264", rate=fps)
            out_stream.width, out_stream.height, out_stream.pix_fmt = width, height, "yuv420p"
            out_stream.options = {"crf": str(crf), "preset": "medium", "profile": "high", "maxrate": "15M", "bufsize": "30M"}
            out_stream.codec_context.gop_size = int(round(float(fps))) * 2
            for frame in src.decode(video=0):
                arr = frame.to_ndarray(format="yuv420p")
                y, u, v = _planes(arr, width, height)
                small = _grey_small(y)
                if plate is None:
                    plate = (y.astype(np.float32), u.astype(np.float32), v.astype(np.float32))
                    first_small = small
                diff = np.abs(small - first_small)
                stats["inside_last"], stats["far_last"] = _mean(diff, inside_s), _mean(diff, far_s)
                stats["far_max"] = max(stats["far_max"], stats["far_last"])
                stats["ring_max"] = max(stats["ring_max"], _mean(diff, ring_s))
                stats["inside_max"] = max(stats["inside_max"], stats["inside_last"])
                out = np.empty_like(arr)
                oy, ou, ov = _planes(out, width, height)
                oy[:] = np.clip(plate[0] * (1 - mask_y) + y * mask_y + 0.5, 0, 255).astype(np.uint8)
                ou[:] = np.clip(plate[1] * (1 - mask_c) + u * mask_c + 0.5, 0, 255).astype(np.uint8)
                ov[:] = np.clip(plate[2] * (1 - mask_c) + v * mask_c + 0.5, 0, 255).astype(np.uint8)
                for packet in out_stream.encode(av.VideoFrame.from_ndarray(out, format="yuv420p")):
                    dst.mux(packet)
                frames += 1
            for packet in out_stream.encode():
                dst.mux(packet)
    if frames < 2:
        raise ValueError(f"the clip has {frames} frame(s): nothing to lock")
    locked = _read_back(out_path, points)
    seconds = frames / float(fps)
    warnings: List[str] = []
    if stats["ring_max"] > RING_WARN:
        warnings.append(f"motion reaches the edge of the zone (mean {stats['ring_max']:.1f} grey levels in the band around it): the lock may cut a moving part, widen the zone")
    if locked["far_max"] > LOCKED_STILL_MAX:
        warnings.append(f"the locked region is not still ({locked['far_max']:.2f} grey levels): the encoder changed it")
    return {"ok": not warnings or all("widen" in w for w in warnings), "frames": frames, "fps": float(fps), "seconds": round(seconds, 2), "zone_area": round(zone_area(points), 3),
            "raw": {"model_moved_the_wall": round(stats["far_max"], 2), "model_motion_inside_zone": round(stats["inside_max"], 2), "motion_at_zone_edge": round(stats["ring_max"], 2)},
            "locked": locked, "warnings": warnings, "out": str(out_path), "mbps": round(out_path.stat().st_size * 8 / seconds / 1e6, 1)}


def lock_in_place(clip_path: Path, zone: Union[str, Sequence, None], min_zone_delta: float) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """What the Kling node does after the paid download: the clip as the model made it is kept as `<name>__raw.mp4`, the locked clip takes its place. Returns
    (lock report, motion report). The motion report has the shape of motion_guard.check_motion, but it measures the ZONE (the wall is still by construction):
    ok is False when nothing moves in the zone (a frozen clip)."""
    clip_path = Path(clip_path)
    raw = clip_path.with_name(f"{clip_path.stem}__raw{clip_path.suffix}")
    clip_path.replace(raw)
    try:
        report = lock_clip(raw, clip_path, zone)
    except Exception as exc:
        raise RuntimeError(f"the mural lock failed after the paid download ({exc}); the clip as the model made it is kept as {raw.name}") from exc
    delta = report["locked"]["inside_first_last"]
    motion = {"first_last_delta": delta, "min_delta": min_zone_delta, "ok": delta >= min_zone_delta, "frames": report["frames"], "backend": "mural_lock (measured in the zone)"}
    return report, motion


def _read_back(path: Path, points: List[Point]) -> Dict[str, float]:
    """Decode the file that was written and measure it: the far field must equal its first frame, the zone must move."""
    import av

    inside_s, ring_s, far_s = _regions(points)
    first = None
    far_max = inside_last = 0.0
    with av.open(str(path)) as container:
        for frame in container.decode(video=0):
            small = _grey_small(frame.to_ndarray(format="gray"))
            if first is None:
                first = small
            diff = np.abs(small - first)
            far_max = max(far_max, _mean(diff, far_s))
            inside_last = _mean(diff, inside_s)
    return {"far_max": round(far_max, 3), "inside_first_last": round(inside_last, 2)}
