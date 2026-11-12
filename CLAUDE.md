# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Goal of the project (read first)

Moonbloom sells children's-room wallpapers (moonbloomwalls.com and Etsy, Germany and Austria). **This project exists to make content that spreads and sells: viral-grade photos and video, shaped for each platform where we get traffic and buy ads (Pinterest, Meta Instagram/Facebook, Google Ads Shopping and Search, plus Etsy and the site), so that traffic turns into sales.**

Everything in this repository is a tool for that goal: the SPA, the ComfyUI boards, the KIE models, prompts and `trends.json`, the director, `export_ads.py`. Judge every task by the goal, not by the tool:
- Content is made FOR a destination (platform, placement, exact format, `specs/ad_formats.json`). A picture that serves no destination is not made.
- What is "viral" on a platform is learned from its results (ad accounts, GA4), not assumed; wins and failures go into `Promt/trends.json` and the review checklist of the skill `add-design-idea`.
- The measure is traffic and sales per platform, not the number of pictures, tests or features. Credits are spent only on frames that can go into a campaign.
- After this repository the chain continues in the website project `nocode/Etsy` (feed, catalogs, ad accounts, MCP tools): `.claude/skills/add-design-idea/references/destinations-and-pipeline.md`.

## Two tools, one brain (owner 10.11)

- **Brain:** `Promt/trends.json` + `services/promptGenerator.ts`. Every design improvement goes there and works in both tools.
- **Site** (nanabanana-one.vercel.app) = the owner's own tool: quick batches without an agent, Etsy crop, upscale. `docs/spa-architecture.md`.
- **Pipeline** (Python + KIE) = the agent's tool: planned sets for ads (reel, carousel), people from behind, several models with one key, export per destination, the money guard.
- **ComfyUI** is only the window that shows a run. It is frozen: nothing new is built into the boards, the bridge or the nodes.
- One function lives in one place: crop and upscale on the site; sets, export and clips with people in the pipeline.
- **Video is paused** until the first photo set made by this workflow is approved and published.

## Workflow of a photo set (follow in this order; 2-3 owner replies)

The director (`scripts/director.py`, `reels_pipeline/director.py`, `dealer.py`, `scene_writer.py`) spends no credits: a frame = the listing (facts of the wallpaper) + a hand dealt by code (role, age, side, style, colour, hero piece, toy, light) + a room written by a model from the picture of the wallpaper (the kit); older sets use shared kits (`specs/design_kits.json`). Role and framing: `specs/roles.json`.

| # | Who | Action | Result, and when to stop |
|---|---|---|---|
| 1 | agent | Open the wallpaper picture (`wallpaper` of the listing spec). New listing: `scripts/new_listing.py "<wallpaper file>"`, fill `description`, `audience`, `brief.hero`, then `new_listing.py --check listingNN_interiors.json` | Audience (boy, girl, neutral), the hero of the mural and where it sits on the wall are known. Not sure of the audience: ask the owner one question |
| 2 | agent | Destination: `scripts/export_ads.py --registry`. Reels and Stories: 9:16, set type `reel`. Meta carousel: type `carousel`, 4:5 | A format. A picture without a destination is not made |
| 3-4 | agent | ONE command: `py -3.12 -X utf8 scripts/director.py design <new set name> --listing listingNN_interiors.json [--seed N]`. Code deals 3 frames (a child at the mural, the room alone, another person and age; three styles, both camera sides; the role fits the audience), a scripted `claude -p` on the SUBSCRIPTION (Sonnet, about 20 thousand tokens, no credits) looks at the wallpaper and writes the rooms, the director checks them (one retry) and saves `specs/sets/<set>.json` with the rooms inside. Not happy with the rooms: another `--seed` under a NEW name. `claude` unavailable: `--writer chat`, then `--scenes <file>` | The set file and 3 lines per frame. A set name is never overwritten: a frame file that exists is reused for free |
| 5 | agent | `py -3.12 -X utf8 scripts/run_set.py <set> --until photos --round 1` (free: plan, build, board, check against ComfyUI, dry run, live quote; at most 30 lines) | No problems and a quote N. Problems: fix the data and repeat. Do not write code or tests to get past a problem |
| 6 | agent to owner | One message: 3 lines per frame (room: style, colour, main piece; person and action; camera and which part of the mural is in the frame), the quote N and the balance. The full prompt (`director.py show <set> sN`) only when asked | Wait |
| 7 | owner | "yes N" or changes | Changes: back to 3-4 (a new seed or a hand-edited set under a new name) |
| 8 | agent | `py -3.12 -X utf8 scripts/run_board.py photos --paid nb21 --confirm N` | Pays only when N equals the live quote. After an interrupted run: check the queue, the balance and the KIE task first |
| 9 | agent | Look at every frame, 5 points: the mural unchanged and floor to ceiling; the hero of the mural visible and not covered; no face; the age of the child and of the furniture agree; nothing banned (rule 4). One line per frame to the owner: usable or not, and why | Do not regenerate without a command |
| 10 | owner | Picks the frames | |
| 11 | agent | `scripts/export_ads.py <set>` (the plan), `--write` on the owner's word. Journal: 3 lines in `docs/journal/` (set, credits, verdict) | Done. Upload to the platforms is a separate step |

