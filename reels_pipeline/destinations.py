"""
WHERE A PICTURE GOES (owner 06.11): the registry of destinations (specs/ad_formats.json "destinations") and what follows from it.

A destination is one place a generated picture ends up (Meta feed, Pinterest pin, a Google Search image, ...) with the exact ratio and
pixels it needs, why the picture is there and how it gets there. This module is the ONE reader of that registry:
  - the director asks it which frames to generate for a list of destinations (`frames_of`, `serving`) and what a frame serves;
  - the name of a frame carries the platform of its destination (`platform_tag`): <set>_<pair><n>_<colour>_<tag>_<ratio>;
  - scripts/run_board.py asks which destinations a finished frame (its pixels) fits (`serves_label`);
  - scripts/export_ads.py cuts the delivery files (`render`): exact ratio, minimum pixels, JPEG, the AI label Google Merchant asks for.
Nothing here calls a model, a platform or the network. The upload to the platforms is a separate step that is not built.
"""

import hashlib
import io
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parent.parent
REGISTRY_FILE = ROOT / "specs" / "ad_formats.json"
AI_LABEL_URI = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"
REQUIRED = ("tag", "platform", "ratio", "tolerance", "generate_as", "crop_max", "min_px", "rec_px", "max_mb", "why", "goes_to", "how", "needs", "status")
_XMP_HEADER = b"http://ns.adobe.com/xap/1.0/\x00"
_cache: Dict[str, Any] = {"stamp": None, "data": None}


def registry() -> Dict[str, Dict[str, Any]]:
    """{destination id: its entry}, read again when the file changes."""
    import json

    stamp = REGISTRY_FILE.stat().st_mtime_ns
    if _cache["stamp"] != stamp:
        _cache["data"] = json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))["destinations"]
        _cache["stamp"] = stamp
    return _cache["data"]


def registry_problems() -> List[str]:
    """What is wrong with the registry itself (empty = fine)."""
    problems = []
    for dest_id, d in registry().items():
        missing = [k for k in REQUIRED if k not in d]
        if missing:
            problems.append(f"{dest_id}: missing {missing}")
            continue
        if not dest_id.startswith(d["tag"] + "_"):
            problems.append(f"{dest_id}: the id must start with its platform tag {d['tag']!r} (so a file name says where it goes)")
        if d["ratio"] is not None:
            try:
                ratio_value(d["ratio"])
                ratio_value(d["generate_as"])
            except (ValueError, TypeError):
                problems.append(f"{dest_id}: ratio {d['ratio']!r} / generate_as {d['generate_as']!r} is not 'W:H'")
        if d["status"] not in ("live", "planned", "open"):
            problems.append(f"{dest_id}: status {d['status']!r} is not live / planned / open")
        if not (d["why"].strip() and d["goes_to"].strip() and d["how"].strip()):
            problems.append(f"{dest_id}: why, goes_to and how must say something (the point of the registry)")
    return problems


def ratio_value(text: str) -> float:
    """'4:5' -> 0.8, '1.91:1' -> 1.91 (width / height)."""
    w, h = str(text).split(":")
    return float(w) / float(h)


def _dest(dest_id: str) -> Dict[str, Any]:
    reg = registry()
    if dest_id not in reg:
        raise ValueError(f"unknown destination {dest_id!r} (known: {sorted(reg)})")
    return reg[dest_id]


def serving(frame_ratio: str) -> List[str]:
    """The destinations a frame generated in this ratio is made for (generate_as == the ratio)."""
    return [i for i, d in registry().items() if d.get("generate_as") == frame_ratio]


def platform_tag(dest_id: str) -> str:
    """'meta', 'pinterest', 'google', 'etsy' or 'feed': where a picture made for this destination goes."""
    return _dest(dest_id)["tag"]


def frames_of(dest_ids: List[str]) -> List[Tuple[str, List[str]]]:
    """The frames to generate for these destinations: [(frame ratio, [the destinations that share it])] in the order of the list.
    Destinations that ask for the same ratio share one frame. ValueError when one is unknown or has no fixed ratio."""
    frames: Dict[str, List[str]] = {}
    for dest_id in dest_ids:
        d = _dest(dest_id)
        if not d.get("generate_as"):
            raise ValueError(f"destination {dest_id!r} has no fixed ratio (an owner decision is open): name the frame in `format` instead")
        frames.setdefault(d["generate_as"], []).append(dest_id)
    return list(frames.items())


def describe(dest_id: str) -> str:
    d = _dest(dest_id)
    size = lambda p: "x".join(map(str, p))  # noqa: E731
    parts = [d["ratio"] or "any ratio"]
    if d["min_px"]:
        parts.append(f"min {size(d['min_px'])}")
    if d["rec_px"]:
        parts.append(f"rec {size(d['rec_px'])}")
    return f"{dest_id} ({', '.join(parts)})"


