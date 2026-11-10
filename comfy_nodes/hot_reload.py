"""
Hot reload for the Moonbloom nodes: edit the code in the IDE and a running ComfyUI picks it up in ~2 seconds,
no restart. ComfyUI reads every node lookup (object_info, validation, execution) from the live dict
nodes.NODE_CLASS_MAPPINGS, so re-importing our modules and updating that dict is enough.

What is reloaded: comfy_nodes/moonbloom_nodes.py, comfy_nodes/bridge_logic.py (the logic behind the bridge routes),
reels_pipeline/*, api_discovery/* and the prompt sources (services/promptGenerator.ts, Promt/trends.json,
scripts/build_batch_prompts.mjs: the Design node's dropdowns).
What is NOT (needs a restart of the ComfyUI instance): comfy_nodes/hot_reload.py, comfy_nodes/ui_bridge.py (a thin shell
that only holds the routes, keep it free of logic), custom_nodes/moonbloom_reels/__init__.py. The browser script
moonbloom_ui.js needs a page reload (F5).

Safety:
  - the reload waits until the ComfyUI queue is empty (never swaps code under a running paid job);
  - every changed .py is compiled first: a syntax error is reported and the old code keeps running;
  - the new modules are imported fresh; if the import fails, the old modules are put back (rollback);
  - after each attempt the browser gets a "moonbloom.reloaded" message (success or the error text).
Trigger by hand: POST /moonbloom/reload (see comfy_nodes/bridge_logic.py).
"""

import hashlib
import importlib
import importlib.util
import logging
import sys
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

log = logging.getLogger("moonbloom.hot_reload")

ROOT = Path(__file__).resolve().parent.parent
ENTRY_MODULE = "comfy_nodes.moonbloom_nodes"
PACKAGES = ("reels_pipeline", "api_discovery")
EXTRA_MODULES = ("comfy_nodes.bridge_logic",)  # the bridge logic: imported on demand by the route shell, reloaded here
NOT_RELOADED_HERE = {"hot_reload.py", "ui_bridge.py", "__init__.py"}  # files of comfy_nodes/ that stay loaded


def watched_files() -> List[Path]:
    files: List[Path] = []
    for folder in (ROOT / "comfy_nodes", ROOT / "reels_pipeline", ROOT / "api_discovery" / "kie_kling"):
        for path in sorted(folder.glob("*.py")):
            if path.name.startswith("test_"):
                continue
            if folder.name == "comfy_nodes" and path.name in NOT_RELOADED_HERE:
                continue
            files.append(path)
    files += [ROOT / "services" / "promptGenerator.ts", ROOT / "Promt" / "trends.json", ROOT / "scripts" / "build_batch_prompts.mjs"]
    return files


