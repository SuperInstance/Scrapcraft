/**
 * ───────────────────────────────────────────────────────────────────────────
 *  COLDSTART — the minute-one voices, as data + gates (headless, no DOM)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The campaign bible's heart: Earl conscripts the kid before the first mine
 * ends, and Spark says hi the moment the kid hauls their first scrap. This
 * module holds the copy and the once-ever gates so the beats are:
 *   - testable (inject a Map as storage, no browser needed)
 *   - never repeating (localStorage-persisted, stats-guarded feel)
 *
 * Used by Foreman.greetPlayer(), Game's first-item pickup hook, and the
 * 2-step OnboardingWizard.
 */

// ── Earl at spawn — the conscription (campaign.md Ch 1, the heart) ─────────

export const EARL_CONSCRIPTION_LINES = [
  "So you finally showed up. The junk's been piling up waiting for someone with thumbs. Mine me five iron off those rust heaps — hold left-click and get to work.",
  "Welcome to the most beautiful disaster you've ever seen, rookie. Your first job's simple: five iron scrap. Hold left-click to dig, don't let go 'til it pops.",
  "Name's Earl. I run this place. Don't touch the blue drum. DO bring me five iron scrap before lunch — left-click mines, grab what you can carry.",
];

// ── Earl points the way to a real build ────────────────────────────────────

export const EARL_SMELTER_HINT =
  "Robot arm, huh? Want to build something that actually grabs stuff? Head east along the junk-lanterns — the Smelter's got better parts waiting.";

export const EARL_STARTER_BOT_QUIPS = [
  "It'll work, but not as clean as the Smelter's. Good enough for a first build, kid.",
  "Gate Edition. She's a little rough, a little slow, and she's YOURS. The Smelter down the east path builds 'em proper when you're ready.",
];

// Earl on the junk-lantern trail he rigged along the east path
export const EARL_BREADCRUMB_QUIP =
  "Those junk-lanterns? Rigged 'em myself years back. Mark the east path to the Smelter. Follow 'em if you're looking to upgrade.";

// ── Spark's first appearance — first item pickup, works offline ────────────
// Spark never opens with the answer; it opens with the wonder (spark-personality.md).

export const SPARK_FIRST_GREETING_IRON =
  "That's iron! Good eye. I'm Spark — I help bots learn to think. Build one up, and we'll teach it something cool. ⚡";

export const SPARK_FIRST_GREETING_GENERIC =
  "Ooh, nice find! I'm Spark — I help bots learn to think. Keep hauling scrap and we'll build one a brain. ⚡";

/** The right greeting for whatever the kid picked up first. */
export function sparkFirstGreeting(itemId) {
  return itemId === 'iron_scrap' ? SPARK_FIRST_GREETING_IRON : SPARK_FIRST_GREETING_GENERIC;
}

// ── The once-ever gates ─────────────────────────────────────────────────────

const KEY_EARL  = 'scrapcraft_earl_greeted';
const KEY_SPARK = 'scrapcraft_spark_greeted';

/**
 * One-shot ceremony gates for the two cold-start voices. Storage is
 * injectable (localStorage in the game, a Map in tests). Falls back to
 * in-memory flags when no storage exists so headless callers still get
 * fires-once-per-instance semantics.
 */
export class ColdStartGate {
  constructor(storage = null) {
    this._storage = storage;
    this._mem = { earl: false, spark: false };
  }

  static browser() {
    return new ColdStartGate(
      typeof localStorage !== 'undefined' ? localStorage : null,
    );
  }

  _flag(key, memKey) {
    if (this._storage) {
      try { return this._storage.getItem(key) === '1'; } catch { /* fall through */ }
    }
    return this._mem[memKey];
  }

  _set(key, memKey) {
    this._mem[memKey] = true;
    try { this._storage?.setItem(key, '1'); } catch { /* corrupt-world tolerant */ }
  }

  get earlGreeted()  { return this._flag(KEY_EARL, 'earl'); }
  markEarlGreeted()  { this._set(KEY_EARL, 'earl'); }

  get sparkGreeted() { return this._flag(KEY_SPARK, 'spark'); }
  markSparkGreeted() { this._set(KEY_SPARK, 'spark'); }
}
