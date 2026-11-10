"""
Live KIE prices. The number a paid call is quoted at comes from here, not from a constant.

Primary source: GET /api/v1/models/{model}/price with the owner's key (without it KIE answers HTTP 200 and
{"code": 401}). The answer is a typed envelope {code, msg, data: {pricingDesc}}; it is validated with pydantic,
so a refusal (401, 429 ...) is reported with KIE's own message instead of silently becoming "no price".
KIE publishes the price only as text inside pricingDesc (there are no numeric fields), so the numbers are parsed
from that text by formats pinned in the tests. The amount really billed is a different, typed field:
recordInfo.credits_consumed plus the balance before/after (kling_bridge, kie_generator).

When the price cannot be read the callers fall back to their table AND say so; a paid Kling run refuses.
"""

import time
from typing import Optional, Tuple

import re
import requests
from pydantic import BaseModel, ConfigDict

PRICE_URL = "https://api.kie.ai/api/v1/models/{model}/price"
KLING_MODEL = "kling-2.6/image-to-video"

last_error = ""  # why the last read failed ("" after a good read); shown to the owner next to the fallback number


class PriceData(BaseModel):
    model_config = ConfigDict(extra="ignore")
    pricingDesc: str = ""


class PriceEnvelope(BaseModel):
    model_config = ConfigDict(extra="ignore")
    code: int
    msg: str = ""
    data: Optional[PriceData] = None


def _headers() -> dict:
    from .config import PipelineConfig  # lazy: the key is read from .env.local only when a price is asked for
    try:
        return {"Authorization": f"Bearer {PipelineConfig.get_kie_key()}"}
    except Exception:
        return {}


def fetch_pricing_desc(model: str, attempts: int = 3) -> str:
    """The price text of a KIE model, "" when it cannot be read (the reason is in last_error)."""
    global last_error
    for attempt in range(attempts):
        try:
            envelope = PriceEnvelope.model_validate(requests.get(PRICE_URL.format(model=model), headers=_headers(), timeout=20).json())
            if envelope.code == 200 and envelope.data and envelope.data.pricingDesc:
                last_error = ""
                return envelope.data.pricingDesc
            last_error = f"KIE answered code {envelope.code}: {envelope.msg[:80] or 'no price text'}"
        except Exception as exc:
            last_error = f"{type(exc).__name__}: {str(exc)[:80]}"
        if attempt < attempts - 1:
            time.sleep(1.5 * (attempt + 1))
    return ""


def parse_kling(desc: str, duration: str, sound: bool) -> Optional[int]:
    """'5-second video: 63 credits .. without audio, 126 credits .. with audio. 10-second video: 126 .., 252 ..'"""
    if duration not in ("5", "10"):
        return None  # KIE sells only these two lengths: anything else cannot be priced
    parts = desc.split("10-second video:")
    part = parts[0] if duration == "5" else (parts[1] if len(parts) > 1 else "")
    numbers = re.findall(r"(\d+)\s*credits", part)  # [without audio, with audio]
    if len(numbers) < 2:
        return None
    return int(numbers[1] if sound else numbers[0])


def _num(text: str):
    value = float(text)
    return int(value) if value == int(value) else value


