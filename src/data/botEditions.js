/**
 * Bot editions — same bones, different refinement.
 *
 * The Yard Gate workbench builds the "Gate Edition" starter bot: identical
 * ingredients to the Smelter's ScrapBot, slightly less machine (Earl: "It'll
 * work, but not as clean as the Smelter's"). Numbers live here so the
 * weaker-not-worse contract is data, testable headless.
 */

export const BOT_EDITIONS = {
  standard: {
    id: 'standard',
    label: 'ScrapBot',
    speedMult: 1.0,
    batteryDrainMult: 1.0,
    bodyColor: 0x7A8A9A,
  },
  gate: {
    id: 'gate',
    label: 'Starter ScrapBot (Gate Edition)',
    speedMult: 0.8,
    batteryDrainMult: 1.25,
    bodyColor: 0x8A6A4A,   // rustier, less refined — she's a yard-gate build
  },
};

export function getEdition(id) {
  return BOT_EDITIONS[id] ?? BOT_EDITIONS.standard;
}
