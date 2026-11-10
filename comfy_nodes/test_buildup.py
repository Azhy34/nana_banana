"""Offline tests of scripts/buildup.py (the build-up reel): the paid guard, the free dry run, the source check, the contact sheet.
KIE is replaced by a fake generator: nothing is sent, nothing is spent.

Run: py -3.12 -X utf8 -m pytest comfy_nodes/test_buildup.py -q -m ""
"""

import importlib.util
import json
from pathlib import Path

import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("buildup", ROOT / "scripts" / "buildup.py")
buildup = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(buildup)

SPEC = "t_buildup"
PRICE = 6


class FakeGenerator:
    def __init__(self, balance=100.0, schema_ok=True):
        self.generated, self.checked = [], []
        self._balance, self._schema_ok = balance, schema_ok

    def check_image_request(self, **kw):
        self.checked.append(kw)
        return {"ok": self._schema_ok, "expected_credits": PRICE, "balance": self._balance, "prompt_chars": len(kw["prompt"]),
                "schema_problems": [] if self._schema_ok else ["bad field"]}

    def generate_image(self, **kw):
        self.generated.append(kw)
        Image.new("RGB", (90, 160), (200, 100, 50)).save(kw["out_path"])
        return {"ok": True, "expected_credits": PRICE, "credits_spent": PRICE, "duration_s": 1.5, "error": None}


@pytest.fixture
def env(tmp_path, monkeypatch):
    specs = tmp_path / "specs"
    (specs / "buildup").mkdir(parents=True)
    wallpaper = tmp_path / "wall.png"
    Image.new("RGB", (40, 40)).save(wallpaper)
    (specs / "listing_t.json").write_text(json.dumps({"listing": "L", "wallpaper": str(wallpaper)}), encoding="utf-8")
    scenario = {"id": SPEC, "listing_spec": "listing_t.json", "aspect": "9:16", "resolution": "2K", "model": "nano-banana-2-1",
                "order": ["b1", "b2", "b5"],
                "stages": [{"id": "b5a", "kind": "generate", "layer": "b5", "prompt": "final a"},
                           {"id": "b5b", "kind": "generate", "layer": "b5", "prompt": "final b"},
                           {"id": "b2", "kind": "edit", "layer": "b2", "from": "b5", "prompt": "remove"},
                           {"id": "b1", "kind": "edit", "layer": "b1", "from": "b2", "prompt": "remove more"}]}
    (specs / "buildup" / f"{SPEC}.json").write_text(json.dumps(scenario), encoding="utf-8")
    monkeypatch.setattr(buildup, "SPEC_DIR", specs)
    monkeypatch.setattr(buildup, "RUNS", tmp_path / "runs")
    monkeypatch.setattr(buildup.live_price, "image_credits", lambda model, resolution: PRICE)
    gen = FakeGenerator()
    monkeypatch.setattr(buildup, "make_generator", lambda: gen)
    return gen, tmp_path / "runs" / SPEC


@pytest.mark.core
def test_paid_run_starts_only_with_the_exact_confirmed_quote(env, monkeypatch):
    gen, _ = env
    two = [SPEC, "--stage", "b5a", "--stage", "b5b", "--paid"]
    assert buildup.main(two) == 2 and not gen.generated  # no --confirm: quote and command only
    assert buildup.main(two + ["--confirm", "11"]) == 1 and not gen.generated  # wrong number
    monkeypatch.setattr(buildup.live_price, "image_credits", lambda model, resolution: None)
    assert buildup.main(two + ["--confirm", "12"]) == 1 and not gen.generated  # price cannot be quoted
    monkeypatch.setattr(buildup.live_price, "image_credits", lambda model, resolution: PRICE)
    monkeypatch.setattr(buildup, "make_generator", lambda: FakeGenerator(balance=5.0))  # balance does not cover
    assert buildup.main(two + ["--confirm", "12"]) == 1
    monkeypatch.setattr(buildup, "make_generator", lambda: FakeGenerator(schema_ok=False))  # schema check failed
    assert buildup.main(two + ["--confirm", "12"]) == 1
    monkeypatch.setattr(buildup, "make_generator", lambda: gen)
    assert buildup.main(two + ["--confirm", "12.0"]) == 0
    assert [g["scene_id"] for g in gen.generated] == ["b5a", "b5b"]
    assert all(g["reference_labels"] is False for g in gen.generated)
    assert buildup.main(two + ["--confirm", "12"]) == 1 and len(gen.generated) == 2  # outputs exist: needs --overwrite


def test_dry_run_never_generates_and_prints_the_paid_command(env, capsys):
    gen, out = env
    assert buildup.main([SPEC]) == 0
    text = capsys.readouterr().out
    assert not gen.generated and len(gen.checked) == 2 and not out.exists()
    assert "--stage b5a --stage b5b --paid --confirm 12" in text


def test_edit_stage_without_its_source_refuses_and_names_the_file(env, capsys):
    gen, out = env
    assert buildup.main([SPEC, "--stage", "b2"]) == 2  # no --final: pick one first
    assert "--final" in capsys.readouterr().out
    assert buildup.main([SPEC, "--stage", "b2", "--final", "a", "--paid", "--confirm", "6"]) == 1
    assert str(out / "b5a.png") in capsys.readouterr().out and not gen.generated
    assert buildup.main([SPEC, "--stage", "nope"]) == 2
    out.mkdir(parents=True)  # with the picture in place the edit goes out with it as its only reference
    Image.new("RGB", (90, 160)).save(out / "b5b.png")
    assert buildup.main([SPEC, "--stage", "b2", "--final", "b", "--paid", "--confirm", "6"]) == 0
    assert gen.generated[0]["wallpaper"] == out / "b5b.png" and gen.generated[0]["texture"] is None
    assert json.loads((out / "manifest.json").read_text(encoding="utf-8"))["b2"]["source"] == str(out / "b5b.png")


def test_contact_sheet_builds_with_missing_tiles(env):
    _, out = env
    out.mkdir(parents=True)
    Image.new("RGB", (90, 160), (10, 200, 10)).save(out / "b5a.png")
    assert buildup.main([SPEC, "--sheet"]) == 0
    with Image.open(out / "sheet.jpg") as sheet:
        assert sheet.width > 3 * buildup.TILE_W and sheet.height > 640
