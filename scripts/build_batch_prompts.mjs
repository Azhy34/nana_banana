#!/usr/bin/env node
/**
 * Build Batch Generator prompts WITHOUT copying the prompt logic.
 *
 * services/promptGenerator.ts (buildGeminiPrompt) is the source of truth for photo prompts
 * (5-layer structure, furniture bans, full-height wall, Craft Lambda lighting). This script
 * bundles that file in memory with esbuild (already a Vite dependency) and calls it, so the
 * Python pipeline and ComfyUI nodes always get exactly what the web app would produce.
 *
 * Input  (stdin, JSON):  { "aspect_ratio": "9:16", "cards": [ { "id": "...", "ageGroup": "vorschul", "tags": { ...overrides }, "seed": 0 } ] }
 * Output (stdout, JSON): [ { "id", "tags", "prompt" } ]
 *
 * `tags` overrides replace the random picks of generateRandomTags() so a card is reproducible;
 * anything not overridden stays random exactly as in the app, unless the card (or the spec) has a `seed`:
 * then the leftover random picks are deterministic too (same card + seed = same prompt).
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const spec = JSON.parse((await readStdin()) || '{}');
const cards = Array.isArray(spec.cards) ? spec.cards : [];
if (cards.length === 0 && !spec.options && !spec.brief && !spec.briefTexts) {
  console.error('spec.cards is empty');
  process.exit(2);
}

// Random app fragments that clash with a soft or custom design (card.cleanRandomDetails = true). They are the random toys and decor of
// the preschool age group, read from Promt/trends.json (the single source), so a change of those lists can never leave a stale phrase here.
const trendsData = JSON.parse(fs.readFileSync(path.join(root, 'Promt', 'trends.json'), 'utf8'));
const CLEAN_STRIP = [...(trendsData.ageGroups?.vorschul?.toys ?? [])];
const CLEAN_STRIP_REGEX = [String.raw`\s?Subtle accents of [^.]*\.`];

const bundle = await build({
  entryPoints: [path.join(root, 'services', 'promptGenerator.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  logLevel: 'silent',
  loader: { '.json': 'json' },
});

const mod = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(
  mod,
  mod.exports,
  createRequire(import.meta.url),
);
const { generateRandomTags, buildGeminiPrompt, buildBriefPrompt, BRIEF_TEXTS, TAG_OPTIONS, getKeyObjectsForAge } = mod.exports;

// Brief mode: the short prompt of the boards (spec.brief = a list of inputs of buildBriefPrompt). One answer per input, in order:
// {"text"} or {"error"} (a bad input is the caller's ValueError, it must not stop the others). spec.briefTexts: the fixed sentences.
if (spec.briefTexts) {
  process.stdout.write(JSON.stringify(BRIEF_TEXTS));
  process.exit(0);
}
if (spec.brief) {
  const answers = spec.brief.map(input => {
    try {
      return { text: buildBriefPrompt(input) };
    } catch (error) {
      return { error: String(error.message ?? error) };
    }
  });
  process.stdout.write(JSON.stringify(answers));
  process.exit(0);
}

// Options mode: the dropdown lists of the app's Batch card, for the ComfyUI "Design" node.
if (spec.options) {
  const keyObjectsByAge = Object.fromEntries(TAG_OPTIONS.ageGroups.map(a => [a, getKeyObjectsForAge(a)]));
  process.stdout.write(JSON.stringify({ ...TAG_OPTIONS, keyObjectsByAge }));
  process.exit(0);
}

const aspect = spec.aspect_ratio ?? '9:16';

// Optional seed (card.seed, else spec.seed): the app's random picks (brand, toys, decor...) are all Math.random calls inside
// promptGenerator.ts. With a seed Math.random is replaced by a small deterministic generator ONLY while this card's prompt is
// built, so the same card + seed always gives the same prompt (a dry run and the paid run, today and after a restart) and a
// different seed re-rolls it. The seed is mixed with the card id, so two cards with seed 0 do not share one sequence.
// Without a seed nothing changes: Math.random stays the real one (CLI default, the web app is not touched at all).
function seededRandom(seed, id) {
  let h = 1779033703 ^ String(id).length;
  for (const ch of `${seed}|${id}`) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { // mulberry32
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const result = cards.map((card, i) => {
  const seed = card.seed ?? spec.seed;
  const realRandom = Math.random;
  // `seedKey` (optional) replaces the card id in the seed: cards of one PAIR share it, so their random leftovers (toy, brand, light detail) are
  // identical and only what the cards pin (the colour) differs.
  if (seed !== undefined && seed !== null) Math.random = seededRandom(seed, card.seedKey ?? card.id ?? i);
  let tags, prompt;
  try {
    tags = { ...generateRandomTags(aspect, card.ageGroup ?? spec.ageGroup), ...(card.tags ?? {}) };
    tags.aspectRatio = aspect;
    prompt = buildGeminiPrompt(tags);
  } finally {
    Math.random = realRandom;
  }
  // Optional per-card clean-up of random fragments that contradict the card (spec: "strip" = literal phrases,
  // "stripRegex" = regular expressions). The app picks toys/decor at random inside buildGeminiPrompt.
  if (card.cleanRandomDetails) {
    card.strip = [...(card.strip ?? []), ...CLEAN_STRIP];
    card.stripRegex = [...(card.stripRegex ?? []), ...CLEAN_STRIP_REGEX];
  }
  for (const frag of card.strip ?? []) {
    // every occurrence goes: a fragment can be both a random decor item and a random accessory of the same prompt
    for (const variant of [`${frag}, `, `, ${frag}`, frag]) {
      while (prompt.includes(variant)) prompt = prompt.replace(variant, '');
    }
  }
  for (const pattern of card.stripRegex ?? []) prompt = prompt.replace(new RegExp(pattern, 'g'), '');
  for (const [from, to] of card.replace ?? []) prompt = prompt.split(from).join(to); // literal find-and-replace
  if (card.strip || card.stripRegex) prompt = prompt.replace('details: and a plush', 'details: a plush');
  // Optional per-card free text from the spec ("extraPrompt"): inserted before the final "Avoid:" list so the
  // negative list stays last. buildGeminiPrompt itself is not touched.
  if (card.extraPrompt) {
    const at = prompt.lastIndexOf(' Avoid:');
    prompt = at >= 0 ? `${prompt.slice(0, at)} ${card.extraPrompt}${prompt.slice(at)}` : `${prompt} ${card.extraPrompt}`;
  }
  // Owner rule 04.11: faces of people are never shown. If the card has a person (its extraPrompt names one), say how the
  // person is shown; in every card the face terms close the Avoid list. buildGeminiPrompt itself is not touched.
  if (card.extraPrompt && /\b(woman|man|person|people|mother|father|child|boy)\b/i.test(card.extraPrompt)) {
    const at = prompt.lastIndexOf(' Avoid:');
    const rule = ' PEOPLE RULE: any person is shown strictly from behind or in a half-turn from behind; no part of the face is visible, not even in profile; the person never looks toward the camera.';
    prompt = at >= 0 ? `${prompt.slice(0, at)}${rule}${prompt.slice(at)}` : `${prompt}${rule}`;
  }
  prompt = prompt.replace(/\.\s*$/, ', visible human face, face in profile, person looking at the camera, front view of a person.');
  return { id: card.id ?? `card_${String(i + 1).padStart(2, '0')}`, tags, prompt };
});

process.stdout.write(JSON.stringify(result));