def parse_price_table(desc: str) -> dict:
    """
    Every size KIE names a price for: {"1K": 4, "2K": 6, "4K": 9}; "*" = one flat price whatever the size. {} = the text has no
    per-image price (a model billed per token cannot be quoted in advance).
    The wordings KIE uses (all pinned in the tests, taken from the live catalog):
      '4 credits ($0.02) for 1K, 6 credits ($0.03) for 2K, and 9 credits ($0.045) for 4K'      Nano Banana 2 / 2.1, GPT Image 2
      '18 credits (~$0.09) for 1K/2K and 24 credits (~$0.12) for 4K'                              Nano Banana Pro
      '1K: 7 credits per image ($0.035), 2K: 14 credits per image ($0.07)'                        Seedream
      '4 credits per image (= $0.02)'                                                             Grok Imagine (flat)
      '1.6 credits per 1K image (≈ $0.008), 2.5 credits per 2K image'                             Flux 3 Klein, GPT Image 2.6 Economy
    """
    text = desc.replace(" K", "K")
    table: dict = {}
    for amount, sizes in re.findall(r"(\d+(?:\.\d+)?)\s*credits?\s*(?:\([^)]*\))?\s*for\s*((?:[124]K\s*/?\s*)+)", text, re.IGNORECASE):
        for size in re.findall(r"[124]K", sizes, re.IGNORECASE):
            table.setdefault(size.upper(), _num(amount))
    for size, amount in re.findall(r"\b([124]K):\s*(\d+(?:\.\d+)?)\s*credits?", text, re.IGNORECASE):
        table.setdefault(size.upper(), _num(amount))
    for amount, size in re.findall(r"(\d+(?:\.\d+)?)\s*credits?\s*(?:\([^)]*\))?\s*per\s*([124]K)\s*image", text, re.IGNORECASE):
        table.setdefault(size.upper(), _num(amount))
    for amount, size in re.findall(r"(\d+(?:\.\d+)?)\s*credits?\s*per image\s*(?:\([^)]*\))?\s*for\s*([124]K)\b", text, re.IGNORECASE):
        table.setdefault(size.upper(), _num(amount))  # '6.4 credits per image (≈ $0.032) for 1K output and 12 credits per image ... for 2K'
    if not table:
        # A flat price only when the text names exactly ONE per-image amount: several different amounts (per quality, per model)
        # cannot be told apart here, so the model counts as "cannot be quoted" instead of guessing with money.
        flat = {_num(a) for a in re.findall(r"\b(\d+(?:\.\d+)?)\s*credits?\s*(?:\([^)]*\))?\s*per image\b", text, re.IGNORECASE)}
        if len(flat) == 1:
            table["*"] = flat.pop()
    return table


def parse_image(desc: str, resolution: Optional[str]) -> Optional[int]:
    """The price of one picture at this size ('2K'); a model without a size field (resolution None) has one flat price."""
    table = parse_price_table(desc)
    if resolution:
        return table.get(resolution.upper(), table.get("*"))
    return table.get("*")


GROK_VIDEO_MODELS = ("grok-imagine-video-1-5-preview", "grok-imagine/image-to-video")  # KIE image-to-video models of xAI
VIDEO_TIERS = ("480p", "720p", "1080p")


def parse_per_second(desc: str) -> Tuple[dict, str]:
    """
    Credits per second of a video model by resolution, e.g. ({"480p": 2.4, "720p": 4.5, "1080p": 8}, note). The wordings KIE uses
    (pinned in the tests): '2.4 credits per second for 480p (..), 4.5 credits per second for 720p (..), 8 credits per second for 720p (..)'
    (Grok Video 1.5 Preview: the text names 720p TWICE, the third rate is 1080p; the rates 2.4 / 4.5 / 8 and the dollar amounts
    0.012 / 0.0225 / 0.04 are the ones of the stable Grok model, so the label that repeats is read by position and `note` says so) and
    '480p Output: 2.4 credits / sec  720p Output: 4.5 credits / sec  1080p Output: 8 credits / sec' (Grok image-to-video) and, since 08.11,
    '480p: 2.4 credits per second (..), 720p: 4.5 credits per second (..), 1080p: 8 credits per second (..)' (Grok Video 1.5 Preview, now unambiguous).
    ({}, "") = the text has no per-second price (cannot be quoted).
    """
    pairs = [(res.lower(), float(rate)) for rate, res in re.findall(r"(\d+(?:\.\d+)?)\s*credits?\s*per\s*second\s*for\s*(\d{3,4}p)", desc, re.IGNORECASE)]
    pairs += [(res.lower(), float(rate)) for res, rate in re.findall(r"(\d{3,4}p)\s*Output:\s*(\d+(?:\.\d+)?)\s*credits?\s*/\s*sec", desc, re.IGNORECASE)]
    pairs += [(res.lower(), float(rate)) for res, rate in re.findall(r"(\d{3,4}p)\s*:\s*(\d+(?:\.\d+)?)\s*credits?\s*per\s*second", desc, re.IGNORECASE)]
    labels = [res for res, _ in pairs]
    if not pairs:
        return {}, ""
    if len(set(labels)) == len(labels):
        return {res: _num(str(rate)) for res, rate in pairs}, ""
    rates = [rate for _, rate in pairs]
    if len(pairs) == len(VIDEO_TIERS) and rates == sorted(rates) and len(set(rates)) == len(rates):  # a label repeats, the rates rise: by position
        return {tier: _num(str(rate)) for tier, rate in zip(VIDEO_TIERS, rates)}, "KIE names one resolution twice in its price text: the rates are read by position (480p, 720p, 1080p)"
    return {}, ""  # an ambiguous text is never guessed with money


