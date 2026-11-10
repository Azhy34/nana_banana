#!/usr/bin/env python3
"""
Start a new LISTING (a wallpaper) in the design logic: create specs/listingNN_interiors.json with the FACTS of the wallpaper only. Free.
The photo cards do not live here: they live in sets (specs/sets/*.json, see scripts/director.py) and the design in Promt/trends.json.

  py -3.12 -X utf8 scripts/new_listing.py "C:/.../Обои/Листинг 7/wallpaper.png"            # the number and the name come from the folder name
  py -3.12 -X utf8 scripts/new_listing.py <wallpaper> --number 7 --name "Листинг 7" --out-dir <folder for the results>
  py -3.12 -X utf8 scripts/new_listing.py --check listing07_interiors.json                  # nothing left to fill? (exit 1 when TODO is left)

The skeleton says TODO where a LOOK at the picture is needed: `description` (what the wallpaper shows, palette, mood) and `brief.hero`
(the main motif). Fill them in after looking at the image; `brief.wall_rule` is the full-wall default (change it for a wallpaper that covers
only part of the wall). How to describe a wallpaper: .claude/skills/add-design-idea/references/listing-intake.md.
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPECS = ROOT / "specs"
TEXTURE = "public/textures/craft_lambda.jpg"  # the paper texture every listing sends as the second reference
WALL_RULE = ("It covers the whole feature wall edge to edge, floor to ceiling, drawing and colours unchanged; "
             "the whole wall stays visible and nothing stands in front of it.")
TODO = "TODO"
AUDIENCES = ("boy", "girl", "neutral")  # who the room is for: decided by LOOKING at the wallpaper (step 0 of the workflow)
KNOWN_RATIOS = {"1:1": 1.0, "4:3": 4 / 3, "3:2": 3 / 2, "16:9": 16 / 9, "5:4": 5 / 4, "3:4": 3 / 4, "2:3": 2 / 3, "9:16": 9 / 16}


def _ratio(width: int, height: int) -> str:
    value = width / height
    return min(KNOWN_RATIOS, key=lambda k: abs(KNOWN_RATIOS[k] - value))


def _number(wallpaper: Path, given):
    if given is not None:
        return given
    found = re.search(r"(\d+)", wallpaper.parent.name)
    return int(found.group(1)) if found else None


def create(wallpaper: str, name=None, number=None, out_dir=None, force=False, specs_dir: Path = SPECS) -> Path:
    from PIL import Image

    path = Path(wallpaper)
    if not path.is_file():
        raise FileNotFoundError(f"wallpaper file not found: {path}")
    number = _number(path, number)
    if number is None:
        raise ValueError("no listing number in the folder name: pass --number")
    target = specs_dir / f"listing{number:02d}_interiors.json"
    if target.exists() and not force:
        raise FileExistsError(f"{target.name} exists already (it holds facts someone filled in): use --force to overwrite")
    with Image.open(path) as image:
        width, height = image.size
    spec = {
        "listing": name or f"Листинг {number}",
        "audience": f"{TODO}: boy | girl | neutral (LOOK at the palette and the motif; unsure: ask the owner)",
        "description": f"{TODO}: what the wallpaper shows (motif, palette, mood), {width}x{height}. Facts only: the photo cards live in sets (specs/sets/*.json).",
        "aspect_ratio": "9:16",
        "brief": {
            "description": "Facts of THIS listing used by the short (brief) prompt.",
            "product": "the wall mural",
            "product_short": "the mural",
            "hero": f"{TODO}: the main motif, e.g. 'the giraffe and the elephant'",
            "wall_rule": WALL_RULE,
        },
        "wallpaper": path.resolve().as_posix(),
        "out_dir": Path(out_dir).resolve().as_posix() if out_dir else path.resolve().parent.as_posix(),
        "texture": TEXTURE,
        "cards": [],
    }
    target.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"written: {target.relative_to(ROOT) if target.is_relative_to(ROOT) else target}")
    print(f"picture: {width}x{height} (about {_ratio(width, height)}), {path.stat().st_size / 1e6:.1f} MB (the pipeline downscales the reference to 2400 px)")
    print(f"next: LOOK at the picture and fill every {TODO} (audience, description, brief.hero), then: new_listing.py --check {target.name}")
    return target


def check(spec_file: str, specs_dir: Path = SPECS) -> list:
    path = Path(spec_file) if Path(spec_file).is_file() else specs_dir / spec_file
    spec = json.loads(path.read_text(encoding="utf-8"))
    problems = []
    for key in ("listing", "wallpaper", "out_dir", "texture", "aspect_ratio", "brief"):
        if not spec.get(key):
            problems.append(f"missing `{key}`")
    flat = json.dumps(spec, ensure_ascii=False)
    for match in re.finditer(rf"{TODO}[^\"]*", flat):
        problems.append(f"still to fill: {match.group(0)[:80]}")
    if spec.get("wallpaper") and not Path(spec["wallpaper"]).is_file():
        problems.append(f"the wallpaper file does not exist: {spec['wallpaper']}")
    if spec.get("out_dir") and not Path(spec["out_dir"]).is_dir():
        problems.append(f"the results folder does not exist: {spec['out_dir']}")
    if spec.get("audience") not in AUDIENCES:
        problems.append(f"`audience` must be one of {AUDIENCES}, got {spec.get('audience')!r}")
    for key in ("product", "product_short", "hero", "wall_rule"):
        if not (spec.get("brief") or {}).get(key):
            problems.append(f"missing `brief.{key}`")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("wallpaper", nargs="?", help="path to the wallpaper picture")
    parser.add_argument("--name")
    parser.add_argument("--number", type=int)
    parser.add_argument("--out-dir")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check", metavar="SPEC", help="check a listing spec for anything left to fill")
    args = parser.parse_args()
    if args.check:
        problems = check(args.check)
        print("\n".join(f"- {p}" for p in problems) if problems else "ok: nothing left to fill")
        return 1 if problems else 0
    if not args.wallpaper:
        parser.error("give the path to the wallpaper (or --check SPEC)")
    try:
        create(args.wallpaper, args.name, args.number, args.out_dir, args.force)
    except (FileNotFoundError, FileExistsError, ValueError) as exc:
        print(exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
