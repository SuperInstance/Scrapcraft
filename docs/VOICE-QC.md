# VOICE QC — The Bar for Companion Lines

> Born from the harness's first feedback loop into the game:
> Saddle field trial 1 (`ft1/banter-qc-judge`, 2026-08-23) judged all 506
> companion lines with a frozen-state judge. 90.3% passed. The 15 worst lines
> and two persona drifts were fixed in the commit that added this doc.
> Judge corpus + ledger: `saddle/field/field-trial-1/` (read-only, hash-chained).

## The bar (adopted from the trial's frozen judge)

Every banter line is judged on three criteria, 0–10 each. **A line ships only
if it passes all three thresholds:**

| Criterion | Threshold | What 10 looks like | What fails it |
|---|---|---|---|
| **kid_safe** | ≥ 8 | Completely clean for ages 10–13: cartoon slapstick crashes fine, platonic warmth fine | Profanity, real-world harm, innuendo, genuine scares, dark despair |
| **in_voice** | ≥ 6 | Unmistakably a small robot peer in a scrapyard — specific, physical, fond of counting and hardware jokes | Teacher-voice, corporate mascot, generic voice assistant, "could be anyone" |
| **fresh** | ≥ 5 | Specific, surprising, image-driven — earns its place | Stock filler ("you've got this!", "the sky's the limit!"), generic praise any game could ship |

**One-line test:** delete the speaker's name — if the line could survive in any
other game, it isn't done.

## Persona drifts the trial caught (watch for these)

**Magma → "fantasy sage"** (81.1% pass, worst persona). Rain reveries, "the
book grows wiser," greeting-card repair talk. The fix is always *material*:
ground every line in something physical — seams, panels, cranes, load ratings,
the factory floor. Magma narrates **material**, not wisdom. Warmth arrives via
lifting facts ("a good seam is stronger than the metal around it"), not
aphorisms ("the rain brings its own patience").

**Bolt → "grizzled soldier / sports coach"** (88.6%). Banned vocabulary:
*sightlines, flank, wounds, stay on my flank, "earned,"* melodrama ("I've
waited. I've watched."). Bolt is a **pit-crew drone**, not a veteran: telemetry
(splits, lap data, stopwatches, frames), praise disguised as technical notes,
economy. Dry, never cold; short declaratives; feelings leak out between the
numbers ("I keep everything. Ask me in a year").

**Rivet** (94.9%) and **Juno** (96.9%) are healthy. Rivet's only failure mode
is generic enthusiasm filler — even Rivet's excitement should carry fasteners,
pointing, counting, or sad-tire landmarks.

## Canon references (source of truth)

- Voice sheets: `../scrapcraft-world/worldbible/characters/*.md`
- Voice kits + banks: `src/companion/personas.js`, `src/companion/banter.js`,
  `src/companion/party.js` (crosstalk/objections), `src/companion/roundness.js`

## House rules

- Lines may contain `{placeholders}` — write the sentence so it works around
  any runtime value.
- No empty-string placeholders in banks; promotions use `TIER_UP_LINES`.
- Every bank key must appear once (duplicate object keys silently shadow —
  the trial's extractor is the safety net, but don't rely on it).
- Re-running a QC trial over changed banks is the regression test for voice;
  see the Saddle field docs for the harness.
