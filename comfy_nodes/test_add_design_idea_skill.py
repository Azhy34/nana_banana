"""Offline tests that keep the skill `add-design-idea` (.claude/skills/) in the shape skill-creator asks for, and its templates working:
frontmatter with `name` and `description` only, a lean SKILL.md, every reference linked from it, no stray files, templates that still pass the checks.

Run: py -3.12 -X utf8 -m pytest comfy_nodes/test_add_design_idea_skill.py -q
"""

import json
import re
from pathlib import Path

from reels_pipeline import carousel

ROOT = Path(__file__).resolve().parent.parent
SKILL = ROOT / ".claude" / "skills" / "add-design-idea"
TRENDS = json.loads((ROOT / "Promt" / "trends.json").read_text(encoding="utf-8"))


def _frontmatter(text):
    match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    assert match, "SKILL.md must start with a YAML frontmatter"
    return dict(re.findall(r"^(\w[\w-]*):\s*(.*)$", match.group(1), re.MULTILINE))


def test_the_frontmatter_has_a_name_equal_to_the_folder_and_a_description_with_the_triggers():
    text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
    front = _frontmatter(text)
    assert set(front) == {"name", "description"}, "skill-creator: no other frontmatter fields"
    assert front["name"] == SKILL.name == "add-design-idea" and re.fullmatch(r"[a-z0-9-]{1,64}", front["name"])
    for trigger in ("референс", "карусель", "Листинг", "Promt/trends.json", "specs/sets"):
        assert trigger in front["description"], trigger
    assert "TODO" not in text


def test_the_body_is_lean_and_every_reference_is_linked_with_a_reason_to_read_it():
    body = (SKILL / "SKILL.md").read_text(encoding="utf-8")
    assert len(body.splitlines()) < 500
    references = sorted(p.name for p in (SKILL / "references").glob("*.md"))
    assert len(references) >= 6
    for name in references:
        line = next((ln for ln in body.splitlines() if f"references/{name}" in ln and "Читать" in ln), None)
        assert line, f"SKILL.md must link references/{name} together with when to read it"
        assert len((SKILL / "references" / name).read_text(encoding="utf-8").splitlines()) < 120, f"{name} is long: split it"


def test_no_stray_files_and_no_deep_nesting():
    allowed_top = {"SKILL.md", "agents", "references", "assets"}
    assert {p.name for p in SKILL.iterdir()} <= allowed_top, "skill-creator: no README, CHANGELOG or other auxiliary files"
    assert not [p for p in (SKILL / "references").iterdir() if p.is_dir()], "references stay one level deep"
    assert (SKILL / "agents" / "openai.yaml").is_file()


def test_the_numbers_of_the_rules_are_not_copied_into_the_skill():
    # the numbers live in Promt/trends.json (staging); a copy here would drift
    text = "\n".join(p.read_text(encoding="utf-8") for p in SKILL.rglob("*.md"))
    for number in ("4.5 by 3.5", "90 cm", "2.8 m"):
        assert number not in text, f"{number!r} belongs to trends.json staging, not to the skill"


def test_the_style_card_template_has_the_fields_of_a_real_card_and_real_colours():
    template = json.loads((SKILL / "assets" / "style-card.template.json").read_text(encoding="utf-8"))
    real = TRENDS["styles"][0]
    assert set(template) == set(real) == {"name", "description", "colors", "avoid"}
    assert template["name"] not in {s["name"] for s in TRENDS["styles"]} and not template["description"].endswith(".")
    assert all(c in {x["name"] for x in TRENDS["colors"]} for c in template["colors"])


def test_the_carousel_template_is_a_working_set():
    template = json.loads((SKILL / "assets" / "carousel-set.template.json").read_text(encoding="utf-8"))
    plan = carousel.plan_carousel(template)
    assert plan["problems"] == [] and len(plan["cards"]) == 7 and plan["type"] == "carousel"       # 2 + 2 photos of the pairs, 3 frames of the pack
