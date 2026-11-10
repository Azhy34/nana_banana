"""
CAROUSEL sets (owner 06.11): pairs of photos of ONE composition in different interior colourways, for an Instagram carousel (and, later, as
the first and last frame of a clip). A pair shares the camera, the room, the hero piece, the light and its random leftovers (`seedKey`);
only the accent colour differs. The format is per pair (9:16 for stories and reels, 4:5 for the feed carousel).

The task is data (specs/sets/<set>.json, "type": "carousel"); this module composes ready photo cards from it and checks them against the
same rules as every frame (mural first: wide shot, angled, one low hero piece, at most two small accessories, colours that suit the style).
The cards are full-prompt cards with their tags pinned, built by services/promptGenerator.ts like the web app's; they reach the boards
through the generated file (`<set>.generated.json`), which scripts/build_comfy_workflows.py already reads.
"""

import difflib
import random
import re
from typing import Any, Dict, List, Tuple

from . import destinations
from . import director as d
from .board_layout import MAX_PHOTO_CHAINS as MAX_CHAINS  # a board holds at most this many chains = the colourways of one pair
from .prompts import build_batch_prompts

FORMATS = ("9:16", "4:5", "4:3", "2:3", "16:9", "1:1")
# A pair names its frame by `for` (the destinations it serves: specs/ad_formats.json) or by `format`; with both they must agree.
PAIR_KEYS = ("id", "age", "style", "key_object", "lighting", "accessories", "colorways")


