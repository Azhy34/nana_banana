#!/usr/bin/env python3
"""
A RETARGETING PIN from a ready picture and ONE message (specs/retarget_messages.json): crop to 2:3, a light band with the headline on top,
a sage strip with a small line at the bottom, in the fonts and colours of the website; a message may also carry a CALCULATOR CARD (a small
card on the picture: "Ihre Wand: 300 x 250 cm = 239 EUR") whose price is asked from the site's own price rule, never typed by hand.
Free and local: Pillow only, no model, no KIE, no credits, no internet. The letters are drawn by code, so "Wandmaße" is always spelled right
and the picture itself is never changed by a model.

  py -3.12 -X utf8 scripts/make_pin.py "<picture>" rechner_v2                    # -> <picture folder>/pin_<message>_<picture name>_2x3.jpg
  py -3.12 -X utf8 scripts/make_pin.py "<picture>" rechner_v2 --focus-x 0.51     # where the 2:3 crop of a wide picture is centred (0 left .. 1 right)
  py -3.12 -X utf8 scripts/make_pin.py "<picture>" rechner_frage --out <file.jpg>

The file is a JPEG of 1000x1500 (Pinterest minimum), with the IPTC label "made by AI" that Google Merchant asks for every AI picture
(reels_pipeline/destinations.py, destination pinterest_pin). A notes file with the texts and the links of the pin goes to runs/pins/.
Before a pin is made, the claims of its message are checked against the website project (nocode/Etsy): a pin must not promise what the page does
not have, and a price on a pin must be the price the calculator of the site gives today.
Posting the pin and the ad: the hub (nocode/Etsy), always dry_run first.
"""

import argparse
import copy
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from PIL import Image, ImageDraw, ImageFilter, ImageFont  # noqa: E402

from reels_pipeline import destinations  # noqa: E402

MESSAGES = ROOT / "specs" / "retarget_messages.json"
FONT_CACHE = ROOT / "runs" / "fonts"
NOTES = ROOT / "runs" / "pins"


def load_messages() -> dict:
    return json.loads(MESSAGES.read_text(encoding="utf-8"))


def hub_path(data: dict) -> Path:
    return (ROOT / data["hub"]).resolve()


def resolve_message(data: dict, message_id: str) -> dict:
    """A message of the library; `extends` takes a base message and overrides its keys (`pin` and `template` are merged key by key)."""
    if message_id not in data["messages"]:
        raise SystemExit(f"no message {message_id!r}; the library has {sorted(data['messages'])}")
    message = copy.deepcopy(data["messages"][message_id])
    if "extends" in message:
        merged = resolve_message(data, message.pop("extends"))
        for key, value in message.items():
            merged[key] = {**merged.get(key, {}), **value} if key in ("pin", "template") else value
        message = merged
    return message


