/**
 * LANDMARK PLAQUES — the crashed and the famous (in-yard signage).
 *
 * Brightworks doctrine: "Fail loudly. Learn publicly." Every wreck that
 * taught the yard something got a plaque, and the wreck stayed where it
 * fell. Full lore + the original fourteen: worldbible/plaques.md
 * (scrapcraft-world repo). These ten are the NEW WRECKS — shorter, punchier,
 * kid-approved format:
 *
 *     "Here fell SPARKY IX, unplugged too quick — learn about capacitors, dummy."
 *
 * Each names a REAL embedded component or concept in 1–2 lines of loving
 * snark. Read them in-world with E. Code name stays "plaques"; players
 * never see file names.
 */

// Real components/concepts a plaque must name — enforced by tests so nobody
// ships a plaque that teaches vibes instead of hardware.
export const PLAQUE_CONCEPTS = [
  'capacitor', 'flyback diode', 'fuse', 'watchdog timer', 'PWM',
  'voltage regulator', 'hall-effect sensor', 'pull-up resistor',
  'ADC reference voltage', 'C-rate',
];

export const PLAQUES = [
  {
    id: 'sparky_ix', x: 10, z: 18, band: 0,
    name: 'SPARKY IX',
    epithet: 'Unplugged Too Quick',
    line: 'Here fell SPARKY IX — unplugged too quick. Learn about capacitors, dummy.',
    lesson: 'Capacitors hold a charge after the power\'s cut. Wait for them to drain before you grab the board.',
  },
  {
    id: 'zappa', x: 58, z: 30, band: 1,
    name: 'ZAPPA',
    epithet: 'The Diode That Wasn\'t',
    line: 'Here fell ZAPPA — the motor stopped, the voltage didn\'t.',
    lesson: 'A flyback diode gives a motor\'s kickback voltage somewhere to go. Skip it and the kick finds your chip.',
  },
  {
    id: 'fizz', x: 66, z: 44, band: 1,
    name: 'FIZZ',
    epithet: 'No Fuse, No Clues',
    line: 'Here fell FIZZ — died protecting nothing, because nothing was asked to.',
    lesson: 'A fuse is the cheap part that dies so the expensive parts don\'t. Nine cents of hero.',
  },
  {
    id: 'insomniac', x: 62, z: 70, band: 2,
    name: 'INSOMNIAC',
    epithet: 'Slept Never',
    line: 'Here fell INSOMNIAC — wide awake, stuck forever, smiling.',
    lesson: 'A watchdog timer reboots a brain that stopped thinking. INSOMNIAC never napped, so it never came back.',
  },
  {
    id: 'humdinger', x: 50, z: 88, band: 2,
    name: 'HUMDINGER',
    epithet: 'Full Speed, Always',
    line: 'Here fell HUMDINGER — it only knew two speeds: gone and GONE.',
    lesson: 'Motors have no throttle — they have PWM: very fast on/off. The ratio of on to off IS the speed.',
  },
  {
    id: 'picky', x: 44, z: 78, band: 2,
    name: 'PICKY',
    epithet: '9V Wasn\'t 9V',
    line: 'Here fell PICKY — fed 9 volts straight into a 5-volt brain and hoped.',
    lesson: 'A voltage regulator turns what the battery gives into what the chip needs. Hope is not a regulator.',
  },
  {
    id: 'northstar', x: 76, z: 52, band: 3,
    name: 'NORTHSTAR',
    epithet: 'Followed A Magnet To Its Doom',
    line: 'Here fell NORTHSTAR — it trusted its compass right into the crane magnet.',
    lesson: 'A hall-effect sensor feels magnetic fields, not the truth. Know what else is magnetic before you steer by it.',
  },
  {
    id: 'floater', x: 74, z: 96, band: 3,
    name: 'FLOATER',
    epithet: 'The Pin That Dreamed',
    line: 'Here fell FLOATER — its unconnected input read YES, NO, YES, NO, all by itself.',
    lesson: 'A pull-up resistor gives an unused input a default answer. No pull-up, and the pin just makes things up.',
  },
  {
    id: 'truthreader', x: 80, z: 104, band: 3,
    name: 'TRUTHREADER',
    epithet: 'Honest To The Wrong Ruler',
    line: 'Here fell TRUTHREADER — measured everything against a lie.',
    lesson: 'An ADC only compares input to its ADC reference voltage. Shaky reference, shaky truth.',
  },
  {
    id: 'hotplug', x: 86, z: 108, band: 3,
    name: 'HOTPLUG',
    epithet: 'Charged Like It Was Late',
    line: 'Here fell HOTPLUG — fast charge, faster funeral.',
    lesson: 'Batteries have a C-rate: how fast they can safely charge and drain. Push past it and they push back with heat.',
  },
];

/** Sanity for tests: every plaque names a real component/concept from the list. */
export function plaqueConceptName(plaque) {
  const text = (plaque.lesson + ' ' + plaque.line).toLowerCase();
  return PLAQUE_CONCEPTS.find(c => text.includes(c.toLowerCase())) ?? null;
}
