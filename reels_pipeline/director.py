"""
The DIRECTOR of a reel set: from a task (specs/sets/<set>.json) + design kits (specs/design_kits.json) + roles (specs/roles.json) +
the facts of the listing (its spec: `brief`, `lock`) to ready photo cards and clips. The owner gives the task in words, the agent
edits these JSON files (never code), `scripts/director.py` composes and checks, `scripts/build_comfy_workflows.py` puts the result on
the two boards, the owner picks the best 3 photos, they are animated, and the owner assembles the reel himself.

The director is deliberately a COMPOSER, not an author: the interest of a design lives in the kit (written by the agent from our own
prompts and the variables of Promt/trends.json), the director only guarantees what must hold for every frame of every listing:
the product is safe (decor on the side wall, a ceiling fixture high above the mural, nothing in front of it), faces are never shown,
the texts fit the model limits, the choice of kits is varied, and the same seed always gives the same set.
"""

import json
import random
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import mural_lock
from .config import PipelineConfig
from .prompts import build_brief_prompt, clip_prompt

SPECS = PipelineConfig.ROOT_DIR / "specs"
TRENDS = PipelineConfig.ROOT_DIR / "Promt" / "trends.json"
MODEL_AGES = ("baby", "vorschul", "schulkind")
MAX_FOCAL_MM = 35  # wide enough to show a whole room; 45/50 mm would crop the mural
MIN_F_NUMBER = 8.0  # sharp across the whole wall, never a shallow blur
BRIEF_MAX = 2800  # style signature, accent colour and the real-photograph line included; the web app's prompt is about 6 200
CLIP_MAX = 2500  # Kling 2.6 prompt limit in KIE's schema
# What must never appear: camera moves the owner banned (creative-ad-auditor) and words that belong to the web app's template.
BANNED_MOTION = ("pedestal", "crane up", "tilt up", "gliding", "sliding", "rolling", "orbit", "pan left", "pan right", "zoom", "push-in", "dolly in")
# Things that hide the mural when they stand in the room (owner 06.11, Listing 6 test): the director keeps only low things on the side wall.
BANNED_SCENE_ITEMS = ("wardrobe", "teepee", "bunny-ear", "table and chairs", "tall shelf", "tall bookcase",
                      "basket", "wicker", "rattan", "woven", "straw")  # last row: the long-standing ban (the model draws them bent and melted)
BANNED_PHOTO = ("Avoid:", "Aspect ratio", "REFERENCE_IMAGE", "focal furniture", "Authentic lived-in", "FULL-HEIGHT 100% WALL COVERAGE")
AUDIENCES = ("boy", "girl", "neutral")
AUDIENCE_KITS = {"boy": ("boy", "neutral"), "girl": ("girl", "neutral"), "neutral": ("neutral",)}  # the kits that suit a wallpaper / a requested child
FALLBACK_CAMERA_TURN = 15  # degrees toward the mural wall: less is a frontal shot (the owner's "cage" look, 05.11); the real minimum is the smallest of trends.cameraAngles
FRONTAL_WORDS = ("head-on", "straight on", "straight-on", "frontal", "square to the wall", "perpendicular")
MALE_WORDS = re.compile(r"\b(he|his|him|himself)\b", re.I)
FEMALE_WORDS = re.compile(r"\b(she|her|hers|herself)\b", re.I)
KIT_PARTS = ("id", "audience", "age", "side", "style", "color", "lighting", "subject", "room", "floor", "side_wall", "light", "palette", "items",
             "life_pose", "life_action")