def _slug(colour: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", colour.lower().split()[-1])


def _key_objects(data: Dict[str, Any], age: str) -> Dict[str, bool]:
    """Names of the key objects of an age group (the Design node's list) -> may it stand at random (muralSafe)."""
    names = {k["name"]: k.get("muralSafe") is not False for k in data["keyObjects"] if k.get("ageGroup") == age}
    names.update({b: True for b in (data["ageGroups"].get(age) or {}).get("beds", [])})
    return names


def _pool_name(item: Any) -> str:
    return item["name"] if isinstance(item, dict) else item


def _model_formats(model: str) -> List[str]:
    from .kie_capabilities import choices
    from .kie_generator import ALL_IMAGE_MODELS

    return list(choices(model, "aspect_ratio", [])) if model in ALL_IMAGE_MODELS else []


def plan_carousel(spec: Dict[str, Any]) -> Dict[str, Any]:
    """{"set", "type", "model", "cards", "pairs", "problems"}; `problems` empty = the set may be built and put on the boards."""
    data = d._load(d.TRENDS)
    styles = {s["name"]: s for s in data["styles"]}
    angles, elevations = data["cameraAngles"], data["cameraElevations"]
    pools = {"lighting": {_pool_name(x) for x in data["lighting"]}, "depth": {_pool_name(x) for x in data["depthOfField"]},
             "accessories": set(data["accessories"]), "colors": {c["name"] for c in data["colors"]}}
    gear_ok = d.interior_gear()
    max_acc = data["staging"]["maxAccessories"]
    model = spec.get("model", "nano-banana-2-1")
    model_formats = _model_formats(model)
    problems: List[str] = []
    if not model_formats:
        problems.append(f"model {model!r} is not a KIE photo model of the pipeline (or has no aspect_ratio field)")
    cards: List[Dict[str, Any]] = []
    pairs: List[Dict[str, Any]] = []
    for pair in spec["pairs"]:
        missing = [k for k in PAIR_KEYS if pair.get(k) in (None, "", [])]
        if not (pair.get("format") or pair.get("for")):
            missing.append("format or for")
        if missing:
            raise ValueError(f"pair {pair.get('id')!r}: missing {missing} (a pair needs {list(PAIR_KEYS)} and `for` or `format`)")
        pid, age, style = pair["id"], pair["age"], pair["style"]
        tag = f"pair {pid}"
        # The frames of the pair: one per ratio the destinations ask for (destinations with one ratio share a frame). `format` names one frame.
        serves = list(pair.get("for") or [])
        fmt = pair.get("format") or ""
        frames: List[Tuple[str, List[str]]] = []
        if serves:
            try:
                frames = destinations.frames_of(serves)
            except ValueError as exc:
                problems.append(f"{tag}: {exc}")
            if fmt and any(ratio != fmt for ratio, _ in frames):
                problems.append(f"{tag}: format {fmt!r} contradicts `for` {serves}, which need {[r for r, _ in frames]}: give only `for`")
        elif fmt:
            frames = [(fmt, destinations.serving(fmt))]
            serves = frames[0][1]
        # A carousel pair is ONE design in other colours. Frames for a REEL must be different designs (a reel set), so a pair with several
        # colours for a clip-source destination (Reels) is refused unless it is meant as a Stories carousel.
        if len(pair["colorways"]) >= 2 and pair.get("purpose") != "stories_carousel" and any(
                destinations.registry()[x].get("clip_source") for _, ds in frames for x in ds):
            problems.append(f"{tag}: frames for a reel must be DIFFERENT designs (style, age, side, person): use a reel set (type reel, "
                            "specs/design_kits.json); a carousel pair is one design in other colours. For a Stories carousel say \"purpose\": \"stories_carousel\"")
        for ratio, _ in frames:
            if ratio not in FORMATS or (model_formats and ratio not in model_formats):
                problems.append(f"{tag}: format {ratio!r} is not one of {FORMATS} or not supported by {model} ({model_formats})")
        fmt = "+".join(ratio for ratio, _ in frames)
        if age not in d.MODEL_AGES:
            problems.append(f"{tag}: age {age!r} is not one of {d.MODEL_AGES}")
        card_style = styles.get(style)
        if card_style is None:
            problems.append(f"{tag}: style {style!r} is not in Promt/trends.json (known: {sorted(styles)})")
        colourways = pair["colorways"]
        # A pair is the same composition in other colours; with several frames it is the same design in other sizes, one colour is enough.
        if len(set(colourways)) != len(colourways) or (len(frames) < 2 and len(colourways) < 2):
            problems.append(f"{tag}: a pair needs at least two different colourways (one is enough when it has several frames), got {colourways}")
        if len(colourways) * max(len(frames), 1) > MAX_CHAINS:
            problems.append(f"{tag}: {len(colourways)} colourways" + (f" x {len(frames)} frames" if len(frames) > 1 else "")
                            + f" do not fit one board (at most {MAX_CHAINS} chains)")
        for colour in colourways:
            if colour not in pools["colors"]:
                problems.append(f"{tag}: colour {colour!r} is not in Promt/trends.json")
            elif card_style and colour not in card_style["colors"]:
                problems.append(f"{tag}: colour {colour!r} does not suit the style {style!r} (its card allows {card_style['colors']})")
        objects = _key_objects(data, age)
        if pair["key_object"] not in objects:
            problems.append(f"{tag}: {pair['key_object']!r} is not a key object of the age group {age!r}")
        elif not objects[pair["key_object"]]:
            problems.append(f"{tag}: {pair['key_object']!r} is tall or a set with chairs (muralSafe: false) and would hide the mural")
        if pair["lighting"] not in pools["lighting"]:
            problems.append(f"{tag}: lighting {pair['lighting']!r} is not in Promt/trends.json")
        accessories = pair["accessories"]
        bad = [a for a in accessories if a not in pools["accessories"]]
        if bad:
            problems.append(f"{tag}: accessories not in Promt/trends.json: {bad}")
        allowed = (data["ageGroups"].get(age) or {}).get("accessories")
        wrong_age = [a for a in accessories if allowed and a in pools["accessories"] and a not in allowed]
        if wrong_age:
            problems.append(f"{tag}: accessories that do not suit the age group {age!r} (its list is in Promt/trends.json ageGroups.{age}.accessories): {wrong_age}")
        if len(accessories) > max_acc:
            problems.append(f"{tag}: {len(accessories)} accessories, the mural-first limit is {max_acc} (trends.json staging)")
        angle = pair.get("angle", 0)
        if isinstance(angle, int):
            if not 0 <= angle < len(angles):
                problems.append(f"{tag}: angle {angle} is outside the {len(angles)} angles of Promt/trends.json")
                angle = 0
            angle = angles[angle]
        elif angle not in angles:
            problems.append(f"{tag}: angle is not one of the angles of Promt/trends.json")
        elevation = elevations[pair.get("elevation", 0)] if isinstance(pair.get("elevation", 0), int) and pair.get("elevation", 0) < len(elevations) else None
        if elevation is None:
            problems.append(f"{tag}: elevation index is outside the {len(elevations)} elevations of Promt/trends.json")
        depth = pair.get("depth_of_field", "deep depth of field")
        if depth not in pools["depth"]:
            problems.append(f"{tag}: depth of field {depth!r} is not in Promt/trends.json")
        gear = pair.get("gear")
        if gear is None:
            rng = random.Random(f"{pair.get('variation', 0)}|{pid}")
            gear = {"body": rng.choice(gear_ok["bodies"]), "lens": rng.choice(gear_ok["lenses"]), "aperture": rng.choice(gear_ok["apertures"])}
        for key, pool in (("body", "bodies"), ("lens", "lenses"), ("aperture", "apertures")):
            if gear.get(key) not in gear_ok[pool]:
                problems.append(f"{tag}: {key} {gear.get(key)!r} is not a room-photo choice (wide lens up to {d.MAX_FOCAL_MM} mm, aperture from f/{d.MIN_F_NUMBER:g}): {gear_ok[pool]}")
        variation = int(pair.get("variation", 0))
        seed_key = pair.get("seed_key") or f"{spec['id']}_{pid}"
        ids: List[str] = []
        pair_frames: List[Dict[str, Any]] = [{"format": ratio, "serves": dests, "cards": []} for ratio, dests in frames]
        n = 0
        for colour in colourways:
            for frame, (ratio, dests) in zip(pair_frames, frames):
                n += 1
                # <set>_<pair><n>_<colour>_<platform>_<ratio>: the name says where the frame goes (the platform of its first destination)
                card_id = "_".join(x for x in (f"{spec.get('id_prefix', spec['id'])}", f"{pid}{n}", _slug(colour),
                                               destinations.platform_tag(dests[0]) if dests else "", ratio.replace(":", "x")) if x)
                ids.append(card_id)
                frame["cards"].append(card_id)
                cards.append({
                    "id": card_id, "ageGroup": age, "aspectRatio": ratio, "seedKey": seed_key, "variation": variation,
                    "tags": {"style": style, "color": colour, "keyObject": pair["key_object"], "lighting": pair["lighting"],
                             "cameraAngle": angle, "cameraElevation": elevation, "cameraDistance": "wide shot", "depthOfField": depth,
                             "cameraBody": gear.get("body"), "lens": gear.get("lens"), "aperture": gear.get("aperture"),
                             "compositionStrategy": "unobstructed", "wallArchitecture": "full-wall", "accessories": list(accessories)},
                    "reel": {"set": spec["id"], "pair": pid, "colorway": colour, "serves": dests},
                })
        pairs.append({"pair": pid, "format": fmt, "serves": [x for _, dests in frames for x in dests], "frames": pair_frames,
                      "cards": ids, "colorways": list(colourways)})
    all_ids = [c["id"] for c in cards]
    if len(set(all_ids)) != len(all_ids):
        problems.append("two cards got the same id: pair ids must be unique")
    return {"set": spec["id"], "type": "carousel", "model": model, "cards": cards, "pairs": pairs, "problems": problems}


def pair_prompts(plan: Dict[str, Any], pair_id: str) -> Dict[str, str]:
    """The exact full prompts of the cards of one pair, as the Design node builds them (seed = the pair's `variation`): {card id: prompt}."""
    pair = next((p for p in plan["pairs"] if p["pair"] == pair_id), None)
    if pair is None:
        raise ValueError(f"no pair {pair_id!r}; the set has {[p['pair'] for p in plan['pairs']]}")
    by_id = {c["id"]: c for c in plan["cards"]}
    out = {}
    for card_id in pair["cards"]:
        card = {**by_id[card_id], "seed": by_id[card_id]["variation"]}
        out[card_id] = build_batch_prompts([card], aspect_ratio=card["aspectRatio"])[0]["prompt"]
    return out


def differing_sentences(first: str, second: str) -> List[Dict[str, str]]:
    """The sentences in which two prompts differ: [{"a": ..., "b": ...}]. For a good pair this is the colourway sentence and nothing else."""
    split = lambda t: re.split(r"(?<=[.!?:]) ", t.replace("\n\n", " ¶ "))  # noqa: E731
    a, b = split(first), split(second)
    return [{"a": " ".join(a[i1:i2]), "b": " ".join(b[j1:j2])}
            for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes() if tag != "equal"]
