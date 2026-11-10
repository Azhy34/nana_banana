#!/usr/bin/env python3
"""
The director of a set of photos (reels_pipeline/director.py, reels_pipeline/carousel.py): from the task of a set to ready photo cards
(and, for a reel set, clips). Free: nothing here calls KIE or spends credits.

Two kinds of set, told apart by "type" in specs/sets/<set>.json:
  reel      (default)  6 photos 9:16 planned with their clips from design kits + roles; the owner picks 3, they are animated
  carousel             pairs of ONE composition in other interior colourways (Instagram carousel, later first/last frame of a clip)

  py -3.12 -X utf8 scripts/director.py plan l45_set01            # reel: the 6 slots; carousel: the pairs; problems (exit 1)
  py -3.12 -X utf8 scripts/director.py build l45_set01           # writes specs/sets/<set>.generated.json (refuses a set with problems)
  py -3.12 -X utf8 scripts/director.py show l45_set01 s3         # reel: the photo prompt and the clip prompt of a slot
  py -3.12 -X utf8 scripts/director.py show l2_carousel01 b      # carousel: what a pair shares and the sentences in which its cards differ
  py -3.12 -X utf8 scripts/director.py photos l45_set01 1        # reel: round 1 (s1-s3) on the PHOTO board, 2 = s4-s6
  py -3.12 -X utf8 scripts/director.py photos l2_carousel01 2    # carousel: round N = pair N (its cards) on the PHOTO board
  py -3.12 -X utf8 scripts/director.py pick l45_set01 s2 s3 s6   # reel only: the chosen photos on the VIDEO board (up to 3)
  py -3.12 -X utf8 scripts/director.py validate my_set.json     # a set task as a file (or `-` for stdin): problems and warnings, writes nothing, exit 1 on problems
  py -3.12 -X utf8 scripts/director.py moves                      # the vocabulary of video motion (specs/video_motion.json): camera moves, light, what freezes
  py -3.12 -X utf8 scripts/director.py card listing06_interiors.json l6_funhaus_01   # the sections of the prompt of any hand-written card
then: scripts/build_comfy_workflows.py --verify-live, scripts/run_board.py photos|video (free dry run first).

To change a set: edit specs/sets/<set>.json, specs/design_kits.json or specs/roles.json (data, never code), run `plan` again.
How a new idea becomes data: .claude/skills/add-design-idea/SKILL.md.
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reels_pipeline import board_layout, carousel, destinations, director  # noqa: E402
from reels_pipeline.prompts import build_batch_prompts, clip_prompt  # noqa: E402

ACTIVE = ROOT / "specs" / "active_board.json"
ROUNDS = {1: ("s1", "s2", "s3"), 2: ("s4", "s5", "s6")}  # the rounds of a reel set


def _listing(plan_set: dict) -> dict:
    return json.loads((director.SPECS / director.load_set(plan_set["set"])["listing_spec"]).read_text(encoding="utf-8"))


def _is_carousel(set_id: str) -> bool:
    return director.load_set(set_id).get("type") == "carousel"


def _print_problems(plan: dict) -> int:
    if plan.get("warnings"):  # for the owner to decide; they never stop a build
        print("WARNINGS (owner's decision):")
        for line in plan["warnings"]:
            print("  -", line)
    if plan["problems"]:
        print("PROBLEMS:")
        for line in plan["problems"]:
            print("  -", line)
        return 1
    print("no problems: the set can be built")
    return 0


def cmd_plan(set_id: str) -> int:
    plan = director.plan_set(set_id)
    if plan.get("type") == "carousel":
        by_id = {c["id"]: c for c in plan["cards"]}
        print(f"carousel {set_id}: {len(plan['pairs'])} pairs, {len(plan['cards'])} photos, model {plan['model']}")
        for number, pair in enumerate(plan["pairs"], start=1):
            tags = by_id[pair["cards"][0]]["tags"]
            print(f"  round {number}  pair {pair['pair']}  {pair['format']:5} {tags['style']:12} {by_id[pair['cards'][0]]['ageGroup']:9} {tags['keyObject'][:40]}")
            print(f"           colourways {pair['colorways']}  cards {pair['cards']}")
            for frame in pair["frames"]:
                print(f"           frame {frame['format']:5} {len(frame['cards'])} photo(s) serves: "
                      + ("; ".join(destinations.describe(i) for i in frame["serves"]) or "no destination of specs/ad_formats.json asks for this ratio"))
        return _print_problems(plan)
    rules = _listing(plan).get("brief", {})
    kits = director.load_kits()
    roles, models = director.load_roles(), director.load_video_models()
    total_rec = total_kling = 0
    print(f"set {set_id}: {len(plan['slots'])} slots, aspect {plan['cards'][0]['aspectRatio']}, model {plan['model']}")
    for slot, card, clip in zip(plan["slots"], plan["cards"], plan["clips"]):
        kit = kits[slot["kit"]]
        brief = director.brief_of(card, rules) if rules.get("wall_rule") else ""
        print(f"  {slot['slot']} {slot['role']:8} kit {slot['kit']:18} {kit['age']:9} {kit['style']:27} people={card['people']:11} brief {len(brief):4} chars")
        print(f"       clip: {clip['motion'][:118]}...")
        advice = director.video_advice(roles["roles"][slot["role"]], models)
        total_rec += advice["credits"] or 0
        total_kling += models["models"]["kling26"]["credits_5s"]
        print(f"       video: {advice['model']} ~{advice['credits']} credits per 5 s: {advice['why']}")
    print(f"  clips if every slot follows the advice: ~{total_rec} credits (all on Kling: {total_kling}); estimate from specs/video_models.json, the live price is read at the board")
    return _print_problems(plan)


def cmd_validate(source: str) -> int:
    """Read-only check of a set task (JSON) from a file or stdin ("-"): the problems and warnings of the director, nothing is written."""
    try:
        raw = sys.stdin.buffer.read().decode("utf-8-sig") if source == "-" else Path(source).read_text(encoding="utf-8-sig")
        spec = json.loads(raw)
    except (OSError, ValueError) as exc:
        print(f"cannot read a set task from {source!r}: {exc}")
        return 2
    return _print_problems(director.validate_spec(spec))


def cmd_build(set_id: str) -> int:
    plan = director.plan_set(set_id)
    try:
        path = director.write_generated(plan)
    except ValueError as exc:
        print(exc)
        return 1
    print("written:", path.relative_to(ROOT))
    return 0


def _show_pair(set_id: str, pair_id: str) -> int:
    plan = director.plan_set(set_id)
    try:
        prompts = carousel.pair_prompts(plan, pair_id)
    except ValueError as exc:
        print(exc)
        return 2
    ids = list(prompts)
    first = prompts[ids[0]]
    print(f"=== pair {pair_id}: {len(ids)} photos {ids} ===")
    print("the prompts are", {i: len(t) for i, t in prompts.items()}, "characters long and share everything except:")
    for other in ids[1:]:
        for diff in carousel.differing_sentences(first, prompts[other]):
            print(f"\n[{ids[0]}] {diff['a'][:360]}\n[{other}] {diff['b'][:360]}")
    print("\n--- shared sections of the first prompt ---")
    parts = first.split("\n\n")
    shown = []
    for key in ("The focal furniture", "STAGING", "Photographed"):
        hit = next((p for p in parts if key in p), "")
        if hit and hit not in shown:  # the staging sentence sits in the furniture paragraph: print each paragraph once
            shown.append(hit)
            print(f"\n{hit[:520]}")
    return 0


def cmd_show(set_id: str, what: str) -> int:
    if _is_carousel(set_id):
        return _show_pair(set_id, what)
    plan = director.plan_set(set_id)
    index = next((i for i, s in enumerate(plan["slots"]) if s["slot"] == what), None)
    if index is None:
        print(f"no slot {what!r}; the set has {[s['slot'] for s in plan['slots']]}")
        return 2
    video = json.loads((director.SPECS / director.load_set(set_id)["video_spec"]).read_text(encoding="utf-8"))
    print(f"=== PHOTO prompt of {what} ({plan['cards'][index]['id']}) ===\n{director.brief_of(plan['cards'][index], _listing(plan)['brief'])}")
    print(f"\n=== CLIP prompt of {what} (Kling 2.6, 5 s, no sound) ===\n{clip_prompt(plan['clips'][index], video)}")
    return 0


def cmd_card(spec_file: str, card_id: str) -> int:
    """The sections of the full prompt of a hand-written card of a listing spec (free), as the Design node builds it."""
    path = Path(spec_file) if Path(spec_file).is_file() else director.SPECS / spec_file
    spec = json.loads(path.read_text(encoding="utf-8"))
    card = next((c for c in spec.get("cards", []) if c["id"] == card_id), None)
    if card is None:
        print(f"no card {card_id!r} in {path.name}; it has {[c['id'] for c in spec.get('cards', [])]}")
        return 2
    aspect = card.get("aspectRatio") or spec.get("aspect_ratio", "9:16")
    prompt = build_batch_prompts([{**card, "seed": card.get("variation", 0)}], aspect_ratio=aspect)[0]["prompt"]
    print(f"=== {card_id}: {len(prompt)} characters, format {aspect} ===")
    for part in prompt.split("\n\n"):
        print(f"\n{part}")
    return 0


def _write_active(update: dict) -> None:
    data = json.loads(ACTIVE.read_text(encoding="utf-8"))
    data.update(update)  # a block (photos, video) is replaced, never merged: keys of an earlier set (spec, models) must not leak into the next one
    ACTIVE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _bay(default_model: str, aspects: list):
    """"all" (a node of every model whose schema accepts the format, so the model that pays is chosen at run time) when the board stays within
    its node budget, else only the model of the set (three chains with three models would be a giant board)."""
    per_chain = [len(board_layout.supported_models(board_layout.BAY_MODELS, a)) for a in aspects]
    if board_layout.fits(per_chain):
        return "all"
    print(f"note: {len(aspects)} chains with all models would have {board_layout.board_nodes(per_chain)} nodes (budget {board_layout.MAX_PHOTO_BOARD_NODES}): "
          f"only {default_model} is on this board")
    return [default_model]


def cmd_photos(set_id: str, round_number: int) -> int:
    generated = director.load_generated(set_id)
    if not generated:
        print(f"no generated file for {set_id}: run `director.py build {set_id}` first")
        return 1
    if generated.get("type") == "carousel":
        pairs = generated["pairs"]
        if not 1 <= round_number <= len(pairs):
            print(f"round {round_number} does not exist: a carousel round is a pair, the set has {len(pairs)} pairs")
            return 2
        spec_file = director.load_set(set_id)["listing_spec"]
        cards = [{"id": i, "model": generated["model"], "prompt": "full"} for i in pairs[round_number - 1]["cards"]]
        aspects = {c["id"]: c["aspectRatio"] for c in generated["cards"]}
        models = _bay(generated["model"], [aspects[c["id"]] for c in cards])
        # `spec`: the board takes the wallpaper and the folder from the listing of this set; `models`: the nodes every chain carries
        _write_active({"set": set_id, "photos": {"model": generated["model"], "spec": spec_file, "models": models, "cards": cards}})
        print(f"photo board = round {round_number} (pair {pairs[round_number - 1]['pair']}): {[c['id'] for c in cards]}, models on the board: {models}\n"
              "next: build_comfy_workflows.py --verify-live, then run_board.py photos (free), then --paid <model tag> --confirm N")
        return 0
    by_slot = {s["slot"]: s["card"] for s in generated["slots"]}
    cards = [{"id": by_slot[s], "model": generated["model"], "prompt": "brief"} for s in ROUNDS[round_number] if s in by_slot]
    aspects = {c["id"]: c["aspectRatio"] for c in generated["cards"]}
    models = _bay(generated["model"], [aspects[c["id"]] for c in cards])
    block = {"model": generated["model"], "models": models, "cards": cards}
    spec_file = director.load_set(set_id)["listing_spec"]
    if spec_file != "listing45_interiors.json":  # the board's default listing is 45; a set of another listing names its own (wallpaper, folder, brief rules)
        block["spec"] = spec_file
    _write_active({"set": set_id, "photos": block})
    print(f"photo board = round {round_number}: {[c['id'] for c in cards]}, models on the board: {models}\n"
          "next: build_comfy_workflows.py --verify-live, then run_board.py photos")
    return 0


def photo_file(generated: dict, card_id: str) -> Path:
    """Where the photo of a card lies once generated: <frames folder>/<card>_brief__<model tag>.png (the file the Frame Picker offers)."""
    from comfy_nodes.moonbloom_nodes import frames_dir
    from reels_pipeline.kie_generator import MODEL_TAG

    return frames_dir() / f"{card_id}_brief__{MODEL_TAG.get(generated['model'], generated['model'])}.png"


def cmd_pick(set_id: str, slots: list) -> int:
    generated = director.load_generated(set_id)
    if generated.get("type") == "carousel":
        print("pick is for reel sets: a carousel keeps its pairs (they are the slides)")
        return 2
    by_slot = {s["slot"]: s["card"] for s in generated.get("slots", [])}
    # besides the slots of the set, a scene of the listing's video spec may be picked (a photo made elsewhere, e.g. gemini-gen-...: `frame_file`)
    video_spec = json.loads((director.SPECS / director.load_set(set_id)["video_spec"]).read_text(encoding="utf-8"))
    extra = {f["scene_id"]: f for f in video_spec.get("frames", [])}
    unknown = [s for s in slots if s not in by_slot and s not in extra]
    if unknown or not slots:
        print(f"pick slots from {sorted(by_slot)} or scenes of the video spec {sorted(extra)}; unknown: {unknown}")
        return 2
    if len(slots) > 3:
        print("the video board holds at most 3 clips")
        return 2
    listing_file = director.load_set(set_id)["listing_spec"]
    # the folder of the frames: the listing of the set (the video block of the board is written only after this check)
    from comfy_nodes.moonbloom_nodes import frames_dir

    folder = frames_dir() if listing_file == "listing45_interiors.json" else Path(json.loads((director.SPECS / listing_file).read_text(encoding="utf-8"))["out_dir"])
    by_slot.update({s: s for s in slots if s in extra})
    for s in slots:
        if extra.get(s, {}).get("people"):
            print(f"NOTE {s}: a photo made elsewhere with a person: look at the face yourself before paying (a head turned 3/4 toward the camera ends as a plastic face in the clip; only a back or a hidden face is safe)")
    missing = [s for s in slots if not ((folder / extra[s]["frame_file"]).is_file() if s in extra else (folder / photo_file(generated, by_slot[s]).name).is_file())]
    if missing:  # the Frame Picker offers only photos that exist: a clip cannot start from a photo that was never generated
        print(f"no photo yet for {missing} in {folder} (expected {[extra[s]['frame_file'] if s in extra else photo_file(generated, by_slot[s]).name for s in missing]}): generate the photos first")
        return 1
    set_spec = director.load_set(set_id)
    block = {"scenes": [by_slot[s] for s in slots]}
    if set_spec["listing_spec"] != "listing45_interiors.json":  # another listing: its folder of frames and its Kling locks
        block.update({"spec": set_spec["listing_spec"], "video_spec": set_spec["video_spec"]})
    _write_active({"set": set_id, "video": block})
    print(f"video board = {block['scenes']}\nnext: build_comfy_workflows.py --verify-live, then run_board.py video")
    return 0


def cmd_moves() -> int:
    """The vocabulary of video motion (specs/video_motion.json) as a table: id, status, risk, the phrase a clip prompt gets. Read-only."""
    vocab = director.load_video_motion()
    for kind, title in (("camera_moves", "CAMERA MOVES"), ("light_motions", "LIGHT MOTIONS")):
        print(title)
        for move_id, move in vocab[kind].items():
            print(f"  {move_id:<22}{move['status']:<17}{move['risk']:<8}{move['phrase'][:90]}")
    print("FREEZE\n  mural: " + vocab["freeze"]["mural"] + "\n  room:  " + vocab["freeze"]["room"])
    print("status: ok = usable, test = usable with a warning (measure it), avoid / banned_by_owner = the director refuses it")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("plan", "build"):
        sub.add_parser(name).add_argument("set")
    show = sub.add_parser("show")
    show.add_argument("set")
    show.add_argument("what", help="a slot (reel set) or a pair id (carousel set)")
    photos = sub.add_parser("photos")
    photos.add_argument("set")
    photos.add_argument("round", type=int)
    pick = sub.add_parser("pick")
    pick.add_argument("set")
    pick.add_argument("slots", nargs="+")
    sub.add_parser("validate").add_argument("source", help="a set task JSON file, or - for stdin")
    sub.add_parser("moves")
    card = sub.add_parser("card")
    card.add_argument("spec", help="a listing spec file in specs/ or a path")
    card.add_argument("card")
    args = parser.parse_args()
    if args.command == "plan":
        return cmd_plan(args.set)
    if args.command == "build":
        return cmd_build(args.set)
    if args.command == "show":
        return cmd_show(args.set, args.what)
    if args.command == "photos":
        return cmd_photos(args.set, args.round)
    if args.command == "validate":
        return cmd_validate(args.source)
    if args.command == "moves":
        return cmd_moves()
    if args.command == "card":
        return cmd_card(args.spec, args.card)
    return cmd_pick(args.set, args.slots)


if __name__ == "__main__":
    raise SystemExit(main())
