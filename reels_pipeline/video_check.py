"""
Check a finished video (a clip or the final reel) against the delivery spec of a destination (specs/ad_formats.json `video`),
so a file is not uploaded in a shape that Instagram recompresses badly. Free, offline, reads the file with PyAV (no ffmpeg needed).

  py -3.12 -X utf8 scripts/check_reel.py <file.mp4> [--dest meta_stories_reels]

Two levels: ERROR = the platform's own spec is broken (Meta help articles), WARN = the practitioners' advice is not met
(Meta publishes no bitrate, so a bitrate verdict is only ever a warning). Exit code 1 when there is an ERROR.
"""

import json
import os
import struct
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parent.parent
REGISTRY_FILE = ROOT / "specs" / "ad_formats.json"


def spec_of(dest_id: str) -> Dict[str, Any]:
    destinations = json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))["destinations"]
    entry = destinations.get(dest_id) or {}
    if "video" not in entry:
        raise ValueError(f"destination {dest_id!r} has no `video` spec in specs/ad_formats.json (have: {sorted(k for k, v in destinations.items() if 'video' in v)})")
    return entry["video"]


def moov_before_mdat(path: Path) -> Optional[bool]:
    """True when the `moov` atom comes before `mdat` (fast start: playback and processing begin before the whole file is read). None = not an MP4/MOV."""
    try:
        size_total = os.path.getsize(path)
        with open(path, "rb") as f:
            pos = 0
            seen_mdat = False
            while pos + 8 <= size_total:
                f.seek(pos)
                header = f.read(16)
                size, kind = struct.unpack(">I4s", header[:8])
                if size == 1:  # 64-bit size
                    size = struct.unpack(">Q", header[8:16])[0]
                if kind == b"mdat":
                    seen_mdat = True
                if kind == b"moov":
                    return not seen_mdat
                if size < 8:
                    return None
                pos += size
    except OSError:
        return None
    return None


def probe(path: Path) -> Dict[str, Any]:
    """The facts of the file: container, video and audio streams, size, bitrate. No judgement here."""
    import av

    path = Path(path)
    with av.open(str(path)) as container:
        video = next((s for s in container.streams if s.type == "video"), None)
        if video is None:
            raise ValueError(f"{path.name}: no video stream")
        audio = next((s for s in container.streams if s.type == "audio"), None)
        context = video.codec_context
        duration = float(container.duration) / 1_000_000 if container.duration else 0.0
        size = path.stat().st_size
        info: Dict[str, Any] = {
            "file": path.name,
            "container": (container.format.name or "").split(",")[0],
            "codec": video.codec.name,
            "profile": context.profile,
            "pix_fmt": context.pix_fmt,
            "width": video.width,
            "height": video.height,
            "fps": float(video.average_rate) if video.average_rate else 0.0,
            "duration_s": round(duration, 2),
            "size_bytes": size,
            "bitrate_mbps": round(size * 8 / duration / 1e6, 2) if duration else None,
            "color_primaries": getattr(context, "color_primaries", None),
            "audio": None,
            "faststart": moov_before_mdat(path),
        }
        if audio is not None:
            actx = audio.codec_context
            info["audio"] = {"codec": audio.codec.name, "channels": getattr(actx, "channels", None) or audio.channels,
                             "sample_rate": audio.rate or getattr(actx, "sample_rate", None),
                             "kbps": round(audio.bit_rate / 1000) if audio.bit_rate else None}
        return info


