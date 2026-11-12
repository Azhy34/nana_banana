#!/usr/bin/env python3
"""
Lock the mural of a finished clip (free, local, no credits): every frame outside the motion zone becomes the first frame (reels_pipeline/mural_lock.py).
For a clip shot with a LOCKED camera. The zone is a polygon (or a rectangle) in fractions of the frame, x to the right, y down.

  py -3.12 -X utf8 scripts/lock_clip.py raw.mp4 locked.mp4 --zone "0.26,0.62,0.83,0.85"
  py -3.12 -X utf8 scripts/lock_clip.py raw.mp4 locked.mp4 --zone "[[0.27,0.62],[0.47,0.62],[0.5,0.75],[0.84,0.75],[0.84,0.85],[0.27,0.85]]"
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reels_pipeline import mural_lock  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("raw")
    parser.add_argument("out")
    parser.add_argument("--zone", required=True, help="x0,y0,x1,y1 or a JSON list of [x, y] points, fractions of the frame")
    args = parser.parse_args()
    try:
        report = mural_lock.lock_clip(Path(args.raw), Path(args.out), args.zone)
    except (ValueError, OSError) as exc:
        print(exc)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
