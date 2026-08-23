/**
 * Campaign data — the whole quest campaign as declarative JSON (lau-quest
 * pattern: quests are data files, not code). 63 quests: Earl's 20-quest chain
 * (converted), four companion arcs of 5 (Bolt's racing, Magma's workshop,
 * Juno's exploration, Rivet's yard), the Midnight Race finale gated on any
 * two completed arcs (the worldbible's campaign payoff), nine lived chapter
 * quests (ch7–9, Earl-voiced), twelve companion side-quests (3 beats × 4
 * personas, friend-gated), and the second-arc hook yard-1. (The spec's
 * "64" miscounts its own breakdown: 20+20+1+9+12+1 = 63.)
 *
 * Import attributes (`with { type: 'json' }`) work in both Vite and Node 22,
 * so the same loader serves the game and the test harness.
 */

import earlChain from './earl-chain.json' with { type: 'json' };
import boltArc from './bolt-arc.json' with { type: 'json' };
import magmaArc from './magma-arc.json' with { type: 'json' };
import junoArc from './juno-arc.json' with { type: 'json' };
import rivetArc from './rivet-arc.json' with { type: 'json' };
import finale from './finale.json' with { type: 'json' };
import chapterQuests from './chapter-quests.json' with { type: 'json' };
import sideQuests from './side-quests.json' with { type: 'json' };
import yardArc from './yard-arc.json' with { type: 'json' };
import spineFile from './spine.json' with { type: 'json' };

export const CAMPAIGN = [
  ...earlChain.quests,
  ...boltArc.quests,
  ...magmaArc.quests,
  ...junoArc.quests,
  ...rivetArc.quests,
  ...finale.quests,
  ...chapterQuests.quests,
  ...sideQuests.quests,
  ...yardArc.quests,
];

/** THE SPINE — the bible's twelve chapters as a chapter map over CAMPAIGN
 *  (references existing quest ids; never new content). See docs/SPINE.md. */
export const SPINE = spineFile.chapters;
