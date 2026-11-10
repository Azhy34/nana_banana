"""
Run a ComfyUI board from the IDE in ONE command (scripts/run_board.py): open it in the owner's window, wait for the queue, read what
every node produced, print one compact table, make a contact sheet. This replaces the open -> wait -> read /history -> compare code that
used to be typed again and again.

Money rule (the owner's): a paid run needs the credit number. `check_confirm` compares the LIVE quote of the graph with the number the
caller confirmed; the bridge (comfy_nodes/bridge_logic.py) checks it once more on its side.
"""

import json
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import requests

from .config import PipelineConfig

BOARDS = {"photos": "moonbloom_photos_api.json", "video": "moonbloom_video_api.json"}
WORKFLOWS_DIR = PipelineConfig.ROOT_DIR / "workflows"


def _base() -> str:
    return PipelineConfig.COMFY_BASE_URL.rstrip("/")


def board_file(name: str) -> str:
    return BOARDS.get(name, name)


def load_graph(name: str) -> Dict[str, Any]:
    return json.loads((WORKFLOWS_DIR / board_file(name)).read_text(encoding="utf-8"))


def paid_node_ids(graph: Dict[str, Any]) -> List[str]:
    from comfy_nodes import bridge_logic

    return [k for k, v in graph.items() if v.get("class_type") in bridge_logic.PAID_NODES]


def _chain_of(graph: Dict[str, Any], node_id: str) -> Optional[str]:
    """The Design node a photo node was built from (its `prompt` input is a link [design id, 0])."""
    link = (graph[node_id].get("inputs") or {}).get("prompt")
    return link[0] if isinstance(link, list) else None


def resolve_paid(graph: Dict[str, Any], text: str) -> List[str]:
    """
    Node ids to switch to PAID from the --paid text: node ids, MODEL TAGS (nb21, nb2, gpt2, grok2: every node of that model), the scene id
    of a card (every node of that card) or a model tag together with a card. `all` means every paid node, but only on a board where each
    chain has ONE photo node: with several models per chain it is refused, so that one word can never pay all of them.
    """
    from comfy_nodes import bridge_logic
    from reels_pipeline.kie_generator import MODEL_TAG

    tokens = [t.strip() for t in text.split(",") if t.strip()]
    if not tokens:
        return []
    paid = paid_node_ids(graph)
    images = [i for i in paid if graph[i]["class_type"] in bridge_logic.IMAGE_NODES]
    chains: Dict[Optional[str], List[str]] = {}
    for i in images:
        chains.setdefault(_chain_of(graph, i), []).append(i)
    several = any(len(v) > 1 for v in chains.values())
    tag_of = lambda i: MODEL_TAG.get(bridge_logic.image_model(graph[i]))  # noqa: E731
    scene_of = lambda i: ((graph.get(_chain_of(graph, i) or "") or {}).get("inputs") or {}).get("scene_id")  # noqa: E731
    if tokens == ["all"]:
        if several:
            raise ValueError("this board has several models per chain, so `all` would pay all of them: name the model(s), e.g. --paid "
                             f"{sorted({tag_of(i) for i in images})[0]} (tags on the board: {sorted({tag_of(i) for i in images})})")
        return paid
    tags, scenes = {tag_of(i) for i in images}, {scene_of(i) for i in images}
    ids, models, cards, unknown = set(), [], [], []
    for token in tokens:
        if token in graph:
            ids.add(token)
        elif token in MODEL_TAG.values():
            models.append(token)
        elif token in scenes:
            cards.append(token)
        else:
            unknown.append(token)
    if unknown:
        raise ValueError(f"unknown --paid values {unknown}: node ids {paid}, model tags {sorted(t for t in tags if t)}, cards {sorted(s for s in scenes if s)}")
    absent = [m for m in models if m not in tags]
    if absent:
        raise ValueError(f"no node of the model {absent} on this board (a model whose schema does not accept the card's format is left off): tags {sorted(t for t in tags if t)}")
    if cards and not models and several:
        raise ValueError("a card name alone would pay every model of its chain: add the model tag, e.g. --paid " f"{sorted(t for t in tags if t)[0]},{cards[0]}")
    picked = set(ids)
    if models or cards:
        picked |= {i for i in images if (not models or tag_of(i) in models) and (not cards or scene_of(i) in cards)}
    return sorted(picked, key=lambda i: int(i) if i.isdigit() else 0)


