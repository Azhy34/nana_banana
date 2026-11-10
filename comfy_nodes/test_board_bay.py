"""Offline tests of the MODEL BAY of the photo board (owner 06.11): the node of every model stays on the board, the model that pays is chosen
at run time. reels_pipeline/board_layout.py, scripts/build_comfy_workflows.py (photos_board), reels_pipeline/board_run.py (resolve_paid),
scripts/director.py (photos). No ComfyUI, no KIE, no credits.

Run: py -3.12 -X utf8 -m pytest comfy_nodes/test_board_bay.py -q
"""

import importlib.util
import json
import shutil
from pathlib import Path

import pytest

from comfy_nodes import bridge_logic
from reels_pipeline import board_layout, board_run, director

ROOT = Path(__file__).resolve().parent.parent
BANANA, GPT, GROK = "nano-banana-2-1", "gpt-image-2-image-to-image", "grok-imagine-image-2-0/image-edit"


def _script(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def specs(tmp_path, monkeypatch):
    """A scratch copy of ALL specs (the director reads and writes there); director.SPECS points at it."""
    folder = tmp_path / "specs"
    shutil.copytree(ROOT / "specs", folder)
    monkeypatch.setattr(director, "SPECS", folder)
    return folder


@pytest.fixture
def builder(specs, monkeypatch):
    b = _script("build_comfy_workflows", "scripts/build_comfy_workflows.py")
    director.write_generated(director.plan_set("l2_carousel01"))
    generated = director.load_generated("l2_carousel01")
    monkeypatch.setattr(b, "active_set", lambda: generated)
    return b, generated


def _board(b, generated, cards, **photos):
    entries = [{"id": c["id"], "prompt": "full"} for c in cards]
    return b.photos_board({"photos": {"model": BANANA, "spec": "listing02_interiors.json", "cards": entries, **photos}})


def _kie(graph):
    return {k: v for k, v in graph.items() if v["class_type"] in bridge_logic.IMAGE_NODES}


# ------------------------------------------------------------------ the layout

def test_the_layout_counts_nodes_and_keeps_the_board_small():
    assert board_layout.chain_nodes(1) == 5 and board_layout.chain_nodes(3) == 11
    assert board_layout.board_nodes([1, 1, 1]) == 17 and board_layout.board_nodes([3, 3]) == 24 and board_layout.board_nodes([3, 3, 3]) == 35
    assert board_layout.fits([3, 3]) and board_layout.fits([2, 2]) and board_layout.fits([1, 1, 1]) and board_layout.fits([2, 2, 2])
    assert not board_layout.fits([3, 3, 3]) and not board_layout.fits([1, 1, 1, 1])
    assert board_layout.MAX_PHOTO_BOARD_NODES < 34, "the old giant board had 34 nodes"


def test_a_model_that_does_not_accept_the_format_is_left_off():
    assert board_layout.supported_models(board_layout.BAY_MODELS, "9:16") == list(board_layout.BAY_MODELS)
    assert board_layout.supported_models(board_layout.BAY_MODELS, "4:5") == [BANANA, GPT]         # Grok has no 4:5
    assert board_layout.supported_models([GROK], "4:5") == []


# ------------------------------------------------------------------ the board

@pytest.mark.core
def test_a_pair_board_carries_a_node_per_model_that_accepts_its_format_and_all_start_free(builder):
    b, generated = builder
    pair_a, pair_b = generated["cards"][:2], generated["cards"][2:]
    nine = _board(b, generated, pair_a, models="all")
    assert len(nine) == 24 and sorted(v["class_type"] for v in _kie(nine).values()) == sorted(["MoonbloomKieImage", "MoonbloomKieGptImage2", "MoonbloomKieGrokImagineEdit"] * 2)
    four = _board(b, generated, pair_b, models="all")
    assert len(four) == 18 and "MoonbloomKieGrokImagineEdit" not in {v["class_type"] for v in four.values()}
    for graph in (nine, four):
        b.check("photos", graph)
        assert all(v["inputs"]["dry_run"] is True for v in _kie(graph).values()), "every KIE node starts as a free dry run"
        designs = [k for k, v in graph.items() if v["class_type"] == "MoonbloomDesign"]
        for k, v in _kie(graph).items():                                                       # the nodes of a chain share ONE prompt
            assert v["inputs"]["prompt"][0] in designs


def test_one_model_keeps_the_five_node_chain_and_its_node_ids(builder):
    b, generated = builder
    graph = _board(b, generated, generated["cards"][2:])
    assert len(graph) == 12 and [k for k, v in graph.items() if v["class_type"] == "MoonbloomDesign"] == ["3", "8"]
    assert [k for k in _kie(graph)] == ["5", "10"]                                              # as before: design 3, text 4, KIE 5, preview 6, report 7


def test_a_list_of_models_and_an_entry_of_its_own_are_honoured(builder):
    b, generated = builder
    graph = _board(b, generated, generated["cards"][2:], models=[BANANA, "nano-banana-2"])
    assert [v["inputs"]["model"] for v in _kie(graph).values()] == [BANANA, "nano-banana-2"] * 2
    entries = [{"id": generated["cards"][2]["id"], "models": [GPT], "prompt": "full"}, {"id": generated["cards"][3]["id"], "prompt": "full"}]
    graph = b.photos_board({"photos": {"model": BANANA, "spec": "listing02_interiors.json", "cards": entries}})
    assert [v["class_type"] for v in _kie(graph).values()] == ["MoonbloomKieGptImage2", "MoonbloomKieImage"]


def test_a_format_no_listed_model_accepts_is_an_error_and_a_too_big_board_is_refused(builder):
    b, generated = builder
    with pytest.raises(ValueError, match="accepts the format"):
        _board(b, generated, generated["cards"][2:], models=[GROK])
    generated["cards"].append(dict(generated["cards"][0], id="l2_extra"))               # a third 9:16 chain with three models = 35 nodes
    with pytest.raises(AssertionError, match="budget"):
        _board(b, generated, generated["cards"][:2] + [generated["cards"][-1]], models="all")


# ------------------------------------------------------------------ the model that pays is chosen at run time

@pytest.fixture
def bay(builder):
    b, generated = builder
    return b, generated, _board(b, generated, generated["cards"][:2], models="all")      # 9:16 pair, three models per chain


def _models_of(graph, ids):
    return sorted(bridge_logic.image_model(graph[i]) for i in ids)


@pytest.mark.core
def test_a_model_tag_picks_the_nodes_of_that_model_in_every_chain(bay):
    b, generated, graph = bay
    assert _models_of(graph, board_run.resolve_paid(graph, "nb21")) == [BANANA, BANANA]
    assert _models_of(graph, board_run.resolve_paid(graph, "gpt2")) == [GPT, GPT]
    assert _models_of(graph, board_run.resolve_paid(graph, "nb21,grok2")) == sorted([BANANA, BANANA, GROK, GROK])
    assert board_run.resolve_paid(graph, "") == []


def test_a_card_with_a_model_picks_one_node_and_a_node_id_still_works(bay):
    b, generated, graph = bay
    card = next(v["inputs"]["scene_id"] for v in graph.values() if v["class_type"] == "MoonbloomDesign")
    one = board_run.resolve_paid(graph, f"gpt2,{card}")
    assert len(one) == 1 and bridge_logic.image_model(graph[one[0]]) == GPT
    assert board_run.resolve_paid(graph, "5") == ["5"]


@pytest.mark.core
def test_all_is_refused_where_a_chain_has_several_models_and_so_is_a_card_alone(bay):
    b, generated, graph = bay
    with pytest.raises(ValueError, match="several models per chain"):
        board_run.resolve_paid(graph, "all")
    card = next(v["inputs"]["scene_id"] for v in graph.values() if v["class_type"] == "MoonbloomDesign")
    with pytest.raises(ValueError, match="every model of its chain"):
        board_run.resolve_paid(graph, card)
    with pytest.raises(ValueError, match="unknown --paid values"):
        board_run.resolve_paid(graph, "banana")
    four = _board(b, generated, generated["cards"][2:], models="all")
    with pytest.raises(ValueError, match="no node of the model"):
        board_run.resolve_paid(four, "grok2")                                           # Grok has no 4:5 node


@pytest.mark.core
def test_all_still_means_every_paid_node_on_a_board_with_one_model_per_chain(builder):
    b, generated = builder
    graph = _board(b, generated, generated["cards"][2:])
    assert board_run.resolve_paid(graph, "all") == ["5", "10"]


@pytest.mark.core
def test_only_the_chosen_nodes_leave_the_dry_run(bay):
    b, generated, graph = bay
    ids = board_run.resolve_paid(graph, "nb21")
    paid = bridge_logic.apply_overrides(graph, {i: {"dry_run": False} for i in ids})
    flags = {k: v["inputs"]["dry_run"] for k, v in _kie(paid).items()}
    assert [k for k, free in flags.items() if free is False] == ids and sum(1 for free in flags.values() if free is True) == 4


# ------------------------------------------------------------------ the director writes the bay and does not leak between sets

def _director_cli(specs, monkeypatch):
    module = _script("director_cli_bay", "scripts/director.py")
    monkeypatch.setattr(module, "ACTIVE", specs / "active_board.json")
    return module


def _photos(specs):
    return json.loads((specs / "active_board.json").read_text(encoding="utf-8"))["photos"]


def test_a_carousel_round_gets_all_models_and_a_reel_round_of_three_chains_only_the_set_model(specs, monkeypatch, capsys):
    cli = _director_cli(specs, monkeypatch)
    director.write_generated(director.plan_set("l2_carousel01"))
    assert cli.cmd_photos("l2_carousel01", 1) == 0
    photos = _photos(specs)
    assert photos["models"] == "all" and photos["spec"] == "listing02_interiors.json"
    director.write_generated(director.plan_set("l45_set01"))
    assert cli.cmd_photos("l45_set01", 1) == 0
    out = capsys.readouterr().out
    photos = _photos(specs)
    assert photos["models"] == [BANANA] and "spec" not in photos, "the block is replaced: nothing of the carousel leaks into the reel board"
    assert "budget" in out and "35 nodes" in out
