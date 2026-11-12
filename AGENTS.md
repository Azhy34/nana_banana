# Current state (short). The rules and the workflow are in CLAUDE.md

The dated journal lives in `docs/journal/` (one file per month, newest entry first; `docs/journal/2026-11.md` holds everything up to 10.11). Do not read it whole: grep it for a listing, a model or a date. A new entry is at most 3 lines per paid run: what, credits spent, verdict.

## Where we are (2026-11-11)

- **Decision of the owner (10.11):** two tools, one brain. The brain is `Promt/trends.json` + `services/promptGenerator.ts`. The site is the owner's own tool. The Python pipeline with KIE is the agent's tool. ComfyUI is only the window of a run and is frozen: nothing new is built into the boards.
- **Restore point:** branch `snapshot/comfy-2026-11-10` (commit e2d4608) is the state before the simplification. Work continues in `work/simplify-2026-11`. `main` is what the site is deployed from: commit and push there only on the owner's word.
- **Frame rules changed (10.11):** a furnished room instead of an "almost empty" one; a tall frame (9:16) shows a floor-to-ceiling section of the mural, a wide frame the whole wall. Data: `trends.json` `staging`, `specs/roles.json` `framing`, `brief.wall_rule` of the listings.
- **Director v2 (12.11):** `director.py design <new set> --listing <spec> [--seed N]`: code deals the hands (`reels_pipeline/dealer.py`), a scripted `claude -p` on the subscription writes the rooms from the picture (`reels_pipeline/scene_writer.py`, rules in `specs/scene_writer_brief.md`, cut down to about 8 thousand tokens of context instead of 590 thousand: empty folder, no MCP, no skills, no settings, one tool Read), the director checks and saves the set with its rooms inside. Typical run: 1-2 calls, 18-26 thousand tokens, 20-40 s. Tests: 4 new in `test_director.py`.
- **Check sets (Listing 7, both ready, nothing paid, each 18 credits at the live quote):** `l7_reel02` (rooms written by hand by me on 11.11) and `l7_reel03` (rooms by `design`, seed 73). The active board holds `l7_reel03`; put the other back with `director.py photos l7_reel02 1`. Compare by eye after paying: do the rooms differ, is the mural open, is the colour in tune with the mural.
- **Video resumed 12.11 for Listing 31 (owner).** Rule 17 of CLAUDE.md: the mural never moves. New: `reels_pipeline/mural_lock.py` (+ `scripts/lock_clip.py`, node input `motion_zone`, slot field `motion_zone` / `min_motion_delta` in the set): after the paid download the file keeps the first frame everywhere except the motion zone, the model's file is kept as `__raw.mp4`. Proven offline on the old Listing 7 Kling clip (the painted balloon had drifted up): the locked file's wall differs from its first frame by 0.098 grey levels (codec noise). Only for a LOCKED camera. `l31_reel01` s1 (a boy draws, camera still) carries a zone and is on the video board; s2 (a walk-in) cannot be locked, so it is not paid until the owner decides (a locked-camera light clip instead).
- **Balance:** 1039 credits on 12.11 (the owner topped up), Kling 2.6 5 s = 63.
- **Archive:** `archive/` holds 31 one-off scripts and two unused modules (`api.py`, `comfy_client.py`). Nothing imports them.

## Open, in this order

0. Listing 31: s1 is good, s2 lacks its main piece (the cot) and has a heavy terracotta floor; the owner decides whether to redo s2 (6 credits, a NEW set name). Frames are in `Desktop\Обои\Листинг 31`; `l7_reel02` and `l7_reel03` (18 credits each) are ready and unpaid.

1. Show the owner the scenario of `l7_reel03` (and `l7_reel02`) with the live quote, pay on "yes N", judge the frames against the old ones in `Desktop\Обои\Листинг 7`.
2. If the frames are approved: commit to `main` and push on the owner's word (the working tree also carries the Omni duration fix of the site).
3. Stage 2, when video resumes (not before): `director.py clip <set> <slot>`: a model looks at the FINISHED frame and picks one camera move and one light motion from `specs/video_motion.json` (status ok only) and writes one action from the pose on the frame; code builds the clip prompt with the positive freeze sentences and checks the banned moves. Same cut-down scripted call as `scene_writer.py`.
4. Publish the first set and record what the platform shows. Until then nobody knows which frames sell.

## Known, not fixed

- `workflows/listing45_*_api.json` (old graphs, three of them with `dry_run: false`) are still written by `scripts/build_comfy_workflows.py`. Do not queue them by hand: they pay.
- Site e2e: 4 tests fail and failed before 10.11 (Generator logs an event twice; Batch cards stuck in "Generating..." after a reload; the Gemini negative prompt is dropped). List in `docs/spa-architecture.md`.
- Prices sit in four places and model lists in seven (`kling_bridge.py`, `kie_generator.py`, `live_price.py`, specs). The live price is the truth; merging them touches the paid path and is not planned now.

## Open video questions (decide when video resumes, not before)

1. Camera speed: "ultra-slow push-in" (creative-ad-auditor) against "never very slowly" (owner 08.11) against the ban on push-in and zoom.
2. Camera with a person in the frame: still (CLAUDE.md) or a glide (the Listing 2 mother clip the owner liked).
3. Shadows on the mural wall: the owner liked the branch shadow of Listing 2; one clip prompt forbade it.
4. Clip length: 4 s or 5 s.
5. Neither Kling 2.6 nor Grok keeps the wall still (measured 08.11); Omni 1.2 held it in two clips of 10.11. Kling on the same frame was not run.