def verdict(info: Dict[str, Any], spec: Dict[str, Any]) -> List[Dict[str, str]]:
    """[{"level": "ok" | "warn" | "error", "text": ...}] for a probed file against a `video` spec. Pure: no file access."""
    meta, advice = spec["meta"], spec["advice"]
    out: List[Dict[str, str]] = []

    def add(level: str, text: str) -> None:
        out.append({"level": level, "text": text})

    w, h = info["width"], info["height"]
    if (w, h) == tuple(advice["exact_px"]):
        add("ok", f"size {w}x{h}")
    elif abs(w / h - 9 / 16) <= 0.01 and w >= meta["min_px"][0] and h >= meta["min_px"][1]:
        extra = w - advice["exact_px"][0]
        hint = f": crop {extra // 2} px from each side in the edit, do not scale" if 0 < extra <= 16 and extra % 2 == 0 and h == advice["exact_px"][1] else \
            f": make it exactly {advice['exact_px'][0]}x{advice['exact_px'][1]} in the edit"
        add("warn", f"size {w}x{h} is 9:16 but not the {advice['exact_px'][0]}x{advice['exact_px'][1]} target{hint}")
    elif w < meta["min_px"][0] or h < meta["min_px"][1]:
        add("error", f"size {w}x{h} is below Meta's minimum {meta['min_px'][0]}x{meta['min_px'][1]}")
    else:
        add("error", f"size {w}x{h} is not 9:16 (Instagram will crop or letterbox it)")

    if info["container"] in ("mov", "mp4", "m4a", "3gp", "3g2", "mj2") or info["file"].lower().endswith((".mp4", ".mov")):
        add("ok", f"container {info['file'].rsplit('.', 1)[-1].lower()}")
    else:
        add("error", f"container {info['container']!r}: Meta takes mp4 or mov")

    if info["codec"] == advice["codec"]:
        add("ok", f"codec {info['codec']} ({info['profile']})")
    elif info["codec"] in meta["codecs"]:
        add("warn", f"codec {info['codec']}: Meta accepts it, but the re-encode of H.264 is the predictable one")
    else:
        add("error", f"codec {info['codec']}: Meta takes {', '.join(meta['codecs'])}")

    if info["pix_fmt"] == meta["pix_fmt"]:
        add("ok", f"pixel format {info['pix_fmt']}")
    else:
        add("error", f"pixel format {info['pix_fmt']}: Meta needs {meta['pix_fmt']} (4:2:0, 8-bit)")

    low, high = meta["fps"]
    if low <= info["fps"] <= high:
        add("ok", f"{info['fps']:g} fps (Meta takes {low}-{high}; keep the native rate, do not resample)")
    else:
        add("error", f"{info['fps']:g} fps is outside Meta's {low}-{high}")

    bitrate = info["bitrate_mbps"]
    ok_low, ok_high = advice["bitrate_mbps_ok"]
    if bitrate is None:
        add("warn", "bitrate unknown")
    elif bitrate < ok_low:
        add("warn", f"bitrate {bitrate} Mbps is below {ok_low}: Instagram re-encodes a file that is already starved (advice {advice['bitrate_mbps'][0]}-{advice['bitrate_mbps'][1]})")
    elif bitrate > ok_high:
        add("warn", f"bitrate {bitrate} Mbps is above {ok_high}: more than the re-encode keeps, it only slows the upload")
    else:
        add("ok", f"bitrate {bitrate} Mbps (advice {advice['bitrate_mbps'][0]}-{advice['bitrate_mbps'][1]}, a practitioners' number: Meta publishes none)")

    audio = info["audio"]
    spec_audio = meta["audio"]
    if audio is None:
        add("warn", f"no audio track: {spec_audio['note']} (fine for a source clip, add sound in the final reel)")
    else:
        problems = []
        if audio["codec"] != spec_audio["codec"]:
            problems.append(f"codec {audio['codec']} (need {spec_audio['codec']})")
        if audio["channels"] and audio["channels"] != spec_audio["channels"]:
            problems.append(f"{audio['channels']} channel(s) (need stereo)")
        if audio["sample_rate"] and audio["sample_rate"] not in spec_audio["sample_rates"]:
            problems.append(f"{audio['sample_rate']} Hz (need 44.1 or 48 kHz)")
        if audio["kbps"] and audio["kbps"] < spec_audio["min_kbps"]:
            problems.append(f"{audio['kbps']} kbps (need {spec_audio['min_kbps']}+)")
        add("error" if problems else "ok", "audio " + ("; ".join(problems) if problems else f"{audio['codec']} {audio['channels']}ch {audio['sample_rate']} Hz"))

    if info["faststart"] is False:
        add("warn", "the moov atom is at the END of the file: export with fast start (moov at the front)")
    if info["size_bytes"] > meta["max_gb"] * 1024 ** 3:
        add("error", f"file is {info['size_bytes'] / 1024 ** 3:.1f} GB, Meta's limit is {meta['max_gb']} GB")
    return out
