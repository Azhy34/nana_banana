"""
The scene writer (steps 2-4 of `scripts/director.py design`): a model LOOKS at the wallpaper and writes a short scene of the room for each hand that the dealer
(reels_pipeline/dealer.py) dealt; code then checks the scenes with the director's own checks and writes the set file. The final photo prompt is still built by
code (services/promptGenerator.ts buildBriefPrompt): this module only writes the part of it that needs eyes, the room.

The model is Claude Code itself, run as a scripted call on the owner's SUBSCRIPTION (`claude -p`), not through a paid API: the key and the base URL are removed
from the environment of the child process on purpose. The call is cut down to what it needs (an empty working folder, no MCP servers, no skills, no settings,
one tool: Read for the picture): the same call with the project around it loads about 590 thousand tokens of context, this one about 8 thousand.

Fallbacks that never stop the process: `writer="chat"` writes the task into a file for the agent of the chat to answer (`scenes_file=`), and a test or another
tool passes its own `runner`.
"""

import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from . import dealer, director
from .config import PipelineConfig

BRIEF_FILE = "scene_writer_brief.md"
ROOM_TYPES = ("sleep zone", "play zone", "reading nook", "study zone")
DEFAULT_LIFE_POSE = "{person} stands on the rug with {her} back to the camera, {her} face turned away from the camera so no facial detail is visible."
DEFAULT_LIFE_ACTION = "stays still"  # a frame whose role has no `life` pose never uses these two kit fields; the kit format wants them non-empty
FACE_SENTENCE = ", {her} face turned away from the camera so no facial detail is visible"
TIMEOUT_S = 300

SLOT_PROPS = {
    "name": {"type": "string"}, "color": {"type": "string"}, "room_type": {"type": "string", "enum": list(ROOM_TYPES)},
    "subject": {"type": "string"}, "room": {"type": "string"}, "floor": {"type": "string"}, "side_wall": {"type": "string"},
    "light": {"type": "string"}, "palette": {"type": "string"}, "items": {"type": "string"},
    "life_pose": {"type": "string"}, "life_action": {"type": "string"},
}
SCHEMA = {
    "type": "object",
    "properties": {"slots": {"type": "array", "items": {
        "type": "object", "properties": {"slot": {"type": "string"}, **SLOT_PROPS}, "required": ["slot", *SLOT_PROPS], "additionalProperties": False}}},
    "required": ["slots"], "additionalProperties": False,
}

Runner = Callable[[str, Path, str], Dict[str, Any]]  # (task, wallpaper, model) -> {"scenes": [...], "usage": {...}}


def wallpaper_path(listing: Dict[str, Any]) -> Path:
    path = Path(listing["wallpaper"])
    return path if path.is_absolute() else PipelineConfig.ROOT_DIR / path


def brief_text() -> str:
    return (director.SPECS / BRIEF_FILE).read_text(encoding="utf-8")


BUDGET_MARGIN = 80  # a longer colour description when the writer swaps the colour, a longer side word: keep room for them


def char_budget(hand: Dict[str, Any], listing: Dict[str, Any]) -> int:
    """How many characters the scene fields of this frame (subject, room, floor, side_wall, light, palette, life_pose; items go to the clip) may take together: the
    director's limit minus the prompt around them (the intro, the references, the role's own person text, the camera line), measured by composing the frame
    with empty scene fields."""
    rules = listing.get("brief") or {}
    kit = {"id": "budget", "audience": hand["audience"], "age": hand["age"], "side": hand["side"], "style": hand["style"], "color": hand["color"],
           "lighting": hand["lighting"], "subject": "x", "room": "", "floor": "", "side_wall": "x", "ceiling": "", "light": "", "palette": "", "items": "x",
           "life_pose": "", "life_action": "x", "toy": hand["toy"], "child": {"gender": hand["audience"], "age_band": hand["age"]}}
    card = director.compose(kit, hand["role"], director.load_roles(), rules, "budget", hand["slot"], 1)["card"]
    return director.BRIEF_MAX - len(director.brief_of(card, rules)) - BUDGET_MARGIN


def _hand_lines(hand: Dict[str, Any], budget: int) -> str:
    person = ("a person from behind: " + hand["role_label"]) if hand["person"] else "no person: " + hand["role_label"]
    colours = "; ".join(f"{c['name']} ({c['description']})" for c in hand["allowed_colors"])
    piece = hand["hero_piece"]
    return (f"### {hand['slot']}  role `{hand['role']}`  ({person})\n"
            f"- child: {hand['child']}; {hand['room_of_that_age']}\n"
            f"- decor side wall: {hand['side'].upper()}; window and light: {hand['lighting']}\n"
            f"- style: {hand['style']} ({hand['style_card']})\n"
            f"- colour: {hand['color']} ({hand['color_description']}); allowed_colors: {colours}\n"
            f"- hero piece: {piece['name']}" + (f" ({piece['description']})" if piece["description"] else "") + "\n"
            f"- toy of that age: {hand['toy']}\n"
            f"- character budget for subject + room + floor + side_wall + light + palette + life_pose together: {budget}")