def fit(dest_id: str, width: int, height: int) -> Dict[str, Any]:
    """Does a width x height frame fit the destination? {"ok", "crop" (box or None), "size" (final), "ratio", "problems", "notes"}.
    The exact ratio within `tolerance`; or a centre crop that removes at most `crop_max` of the cut side; then the minimum pixels."""
    d = _dest(dest_id)
    problems: List[str] = []
    notes: List[str] = []
    crop: Optional[Tuple[int, int, int, int]] = None
    size = (width, height)
    actual = width / height
    if d["ratio"]:
        target = ratio_value(d["ratio"])
        if abs(actual / target - 1) > d["tolerance"]:
            cut = 1 - (target / actual if actual > target else actual / target)  # the share of the cut side that must go
            if d["crop_max"] and cut <= d["crop_max"]:
                if actual > target:
                    new_w = round(height * target)
                    left = (width - new_w) // 2
                    crop, size = (left, 0, left + new_w, height), (new_w, height)
                else:
                    new_h = round(width / target)
                    top = (height - new_h) // 2
                    crop, size = (0, top, width, top + new_h), (width, new_h)
                notes.append(f"centre crop removes {cut * 100:.0f}% of the {'width' if actual > target else 'height'}")
            else:
                problems.append(f"ratio {actual:.3f} is not {d['ratio']} (off by {abs(actual / target - 1) * 100:.1f}%, the limit is {d['tolerance'] * 100:.0f}%"
                                + (f"; a crop would remove {cut * 100:.0f}%, the limit is {d['crop_max'] * 100:.0f}%)" if d["crop_max"] else "; this destination never crops)"))
    if d["min_px"] and not problems and (size[0] < d["min_px"][0] or size[1] < d["min_px"][1]):
        problems.append(f"{size[0]}x{size[1]} is below the minimum {d['min_px'][0]}x{d['min_px'][1]}")
    if d["rec_px"] and not problems and (size[0] < d["rec_px"][0] or size[1] < d["rec_px"][1]):
        notes.append(f"below the recommended {d['rec_px'][0]}x{d['rec_px'][1]}")
    return {"ok": not problems, "crop": crop, "size": size, "ratio": actual, "problems": problems, "notes": notes}


def serves_label(width: int, height: int) -> str:
    """The destinations with a fixed ratio that a finished frame of these pixels fits ('(crop)' when it needs a centre crop); '' when none."""
    out = []
    for dest_id, d in registry().items():
        if not d["ratio"]:
            continue
        verdict = fit(dest_id, width, height)
        if verdict["ok"]:
            out.append(dest_id + ("(crop)" if verdict["crop"] else ""))
    return ", ".join(out)


# ------------------------------------------------------------------ the AI label (Google Merchant: every AI-made image)

def with_ai_label(jpeg: bytes) -> bytes:
    """The JPEG with an XMP packet that says IPTC DigitalSourceType = trainedAlgorithmicMedia (inserted after the SOI / JFIF segments)."""
    if jpeg[:2] != b"\xff\xd8":
        raise ValueError("not a JPEG")
    if read_ai_label(jpeg):
        return jpeg
    xmp = ('<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/">\n'
           ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
           '  <rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">\n'
           f'   <Iptc4xmpExt:DigitalSourceType>{AI_LABEL_URI}</Iptc4xmpExt:DigitalSourceType>\n'
           '  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>').encode("utf-8")
    payload = _XMP_HEADER + xmp
    segment = b"\xff\xe1" + (len(payload) + 2).to_bytes(2, "big") + payload
    at = 2
    if jpeg[2:4] == b"\xff\xe0":  # keep the JFIF header first
        at = 4 + int.from_bytes(jpeg[4:6], "big")  # marker (2 bytes) + the segment length, which counts its own 2 bytes
    return jpeg[:at] + segment + jpeg[at:]


def read_ai_label(data: bytes) -> Optional[str]:
    """The DigitalSourceType value of a JPEG's XMP segment, or None. Reads the bytes itself, independent of any imaging library."""
    pos = 2
    while pos + 4 <= len(data) and data[pos] == 0xFF:
        marker = data[pos + 1]
        if marker == 0xDA:  # start of scan: no more metadata
            break
        length = int.from_bytes(data[pos + 2:pos + 4], "big")
        segment = data[pos + 4:pos + 2 + length]
        if marker == 0xE1 and segment.startswith(_XMP_HEADER):
            found = re.search(rb"DigitalSourceType>\s*([^<\s]+)\s*<", segment)
            if found:
                return found.group(1).decode("utf-8")
        pos += 2 + length
    return None


# ------------------------------------------------------------------ the delivery file

def export_name(card_id: str, dest_id: str, size: Tuple[int, int], article: str = "") -> str:
    return f"{article + '__' if article else ''}{card_id}__{dest_id}__{size[0]}x{size[1]}.jpg"


def render(source: Path, dest_id: str, out_path: Path, quality: int = 92) -> Dict[str, Any]:
    """Cut one delivery file from a finished frame: exact ratio (a centre crop only where the destination allows it), JPEG, the AI label
    where the destination needs it, under the platform's size limit. Raises ValueError (nothing written) when the frame does not fit."""
    from PIL import Image

    d = _dest(dest_id)
    with Image.open(source) as opened:
        image = opened.convert("RGB")
    verdict = fit(dest_id, image.width, image.height)
    if not verdict["ok"]:
        raise ValueError("; ".join(verdict["problems"]))
    if verdict["crop"]:
        image = image.crop(verdict["crop"])
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=quality, optimize=True)
    data = buffer.getvalue()
    if "ai_label" in d["needs"]:
        data = with_ai_label(data)
        if read_ai_label(data) != AI_LABEL_URI:
            raise ValueError("the AI label could not be written into the file")
    if len(data) > d["max_mb"] * 1024 * 1024:
        raise ValueError(f"{len(data) / 1024 / 1024:.1f} MB is over the {d['max_mb']} MB limit of {dest_id}")
    Image.open(io.BytesIO(data)).load()  # the file must still decode after the label was inserted
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(data)
    return {"path": out_path, "size": list(image.size), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "cropped": bool(verdict["crop"]), "notes": verdict["notes"], "ai_label": read_ai_label(data)}
