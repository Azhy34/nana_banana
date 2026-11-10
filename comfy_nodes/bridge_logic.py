"""
Logic of the UI bridge (the assistant opens a workflow in the owner's ComfyUI window). HOT RELOADED: an edit of this file
applies in ~2 seconds without restarting ComfyUI (comfy_nodes/hot_reload.py). The routes themselves live in the thin
shell comfy_nodes/ui_bridge.py, which only forwards to the functions below and is meant to stay untouched.

  POST http://127.0.0.1:8188/moonbloom/open
       {"workflow": "moonbloom_video_api.json", "run": false, "confirm_credits": <max_credits of the graph>,
        "set": {"<id of a Kling node>": {"dry_run": false}, "<id of a Frame Picker>": {"frame": "<file name>.png"}}}
  ONE BOARD = ONE TAB (owner 05.11, the old bridge piled up a tab per call): every board has a fixed tab title
  (TAB_TITLES), the browser half finds that tab, switches to it and loads the board into it. Nothing here ever asks the
  browser for a new tab, so `target` is accepted for old callers and ignored.
  set: `dry_run` of paid nodes, and `frame` of a Frame Picker (a plain file name of a photo in the frames folder).

Rules (they mirror the project rules: paid steps only with the credit number):
  - only files named *_api.json that exist directly in <repo>/workflows are accepted (no paths);
  - run=true on a workflow that can spend credits needs confirm_credits equal to the maximum it would spend
    (a node with reuse_existing whose result file is already on disk counts as 0); a paid node that cannot be priced
    is refused;
  - ComfyUI binds to 127.0.0.1 only, and its origin check blocks cross-site browser posts.
The browser half is comfy_nodes/web/moonbloom_ui.js.
"""

import asyncio
import copy
import json
from pathlib import Path
from typing import Any, Dict, Optional

from reels_pipeline.kie_generator import OTHER_IMAGE_NODES  # noqa: E402  (class name -> KIE model of every non-Banana photo node)

WORKFLOWS_DIR = Path(__file__).resolve().parent.parent / "workflows"
IMAGE_NODES = ("MoonbloomKieImage", *OTHER_IMAGE_NODES)  # every node that makes a photo on KIE
GROK_VIDEO_NODE = "MoonbloomKieGrokVideo"
OMNI_VIDEO_NODE = "MoonbloomKieOmniVideo"  # Gemini Omni 1.2 Flash on KIE (10.11.2026)
PAID_NODES = (*IMAGE_NODES, "MoonbloomKieKling", GROK_VIDEO_NODE, OMNI_VIDEO_NODE)


def image_model(node: Dict[str, Any]) -> Optional[str]:
    """The KIE model of a photo node: the `model` input of the Nano Banana node, the fixed model of the other nodes."""
    return (node.get("inputs") or {}).get("model") or OTHER_IMAGE_NODES.get(node.get("class_type"))
# The two boards the owner works in, each with one permanent tab. Any other workflow file gets a tab named after its file.
TAB_TITLES = {
    "moonbloom_photos_api.json": "Moonbloom Фото",
    "moonbloom_video_api.json": "Moonbloom Видео",
}


def tab_title(workflow_file: str) -> str:
    return TAB_TITLES.get(workflow_file, workflow_file[: -len("_api.json")] if workflow_file.endswith("_api.json") else workflow_file)


# ------------------------------------------------------------------ pricing and overrides (pure functions, tested offline)

def apply_overrides(graph: Dict[str, Any], overrides: Optional[Dict[str, Dict[str, Any]]]) -> Dict[str, Any]:
    """
    Copy of the graph with overrides applied: {node_id: {"dry_run": bool}} for a paid Moonbloom node (how one workflow stays
    one workflow while a single clip is switched from free to paid) and {node_id: {"frame": "<file>.png"}} for a Frame Picker
    (how a photo from the photo board is handed to the video board). Nothing else can be changed this way.
    """
    out = copy.deepcopy(graph)
    for node_id, changes in (overrides or {}).items():
        node = out.get(str(node_id))
        if node is None:
            raise ValueError(f"no node {node_id!r} in the workflow")
        if node.get("class_type") == "MoonbloomFramePicker":
            from comfy_nodes.moonbloom_nodes import frames_dir

            for key, value in changes.items():
                folder = frames_dir().resolve()
                if key != "frame" or not isinstance(value, str) or Path(value).name != value or not (folder / value).is_file():
                    raise ValueError(f"only `frame` can be set on a Frame Picker, to a photo file name in {folder}; got {key!r}={value!r}")
                node["inputs"][key] = value
            continue
        if node.get("class_type") not in PAID_NODES:
            raise ValueError(f"node {node_id!r} ({node.get('class_type')}) is not a paid Moonbloom node or a Frame Picker")
        for key, value in changes.items():
            if key != "dry_run" or not isinstance(value, bool):
                raise ValueError(f"only a boolean dry_run can be set, got {key!r}={value!r}")
            node["inputs"][key] = value
    return out


