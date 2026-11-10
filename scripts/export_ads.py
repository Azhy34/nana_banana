#!/usr/bin/env python3
"""
The delivery package of a set: from the finished frames of a set to the files each platform takes, and a manifest that says what every file
is for and where it goes. FREE and LOCAL: it never calls KIE, never spends credits and never uploads anything (the upload to the ad
accounts is a separate step that is not built). Without --write it only shows the plan.

For every finished frame (`<card id>__<model tag>.png` in the listing's out_dir) and every destination it serves (the pair's `for`, or the
destinations that ask for the frame's ratio, specs/ad_formats.json) it checks the exact ratio, the minimum pixels and the file limit,
and with --write cuts `exports/<listing>/<destination>/<article>__<card>__<destination>__<W>x<H>.jpg`: exact ratio (a centre crop only where
the destination allows it, e.g. 1.91:1 from 16:9), JPEG, the IPTC DigitalSourceType "trainedAlgorithmicMedia" label Google Merchant asks for
every AI-made image (written and read back; no label = no file), plus `exports/<listing>/manifest.json`.

  py -3.12 -X utf8 scripts/export_ads.py --registry                      # every destination: ratio, why, where it goes, how
  py -3.12 -X utf8 scripts/export_ads.py l2_carousel01                   # the plan: which frame serves which destination, does it fit
  py -3.12 -X utf8 scripts/export_ads.py l2_carousel01 --model nb21      # only the frames made by one model (a frame made by two needs this)
  py -3.12 -X utf8 scripts/export_ads.py l2_carousel01 --dest meta_feed_ad --write

Exit 1 when a frame does not fit a destination or a file could not be written; a frame that is not generated yet is only reported.
"""

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reels_pipeline import destinations, director  # noqa: E402

EXPORTS = ROOT / "exports"


def cmd_registry() -> int:
    for dest_id, d in destinations.registry().items():
        print(f"{destinations.describe(dest_id)}  [{d['status']}]" + (f"  generate as {d['generate_as']}" if d["generate_as"] != d["ratio"] else ""))
        print(f"    why:     {d['why']}\n    goes to: {d['goes_to']}\n    how:     {d['how']}")
    problems = destinations.registry_problems()
    for line in problems:
        print("PROBLEM:", line)
    return 1 if problems else 0


def _sources(out_dir: Path, card_id: str, tag: str):
    found = sorted(p for p in out_dir.glob(f"{card_id}__*") if p.suffix.lower() in (".png", ".jpg", ".jpeg"))
    return [p for p in found if p.stem.endswith(f"__{tag}")] if tag else found


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _manifest_entry(set_id: str, card: dict, dest_id: str, source: Path, result: dict) -> dict:
    d = destinations.registry()[dest_id]
    from reels_pipeline.kie_generator import find_prompt_log

    sidecar = find_prompt_log(source)
    facts = json.loads(sidecar.read_text(encoding="utf-8")) if sidecar else {}
    from PIL import Image

    with Image.open(source) as im:
        source_px = [im.width, im.height]
    return {
        "file": str(Path(result["path"]).relative_to(ROOT)).replace("\\", "/"), "platform": d["tag"], "destination": dest_id, "ratio": d["ratio"],
        "size": result["size"], "bytes": result["bytes"], "sha256": result["sha256"], "cropped": result["cropped"], "ai_label": result["ai_label"],
        "why": d["why"], "goes_to": d["goes_to"], "how": d["how"], "status": d["status"],
        "set": set_id, "card": card["id"], "model": facts.get("model"), "resolution": facts.get("resolution"),
        "prompt_file": str(sidecar) if sidecar else None,
        "source": {"file": str(source), "px": source_px, "sha256": _sha(source)},
        "exported_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("set", nargs="?", help="a set of specs/sets (reel or carousel)")
    parser.add_argument("--dest", action="append", help="only this destination (repeatable); default: the destinations of each frame")
    parser.add_argument("--model", default="", help="model tag of the frames to take, e.g. nb21 (needed when a frame was made by two models)")
    parser.add_argument("--write", action="store_true", help="write the files and the manifest (default: only the plan)")
    parser.add_argument("--registry", action="store_true", help="print the destinations and exit")
    args = parser.parse_args(argv)
    if args.registry:
        return cmd_registry()
    if not args.set:
        parser.error("name a set (or use --registry)")
    plan = director.plan_set(args.set)
    if plan["problems"]:
        print("the set has problems, run `director.py plan` first:", *plan["problems"][:3], sep="\n  - ")
        return 1
    set_spec = director.load_set(args.set)
    listing_file = director.SPECS / set_spec["listing_spec"]
    listing = json.loads(listing_file.read_text(encoding="utf-8"))
    out_dir = Path(listing["out_dir"])
    article = listing.get("article", "")
    slug = listing_file.stem.split("_")[0]
    print(f"set {args.set} | {listing.get('listing')} {('(' + article + ')') if article else '(no `article` in the listing spec)'} | frames in {out_dir}")
    refused, written, entries = 0, 0, {}
    for card in plan["cards"]:
        serves = (card.get("reel") or {}).get("serves") or destinations.serving(card["aspectRatio"])
        wanted = args.dest or serves
        found = _sources(out_dir, card["id"], args.model)
        if not found:
            print(f"  {card['id']}: not generated yet" + (f" (no frame of model {args.model})" if args.model else ""))
            continue
        if len(found) > 1:
            print(f"  {card['id']}: {len(found)} frames {[p.name for p in found]}: name the model with --model <tag>")
            refused += 1
            continue
        source = found[0]
        from PIL import Image

        with Image.open(source) as im:
            width, height = im.size
        print(f"  {card['id']}  {source.name}  {width}x{height}")
        for dest_id in wanted:
            try:
                verdict = destinations.fit(dest_id, width, height)
            except ValueError as exc:
                print(f"      {dest_id}: {exc}")
                refused += 1
                continue
            name = destinations.export_name(card["id"], dest_id, verdict["size"], article)
            target = EXPORTS / slug / dest_id / name
            if not verdict["ok"]:
                print(f"      {destinations.describe(dest_id)}: NO  {'; '.join(verdict['problems'])}")
                refused += 1
                continue
            note = ("  [" + "; ".join(verdict["notes"]) + "]") if verdict["notes"] else ""
            print(f"      {destinations.describe(dest_id)}: ok -> {target.relative_to(ROOT)}{note}")
            if args.write:
                try:
                    result = destinations.render(source, dest_id, target)
                except ValueError as exc:
                    print(f"        REFUSED: {exc}")
                    refused += 1
                    continue
                entries[name] = _manifest_entry(args.set, card, dest_id, source, result)
                written += 1
    if args.write and entries:
        manifest_path = EXPORTS / slug / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {"items": {}}
        manifest.update({"listing": listing.get("listing"), "article": article, "note": "what every delivery file is for and where it goes; nothing is uploaded by this command"})
        manifest["items"].update(entries)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"manifest: {manifest_path.relative_to(ROOT)} ({len(manifest['items'])} files)")
    print(f"{written} files written" if args.write else "plan only: nothing written (add --write)", f"| {refused} refused" if refused else "")
    return 1 if refused else 0


if __name__ == "__main__":
    raise SystemExit(main())
