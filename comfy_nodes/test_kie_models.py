"""Offline tests (no ComfyUI, no KIE, no credits) of the KIE photo models: the request built from KIE's own schema, the live price
at every size, the node of each model, the bridge quote, one generator for every model, the model comparison board.

Run: py -3.12 -X utf8 -m pytest comfy_nodes -q
"""

import importlib.util
import json
import math
from pathlib import Path
from types import SimpleNamespace as NS

import pytest
from PIL import Image

from comfy_nodes import bridge_logic
from comfy_nodes import moonbloom_nodes as nodes
from reels_pipeline import kie_capabilities as caps
from reels_pipeline import kie_generator, live_price
from reels_pipeline.kie_generator import MODEL_TAG, NODE_OF_MODEL, OTHER_IMAGE_MODELS, OTHER_IMAGE_NODES

ROOT = Path(__file__).resolve().parent.parent
BANANA, GPT, GROK = "nano-banana-2-1", "gpt-image-2-image-to-image", "grok-imagine-image-2-0/image-edit"
CARD = "l45_scene_14_baby_quiet_corner_23"

# The price texts of the live KIE catalog (06.11), word for word.
PRICE_TEXTS = {
    BANANA: "4 credits ($0.02) for 1K, 6 credits ($0.03) for 2K, and 9 credits ($0.045) for 4K — 1K/2K 40% and 4K 60% below official pricing.",
    GPT: "GPT-2 Image — now just 6 credits ($0.03) for 1 K, 10 credits ($0.05) for 2 K, and 16 credits ($0.08) for 4 K. High-tier top-ups (+10% bonus).",
    GROK: "4 credits per image (= $0.02), approximately 67% cheaper than the official price ($0.06/image).",
    "nano-banana-pro": "18 credits (~$0.09) for 1K/2K and 24 credits (~$0.12) for 4K—flat rate up to 50 % below official pricing.",
    "seedream/5-pro-image-to-image": "1K: 7 credits per image ($0.035), 2K: 14 credits per image ($0.07). Input images cost 0.5 credits each.",
    "qwen3/pro-image-to-image": "Qwen Image 3.0 Pro image to image costs 6.4 credits per image (≈ $0.032) for 1K output and 12 credits per image (≈ $0.06) for 2K output.",
    "flux-3/klein-edit-image": "FLUX 3 Klein Edit Image is priced at 1.6 credits per 1K image (≈ $0.008), 2.5 credits per 2K image (≈ $0.0125) and 6.5 credits per 4K image.",
    "gpt-image-2-6/economy-image-to-image": "GPT Image 2.6 (Economy) — just 5 credits ($0.025) per 1K image. Same model, flat per-image price, 1K only.",
    "gpt-image-2-6/flare-image-to-image": "Text input 900 credits / 1M tokens ($4.50), image input 1,440 ($7.20), image output 5,400 ($27.00) — 10% below official pricing.",
    "wan/2-7-image-pro": "WAN-2.7 Image Pro costs 12 credits per image (≈ $0.06), while WAN-2.7 Image costs 4.8 credits per image (≈ $0.024).",
}