def _value(graph: Dict[str, Any], raw: Any, depth: int = 0) -> Any:
    """An input's value, following a link through the Moonbloom nodes whose outputs are copies of their inputs. None = unknown."""
    if not isinstance(raw, list):
        return raw
    if depth > 5 or len(raw) != 2:
        return None
    src_id, slot = raw
    src = graph.get(str(src_id)) or {}
    cls, inp = src.get("class_type"), src.get("inputs", {})
    if cls == "MoonbloomDesign" and slot == 1:
        return _value(graph, inp.get("scene_id"), depth + 1)
    if cls == "MoonbloomWallpaper":
        wall = _value(graph, inp.get("wallpaper_path"), depth + 1)
        if slot == 1:
            return wall
        if slot == 3:
            return _value(graph, inp.get("out_dir"), depth + 1) or (str(Path(wall).parent) if wall else None)
        if slot == 4:
            return Path(wall).parent.name if wall else None
    if cls in IMAGE_NODES and slot == 1:
        return _frame_file(graph, src)
    if cls == "MoonbloomFramePicker":
        from comfy_nodes.moonbloom_nodes import frames_dir

        frame = _value(graph, inp.get("frame"), depth + 1)
        if not frame:
            return None
        if slot == 1:
            return str(frames_dir() / frame)
        if slot == 2:
            return Path(frame).stem.split("__")[0]
        if slot == 3:
            return str(frames_dir())
        if slot == 4:
            return frames_dir().name
    return None


def _frame_file(graph: Dict[str, Any], node: Dict[str, Any]) -> Optional[str]:
    """Where a KIE Image node saves its result (the same name the node itself builds)."""
    from reels_pipeline.kie_generator import MODEL_TAG

    inp, model = node.get("inputs", {}), image_model(node)
    scene, folder = _value(graph, inp.get("scene_id")), _value(graph, inp.get("out_dir"))
    if not scene or not folder:
        return None
    return str(Path(folder) / f"{scene}__{MODEL_TAG.get(model, model)}.png")


def _clip_file(graph: Dict[str, Any], node: Dict[str, Any]) -> Optional[str]:
    inp = node.get("inputs", {})
    scene, folder = _value(graph, inp.get("scene_id")), _value(graph, inp.get("out_dir"))
    if not scene or not folder:
        return None
    return str(Path(folder) / f"{scene}__kling26_pushin_9x16.mp4")


def _grok_clip_file(graph: Dict[str, Any], node: Dict[str, Any]) -> Optional[str]:
    from reels_pipeline.grok_video_bridge import clip_name

    inp = node.get("inputs", {})
    scene, folder = _value(graph, inp.get("scene_id")), _value(graph, inp.get("out_dir"))
    if not scene or not folder:
        return None
    return str(Path(folder) / clip_name(scene, inp.get("model"), inp.get("resolution"), inp.get("duration")))


def _omni_clip_file(graph: Dict[str, Any], node: Dict[str, Any]) -> Optional[str]:
    from reels_pipeline.omni_video_bridge import clip_name

    inp = node.get("inputs", {})
    scene, folder = _value(graph, inp.get("scene_id")), _value(graph, inp.get("out_dir"))
    if not scene or not folder:
        return None
    last = _value(graph, inp.get("last_image_path")) if inp.get("last_image_path") else ""
    return str(Path(folder) / clip_name(scene, inp.get("resolution"), inp.get("duration"), bool(last)))


