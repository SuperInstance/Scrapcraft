/**
 * RIVET — compat shim.
 *
 * The orchestrator is persona-generic now (see Companion.js); Rivet is one
 * soul among four, bound here so a decade of `new Rivet(...)` keeps working.
 * New code should build companions via the roster (registry.js).
 */

import { Companion } from './Companion.js';
import { getPersona } from './personas.js';

export class Rivet extends Companion {
  constructor(opts = {}) {
    super({ ...opts, persona: opts.persona ?? getPersona('rivet') });
  }
}
