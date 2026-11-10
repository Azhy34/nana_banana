"""
Build-up reel: ONE room, ONE camera, layers appear one by one (scenario: specs/buildup/<id>.json).
The final frame is generated first (b5a / b5b), the earlier layers are made from it by removing one layer at a time.

  py -3.12 -X utf8 scripts/buildup.py l11_buildup01                      # FREE dry run: schema check, live price, balance
  py -3.12 -X utf8 scripts/buildup.py l11_buildup01 --stage b5a --stage b5b --paid --confirm 12
  py -3.12 -X utf8 scripts/buildup.py l11_buildup01 --final a --stage b4 --paid --confirm 6
  py -3.12 -X utf8 scripts/buildup.py l11_buildup01 --sheet              # contact sheet only

Pictures: runs/<id>/<stage>.png, manifest.json, sheet.jpg. Paid only with --paid AND --confirm N equal to the live quote
of the selected stages; stages run one by one, the first failure stops the run, nothing is retried.
Exit codes: 0 ok, 1 a stage failed or a guard refused, 2 bad call.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reels_pipeline import live_price  # noqa: E402
from reels_pipeline.board_run import check_confirm  # noqa: E402
from reels_pipeline.config import PipelineConfig  # noqa: E402

SPEC_DIR = ROOT / "specs"
RUNS = ROOT / "runs"
TILE_W = 360


class CallError(Exception):
    """A bad call (unknown stage, missing --final): exit code 2."""


class Refused(Exception):
    """A guard said no: exit code 1."""


def make_generator():
    from reels_pipeline.kie_generator import KieImageGenerator

    return KieImageGenerator()


def load_scenario(spec_id: str) -> Dict[str, Any]:
    path = SPEC_DIR / "buildup" / f"{spec_id}.json"
    if not path.is_file():
        raise CallError(f"no scenario {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_listing(scenario: Dict[str, Any]) -> Dict[str, Any]:
    return json.loads((SPEC_DIR / scenario["listing_spec"]).read_text(encoding="utf-8"))


def picture_path(out_dir: Path, name: str, final: Optional[str]) -> Path:
    """The file of a layer or stage name; the layer b5 is the chosen final b5<a|b>."""
    return out_dir / (f"b5{final}.png" if name == "b5" and final else f"{name}.png")


def source_of(stage: Dict[str, Any], out_dir: Path, final: Optional[str]) -> Optional[Path]:
    if stage["kind"] != "edit":
        return None
    if stage["from"] == "b5" and not final:
        raise CallError(f"stage {stage['id']} starts from the chosen final: run b5a/b5b first and pick one: --final a (or --final b)")
    return picture_path(out_dir, stage["from"], final)


def select_stages(scenario: Dict[str, Any], wanted: List[str], out_dir: Path, final: Optional[str]) -> List[Dict[str, Any]]:
    stages = scenario["stages"]
    known = {s["id"] for s in stages}
    unknown = [w for w in wanted if w not in known]
    if unknown:
        raise CallError(f"unknown stage {', '.join(unknown)}; the scenario has: {', '.join(s['id'] for s in stages)}")
    if wanted:
        return [s for s in stages if s["id"] in wanted]
    runnable = []
    for s in stages:  # default: what can run now (edit stages only when their source picture exists)
        src = source_of(s, out_dir, final) if (s["kind"] == "generate" or final or s["from"] != "b5") else None
        if s["kind"] == "generate" or (src and src.is_file()):
            runnable.append(s)
    return runnable


def check_stage(gen, stage: Dict[str, Any], scenario: Dict[str, Any]) -> Dict[str, Any]:
    try:
        return gen.check_image_request(
            prompt=stage["prompt"], model=scenario["model"], resolution=scenario["resolution"], aspect_ratio=scenario["aspect"],
            with_texture=stage["kind"] == "generate", reference_labels=False,
        )
    except Exception as exc:  # a pydantic or schema failure is a failed check, not a crash
        return {"ok": False, "expected_credits": None, "balance": None, "prompt_chars": len(stage["prompt"]),
                "schema_problems": [f"{type(exc).__name__}: {exc}"]}


def paid_command(spec_id: str, stages: List[Dict[str, Any]], final: Optional[str], quote: float, overwrite: bool) -> str:
    parts = ["py -3.12 -X utf8 scripts/buildup.py", spec_id] + [f"--stage {s['id']}" for s in stages]
    if final:
        parts.append(f"--final {final}")
    if overwrite:
        parts.append("--overwrite")
    return " ".join(parts + [f"--paid --confirm {quote:g}"])


def write_manifest(out_dir: Path, entry: Dict[str, Any]) -> None:
    path = out_dir / "manifest.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    data[entry["stage"]] = entry
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def build_sheet(scenario: Dict[str, Any], out_dir: Path, final: Optional[str]) -> Optional[Path]:
    from PIL import Image, ImageDraw

    w, h = (int(x) for x in scenario["aspect"].split(":"))
    tile_h = round(TILE_W * h / w)
    tiles = []
    for layer in scenario["order"]:
        path = picture_path(out_dir, layer, final)
        if layer == "b5" and not final:
            path = next((p for p in (out_dir / "b5a.png", out_dir / "b5b.png") if p.is_file()), path)
        tile = Image.new("RGB", (TILE_W, tile_h), (110, 110, 110))
        if path.is_file():
            with Image.open(path) as im:
                tile = im.convert("RGB").resize((TILE_W, round(im.height * TILE_W / im.width)))
        tiles.append((path.stem, tile))
    height = max(t.height for _, t in tiles)
    sheet = Image.new("RGB", (TILE_W * len(tiles) + 10 * (len(tiles) + 1), height + 40), (30, 30, 30))
    draw, x = ImageDraw.Draw(sheet), 10
    for label, tile in tiles:
        sheet.paste(tile, (x, 8))
        draw.text((x, height + 16), label, fill=(255, 255, 255))
        x += TILE_W + 10
    out = out_dir / "sheet.jpg"
    out_dir.mkdir(parents=True, exist_ok=True)
    sheet.save(out, quality=86)
    return out


def run_stage(gen, stage: Dict[str, Any], scenario: Dict[str, Any], listing: Dict[str, Any], out_dir: Path, source: Optional[Path]) -> Dict[str, Any]:
    texture = None
    if stage["kind"] == "generate" and listing.get("texture") and (ROOT / listing["texture"]).is_file():
        texture = ROOT / listing["texture"]
    wallpaper = source if source else Path(listing["wallpaper"])
    out_path = out_dir / f"{stage['id']}.png"
    rec = gen.generate_image(
        prompt=stage["prompt"], wallpaper=wallpaper, out_path=out_path, model=scenario["model"], texture=texture,
        aspect_ratio=scenario["aspect"], resolution=scenario["resolution"], listing=listing.get("listing", ""),
        scene_id=stage["id"], reference_labels=False,
    )
    write_manifest(out_dir, {
        "stage": stage["id"], "layer": stage["layer"], "model": scenario["model"], "ok": bool(rec.get("ok")),
        "credits_expected": rec.get("expected_credits"), "credits_billed": rec.get("credits_spent"),
        "seconds": rec.get("duration_s"), "file": str(out_path) if rec.get("ok") else None,
        "source": str(source) if source else None, "error": rec.get("error"),
    })
    return rec


def run(args) -> int:
    scenario = load_scenario(args.spec)
    listing = load_listing(scenario)
    # new pictures go into the listing folder next to the wallpaper (owner 10.11); runs/<id>/ only when the listing has no usable out_dir
    listing_dir = Path(listing["out_dir"]) if listing.get("out_dir") else None
    out_dir = listing_dir / "build-up" if (listing_dir and listing_dir.is_dir()) else RUNS / scenario["id"]
    stages = select_stages(scenario, args.stage or [], out_dir, args.final)
    sheet_only = args.sheet and not args.stage and not args.paid
    if sheet_only:
        print(f"contact sheet: {build_sheet(scenario, out_dir, args.final)}")
        return 0
    if not stages:
        raise CallError("no stage can run now; pick stages with --stage ID")
    sources = {s["id"]: source_of(s, out_dir, args.final) for s in stages}
    missing = [f"{s['id']} needs {p}" for s in stages if (p := sources[s["id"]]) and not p.is_file()]
    if missing:
        raise Refused("source picture missing: " + "; ".join(missing))
    if not Path(listing["wallpaper"]).is_file() and any(s["kind"] == "generate" for s in stages):
        raise Refused(f"wallpaper file not found: {listing['wallpaper']}")

    gen = make_generator()
    checks = {s["id"]: check_stage(gen, s, scenario) for s in stages}
    prices = {s["id"]: live_price.image_credits(scenario["model"], scenario["resolution"]) for s in stages} if args.paid else {
        s["id"]: checks[s["id"]].get("expected_credits") for s in stages}
    unpriced = [i for i, p in prices.items() if p is None]
    quote = None if unpriced else sum(prices.values())
    balance = next((c["balance"] for c in checks.values() if c.get("balance") is not None), None)

    print(f"{'stage':<6}{'kind':<10}{'schema':<8}{'credits':<9}prompt chars")
    for s in stages:
        c = checks[s["id"]]
        print(f"{s['id']:<6}{s['kind']:<10}{'ok' if c.get('ok') else 'FAIL':<8}{str(prices[s['id']]):<9}{c.get('prompt_chars')}")
        for problem in c.get("schema_problems") or []:
            print(f"   schema: {problem}")
    print(f"sum: {quote if quote is not None else 'cannot be quoted'} credits | balance: {balance if balance is not None else 'unknown'}")
    exists = [s["id"] for s in stages if (out_dir / f"{s['id']}.png").is_file()]
    if exists:
        print(f"already on disk: {', '.join(exists)} (paid run needs --overwrite)")

    if not args.paid:
        if quote is not None and all(c.get("ok") for c in checks.values()):
            print("next (paid): " + paid_command(scenario["id"], stages, args.final, quote, bool(exists)))
        if args.sheet:
            print(f"contact sheet: {build_sheet(scenario, out_dir, args.final)}")
        return 0

    if quote is None:
        raise Refused(f"no price can be quoted for {', '.join(unpriced)}: refusing to pay")
    bad = [s["id"] for s in stages if not checks[s["id"]].get("ok")]
    if bad:
        raise Refused(f"the request does not fit KIE's schema for {', '.join(bad)}: nothing was started")
    if exists and not args.overwrite:
        raise Refused(f"output exists for {', '.join(exists)}: add --overwrite to replace it")
    if quote <= 0:
        raise Refused(f"the live quote is {quote:g} credits, which cannot be right: refusing to pay")
    command = paid_command(scenario["id"], stages, args.final, quote, args.overwrite)
    problem = check_confirm(quote, args.confirm)
    if problem:
        print(problem)
        print("run: " + command)
        return 2 if args.confirm is None else 1
    if balance is None or balance < quote:
        raise Refused(f"the balance ({balance if balance is not None else 'unknown'}) does not cover {quote:g} credits")

    out_dir.mkdir(parents=True, exist_ok=True)
    code = 0
    for s in stages:
        rec = run_stage(gen, s, scenario, listing, out_dir, sources[s["id"]])
        if rec.get("ok"):
            print(f"{s['id']}: ok, billed {rec.get('credits_spent')} credits, {rec.get('duration_s')} s -> {out_dir / (s['id'] + '.png')}")
        else:
            print(f"{s['id']}: FAILED: {rec.get('error')} (stopped; the next stages were not started)")
            code = 1
            break
    print(f"contact sheet: {build_sheet(scenario, out_dir, args.final)}")
    return code


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("spec", help="scenario id, e.g. l11_buildup01 (specs/buildup/<id>.json)")
    parser.add_argument("--stage", action="append", help="stage id (repeatable); default: the stages that can run now")
    parser.add_argument("--final", choices=["a", "b"], help="which final is chosen (b5a or b5b): the source of the edit chain")
    parser.add_argument("--paid", action="store_true", help="really pay; needs --confirm N")
    parser.add_argument("--confirm", type=float, default=None, help="the credit number; must equal the live quote of the selected stages")
    parser.add_argument("--overwrite", action="store_true", help="allow a paid stage to replace an existing picture")
    parser.add_argument("--sheet", action="store_true", help="write runs/<id>/sheet.jpg from the pictures on disk")
    args = parser.parse_args(argv)
    PipelineConfig.load_env()
    try:
        return run(args)
    except CallError as exc:
        print(exc)
        return 2
    except Refused as exc:
        print(f"refused: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
