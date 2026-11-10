"""Offline tests of the brief prompt (06.11): a short structured prompt for a reference image, written to the official guidance of
Google (Nano Banana) and OpenAI (GPT Image). No ComfyUI, no KIE, no credits.

Run: py -3.12 -X utf8 -m pytest comfy_nodes -q
"""

import importlib.util
import json
import re
from pathlib import Path
from types import SimpleNamespace as NS

import pytest

from comfy_nodes import bridge_logic
from comfy_nodes import moonbloom_nodes as nodes
from reels_pipeline import kie_generator
from reels_pipeline.prompts import BRIEF_TEXTURE, build_brief_prompt

ROOT = Path(__file__).resolve().parent.parent
TRENDS = json.loads((ROOT / "Promt" / "trends.json").read_text(encoding="utf-8"))
REALISM = TRENDS["realism"]["photo"]   # the real-photograph line: data, shared by the web app's prompt and the brief
SPEC = json.loads((ROOT / "specs" / "listing45_interiors.json").read_text(encoding="utf-8"))
RULES = {k: SPEC["brief"][k] for k in ("product", "product_short", "wall_rule")}   # the facts of Listing 45, from its spec
NEW_CARDS = [c for c in SPEC["cards"] if re.match(r"l45_scene_1[1-6]_", c["id"])]
GPT, GROK = "gpt-image-2-image-to-image", "grok-imagine-image-2-0/image-edit"
# What must NOT be in a brief prompt: the web app's template sentences, the long Avoid list, request fields written as text, old labels.
FORBIDDEN = ("focal furniture", "Authentic lived-in", "Grazing natural morning daylight", "Avoid:", "Aspect ratio", "REFERENCE_IMAGE",
             "FULL-HEIGHT 100% WALL COVERAGE", "tactile", "no cobalt")