def _load(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_kits() -> Dict[str, Dict[str, Any]]:
    return {k["id"]: k for k in _load(SPECS / "design_kits.json")["kits"]}


def load_roles() -> Dict[str, Any]:
    return _load(SPECS / "roles.json")


def load_video_models() -> Dict[str, Any]:
    """What we know about each video model (specs/video_models.json): price estimate, good_for, bad_for, evidence."""
    return _load(SPECS / "video_models.json")


def load_video_motion() -> Dict[str, Any]:
    """The vocabulary of video motion (specs/video_motion.json): camera moves and light motions by id (phrase, status, risk, evidence), the freeze sentences, the prompt rules."""
    return _load(SPECS / "video_motion.json")


def motion_names(camera: str, light: str) -> Dict[str, str]:
    """The {placeholders} of a motion text that come from the vocabulary: {camera_move}, {light_motion}, {freeze_mural}, {freeze_room}. An unknown id is a ValueError that names the known ones."""
    vocab = load_video_motion()
    names = {"freeze_mural": vocab["freeze"]["mural"], "freeze_room": vocab["freeze"]["room"]}
    for key, kind, wanted in (("camera_move", "camera_moves", camera), ("light_motion", "light_motions", light)):
        if wanted:
            if wanted not in vocab[kind]:
                raise ValueError(f"{key} {wanted!r} is not in specs/video_motion.json (known: {sorted(vocab[kind])})")
            names[key] = vocab[kind][wanted]["phrase"]
    return names


def clip_prompt_limit(video_model: Optional[str]) -> int:
    """The longest clip prompt a video model takes (`prompt_max` in specs/video_models.json; Kling 2.6 on KIE = CLIP_MAX when the file says nothing)."""
    return int(load_video_models()["models"].get(video_model or "kling26", {}).get("prompt_max", CLIP_MAX))


def video_advice(role: Dict[str, Any], models: Dict[str, Any]) -> Dict[str, Any]:
    """The model the knowledge file recommends for a role: {"model", "credits", "why", "good_for", "bad_for"}; the working model (Kling) when the role says nothing."""
    tag = role.get("video_model") or "kling26"
    info = models["models"].get(tag, {})
    return {"model": tag, "credits": info.get("credits_5s"), "why": role.get("video_why", ""), "good_for": info.get("good_for", ""), "bad_for": info.get("bad_for", "")}


def load_set(set_id: str) -> Dict[str, Any]:
    return _load(SPECS / "sets" / f"{set_id}.json")


def trends_names() -> Dict[str, List[str]]:
    """The variables the kits may use, by the NAMES the app and the Design node know (Promt/trends.json)."""
    data = _load(TRENDS)
    pick = lambda key: [x["name"] if isinstance(x, dict) else x for x in data[key]]  # noqa: E731
    return {"styles": pick("styles"), "colors": pick("colors"), "lighting": pick("lighting"),
            "cameraBodies": pick("cameraBodies"), "lenses": pick("lenses"), "apertures": pick("apertures")}


def room_zones() -> List[str]:
    """The values `room_type` may take: the room zones the web app knows (Promt/trends.json `roomZones`), no second list here."""
    return [z["name"] for z in _load(TRENDS)["roomZones"]]


def age_bands() -> List[str]:
    """The values `child.age_band` may take: the keys of Promt/trends.json `ageGroups` (the web app's own; teenager is allowed before a kit exists)."""
    return list(_load(TRENDS)["ageGroups"])


def min_camera_turn() -> int:
    """The smallest angle toward the mural wall that the web app's own camera angles use (trends.cameraAngles); below it a shot is frontal."""
    turns = [int(m.group(1)) for a in _load(TRENDS)["cameraAngles"] for m in [re.search(r"(\d+)\s*degrees", a)] if m]
    return min(turns) if turns else FALLBACK_CAMERA_TURN


def trends_styles() -> Dict[str, Dict[str, Any]]:
    """The style cards of Promt/trends.json by name (signature = description, the colours that suit it, what to avoid)."""
    return {s["name"]: s for s in _load(TRENDS)["styles"]}


def interior_gear() -> Dict[str, List[str]]:
    """Camera bodies, lenses and apertures for a room photo, taken from the pools of Promt/trends.json (no second list here):
    lenses up to MAX_FOCAL_MM (a tilt-shift counts by its focal length) and apertures from f/MIN_F_NUMBER up."""
    data = _load(TRENDS)
    focal = lambda text: int(re.search(r"(\d+)\s*mm", text).group(1))  # noqa: E731
    fnum = lambda text: float(re.search(r"f/(\d+(?:\.\d+)?)", text).group(1))  # noqa: E731
    gear = {"bodies": list(data["cameraBodies"]),
            "lenses": [x for x in data["lenses"] if focal(x) <= MAX_FOCAL_MM],
            "apertures": [x for x in data["apertures"] if fnum(x) >= MIN_F_NUMBER]}
    empty = [k for k, v in gear.items() if not v]
    if empty:
        raise ValueError(f"Promt/trends.json has no {empty} for a room photo (lenses up to {MAX_FOCAL_MM} mm, apertures from f/{MIN_F_NUMBER:g})")
    return gear


def _opposite(side: str) -> str:
    return "right" if side == "left" else "left"


def _fill(text: str, **names: str) -> str:
    """Fill {placeholders} (unknown ones stay, a typo in a kit is caught by the checks, not by a KeyError); a sentence starts with a capital."""
    filled = _substitute(text, **names)
    filled = re.sub(r"(^|[.!?] )([a-z])", lambda m: m.group(1) + m.group(2).upper(), filled)
    return filled


def _substitute(text: str, **names: str) -> str:
    """Only the {placeholders} (no capital letter): for a fragment that goes inside a sentence, such as the kit's `life_action`."""
    return re.sub(r"\{(\w+)\}", lambda m: names.get(m.group(1), m.group(0)), text)


def kit_child(kit: Dict[str, Any]) -> Dict[str, str]:
    """Gender and age band of the child of a kit: the explicit `child` field, else the older `audience` and `age`."""
    child = kit.get("child") or {}
    return {"gender": child.get("gender") or kit.get("audience") or "", "age_band": child.get("age_band") or kit.get("age") or ""}


def resolve_person(kit: Dict[str, Any], role_name: str, roles: Dict[str, Any], audience: Optional[str] = None, child_gender: Optional[str] = None) -> Dict[str, Any]:
    """Who stands in the photo, decided ONCE: {"text", "male", "adult", "by_age"}. The words of the person and every pronoun of the card come from this one answer
    (gender: the role's own `gender`, else the kit's child, else the child the set asks for, else the audience of the wallpaper, else a girl). A plain string in
    roles.json `persons` is one fixed woman or girl, a dict gives one person per gender ("neutral" is the fallback). `by_age`: the person was picked by the kit's age."""
    role = roles["roles"][role_name]
    age_band = kit_child(kit)["age_band"]
    key = role_name if role_name in roles["persons"] else age_band  # a role may name its own person (hook, play)
    entry = roles["persons"][key]
    gender = next((g for g in (role.get("gender"), kit_child(kit)["gender"], child_gender, audience) if g in ("boy", "girl")), "girl")
    if isinstance(entry, dict):
        text = entry.get(gender) or entry.get("neutral")
        if not text:
            raise ValueError(f"specs/roles.json persons.{key} has no {gender!r} (or 'neutral') person: add one next to {sorted(entry)}")
    else:
        text, gender = entry, "girl"
    return {"text": text, "male": gender == "boy", "adult": key in roles.get("adult_persons", []), "by_age": key == age_band}


def _palette_without(palette: str, accent: str) -> str:
    """The kit's palette without the colour the brief names again as "Accent colour:" (the TS prompt adds it): the same colour twice in a row is noise."""
    if not accent:
        return palette
    parts = [p.strip() for p in re.split(r",\s*|\s+and\s+", palette) if p.strip()]
    kept = [p for p in parts if not re.search(rf"\b{re.escape(accent.lower())}\b", p.lower())]
    if not kept or len(kept) == len(parts):
        return palette
    return kept[0] if len(kept) == 1 else ", ".join(kept[:-1]) + " and " + kept[-1]


def compose(kit: Dict[str, Any], role_name: str, roles: Dict[str, Any], listing: Dict[str, Any], set_id: str, slot: str, seed: int,
            aspect: str = "9:16", audience: Optional[str] = None, motion_extra: str = "", motion_override: str = "", child_gender: Optional[str] = None,
            camera: str = "", light: str = "", motion_zone: Any = None, min_motion_delta: Optional[float] = None) -> Dict[str, Any]:
    """One slot: the photo card (the format the board builder reads) and the clip of that photo (+ `person`, who stands in it). `motion_extra` (a slot's own sentence about the light or the weather) is added to the role's motion.
    `camera` / `light` (ids of specs/video_motion.json; the role's own `camera_move` / `light_motion` are the defaults) fill {camera_move} / {light_motion} in a motion text that has them."""
    role = roles["roles"][role_name]
    side = kit["side"].upper()
    far = _opposite(kit["side"]).upper()
    who = resolve_person(kit, role_name, roles, audience, child_gender)
    male = who["male"]  # a boy is not "she", a mother is not "he"
    pronouns = dict(her="his" if male else "her", she="he" if male else "she", him="him" if male else "her")
    names = dict(side=side, far_side=far, door_side=far.lower(), cam_side=far.lower(), person=who["text"],
                 hero=listing.get("hero", "the hero of the mural"), gaze_target=listing.get("gaze_target", "the big balloon"), life_action=_substitute(kit["life_action"], **pronouns))
    names["side"], names["far_side"] = side, far
    names.update(pronouns, toy=kit.get("toy", "the plush toy"))  # the toy is the kit's own
    motion_text = motion_override or role["motion"]
    cam_id, light_id = camera or role.get("camera_move", ""), light or role.get("light_motion", "")
    uses_vocab = any(f"{{{k}}}" in motion_text for k in ("camera_move", "light_motion"))
    if uses_vocab:
        names.update(motion_names(cam_id, light_id))
    elif camera or light:
        raise ValueError(f"slot {slot}: camera/light were asked for but the motion text of role {role_name!r} has no {{camera_move}} / {{light_motion}}: use a role that has them (room)")
    scene_parts = [kit["room"], kit["floor"], f"On the {side} side wall, away from the mural: {kit['side_wall']}.",
                   _fill(kit.get("ceiling", ""), **names), _fill(kit["light"], **names)]
    if role_name == "life":
        scene_parts.append(_fill(kit["life_pose"], **names))
    elif role["photo_scene"]:
        scene_parts.append(_fill(role["photo_scene"], **names))
    scene_parts.append(f"Palette: {_palette_without(kit['palette'], kit['color'])}.")
    scene = " ".join(p.strip() for p in scene_parts if p and p.strip())
    scene = scene.replace("..", ".")
    rng = random.Random(f"{seed}|{slot}")
    gear = interior_gear()
    card_id = f"{set_id}_{slot}_{role_name}"
    card = {
        "id": card_id, "ageGroup": kit["age"], "aspectRatio": aspect, "people": role["people"],
        "subject": kit["subject"], "scene": scene, "framing": _fill(role["framing"], **names),
        "tags": {"style": kit["style"], "color": kit["color"], "lighting": kit["lighting"], "compositionStrategy": "unobstructed",
                 "cameraBody": rng.choice(gear["bodies"]), "lens": rng.choice(gear["lenses"]), "aperture": rng.choice(gear["apertures"])},
        "reel": {"set": set_id, "slot": slot, "role": role_name, "kit": kit["id"]},
    }
    clip = {"scene_id": card_id, "frame_scene_id": f"{card_id}_brief", "clip": f"{card_id}__kling26.mp4",
            "motion": (_fill(motion_override or role["motion"], **names) + (" " + _fill(motion_extra, **names).strip() if motion_extra.strip() else "")), "items": kit["items"], "min_motion_delta": role["min_motion_delta"],
            "people": role["people"] != "none", "video_model": role.get("video_model") or "kling26"}
    if min_motion_delta is not None:  # a slot may set its own (a clip whose motion is measured inside a zone is a smaller number than the whole frame)
        clip["min_motion_delta"] = min_motion_delta
    if motion_zone:  # the MURAL LOCK (reels_pipeline/mural_lock.py): the zone where the clip may move; everything else is the first frame
        clip["motion_zone"] = motion_zone
    if uses_vocab:
        clip["camera_move"], clip["light_motion"] = cam_id, light_id  # the ids stay on the clip: the checks read their status from the vocabulary
    return {"card": card, "clip": clip, "person": who}


def _pick_auto(kits: Dict[str, Dict[str, Any]], used: List[str], seed: int, slot: str) -> str:
    free = sorted(k for k in kits if k not in used)
    if not free:
        raise ValueError("kit 'auto' found no unused kit: add a kit to specs/design_kits.json")
    return random.Random(f"{seed}|auto|{slot}").choice(free)


def plan_set(set_id: str) -> Dict[str, Any]:
    """The whole set: {"set", "cards", "clips", "slots", "persons", "problems", "warnings"}. `problems` empty = the set may be built and put on the board;
    `warnings` are for the owner to decide and never stop a build."""
    return plan_spec(load_set(set_id))


def plan_spec(spec: Dict[str, Any]) -> Dict[str, Any]:
    """plan_set for a set task that is already a dict (it need not lie in specs/sets/): composes in memory, writes nothing."""
    if spec.get("type") == "carousel":  # pairs of one composition in other colourways (Instagram carousel): reels_pipeline/carousel.py
        from .carousel import plan_carousel

        return plan_carousel(spec)
    kits, roles = load_kits(), load_roles()
    listing_spec = _load(SPECS / spec["listing_spec"])
    video_spec = _load(SPECS / spec["video_spec"])
    brief_rules = listing_spec.get("brief") or {}
    asked = (spec.get("child") or {}).get("gender")  # the child the set asks for (optional)
    used: List[str] = []
    cards, clips, slots, persons = [], [], [], []
    for entry in spec["slots"]:
        if isinstance(entry["kit"], dict):  # the scene is written INTO the set (scripts/director.py design): a kit of this set only, not of the shared file
            kits[entry["kit"]["id"]] = entry["kit"]
            kit_id = entry["kit"]["id"]
        else:
            kit_id = entry["kit"] if entry["kit"] != "auto" else _pick_auto(kits, used, spec["seed"], entry["slot"])
        if kit_id not in kits:
            raise ValueError(f"slot {entry['slot']}: no kit {kit_id!r} in specs/design_kits.json (have {sorted(kits)})")
        if entry["role"] not in roles["roles"]:
            raise ValueError(f"slot {entry['slot']}: no role {entry['role']!r} in specs/roles.json (have {sorted(roles['roles'])})")
        used.append(kit_id)
        out = compose(kits[kit_id], entry["role"], roles, brief_rules, spec["id"], entry["slot"], spec["seed"], spec["aspect"], audience=listing_spec.get("audience"),
                       motion_extra=entry.get("motion_extra", ""), motion_override=entry.get("motion_override", ""), child_gender=asked,
                       camera=entry.get("camera", ""), light=entry.get("light", ""), motion_zone=entry.get("motion_zone"), min_motion_delta=entry.get("min_motion_delta"))
        cards.append(out["card"])
        clips.append(out["clip"])
        persons.append(out["person"])
        slots.append({"slot": entry["slot"], "role": entry["role"], "kit": kit_id, "card": out["card"]["id"]})
    plan = {"set": spec["id"], "model": spec.get("model", "nano-banana-2-1"), "cards": cards, "clips": clips, "slots": slots, "persons": persons,
            "kits": kits}  # `persons` and `kits` (the shared kits plus the ones written into the set) are not written to the generated file
    plan["problems"] = check_plan(plan, spec, kits, brief_rules, video_spec) + audience_problems(spec, listing_spec, kits)
    plan["warnings"] = plan_warnings(plan, spec, kits)
    return plan


def validate_spec(spec: Dict[str, Any]) -> Dict[str, List[str]]:
    """Free and read-only: the problems and the warnings of a set task given as a dict (what a person or an agent proposes). Writes no file; a task that cannot be
    composed at all (an unknown kit or role, a missing key) is a problem in the list, not an exception."""
    try:
        plan = plan_spec(spec)
    except KeyError as exc:
        return {"problems": [f"the set cannot be composed: missing or unknown key {exc}"], "warnings": []}
    except (ValueError, OSError) as exc:
        return {"problems": [f"the set cannot be composed: {exc}"], "warnings": []}
    return {"problems": plan["problems"], "warnings": plan.get("warnings", [])}


def plan_warnings(plan: Dict[str, Any], spec: Dict[str, Any], kits: Dict[str, Dict[str, Any]]) -> List[str]:
    """What is allowed but the owner must decide: an adult picked by the age of the kit (the mother kneeling in the baby room, owner complaint 10.11; silence it
    for a slot with constraints.adult_person_ok = ["s5"]) and kits that do not say their room_type / child yet."""
    warnings: List[str] = []
    ok = spec.get("constraints", {}).get("adult_person_ok", [])
    for slot, card, who in zip(plan["slots"], plan["cards"], plan.get("persons", [])):
        if card["people"] != "none" and who["adult"] and who["by_age"] and slot["slot"] not in ok:
            warnings.append(f"{slot['slot']} {slot['role']} kit {slot['kit']}: the person is an adult ({who['text'][:34]}...) in a {kits[slot['kit']]['age']} room: "
                            f"keep her (constraints.adult_person_ok: [\"{slot['slot']}\"]) or take a kit/role with a child")
    for slot, clip in zip(plan["slots"], plan["clips"]):
        warnings.extend(f"{slot['slot']} {slot['role']}: {text}: allowed, not proven on our murals, so measure it" for text in _vocabulary_problems(clip, ("test",)))
    for kit_id in sorted({s["kit"] for s in plan["slots"]}):
        gaps = [f for f in ("room_type", "child") if not kits[kit_id].get(f)]
        if gaps:
            warnings.append(f"kit {kit_id}: no {' and no '.join(gaps)} yet: a set cannot ask for it until the kit says it")
    return warnings


def brief_of(card: Dict[str, Any], brief_rules: Dict[str, str]) -> str:
    t = card["tags"]
    return build_brief_prompt(card["subject"], card["scene"], card["framing"], t["lighting"], t["cameraBody"], t["lens"], t["aperture"],
                              rules=brief_rules, people=card["people"], style=t["style"], color=t["color"])


def camera_problem(framing: str) -> str:
    """"" when the framing is one of the web app's angled views (trends.cameraAngles) or turns the camera toward the mural wall by at least min_camera_turn()
    degrees (the roles' 20 / 25 / 30), else why the shot is frontal."""
    lowered = framing.lower()
    if any(a.lower() in lowered for a in _load(TRENDS)["cameraAngles"]):
        return ""
    word = next((w for w in FRONTAL_WORDS if w in lowered), None)
    if word:
        return f"the camera is frontal ({word!r}): shoot from an angle, turned at least {min_camera_turn()} degrees toward the mural wall"
    degrees = re.search(r"(\d+)\s*degrees", lowered)
    if not degrees:
        return "the framing does not say the camera angle ('turned about N degrees toward the mural wall'): a shot without an angle is frontal"
    if int(degrees.group(1)) < min_camera_turn():
        return f"the camera is turned only {degrees.group(1)} degrees toward the mural wall (frontal): at least {min_camera_turn()} are needed"
    return ""


def _kit_field_problems(kit: Dict[str, Any]) -> List[str]:
    """`room_type` and `child` of a kit are optional (an older kit has neither), but when present they must be valid and agree with `audience` and `age`."""
    problems: List[str] = []
    if "room_type" in kit and kit["room_type"] not in room_zones():
        problems.append(f"kit {kit['id']}: room_type {kit['room_type']!r} is not a room zone of Promt/trends.json {room_zones()}")
    child = kit.get("child")
    if child is not None:
        if not isinstance(child, dict) or child.get("gender") not in AUDIENCES or child.get("age_band") not in age_bands():
            problems.append(f"kit {kit['id']}: child {child!r} needs gender {AUDIENCES} and age_band {age_bands()} (the age groups of Promt/trends.json)")
        elif child["gender"] != kit.get("audience") or child["age_band"] != kit.get("age"):
            problems.append(f"kit {kit['id']}: child {child} disagrees with audience {kit.get('audience')!r} / age {kit.get('age')!r}: one meaning, say it the same way")
    return problems


def _request_problems(plan: Dict[str, Any], spec: Dict[str, Any], kits: Dict[str, Dict[str, Any]], roles: Dict[str, Any]) -> List[str]:
    """A set may say what it is FOR: `room_type` (a room zone of trends.json) and `child` {gender, age_band (an age group of trends.json)}. Every kit must fit it (the rule of the wallpaper's audience: a neutral kit fits any child)
    and no role may fix the other gender. A set that asks for nothing is not checked here."""
    room, asked = spec.get("room_type"), spec.get("child") or {}
    gender, band = asked.get("gender"), asked.get("age_band")
    problems = [f"the set asks for {what} {value!r}, which is not one of {pool}" for what, value, pool in
                (("room_type", room, room_zones()), ("child.gender", gender, AUDIENCES), ("child.age_band", band, age_bands())) if value is not None and value not in pool]
    if problems:
        return problems
    for slot in plan["slots"]:
        kit, label = kits[slot["kit"]], f"{slot['slot']} (kit {slot['kit']})"
        got = {"room_type": kit.get("room_type"), "age_band": kit_child(kit)["age_band"]}
        for what, wanted in (("room_type", room), ("age_band", band)):
            if wanted and not got[what]:
                problems.append(f"{label}: the kit has no {what}: label it before a set asks for a {what}")
            elif wanted and got[what] != wanted:
                problems.append(f"{label}: the kit is {what} {got[what]!r} but the set asks for {wanted!r}")
        if gender and kit_child(kit)["gender"] not in AUDIENCE_KITS[gender]:
            problems.append(f"{label}: the kit is for a {kit_child(kit)['gender']!r} child but the set asks for {gender!r} (a neutral kit fits any)")
        fixed = roles[slot["role"]].get("gender")
        if gender in ("boy", "girl") and fixed in ("boy", "girl") and fixed != gender:
            problems.append(f"{label}: the role {slot['role']!r} is always a {fixed} but the set asks for a {gender}")
    return problems


def _slot_problems(slot: Dict[str, Any], role: Dict[str, Any], kit: Dict[str, Any], card: Dict[str, Any], clip: Dict[str, Any], who: Optional[Dict[str, Any]]) -> List[str]:
    """What must hold for the person and the camera of one slot: the role fits the age of the kit (`ages` of the role), the role's own gender fits the kit's child,
    the camera is not frontal, and the person's words and every pronoun of the texts name ONE gender."""
    problems: List[str] = []
    cid, band, has = card["id"], kit_child(kit)["age_band"], kit_child(kit)["gender"]
    if role.get("ages") and band not in role["ages"]:
        problems.append(f"{cid}: the role {slot['role']!r} is for the age band(s) {role['ages']} (its person is fixed), kit {slot['kit']} is {band!r}: take a kit of that age or another role")
    clash = role.get("gender") in ("boy", "girl") and has in ("boy", "girl") and role["gender"] != has
    if clash:
        problems.append(f"{cid}: the role {slot['role']!r} is always a {role['gender']} but kit {slot['kit']} is a {has}'s room")
    if camera_problem(card["framing"]):
        problems.append(f"{cid}: {camera_problem(card['framing'])}")
    if who and card["people"] != "none" and not clash:
        wrong = (FEMALE_WORDS if who["male"] else MALE_WORDS).findall(" ".join((card["scene"], card["framing"], clip["motion"])))
        if wrong:
            problems.append(f"{cid}: the person is {'male' if who['male'] else 'female'} ({who['text'][:40]}...) but the text says {sorted({w.lower() for w in wrong})}: "
                            "one gender for the words and the pronouns (write {her} / {she} / {him} in kit texts)")
    return problems


def _vocabulary_problems(clip: Dict[str, Any], statuses: tuple) -> List[str]:
    """What the clip's camera move / light motion (ids of specs/video_motion.json) say about themselves when their status is one of `statuses`."""
    texts: List[str] = []
    if not (clip.get("camera_move") or clip.get("light_motion")):
        return texts
    vocab = load_video_motion()
    for key, kind in (("camera_move", "camera_moves"), ("light_motion", "light_motions")):
        entry = vocab[kind].get(clip.get(key) or "")
        if entry and entry["status"] in statuses:
            texts.append(f"{key} {clip[key]!r} is {entry['status']} (risk {entry['risk']}): {entry['source'][:110]}")
    return texts


def check_plan(plan: Dict[str, Any], spec: Dict[str, Any], kits: Dict[str, Dict[str, Any]], brief_rules: Dict[str, str],
               video_spec: Dict[str, Any]) -> List[str]:
    """Everything that must hold for every frame; returns the list of problems (empty = fine)."""
    problems: List[str] = []
    names = trends_names()
    for kit in {kits[s["kit"]]["id"]: kits[s["kit"]] for s in plan["slots"]}.values():
        missing = [k for k in KIT_PARTS if not str(kit.get(k, "")).strip()]
        if missing:
            problems.append(f"kit {kit['id']}: missing parts {missing}")
        for field, pool in (("style", "styles"), ("color", "colors"), ("lighting", "lighting")):
            if kit.get(field) not in names[pool]:
                problems.append(f"kit {kit['id']}: {field} {kit.get(field)!r} is not in Promt/trends.json (known: {names[pool]})")
        suits = trends_styles().get(kit.get("style"), {}).get("colors")
        if suits and kit.get("color") not in suits:
            problems.append(f"kit {kit['id']}: colour {kit.get('color')!r} does not suit the style {kit.get('style')!r} (its card in Promt/trends.json allows {suits})")
        if kit.get("age") not in MODEL_AGES:
            problems.append(f"kit {kit['id']}: age {kit.get('age')!r} is not one of {MODEL_AGES}")
        if kit.get("side") not in ("left", "right"):
            problems.append(f"kit {kit['id']}: side must be 'left' or 'right'")
        problems.extend(_kit_field_problems(kit))
    roles = load_roles()["roles"]
    problems.extend(_request_problems(plan, spec, kits, roles))
    for slot, card, clip, who in zip(plan["slots"], plan["cards"], plan["clips"], plan.get("persons") or [None] * len(plan["cards"])):
        problems.extend(_slot_problems(slot, roles[slot["role"]], kits[slot["kit"]], card, clip, who))
    for card, clip in zip(plan["cards"], plan["clips"]):
        cid = card["id"]
        text = ""
        if all(brief_rules.get(k) for k in ("product", "product_short", "wall_rule")):
            try:
                text = brief_of(card, brief_rules)
            except ValueError as exc:  # e.g. a style or colour that Promt/trends.json does not know: said once, in the list of problems
                problems.append(f"{cid}: {exc}")
                continue
        if not text:
            problems.append(f"{cid}: the listing spec has no brief rules (product, product_short, wall_rule)")
            continue
        if len(text) > BRIEF_MAX:
            problems.append(f"{cid}: the brief prompt has {len(text)} characters, the limit is {BRIEF_MAX}")
        for item in BANNED_SCENE_ITEMS:
            if item in card["scene"].lower():
                problems.append(f"{cid}: {item!r} is banned or hides the mural: only low, clean things stand on the side wall")
        if "away from the mural" not in card["scene"]:
            problems.append(f"{cid}: the decor must stand on the side wall ('away from the mural')")
        if re.search(r"\{\w+\}", card["scene"] + card["framing"] + clip["motion"]):
            problems.append(f"{cid}: an unfilled {{placeholder}} is left in the texts")
        for word in BANNED_PHOTO:
            if word in text:
                problems.append(f"{cid}: {word!r} belongs to the web app's template, not to a brief")
        if card["people"] == "none" and re.search(r"\b(woman|mother|girl|boy|man|child|person)\b", card["scene"]):
            problems.append(f"{cid}: the role has no person but the scene names one")
        if card["people"] == "from_behind" and "face turned away" not in card["scene"] and "face is turned away" not in card["scene"]:
            problems.append(f"{cid}: a person is in the photo but the scene does not say the face is turned away")
        if kits[card["reel"]["kit"]].get("ceiling") and "above the top edge of the mural" not in card["scene"]:
            problems.append(f"{cid}: a ceiling fixture must hang 'well above the top edge of the mural'")
        prompt = clip_prompt(clip, video_spec)
        limit = clip_prompt_limit(clip.get("video_model"))
        if len(prompt) > limit:
            problems.append(f"{cid}: the clip prompt has {len(prompt)} characters, {clip.get('video_model') or 'kling26'} takes {limit}")
        lowered = prompt.lower()
        for word in BANNED_MOTION:
            if word in lowered:
                problems.append(f"{cid}: banned camera move or motion word {word!r} in the clip prompt")
        problems.extend(f"{cid}: {text}" for text in _vocabulary_problems(clip, ("banned_by_owner", "avoid")))
        if clip.get("motion_zone"):
            try:
                mural_lock.parse_zone(clip["motion_zone"])
            except ValueError as exc:
                problems.append(f"{cid}: motion_zone: {exc}")
            if "camera does not move at all" not in clip["motion"] and clip.get("camera_move") != "locked_off":
                problems.append(f"{cid}: a motion zone (the mural lock keeps the first frame outside it) needs a locked camera: a moving camera changes the whole picture")
    cons = spec.get("constraints", {})
    used = [s["kit"] for s in plan["slots"]]
    if cons.get("distinct_kits", True) and len(set(used)) != len(used):
        problems.append(f"a kit is used twice: {sorted(k for k in set(used) if used.count(k) > 1)}")
    styles = {kits[k]["style"] for k in used if k in kits}
    # The frames of ONE reel are different designs (owner 06.11: two frames in one style, from one angle, of one kind of person are a repeat, not
    # a reel; the same composition in other colours is a CAROUSEL pair). These rules are not optional: they hold for every reel set.
    need_styles = max(cons.get("min_styles", 1), min(len(used), 3))
    if len(styles) < need_styles:
        problems.append(f"only {len(styles)} different styles in the set, at least {need_styles} wanted (the frames of a reel are different designs): {sorted(styles)}")
    if len(used) >= 2:
        sides = {kits[k]["side"] for k in used if k in kits}
        if len(sides) < 2:
            problems.append(f"every frame is shot from the same side ({sorted(sides)}): a reel needs frames from both the left and the right")
        who = {(c["people"], kits[c["reel"]["kit"]]["age"] if c["people"] != "none" else "") for c in plan["cards"]}
        if len(who) < 2:
            problems.append("the frames show the same kind of person (or none at all): mix a mother, a child and a room without a person")
    ages = {kits[k]["age"] for k in used if k in kits}
    missing_ages = [a for a in cons.get("ages", []) if a not in ages]
    if missing_ages:
        problems.append(f"no kit for the age group(s) {missing_ages}")
    return problems


def kit_id_of(slot: Dict[str, Any]) -> str:
    """The id of a slot's kit: the name from the shared file, `auto`, or the id of the kit written into the slot."""
    return slot["kit"]["id"] if isinstance(slot["kit"], dict) else slot["kit"]


def audience_problems(spec: Dict[str, Any], listing_spec: Dict[str, Any], kits: Dict[str, Dict[str, Any]]) -> List[str]:
    """Step 0 of the workflow made a rule: every kit of a reel suits the audience of the WALLPAPER (boy takes boy and neutral kits, girl takes girl and
    neutral, neutral only neutral), and a kit is not reused in the reel of ANOTHER listing (one design in two wallpapers is a repeat, owner 06.11)."""
    problems: List[str] = []
    audience = listing_spec.get("audience")
    if audience not in AUDIENCES:
        return [f"the listing spec {spec['listing_spec']} has no `audience` (boy | girl | neutral): LOOK at the wallpaper and set it (ask the owner when unsure)"]
    allowed = AUDIENCE_KITS[audience]
    used = [kit_id_of(s) for s in spec.get("slots", [])]
    for kit_id in used if not spec.get("constraints", {}).get("audience_waiver") else []:  # a waiver only for reels shot before this rule
        kit = kits.get(kit_id)
        if kit and kit.get("audience") not in allowed:
            problems.append(f"kit {kit_id} is for a {kit.get('audience')!r} room, the wallpaper of {spec['listing_spec']} is for {audience!r}: pick a kit with audience {list(allowed)}")
    if not spec.get("constraints", {}).get("shared_kits_ok"):
        for other_file in sorted((SPECS / "sets").glob("*.json")):
            if other_file.name.endswith(".generated.json") or other_file.stem == spec.get("id"):
                continue
            other = _load(other_file)
            if other.get("type") == "carousel" or other.get("listing_spec") in (None, spec["listing_spec"]):
                continue
            again = sorted(set(used) & {kit_id_of(x) for x in other.get("slots", [])})
            if again:
                problems.append(f"kit(s) {again} already made the reel {other['id']} of another listing: a design is not repeated in other wallpapers (new kit, or constraints.shared_kits_ok)")
    return problems


def write_generated(plan: Dict[str, Any]) -> Path:
    """specs/sets/<set>.generated.json: what the board builder reads (cards + clips). Refuses a set with problems."""
    if plan["problems"]:
        raise ValueError("the set has problems, nothing was written: " + "; ".join(plan["problems"][:3]))
    path = SPECS / "sets" / f"{plan['set']}.generated.json"
    out = {"description": "GENERATED by scripts/director.py build from the set (and its kits and roles): do not edit by hand.",
           "set": plan["set"], "model": plan["model"]}
    out.update({k: plan[k] for k in ("type", "slots", "pairs", "cards", "clips") if k in plan})  # a reel set has slots and clips, a carousel set pairs
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def load_generated(set_id: Optional[str]) -> Dict[str, Any]:
    """The generated file of a set, {} when there is none (the board builder calls this with the `set` of active_board.json)."""
    if not set_id:
        return {}
    path = SPECS / "sets" / f"{set_id}.generated.json"
    return _load(path) if path.is_file() else {}