def build_task(listing: Dict[str, Any], hands: List[Dict[str, Any]], wallpaper: Path) -> str:
    """The user message of the writer: the facts of the wallpaper and the hands. The rules are the system prompt (specs/scene_writer_brief.md)."""
    rules = listing.get("brief") or {}
    return (f"Wallpaper picture: {wallpaper.as_posix()} (open it with the Read tool and look at its motifs and palette).\n"
            f"Audience of the room: {listing['audience']}. Hero motif of the mural: {rules.get('hero', 'the main motif')}.\n"
            f"What the wallpaper shows, in the owner's words: {listing.get('description', '')}\n\n"
            f"Write the scene of each of the {len(hands)} frames below. Answer by the schema, one object per slot, in this order.\n\n"
            + "\n\n".join(_hand_lines(h, char_budget(h, listing)) for h in hands))


def claude_executable() -> str:
    """The real claude.exe. On Windows `claude` is a .cmd shim, and cmd.exe would break a multi-line system prompt with quotes, so the exe next to the shim is used."""
    found = shutil.which("claude")
    if not found:
        raise RuntimeError("the `claude` command was not found: install Claude Code or use --writer chat")
    exe = Path(found).parent / "node_modules" / "@anthropic-ai" / "claude-code" / "bin" / "claude.exe"
    return str(exe) if exe.is_file() else found


