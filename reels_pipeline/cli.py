"""
Command line entry for the reels pipeline (no server needed).

  py -3.12 -X utf8 -m reels_pipeline.cli images --spec specs/listing45_interiors.json --dry-run
  py -3.12 -X utf8 -m reels_pipeline.cli images --spec specs/listing45_interiors.json --models nano-banana-2-1
  py -3.12 -X utf8 -m reels_pipeline.cli images --spec ... --models nano-banana-2,nano-banana-2-1 --cards l45_scene_01_sleep_daybed

`--dry-run` builds the prompts and validates the KIE request locally, prints the credit estimate,
and calls nothing paid.
"""

import argparse
import json
import sys
from pathlib import Path

from . import kie_capabilities as caps
from .config import PipelineConfig
from .kie_generator import CREDITS_2K, IMAGE_MODELS, KieNanoBananaGenerator
from .prompts import build_batch_prompts, load_spec


def cmd_images(args: argparse.Namespace) -> int:
    spec_path = Path(args.spec)
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    only = [c.strip() for c in args.cards.split(",")] if args.cards else None

    if args.dry_run:
        spec = load_spec(spec_path)
        cards = [c for c in spec["cards"] if not only or c["id"] in only]
        prompts = build_batch_prompts(cards, aspect_ratio=spec.get("aspect_ratio", "9:16"))
        calls = len(prompts) * len(models)
        credits = sum(CREDITS_2K.get(m, 0) for m in models) * len(prompts)
        print(f"DRY RUN: {len(prompts)} cards x {len(models)} models = {calls} calls, {args.resolution}, "
              f"about {credits} credits (~${credits * 0.005:.2f}). Nothing was sent.")
        for p in prompts:
            print(f"  {p['id']}: {len(p['prompt'])} prompt chars | {p['tags']['keyObject']} | {p['tags']['cameraAngle'][:40]}")
        return 0

    gen = KieNanoBananaGenerator()
    results = gen.generate_from_spec(spec_path, models=models, only=only, resolution=args.resolution, overwrite=args.overwrite)
    failed = [r for r in results if not r.get("ok")]
    for r in results:
        mark = "OK  " if r.get("ok") else "FAIL"
        print(f"{mark} {r['scene_id']} {r['model']} -> {Path(r['out_path']).name} "
              f"credits={r.get('credits_spent')} {r.get('duration_s', '')}s {r.get('error') or r.get('skipped') or ''}")
    print(json.dumps({"ok": len(results) - len(failed), "failed": len(failed)}))
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="reels_pipeline.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    p_img = sub.add_parser("images", help="generate interior images from a spec (KIE Nano Banana)")
    p_img.add_argument("--spec", required=True)
    p_img.add_argument("--models", default=IMAGE_MODELS[0], help="comma list of: " + ", ".join(IMAGE_MODELS))
    p_img.add_argument("--cards", default="", help="comma list of card ids (default: all)")
    p_img.add_argument("--resolution", default="2K", choices=caps.choices(IMAGE_MODELS, "resolution"))  # KIE's own schema
    p_img.add_argument("--overwrite", action="store_true")
    p_img.add_argument("--dry-run", action="store_true")
    p_img.set_defaults(func=cmd_images)
    args = parser.parse_args()
    PipelineConfig.load_env()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
