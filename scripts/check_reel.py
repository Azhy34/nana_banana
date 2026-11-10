#!/usr/bin/env python3
"""
Check a finished video against the delivery spec of a destination before it is uploaded (free, offline, no ffmpeg needed).

  py -3.12 -X utf8 scripts/check_reel.py "C:/.../clip.mp4"                       # against meta_stories_reels (Instagram / Facebook Reels, Stories)
  py -3.12 -X utf8 scripts/check_reel.py a.mp4 b.mp4 --dest meta_stories_reels

The spec lives in specs/ad_formats.json (`video` of the destination): what Meta's own help says (a miss is an ERROR) and what
practitioners advise where Meta publishes no number (a miss is a WARN). Exit code 1 when any file has an ERROR.
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reels_pipeline import video_check  # noqa: E402

MARK = {"ok": "ok   ", "warn": "WARN ", "error": "ERROR"}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("files", nargs="+", help="video file(s) to check")
    parser.add_argument("--dest", default="meta_stories_reels", help="destination of specs/ad_formats.json that has a `video` spec")
    args = parser.parse_args(argv)
    try:
        spec = video_check.spec_of(args.dest)
    except ValueError as exc:
        print(exc)
        return 2
    failed = False
    for name in args.files:
        path = Path(name)
        print(f"\n{path.name}  (for {args.dest})")
        try:
            lines = video_check.verdict(video_check.probe(path), spec)
        except Exception as exc:  # noqa: BLE001  an unreadable file is a verdict too, not a crash
            print(f"  ERROR cannot read the file: {exc}")
            failed = True
            continue
        for line in lines:
            print(f"  {MARK[line['level']]} {line['text']}")
        failed = failed or any(line["level"] == "error" for line in lines)
        warns = sum(line["level"] == "warn" for line in lines)
        print(f"  -> {'NOT READY' if any(l['level'] == 'error' for l in lines) else 'ready'}" + (f", {warns} warning(s)" if warns else ""))
    print("\nrules of the advice block: " + "; ".join(video_check.spec_of(args.dest)["advice"]["rules"]))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
