"""
How big the photo board may be and which model nodes a chain carries (owner 06.11: the node of a model that was wired and worked stays on
the board; which model PAYS is decided at run time, not by rebuilding the board).

A chain = Design + its text window + for every model of the chain: the KIE node + its preview + its report window. So one model is the
familiar five nodes, every further model adds three. The wallpaper and its preview are two more nodes for the whole board.
Pure functions, no ComfyUI and no KIE (the formats of a model are read from its schema snapshot in api_truth/kie).
"""

from typing import List, Sequence

from . import kie_capabilities as caps

MAX_PHOTO_CHAINS = 3  # a board is small on purpose: every chain holds a prompt, a preview and a result in the browser
MAX_PHOTO_BOARD_NODES = 26  # two chains with three models = 24 nodes, three chains with one model = 17; the old giant board had 34
BAY_MODELS = ("nano-banana-2-1", "gpt-image-2-image-to-image", "grok-imagine-image-2-0/image-edit")  # the models of the owner: "all" on a board


def supported_models(models: Sequence[str], aspect: str) -> List[str]:
    """The models whose schema accepts this aspect ratio (a model with no format list in its schema is kept: the dry run will say)."""
    kept = []
    for model in models:
        formats = caps.enum(model, "aspect_ratio")
        if not formats or aspect in formats:
            kept.append(model)
    return kept


def chain_nodes(model_count: int) -> int:
    """Design + text window + (KIE node + preview + report) per model."""
    return 2 + 3 * model_count


def board_nodes(models_per_chain: Sequence[int]) -> int:
    return 2 + sum(chain_nodes(k) for k in models_per_chain)  # + the wallpaper and its preview


def fits(models_per_chain: Sequence[int]) -> bool:
    return len(models_per_chain) <= MAX_PHOTO_CHAINS and board_nodes(models_per_chain) <= MAX_PHOTO_BOARD_NODES
