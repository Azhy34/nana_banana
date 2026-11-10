#!/usr/bin/env python3
"""
Can our pipeline use this KIE photo model, and what is the price per size? One command, read-only (no credits):

  py -3.12 -X utf8 scripts/add_model.py seedream/5-pro-image-to-image                 # snapshot its schema, report: ready / blockers / warnings
  py -3.12 -X utf8 scripts/add_model.py <model> --write --tag sd5pro                   # ready: write the three registry lines, run the tests
  py -3.12 -X utf8 scripts/add_model.py <model> --write --tag sd5pro --node MoonbloomKieSeedream5Pro

Source: KIE's own schema GET /api/v1/models/{model}/schema and its live price text. The exact model id is in GET /api/v1/models
(scripts/comfy_node_info.py prices lists the ones we watch). After --write: POST /moonbloom/reload (or run_board.py --reload), then
`comfy_node_info.py card <Node>`, add the model to specs/active_board.json, `run_board.py photos` (a free dry run first).
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reels_pipeline import kie_capabilities, live_price, onboarding  # noqa: E402
from reels_pipeline.config import PipelineConfig  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("model", help="exact KIE model id, e.g. gpt-image-2-image-to-image")
    parser.add_argument("--write", action="store_true", help="when the model is ready: write the registry lines and run the tests")
    parser.add_argument("--tag", help="short file tag of the model (<scene>__<tag>.png), required with --write")
    parser.add_argument("--node", help="node class name (default: MoonbloomKie + the model id in CamelCase)")
    parser.add_argument("--offline", action="store_true", help="use the schema snapshot already in api_truth/kie, ask nothing")
    args = parser.parse_args()
    PipelineConfig.load_env()

    if not args.offline:
        print("schema:", onboarding.snapshot_schema(args.model).relative_to(ROOT))
    try:
        prices = None if args.offline else live_price.image_price_table(args.model)
    except Exception as exc:  # a price that cannot be read is reported, it does not stop the report
        prices, print_note = None, f"price not read: {type(exc).__name__}"
        print(print_note)
    report = onboarding.assess(args.model, prices)
    s = report["summary"]
    print(f"\n{args.model}")
    print(f"  prompt: up to {s['prompt']['max_chars']} characters | negative prompt: {s['prompt']['negative_prompt'][:60]}")
    print(f"  references: field {s['references']['field']!r}, up to {s['references']['max']} | required: {s['required']}")
    print(f"  aspect ratios: {s['aspect_ratios']}")
    print(f"  sizes: {s['resolutions']}")
    print(f"  price (credits per picture): {prices if prices is not None else 'not asked'}   (1 credit = $0.005; 2K minimum)")
    for line in report["blockers"]:
        print("  BLOCKER:", line)
    for line in report["warnings"]:
        print("  warning:", line)
    print("  VERDICT:", "READY (the node factory can build it)" if report["ready"] else "NOT READY (see the blockers)")

    node = args.node or onboarding.node_class_for(args.model)
    if not args.write:
        if report["ready"]:
            print(f"\nto register it: add_model.py {args.model} --write --tag <short tag> [--node {node}]")
        return 0 if report["ready"] else 1
    if not report["ready"]:
        print("refusing to write: the model is not ready")
        return 1
    if not args.tag:
        print("--write needs --tag (the short file tag, e.g. sd5pro): a tag identifies one model, I do not guess it")
        return 2
    refresh, generator = ROOT / "api_truth" / "refresh_api_truth.py", ROOT / "reels_pipeline" / "kie_generator.py"
    new = onboarding.register(refresh.read_text(encoding="utf-8"), generator.read_text(encoding="utf-8"), args.model, node, args.tag)
    refresh.write_text(new["kie_models"], encoding="utf-8")
    generator.write_text(new["generator"], encoding="utf-8")
    print(f"\nregistered: node {node}, file tag {args.tag}: edited {refresh.name} (KIE_MODELS) and {generator.name} (MODEL_TAG, OTHER_IMAGE_NODES)")
    tests = subprocess.run([sys.executable, "-X", "utf8", "-m", "pytest", "comfy_nodes", "api_discovery/kie_kling", "-q", "-x",
                            "--deselect", "comfy_nodes/test_capabilities.py::test_the_snapshot_copy_knows_all_of_our_nodes"],
                           cwd=ROOT, capture_output=True, text=True)
    print("tests:", (tests.stdout.strip().splitlines() or ["(no output)"])[-1])
    print("next: run_board.py photos --reload | comfy_node_info.py card", node, "| then api_truth/refresh_api_truth.py --only comfy")
    return 0 if tests.returncode == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