def site_quote(hub: Path, width: int, height: int) -> dict:
    """The answer of the site's calculator for a wall of width x height cm (rechner.quote with the site's own prices and margin)."""
    spec = importlib.util.spec_from_file_location("site_rechner", hub / "site" / "rechner" / "rechner.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    prices = json.loads((hub / "site" / "data" / "prices.json").read_text(encoding="utf-8"))
    margin = json.loads((hub / "site" / "content" / "site.json").read_text(encoding="utf-8"))["panel"]["margin_cm"]
    answer = module.quote(width, height, prices, margin)
    if answer.get("kind") not in ("standard", "custom") or not answer.get("price_eur"):
        raise ValueError(f"the calculator of the site gives no price for {width} x {height} cm: {answer}")
    return answer


def euro(value: float) -> str:
    return f"{value:,.0f} €".replace(",", ".") if float(value).is_integer() else f"{value:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def check_facts(message: dict, hub: Path) -> list:
    """The claims of a message against the website project; returns the problems (empty = every claim is backed)."""
    problems = []
    for fact in message.get("facts", []):
        if "quote" in fact:
            try:
                site_quote(hub, fact["quote"]["width"], fact["quote"]["height"])
            except (ValueError, OSError, KeyError, ImportError) as exc:
                problems.append(f"fact '{fact['claim']}': {exc}")
            continue
        target = hub / fact["file"]
        if not target.is_file():
            problems.append(f"fact '{fact['claim']}': the file {target} does not exist")
        elif fact["contains"] not in target.read_text(encoding="utf-8", errors="ignore"):
            problems.append(f"fact '{fact['claim']}': {fact['file']} does not contain {fact['contains']!r}")
    return problems


def font_file(name: str, hub: Path) -> Path:
    """The brand font as a .ttf (the site serves .woff2; converted once into runs/fonts)."""
    FONT_CACHE.mkdir(parents=True, exist_ok=True)
    ttf = FONT_CACHE / f"{name}.ttf"
    if not ttf.is_file():
        from fontTools.ttLib import TTFont

        woff = hub / "site" / "design" / "fonts" / f"{name}.woff2"
        font = TTFont(str(woff))
        font.flavor = None
        font.save(str(ttf))
    return ttf


def _font(path: Path, size: int, weight: int) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(str(path), size)
    try:
        font.set_variation_by_axes([weight])
    except (OSError, AttributeError):  # a font without a weight axis
        pass
    return font


def crop_to_ratio(photo: Image.Image, focus_x: float = 0.5, focus_y: float = 0.5, ratio: float = 2 / 3) -> Image.Image:
    """A crop of `photo` with width/height = ratio, centred on the focus (fractions of the picture), never outside it."""
    w, h = photo.size
    if w / h > ratio:
        cw, ch = round(h * ratio), h
    else:
        cw, ch = w, round(w / ratio)
    x0 = min(max(round(focus_x * w - cw / 2), 0), w - cw)
    y0 = min(max(round(focus_y * h - ch / 2), 0), h - ch)
    return photo.crop((x0, y0, x0 + cw, y0 + ch))


def _hex(value: str, alpha: int = 255) -> tuple:
    value = value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


def _fit(draw: ImageDraw.ImageDraw, path: Path, text: str, size: int, weight: int, max_w: float) -> ImageFont.FreeTypeFont:
    """The font at `size`, made smaller until `text` fits `max_w`: a longer text gets a smaller letter, never a cut one."""
    while size > 10 and draw.textlength(text, font=_font(path, size, weight)) > max_w:
        size -= 2
    return _font(path, size, weight)


def draw_card(pin: Image.Image, card: dict, quote: dict, template: dict, hub: Path) -> Image.Image:
    """The calculator card on the picture: the wall, the price from the site's rule, a small call to action. `box` = [x, y, width] as fractions of the pin."""
    width, height = pin.size
    colors = template["colors"]
    x_f, y_f, w_f = card["box"]
    cw = round(width * w_f)
    pad = round(cw * 0.07)
    layer = Image.new("RGBA", pin.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    sans, serif = font_file(template["strip_font"], hub), font_file(template["headline_font"], hub)
    line1 = card["line1"].format(w=quote["wall_width"], h=quote["wall_height"])
    line2 = card["line2"].format(price=euro(quote["price_eur"]))
    inner = cw - 2 * pad
    f1 = _fit(d, sans, line1, round(cw * 0.075), 600, inner)
    f2 = _fit(d, serif, line2, round(cw * 0.21), 700, inner)
    f3 = _fit(d, sans, card["cta"], round(cw * 0.07), 700, inner - 40)
    gap = round(cw * 0.035)
    ch = pad + f1.size + gap + round(f2.size * 1.05) + gap + f3.size + pad
    x, y = round(width * x_f), round(height * y_f)
    d.rounded_rectangle([x, y, x + cw, y + ch], radius=round(cw * 0.07), fill=_hex(colors["surface"], 246), outline=_hex(colors["strip"]), width=4)
    ty = y + pad - f1.size * 0.1
    d.text((x + pad, ty), line1, font=f1, fill=_hex(colors["on_surface"]))
    ty += f1.size + gap
    d.text((x + pad, ty - f2.size * 0.12), line2, font=f2, fill=_hex(colors.get("accent", "#9C543A")))
    ty += round(f2.size * 1.05) + gap
    d.text((x + pad, ty - f3.size * 0.1), card["cta"], font=f3, fill=_hex(colors["strip"]))
    ax = x + pad + d.textlength(card["cta"], font=f3) + 14                                  # the arrow is drawn: the latin font has no arrow glyph
    ay = ty + f3.size * 0.52
    d.line([ax, ay, ax + 30, ay], fill=_hex(colors["strip"]), width=4)
    d.polygon([(ax + 30, ay - 9), (ax + 44, ay), (ax + 30, ay + 9)], fill=_hex(colors["strip"]))
    return Image.alpha_composite(pin, layer)


def compose(photo: Image.Image, message: dict, template: dict, hub: Path, focus_x: float = 0.5, focus_y: float = 0.5) -> Image.Image:
    """The pin as a picture: the 2:3 crop (a touch sharper), the top band with the headline, the bottom strip, and the calculator card when the message has one."""
    template = {**template, **message.get("template", {})}
    width, height = template["canvas_px"]
    cropped = crop_to_ratio(photo.convert("RGB"), focus_x, focus_y, width / height).resize((width, height), Image.LANCZOS)
    base = cropped.filter(ImageFilter.UnsharpMask(radius=1.4, percent=55, threshold=2)).convert("RGBA")   # an enlarged picture is soft: a mild unsharp mask
    colors = template["colors"]
    top_h, strip_h = round(height * template["top_band_ratio"]), round(height * template["bottom_strip_ratio"])
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle([0, 0, width, top_h], fill=_hex(colors["surface"], 240))
    draw.rectangle([0, height - strip_h, width, height], fill=_hex(colors["strip"]))
    pin = Image.alpha_composite(base, overlay)
    if message.get("card"):
        pin = draw_card(pin, message["card"], site_quote(hub, message["card"]["quote"]["width"], message["card"]["quote"]["height"]), template, hub)
    draw = ImageDraw.Draw(pin)

    head_path = font_file(template["headline_font"], hub)
    size = round(width * template["headline_size_ratio"])
    longest = max(message["headline"], key=lambda t: draw.textlength(t, font=_font(head_path, size, template["headline_weight"])))
    head = _fit(draw, head_path, longest, size, template["headline_weight"], width * template["headline_max_width_ratio"])
    size = head.size
    line_h = size * (1 + template["headline_line_gap_ratio"] * 0.5)
    block_h = line_h * len(message["headline"])
    y = (top_h - block_h) / 2 + (line_h - size) / 2 - size * 0.12
    for text in message["headline"]:
        draw.text(((width - draw.textlength(text, font=head)) / 2, y), text, font=head, fill=_hex(colors["on_surface"]))
        y += line_h

    strip_path = font_file(template["strip_font"], hub)
    small = _fit(draw, strip_path, message["strip"], round(width * template["strip_size_ratio"]), template["strip_weight"], width * 0.9)
    draw.text(((width - draw.textlength(message["strip"], font=small)) / 2, height - strip_h + (strip_h - small.size) / 2 - small.size * 0.12),
              message["strip"], font=small, fill=_hex(colors["on_strip"]))
    return pin.convert("RGB")


def make_pin(picture: Path, message_id: str, out: Path = None, focus_x: float = 0.5, focus_y: float = 0.5) -> dict:
    data = load_messages()
    message, hub = resolve_message(data, message_id), hub_path(data)
    problems = check_facts(message, hub)
    if problems:
        raise SystemExit("the pin would promise what the website does not have:\n  - " + "\n  - ".join(problems))
    out = out or picture.with_name(f"pin_{message_id}_{picture.stem[:40]}_2x3.jpg")
    pin = compose(Image.open(picture), message, data["template"], hub, focus_x, focus_y)
    with tempfile.TemporaryDirectory() as tmp:
        staged = Path(tmp) / "pin.png"
        pin.save(staged)
        result = destinations.render(staged, "pinterest_pin", out)  # exact 2:3, JPEG, the "made by AI" label, size limit
    quote = site_quote(hub, message["card"]["quote"]["width"], message["card"]["quote"]["height"]) if message.get("card") else None
    NOTES.mkdir(parents=True, exist_ok=True)
    (NOTES / f"{out.stem}.json").write_text(json.dumps({
        "file": str(out), "picture": str(picture), "message": message_id, "objection": message["objection"], "headline": message["headline"], "strip": message["strip"],
        "price_on_the_pin": quote and {"wall_cm": [quote["wall_width"], quote["wall_height"]], "price_eur": quote["price_eur"], "kind": quote["kind"]},
        "pin": message["pin"], "links": {"organic": f"{message['pin']['link']}?{message['pin']['utm_organic']}", "ads": f"{message['pin']['link']}?{message['pin']['utm_ads']}"},
        "size": result["size"], "bytes": result["bytes"], "ai_label": result["ai_label"], "facts_checked": [f["claim"] for f in message.get("facts", [])],
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"out": out, "size": result["size"], "bytes": result["bytes"], "ai_label": result["ai_label"], "price_eur": quote and quote["price_eur"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("picture", type=Path)
    parser.add_argument("message", help="an id of specs/retarget_messages.json")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--focus-x", type=float, default=0.5)
    parser.add_argument("--focus-y", type=float, default=0.5)
    args = parser.parse_args()
    done = make_pin(args.picture, args.message, args.out, args.focus_x, args.focus_y)
    print(f"pin: {done['out']}  {done['size'][0]}x{done['size'][1]}  {done['bytes'] // 1024} KB  label: {done['ai_label'].rsplit('/', 1)[-1]}"
          + (f"  price on the pin: {done['price_eur']} EUR (from the calculator of the site)" if done["price_eur"] else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
