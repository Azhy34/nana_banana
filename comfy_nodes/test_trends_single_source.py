"""Offline tests of the single source of truth for styles (owner rule 06.11): Promt/trends.json holds the styles and variables, and
services/promptGenerator.ts is the only code that turns them into a prompt, for the web app and for the ComfyUI boards alike
(through scripts/build_batch_prompts.mjs). No ComfyUI, no KIE, no credits.

Run: py -3.12 -X utf8 -m pytest comfy_nodes/test_trends_single_source.py -q
"""

import json
import re
from pathlib import Path

import pytest

from reels_pipeline import director
from reels_pipeline.prompts import build_batch_prompts, build_brief_prompt

ROOT = Path(__file__).resolve().parent.parent
TRENDS = json.loads((ROOT / "Promt" / "trends.json").read_text(encoding="utf-8"))
STYLES = {s["name"]: s for s in TRENDS["styles"]}
COLORS = {c["name"]: c for c in TRENDS["colors"]}
AGES = ("baby", "vorschul", "schulkind", "teenager")
RULES = {"product": "the wall mural", "product_short": "the mural", "wall_rule": "It covers the whole feature wall."}


# ------------------------------------------------------------------ the data is consistent

def test_every_style_is_a_card_with_a_signature_and_colours_that_exist():
    assert len(STYLES) == len(TRENDS["styles"]), "style names must be unique"
    for name, card in STYLES.items():
        assert card["description"].strip() and not card["description"].endswith("."), name
        assert card["colors"] and all(c in COLORS for c in card["colors"]), f"{name}: unknown colour in {card['colors']}"
        assert card["avoid"].strip(), name


def test_the_trend_summary_names_only_things_the_pools_have_and_cites_a_source():
    insights = TRENDS["latestMarketInsights"]
    assert insights["updatedAt"] >= "2026-11-05" and "search" in insights["method"].lower()
    assert all(c["name"] in COLORS and c["source"] for c in insights["colors"])
    assert all(s["name"] in STYLES and s["source"] for s in insights["styles"])
    assert all(a in TRENDS["accessories"] for a in insights["accessories"])
    assert insights["sources"] and all(re.match(r"https://", s["url"]) and re.match(r"\d{4}-\d{2}-\d{2}$", s["date"]) for s in insights["sources"])


def test_the_dead_copies_are_gone():
    assert "negativePrompt" not in TRENDS, "nothing read it; the live list is `negatives`"
    assert set(TRENDS["negatives"]) == {"head", "fullWall", "base", "text", "textWithOverlay"}
    for stale in ("donut foam poufs", "stacking rainbow arches"):
        assert stale not in TRENDS["accessories"] and stale not in json.dumps(TRENDS["ageGroups"])
    assert "Dopamine Poppy Red" not in COLORS and "Cobalt Blue" not in COLORS


def test_every_card_and_kit_uses_names_that_exist():
    spec = json.loads((ROOT / "specs" / "listing45_interiors.json").read_text(encoding="utf-8"))
    kits = json.loads((ROOT / "specs" / "design_kits.json").read_text(encoding="utf-8"))["kits"]
    for card in spec["cards"]:
        tags = card.get("tags", {})
        assert tags.get("style", "Japandi") in STYLES, (card["id"], tags.get("style"))
        assert tags.get("color", "Dusty Rose") in COLORS, (card["id"], tags.get("color"))
    for kit in kits:
        assert kit["style"] in STYLES and kit["color"] in COLORS and kit["color"] in STYLES[kit["style"]]["colors"], kit["id"]


# ------------------------------------------------------------------ one code, no styles written into it

@pytest.mark.parametrize("path", ["services/promptGenerator.ts", "scripts/build_batch_prompts.mjs", "reels_pipeline/prompts.py", "reels_pipeline/director.py"])
def test_the_code_that_builds_prompts_names_no_style(path):
    text = (ROOT / path).read_text(encoding="utf-8")
    for name in list(STYLES) + ["Dopamine Decor", "Fun Haus / Dopamine"]:
        assert name not in text, f"{path} names the style {name!r}: styles live only in Promt/trends.json"


def test_the_chosen_style_is_what_the_full_prompt_says_for_every_age_group():
    cards = [{"id": f"{n}-{age}", "ageGroup": age, "seed": 0, "tags": {"style": n, "color": STYLES[n]["colors"][0]}}
             for n in STYLES for age in AGES]
    built = build_batch_prompts(cards, aspect_ratio="9:16")
    for card, out in zip(cards, built):
        name, prompt = card["tags"]["style"], out["prompt"]
        assert f" in {name} style" in prompt, card["id"]
        assert f"Styling: {name} ({STYLES[name]['description']})" in prompt, card["id"]
        for other in STYLES:
            if other != name:
                assert f" in {other} style" not in prompt, f"{card['id']}: the scene also names {other}"
        assert STYLES[name]["avoid"] in prompt, f"{card['id']}: the Avoid list lacks what does not suit {name}"