def grok_video_credits(model: str, resolution: str, duration: int) -> Tuple[Optional[float], str]:
    """(credits for a clip of `duration` seconds, note). None = cannot be quoted. Read live from KIE."""
    table, note = parse_per_second(fetch_pricing_desc(model))
    rate = table.get(resolution)
    return (round(rate * duration, 2) if rate is not None else None), note


OMNI_MODEL = "google/gemini-omni-flash-1-2"  # Gemini Omni 1.2 Flash on KIE (10.11.2026): billed per second of OUTPUT, one rate per resolution


def parse_omni_per_second(desc: str) -> dict:
    """Credits per second by resolution from the Omni price text, e.g. {"360p": 4, "720p": 9, "1080p": 10, "4k": 22}. The wording (pinned in the tests):
    '- 360P: 4 credits/s ($0.02) - 720P: 9 credits/s ($0.045) - 1080P: 10 credits/s ($0.05) - 4K: 22 credits/s ($0.11)'. {} = no per-second price (cannot be quoted);
    a resolution named twice with different rates is ambiguous and is never guessed with money."""
    pairs = [(res.lower(), _num(rate)) for res, rate in re.findall(r"(\d{3,4}p|4k)\s*:\s*(\d+(?:\.\d+)?)\s*credits?\s*/\s*s\b", desc, re.IGNORECASE)]
    table: dict = {}
    for res, rate in pairs:
        if res in table and table[res] != rate:
            return {}
        table[res] = rate
    return table


def omni_video_credits(resolution: str, duration: int) -> Optional[float]:
    """Credits for an Omni 1.2 clip of `duration` seconds at `resolution`, read live from KIE; None = cannot be quoted."""
    rate = parse_omni_per_second(fetch_pricing_desc(OMNI_MODEL)).get(resolution.lower())
    return round(rate * int(duration), 2) if rate is not None else None


def kling_credits(duration: str, sound: bool) -> Optional[int]:
    return parse_kling(fetch_pricing_desc(KLING_MODEL), duration, sound)


def image_credits(model: str, resolution: Optional[str]) -> Optional[int]:
    """Photo price from the model name as the code spells it ('nano-banana-2-1'); None = cannot be quoted."""
    return parse_image(fetch_pricing_desc(model), resolution)


def image_price_table(model: str) -> dict:
    """{"1K": 4, "2K": 6, "4K": 9}, {"*": 4} for a flat price, {} when the price cannot be quoted (per-token billing)."""
    return parse_price_table(fetch_pricing_desc(model))


def billing(task_credits: Optional[float], balance_before: Optional[float], balance_after: Optional[float],
            quoted: Optional[float]) -> dict:
    """
    What KIE really billed, where that number comes from, and whether it matches the price quoted before the run.
    Primary: creditsConsumed of the finished task (KIE's own typed field). Fallback: balance before minus after.
    """
    if task_credits is not None:
        billed, source = task_credits, "kie_task"
    elif balance_before is not None and balance_after is not None:
        billed, source = round(balance_before - balance_after, 2), "balance_diff"
    else:
        billed, source = None, "unknown"
    warning = None
    if billed is not None and quoted is not None and billed != quoted:
        warning = f"KIE billed {billed} credits, the quote was {quoted}"
    return {"billed": billed, "billed_source": source, "billing_warning": warning}


def pick(live: Optional[int], table: Optional[int]) -> Tuple[Optional[int], str]:
    """(credits, source): the live price when it was read, otherwise the table value with the source saying why."""
    if live is not None:
        return live, "live"
    return table, f"table (live price could not be read: {last_error or 'unrecognised price text'})"