def call_claude(task: str, wallpaper: Path, model: str = "sonnet") -> Dict[str, Any]:
    """One scripted Claude Code call on the subscription. Returns {"scenes": [...], "usage": {...}}; raises RuntimeError with the reason when it fails."""
    cmd = [claude_executable(), "-p", "--model", model, "--output-format", "json", "--no-session-persistence", "--tools", "Read", "--allowedTools", "Read",
           "--add-dir", str(wallpaper.parent), "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--disable-slash-commands",
           "--setting-sources", "", "--exclude-dynamic-system-prompt-sections", "--system-prompt", brief_text(), "--json-schema", json.dumps(SCHEMA)]
    env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN")}  # the subscription, never a paid key
    with tempfile.TemporaryDirectory(prefix="scene_writer_") as empty:  # an empty working folder: no CLAUDE.md, no memory of this project is loaded
        try:
            proc = subprocess.run(cmd, input=task, capture_output=True, text=True, encoding="utf-8", cwd=empty, env=env, timeout=TIMEOUT_S)
        except FileNotFoundError as exc:
            raise RuntimeError("the `claude` command was not found: install Claude Code or use --writer chat") from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"the scene writer did not answer in {TIMEOUT_S} s") from exc
    try:
        answer = json.loads(proc.stdout)
    except ValueError as exc:
        raise RuntimeError(f"the scene writer returned no JSON (exit {proc.returncode}): {(proc.stderr or proc.stdout).strip()[:400]}") from exc
    if answer.get("is_error"):
        raise RuntimeError(f"the scene writer failed: {str(answer.get('result'))[:400]}")
    data = answer.get("structured_output")
    if data is None:
        data = json.loads(answer["result"])
    usage = answer.get("usage", {})
    tokens = sum(usage.get(k, 0) for k in ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
    return {"scenes": data["slots"], "usage": {"model": model, "tokens": tokens, "list_price_usd": round(answer.get("total_cost_usd", 0.0), 4)}}


def _kit(hand: Dict[str, Any], scene: Dict[str, Any], set_id: str) -> Dict[str, Any]:
    """A kit (the format of specs/design_kits.json) from a hand (decided by code) and a scene (written by the model); the fixed sentences are code's."""
    pose, action = scene.get("life_pose", "").strip(), scene.get("life_action", "").strip()
    if hand["role"] == "life":
        pose = pose.rstrip(".")
        if "face turned away" not in pose:
            pose += FACE_SENTENCE
        pose += "."
    else:
        pose, action = DEFAULT_LIFE_POSE, DEFAULT_LIFE_ACTION
    return {"id": f"{set_id}_{hand['slot']}", "name": scene["name"].strip(), "audience": hand["audience"], "room_type": scene["room_type"],
            "child": {"gender": hand["audience"], "age_band": hand["age"]}, "age": hand["age"], "side": hand["side"], "style": hand["style"],
            "color": (scene.get("color") or hand["color"]).strip(), "lighting": hand["lighting"], "subject": scene["subject"].strip().rstrip("."),
            "room": scene["room"].strip(), "floor": scene["floor"].strip(), "side_wall": scene["side_wall"].strip().rstrip("."), "ceiling": "",
            "light": scene["light"].strip(), "palette": scene["palette"].strip().rstrip("."), "items": scene["items"].strip().rstrip("."),
            "life_pose": pose, "life_action": action.rstrip("."), "toy": hand["toy"]}


def assemble_spec(set_id: str, listing_file: str, listing: Dict[str, Any], hands: List[Dict[str, Any]], scenes: List[Dict[str, Any]],
                  seed: Any, aspect: str = "9:16", model: str = "nano-banana-2-1") -> Dict[str, Any]:
    """The set task (a dict in the format of specs/sets/<set>.json) whose slots carry their kit INSIDE (the scene written for this wallpaper)."""
    by_slot = {s.get("slot"): s for s in scenes}
    missing = [h["slot"] for h in hands if h["slot"] not in by_slot]
    if missing:
        raise ValueError(f"the writer gave no scene for {missing}: it must answer one object per slot {[h['slot'] for h in hands]}")
    video_file = listing_file.replace("_interiors", "_video")
    if not (director.SPECS / video_file).is_file():
        raise ValueError(f"no {video_file} in specs/: a set needs the video spec of its listing (the clip locks), even while video is paused")
    return {"description": f"Designed by scripts/director.py design (seed {seed}): the roles, ages, styles and colours were dealt by code, the rooms written from the "
                           f"picture of the wallpaper by a model; each slot carries its own kit. Re-shoot under a NEW set name.",
            "id": set_id, "listing_spec": listing_file, "video_spec": video_file, "aspect": aspect, "seed": seed if isinstance(seed, int) else 1, "model": model,
            "constraints": {"min_styles": len(hands), "distinct_kits": True, "ages": []},
            "slots": [{"slot": h["slot"], "role": h["role"], "kit": _kit(h, by_slot[h["slot"]], set_id)} for h in hands]}


DENYING = re.compile(r"-free\b|\b(?:no|not|without|never|nothing)\b", re.I)
DENYING_FIELDS = ("subject", "room", "floor", "side_wall", "light", "palette")


def wording_problems(spec: Dict[str, Any]) -> List[str]:
    """A picture model draws what a text NAMES, also when the text denies it ('jute-free rug', 'macramé-free pouf' put a jute and a macramé into the frame: seen twice,
    10-12.11), so the scene fields name only what IS in the room."""
    out = []
    for slot in spec["slots"]:
        kit = slot["kit"]
        for field in DENYING_FIELDS:
            found = DENYING.search(kit[field])
            if found:
                out.append(f"{kit['id']}: {field} names something by denying it ({found.group(0)!r}): say only what IS in the room")
    return out


def design_set(set_id: str, listing_file: str, seed: Any = 1, frames: int = 3, aspect: str = "9:16", writer: str = "claude", model: str = "sonnet",
               scenes_file: Optional[str] = None, runner: Optional[Runner] = None, write: bool = True) -> Dict[str, Any]:
    """Deal, write, check, save. Returns {"status": "ok"|"task_written"|"problems", "spec", "hands", "usage", "problems", "warnings", "path"}.
    A scene that breaks the director's checks is asked for again ONCE with the list of problems; if it still breaks, the problems are returned and nothing is saved."""
    listing = director._load(director.SPECS / listing_file)
    target = director.SPECS / "sets" / f"{set_id}.json"
    if write and target.exists():
        raise ValueError(f"{target.name} already exists: a re-shoot needs a NEW set name (a frame file that exists is reused free and nothing new is made)")
    hands = dealer.deal(listing, set_id, seed, frames, aspect)
    wallpaper = wallpaper_path(listing)
    task = build_task(listing, hands, wallpaper)
    usage: List[Dict[str, Any]] = []
    if scenes_file:
        scenes = json.loads(Path(scenes_file).read_text(encoding="utf-8-sig"))
        scenes = scenes["slots"] if isinstance(scenes, dict) else scenes
    elif writer == "chat":
        folder = PipelineConfig.ROOT_DIR / "runs" / set_id
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / "writer_task.md"
        path.write_text(f"# System rules (specs/{BRIEF_FILE})\n\n{brief_text()}\n\n# Task\n\n{task}\n\n# Answer\n\nA JSON file by this schema:\n\n```json\n{json.dumps(SCHEMA, indent=1)}\n```\n",
                        encoding="utf-8")
        return {"status": "task_written", "path": path, "hands": hands, "usage": [], "problems": [], "warnings": []}
    else:
        answer = (runner or call_claude)(task, wallpaper, model)
        scenes, usage = answer["scenes"], [answer["usage"]]
    problems: List[str] = []
    spec: Dict[str, Any] = {}
    for attempt in (0, 1):
        spec = assemble_spec(set_id, listing_file, listing, hands, scenes, seed, aspect)
        checked = director.validate_spec(spec)
        problems = checked["problems"] + wording_problems(spec)
        if not problems or scenes_file or attempt == 1:
            break
        fix = (task + "\n\nYour previous answer broke these rules, answer again with the SAME fields and change only what is needed:\n- " + "\n- ".join(problems)
               + "\n\nYour previous answer:\n" + json.dumps({"slots": scenes}, ensure_ascii=False))
        answer = (runner or call_claude)(fix, wallpaper, model)
        scenes = answer["scenes"]
        usage.append(answer["usage"])
    result = {"status": "problems" if problems else "ok", "spec": spec, "hands": hands, "usage": usage, "problems": problems,
              "warnings": director.validate_spec(spec)["warnings"] if not problems else [], "path": target}
    if not problems and write:
        spec["design"] = {"seed": seed, "frames": frames, "hands": hands, "writer": {"how": "claude -p (subscription)", "calls": usage}}
        target.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result