def test_random_batches_never_pair_a_style_with_a_colour_that_does_not_suit_it():
    cards = [{"id": f"r{i}", "seed": i} for i in range(80)]
    for out in build_batch_prompts(cards, aspect_ratio="9:16"):
        tags = out["tags"]
        assert tags["color"] in STYLES[tags["style"]]["colors"], (tags["style"], tags["color"])


def test_the_avoid_list_and_the_real_photo_line_come_from_the_data():
    neg = TRENDS["negatives"]
    full = build_batch_prompts([{"id": "a", "ageGroup": "vorschul", "seed": 1, "tags": {"wallArchitecture": "full-wall"}}], "9:16")[0]["prompt"]
    scallop = build_batch_prompts([{"id": "b", "ageGroup": "vorschul", "seed": 1, "tags": {"wallArchitecture": "scallop-trim"}}], "4:3")[0]["prompt"]
    assert neg["fullWall"] in full and neg["base"] in full and neg["text"] in full and neg["fullWall"] not in scallop and neg["base"] in scallop
    for prompt in (full, scallop):
        assert TRENDS["realism"]["photo"] in prompt
    assert "scalloped wave trim" in scallop and "barberry red" in scallop and "poppy" not in scallop


def test_the_random_toys_of_the_preschool_age_group_are_stripped_from_data_not_from_a_copy():
    toys = TRENDS["ageGroups"]["vorschul"]["toys"]   # random decor is gone: every extra object hides the mural
    cards = [{"id": f"s{i}", "ageGroup": "vorschul", "seed": i, "cleanRandomDetails": True, "tags": {"style": "Japandi", "color": "Dusty Rose"}} for i in range(40)]
    for out in build_batch_prompts(cards, aspect_ratio="9:16"):
        assert not [t for t in toys if t in out["prompt"]], out["id"]


# ------------------------------------------------------------------ the brief reads the same data

def test_the_brief_takes_its_style_and_accent_colour_from_the_variables():
    text = build_brief_prompt("a calm room", "A rug.", "A shot.", rules=RULES, style="Japandi", color="Dusty Rose")
    assert text.split("\n\n")[0] == f"Create a photorealistic photograph of a calm room, in Japandi style ({STYLES['Japandi']['description']})."
    assert f"Accent colour: dusty rose ({COLORS['Dusty Rose']['description']})." in text
    assert text.endswith(TRENDS["realism"]["photo"])
    for bad in ({"style": "Nope"}, {"color": "Nope"}):
        with pytest.raises(ValueError, match="unknown (style|colour)"):
            build_brief_prompt("a calm room", "A rug.", "A shot.", rules=RULES, **bad)


def test_the_real_photo_line_is_positive_and_names_what_a_professional_photograph_has():
    line = TRENDS["realism"]["photo"]
    assert not re.search(r"\b(no|not|without|avoid|never)\b", line, re.IGNORECASE), "the guides: describe what you want, not what you don't"
    for cue in ("photograph", "natural window light", "wood grain", "linen", "matte"):
        assert cue in line


def test_the_director_picks_room_gear_from_the_pools():
    gear = director.interior_gear()
    assert set(gear["bodies"]) == set(TRENDS["cameraBodies"])
    assert "24mm tilt-shift lens" in gear["lenses"] and all(int(re.search(r"(\d+)mm", x).group(1)) <= director.MAX_FOCAL_MM for x in gear["lenses"])
    assert "f/11 aperture" in gear["apertures"] and all(float(re.search(r"f/([\d.]+)", x).group(1)) >= director.MIN_F_NUMBER for x in gear["apertures"])
    assert "50mm normal lens" not in gear["lenses"] and "f/4.0 aperture" not in gear["apertures"]


# ------------------------------------------------------------------ the mural is the hero (owner 06.11): angle, few objects, a clear wall

def test_every_camera_angle_is_concrete_angled_and_shows_the_whole_mural_wall():
    assert len(TRENDS["cameraAngles"]) >= 3
    for angle in TRENDS["cameraAngles"]:
        assert re.search(r"about \d+ degrees toward the mural wall", angle) and "pulled well back" in angle and "mural wall" in angle, angle
        assert "frontal" not in angle and "straight-on" not in angle and "nook" not in angle
    assert [d["name"] for d in TRENDS["cameraDistances"]] == ["wide shot"]
    assert "floor in front of the wall open" in TRENDS["cameraDistances"][0]["description"]
    assert not any("child eye-level" in e or "low-angle" in e for e in TRENDS["cameraElevations"])
    assert not any((d["name"] if isinstance(d, dict) else d).startswith("shallow") for d in TRENDS["depthOfField"])