def max_credits(graph: Dict[str, Any]) -> Optional[float]:
    """
    Most credits this graph can spend. 0 = free. None = a paid node we cannot price.
    A node with reuse_existing whose result file is already on disk costs nothing (the node returns the file).
    If the file cannot be located (unknown link), the node is counted: the number is never too low.
    """
    from reels_pipeline import kling_bridge, live_price
    from reels_pipeline.kie_generator import CREDITS_2K

    total = 0.0
    for node in graph.values():
        inputs = node.get("inputs", {})
        cls = node.get("class_type")
        if cls not in PAID_NODES or inputs.get("dry_run") is True:
            continue
        if cls in IMAGE_NODES:
            target = _frame_file(graph, node)
        elif cls == GROK_VIDEO_NODE:
            target = _grok_clip_file(graph, node)
        elif cls == OMNI_VIDEO_NODE:
            target = _omni_clip_file(graph, node)
        else:
            target = _clip_file(graph, node)
        if inputs.get("reuse_existing") and target and Path(target).is_file():
            continue  # the file is on disk: free, so no price is needed
        if cls in IMAGE_NODES:  # the price is read live from KIE at the node's size; the 2K table is only the fallback (Banana)
            model, size = image_model(node), inputs.get("resolution")  # size None = the model has no resolution field (flat price)
            price, _ = live_price.pick(live_price.image_credits(model, size), CREDITS_2K.get(model) if size == "2K" else None)
        elif cls == GROK_VIDEO_NODE:  # per second and per resolution, read live; None = cannot be priced
            price, _ = live_price.grok_video_credits(inputs.get("model"), inputs.get("resolution"), int(inputs.get("duration") or 0))
        elif cls == OMNI_VIDEO_NODE:  # per second of output and per resolution, read live; None = cannot be priced
            price = live_price.omni_video_credits(str(inputs.get("resolution") or ""), int(inputs.get("duration") or 0))
        else:
            price, _ = kling_bridge.price_for(inputs.get("duration"), bool(inputs.get("sound")))
        if price is None:
            return None
        total += price
    return total


def window_problem(run: bool, windows: int) -> Optional[str]:
    """
    Why the board must not be sent right now (None = fine). PromptServer.send_sync without a target goes to EVERY connected
    window (ComfyUI server.py `send_json`, sid=None): with two windows a run is queued twice, i.e. a paid graph is paid twice,
    while confirm_credits covered one run. With no window nothing receives the board and the answer must not say "ok".
    """
    if windows == 0:
        return "no ComfyUI window is connected: nothing would receive the board (open the ComfyUI window first)"
    if run and windows > 1:
        return (f"{windows} ComfyUI windows are connected and each of them would queue this run, so it would be paid {windows} times; "
                "close the extra window (or open the board without run) and try again")
    return None


def connected_windows() -> int:
    from server import PromptServer  # only importable inside ComfyUI

    return len(PromptServer.instance.sockets)


# ------------------------------------------------------------------ route handlers (called by the shell in ui_bridge.py)

async def handle_open(request):
    from aiohttp import web
    from server import PromptServer  # only importable inside ComfyUI

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "body must be JSON"}, status=400)
    name = Path(str(body.get("workflow", ""))).name  # drop any path part
    path = WORKFLOWS_DIR / name
    if not name.endswith("_api.json") or not path.is_file():
        return web.json_response({"ok": False, "error": f"unknown workflow {name!r}"}, status=404)
    graph = json.loads(path.read_text(encoding="utf-8"))
    try:  # "set": {"<node id>": {"dry_run": false}} switches one paid node of the SAME workflow; priced below
        graph = apply_overrides(graph, body.get("set"))
    except ValueError as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=400)
    credits = max_credits(graph)
    run = bool(body.get("run"))
    if run:
        if credits is None:
            return web.json_response({"ok": False, "error": "a paid node in this workflow cannot be priced, refusing to run"}, status=409)
        if credits > 0 and body.get("confirm_credits") != credits:
            return web.json_response(
                {"ok": False, "error": f"this run can spend up to {credits} credits; send confirm_credits={credits}", "credits": credits},
                status=409,
            )
    windows = connected_windows()
    problem = window_problem(run, windows)
    if problem:
        return web.json_response({"ok": False, "error": problem, "windows": windows}, status=409)
    title = tab_title(name)
    PromptServer.instance.send_sync("moonbloom.open", {"name": title, "tab": title, "graph": graph, "run": run})
    return web.json_response({"ok": True, "workflow": name, "tab": title, "max_credits": credits, "run": run, "windows": windows})


async def handle_reload(request):
    """Apply edited node code now instead of waiting for the file watcher. Answers with the result or the error."""
    from aiohttp import web

    from comfy_nodes import hot_reload

    reloader = hot_reload.reloader()
    if reloader is None:
        return web.json_response({"ok": False, "error": "hot reload is not running"}, status=503)
    if not reloader.is_idle():
        return web.json_response({"ok": False, "error": "a job is running; the reload waits for the queue to be empty"}, status=409)
    result = await asyncio.get_running_loop().run_in_executor(None, reloader.reload_now)
    if result["ok"]:
        # ComfyUI builds ONE object per node id and keeps it between runs (execution.py: `caches.objects`, created once
        # with class_def()), so an already running node would keep executing the OLD code after the swap above.
        # The official "free_memory" flag (same as POST /free) makes the executor reset its caches and rebuild them.
        from server import PromptServer
        PromptServer.instance.prompt_queue.set_flag("free_memory", True)
        result["node_objects_reset"] = True
    return web.json_response(result, status=200 if result["ok"] else 500)
