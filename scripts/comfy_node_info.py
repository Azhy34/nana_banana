#!/usr/bin/env python3
"""
Look at what ComfyUI really offers BEFORE a node goes into a graph (read-only, no credits).

  py -3.12 -X utf8 scripts/comfy_node_info.py search gemini banana     # nodes whose name/category/description has ALL words
  py -3.12 -X utf8 scripts/comfy_node_info.py show GeminiNanoBanana2V2 # readable definition: inputs, outputs, price, docs address
  py -3.12 -X utf8 scripts/comfy_node_info.py show GeminiNanoBanana2V2 --json   # the raw JSON ComfyUI answers
  py -3.12 -X utf8 scripts/comfy_node_info.py card MoonbloomKieImage    # the capability card (JSON): every input with type, choices, default, min/max
  py -3.12 -X utf8 scripts/comfy_node_info.py card --moonbloom [--save] # cards of all our nodes; --save writes api_truth/comfy/node_cards/
  py -3.12 -X utf8 scripts/comfy_node_info.py kie gpt-image-2-image-to-image   # what KIE itself says the model accepts (its schema): prompt limit,
                                                                              # negative prompt, references, ratios, sizes 1K-4K, other fields
  py -3.12 -X utf8 scripts/comfy_node_info.py prices [model ...]        # live price of one picture per size 1K / 2K / 4K for every photo model

Source: the LIVE GET /object_info of the running ComfyUI (it is rebuilt from the loaded node classes on every request). If ComfyUI
does not answer, search/show fall back to the copy api_truth/comfy/object_info.json with a loud warning that carries the date of the
copy; `card` refuses to answer from the copy unless you add --snapshot. Cards are what to read before a decision about a node.
Process for every new node: search -> show/card (fields, defaults, dynamic sub-fields, price, whether it is a partner node that
bills Comfy credits) -> read the docs page of that node -> decide -> only then add it to scripts/build_comfy_workflows.py.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reels_pipeline import kie_capabilities, live_price, node_cards  # noqa: E402
from reels_pipeline.config import PipelineConfig  # noqa: E402
from reels_pipeline.kie_generator import ALL_IMAGE_MODELS, IMAGE_MODELS, OTHER_IMAGE_MODELS, OTHER_IMAGE_NODES  # noqa: E402
from reels_pipeline.live_price import KLING_MODEL  # noqa: E402

SNAPSHOT = ROOT / "api_truth" / "comfy" / "object_info.json"
MANIFEST = ROOT / "api_truth" / "MANIFEST.json"


def snapshot_date():
    try:
        for item in json.loads(MANIFEST.read_text(encoding="utf-8")).get("items", []):
            if item.get("name") == "comfy/object_info":
                return item.get("fetched_at", "unknown date")
    except Exception:
        pass
    return "unknown date"


def load(allow_snapshot=True):
    """(nodes, source line, live?). Live data first; the copy only when allowed, and never without saying so."""
    try:
        return node_cards.fetch_object_info(PipelineConfig.COMFY_BASE_URL), "живой ComfyUI /object_info", True
    except node_cards.ComfyOffline as exc:
        if not allow_snapshot:
            raise
        if not SNAPSHOT.exists():
            raise node_cards.ComfyOffline(f"{exc} And there is no copy at {SNAPSHOT.relative_to(ROOT)}.") from exc
        note = f"!!! ComfyUI НЕ ОТВЕЧАЕТ. Данные ниже из КОПИИ от {snapshot_date()} ({SNAPSHOT.relative_to(ROOT)}), это не живые данные: наши новые ноды могут отсутствовать, значения устареть."
        return json.loads(SNAPSHOT.read_text(encoding="utf-8")), note, False


def type_text(spec):
    t, opts = spec[0], (spec[1] if len(spec) > 1 and isinstance(spec[1], dict) else {})
    if t == "COMFY_DYNAMICCOMBO_V3":
        return "динамический список (внутри свои поля, см. ниже)"
    if isinstance(t, list):
        return "список: " + ", ".join(map(str, t[:10])) + (" …" if len(t) > 10 else "")
    if t == "COMBO":
        o = opts.get("options", [])
        return "список: " + ", ".join(map(str, o[:10])) + (" …" if len(o) > 10 else "")
    extra = {k: opts[k] for k in ("default", "min", "max") if k in opts}
    return f"{t} {json.dumps(extra, ensure_ascii=False)}" if extra else str(t)


def cmd_search(nodes, words):
    words = [w.lower() for w in words]
    rows = []
    for name, v in nodes.items():
        hay = " ".join([name, str(v.get("display_name")), str(v.get("category")), str(v.get("description"))]).lower()
        if all(w in hay for w in words):
            kind = "партнёрская (кредиты Comfy)" if v.get("api_node") else ("наша" if str(v.get("category", "")).startswith("Moonbloom") else "встроенная/пакет")
            rows.append((name, v.get("display_name"), v.get("category"), kind))
    for r in sorted(rows):
        print(" | ".join(map(str, r)))
    print(f"найдено: {len(rows)}")


def cmd_show(nodes, name, raw):
    if name not in nodes:
        close = [n for n in nodes if name.lower() in n.lower()][:8]
        print("нет такой ноды.", "Похожие:" if close else "", ", ".join(close))
        return 1
    v = nodes[name]
    if raw:
        print(json.dumps(v, ensure_ascii=False, indent=1))
        return 0
    print(f"{name} | {v.get('display_name')} | категория: {v.get('category')} | python: {v.get('python_module')}")
    print(f"партнёрская нода (платит кредитами Comfy): {bool(v.get('api_node'))} | выходная: {v.get('output_node')} | deprecated: {v.get('deprecated')}")
    if v.get("description"):
        print("описание:", v["description"])
    order = v.get("input_order") or {}
    for grp, label in (("required", "ОБЯЗАТЕЛЬНЫЕ"), ("optional", "необязательные")):
        names = order.get(grp) or list((v["input"].get(grp) or {}))
        if names:
            print(f"-- {label}")
        for k in names:
            spec = (v["input"].get(grp) or {}).get(k)
            if not spec:
                continue
            print(f"   {k}: {type_text(spec)}")
            tip = (spec[1] or {}).get("tooltip") if len(spec) > 1 and isinstance(spec[1], dict) else None
            if tip:
                print(f"      подсказка: {tip[:200]}")
            if spec[0] == "COMFY_DYNAMICCOMBO_V3":
                for opt in (spec[1] or {}).get("options", []):
                    inner = {}
                    for sub in (opt.get("inputs") or {}).values():
                        inner.update(sub or {})
                    print(f"      вариант «{opt.get('key')}»: " + "; ".join(f"{a}={type_text(b)}" for a, b in inner.items()))
    hidden = (order.get("hidden") or [])
    if hidden:
        print("-- скрытые (подставляет сам ComfyUI):", ", ".join(hidden))
    print("выходы:", ", ".join(f"{n}:{t}" for n, t in zip(v.get("output_name", []), v.get("output", []))))
    badge = v.get("price_badge")
    if badge:
        print("-- ЦЕНА (формула из самой ноды):", " ".join(str(badge.get("expr", "")).split())[:700])
    if not str(v.get("category", "")).startswith("Moonbloom") and not v.get("api_node"):
        print("docs (проверить страницу):", f"https://docs.comfy.org/built-in-nodes/{name}.md")
    return 0


def kie_block(class_name):
    """For a KIE photo node: what the model itself accepts (KIE's schema) and what a picture costs at each size, live. None for other nodes."""
    models = {"MoonbloomKieImage": list(IMAGE_MODELS)}.get(class_name) or ([OTHER_IMAGE_NODES[class_name]] if class_name in OTHER_IMAGE_NODES else None)
    if not models:
        return None
    out = {}
    for model in models:
        info = kie_capabilities.summary(model)
        try:
            info["price_credits_per_size"] = live_price.image_price_table(model) or "cannot be quoted in advance"
        except Exception as exc:  # the card must still print without a key or a network
            info["price_credits_per_size"] = f"unavailable: {type(exc).__name__}"
        out[model] = info
    return out


def cmd_card(nodes, names, moonbloom, save):
    """The capability card(s) as JSON: one object for one class, {class: card} for several."""
    if moonbloom:
        names = sorted(n for n, v in nodes.items() if n.startswith("Moonbloom") or str(v.get("category", "")).startswith("Moonbloom"))
    if not names:
        print("укажите класс ноды или --moonbloom")
        return 2
    missing = [n for n in names if n not in nodes]
    if missing:
        for name in missing:
            close = [n for n in nodes if name.lower() in n.lower()][:8]
            print(f"нет такой ноды: {name}.", "Похожие: " + ", ".join(close) if close else "")
        return 1
    cards = {n: node_cards.card(nodes[n]) for n in names}
    for n, c in cards.items():
        block = kie_block(n)
        if block:
            c["kie"] = block  # printed with the card; not saved to api_truth (the saved card is what ComfyUI reports)
    print(json.dumps(next(iter(cards.values())) if len(cards) == 1 else cards, ensure_ascii=False, indent=1))
    if save:
        changed = node_cards.save_cards(nodes, names)  # saves the card as ComfyUI reports it, without the kie block
        print(f"[сохранено в {node_cards.CARDS_DIR.relative_to(ROOT)}: {len(names)} карточек, изменилось: {', '.join(changed) or 'ничего'}]", file=sys.stderr)
    return 0


def cmd_kie(models):
    """What KIE itself says the model accepts (its schema snapshot): the full capability, not only what our node offers."""
    models = models or list(ALL_IMAGE_MODELS) + [KLING_MODEL]
    out = {}
    for m in models:
        out[m] = {"fields": kie_capabilities.describe(m)}
        if m != KLING_MODEL:
            out[m]["summary"] = kie_capabilities.summary(m)
    print(json.dumps(next(iter(out.values())) if len(out) == 1 else out, ensure_ascii=False, indent=1))
    return 0


# Models worth pricing: ours, then the ones that took a reference image in the 06.11 review of the KIE catalog.
PRICE_WATCHLIST = [
    "nano-banana-2-1", "nano-banana-2", "nano-banana-pro", "nano-banana-2-lite",
    "gpt-image-2-image-to-image", "gpt-image-2-5-flare-image-to-image", "gpt-image-2-5-sunburst-image-to-image",
    "gpt-image-2-6/economy-image-to-image", "gpt-image-2-6/flare-image-to-image", "gpt-image-2-6/sunburst-image-to-image",
    "grok-imagine-image-2-0/image-edit", "seedream/5-pro-image-to-image", "seedream/5-flash-image-to-image",
    "seedream/5-lite-image-to-image", "seedream/4.5-edit", "flux-2/pro-image-to-image", "flux-2/flex-image-to-image",
    "flux-3/klein-edit-image", "qwen3/pro-image-to-image", "qwen3/image-to-image", "wan/2-7-image-pro", "wan/2-7-image",
]


def cmd_prices(models):
    """What ONE picture costs per size, live from KIE (credits; 1 credit = $0.005). '-' = KIE sells no such size, '?' = cannot be quoted in advance."""
    print(f"{'модель':44} {'1K':>6} {'2K':>6} {'4K':>6}   (кредиты за картинку, 1 кредит = $0.005; 2K минимум)")
    for model in models or PRICE_WATCHLIST:
        table = live_price.image_price_table(model)
        if "*" in table:
            cells = [f"{table['*']:g}"] * 3
            note = "плоская цена, поля размера нет" if model in OTHER_IMAGE_MODELS else "плоская цена"
        elif table:
            cells = [f"{table[s]:g}" if s in table else "-" for s in ("1K", "2K", "4K")]
            note = ""
        else:
            cells, note = ["?", "?", "?"], "по токенам или неоднозначный текст: заранее не назвать"
        print(f"{model:44} {cells[0]:>6} {cells[1]:>6} {cells[2]:>6}   {note}")
    return 0


def main():
    args = sys.argv[1:]
    flags = {a for a in args if a.startswith("--")}
    pos = [a for a in args if not a.startswith("--")]
    command = pos[0] if pos else None
    if command == "kie":
        return cmd_kie(pos[1:])
    if command == "prices":
        return cmd_prices(pos[1:])
    if command not in ("search", "show", "card") or (command != "card" and len(pos) < 2):
        print(__doc__)
        return 2
    try:
        nodes, source, live = load(allow_snapshot=command != "card" or "--snapshot" in flags)
    except node_cards.ComfyOffline as exc:
        print(f"ОШИБКА: {exc}\n(card читает только живой сервер; чтобы всё же взять копию, добавьте --snapshot)")
        return 3
    print(f"[источник: {source}; нод: {len(nodes)}]" if live else source, file=sys.stderr if command == "card" else sys.stdout)
    if command == "search":
        cmd_search(nodes, pos[1:])
        return 0
    if command == "card":
        return cmd_card(nodes, pos[1:], "--moonbloom" in flags, "--save" in flags and live)
    return cmd_show(nodes, pos[1], "--json" in flags)


if __name__ == "__main__":
    raise SystemExit(main())
