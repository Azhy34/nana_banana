"""Offline tests for the reel director (reels_pipeline/director.py, scripts/director.py; the carousel is in test_carousel.py): kits + roles + a set task -> photo cards and
clips, the safety checks, determinism, the board builder reading the generated set, and `pick` refusing photos that do not exist.
No ComfyUI, no KIE, no credits; every file is written into a scratch copy of specs/.

Run: py -3.12 -X utf8 -m pytest comfy_nodes/test_director.py -q
"""

import copy
import importlib.util
import json
import shutil
from pathlib import Path

import pytest
from PIL import Image

from comfy_nodes import moonbloom_nodes as nodes
from reels_pipeline import director
from reels_pipeline.prompts import BRIEF_PEOPLE, BRIEF_UNINHABITED, build_brief_prompt, clip_prompt

ROOT = Path(__file__).resolve().parent.parent
SET_ID = "l45_set01"


def _script(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def specs(tmp_path, monkeypatch):
    """A scratch copy of the specs the director reads; director.SPECS points at it, so edits and `build` never touch the real files."""
    folder = tmp_path / "specs"
    (folder / "sets").mkdir(parents=True)
    for name in ("design_kits.json", "roles.json", "listing45_interiors.json", "listing45_video.json", "active_board.json", "video_models.json", "video_motion.json"):
        shutil.copy(ROOT / "specs" / name, folder / name)
    shutil.copy(ROOT / "specs" / "sets" / f"{SET_ID}.json", folder / "sets" / f"{SET_ID}.json")
    monkeypatch.setattr(director, "SPECS", folder)
    return folder


def _edit(path, change):
    data = json.loads(path.read_text(encoding="utf-8"))
    change(data)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def _auto_set(specs, seed, set_id="auto_set"):
    """The real task with every kit set to `auto` (the director picks), another seed."""
    task = json.loads((specs / "sets" / f"{SET_ID}.json").read_text(encoding="utf-8"))
    task.update(id=set_id, seed=seed)
    for slot in task["slots"]:
        slot["kit"] = "auto"
    (specs / "sets" / f"{set_id}.json").write_text(json.dumps(task), encoding="utf-8")
    return set_id


# ------------------------------------------------------------------ the real task is fine and obeys every rule

def test_the_real_set_has_no_problems_and_six_slots_of_two_per_role(specs):
    plan = director.plan_set(SET_ID)
    assert plan["problems"] == []
    assert [s["slot"] for s in plan["slots"]] == ["s1", "s2", "s3", "s4", "s5", "s6"]
    roles = [s["role"] for s in plan["slots"]]
    assert sorted(roles) == ["hook", "hook", "life", "life", "product", "product"]
    assert {c["aspectRatio"] for c in plan["cards"]} == {"9:16"}


def test_every_text_fits_its_model_and_follows_the_product_and_face_rules(specs):
    plan = director.plan_set(SET_ID)
    listing = json.loads((specs / "listing45_interiors.json").read_text(encoding="utf-8"))["brief"]
    video = json.loads((specs / "listing45_video.json").read_text(encoding="utf-8"))
    for card, clip in zip(plan["cards"], plan["clips"]):
        brief = director.brief_of(card, listing)
        assert len(brief) <= director.BRIEF_MAX, card["id"]
        assert "away from the mural" in card["scene"]
        assert not any(word in brief for word in director.BANNED_PHOTO)
        assert "{" not in card["scene"] + card["framing"] + clip["motion"]
        if card["people"] == "from_behind":
            assert BRIEF_PEOPLE in brief and "face" in card["scene"]
        else:
            assert BRIEF_UNINHABITED in brief
        prompt = clip_prompt(clip, video)
        assert len(prompt) <= director.CLIP_MAX
        assert not any(word in prompt.lower() for word in director.BANNED_MOTION), (card["id"], prompt)


def test_the_set_is_varied_in_style_age_and_kit(specs):
    plan = director.plan_set(SET_ID)
    kits = director.load_kits()
    used = [s["kit"] for s in plan["slots"]]
    assert len(set(used)) == 6
    assert len({kits[k]["style"] for k in used}) >= 4
    assert {kits[k]["age"] for k in used} == set(director.MODEL_AGES)
    assert len({c["scene"] for c in plan["cards"]}) == 6


def test_hook_and_life_frames_show_people_only_from_behind_and_product_frames_none(specs):
    plan = director.plan_set(SET_ID)
    by_role = {s["role"]: c["people"] for s, c in zip(plan["slots"], plan["cards"])}
    assert by_role == {"hook": "from_behind", "product": "none", "life": "from_behind"}
    assert all(c["people"] in ("none", "from_behind") for c in plan["cards"])


def test_the_kit_names_exist_in_the_variables_of_the_app(specs):
    names = director.trends_names()
    for kit in director.load_kits().values():
        assert kit["style"] in names["styles"] and kit["color"] in names["colors"] and kit["lighting"] in names["lighting"], kit["id"]
    plan = director.plan_set(SET_ID)
    for card in plan["cards"]:
        t = card["tags"]
        assert t["cameraBody"] in names["cameraBodies"] and t["lens"] in names["lenses"] and t["aperture"] in names["apertures"], card["id"]


# ------------------------------------------------------------------ determinism and the `auto` kit

def test_the_same_seed_gives_the_same_set_and_another_seed_another_one(specs):
    first = director.plan_set(_auto_set(specs, 7, "a"))
    again = director.plan_set(_auto_set(specs, 7, "a"))
    assert [s["kit"] for s in first["slots"]] == [s["kit"] for s in again["slots"]]
    assert [c["tags"] for c in first["cards"]] == [c["tags"] for c in again["cards"]]
    assert first["cards"] == again["cards"] and first["clips"] == again["clips"]
    assert len({tuple(s["kit"] for s in director.plan_set(_auto_set(specs, seed, f"s{seed}"))["slots"]) for seed in range(1, 6)}) > 1


def test_auto_never_repeats_a_kit_and_fails_when_the_kits_run_out(specs):
    plan = director.plan_set(_auto_set(specs, 3))
    assert len({s["kit"] for s in plan["slots"]}) == 6
    _edit(specs / "design_kits.json", lambda d: d.update(kits=d["kits"][:5]))
    with pytest.raises(ValueError, match="no unused kit"):
        director.plan_set(_auto_set(specs, 3))


def test_an_unknown_kit_or_role_is_a_clear_error(specs):
    _edit(specs / "sets" / f"{SET_ID}.json", lambda d: d["slots"][0].update(kit="nope"))
    with pytest.raises(ValueError, match="no kit 'nope'"):
        director.plan_set(SET_ID)
    _edit(specs / "sets" / f"{SET_ID}.json", lambda d: d["slots"][0].update(kit="arch_poufs", role="villain"))
    with pytest.raises(ValueError, match="no role 'villain'"):
        director.plan_set(SET_ID)


# ------------------------------------------------------------------ the checks really catch a bad set

def _problems(specs, kits=None, roles=None, task=None):
    for name, change in (("design_kits.json", kits), ("roles.json", roles), (f"sets/{SET_ID}.json", task)):
        if change:
            _edit(specs / name, change)
    return director.plan_set(SET_ID)["problems"]


def _kit(data, kit_id, **changes):
    next(k for k in data["kits"] if k["id"] == kit_id).update(changes)


def test_a_style_that_is_not_in_the_variables_is_a_problem(specs):
    problems = _problems(specs, kits=lambda d: _kit(d, "arch_poufs", style="Invented Style"))
    assert any("arch_poufs" in p and "Promt/trends.json" in p for p in problems)


def test_a_kit_used_twice_too_few_styles_and_a_missing_age_are_problems(specs):
    problems = _problems(specs, task=lambda d: d["slots"][1].update(kit="arch_poufs"))
    assert any("used twice" in p for p in problems)
    kits = director.load_kits()
    same = {kits[k]["style"] for k in kits}.pop()
    problems = _problems(specs, kits=lambda d: [k.update(style=same) for k in d["kits"]])
    assert any("different styles" in p for p in problems)
    problems = _problems(specs, kits=lambda d: [k.update(age="baby") for k in d["kits"]])
    assert any("no kit for the age group" in p for p in problems)


def test_the_decor_sentence_is_added_by_the_director_so_no_role_can_drop_it(specs):
    _edit(specs / "roles.json", lambda d: d["roles"]["product"].update(photo_scene="A pouf stands in front of the mural."))
    plan = director.plan_set(SET_ID)
    assert all("On the " in c["scene"] and "side wall, away from the mural" in c["scene"] for c in plan["cards"])


def test_a_ceiling_fixture_that_is_not_placed_well_above_the_mural_is_caught(specs):
    problems = _problems(specs, kits=lambda d: _kit(d, "bubble_chandelier", ceiling="A chandelier hangs in the corner."))
    assert any("above the top edge of the mural" in p for p in problems)


def test_a_banned_camera_move_in_a_role_or_a_leftover_placeholder_is_caught(specs):
    problems = _problems(specs, roles=lambda d: d["roles"]["hook"].update(motion=d["roles"]["hook"]["motion"] + " Then zoom in slowly."))
    assert any("'zoom'" in p for p in problems)
    problems = _problems(specs, roles=lambda d: d["roles"]["hook"].update(framing="Wide shot. {oops}"))
    assert any("unfilled" in p for p in problems)


def test_a_person_in_a_role_without_people_or_without_a_turned_face_is_caught(specs):
    problems = _problems(specs, roles=lambda d: d["roles"]["product"].update(photo_scene=d["roles"]["product"]["photo_scene"] + " A girl stands there."))
    assert any("has no person but the scene names one" in p for p in problems)
    problems = _problems(specs, roles=lambda d: d["roles"]["hook"].update(photo_scene="A woman stands by the door."))
    assert any("face is turned away" in p for p in problems)


def test_a_brief_over_the_limit_is_a_problem(specs):
    problems = _problems(specs, kits=lambda d: _kit(d, "arch_poufs", room="A very long room. " * 80))
    assert any(f"limit is {director.BRIEF_MAX}" in p for p in problems)


def test_a_listing_without_brief_rules_cannot_be_built(specs):
    _edit(specs / "listing45_interiors.json", lambda d: d["brief"].pop("wall_rule"))
    plan = director.plan_set(SET_ID)
    assert any("no brief rules" in p for p in plan["problems"])
    with pytest.raises(ValueError, match="nothing was written"):
        director.write_generated(plan)
    assert not (specs / "sets" / f"{SET_ID}.generated.json").exists()


# ------------------------------------------------------------------ the generated file

def test_build_writes_the_generated_file_and_it_loads_back(specs):
    assert director.load_generated(SET_ID) == {} and director.load_generated(None) == {}
    path = director.write_generated(director.plan_set(SET_ID))
    generated = director.load_generated(SET_ID)
    assert path.name == f"{SET_ID}.generated.json" and generated["set"] == SET_ID and generated["model"] == "nano-banana-2-1"
    assert len(generated["cards"]) == len(generated["clips"]) == len(generated["slots"]) == 6
    assert all(c["frame_scene_id"] == f"{c['scene_id']}_brief" for c in generated["clips"])


def test_the_brief_prompt_takes_the_people_rule_and_refuses_an_unknown_mode():
    rules = {"product": "a wallpaper mural", "product_short": "the mural", "wall_rule": "It covers the whole wall."}
    base = ("Subject.", "Scene.", "Framing.", "Soft light", "Sony A7R V", "35mm", "f/8")
    assert BRIEF_UNINHABITED in build_brief_prompt(*base, rules=rules)
    assert BRIEF_PEOPLE in build_brief_prompt(*base, rules=rules, people="from_behind") and BRIEF_UNINHABITED not in build_brief_prompt(*base, rules=rules, people="from_behind")
    with pytest.raises(ValueError, match="people must be"):
        build_brief_prompt(*base, rules=rules, people="face")
    assert "never a face" in BRIEF_PEOPLE or "no part of the face" in BRIEF_PEOPLE


def test_the_design_node_has_the_people_input_with_the_two_allowed_modes():
    options = nodes.MoonbloomDesign.INPUT_TYPES()["optional"]["brief_people"]
    assert list(options[0]) == ["none", "from_behind"] and options[1]["default"] == "none"


# ------------------------------------------------------------------ the board builder reads the generated set

@pytest.fixture
def builder(specs, monkeypatch):
    b = _script("build_comfy_workflows", "scripts/build_comfy_workflows.py")
    director.write_generated(director.plan_set(SET_ID))
    generated = director.load_generated(SET_ID)
    monkeypatch.setattr(b, "active_set", lambda: generated)
    return b, generated


def test_the_photo_board_builds_a_brief_chain_per_generated_card(builder):
    b, generated = builder
    active = {"photos": {"model": generated["model"], "cards": [{"id": c["id"], "model": generated["model"], "prompt": "brief"} for c in generated["cards"][:3]]}}
    board = b.photos_board(active)
    b.check("photos", board)
    designs = [v["inputs"] for v in board.values() if v["class_type"] == "MoonbloomDesign"]
    assert [d["scene_id"] for d in designs] == [f"{c['id']}_brief" for c in generated["cards"][:3]]
    assert all(d["aspect_ratio"] == "9:16" and d["prompt_mode"] == "brief" and d["with_texture"] for d in designs)
    assert [d["brief_people"] for d in designs] == [c["people"] for c in generated["cards"][:3]]
    images = [v["inputs"] for v in board.values() if v["class_type"] in b.IMAGE_CLASSES]
    assert len(images) == 3 and all(i["dry_run"] is True and i["reference_labels"] is False for i in images)


def test_a_photo_board_of_four_chains_is_refused(builder):
    b, generated = builder
    active = {"photos": {"model": generated["model"], "cards": [{"id": c["id"], "prompt": "brief"} for c in generated["cards"][:4]]}}
    with pytest.raises(AssertionError, match="at most"):
        b.photos_board(active)


def _photos_on_disk(tmp_path, monkeypatch, card_ids):
    """A frames folder holding the brief photo of each card (the Frame Picker offers only files that exist)."""
    folder = tmp_path / "frames"
    folder.mkdir(exist_ok=True)
    for card_id in card_ids:
        Image.new("RGB", (60, 100)).save(folder / f"{card_id}_brief__nb21.png")
    monkeypatch.setenv("MOONBLOOM_FRAMES_DIR", str(folder))


def test_the_video_board_starts_each_clip_on_its_brief_photo_and_holds_three(builder, tmp_path, monkeypatch):
    b, generated = builder
    ids = [c["id"] for c in generated["cards"]]
    _photos_on_disk(tmp_path, monkeypatch, ids)
    board = b.video_board({"video": {"scenes": ids[:3]}})
    b.check("video", board)
    pickers = [v["inputs"]["frame"] for v in board.values() if v["class_type"] == "MoonbloomFramePicker"]
    assert pickers == [f"{i}_brief__nb21.png" for i in ids[:3]]
    klings = [v["inputs"] for v in board.values() if v["class_type"] == "MoonbloomKieKling"]
    assert len(klings) == 3 and all(k["dry_run"] is True and k["sound"] is False for k in klings)
    video = b.load_video_spec()
    assert [k["prompt_override"] for k in klings] == [clip_prompt(c, video) for c in generated["clips"][:3]]
    with pytest.raises(AssertionError, match="at most 3"):
        b.video_board({"video": {"scenes": ids[:4]}})


def test_the_hand_written_scenes_are_still_found_next_to_the_generated_ones(builder):
    b, generated = builder
    board = b.video_board({"video": {"scenes": ["l45_scene_06_entering_door", generated["cards"][0]["id"]]}})
    frames = [v["inputs"]["frame"] for v in board.values() if v["class_type"] == "MoonbloomFramePicker"]
    assert frames == ["l45_scene_06_entering_door__nb21.png", f"{generated['cards'][0]['id']}_brief__nb21.png"]


# ------------------------------------------------------------------ pick: only photos that exist

@pytest.fixture
def cli(specs, tmp_path, monkeypatch):
    """scripts/director.py with its active_board.json and the frames folder redirected to scratch."""
    module = _script("director_cli", "scripts/director.py")
    active = specs / "active_board.json"
    monkeypatch.setattr(module, "ACTIVE", active)
    frames = tmp_path / "frames"
    frames.mkdir()
    monkeypatch.setenv("MOONBLOOM_FRAMES_DIR", str(frames))
    director.write_generated(director.plan_set(SET_ID))
    return module, active, frames


def _video_scenes(active):
    return json.loads(active.read_text(encoding="utf-8"))["video"]["scenes"]


def test_pick_refuses_photos_that_were_never_generated_and_changes_nothing(cli, capsys):
    module, active, frames = cli
    before = active.read_text(encoding="utf-8")
    assert module.cmd_pick(SET_ID, ["s1", "s3"]) == 1
    assert "no photo yet for ['s1', 's3']" in capsys.readouterr().out
    assert active.read_text(encoding="utf-8") == before


def test_pick_puts_existing_photos_on_the_video_board_and_refuses_a_partial_pick(cli, capsys):
    module, active, frames = cli
    generated = director.load_generated(SET_ID)
    by_slot = {s["slot"]: s["card"] for s in generated["slots"]}
    for slot in ("s2", "s3"):
        Image.new("RGB", (60, 100)).save(module.photo_file(generated, by_slot[slot]))
    assert module.cmd_pick(SET_ID, ["s2", "s3"]) == 0
    assert _video_scenes(active) == [by_slot["s2"], by_slot["s3"]]
    before = active.read_text(encoding="utf-8")
    assert module.cmd_pick(SET_ID, ["s2", "s5"]) == 1          # s5 has no photo: nothing is half-written
    assert active.read_text(encoding="utf-8") == before


def test_pick_refuses_unknown_slots_and_more_than_three(cli):
    module, active, frames = cli
    generated = director.load_generated(SET_ID)
    for slot in generated["slots"]:
        Image.new("RGB", (60, 100)).save(module.photo_file(generated, slot["card"]))
    before = active.read_text(encoding="utf-8")
    assert module.cmd_pick(SET_ID, ["s9"]) == 2
    assert module.cmd_pick(SET_ID, ["s1", "s2", "s3", "s4"]) == 2
    assert module.cmd_pick(SET_ID, []) == 2
    assert active.read_text(encoding="utf-8") == before


def test_the_photo_file_is_the_one_the_frame_picker_offers(cli):
    module, active, frames = cli
    generated = director.load_generated(SET_ID)
    card = generated["slots"][0]["card"]
    path = module.photo_file(generated, card)
    assert path == frames / f"{card}_brief__nb21.png"
    Image.new("RGB", (60, 100)).save(path)
    assert path.name in nodes.list_frames()


def test_photos_puts_the_round_on_the_photo_board_without_touching_the_video_board(cli):
    module, active, frames = cli
    video_before = _video_scenes(active)
    assert module.cmd_photos(SET_ID, 2) == 0
    data = json.loads(active.read_text(encoding="utf-8"))
    generated = director.load_generated(SET_ID)
    assert [c["id"] for c in data["photos"]["cards"]] == [s["card"] for s in generated["slots"][3:]]
    assert all(c["prompt"] == "brief" and c["model"] == generated["model"] for c in data["photos"]["cards"])
    assert data["set"] == SET_ID and data["video"]["scenes"] == video_before


def test_photos_without_a_built_set_says_so(specs, tmp_path, monkeypatch, capsys):
    module = _script("director_cli2", "scripts/director.py")
    monkeypatch.setattr(module, "ACTIVE", specs / "active_board.json")
    assert module.cmd_photos("nonexistent_set", 1) == 1
    assert "build" in capsys.readouterr().out


def test_a_wardrobe_a_tent_or_a_table_with_chairs_in_a_scene_is_a_problem(specs):
    for thing in ("a tall wardrobe in cream", "a reading teepee", "a table and chairs"):
        problems = _problems(specs, kits=lambda d, thing=thing: _kit(d, "arch_poufs", side_wall=thing))
        assert any("hides the mural" in p for p in problems), thing


# ------------------------------------------------------------------ the video-model knowledge of the director (08.11)

def test_every_role_names_a_known_video_model_with_a_reason():
    roles, models = director.load_roles(), director.load_video_models()
    for name, role in roles["roles"].items():
        advice = director.video_advice(role, models)
        assert advice["model"] in models["models"] and advice["credits"], name      # a model we know, with a price estimate
        assert role.get("video_why"), f"role {name}: say why that model (what proves it)"


def test_the_advice_defaults_to_the_working_model_and_clips_carry_it():
    models = director.load_video_models()
    assert director.video_advice({}, models)["model"] == "kling26"                   # a role that says nothing: Kling stays the default
    plan = director.plan_set("l6_reel01")
    assert [c["video_model"] for c in plan["clips"]] == ["kling26", "kling26"]       # Grok video is out (owner 08.11): every role on Kling


def test_the_banned_wicker_family_cannot_enter_a_scene_again():
    # a mistake the owner caught on 08.11: a woven basket and a rattan bench in two frames (the ban lives in creative-ad-auditor)
    for word in ("basket", "wicker", "rattan", "woven", "straw"):
        assert word in director.BANNED_SCENE_ITEMS
    for set_id in ("l6_reel01", "l7_reel01"):
        assert director.plan_set(set_id)["problems"] == [], set_id      # the kits made today are clean under the stricter rule


def test_a_slot_can_add_its_own_light_sentence_to_the_clip_motion():
    plan = director.plan_set("l7_reel01")
    s2 = next(c for c in plan["clips"] if c["scene_id"].endswith("s2_product"))
    assert "shadows of leafy branches sway slowly on the wall" in s2["motion"]            # the proven wording of Listing 2 (owner 08.11: the shadow ON the wall is wanted)
    assert "clearly visible calm walking pace" in s2["motion"] and "very slow" not in s2["motion"]   # the slot's own camera text replaced the role's slow one
    s1 = next(c for c in plan["clips"] if c["scene_id"].endswith("s1_gaze"))
    assert "shadows of leafy branches" not in s1["motion"]                                    # other slots and roles are untouched


# ------------------------------------------------------------------ one gender for the person, the role fits the age, the camera is angled (10.11)

def test_the_person_and_every_pronoun_name_one_gender_for_every_kit_and_role():
    kits, roles = director.load_kits(), director.load_roles()
    checked = 0
    for audience in ("boy", "girl", "neutral"):
        for kit in kits.values():
            for name, role in roles["roles"].items():
                kid = director.kit_child(kit)["gender"]
                if role["people"] == "none" or (role.get("gender") in ("boy", "girl") and kid in ("boy", "girl") and role["gender"] != kid):
                    continue                                    # no person, or a pair the plan refuses on its own (a boy-only role in a girl's room)
                out = director.compose(kit, name, roles, {}, "x", "s1", 1, audience=audience)
                text = " ".join((out["card"]["scene"], out["clip"]["motion"]))
                person = out["person"]["text"]
                male = any(w in person for w in ("boy", "schoolboy"))
                bad = director.FEMALE_WORDS if male else director.MALE_WORDS
                assert not bad.search(text), (audience, kit["id"], name, person, bad.findall(text))
                assert out["person"]["male"] == male, (kit["id"], name, person)
                checked += 1
    assert checked > 200


def test_a_role_is_refused_for_an_age_or_a_gender_it_does_not_fit_and_a_set_can_ask_for_a_room_and_a_child(specs):
    problems = _problems(specs, task=lambda d: d["slots"][1].update(role="play"))                  # s2 is the schoolchild's kit; `play` is a 2.5-year-old
    assert any("'play'" in p and "age band" in p for p in problems)
    problems = _problems(specs, task=lambda d: d["slots"][0].update(role="wow"))                   # arch_poufs is a girl's room, `wow` is always a boy
    assert any("always a boy" in p for p in problems)
    zone = director.load_kits()["arch_poufs"]["room_type"]
    assert zone in director.room_zones() and "teenager" in director.age_bands()                       # the words are the web app's (trends.json)
    problems = _problems(specs, task=lambda d: d.update(room_type="study zone" if zone != "study zone" else "sleep zone", child={"gender": "boy", "age_band": "baby"}))
    assert any("room_type" in p and "asks for" in p for p in problems) and any("asks for 'boy'" in p for p in problems) and any("age_band" in p for p in problems)
    assert any("not one of" in p for p in _problems(specs, task=lambda d: d.update(room_type="nursery")))


def test_the_accent_colour_is_not_repeated_in_the_palette_and_a_frontal_camera_is_refused(specs):
    kits, roles = director.load_kits(), director.load_roles()
    gaze = director.compose(kits["neutral_japandi_gaze"], "gaze", roles, {}, "x", "s1", 1)["card"]["scene"]
    assert kits["neutral_japandi_gaze"]["color"].lower() in kits["neutral_japandi_gaze"]["palette"] and kits["neutral_japandi_gaze"]["color"].lower() not in gaze.split("Palette:")[1]
    strawberry = director.compose(kits["arch_poufs"], "life", roles, {}, "x", "s1", 1)["card"]["scene"]
    assert kits["arch_poufs"]["palette"] in strawberry                                              # a colour that is not in the palette leaves it alone
    for framing in ("Shot straight on at eye level, square to the wall.", "Shot at eye level, turned about 5 degrees toward the mural wall.", "Shot at eye level."):
        problems = _problems(specs, roles=lambda d, f=framing: d["roles"]["hook"].update(framing=f))
        assert any("hook" in p and ("frontal" in p or "camera angle" in p) for p in problems), framing
    assert director.camera_problem(director.load_roles()["roles"]["life"]["framing"]) == ""         # the angles of the real roles (20 / 25 / 30 degrees) are fine


def test_validate_is_read_only_shows_the_mother_in_the_baby_room_and_turns_a_bad_task_into_a_problem(specs):
    task = json.loads((specs / "sets" / f"{SET_ID}.json").read_text(encoding="utf-8"))
    before = sorted(p.name for p in (specs / "sets").iterdir())
    result = director.validate_spec(task)
    assert result["problems"] == [] and any("s5" in w and "young mother" in w for w in result["warnings"])
    task["constraints"]["adult_person_ok"] = ["s5"]                                                 # the owner's decision silences the warning for that slot only
    assert director.validate_spec(task)["warnings"] == []
    task["slots"][0]["kit"] = "no_such_kit"
    assert any("no_such_kit" in p for p in director.validate_spec(task)["problems"])
    assert sorted(p.name for p in (specs / "sets").iterdir()) == before                             # nothing was written


# ------------------------------------------------------------------ the vocabulary of video motion (specs/video_motion.json, 10.11)

def _room_task(specs, **slot_change):
    """The real task with its first `product` slot turned into the `room` role (+ the changes asked for): the room role has no person."""
    task = json.loads((specs / "sets" / f"{SET_ID}.json").read_text(encoding="utf-8"))
    slot = next(s for s in task["slots"] if s["role"] == "product")
    slot["role"] = "room"
    slot.update(slot_change)
    return task


def test_the_motion_vocabulary_is_complete_and_agrees_with_the_owners_banned_words():
    vocab = director.load_video_motion()
    for kind in ("camera_moves", "light_motions"):
        for move_id, move in vocab[kind].items():
            assert move["status"] in ("ok", "test", "avoid", "banned_by_owner") and move["risk"] in ("low", "medium", "high"), move_id
            assert move["phrase"].strip() and move["source"].strip(), move_id
            lowered = move["phrase"].lower()
            hits = [w for w in director.BANNED_MOTION if w in lowered]
            # a move the owner banned must trip the director's banned-word check, a usable one must not: the list here and the words in code stay in step
            assert bool(hits) == (move["status"] == "banned_by_owner"), (move_id, move["status"], hits)


def test_the_room_role_builds_its_motion_from_the_vocabulary_and_slots_may_choose_the_move(specs):
    plan = director.plan_spec(_room_task(specs))
    clip = next(c for c in plan["clips"] if c["scene_id"].endswith("_room"))
    assert clip["camera_move"] == "locked_off" and clip["light_motion"] == "dust_and_sun_patches"
    assert "fixed, static shot" in clip["motion"] and "tripod" not in clip["motion"] and "Fine dust drifts" in clip["motion"] and "stays perfectly still and unchanged" in clip["motion"]
    assert not any("room" in p for p in plan["problems"])                                    # an ok move is no problem and no warning
    pulled = director.plan_spec(_room_task(specs, camera="slow_pull_back"))
    assert any("slow_pull_back" in w and "measure" in w for w in pulled["warnings"])         # a `test` move is allowed, with a warning


def test_a_banned_or_unknown_move_and_a_move_for_a_role_without_the_placeholder_are_refused(specs):
    banned = director.plan_spec(_room_task(specs, camera="push_in"))
    assert any("push_in" in p and "banned_by_owner" in p for p in banned["problems"])        # the owner's ban holds even when the vocabulary knows the move
    unknown = director.validate_spec(_room_task(specs, camera="barrel_roll"))
    assert any("barrel_roll" in p and "locked_off" in p for p in unknown["problems"])        # the error names the known ids
    wrong_role = _room_task(specs)
    next(s for s in wrong_role["slots"] if s["role"] == "life")["camera"] = "locked_off"
    assert any("has no {camera_move}" in p for p in director.validate_spec(wrong_role)["problems"])


def test_the_clip_prompt_limit_comes_from_the_model_not_from_one_constant():
    assert director.clip_prompt_limit("kling26") == 2500 and director.clip_prompt_limit(None) == 2500
    assert director.clip_prompt_limit("omni12") == 20000 and director.clip_prompt_limit("kling40") == 8000


# ------------------------------------------------------------------ `director.py design`: the dealer (code) + the scene writer (a model) + the checks (the director)
# Acceptance of the new logic (once): the model is replaced by a stub, nothing here calls Claude, KIE or spends anything.

def _design_specs(specs):
    """The scratch specs plus the files `design` reads: the listing, its video spec, the writer's rules."""
    for name in ("listing07_interiors.json", "listing07_video.json", "scene_writer_brief.md"):
        shutil.copy(ROOT / "specs" / name, specs / name)
    return json.loads((specs / "listing07_interiors.json").read_text(encoding="utf-8"))


def _scenes_for(hands, **overrides):
    """A valid scene per hand, as the writer would answer: every field set, nothing banned, the pose of a `life` frame without the face sentence."""
    out = []
    for h in hands:
        scene = {"slot": h["slot"], "name": f"Room {h['slot']}", "color": h["color"], "room_type": "play zone", "subject": f"a calm {h['style']} room for a child",
                 "room": "A bright room with a light oak floor.", "floor": "A round cream rug lies on the floor with a few wooden blocks on it.",
                 "side_wall": "a low solid-oak bench (35 cm high) with two picture books, and above it one small framed print",
                 "light": "Warm morning sunbeams from a window on the {side} lie in soft patches on the floor.", "palette": "cream, pale oak, sage and white",
                 "items": "round rug, wooden blocks, oak bench, picture books, picture frame and architecture",
                 "life_pose": "{person} kneels on the rug with {her} back to the camera" if h["role"] == "life" else "",
                 "life_action": "slowly turns a page" if h["role"] == "life" else ""}
        scene.update(overrides.get(h["slot"], {}))
        out.append(scene)
    return out


def test_the_dealer_is_repeatable_and_deals_different_styles_both_sides_and_roles_that_fit_the_audience(specs):
    from reels_pipeline import dealer

    listing = _design_specs(specs)
    first = dealer.deal(listing, "t_set", 73)
    assert first == dealer.deal(listing, "t_set", 73) and first != dealer.deal(listing, "t_set", 74)
    assert len({h["style"] for h in first}) == 3 and {h["side"] for h in first} == {"left", "right"}
    assert [h["person"] for h in first] == [True, False, True]
    assert not any("dusk" in h["lighting"] for h in first) and all(h["color"] in [c["name"] for c in h["allowed_colors"]] for h in first)
    girl = dict(listing, audience="girl")
    assert all(h["role"] not in ("gaze", "wow") for seed in range(12) for h in dealer.deal(girl, "g_set", seed))      # a boy's role never in a girl's wallpaper
    with pytest.raises(ValueError, match="audience"):
        dealer.deal({k: v for k, v in listing.items() if k != "audience"}, "t_set", 1)


def test_a_set_with_its_scenes_inside_plans_without_touching_the_shared_kits(specs):
    from reels_pipeline import dealer, scene_writer

    listing = _design_specs(specs)
    hands = dealer.deal(listing, "d_set", 5)
    calls = []

    def stub(task, wallpaper, model):
        calls.append(task)
        return {"scenes": _scenes_for(hands), "usage": {"model": model, "tokens": 10, "list_price_usd": 0.0}}

    kits_before = (specs / "design_kits.json").read_bytes()
    result = scene_writer.design_set("d_set", "listing07_interiors.json", seed=5, runner=stub)
    assert result["status"] == "ok" and len(calls) == 1 and (specs / "sets" / "d_set.json").is_file()
    assert (specs / "design_kits.json").read_bytes() == kits_before                                      # the shared file stays as it was
    plan = director.plan_set("d_set")
    assert plan["problems"] == [] and [s["kit"] for s in plan["slots"]] == ["d_set_s1", "d_set_s2", "d_set_s3"]
    life = next(c for c, s in zip(plan["cards"], plan["slots"]) if s["role"] == "life")
    assert "face turned away from the camera" in life["scene"]                                              # the face sentence is code's, not the model's
    with pytest.raises(ValueError, match="already exists"):
        scene_writer.design_set("d_set", "listing07_interiors.json", seed=5, runner=stub)


def test_a_banned_scene_is_asked_for_again_once_and_then_nothing_is_saved(specs):
    from reels_pipeline import dealer, scene_writer

    listing = _design_specs(specs)
    hands = dealer.deal(listing, "b_set", 5)
    bad = {"s2": {"side_wall": "a low bed with a wicker basket beside it"}}
    answers = [_scenes_for(hands, **bad), _scenes_for(hands)]
    asked = []

    def fixes_it(task, wallpaper, model):
        asked.append(task)
        return {"scenes": answers[len(asked) - 1], "usage": {"model": model, "tokens": 1, "list_price_usd": 0.0}}

    ok = scene_writer.design_set("b_set", "listing07_interiors.json", seed=5, runner=fixes_it)
    assert ok["status"] == "ok" and len(asked) == 2 and "wicker" in asked[1] and "Your previous answer broke these rules" in asked[1]

    never = lambda task, wallpaper, model: {"scenes": _scenes_for(hands, **bad), "usage": {"model": model, "tokens": 1, "list_price_usd": 0.0}}  # noqa: E731
    stuck = scene_writer.design_set("b2_set", "listing07_interiors.json", seed=5, runner=never)
    assert stuck["status"] == "problems" and any("wicker" in p for p in stuck["problems"]) and not (specs / "sets" / "b2_set.json").exists()


def test_the_chat_writer_leaves_a_task_file_and_a_scenes_file_finishes_the_set(specs, tmp_path, monkeypatch):
    import types

    from reels_pipeline import dealer, scene_writer

    listing = _design_specs(specs)
    monkeypatch.setattr(scene_writer, "PipelineConfig", types.SimpleNamespace(ROOT_DIR=tmp_path))
    waiting = scene_writer.design_set("c_set", "listing07_interiors.json", seed=5, writer="chat")
    assert waiting["status"] == "task_written" and waiting["path"].is_file() and not (specs / "sets" / "c_set.json").exists()
    text = waiting["path"].read_text(encoding="utf-8")
    assert "Never write a face" in text and "allowed_colors" in text and "s3" in text
    answer = tmp_path / "scenes.json"
    answer.write_text(json.dumps({"slots": _scenes_for(dealer.deal(listing, "c_set", 5))}), encoding="utf-8")
    done = scene_writer.design_set("c_set", "listing07_interiors.json", seed=5, scenes_file=str(answer))
    assert done["status"] == "ok" and (specs / "sets" / "c_set.json").is_file()


def test_a_scene_that_names_a_thing_by_denying_it_is_rejected(specs):
    from reels_pipeline import dealer, scene_writer

    listing = _design_specs(specs)
    hands = dealer.deal(listing, "n_set", 5)
    denying = lambda task, wallpaper, model: {"scenes": _scenes_for(hands, s1={"floor": "A cream cotton pouf, macramé-free, stands on the rug."}),  # noqa: E731
                                              "usage": {"model": model, "tokens": 1, "list_price_usd": 0.0}}
    result = scene_writer.design_set("n_set", "listing07_interiors.json", seed=5, runner=denying)
    assert result["status"] == "problems" and any("macramé-free" in p or "-free" in p for p in result["problems"]) and not (specs / "sets" / "n_set.json").exists()
