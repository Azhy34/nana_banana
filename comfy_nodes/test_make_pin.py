"""Offline tests of the retargeting pin (scripts/make_pin.py, specs/retarget_messages.json): a ready picture + one message, text laid by code.
No model, no credits, nothing uploaded. Skipped when the website project (fonts, facts) is not next to this repository.

Run: py -3.12 -X utf8 -m pytest comfy_nodes/test_make_pin.py -q
"""

import importlib.util
import json
from pathlib import Path

import pytest
from PIL import Image

from reels_pipeline import destinations

ROOT = Path(__file__).resolve().parent.parent
HUB = (ROOT / "../Etsy").resolve()
pytestmark = pytest.mark.skipif(not (HUB / "site" / "design" / "fonts").is_dir(), reason="the website project nocode/Etsy is not next to this repository")


@pytest.fixture(scope="module")
def pin_script():
    spec = importlib.util.spec_from_file_location("make_pin_module", ROOT / "scripts" / "make_pin.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_a_wide_photo_becomes_a_2to3_pin_with_the_label_and_the_two_texts(pin_script, tmp_path, monkeypatch):
    monkeypatch.setattr(pin_script, "FONT_CACHE", tmp_path / "fonts")                     # notes and the font cache stay in the temp folder
    monkeypatch.setattr(pin_script, "NOTES", tmp_path / "notes")
    photo = tmp_path / "wide.png"
    Image.new("RGB", (1448, 1086), (200, 190, 170)).save(photo)                              # a 4:3 picture is not a pin: it is cropped to 2:3
    done = pin_script.make_pin(photo, "rechner", tmp_path / "pin.jpg", focus_x=0.51)
    assert done["size"] == [1000, 1500] and done["ai_label"] == destinations.AI_LABEL_URI
    pin = Image.open(tmp_path / "pin.jpg").convert("RGB")
    assert pin.getpixel((10, 10))[0] > 235 and pin.getpixel((10, 1490))[1] > pin.getpixel((10, 1490))[0], "a light band on top, a sage strip at the bottom"
    top = pin.crop((0, 0, 1000, 275)).convert("L")
    assert min(top.getdata()) < 90, "the dark headline letters are on the light band"
    notes = json.loads((tmp_path / "notes" / "pin.json").read_text(encoding="utf-8"))
    assert "paidsocial" in notes["links"]["ads"] and "organic" in notes["links"]["organic"], "the ad link and the organic link differ in utm_medium"


def test_the_claims_of_every_message_are_backed_by_the_website_and_a_false_one_stops_the_pin(pin_script, tmp_path, monkeypatch):
    data = pin_script.load_messages()
    hub = pin_script.hub_path(data)
    for message_id, message in data["messages"].items():
        assert pin_script.check_facts(message, hub) == [], message_id
    false = {"facts": [{"claim": "free shipping to the moon", "file": "site/feed/product_feed.py", "contains": "Kostenloser Versand zum Mond"}]}
    assert any("free shipping to the moon" in p for p in pin_script.check_facts(false, hub))
    broken = json.loads(json.dumps(data))
    broken["messages"]["rechner"]["facts"] = false["facts"]
    monkeypatch.setattr(pin_script, "load_messages", lambda: broken)                         # the library with the false claim
    with pytest.raises(SystemExit, match="would promise"):
        pin_script.make_pin(tmp_path / "x.png", "rechner", tmp_path / "x.jpg")


def test_the_price_on_the_calculator_card_is_the_price_the_site_gives_and_no_price_means_no_pin(pin_script, tmp_path, monkeypatch):
    monkeypatch.setattr(pin_script, "FONT_CACHE", tmp_path / "fonts")
    monkeypatch.setattr(pin_script, "NOTES", tmp_path / "notes")
    photo = tmp_path / "wide.png"
    Image.new("RGB", (1448, 1086), (200, 190, 170)).save(photo)
    data = pin_script.load_messages()
    hub = pin_script.hub_path(data)
    expected = pin_script.site_quote(hub, 300, 250)["price_eur"]                                  # asked from the rule of the site, never typed here
    done = pin_script.make_pin(photo, "rechner_v2", tmp_path / "v2.jpg")
    notes = json.loads((tmp_path / "notes" / "v2.json").read_text(encoding="utf-8"))
    assert done["price_eur"] == expected == notes["price_on_the_pin"]["price_eur"] and pin_script.euro(expected).endswith(" €")
    pin = Image.open(tmp_path / "v2.jpg").convert("RGB")
    accent = sum(1 for p in pin.crop((545, 1115, 975, 1365)).getdata() if p[0] > 130 and p[1] < 110 and p[2] < 90)
    assert accent > 400, "the price is drawn in the terracotta accent colour on the card"
    frage = pin_script.resolve_message(data, "rechner_frage")                                       # the A/B variant differs only in the headline and its utm_content
    base = pin_script.resolve_message(data, "rechner_v2")
    assert frage["headline"] != base["headline"] and frage["card"] == base["card"] and frage["template"] == base["template"]
    assert "paidsocial" in frage["pin"]["utm_ads"] and frage["pin"]["utm_ads"] != base["pin"]["utm_ads"]

    def no_price(_hub, _w, _h):
        raise ValueError("the calculator gives no price")

    monkeypatch.setattr(pin_script, "site_quote", no_price)
    with pytest.raises(SystemExit, match="would promise"):
        pin_script.make_pin(photo, "rechner_v2", tmp_path / "none.jpg")
    assert not (tmp_path / "none.jpg").exists()