class HotReloader:
    def __init__(
        self,
        entry_module: str,
        packages: Sequence[str],
        watch: Callable[[], List[Path]],
        registry: Callable[[], Tuple[Dict[str, Any], Dict[str, str]]],
        notify: Callable[[str, Dict[str, Any]], None],
        is_idle: Callable[[], bool],
        poll_s: float = 1.5,
        settle_s: float = 1.0,
        extra_modules: Sequence[str] = (),
    ):
        # extra_modules: modules the entry module does not import (they are imported on demand, e.g. by a route handler)
        # but that must be reloaded too; they are imported right after the entry module, inside the same rollback.
        self.entry_module, self.packages = entry_module, tuple(packages)
        self.extra_modules = tuple(extra_modules)
        self._watch, self._registry, self.notify, self.is_idle = watch, registry, notify, is_idle
        self.poll_s, self.settle_s = poll_s, settle_s
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self.ready = threading.Event()  # set once the watcher has taken its first snapshot of the files
        self.last_result: Dict[str, Any] = {}

    # ------------------------------------------------------------ one reload

    def signature(self) -> tuple:
        """
        Snapshot of the watched files by CONTENT (size + short hash), not by modification time: on Windows the time has a
        ~16 ms step, a same-size rewrite right after a write keeps the same time, and OneDrive may touch times on its own.
        About 25 small files per 1.5 s poll: negligible.
        """
        sig = []
        for path in self._watch():
            try:
                data = path.read_bytes()
                sig.append((str(path), len(data), hashlib.blake2b(data, digest_size=8).hexdigest()))
            except OSError:  # being saved right now: a later poll sees the final content
                sig.append((str(path), 0, ""))
        return tuple(sig)

    def _owned_modules(self) -> List[str]:
        return [n for n in list(sys.modules)
                if n == self.entry_module or n in self.extra_modules
                or any(n == p or n.startswith(p + ".") for p in self.packages)]

    def reload_now(self) -> Dict[str, Any]:
        with self._lock:
            return self._reload()

    def _reload(self) -> Dict[str, Any]:
        for path in self._watch():  # 1) compile first: a typo must not take the nodes down
            if path.suffix == ".py" and path.exists():
                try:
                    compile(path.read_bytes(), str(path), "exec")
                except SyntaxError as exc:
                    return self._result(False, error=f"syntax error in {path.name}, line {exc.lineno}: {exc.msg}")
        for path in self._watch():
            # Python validates a cached .pyc by source mtime (whole seconds) and size: an edit of the same size within
            # the same second would be served from the stale cache. Drop the cache of every watched source.
            if path.suffix == ".py":
                try:
                    Path(importlib.util.cache_from_source(str(path))).unlink(missing_ok=True)
                except OSError:
                    pass
        names = self._owned_modules()
        snapshot = {n: sys.modules[n] for n in names}
        old_entry = snapshot.get(self.entry_module)
        old_nodes = set(getattr(old_entry, "NODE_CLASS_MAPPINGS", {}))
        for name in names:
            sys.modules.pop(name, None)
        try:  # 2) import everything fresh
            importlib.invalidate_caches()
            entry = importlib.import_module(self.entry_module)
            for extra in self.extra_modules:  # also sets the fresh module as the attribute of its package
                importlib.import_module(extra)
            new_classes = dict(entry.NODE_CLASS_MAPPINGS)
            new_names = dict(getattr(entry, "NODE_DISPLAY_NAME_MAPPINGS", {}))
        except Exception as exc:  # 3) rollback: put the previous modules back
            for name in self._owned_modules():
                sys.modules.pop(name, None)
            sys.modules.update(snapshot)
            return self._result(False, error=f"{type(exc).__name__}: {exc}")
        class_map, name_map = self._registry()  # 4) swap into ComfyUI's live registry
        for gone in old_nodes - set(new_classes):
            class_map.pop(gone, None)
            name_map.pop(gone, None)
        class_map.update(new_classes)
        name_map.update(new_names)
        return self._result(True, nodes=sorted(new_classes))

    def _result(self, ok: bool, error: Optional[str] = None, nodes: Optional[List[str]] = None) -> Dict[str, Any]:
        result: Dict[str, Any] = {"ok": ok, "time": time.strftime("%H:%M:%S")}
        if ok:
            result["nodes"] = nodes or []
        else:
            result["error"] = error
        self.last_result = result
        (log.info if ok else log.error)("[Moonbloom] hot reload: %s", result)
        try:
            self.notify("moonbloom.reloaded", result)
        except Exception:
            log.exception("[Moonbloom] could not notify the browser")
        return result

    # ------------------------------------------------------------ watching

    def watch_forever(self) -> None:
        seen, candidate, since = self.signature(), None, 0.0
        self.ready.set()
        while not self._stop.wait(self.poll_s):
            try:
                now = self.signature()
                if now == seen:
                    candidate = None
                    continue
                if now != candidate:  # still changing (editor saving several files): wait until it settles
                    candidate, since = now, time.time()
                    continue
                if time.time() - since < self.settle_s or not self.is_idle():
                    continue
                seen, candidate = now, None
                self.reload_now()
            except Exception:
                log.exception("[Moonbloom] hot reload watcher error")

    def stop(self) -> None:
        self._stop.set()


_RELOADER: Optional[HotReloader] = None


def reloader() -> Optional[HotReloader]:
    return _RELOADER


def start(poll_s: float = 1.5) -> bool:
    """Start the watcher inside ComfyUI. Returns False outside ComfyUI (CLI, tests): nothing to hot reload there."""
    global _RELOADER
    if _RELOADER is not None:
        return True
    try:
        import nodes  # ComfyUI's own module
        from server import PromptServer
    except Exception:
        return False
    _RELOADER = HotReloader(
        entry_module=ENTRY_MODULE,
        packages=PACKAGES,
        extra_modules=EXTRA_MODULES,
        watch=watched_files,
        registry=lambda: (nodes.NODE_CLASS_MAPPINGS, nodes.NODE_DISPLAY_NAME_MAPPINGS),
        notify=lambda event, data: PromptServer.instance.send_sync(event, data),
        is_idle=lambda: PromptServer.instance.prompt_queue.get_tasks_remaining() == 0,
        poll_s=poll_s,
    )
    threading.Thread(target=_RELOADER.watch_forever, name="moonbloom-hot-reload", daemon=True).start()
    print("[Moonbloom] hot reload is on: edits of the node code apply without a restart")
    return True
