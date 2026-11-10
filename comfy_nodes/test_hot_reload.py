"""Tests for comfy_nodes/hot_reload.py on a throw-away package (never touches the real nodes).

Run: py -3.12 -X utf8 -m pytest comfy_nodes -q
"""

import sys
import threading
import time
from pathlib import Path

import pytest

from comfy_nodes.hot_reload import HotReloader

HELPER = "VALUE = {value}\n"
ENTRY = (
    "from hrpkg.helper import VALUE\n"
    "class NodeA:\n    SEEN = VALUE\n"
    "class NodeB:\n    SEEN = VALUE\n"
    "NODE_CLASS_MAPPINGS = {mapping}\n"
    "NODE_DISPLAY_NAME_MAPPINGS = {names}\n"
)


@pytest.fixture
def pkg(tmp_path, monkeypatch):
    root = tmp_path / "hrpkg"
    root.mkdir()
    (root / "__init__.py").write_text("")
    monkeypatch.syspath_prepend(str(tmp_path))

    def write(value=1, mapping='{"NodeA": NodeA}', names='{"NodeA": "Node A"}', helper=None):
        (root / "helper.py").write_text(helper if helper is not None else HELPER.format(value=value))
        (root / "entry.py").write_text(ENTRY.format(mapping=mapping, names=names))

    write()
    yield root, write
    for name in [n for n in sys.modules if n == "hrpkg" or n.startswith("hrpkg.")]:
        del sys.modules[name]


def make(root, class_map, name_map, notes, idle=lambda: True, **kw):
    import importlib

    entry = importlib.import_module("hrpkg.entry")
    class_map.update(entry.NODE_CLASS_MAPPINGS)
    name_map.update(entry.NODE_DISPLAY_NAME_MAPPINGS)
    return HotReloader(
        entry_module="hrpkg.entry", packages=("hrpkg",),
        watch=lambda: sorted(root.glob("*.py")),
        registry=lambda: (class_map, name_map),
        notify=lambda event, data: notes.append((event, data)),
        is_idle=idle, **kw,
    )


def test_reload_picks_up_new_code(pkg):
    root, write = pkg
    class_map, name_map, notes = {}, {}, []
    reloader = make(root, class_map, name_map, notes)
    assert class_map["NodeA"].SEEN == 1
    write(value=2)
    result = reloader.reload_now()
    assert result["ok"] and result["nodes"] == ["NodeA"]
    assert class_map["NodeA"].SEEN == 2          # the helper module was reloaded too
    assert notes[-1][0] == "moonbloom.reloaded" and notes[-1][1]["ok"] is True


def test_syntax_error_keeps_old_code(pkg):
    root, write = pkg
    class_map, name_map, notes = {}, {}, []
    reloader = make(root, class_map, name_map, notes)
    old_class, old_module = class_map["NodeA"], sys.modules["hrpkg.entry"]
    write(helper="VALUE = (\n")
    result = reloader.reload_now()
    assert not result["ok"] and "syntax error in helper.py" in result["error"]
    assert class_map["NodeA"] is old_class and sys.modules["hrpkg.entry"] is old_module
    assert notes[-1][1]["ok"] is False


def test_import_error_rolls_back(pkg):
    root, write = pkg
    class_map, name_map, notes = {}, {}, []
    reloader = make(root, class_map, name_map, notes)
    old_class, old_module, old_helper = class_map["NodeA"], sys.modules["hrpkg.entry"], sys.modules["hrpkg.helper"]
    write(helper="raise RuntimeError('boom')\n")
    result = reloader.reload_now()
    assert not result["ok"] and "boom" in result["error"]
    assert class_map["NodeA"] is old_class
    assert sys.modules["hrpkg.entry"] is old_module and sys.modules["hrpkg.helper"] is old_helper
    write(value=5)                                 # fixed: the next reload works
    assert reloader.reload_now()["ok"] and class_map["NodeA"].SEEN == 5


def test_removed_and_added_nodes(pkg):
    root, write = pkg
    class_map, name_map, notes = {}, {}, []
    reloader = make(root, class_map, name_map, notes)
    write(mapping='{"NodeB": NodeB}', names='{"NodeB": "Node B"}')
    assert reloader.reload_now()["ok"]
    assert set(class_map) == {"NodeB"} and name_map == {"NodeB": "Node B"}


def test_watcher_waits_for_idle_queue(pkg):
    root, write = pkg
    class_map, name_map, notes = {}, {}, []
    idle = threading.Event()
    reloader = make(root, class_map, name_map, notes, idle=idle.is_set, poll_s=0.05, settle_s=0.1)
    thread = threading.Thread(target=reloader.watch_forever, daemon=True)
    thread.start()
    assert reloader.ready.wait(2), "the watcher did not start"  # otherwise the write below may precede its first snapshot
    try:
        write(value=7)
        time.sleep(0.6)
        assert class_map["NodeA"].SEEN == 1 and not notes   # busy queue: nothing is swapped
        idle.set()
        deadline = time.time() + 3
        while not notes and time.time() < deadline:
            time.sleep(0.05)
        assert notes and notes[-1][1]["ok"] and class_map["NodeA"].SEEN == 7
        assert len(notes) == 1                                # one change, one reload
    finally:
        reloader.stop()
        thread.join(timeout=2)


def test_extra_module_is_reloaded_and_rolled_back_with_the_rest(pkg):
    """A module the entry does not import (the bridge logic, imported on demand by a route) is reloaded too."""
    import importlib

    root, write = pkg
    (root / "extra.py").write_text("VALUE = 1\n")
    class_map, name_map, notes = {}, {}, []
    reloader = make(root, class_map, name_map, notes, extra_modules=("hrpkg.extra",))
    assert importlib.import_module("hrpkg.extra").VALUE == 1
    (root / "extra.py").write_text("VALUE = 2\n")
    assert reloader.reload_now()["ok"]
    assert importlib.import_module("hrpkg.extra").VALUE == 2
    import hrpkg

    assert hrpkg.extra.VALUE == 2          # the package attribute ("from hrpkg import extra") is fresh as well
    (root / "extra.py").write_text("raise RuntimeError('extra boom')\n")
    entry_before = sys.modules["hrpkg.entry"]
    result = reloader.reload_now()
    assert not result["ok"] and "extra boom" in result["error"]
    assert sys.modules["hrpkg.entry"] is entry_before                      # everything rolled back, not only the extra
    assert importlib.import_module("hrpkg.extra").VALUE == 2


def test_real_nodes_reload_offline():
    """The real Moonbloom modules reload cleanly (no ComfyUI needed): same nodes before and after."""
    import importlib

    from comfy_nodes.hot_reload import ENTRY_MODULE, PACKAGES, watched_files

    entry = importlib.import_module(ENTRY_MODULE)
    class_map, name_map, notes = dict(entry.NODE_CLASS_MAPPINGS), dict(entry.NODE_DISPLAY_NAME_MAPPINGS), []
    before = {k: v for k, v in class_map.items()}
    reloader = HotReloader(ENTRY_MODULE, PACKAGES, watched_files, lambda: (class_map, name_map),
                           lambda e, d: notes.append((e, d)), lambda: True)
    result = reloader.reload_now()
    assert result["ok"], result
    assert set(class_map) == set(before)
    assert all(class_map[k] is not before[k] for k in before)   # new class objects, i.e. the code really was re-imported
    assert "MoonbloomDesign" in result["nodes"]
