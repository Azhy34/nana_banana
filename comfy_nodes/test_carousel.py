"""Offline tests of the CAROUSEL set (reels_pipeline/carousel.py, scripts/director.py) and of scripts/new_listing.py: pairs of one composition
in other interior colourways, the checks that keep every frame mural-first, the rounds, and the start of a new listing.
No ComfyUI, no KIE, no credits; every file is written into a scratch copy of specs/.

Run: py -3.12 -X utf8 -m pytest comfy_nodes/test_carousel.py -q
"""

import copy
import importlib.util
import json
import shutil
from pathlib import Path

import pytest
from PIL import Image

from reels_pipeline import carousel, director

ROOT = Path(__file__).resolve().parent.parent
SET_ID = "l2_carousel01"


def _script(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def specs(tmp_path, monkeypatch):
    """A scratch copy of the specs the director reads; director.SPECS points at it."""
    folder = tmp_path / "specs"
    (folder / "sets").mkdir(parents=True)
    for name in ("listing02_interiors.json", "listing06_interiors.json", "active_board.json"):
        shutil.copy(ROOT / "specs" / name, folder / name)
    shutil.copy(ROOT / "specs" / "sets" / f"{SET_ID}.json", folder / "sets" / f"{SET_ID}.json")
    monkeypatch.setattr(director, "SPECS", folder)
    return folder


def _edit_set(specs, change):
    path = specs / "sets" / f"{SET_ID}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    change(data)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def _problems(specs, change):
    _edit_set(specs, change)
    return director.plan_set(SET_ID)["problems"]


# ------------------------------------------------------------------ the real set

def test_the_real_carousel_has_two_pairs_in_two_formats_and_no_problems(specs):
    plan = director.plan_set(SET_ID)
    assert plan["problems"] == [] and plan["type"] == "carousel"
    assert [(p["pair"], p["format"], len(p["cards"])) for p in plan["pairs"]] == [("a", "9:16", 2), ("b", "4:5", 2)]
    assert [c["aspectRatio"] for c in plan["cards"]] == ["9:16", "9:16", "4:5", "4:5"]
    assert plan == director.plan_set(SET_ID), "the same task is the same plan"


def test_a_pair_shares_the_composition_and_the_random_leftovers_and_changes_only_the_colour(specs):
    plan = director.plan_set(SET_ID)
    by_id = {c["id"]: c for c in plan["cards"]}
    for pair in plan["pairs"]:
        first, second = (by_id[i] for i in pair["cards"])
        assert first["seedKey"] == second["seedKey"] and first["variation"] == second["variation"]
        assert {k: v for k, v in first["tags"].items() if k != "color"} == {k: v for k, v in second["tags"].items() if k != "color"}
        assert first["tags"]["color"] != second["tags"]["color"]
    a1, a2 = (by_id[i] for i in plan["pairs"][0]["cards"])
    assert a1["seedKey"] != by_id[plan["pairs"][1]["cards"][0]]["seedKey"], "two pairs are two different rooms"
    assert (a1["ageGroup"], a1["tags"]["style"], a1["tags"]["color"], a2["tags"]["color"]) == ("vorschul", "Japandi", "Honey Amber", "Dusty Rose")
    assert "far left corner" in a1["tags"]["cameraAngle"] and a1["tags"]["lens"] == "24mm tilt-shift lens" and a1["tags"]["aperture"] == "f/11 aperture"


def test_the_prompts_of_a_pair_differ_in_the_colourway_sentence_and_nothing_else(specs):
    plan = director.plan_set(SET_ID)
    for pair in plan["pairs"]:
        prompts = carousel.pair_prompts(plan, pair["pair"])
        first, second = prompts.values()
        diffs = carousel.differing_sentences(first, second)
        assert len(diffs) == 1, [(d["a"][:60], d["b"][:60]) for d in diffs]
        assert pair["colorways"][0] in diffs[0]["a"] and pair["colorways"][1] in diffs[0]["b"]
        assert "carried by the bedding, textiles, rug and small furniture" in diffs[0]["a"]      # the colourway sentence (its prefix is shared)
    with pytest.raises(ValueError, match="no pair"):
        carousel.pair_prompts(plan, "z")


def test_the_generated_file_holds_cards_and_pairs_and_no_reel_parts(specs):
    path = director.write_generated(director.plan_set(SET_ID))
    generated = director.load_generated(SET_ID)
    assert path.name == f"{SET_ID}.generated.json" and generated["type"] == "carousel" and len(generated["cards"]) == 4 and len(generated["pairs"]) == 2
    assert "clips" not in generated and "slots" not in generated


# ------------------------------------------------------------------ the checks catch what would hide the mural or break the pair

def test_every_kind_of_bad_pair_is_a_problem(specs):
    pair = lambda d, i=0: d["pairs"][i]  # noqa: E731
    cases = [
        (lambda d: pair(d).update(style="Invented"), "is not in Promt/trends.json"),
        (lambda d: pair(d, 1).update(colorways=["Warm Terracotta", "Cool Blue"]), "does not suit the style"),
        (lambda d: pair(d).update(key_object="Playful reading teepee nook"), "muralSafe"),
        (lambda d: pair(d).update(key_object="Curved birch Montessori floor bed"), "is not a key object of the age group"),
        (lambda d: pair(d).update(accessories=["round bouclé floor pouf in cream", "crocheted play mat in soft earth tones", "wall sconce with a soft warm glow"]), "mural-first limit"),
        (lambda d: pair(d).update(accessories=["a wardrobe"]), "accessories not in Promt/trends.json"),
        (lambda d: pair(d).update(colorways=["Honey Amber"]), "at least two different colourways"),
        (lambda d: pair(d).update(colorways=["Honey Amber", "Honey Amber"]), "at least two different colourways"),
        (lambda d: pair(d).update(colorways=["Honey Amber", "Dusty Rose", "Olive", "Cocoa Brown"]), "do not fit one board"),
        (lambda d: pair(d).update({"for": [], "format": "1:2"}), "is not one of"),
        (lambda d: d.update(model="grok-imagine-image-2-0/image-edit") or pair(d, 1).update(format="4:5"), "not supported by"),
        (lambda d: pair(d).update(lighting="moonlight"), "lighting"),
        (lambda d: pair(d).update(angle=9), "outside the"),
        (lambda d: pair(d).update(gear={"body": "Sony A7R V", "lens": "50mm normal lens", "aperture": "f/11 aperture"}), "not a room-photo choice"),
        (lambda d: pair(d).update(age="teenager"), "age 'teenager'"),
    ]
    for change, expected in cases:
        shutil.copy(ROOT / "specs" / "sets" / f"{SET_ID}.json", specs / "sets" / f"{SET_ID}.json")
        problems = _problems(specs, change)
        assert any(expected in p for p in problems), (expected, problems)
        with pytest.raises(ValueError, match="nothing was written"):
            director.write_generated(director.plan_set(SET_ID))


def test_a_pair_without_its_parts_is_an_error_not_a_guess(specs):
    _edit_set(specs, lambda d: d["pairs"][0].pop("colorways"))
    with pytest.raises(ValueError, match="missing"):
        director.plan_set(SET_ID)


def test_the_gear_is_chosen_from_the_pools_when_the_set_does_not_name_it(specs):
    _edit_set(specs, lambda d: [p.pop("gear") for p in d["pairs"]])
    plan = director.plan_set(SET_ID)
    gear = director.interior_gear()
    assert plan["problems"] == []
    for card in plan["cards"]:
        assert card["tags"]["cameraBody"] in gear["bodies"] and card["tags"]["lens"] in gear["lenses"] and card["tags"]["aperture"] in gear["apertures"]
    assert plan == director.plan_set(SET_ID)


# ------------------------------------------------------------------ rounds and the boards

@pytest.fixture
def cli(specs, monkeypatch):
    module = _script("director_cli_carousel", "scripts/director.py")
    monkeypatch.setattr(module, "ACTIVE", specs / "active_board.json")
    return module


def _photos(specs):
    return json.loads((specs / "active_board.json").read_text(encoding="utf-8"))["photos"]


def test_a_round_is_a_pair_and_the_board_gets_the_listing_of_the_set(cli, specs, capsys):
    assert cli.cmd_photos(SET_ID, 1) == 1 and "build" in capsys.readouterr().out      # nothing is built yet
    director.write_generated(director.plan_set(SET_ID))
    assert cli.cmd_photos(SET_ID, 2) == 0
    photos = _photos(specs)
    assert photos["spec"] == "listing02_interiors.json" and photos["model"] == "nano-banana-2-1"
    assert [c["id"] for c in photos["cards"]] == ["l2_carousel01_b1_blue_meta_4x5", "l2_carousel01_b2_yellow_meta_4x5"] and {c["prompt"] for c in photos["cards"]} == {"full"}
    assert cli.cmd_photos(SET_ID, 1) == 0 and [c["id"] for c in _photos(specs)["cards"]][0] == "l2_carousel01_a1_amber_meta_9x16"
    assert cli.cmd_photos(SET_ID, 3) == 2 and cli.cmd_photos(SET_ID, 0) == 2
    assert cli.cmd_pick(SET_ID, ["a"]) == 2                                            # pick is for reel sets


def test_the_commands_show_and_plan_work_for_a_pair_and_for_a_hand_written_card(cli, specs, capsys):
    assert cli.cmd_plan(SET_ID) == 0 and "round 2  pair b" in capsys.readouterr().out
    assert cli.cmd_show(SET_ID, "b") == 0
    shown = capsys.readouterr().out
    assert "Cool Blue (" in shown and "Butter Yellow (" in shown and shown.count("The focal furniture") == 1
    assert cli.cmd_show(SET_ID, "zz") == 2
    assert cli.cmd_card("listing06_interiors.json", "l6_funhaus_01") == 0 and "STAGING" in capsys.readouterr().out
    assert cli.cmd_card("listing06_interiors.json", "nope") == 2


def test_the_board_builder_takes_the_pair_cards_and_the_wallpaper_of_the_set_listing(specs, monkeypatch):
    b = _script("build_comfy_workflows", "scripts/build_comfy_workflows.py")
    director.write_generated(director.plan_set(SET_ID))
    generated = director.load_generated(SET_ID)
    monkeypatch.setattr(b, "active_set", lambda: generated)
    cards = [{"id": c["id"], "model": "nano-banana-2-1", "prompt": "full"} for c in generated["cards"][2:]]
    board = b.photos_board({"photos": {"model": "nano-banana-2-1", "spec": "listing02_interiors.json", "cards": cards}})
    b.check("photos", board)
    designs = [v["inputs"] for v in board.values() if v["class_type"] == "MoonbloomDesign"]
    assert [x["aspect_ratio"] for x in designs] == ["4:5", "4:5"] and [x["variation"] for x in designs] == [23, 23]
    assert [x["color"] for x in designs] == ["Cool Blue", "Butter Yellow"]
    wallpaper = next(v["inputs"] for v in board.values() if v["class_type"] == "MoonbloomWallpaper")
    assert wallpaper["wallpaper_path"].endswith("January 21, 2026 - 10_32AM.jpeg")
    assert carousel.MAX_CHAINS == b.MAX_PHOTO_CHAINS


# ------------------------------------------------------------------ a new listing

@pytest.fixture
def listing(tmp_path):
    module = _script("new_listing", "scripts/new_listing.py")
    folder = tmp_path / "Обои" / "Листинг 7"
    folder.mkdir(parents=True)
    picture = folder / "wall.png"
    Image.new("RGB", (400, 300), (200, 220, 210)).save(picture)
    specs_dir = tmp_path / "specs"
    specs_dir.mkdir()
    return module, picture, specs_dir


def test_a_new_listing_gets_a_skeleton_with_facts_and_todo_where_a_look_is_needed(listing, capsys):
    module, picture, specs_dir = listing
    target = module.create(str(picture), specs_dir=specs_dir)
    spec = json.loads(target.read_text(encoding="utf-8"))
    assert target.name == "listing07_interiors.json" and spec["listing"] == "Листинг 7" and spec["cards"] == [] and spec["aspect_ratio"] == "9:16"
    assert spec["wallpaper"].endswith("Листинг 7/wall.png") and spec["out_dir"].endswith("Листинг 7") and spec["texture"] == module.TEXTURE
    assert spec["brief"]["wall_rule"] == module.WALL_RULE and "TODO" in spec["brief"]["hero"] and "TODO" in spec["description"]
    assert "400x300" in capsys.readouterr().out
    problems = module.check(target.name, specs_dir=specs_dir)
    assert sum("still to fill" in p for p in problems) == 3, "the audience, the description and the hero wait for a LOOK at the wallpaper"
    spec["audience"] = "neutral"
    spec["description"] = "a pale green meadow, calm"
    spec["brief"]["hero"] = "the meadow"
    target.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
    assert module.check(target.name, specs_dir=specs_dir) == []


def test_a_new_listing_never_overwrites_a_filled_spec_and_refuses_bad_input(listing):
    module, picture, specs_dir = listing
    module.create(str(picture), specs_dir=specs_dir)
    with pytest.raises(FileExistsError, match="--force"):
        module.create(str(picture), specs_dir=specs_dir)
    module.create(str(picture), force=True, specs_dir=specs_dir)
    with pytest.raises(FileNotFoundError):
        module.create(str(picture.parent / "missing.png"), specs_dir=specs_dir)
    other = picture.parent.parent / "ohne Nummer"
    other.mkdir()
    Image.new("RGB", (10, 10)).save(other / "w.png")
    with pytest.raises(ValueError, match="--number"):
        module.create(str(other / "w.png"), specs_dir=specs_dir)
    assert module.create(str(other / "w.png"), number=12, name="Листинг 12", specs_dir=specs_dir).name == "listing12_interiors.json"


def test_the_real_listing_specs_have_nothing_left_to_fill_and_the_listing_2_spec_holds_facts_only():
    module = _script("new_listing_real", "scripts/new_listing.py")
    for name in ("listing02_interiors.json", "listing06_interiors.json"):
        assert module.check(name) == [], name
    assert json.loads((ROOT / "specs" / "listing02_interiors.json").read_text(encoding="utf-8"))["cards"] == []