def test_the_staging_block_states_a_furnished_room_and_the_limits_in_numbers():
    staging = TRENDS["staging"]
    for cue in ("furnished", "4.5 by 3.5 metres", "2.8 m ceiling", "lower than 90 cm", "at most two small accessories"):
        assert cue in staging["text"], cue
    for emptiness in ("almost empty", "floor is clear", "corners", "bare"):  # owner 10.11: the rooms came out as empty boxes because the text asked for it
        assert emptiness not in staging["text"] and emptiness not in staging["brief"], emptiness
    assert "9:16" in staging["tallRatios"] and "4:3" not in staging["tallRatios"] and "floor-to-ceiling section" in staging["framingTall"]
    assert staging["maxAccessories"] == 2 and staging["maxHeightCm"] == 90
    assert not re.search(r"\b(no|not|without|avoid|never)\b", staging["text"], re.IGNORECASE), "positive wording: the guides say describe what you want"


def test_a_prompt_has_the_staging_the_angle_and_at_most_two_accessories_in_every_random_build():
    cards = [{"id": f"m{i}", "seed": i, "ageGroup": AGES[i % 4]} for i in range(300)]
    for out in build_batch_prompts(cards, aspect_ratio="9:16"):
        prompt, tags = out["prompt"], out["tags"]
        # a tall frame shows a floor-to-ceiling SECTION of the wall (a wide mural shown whole in 9:16 is squeezed), never "the whole mural wall"
        assert TRENDS["staging"]["text"] in prompt and "Photographed from the " in prompt, out["id"]
        assert f"Framing: {TRENDS['staging']['framingTall']}" in prompt and "whole mural wall" not in prompt and "pulled well back" not in prompt, out["id"]
        accessories = prompt.split("and accessories including ")[1].split(". ")[0] if "and accessories including " in prompt else ""
        shown = [a for a in TRENDS["accessories"] if a in accessories]
        assert len(shown) <= TRENDS["staging"]["maxAccessories"], (out["id"], shown)
        assert tags["cameraAngle"] in TRENDS["cameraAngles"] and tags["cameraDistance"] == "wide shot"
    for out in build_batch_prompts(cards[:8], aspect_ratio="4:3"):  # a wide frame still shows the whole wall
        assert "Framing: wide shot" in out["prompt"] and "pulled well back" in out["prompt"] and TRENDS["staging"]["framingTall"] not in out["prompt"], out["id"]


def test_a_random_key_object_is_never_a_tall_or_foreground_set_but_a_card_may_still_pin_one():
    unsafe = {k["name"] for k in TRENDS["keyObjects"] if k.get("muralSafe") is False}
    assert {"Playful reading teepee nook", "Montessori play sanctuary with bunny-ear chairs"} <= unsafe
    cards = [{"id": f"k{i}", "seed": i, "ageGroup": "vorschul"} for i in range(200)]
    assert not [o["tags"]["keyObject"] for o in build_batch_prompts(cards, aspect_ratio="9:16") if o["tags"]["keyObject"] in unsafe]
    pinned = build_batch_prompts([{"id": "p", "ageGroup": "vorschul", "seed": 0, "tags": {"keyObject": "Playful reading teepee nook"}}], "9:16")[0]
    assert "Playful reading teepee nook" in pinned["prompt"]


def test_no_wardrobe_and_no_random_decor_in_a_prompt_and_the_last_guard_names_the_blockers():
    cards = [{"id": f"w{i}", "seed": i, "ageGroup": AGES[i % 4]} for i in range(120)]
    for out in build_batch_prompts(cards, aspect_ratio="9:16"):
        body = out["prompt"].split("Avoid:")[0]
        assert "wardrobe" not in body.lower() and "teepee" not in body.lower() and "on the craft table" not in body, out["id"]   # a 50 cm flower table may still be the hero
        for guard in ("wardrobe or tall furniture against the mural wall", "table and chairs in the foreground", "crowded room",
                      "straight-on frontal view", "furniture hiding the lower part of the mural"):
            assert guard in out["prompt"].split("Avoid:")[1]