def _builder():
    spec = importlib.util.spec_from_file_location("build_comfy_workflows", ROOT / "scripts" / "build_comfy_workflows.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _brief_of(card):
    t = card["tags"]
    return build_brief_prompt(card["subject"], card["scene"], card["framing"], t["lighting"], t["cameraBody"], t["lens"], t["aperture"], rules=RULES,
                              style=t["style"], color=t["color"])    # the Design node passes the chosen style and colour the same way


def test_the_brief_has_the_structure_the_guides_ask_for():
    text = build_brief_prompt("a calm room", "A rug.", "A straight-on shot.", "soft light", "Canon EOS R5", "35mm lens", "f/8", rules=RULES)
    intro, references, scene, light = text.split("\n\n")
    assert intro == "Create a photorealistic photograph of a calm room."                  # what the picture is (OpenAI: define the result); no style chosen, none written
    assert references.startswith("References: image 1 is the wall mural. " + RULES["wall_rule"]) and "image 1" in references and "Image 2" in references and BRIEF_TEXTURE in references   # roles by number
    assert scene.startswith("Scene: A rug.") and scene.endswith("The room is empty of people.")                              # said positively
    assert light == "Light and camera: soft light, even on the mural. A straight-on shot. Canon EOS R5, 35mm lens, f/8, sharp across the whole wall. " + REALISM
    assert BRIEF_TEXTURE not in build_brief_prompt("a room", "A rug.", "A shot.", with_texture=False, rules=RULES)                         # no texture sent: no sentence about it
    assert build_brief_prompt("a room", "A rug.", "A shot.", rules=RULES).endswith("Sharp across the whole wall. " + REALISM)             # no camera pinned: no camera gear


def test_a_brief_needs_the_three_texts_of_the_card():
    for missing in ({"subject": ""}, {"scene": " "}, {"framing": ""}):
        args = {"subject": "a room", "scene": "A rug.", "framing": "A shot.", "rules": RULES, **missing}
        with pytest.raises(ValueError, match="subject, scene and framing"):
            build_brief_prompt(**args)


@pytest.mark.parametrize("card", NEW_CARDS, ids=lambda c: c["id"])
def test_every_new_card_has_a_short_clean_brief(card):
    text = _brief_of(card)
    assert len(text) <= 2400, f"{len(text)} chars: the app's full prompt is about 6 200"                           # with the style signature, the accent colour and the real-photograph line
    assert REALISM in text and card["tags"]["style"] in text and card["tags"]["color"].lower() in text
    assert text == _brief_of(card)                                                                                 # nothing random
    for forbidden in FORBIDDEN:
        assert forbidden not in text, f"{card['id']}: {forbidden!r} does not belong to a brief"
    assert card["subject"].rstrip(".") in text and card["scene"] in text and card["framing"] in text
    assert card["tags"]["lighting"] in text and card["tags"]["cameraBody"] in text and card["tags"]["lens"] in text
    assert not re.search(r"\b(2:3|4:3|9:16|1K|2K|4K)\b", text), "the format and the size are fields of the request, not words of the prompt"
    assert not re.search(r"\b(no|not|without|avoid)\b", card["scene"] + " " + card["framing"], re.IGNORECASE), "describe what you want, not what you don't"


def test_the_design_node_builds_the_brief_and_keeps_full_unchanged():
    b = _builder()
    card = next(c for c in NEW_CARDS if c["id"] == "l45_scene_14_baby_quiet_corner_23")
    chain = b.designs(True, "nano-banana-2-1", ((card["id"], "nano-banana-2-1", "brief"),))
    inputs = next(v["inputs"] for v in chain.values() if v["class_type"] == "MoonbloomDesign")
    assert inputs["prompt_mode"] == "brief"
    text, scene_id = nodes.MoonbloomDesign().build(**inputs)
    assert scene_id == card["id"] + "_brief" and text == _brief_of(card) and len(text) < 2400      # its own file name: never mistaken for the full-prompt picture
    full_chain = b.designs(True, "nano-banana-2-1", (card["id"],))                                                    # the default stays the app's prompt
    full_inputs = next(v["inputs"] for v in full_chain.values() if v["class_type"] == "MoonbloomDesign")
    assert "prompt_mode" not in full_inputs
    full_text = nodes.MoonbloomDesign().build(**full_inputs)[0]
    assert "FULL-HEIGHT 100% WALL COVERAGE" in full_text and "Avoid:" in full_text and len(full_text) > 4000
    with pytest.raises(ValueError):                                                                                   # brief without its texts is refused, not guessed
        nodes.MoonbloomDesign().build(**{**inputs, "brief_scene": ""})
    random_light = nodes.MoonbloomDesign().build(**{**inputs, "lighting": "random"})[0]
    assert "even on the mural" not in random_light                                                                     # a random tag is not pinned into the text


def test_the_board_entry_asks_for_brief_and_switches_the_labels_off():
    b = _builder()
    cid = "l45_scene_14_baby_quiet_corner_23"
    graph = b.designs(True, "nano-banana-2-1", ((cid, "nano-banana-2-1", "full"), (cid, GPT, "brief"), (cid, GROK, "brief")))
    b.check("modes", graph)
    designs = [v["inputs"] for v in graph.values() if v["class_type"] == "MoonbloomDesign"]
    images = [v for v in graph.values() if v["class_type"] in b.IMAGE_CLASSES]
    assert [d.get("prompt_mode", "full") for d in designs] == ["full", "brief", "brief"]
    assert [i["inputs"].get("reference_labels", True) for i in images] == [True, False, False]                         # roles are in the brief text itself
    board = b.photos_board({"photos": {"model": "nano-banana-2-1", "cards": [{"id": cid, "model": GPT, "prompt": "brief"}, cid]}})
    modes = [v["inputs"].get("prompt_mode", "full") for v in board.values() if v["class_type"] == "MoonbloomDesign"]
    assert modes == ["brief", "full"]                                                                                  # a plain id stays the full prompt
    assert bridge_logic.max_credits(graph) == 0                                                                       # every photo node starts as a dry run
    files = [Path(bridge_logic._frame_file(graph, i)).name for i in images]
    assert len(set(files)) == 3 and all(f.startswith(cid) for f in files)                                              # three models, three files
    assert files[1] == f"{cid}_brief__gpt2.png" and files[2] == f"{cid}_brief__grok2.png"                              # brief never reuses the picture of the full prompt
    full = b.designs(True, "nano-banana-2-1", ((cid, GPT, "full"),))
    assert {Path(bridge_logic._frame_file(full, v)).name for v in full.values() if v["class_type"] in b.IMAGE_CLASSES} == {f"{cid}__gpt2.png"}


def _fake_gen(sent):
    gen = kie_generator.KieImageGenerator.__new__(kie_generator.KieImageGenerator)
    gen.client = NS(get_credits=lambda: NS(success=True, data=NS(data=849.0)),
                    create_task=lambda m, body: sent.update(model=m, body=body) or NS(success=False, error=NS(code=1, msg="stop here")))
    gen._url_cache = {}
    gen.upload_reference = lambda path, tag: f"https://cdn/{tag}"
    return gen


def test_the_long_labels_are_added_only_when_asked(monkeypatch, tmp_path):
    monkeypatch.setattr(kie_generator.TelemetryLogger, "log_event", staticmethod(lambda **k: None))
    brief = _brief_of(NEW_CARDS[3])
    for labels in (True, False):
        sent = {}
        _fake_gen(sent).generate_image(prompt=brief, wallpaper=tmp_path / "w.png", out_path=tmp_path / "x__gpt2.png", model=GPT, texture=tmp_path / "t.jpg",
                                       aspect_ratio="2:3", resolution="2K", scene_id="x", reference_labels=labels)
        text = sent["body"]["prompt"]
        assert text.startswith("REFERENCE_IMAGE_1") == labels and text.endswith(brief)
        assert (text == brief) == (not labels)                                                                         # brief mode sends the brief and nothing else


def test_the_dry_run_report_says_how_long_the_prompt_is_and_whether_labels_were_added(monkeypatch):
    monkeypatch.setattr("requests.get", lambda url, headers=None, **kw: NS(json=lambda: {"code": 200, "msg": "ok", "data": {"pricingDesc": "4 credits per image (= $0.02)"}}))
    gen = _fake_gen({})
    brief = _brief_of(NEW_CARDS[3])
    short = gen.check_image_request(prompt=brief, model=GROK, resolution=None, aspect_ratio="2:3", reference_labels=False)["request_preview"]["prompt"]
    long = gen.check_image_request(prompt=brief, model=GROK, resolution=None, aspect_ratio="2:3", reference_labels=True)["request_preview"]["prompt"]
    assert short["labels_added"] is False and short["chars_sent"] == len(brief) and short["approx_tokens"] == round(len(brief) / 4)
    assert long["labels_added"] is True and long["chars_sent"] > short["chars_sent"] + 600


def test_the_design_and_kie_nodes_show_the_new_inputs():
    design = nodes.MoonbloomDesign.INPUT_TYPES()["optional"]
    assert design["prompt_mode"][0] == ["full", "brief"] and design["prompt_mode"][1]["default"] == "full"
    for name in ("brief_subject", "brief_scene", "brief_framing", "with_texture"):
        assert name in design
    for node in ("MoonbloomKieImage", "MoonbloomKieGptImage2", "MoonbloomKieGrokImagineEdit"):
        labels = nodes.NODE_CLASS_MAPPINGS[node].INPUT_TYPES()["optional"]["reference_labels"]
        assert labels[0] == "BOOLEAN" and labels[1]["default"] is True                                                   # old boards keep the old behaviour


# ------------------------------------------------------------------ card 17 (bubble chandelier) and the three brief variants of the Banana test

CARD17 = "l45_scene_17_baby_bubble_chandelier_23"


def test_the_brief_variants_differ_by_exactly_one_factor_and_have_their_own_files():
    b = _builder()
    card = next(c for c in SPEC["cards"] if c["id"] == CARD17)
    texts, files = {}, {}
    for mode in ("brief", "brief-nogear", "brief-anchor"):
        chain = b.designs(True, "nano-banana-2-1", ((CARD17, "nano-banana-2-1", mode),))
        inputs = next(v["inputs"] for v in chain.values() if v["class_type"] == "MoonbloomDesign")
        texts[mode] = nodes.MoonbloomDesign().build(**inputs)[0]
        files[mode] = Path(bridge_logic._frame_file(chain, next(v for v in chain.values() if v["class_type"] in b.IMAGE_CLASSES))).name
    assert texts["brief"] == _brief_of(card)
    gear = f"{card['tags']['cameraBody']}, {card['tags']['lens']}, {card['tags']['aperture']}, sharp across the whole wall."
    assert gear in texts["brief"] and gear not in texts["brief-nogear"] and texts["brief-nogear"].endswith("Sharp across the whole wall. " + REALISM)
    assert texts["brief-nogear"] == texts["brief"].replace(gear, "Sharp across the whole wall.")                       # nothing else changed
    assert texts["brief-anchor"] == texts["brief"].replace(" Image 2 is", " Reproduce image 1 unchanged on the wall: do not redraw, restyle or replace it. Image 2 is")
    assert len(set(files.values())) == 3 and files["brief-anchor"] == f"{CARD17}_brief_anchor__nb21.png"             # never reuse another variant's picture
    with pytest.raises(AssertionError, match="unknown brief option"):
        b.designs(True, "nano-banana-2-1", ((CARD17, "nano-banana-2-1", "brief-nogeer"),))


def test_card_17_keeps_the_mural_clear_and_uses_our_ready_decor():
    card = next(c for c in SPEC["cards"] if c["id"] == CARD17)
    text = _brief_of(card)
    assert card["aspectRatio"] == "2:3" and card["ageGroup"] == "baby" and len(text) <= 2600
    for piece in ("scalloped wooden wall shelf", "wavy scalloped picture frames", "bubble chandelier with frosted glass globes", "quilted", "beechwood rattle"):
        assert piece in text, piece                                                                                  # taken from trends.json / the Listing 43-44 prompts
    assert "LEFT side wall, away from the mural" in text and "well above the top edge of the mural" in text         # decor must not cover the product
    for forbidden in FORBIDDEN:
        assert forbidden not in text
    assert not re.search(r"\b(2:3|4:3|9:16|1K|2K|4K)\b", text)
    trends = json.loads((ROOT / "Promt" / "trends.json").read_text(encoding="utf-8"))
    assert "playful cluster bubble chandelier with frosted glass globes" in trends["accessories"]                    # the source of the phrase still exists


def test_the_design_node_has_the_anchor_switch_off_by_default():
    anchor = nodes.MoonbloomDesign.INPUT_TYPES()["optional"]["brief_anchor"]
    assert anchor[0] == "BOOLEAN" and anchor[1]["default"] is False


def test_the_three_creatives_of_round_3_are_different_designs_each_with_a_clean_brief():
    ids = ["l45_scene_17_baby_bubble_chandelier_23", "l45_scene_18_girl_flower_table_43", "l45_scene_19_girl_study_globe_23"]
    cards = [next(c for c in SPEC["cards"] if c["id"] == i) for i in ids]
    assert len({c["tags"]["style"] for c in cards}) == 3 and {c["ageGroup"] for c in cards} == {"baby", "vorschul", "schulkind"}
    assert len({c["scene"] for c in cards}) == 3 and sorted(c["aspectRatio"] for c in cards) == ["2:3", "2:3", "4:3"]
    for c in cards:
        text = _brief_of(c)
        assert len(text) <= 2600 and "away from the mural" in c["scene"], c["id"]                                    # decor sits on the side wall, not on the product
        assert not re.search(r"\b(woman|man|mother|father|boy|girl herself)\b", c["scene"]), c["id"]                # no people: faces are never shown
        assert not any(f in text for f in FORBIDDEN) and not re.search(r"\b(2:3|4:3|9:16|1K|2K|4K)\b", text), c["id"]
    round_3 = {"photos": {"model": "nano-banana-2-1", "cards": [{"id": ids[0], "prompt": "brief"}, {"id": ids[1], "prompt": "brief-nogear"},
                                                                {"id": ids[2], "prompt": "brief-anchor"}]}}  # the board of round 3, whatever the live board holds now
    board = _builder().photos_board(round_3)
    entries = [(v["inputs"]["scene_id"]) for v in board.values() if v["class_type"] == "MoonbloomDesign"]
    assert entries == [f"{ids[0]}_brief", f"{ids[1]}_brief_nogear", f"{ids[2]}_brief_anchor"]                       # three designs, three variants, three files


# ------------------------------------------------------------------ the wall rule is a fact of the listing, not of the code

OLD_L45_WALL_SENTENCE = ("References: image 1 is the wall mural. It covers the whole feature wall edge to edge, floor to ceiling, drawing and "
                         "colours unchanged; the whole wall stays visible and nothing stands in front of it.")
SCALLOP = {"product": "the wallpaper", "product_short": "the wallpaper",
           "wall_rule": "It covers only the lower two thirds of the feature wall, up to a scalloped wave trim; above the trim the wall is painted warm cream."}


def test_listing_45_gets_exactly_the_sentence_it_always_got():
    card = next(c for c in SPEC["cards"] if c["id"] == "l45_scene_14_baby_quiet_corner_23")
    text = _brief_of(card)
    assert OLD_L45_WALL_SENTENCE in text and "even on the mural." in text                                            # the words of the old code constant, unchanged


def test_another_listing_gets_its_own_wall_rule_and_never_the_full_wall_one():
    text = build_brief_prompt("a nursery", "A rug.", "A shot.", "soft light", rules=SCALLOP)
    assert "References: image 1 is the wallpaper. It covers only the lower two thirds" in text and "even on the wallpaper." in text
    for stale in ("floor to ceiling", "whole feature wall", "mural"):
        assert stale not in text, f"{stale!r} is a fact of Listing 45, it must not leak into another listing"


def test_a_brief_without_the_rules_of_the_listing_is_refused_not_guessed():
    for rules in (None, {}, {**RULES, "wall_rule": " "}, {k: v for k, v in RULES.items() if k != "product"}):
        with pytest.raises(ValueError, match="rules of the listing"):
            build_brief_prompt("a room", "A rug.", "A shot.", rules=rules)
    b = _builder()
    card = next(c for c in SPEC["cards"] if c["id"] == "l45_scene_14_baby_quiet_corner_23")
    with pytest.raises(AssertionError, match="no brief rules"):
        b.design_inputs(card, "2:3", "brief", {"product": "x"})
    inputs = b.design_inputs(card, "2:3", "brief", SPEC["brief"])
    assert inputs["brief_product"] == "the wall mural" and inputs["brief_wall_rule"] == RULES["wall_rule"]
    with pytest.raises(ValueError, match="rules of the listing"):                                                    # the node refuses an empty rule too
        nodes.MoonbloomDesign().build(**{**inputs, "brief_wall_rule": ""})