def quote(graph: Dict[str, Any], ids: Sequence[str]) -> Optional[float]:
    """The most credits the graph can spend when the nodes `ids` are switched to paid, at LIVE prices. None = cannot be priced."""
    from comfy_nodes import bridge_logic

    return bridge_logic.max_credits(bridge_logic.apply_overrides(graph, {i: {"dry_run": False} for i in ids}))


def check_confirm(credits: Optional[float], confirm: Optional[float]) -> Optional[str]:
    """Why a paid run must not start (None = fine). Nothing is spent unless the confirmed number equals the live quote."""
    if credits is None:
        return "a paid node cannot be priced right now (KIE gave no readable price): refusing to run"
    if credits == 0:
        return None
    if confirm is None:
        return f"this run can spend up to {credits:g} credits (live prices). Run again with --confirm {credits:g} to pay."
    if confirm != credits:
        return f"you confirmed {confirm:g} credits, the live quote is {credits:g}: nothing was started. Run again with --confirm {credits:g}."
    return None


def reload_nodes() -> Dict[str, Any]:
    """POST /moonbloom/reload: apply edited node code NOW and reset ComfyUI's cached node objects (an object that already ran keeps the OLD code)."""
    resp = requests.post(f"{_base()}/moonbloom/reload", timeout=120)
    out = resp.json()
    out["status"] = resp.status_code
    return out


STALE_HINT = "the running ComfyUI still holds an OLD node object after a code edit: run again with --reload"


def hint_for(error: Optional[str]) -> Optional[str]:
    return STALE_HINT if error and "unexpected keyword argument" in error else None


def open_board(name: str, ids: Sequence[str] = (), confirm: Optional[float] = None) -> Dict[str, Any]:
    """POST /moonbloom/open with run=true. Returns the bridge's JSON plus `status`."""
    body: Dict[str, Any] = {"workflow": board_file(name), "run": True}
    if ids:
        body["set"] = {i: {"dry_run": False} for i in ids}
        body["confirm_credits"] = confirm
    resp = requests.post(f"{_base()}/moonbloom/open", json=body, timeout=60)
    out = resp.json()
    out["status"] = resp.status_code
    return out


def last_prompt_id() -> Optional[str]:
    """The id of the newest run in ComfyUI's history (None when there is none yet): taken BEFORE a board is opened."""
    history = requests.get(f"{_base()}/history?max_items=1", timeout=30).json()
    return next(iter(history), None)


def wait_queue(before: Optional[str], timeout: float = 600.0, poll: float = 3.0) -> float:
    """
    Seconds until a NEW run (an id other than `before`) is in the history and the queue is empty. Waiting for "the queue was busy"
    would miss a fast free run that ends between two polls. Raises TimeoutError.
    """
    start = time.time()
    while time.time() - start < timeout:
        q = requests.get(f"{_base()}/queue", timeout=15).json()
        busy = len(q.get("queue_running", [])) + len(q.get("queue_pending", []))
        if not busy and last_prompt_id() not in (None, before):
            return round(time.time() - start, 1)
        time.sleep(poll)
    raise TimeoutError(f"the ComfyUI queue did not finish in {timeout:g} s")


def last_run() -> Dict[str, Any]:
    history = requests.get(f"{_base()}/history?max_items=1", timeout=30).json()
    return next(iter(history.values()), {})


def describe(node_id: str, text: str) -> Optional[Dict[str, Any]]:
    """One output text of a node -> a flat row, or None when it is not a node report (a prompt window, a plain text)."""
    if not text.startswith("{"):
        return None
    try:
        d = json.loads(text)
    except ValueError:
        return None
    if not isinstance(d, dict):
        return None
    preview = d.get("request_preview") or {}
    prompt = preview.get("prompt") or {}
    mode = "reused" if d.get("reused") else ("dry run" if d.get("dry_run") else "paid")
    return {
        "node": node_id, "model": d.get("model") or d.get("scene"), "mode": mode, "ok": d.get("ok"),
        "credits": d.get("credits_spent") if mode == "paid" else d.get("expected_credits"),
        "billing_warning": d.get("billing_warning"), "balance": d.get("balance_after", d.get("balance", d.get("balance_before"))),
        "px": d.get("output_px"), "seconds": d.get("duration_s"), "file": d.get("out_path") or d.get("path"),
        "prompt_chars": prompt.get("chars_sent"), "error": d.get("error"), "problems": d.get("schema_problems") or [],
    }


