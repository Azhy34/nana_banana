# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Goal of the project (read first)

Moonbloom sells children's-room wallpapers (moonbloomwalls.com and Etsy, Germany and Austria). **This project exists to make content that spreads and sells: viral-grade photos and video, shaped for each platform where we get traffic and buy ads (Pinterest, Meta Instagram/Facebook, Google Ads Shopping and Search, plus Etsy and the site), so that traffic turns into sales.**

Everything in this repository is a tool for that goal: the SPA, the ComfyUI boards, the KIE models, prompts and `trends.json`, the director, `export_ads.py`. Judge every task by the goal, not by the tool:
- Content is made FOR a destination (platform, placement, exact format, `specs/ad_formats.json`). A picture that serves no destination is not made.
- What is "viral" on a platform is learned from its results (ad accounts, GA4), not assumed; wins and failures go into `Promt/trends.json` and the review checklist of the skill `add-design-idea`.
- The measure is traffic and sales per platform, not the number of pictures, tests or features. Credits are spent only on frames that can go into a campaign.
- After this repository the chain continues in the website project `nocode/Etsy` (feed, catalogs, ad accounts, MCP tools): `.claude/skills/add-design-idea/references/destinations-and-pipeline.md`.

## Workflow of the content work (follow the steps in this order)

0. **Look at the wallpaper first** (the picture, not the file name): palette, motif, mood, and WHO the room is for: `audience` = `boy` | `girl` | `neutral` in `specs/listingNN_interiors.json` (cold blue/grey/green + balloons, cars, space, animals = boy or neutral; pink, lilac, flowers = girl). Not sure: **ask the owner one question** before anything else. The director refuses kits that do not suit the audience and kits already used in the reel of another listing.
1. **For which platform and placement** is the content (`specs/ad_formats.json`)? A picture that serves no destination is not made.
2. **Design for that audience and age**: style and colours from `Promt/trends.json`, a kit from `specs/design_kits.json` (reels) or the pair of a carousel; real toys of the child's age; faces never shown (from behind only).
3. **Plan, free:** `scripts/director.py plan <set>` (variety rules for a reel: different styles, both camera sides, different people; no repeats).
4. **Show the owner the scenario and style in the chat** (room, light, camera, person, action, cost). Wait for the OK.
5. **Pay only on the owner's "yes" with the credit number** equal to the live quote (`run_board.py ... --paid ...` prints it, `--confirm N` pays). One frame first when the design is new.
6. **Judge the frames by eye** (clutter, faces, age, mural proportions) before any clip; record the result in `AGENTS.md`.
7. **Clips (Kling) only for approved frames**, camera still when a person is in the frame; the owner assembles the reel.
8. **Export** (`scripts/export_ads.py`) and, in a separate step, upload to the platforms.

The website (SPA) of this repository is only one of the tools: `docs/spa-architecture.md`.

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
- `scripts/director.py plan|build|show|photos|pick <set>` and `card <spec> <card>`: the director of a set of photos. Two kinds of set: a reel (6 photos 9:16 planned with their clips from design kits + roles; the owner picks 3, they are animated, the owner assembles the reel) and a carousel (pairs of ONE composition in other interior colourways, a format per pair, e.g. 9:16 and 4:5). Data in `specs/sets/`, `specs/design_kits.json`, `specs/roles.json`. `scripts/new_listing.py <wallpaper>` starts a new listing spec (facts only).
- **New idea, reference photo, listing or set format: use the skill `.claude/skills/add-design-idea/SKILL.md`** (what type the idea is, which file gets it, the free checks, the paid-test rule, how to judge frames).
- **Where a picture goes** (a frame is generated FOR a destination: Meta feed 4:5, Reels/Stories 9:16, Pinterest 2:3, Google Search 1.91:1/1:1, Etsy 4:3, the feed): registry `specs/ad_formats.json` (`destinations`: ratio, pixels, why, goes_to, how), code `reels_pipeline/destinations.py`, a set says `for: [destination, ...]` (one frame per ratio, a "pack" = one design in several sizes) and a frame is named `<set>_<pair><n>_<colour>_<platform>_<ratio>`. `scripts/export_ads.py <set> [--write]` cuts the delivery files into `exports/` (exact ratio, JPEG, IPTC AI label Google Merchant requires) with a `manifest.json`; it uploads nothing (step B, not built). Chain and rules: `.claude/skills/add-design-idea/references/destinations-and-pipeline.md`. The feed `moonbloomwalls.com/google_shopping_feed.xml` lives in the website project `nocode/Etsy/site` and feeds Meta, Google and Pinterest; the FIRST image of an item sets the ratio of a Meta carousel.
- Tests: NOT a routine step, see **Tests policy** below. `scripts/test_policy.py` says in one line what (if anything) to run for the current changes.

**Tests policy** (owner 06.11: tests are for a NEW node or logic, not for every round). Default run `pytest` = the CORE only (59 money/safety tests, ~5 s, `pytest.ini`: `-m core`); the other 177 stay on disk, `pytest -m ""` runs all.

| Situation | Tests |
|---|---|
| Everyday work: generation, edits of data (`trends.json`, specs, sets, listings), documents, skills, memory | **None.** The process checks itself: `director.py plan\|show\|card`, `build_comfy_workflows.py --verify-live`, `run_board.py` dry run (live price, request vs KIE schema, balance); a paid run starts only when the confirmed number equals the live quote |
| Edit of the paid-path code (payment, quote, `--paid`, bridge, KIE request, `dry_run` default) | The CORE once after the edit: `pytest` (one line of result) |
| NEW node, KIE model, set type or builder logic | **Acceptance once**: tests of that area + 2-4 new tests of the new thing only + `--verify-live` + dry run + one paid trial frame on the owner's "yes". Afterwards the area is not re-run. `test_policy.py --new --run` picks the area's files |
| A mistake that cost credits | One regression test of that mistake (mark `core` if it guards money) |

Not done: tests "just in case", tests after a prompt/data/doc edit, narrating test results. After the work: `test_policy.py --run` (quiet) moves the "accepted" baseline.

**Rules:** facts about ComfyUI and KIE come from primary sources by exact address (live `/object_info`, KIE model schema `api_truth/kie`, official docs by URL), not from semantic search or memory; paid calls only with the owner's "yes" and the credit number (live quote, `dry_run` first); 2K minimum; every paid picture a usable ad creative (different designs); no third-party MCP, no ComfyUI partner nodes; keys only from `.env.local`, never printed; **faces of people are never shown in frame** (only from behind or in a half-turn, never in profile); plain zoom/push-in is not ordered from Kling. Kling prompts per `.agents/skills/creative-ad-auditor`.

Map and traps: `.agents/skills/comfy-pipeline/SKILL.md` (short), `reference.md` (full). Journal by date: [AGENTS.md](AGENTS.md).


