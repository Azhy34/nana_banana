"""
The dealer of a photo set (step 1 of `scripts/director.py design`): from a listing and a seed to N "hands", one per frame. FREE and deterministic: the same
listing + set id + seed always deals the same hands. Nothing here calls a model or spends credits.

A hand is everything about a frame that must be VARIED and must obey the rules, so code decides it: the role (what the person does, or no person), the age of
the child, which side the decor stands on, the style, the colour, the hero piece of furniture, a toy of that age, the light. What a hand does NOT decide is the
room itself: how the room is dressed to suit THIS wallpaper is written by the scene writer (reels_pipeline/scene_writer.py) from the picture.

The style, the colour (taken from the card of the style), the hero piece (only pieces that do not hide a mural) come from the web app's own picker
(`generateRandomTags` of services/promptGenerator.ts, reached through reels_pipeline/prompts.py): one brain for the site and the pipeline, Promt/trends.json.
"""

import random
from typing import Any, Dict, List, Optional

from . import director
from .prompts import build_batch_prompts

MAX_ATTEMPTS = 20  # re-deal with the next seed until the set is varied enough (three styles); a listing with a rich enough trends.json needs 1-3
AVOID_LIGHTING_WORDS = ("dusk",)  # the models draw daylight for a dusk request (journal 06.11: "the requested dusk lamplight came out as daylight twice")
PERSON_AGES = ("vorschul", "schulkind")  # a person in the frame is a child; an adult in a baby room is a warning the owner decides (director.plan_warnings)
SLOT_KINDS = (  # the frames of a set, in order: a child at the mural, the room alone, another person (and age) doing one thing
    ("child", ("gaze", "wow", "run_in", "play")),
    ("room", ("product",)),
    ("life", ("life", "leave")),
)


def _fits(role: Dict[str, Any], audience: str) -> bool:
    """A role that fixes a gender (gaze = a boy) does not fit a wallpaper for the other gender; a neutral wallpaper takes any role."""
    fixed = role.get("gender")
    return audience == "neutral" or fixed in (None, audience)


def _ages_of(role: Dict[str, Any], person: bool) -> List[str]:
    ages = [a for a in role.get("ages", director.MODEL_AGES) if a in director.MODEL_AGES]
    if person:
        ages = [a for a in ages if a in PERSON_AGES] or ages
    return ages


def _clean_toys(toys: List[str]) -> List[str]:
    """The toys of an age group that do not carry a banned word (a toy 'on the woven rug' would put 'woven' into the scene, which the director refuses)."""
    clean = [t for t in toys if not any(word in t.lower() for word in director.BANNED_SCENE_ITEMS)]
    return clean or toys


def _key_object(trends: Dict[str, Any], name: str) -> Dict[str, str]:
    found = next((k for k in trends["keyObjects"] if k["name"] == name), None)
    return {"name": name, "description": (found or {}).get("description", "")}


def _try(listing: Dict[str, Any], set_id: str, seed: Any, attempt: int, frames: int, aspect: str) -> Optional[List[Dict[str, Any]]]:
    rng = random.Random(f"{seed}|{set_id}|{attempt}")
    roles = director.load_roles()["roles"]
    audience = listing["audience"]
    trends = director._load(director.TRENDS)
    lightings = [n for n in director.trends_names()["lighting"] if not any(w in n for w in AVOID_LIGHTING_WORDS)]
    side = rng.choice(["left", "right"])
    picked: List[Dict[str, Any]] = []
    used_ages: List[str] = []
    for index, (kind, role_names) in enumerate(SLOT_KINDS[:frames]):
        candidates = [r for r in role_names if _fits(roles[r], audience)]
        if not candidates:
            raise ValueError(f"no role of the kind {kind!r} fits an audience {audience!r}: add one to specs/roles.json")
        role_name = rng.choice(candidates)
        ages = _ages_of(roles[role_name], roles[role_name]["people"] != "none")
        fresh = [a for a in ages if a not in used_ages] or ages  # three frames, three ages when the roles allow it
        age = rng.choice(fresh)
        used_ages.append(age)
        picked.append({"slot": f"s{index + 1}", "role": role_name, "age": age, "side": side if index % 2 == 0 else director._opposite(side),
                       "lighting": rng.choice(lightings)})
    cards = [{"id": f"{set_id}_{h['slot']}", "seed": f"{seed}-{attempt}", "ageGroup": h["age"], "tags": {"lighting": h["lighting"]}} for h in picked]
    tags = [out["tags"] for out in build_batch_prompts(cards, aspect_ratio=aspect)]
    if len({t["style"] for t in tags}) < len(tags):
        return None  # two frames in one style are a repeat, not a reel (owner 06.11): deal again
    styles = director.trends_styles()
    colors = {c["name"]: c.get("description", "") for c in trends["colors"]}
    hands = []
    for hand, tag in zip(picked, tags):
        age_data = trends["ageGroups"][hand["age"]]
        allowed = styles[tag["style"]].get("colors") or list(colors)
        hands.append({
            **hand,
            "role_label": roles[hand["role"]]["label"],
            "person": roles[hand["role"]]["people"] != "none",
            "audience": audience,
            "child": age_data["child"],
            "room_of_that_age": age_data["room"],
            "style": tag["style"],
            "style_card": styles[tag["style"]]["description"],
            "color": tag["color"],
            "color_description": colors.get(tag["color"], ""),
            "allowed_colors": [{"name": c, "description": colors.get(c, "")} for c in allowed],
            "hero_piece": _key_object(trends, tag["keyObject"]),
            "toy": rng.choice(_clean_toys(age_data["toys"])),
        })
    return hands


def deal(listing: Dict[str, Any], set_id: str, seed: Any = 1, frames: int = 3, aspect: str = "9:16") -> List[Dict[str, Any]]:
    """The hands of a set: a list of dicts, one per frame (slot s1.., role, age, side, style, colour, hero piece, toy, light). Raises ValueError when the listing
    has no `audience` (step 0 of the workflow: LOOK at the wallpaper and say who the room is for) or no hands could be dealt."""
    if listing.get("audience") not in director.AUDIENCES:
        raise ValueError("the listing spec has no `audience` (boy | girl | neutral): LOOK at the wallpaper and set it, ask the owner when unsure")
    if not 2 <= frames <= len(SLOT_KINDS):
        raise ValueError(f"a set has 2 to {len(SLOT_KINDS)} frames, not {frames}")
    for attempt in range(MAX_ATTEMPTS):
        hands = _try(listing, set_id, seed, attempt, frames, aspect)
        if hands:
            return hands
    raise ValueError(f"no hands with {frames} different styles after {MAX_ATTEMPTS} deals: Promt/trends.json has too few styles for this audience")
