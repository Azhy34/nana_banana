#!/usr/bin/env python3
"""
A FREE living photo of a room: only the light moves inside a zone (reels_pipeline/light_drift.py). No model, no credits; the wall cannot move.

  py -3.12 -X utf8 scripts/light_drift.py photo.png out.mp4 --zone "[[0.22,0.8],[0.5,0.75],[0.76,0.7],[1,0.71],[1,1],[0.22,1]]" [--drift 80] [--dust 70] [--push 1.22] [--seed 1]
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reels_pipeline import light_drift  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("photo")
    parser.add_argument("out")
    parser.add_argument("--zone", required=True)
    parser.add_argument("--seconds", type=float, default=5.0)
    parser.add_argument("--drift", type=float, default=80.0, help="pixels the patches of light travel")
    parser.add_argument("--dust", type=int, default=70)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--push", type=float, default=1.22, help="final scale of the camera flight into the room (1.0 = the camera stays)")
    parser.add_argument("--focus", default="0.95,0.5", help="x,y (fractions) of the point the camera flies toward")
    args = parser.parse_args()
    try:
        report = light_drift.make_clip(Path(args.photo), Path(args.out), args.zone, args.seconds, drift_px=args.drift, dust=args.dust, seed=args.seed,
                                         push=args.push, focus=tuple(float(v) for v in args.focus.split(",")))
    except (ValueError, OSError) as exc:
        print(exc)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