def _builder():
    spec = importlib.util.spec_from_file_location("build_comfy_workflows", ROOT / "scripts" / "build_comfy_workflows.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def kie_prices(monkeypatch):
    """No network: requests.get answers the price endpoint with the typed envelope built from PRICE_TEXTS (a test may change a text)."""
    texts = dict(PRICE_TEXTS)

    def fake_get(url, headers=None, **kwargs):
        model = next((m for m in sorted(texts, key=len, reverse=True) if f"/models/{m}/price" in url), None)
        body = {"code": 200, "msg": "success", "data": {"pricingDesc": texts[model]}} if model else {"code": 404, "msg": "no such model", "data": None}
        return NS(json=lambda: body)

    monkeypatch.setattr("requests.get", fake_get)
    monkeypatch.setattr("time.sleep", lambda s: None)
    return texts


# ------------------------------------------------------------------ the request comes from KIE's schema

@pytest.mark.core
def test_the_request_is_built_from_the_schema_and_has_only_the_fields_the_model_has():
    refs = ["https://cdn/a.png", "https://cdn/b.jpg"]
    banana = caps.build_input(BANANA, "P", refs, "2:3", "2K", "png")
    gpt = caps.build_input(GPT, "P", refs, "2:3", "2K", "png")
    grok = caps.build_input(GROK, "P", refs, "2:3", None, "png")
    assert banana == {"prompt": "P", "image_input": refs, "aspect_ratio": "2:3", "resolution": "2K", "output_format": "png"}
    assert gpt == {"prompt": "P", "input_urls": refs, "aspect_ratio": "2:3", "resolution": "2K"}          # no output_format field in its schema
    assert grok == {"prompt": "P", "image_urls": refs, "aspect_ratio": "2:3"}                              # no resolution, no output_format
    assert caps.build_input(GROK, "P", refs, "2:3", "2K", "png") == grok                                    # asked for a size it does not have: left out
    for model, body in ((BANANA, banana), (GPT, gpt), (GROK, grok)):
        assert caps.validate_input(model, body) == []
    assert caps.ref_field(BANANA) == "image_input" and caps.ref_field(GPT) == "input_urls" and caps.ref_field(GROK) == "image_urls"


@pytest.mark.core
def test_the_validator_catches_what_kie_would_reject():
    problems = caps.validate_input(GROK, {"prompt": "x" * 8001, "image_urls": ["u"] * 6, "aspect_ratio": "4:3", "resolution": "2K"})
    text = " | ".join(problems)
    assert "takes at most 5" in text and "'4:3' is not one of" in text and "'resolution' is not a field" in text and "at most 8000" in text
    assert "required field 'aspect_ratio' is missing" in " ".join(caps.validate_input(GROK, {"prompt": "p", "image_urls": ["u"]}))
    assert caps.validate_input(GPT, {"prompt": "x" * 20001, "input_urls": ["u"]}) == ["the prompt has 20001 characters, the model takes at most 20000"]
    assert caps.validate_input(GPT, {"prompt": "p", "input_urls": ["u"] * 17}) == ["input_urls has 17 items, the model takes at most 16"]


def test_the_summary_answers_what_the_owner_asks_about_a_model():
    gpt, grok, banana = caps.summary(GPT), caps.summary(GROK), caps.summary(BANANA)
    assert gpt["prompt"]["max_chars"] == 20000 and grok["prompt"]["max_chars"] == 8000 and banana["prompt"]["max_chars"] == 20000
    for info in (gpt, grok, banana):
        assert info["prompt"]["negative_prompt"] == caps.NO_NEGATIVE                                        # none of the three has a negative field
    assert gpt["resolutions"] == ["1K", "2K", "4K"] and banana["resolutions"] == ["1K", "2K", "4K"] and grok["resolutions"] == caps.NO_RESOLUTION
    assert gpt["references"] == {"field": "input_urls", "max": 16} and grok["references"] == {"field": "image_urls", "max": 5}
    assert {"2:3", "4:3", "9:16"} <= set(gpt["aspect_ratios"]) and "4:3" not in grok["aspect_ratios"]
    assert "background" in gpt["other_fields"] and gpt["required"] == ["prompt"] and grok["required"] == ["image_urls", "aspect_ratio"]


# ------------------------------------------------------------------ the price at every size, live

@pytest.mark.core
def test_the_price_parser_reads_every_wording_of_the_live_catalog():
    table = lambda m: live_price.parse_price_table(PRICE_TEXTS[m])  # noqa: E731
    assert table(BANANA) == {"1K": 4, "2K": 6, "4K": 9} and table(GPT) == {"1K": 6, "2K": 10, "4K": 16}
    assert table("nano-banana-pro") == {"1K": 18, "2K": 18, "4K": 24}
    assert table("seedream/5-pro-image-to-image") == {"1K": 7, "2K": 14}
    assert table("qwen3/pro-image-to-image") == {"1K": 6.4, "2K": 12}                                       # two prices in one sentence: not the first as a flat price
    assert table("flux-3/klein-edit-image") == {"1K": 1.6, "2K": 2.5, "4K": 6.5}
    assert table("gpt-image-2-6/economy-image-to-image") == {"1K": 5}
    assert table(GROK) == {"*": 4}
    assert live_price.parse_image(PRICE_TEXTS[GROK], None) == 4 and live_price.parse_image(PRICE_TEXTS[GROK], "2K") == 4   # flat: any size
    assert live_price.parse_image(PRICE_TEXTS[GPT], "2K") == 10 and live_price.parse_image(PRICE_TEXTS[GPT], None) is None


@pytest.mark.core
def test_a_price_that_cannot_be_told_is_not_guessed_with_money():
    assert live_price.parse_price_table(PRICE_TEXTS["gpt-image-2-6/flare-image-to-image"]) == {}              # billed per token
    assert live_price.parse_price_table(PRICE_TEXTS["wan/2-7-image-pro"]) == {}                              # two different per-image prices, two models in one text
    assert live_price.parse_image("a text without any price", "2K") is None


# ------------------------------------------------------------------ one node per model, built from the schema

def test_every_photo_node_has_exactly_the_fields_of_its_model_and_never_offers_1k():
    assert set(OTHER_IMAGE_NODES.values()) == set(OTHER_IMAGE_MODELS) and NODE_OF_MODEL[GPT] == "MoonbloomKieGptImage2"
    gpt, grok = (nodes.NODE_CLASS_MAPPINGS[n].INPUT_TYPES() for n in ("MoonbloomKieGptImage2", "MoonbloomKieGrokImagineEdit"))
    assert gpt["required"]["resolution"][0] == ["2K", "4K"] and gpt["required"]["resolution"][1]["default"] == "2K"   # 2K is the minimum
    assert "resolution" not in grok["required"]                                                              # the model has no such field
    assert set(gpt["required"]["aspect_ratio"][0]) <= set(caps.enum(GPT, "aspect_ratio")) and "4:3" not in grok["required"]["aspect_ratio"][0]
    for name, spec in (("MoonbloomKieGptImage2", gpt), ("MoonbloomKieGrokImagineEdit", grok)):
        assert spec["required"]["dry_run"][1]["default"] is True and list(spec["optional"]) == ["texture_path", "reference_labels"], name
        assert "negative" in spec["required"]["prompt"][1]["tooltip"].lower() and "characters" in spec["required"]["prompt"][1]["tooltip"]
        assert nodes.NODE_CLASS_MAPPINGS[name].RETURN_NAMES == ("image", "image_path", "report")
        assert math.isnan(nodes.NODE_CLASS_MAPPINGS[name].IS_CHANGED(dry_run=True))                          # a free check is always fresh, a paid run is cached
        assert nodes.NODE_CLASS_MAPPINGS[name].IS_CHANGED(dry_run=False) == nodes.CODE_STAMP
    assert "1K" not in nodes.MoonbloomKieImage.INPUT_TYPES()["required"]["resolution"][0]                    # also the Nano Banana node


@pytest.mark.core
def test_a_dry_run_of_a_model_without_a_size_field_passes_no_size(monkeypatch):
    seen = {}

    class FakeGen:
        def check_image_request(self, **kw):
            seen.update(kw)
            return {"ok": True}

    monkeypatch.setattr(nodes, "KieImageGenerator", FakeGen)
    common = dict(prompt="p", scene_id="s", wallpaper_path="w.png", out_dir="o", listing="l", aspect_ratio="2:3", use_texture=False,
                  reuse_existing=True, dry_run=True)
    nodes.NODE_CLASS_MAPPINGS["MoonbloomKieGrokImagineEdit"]().generate(**common)
    assert seen["model"] == GROK and seen["resolution"] is None and seen["with_texture"] is False
    nodes.NODE_CLASS_MAPPINGS["MoonbloomKieGptImage2"]().generate(**common, resolution="4K")
    assert seen["model"] == GPT and seen["resolution"] == "4K"


# ------------------------------------------------------------------ the dry-run report and the generator

def test_the_dry_run_report_shows_the_whole_request(kie_prices):
    gen = kie_generator.KieImageGenerator.__new__(kie_generator.KieImageGenerator)
    gen.client = NS(get_credits=lambda: NS(success=True, data=NS(data=849.0)))
    prompt = "A mural room. Avoid: bed, crib, visible human face, front view of a person."
    gpt = gen.check_image_request(prompt=prompt, model=GPT, resolution="2K", aspect_ratio="2:3")
    grok = gen.check_image_request(prompt=prompt, model=GROK, resolution=None, aspect_ratio="2:3")
    assert gpt["ok"] and gpt["expected_credits"] == 10 and gpt["price_source"] == "live" and gpt["enough_balance"] is True
    p = gpt["request_preview"]
    assert p["fields_sent"] == {"aspect_ratio": "2:3", "resolution": "2K"} and p["references"] == {"field": "input_urls", "count": 2, "max": 16}
    assert p["prompt"]["limit"] == 20000 and p["prompt"]["chars_sent"] > len(prompt)
    assert p["prompt"]["avoid_items"] == ["bed", "crib", "visible human face", "front view of a person"]
    assert p["prompt"]["negative_field"] == caps.NO_NEGATIVE and p["not_in_this_model"] == ["output_format"]
    assert p["price"] == {"selected": 10, "per_size": {"1K": 6, "2K": 10, "4K": 16}, "unit": "credits"}
    g = grok["request_preview"]
    assert grok["ok"] and grok["expected_credits"] == 4 and g["fields_sent"] == {"aspect_ratio": "2:3"} and g["price"]["per_size"] == {"*": 4}
    assert g["references"]["max"] == 5 and g["prompt"]["limit"] == 8000
    bad = gen.check_image_request(prompt=prompt, model=GROK, resolution=None, aspect_ratio="4:3")              # a format the model does not sell
    assert bad["ok"] is False and "'4:3' is not one of" in bad["schema_problems"][0]
    kie_prices[GPT] = PRICE_TEXTS["gpt-image-2-6/flare-image-to-image"]                                      # billed per token: cannot be quoted
    unknown = gen.check_image_request(prompt=prompt, model=GPT, resolution="2K", aspect_ratio="2:3")
    assert unknown["expected_credits"] is None and unknown["request_preview"]["price"]["per_size"].startswith("cannot be quoted")


def test_the_split_of_an_app_prompt_and_the_usage_reader():
    assert kie_generator.split_prompt("Room text. Avoid: a, b c, d.") == {"positive_chars": len("Room text."), "avoid_items": ["a", "b c", "d"]}
    assert kie_generator.split_prompt("no list here") == {"positive_chars": 12, "avoid_items": []}
    assert kie_generator._usage_from(json.dumps({"resultUrls": ["u"], "usage": {"total_tokens": 7, "note": "x"}})) == {"usage.total_tokens": 7}
    assert kie_generator._usage_from(json.dumps({"resultUrls": ["u"]})) == {} and kie_generator._usage_from("not json") == {}


@pytest.mark.parametrize("model, answers_with, expect_fields", [
    (GPT, "JPEG", {"aspect_ratio": "2:3", "resolution": "2K"}),
    (GROK, "PNG", {"aspect_ratio": "2:3"}),
])
@pytest.mark.core
def test_one_generator_serves_every_model_and_records_what_was_really_made(model, answers_with, expect_fields, tmp_path, monkeypatch, kie_prices):
    sent = {}

    def poll_and_download(task_id, out_path, **kw):
        Image.new("RGB", (30, 45), (200, 150, 170)).save(out_path, answers_with)      # the model answers in ITS format, whatever the name says
        return NS(success=True)

    client = NS(
        get_credits=lambda: NS(success=True, data=NS(data=800.0)),
        create_task=lambda m, body: sent.update(model=m, body=body) or NS(success=True, data=NS(data=NS(task_id="task_9"))),
        create_image_task=lambda r: pytest.fail("only the Nano Banana family uses its pydantic request"),
        poll_and_download=poll_and_download,
        last_task_info={"credits_consumed": 10.0 if model == GPT else 4.0, "cost_time_s": 40,
                        "param": json.dumps({"model": model, "input": json.dumps(expect_fields)}),
                        "result_json": json.dumps({"resultUrls": ["u"], "usage": {"total_tokens": 1234}})},
    )
    gen = kie_generator.KieImageGenerator.__new__(kie_generator.KieImageGenerator)
    gen.client, gen._url_cache = client, {}
    gen.upload_reference = lambda path, tag: f"https://cdn/{tag}"
    logged = []
    monkeypatch.setattr(kie_generator.TelemetryLogger, "log_event", staticmethod(lambda **k: logged.append(k)))
    out = tmp_path / f"scene__{MODEL_TAG[model]}.png"
    record = gen.generate_image(prompt="PROMPT Avoid: bed.", wallpaper=tmp_path / "w.png", out_path=out, model=model, texture=tmp_path / "t.jpg",
                                aspect_ratio="2:3", resolution="2K" if "resolution" in expect_fields else None, scene_id="scene")
    assert record["ok"] and sent["model"] == model
    assert {k: v for k, v in sent["body"].items() if k not in ("prompt", caps.ref_field(model))} == expect_fields
    assert sent["body"][caps.ref_field(model)] == ["https://cdn/wallpaper", "https://cdn/texture"]            # wallpaper first, texture second
    with Image.open(out) as saved:
        assert saved.format == "PNG" and list(saved.size) == [30, 45]                                        # the name is no longer a lie
    assert record["output_px"] == [30, 45] and record["converted_from"] == (None if answers_with == "PNG" else "JPEG")
    assert record["kie_echo"]["model"] == model and record["usage"] == {"usage.total_tokens": 1234}
    side = json.loads(kie_generator.prompt_log_path(out).read_text(encoding="utf-8"))
    assert side["output_px"] == [30, 45] and side["kie_echo"]["model"] == record["kie_echo"]["model"] and side["fields_sent"] == expect_fields
    assert "PROMPT Avoid" not in json.dumps(side["kie_echo"]), "the echo of KIE does not repeat the prompt"
    event = logged[-1]
    assert event["model"] == model and event["credits_spent"] == record["credits_spent"] and event["tokens"] == {"usage.total_tokens": 1234}
    assert event["extra"]["output_px"] == [30, 45] and event["extra"]["fields_sent"] == expect_fields


@pytest.mark.core
def test_a_request_that_does_not_fit_the_schema_is_never_sent(tmp_path, monkeypatch, kie_prices):
    gen = kie_generator.KieImageGenerator.__new__(kie_generator.KieImageGenerator)
    gen.client = NS(get_credits=lambda: NS(success=True, data=NS(data=800.0)), create_task=lambda *a, **k: pytest.fail("nothing may be sent"))
    gen._url_cache = {}
    gen.upload_reference = lambda path, tag: "https://cdn/x"
    monkeypatch.setattr(kie_generator.TelemetryLogger, "log_event", staticmethod(lambda **k: None))
    record = gen.generate_image(prompt="p", wallpaper=tmp_path / "w.png", out_path=tmp_path / "x__grok2.png", model=GROK,
                                aspect_ratio="4:3", resolution=None, scene_id="x")                            # Grok has no 4:3
    assert record["ok"] is False and "does not fit KIE's schema" in record["error"] and "4:3" in record["error"]


# ------------------------------------------------------------------ the comparison board and the bridge quote

def _comparison_board(tmp_path):
    b = _builder()
    board = b.designs(False, BANANA, tuple((CARD, m) for m in (BANANA, GPT, GROK)))
    board["1"]["inputs"]["out_dir"] = str(tmp_path)                                                           # prices depend on files on disk
    return b, board


def test_the_comparison_board_has_one_chain_per_model_with_the_same_prompt_and_different_files(tmp_path):
    b, board = _comparison_board(tmp_path)
    b.check("compare", board)
    images = {k: v for k, v in board.items() if v["class_type"] in b.IMAGE_CLASSES}
    assert sorted(v["class_type"] for v in images.values()) == ["MoonbloomKieGptImage2", "MoonbloomKieGrokImagineEdit", "MoonbloomKieImage"]
    by_class = {v["class_type"]: v["inputs"] for v in images.values()}
    assert by_class["MoonbloomKieImage"]["model"] == BANANA and by_class["MoonbloomKieImage"]["resolution"] == "2K"
    assert by_class["MoonbloomKieGptImage2"]["resolution"] == "2K" and "model" not in by_class["MoonbloomKieGptImage2"]
    assert "resolution" not in by_class["MoonbloomKieGrokImagineEdit"] and "model" not in by_class["MoonbloomKieGrokImagineEdit"]
    assert {v["aspect_ratio"] for v in by_class.values()} == {"2:3"}
    designs = [v["inputs"] for v in board.values() if v["class_type"] == "MoonbloomDesign"]
    assert len(designs) == 3 and all(d == designs[0] for d in designs)                                        # one card, one seed: one prompt for all
    assert len({nodes.MoonbloomDesign().build(**d)[0] for d in designs}) == 1                                 # the same text goes to every model
    names = {Path(bridge_logic._frame_file(board, v)).name for v in images.values()}
    assert names == {f"{CARD}__{t}.png" for t in ("nb21", "gpt2", "grok2")}
    assert len([k for k, v in board.items() if v["class_type"] == "PreviewAny"]) == 6                         # a prompt window and a report window per chain


@pytest.mark.core
def test_the_bridge_prices_every_photo_node_live_at_its_size(tmp_path, kie_prices):
    b, board = _comparison_board(tmp_path)
    ids = [k for k, v in board.items() if v["class_type"] in b.IMAGE_CLASSES]
    for k in ids:
        board[k]["inputs"]["dry_run"] = True
    assert bridge_logic.max_credits(board) == 0
    paid = bridge_logic.apply_overrides(board, {k: {"dry_run": False} for k in ids})
    assert bridge_logic.max_credits(paid) == 6 + 10 + 4                                                       # Banana 2.1 + GPT Image 2 + Grok, 2K, live prices
    gpt = next(k for k in ids if board[k]["class_type"] == "MoonbloomKieGptImage2")
    paid[gpt]["inputs"]["resolution"] = "4K"
    assert bridge_logic.max_credits(paid) == 6 + 16 + 4                                                       # the size changes the quote, not just the 2K table
    kie_prices[GPT] = PRICE_TEXTS["gpt-image-2-6/flare-image-to-image"]
    assert bridge_logic.max_credits(paid) is None                                                             # cannot be quoted: the bridge refuses to run it
    Path(bridge_logic._frame_file(paid, paid[gpt])).write_bytes(b"png")                                       # a finished file costs nothing (reuse_existing)
    assert bridge_logic.max_credits(paid) == 6 + 4
