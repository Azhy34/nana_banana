"""Acceptance tests of the video check (new logic, once): the verdict of a probed file against the Meta Reels video spec. No video file, no network."""

import copy

from reels_pipeline import video_check

SPEC = video_check.spec_of("meta_stories_reels")
GOOD = {"file": "reel.mp4", "container": "mov", "codec": "h264", "profile": "High", "pix_fmt": "yuv420p", "width": 1080, "height": 1920, "fps": 24.0,
        "duration_s": 15.0, "size_bytes": 20_000_000, "bitrate_mbps": 11.0, "color_primaries": 1, "faststart": True,
        "audio": {"codec": "aac", "channels": 2, "sample_rate": 48000, "kbps": 192}}


def levels(info):
    return [line["level"] for line in video_check.verdict(info, SPEC)]


def test_a_file_that_meets_the_spec_has_no_warning_and_no_error():
    assert set(levels(GOOD)) == {"ok"}


def test_the_grok_size_is_a_warning_with_the_crop_hint_and_a_wrong_ratio_an_error():
    grok = dict(GOOD, width=1088)
    lines = video_check.verdict(grok, SPEC)
    assert [l["level"] for l in lines].count("warn") == 1 and "crop 4 px from each side" in lines[0]["text"]
    assert "error" in levels(dict(GOOD, width=1080, height=1080))     # square: Instagram would crop or letterbox it
    assert "error" in levels(dict(GOOD, width=540, height=960))       # below Meta's 600x1067 minimum


def test_bitrate_is_only_ever_a_warning_while_the_spec_breaks_are_errors():
    assert "error" not in levels(dict(GOOD, bitrate_mbps=3.0)) and "warn" in levels(dict(GOOD, bitrate_mbps=3.0))   # Meta publishes no bitrate
    assert "warn" in levels(dict(GOOD, bitrate_mbps=40.0))
    assert "error" in levels(dict(GOOD, pix_fmt="yuv444p"))           # Meta needs 4:2:0
    assert "error" in levels(dict(GOOD, fps=120.0))                   # outside 23-60
    bad_audio = copy.deepcopy(GOOD)
    bad_audio["audio"]["codec"] = "mp3"
    assert "error" in levels(bad_audio)
    assert "warn" in levels(dict(GOOD, audio=None)) and "error" not in levels(dict(GOOD, audio=None))   # a silent source clip is fine
    assert "warn" in levels(dict(GOOD, faststart=False))
