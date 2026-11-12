"""Offline acceptance of the mural lock (reels_pipeline/mural_lock.py): a clip whose wall cannot move. No ComfyUI, no KIE, no credits; the clips are synthetic.

Run: py -3.12 -X utf8 -m pytest -o addopts="" comfy_nodes/test_mural_lock.py -q
"""

import json
from pathlib import Path

import numpy as np
import pytest

from comfy_nodes import moonbloom_nodes as nodes
from reels_pipeline import director, mural_lock

ROOT = Path(__file__).resolve().parent.parent
W, H, FRAMES = 540, 960, 24
ZONE = [[0.30, 0.55], [0.70, 0.55], [0.70, 0.85], [0.30, 0.85]]


def _synthetic_clip(path: Path, wall_drift: float = 1.0, mover: bool = True) -> Path:
    """The upper half is a 'wall' (a smooth watercolour-like texture) that DRIFTS sideways by `wall_drift` px per frame, like a model that moves the mural; the lower half is
    a still 'floor' with a bright square that moves inside the zone (when `mover`)."""
    import av
    import cv2

    rng = np.random.default_rng(7)
    noise = rng.random((H, W + 80)).astype(np.float32)
    smooth = cv2.GaussianBlur(noise, (0, 0), 9)
    texture = (60 + 140 * (smooth - smooth.min()) / (smooth.max() - smooth.min())).astype(np.uint8)
    floor = texture[:, :W].copy()
    with av.open(str(path), "w") as out:
        stream = out.add_stream("libx264", rate=24)
        stream.width, stream.height, stream.pix_fmt = W, H, "yuv420p"
        stream.options = {"crf": "12"}
        for t in range(FRAMES):
            shift = int(round(t * wall_drift))
            gray = floor.copy()
            gray[: H // 2] = texture[: H // 2, shift:shift + W]
            if mover:
                x = int(W * 0.35) + t * 4
                gray[int(H * 0.65):int(H * 0.65) + 60, x:x + 60] = 255
            rgb = np.stack([gray] * 3, axis=-1)
            for packet in stream.encode(av.VideoFrame.from_ndarray(rgb, format="rgb24")):
                out.mux(packet)
        for packet in stream.encode():
            out.mux(packet)
    return path


def test_a_zone_is_a_polygon_or_a_rectangle_of_the_frame_and_nothing_else():
    assert mural_lock.parse_zone("0.1,0.2,0.5,0.6") == [(0.1, 0.2), (0.5, 0.2), (0.5, 0.6), (0.1, 0.6)]
    assert mural_lock.parse_zone(json.dumps(ZONE))[0] == (0.30, 0.55) and mural_lock.parse_zone("") == [] and mural_lock.parse_zone(None) == []
    for bad, why in (("0.1,0.1,1.5,0.5", "0..1"), ("[[0.1,0.1],[0.5,0.5]]", "at least 3"), ("0,0,1,1", "covers"), ("0.2,0.2,0.2,0.6", "more than 0")):
        with pytest.raises(ValueError, match=why):
            mural_lock.parse_zone(bad)


def test_the_locked_file_has_a_wall_that_does_not_move_while_the_model_moved_it(tmp_path):
    import av

    raw = _synthetic_clip(tmp_path / "clip__raw.mp4", wall_drift=1.0)
    report = mural_lock.lock_clip(raw, tmp_path / "clip.mp4", ZONE)
    assert report["raw"]["model_moved_the_wall"] > 1.0                       # the model's file had a drifting wall (what the lock exists for)
    assert report["locked"]["far_max"] < mural_lock.LOCKED_STILL_MAX          # the locked file has none, measured on the file that was written
    assert report["locked"]["inside_first_last"] > 3.0                       # and the zone still moves
    frames = []
    with av.open(str(tmp_path / "clip.mp4")) as container:
        for frame in container.decode(video=0):
            frames.append(frame.to_ndarray(format="gray").astype(np.int16))
    assert len(frames) == FRAMES
    wall = np.zeros((H, W), bool)
    wall[: int(H * 0.45)] = True                                              # the upper part of the frame is far from the zone: the 'mural'
    assert max(np.abs(f[wall] - frames[0][wall]).max() for f in frames) <= 4  # pixel by pixel the same as the first frame (codec noise only)
    assert np.abs(frames[-1][int(H * 0.65):int(H * 0.65) + 60, 300:400] - frames[0][int(H * 0.65):int(H * 0.65) + 60, 300:400]).mean() > 3


def test_a_clip_whose_zone_does_not_move_is_reported_frozen_and_the_models_file_is_kept(tmp_path):
    clip = _synthetic_clip(tmp_path / "scene__kling26_pushin_9x16.mp4", wall_drift=1.0, mover=False)    # only the wall moved, nothing in the zone
    report, motion = mural_lock.lock_in_place(clip, ZONE, min_zone_delta=2.0)
    assert motion["ok"] is False and motion["first_last_delta"] < 2.0         # a locked clip with nothing moving in the zone is frozen: the node refuses it
    assert (tmp_path / "scene__kling26_pushin_9x16__raw.mp4").is_file() and clip.is_file()               # the model's own file stays, next to the locked one
    assert report["raw"]["model_moved_the_wall"] > 1.0


def test_a_motion_zone_needs_a_locked_camera_and_a_valid_polygon_in_the_director():
    spec = json.loads((ROOT / "specs" / "sets" / "l31_reel01.json").read_text(encoding="utf-8"))
    for slot in spec["slots"]:
        slot["motion_zone"] = ZONE
    problems = director.validate_spec(spec)["problems"]
    s2 = [p for p in problems if "l31_reel01_s2" in p]
    assert s2 and "needs a locked camera" in s2[0]                            # s2 is a walk-in: the whole picture moves, a lock is impossible
    assert not [p for p in problems if "l31_reel01_s1" in p and "motion_zone" in p]
    spec["slots"][0]["motion_zone"] = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 0.9]]
    assert any("motion_zone" in p and "covers" in p for p in director.validate_spec(spec)["problems"])


def test_the_zone_reaches_the_kling_node_and_the_board(tmp_path):
    assert "motion_zone" in nodes.MoonbloomKieKling.INPUT_TYPES()["optional"]
    import importlib.util

    spec = importlib.util.spec_from_file_location("build_comfy_workflows", ROOT / "scripts" / "build_comfy_workflows.py")
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    assert builder.zone_text({"motion_zone": ZONE}) == json.dumps(ZONE) and builder.zone_text({}) == ""