**Which model does what.** Prompts for pictures are built by code, free. The rooms are written by the scripted call inside `design` (Sonnet on the owner's subscription, about 20 thousand tokens a set; never Haiku for design). This chat only runs the two or three commands, shows the scenario and looks at the frames: an ordinary set can be run on Sonnet, the strongest model is for investigations and for new logic. A new wallpaper needs one look at the picture by whoever fills `audience` and `brief.hero` of the listing.

## Standing rules (the whole list; a rule that is not here does not exist)

**The frame**
1. The wallpaper is the product: it is sent only as the reference image and is reproduced unchanged, floor to ceiling, at its true scale. The prompt describes the room, never the mural.
2. A tall frame (9:16, 2:3, 4:5) shows a floor-to-ceiling SECTION of the mural wall around its hero; a wide frame (4:3, 1.91:1, 1:1) shows the whole wall. Data: `trends.json` `staging.framingTall` and `tallRatios`, `specs/roles.json` `framing`.
3. A furnished, lived-in children's room, not an empty one: the main piece of the child's age along a side wall, at most two accessories beside it, the child's toys on a rug. Near the mural wall everything is lower than 90 cm; nothing stands in front of the mural or hangs on it.
4. Banned in a scene: baskets, wicker, rattan, woven straw; pendant and hanging lamps; house-frame, metal and adult beds; a wardrobe, a teepee, a table with chairs; anything draped or lying about.
5. Age first: the child, then a room of that age with real bed sizes, then toys of that age. The audience (boy, girl, neutral) comes from the wallpaper.
6. People only from behind. No face and no profile, without exceptions.
7. The camera is turned 20 to 30 degrees toward the mural wall, never frontal. A real photograph in warm natural light. Positive wording; a brief prompt has no Avoid list.
8. A reel set is 3 frames of different designs: three styles, both camera sides, different people. The same composition in other colours is a carousel.

**Money and process**
9. A paid run only on the owner's "yes N", N equal to the live quote; a free dry run first; 2K minimum; one frame first when the design is new.
10. A feedback message is not a command to regenerate: ask what to redo.
11. Facts about ComfyUI and KIE come from primary sources by exact address (live `/object_info`, the KIE model schema in `api_truth/kie`, official docs by URL), not from search or memory.
12. Keys only from `.env.local`, never printed. ComfyUI is started and stopped by the owner. No third-party MCP in the pipeline, no ComfyUI partner nodes.
13. Use the commands, not hand-written scripts. Short answers. The journal gets at most 3 lines per paid run.
14. Stop rule against bloat: a new code check, data file or test is added only after the same mistake happened twice. Before that it is one line in this list. A problem of a set is fixed in data, not in code.
15. Commit and push only on the owner's word. The site is deployed from `main`.

**Video (paused)**
16. When it resumes: 720p minimum, Kling 2.6 (Grok is out), no plain zoom or push-in, clips only from approved frames, the owner assembles the reel. The open questions are listed in `AGENTS.md`.

## Commands

```bash
npm install       # Install dependencies
npm run dev       # Vite dev server on http://localhost:3000 (no /api routes)
npx vercel dev    # Dev server including the /api serverless functions
npm run build     # Production build (outputs to dist/)
npm run preview   # Preview production build locally

npm run test:e2e        # Playwright: ui (all AI providers mocked) + api, against a local keyless build
npm run test:e2e:prod   # same suites against https://nanabanana-one.vercel.app (no paid calls)
npm run test:e2e:live   # free read-only checks with real keys from .env.local (key validity, model access)
```

E2E tests live in `e2e/` (`support/fixtures.ts` blocks every unmocked request to OpenRouter, Gemini, Replicate, Vercel Blob and `/api/*`). No linter is configured.

### ComfyUI + KIE Reels Pipeline (Python, outside the SPA)

ComfyUI Desktop (orchestrator only, port 8188) + KIE (one key, one `createTask`/`recordInfo` for every model): photos on Nano Banana 2/2.1, GPT Image 2, Grok Imagine 2.0 Edit; video on Kling 2.6. Two permanent boards (`Moonbloom Фото`, `Moonbloom Видео`, one tab each) opened by the agent through the bridge (`comfy_nodes/bridge_logic.py` + `web/moonbloom_ui.js`). The wallpaper is the PRODUCT and is sent only as the reference image; the prompt adds only the design.

**Do not hand-write steps, use the commands** (`py -3.12 -X utf8 ...`; details in `.agents/skills/kie-add-model/SKILL.md`):
- `scripts/run_board.py photos|video [--paid all --confirm N] [--reload]`: open the board, wait, table, contact sheet. Free dry run by default.
- `scripts/add_model.py <kie model> [--write --tag t]`: can the pipeline use this model, what is the price per size; registers it.
- `scripts/comfy_node_info.py card <Node> | kie <model> | prices`: capabilities and live prices. `scripts/build_comfy_workflows.py --verify-live`: check the boards against the running ComfyUI.
- `scripts/director.py plan|build|show|photos|pick <set>` and `card <spec> <card>`: the director of a set of photos. Two kinds of set: a reel (3 photos 9:16 of different designs from design kits + roles, one round on the board; clips later, when video resumes) and a carousel (pairs of ONE composition in other interior colourways, a format per pair, e.g. 9:16 and 4:5). Data in `specs/sets/`, `specs/design_kits.json`, `specs/roles.json`. `scripts/new_listing.py <wallpaper>` starts a new listing spec (facts only).
- **New idea, reference photo, listing or set format: use the skill `.claude/skills/add-design-idea/SKILL.md`** (what type the idea is, which file gets it, the free checks, the paid-test rule, how to judge frames).
- **Where a picture goes** (a frame is generated FOR a destination: Meta feed 4:5, Reels/Stories 9:16, Pinterest 2:3, Google Search 1.91:1/1:1, Etsy 4:3, the feed): registry `specs/ad_formats.json` (`destinations`: ratio, pixels, why, goes_to, how), code `reels_pipeline/destinations.py`, a set says `for: [destination, ...]` (one frame per ratio, a "pack" = one design in several sizes) and a frame is named `<set>_<pair><n>_<colour>_<platform>_<ratio>`. `scripts/export_ads.py <set> [--write]` cuts the delivery files into `exports/` (exact ratio, JPEG, IPTC AI label Google Merchant requires) with a `manifest.json`; it uploads nothing (step B, not built). Chain and rules: `.claude/skills/add-design-idea/references/destinations-and-pipeline.md`. The feed `moonbloomwalls.com/google_shopping_feed.xml` lives in the website project `nocode/Etsy/site` and feeds Meta, Google and Pinterest; the FIRST image of an item sets the ratio of a Meta carousel.
- Tests: NOT a routine step, see **Tests policy** below. `scripts/test_policy.py` says in one line what (if anything) to run for the current changes.

**Tests policy** (owner 06.11: tests are for a NEW node or logic, not for every round). Default run `pytest` = the CORE only (67 money/safety tests, ~5 s, `pytest.ini`: `-m core`); the other 226 stay on disk, `pytest -o addopts="" <files>` runs an area.

| Situation | Tests |
|---|---|
| Everyday work: generation, edits of data (`trends.json`, specs, sets, listings), documents, skills, memory | **None.** The process checks itself: `director.py plan\|show\|card`, `build_comfy_workflows.py --verify-live`, `run_board.py` dry run (live price, request vs KIE schema, balance); a paid run starts only when the confirmed number equals the live quote |
| Edit of the paid-path code (payment, quote, `--paid`, bridge, KIE request, `dry_run` default) | The CORE once after the edit: `pytest` (one line of result) |
| NEW node, KIE model, set type or builder logic | **Acceptance once**: tests of that area + 2-4 new tests of the new thing only + `--verify-live` + dry run + one paid trial frame on the owner's "yes". Afterwards the area is not re-run. `test_policy.py --new --run` picks the area's files |
| A mistake of the paid path that cost credits (wrong quote, wrong bill, double pay) | One regression test of that mistake, marked `core` |
| A design mistake in a frame (a banned thing, a wrong age, clutter) | No test and no new check: one line in Standing rules; code only after it happened twice (rule 14) |

Not done: tests "just in case", tests after a prompt/data/doc edit, narrating test results. After the work: `test_policy.py --run` (quiet) moves the "accepted" baseline.

**Rules:** the one list is **Standing rules** above. Kling prompts, when video resumes: `.agents/skills/creative-ad-auditor`.

Map and traps: `.agents/skills/comfy-pipeline/SKILL.md` (short), `reference.md` (full). Current state: [AGENTS.md](AGENTS.md). Journal by date: `docs/journal/` (grep it, do not read it whole).


