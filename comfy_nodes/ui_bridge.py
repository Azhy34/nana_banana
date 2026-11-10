"""
THIN SHELL of the UI bridge. ComfyUI registers server routes once, at start, so this file cannot be hot reloaded: it
holds only the two routes and forwards every call to comfy_nodes/bridge_logic.py, which IS hot reloaded. Keep this file
free of logic so it never needs a restart again (a change here = a restart of the ComfyUI instance by the owner).

  POST /moonbloom/open    -> bridge_logic.handle_open    (open / run a workflow from workflows/ in the owner's window)
  POST /moonbloom/reload  -> bridge_logic.handle_reload  (apply edited node code now)

The browser half is comfy_nodes/web/moonbloom_ui.js (exported through WEB_DIRECTORY by the loader in
custom_nodes/moonbloom_reels/__init__.py). Importing this module outside ComfyUI is harmless: register_routes()
returns False when ComfyUI's server module is not there (CLI, tests, gateway).
"""

import importlib

_REGISTERED = False


def register_routes() -> bool:
    """Idempotent: moonbloom_nodes calls it on every (re)import, the routes must be added only once."""
    global _REGISTERED
    if _REGISTERED:
        return True
    try:
        from server import PromptServer  # only importable inside ComfyUI
    except Exception:
        return False

    @PromptServer.instance.routes.post("/moonbloom/open")
    async def moonbloom_open(request):
        # import_module on every call: always the current (hot reloaded) code
        return await importlib.import_module("comfy_nodes.bridge_logic").handle_open(request)

    @PromptServer.instance.routes.post("/moonbloom/reload")
    async def moonbloom_reload(request):
        return await importlib.import_module("comfy_nodes.bridge_logic").handle_reload(request)

    _REGISTERED = True
    try:
        from comfy_nodes import hot_reload

        hot_reload.start()
    except Exception as exc:  # the nodes and the bridge must keep working without hot reload
        print(f"[Moonbloom] hot reload not started: {exc}")
    return True