def read_results(run: Dict[str, Any]) -> Dict[str, Any]:
    """{"status", "completed", "error", "rows": [...]} from one /history entry."""
    status = run.get("status", {})
    error = next((f"{m[1].get('node_type')}: {str(m[1].get('exception_message', '')).strip()[:300]}"
                  for m in status.get("messages", []) if m and m[0] == "execution_error"), None)
    rows = []
    for node_id, out in sorted(run.get("outputs", {}).items(), key=lambda x: int(x[0])):
        for text in out.get("text") or []:
            row = describe(node_id, text)
            if row:
                rows.append(row)
    return {"status": status.get("status_str"), "completed": status.get("completed"), "error": error, "rows": rows}


def clip_delivery_note(path: Any) -> str:
    """One line on whether a FINISHED clip is shaped for Instagram / Facebook Reels (specs/ad_formats.json `video`, reels_pipeline/video_check.py).
    "" when the file is not a readable video. A source clip has no sound by design, so that one warning is not repeated here."""
    from . import video_check

    if not path or not str(path).lower().endswith(".mp4") or not Path(path).is_file():
        return ""
    try:
        lines = video_check.verdict(video_check.probe(Path(path)), video_check.spec_of("meta_stories_reels"))
    except Exception:  # noqa: BLE001  a check that cannot run must never break a paid run's report
        return ""
    problems = [line for line in lines if line["level"] != "ok" and not line["text"].startswith("no audio track")]
    if not problems:
        return "Instagram: ok (1080x1920 H.264)"
    return "Instagram: " + "; ".join(f"{line['level'].upper()} {line['text']}" for line in problems)


def format_table(result: Dict[str, Any]) -> str:
    from . import destinations  # which platforms a finished frame fits: specs/ad_formats.json

    lines = [f"run: {result['status']}" + (f" | ERROR {result['error']}" if result["error"] else "")]
    for r in result["rows"]:
        size = "x".join(map(str, r["px"])) if r["px"] else "-"
        credits = f"{r['credits']:g}" if isinstance(r["credits"], (int, float)) else "-"
        extra = " | ".join(x for x in (r["billing_warning"], r["error"], "; ".join(r["problems"])) if x)
        serves = destinations.serves_label(*r["px"]) if r["px"] and len(r["px"]) == 2 else ""
        lines.append(f"  node {r['node']:>3} {str(r['model']):36} {r['mode']:8} credits {credits:>5} px {size:>10} "
                     f"{('%gs' % r['seconds']) if r['seconds'] else '-':>7} {Path(r['file']).name if r['file'] else '-'}"
                     + (f"  -> {serves}" if serves else "") + (f"  !! {extra}" if extra else ""))
        note = clip_delivery_note(r["file"]) if r["mode"] in ("paid", "reused") else ""
        if note:
            lines.append(f"           {note}")
    paid = [r for r in result["rows"] if r["mode"] == "paid" and isinstance(r["credits"], (int, float))]
    if paid:
        balances = [r["balance"] for r in result["rows"] if r["balance"] is not None]
        lines.append(f"  spent {sum(r['credits'] for r in paid):g} credits" + (f", balance now {min(balances):g}" if balances else ""))
    return "\n".join(lines)


def contact_sheet(rows: Sequence[Dict[str, Any]], out: Optional[Path] = None, height: int = 700) -> Optional[Path]:
    """The finished pictures side by side with a label each, in the TEMP folder (never in the repository). None = nothing to show."""
    from PIL import Image, ImageDraw

    files = [(r, Path(r["file"])) for r in rows if r["file"] and Path(r["file"]).is_file() and Path(r["file"]).suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")]  # a clip is not a picture
    if not files:
        return None
    tiles = []
    for row, path in files:
        with Image.open(path) as im:
            im = im.convert("RGB")
            tiles.append((f"{path.stem[-34:]} | {row['model']} | {im.width}x{im.height}", im.resize((round(im.width * height / im.height), height))))
    sheet = Image.new("RGB", (sum(t.width for _, t in tiles) + 10 * (len(tiles) + 1), height + 34), (30, 30, 30))
    draw, x = ImageDraw.Draw(sheet), 10
    for label, tile in tiles:
        sheet.paste(tile, (x, 28))
        draw.text((x, 8), label, fill=(255, 255, 255))
        x += tile.width + 10
    out = out or Path(tempfile.gettempdir()) / "moonbloom" / f"sheet_{time.strftime('%H%M%S')}.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, quality=86)
    return out