def test_the_cards_of_both_listings_use_camera_names_that_exist():
    for name in ("listing45_interiors.json", "listing06_interiors.json"):
        spec = json.loads((ROOT / "specs" / name).read_text(encoding="utf-8"))
        for card in spec["cards"]:
            t = card.get("tags", {})
            if t.get("cameraAngle"):
                assert t["cameraAngle"] in TRENDS["cameraAngles"], (name, card["id"])
            if t.get("cameraElevation"):
                assert t["cameraElevation"] in TRENDS["cameraElevations"], (name, card["id"])
            if t.get("cameraDistance"):
                assert t["cameraDistance"] == "wide shot", (name, card["id"])


# ------------------------------------------------------------------ pairs: one composition, other interior colours (owner 06.11)

def test_the_design_node_offers_the_instagram_carousel_format():
    from comfy_nodes import moonbloom_nodes as nodes
    assert "4:5" in nodes.MoonbloomDesign.INPUT_TYPES()["required"]["aspect_ratio"][0]


def test_cards_that_share_a_seed_key_differ_only_in_what_they_pin():
    base = {"ageGroup": "vorschul", "seed": 5, "seedKey": "pair", "tags": {"style": "Japandi", "keyObject": "Low Scandinavian birch toddler daybed",
            "compositionStrategy": "unobstructed", "wallArchitecture": "full-wall"}}
    mk = lambda cid, color: {**base, "id": cid, "tags": {**base["tags"], "color": color}}  # noqa: E731
    one, two = (o["prompt"] for o in build_batch_prompts([mk("a1", "Honey Amber"), mk("a2", "Dusty Rose")], aspect_ratio="9:16"))
    strip = lambda text, color: text.replace(color, "<C>").replace(COLORS[color]["description"], "<D>")  # noqa: E731
    assert one != two and strip(one, "Honey Amber") == strip(two, "Dusty Rose")


def test_the_colour_variable_names_the_colourway_not_only_an_accent():
    prompt = build_batch_prompts([{"id": "c", "ageGroup": "vorschul", "seed": 1, "tags": {"color": "Dusty Rose", "style": "Japandi"}}], "9:16")[0]["prompt"]
    assert "Interior colourway: Dusty Rose" in prompt and "bedding, textiles, rug and small furniture" in prompt and "and accessories including" in prompt


# ------------------------------------------------------------------ the room fits the child (owner 06.11): who, then the room of that age, then its real toys

def test_every_age_group_says_who_the_child_is_and_sizes_its_room_and_every_toy_has_a_real_place():
    for age in AGES:
        group = TRENDS["ageGroups"][age]
        assert group["child"].startswith(("a baby", "a child", "a schoolchild", "a teenager")), age
        assert re.search(r"\d+ by \d+ cm", group["room"]), f"{age}: the room gives the real size of the bed"
        assert group["toys"] and all(re.search(r"\b(on|in|beside|standing|lying|hanging)\b", t) for t in group["toys"]), f"{age}: a toy without a place"
        assert group["accessories"] and set(group["accessories"]) <= set(TRENDS["accessories"]), age
    assert not [k for k in TRENDS["keyObjects"] if k["ageGroup"] == "baby" and "floor bed" in k["name"].lower()], "a floor bed reads as an adult bed in a baby room"
    assert "ribbed cobalt blue side table with a few books" not in TRENDS["ageGroups"]["baby"]["accessories"]


def test_the_prompt_names_the_child_the_room_of_its_age_and_only_toys_and_accessories_of_that_age():
    cards = [{"id": f"age{i}", "seed": i, "ageGroup": AGES[i % 4]} for i in range(240)]
    for card, out in zip(cards, build_batch_prompts(cards, aspect_ratio="9:16")):
        group, prompt = TRENDS["ageGroups"][card["ageGroup"]], out["prompt"]
        assert f"This is the room of {group['child']}. {group['room']}" in prompt, out["id"]
        assert any(t in prompt for t in group["toys"]), f"{out['id']}: no toy of the age group"
        others = {t for a in AGES if a != card["ageGroup"] for t in TRENDS["ageGroups"][a]["toys"]} - set(group["toys"])
        assert not [t for t in others if t in prompt], out["id"]
        shown = prompt.split("and accessories including ")[1].split(". ")[0]
        assert all(a in group["accessories"] for a in TRENDS["accessories"] if a in shown), (out["id"], shown)


def test_a_carousel_pair_may_not_use_an_accessory_of_another_age():
    from reels_pipeline import carousel
    spec = json.loads((ROOT / "specs" / "sets" / "l2_carousel01.json").read_text(encoding="utf-8"))
    assert carousel.plan_carousel(spec)["problems"] == []
    spec["pairs"][1]["accessories"] = ["round bouclé floor pouf in cream", "crocheted play mat in soft earth tones"]
    assert any("do not suit the age group 'baby'" in p for p in carousel.plan_carousel(spec)["problems"])
