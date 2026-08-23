/**
 * VHF Radio tests — half-duplex state machine, squelch control, channels, and
 * nudge routing. Pure tests: no DOM, no browser APIs. Covers VhfRadio, RadioStack,
 * parseNudge, and NudgeRouter with deterministic fake clocks.
 *
 * Exported as runRadioTests(pass, fail) so run-tests.mjs can fold this into
 * the one harness, ambient-tests style.
 */

import { RADIO_STATES, MAX_TX_MS, VhfRadio, RadioStack } from '../VhfRadio.js';
import { parseNudge, NudgeRouter } from '../NudgeRouter.js';

export function runRadioTests(pass, fail) {
  const ok = (name, cond, extra = '') => {
    if (cond) pass(name);
    else fail(name, extra);
  };

  // ══ 1. VhfRadio state machine: IDLE, TRANSMITTING, RECEIVING ════════════
  console.log('\nRadio · VhfRadio state machine');
  {
    // IDLE → TRANSMITTING → IDLE
    const r = new VhfRadio({ channel: 'coach' });
    ok('initial state is IDLE', r.state === 'IDLE');
    ok('initial speaker is null', r.speaker === null);

    const tx = r.beginTransmit();
    ok('beginTransmit succeeds from IDLE', tx.ok === true);
    ok('state changes to TRANSMITTING', r.state === 'TRANSMITTING');

    r.endTransmit();
    ok('endTransmit returns to IDLE', r.state === 'IDLE');

    // IDLE → RECEIVING → IDLE
    const r2 = new VhfRadio({ channel: 'coach' });
    const rx = r2.beginReceive('agent-1');
    ok('beginReceive succeeds from IDLE', rx.ok === true);
    ok('state changes to RECEIVING', r2.state === 'RECEIVING');
    ok('speaker is set', r2.speaker === 'agent-1');

    r2.endReceive('agent-1');
    ok('endReceive returns to IDLE', r2.state === 'IDLE');
    ok('speaker clears on endReceive', r2.speaker === null);
  }

  // ══ 2. onState callback: fires on every transition ═════════════════════
  console.log('\nRadio · onState callback');
  {
    const events = [];
    const r = new VhfRadio({
      channel: 'chatter',
      onState: (e) => events.push(e),
    });

    r.beginTransmit();
    ok('onState fires on beginTransmit', events.length === 1);
    ok('transition includes from state', events[0].from === 'IDLE');
    ok('transition includes to state', events[0].to === 'TRANSMITTING');
    ok('transition includes channel', events[0].channel === 'chatter');
    ok('transition includes speaker (null for TX)', events[0].speaker === null);

    r.endTransmit();
    ok('onState fires on endTransmit', events.length === 2);
    ok('endTransmit transition to IDLE', events[1].to === 'IDLE');

    events.length = 0;
    r.beginReceive('agent-x');
    r.endReceive('agent-x');
    ok('RX transition includes speaker', events[0].speaker === 'agent-x');
  }

  // ══ 3. Half-duplex: CHANNEL_BUSY enforcement ═══════════════════════════
  console.log('\nRadio · half-duplex CHANNEL_BUSY');
  {
    const r = new VhfRadio({ channel: 'coach' });

    // TX blocks RX
    r.beginTransmit();
    ok('state is TRANSMITTING', r.state === 'TRANSMITTING');
    const rxFail = r.beginReceive('agent-1');
    ok('beginReceive fails while TRANSMITTING', rxFail.ok === false);
    ok('failure reason is CHANNEL_BUSY', rxFail.reason === 'CHANNEL_BUSY');
    ok('state unchanged after failed beginReceive', r.state === 'TRANSMITTING');

    r.endTransmit();

    // RX blocks TX
    r.beginReceive('agent-2');
    ok('state is RECEIVING', r.state === 'RECEIVING');
    const txFail = r.beginTransmit();
    ok('beginTransmit fails while RECEIVING', txFail.ok === false);
    ok('failure reason is CHANNEL_BUSY', txFail.reason === 'CHANNEL_BUSY');
    ok('state unchanged after failed beginTransmit', r.state === 'RECEIVING');

    r.endReceive('agent-2');
  }

  // ══ 4. Squelch: closed at IDLE/RX, open only during TX ═════════════════
  console.log('\nRadio · squelch control');
  {
    const r = new VhfRadio({ channel: 'coach' });

    ok('squelch closed at IDLE', r.squelchOpen === false);

    r.beginTransmit();
    ok('squelch opens on beginTransmit', r.squelchOpen === true);

    r.endTransmit();
    ok('squelch closes on endTransmit', r.squelchOpen === false);

    // RX keeps squelch closed
    r.beginReceive('agent-1');
    ok('squelch closed during RECEIVING', r.squelchOpen === false);

    r.endReceive('agent-1');
    ok('squelch closed after endReceive (back to IDLE)', r.squelchOpen === false);
  }

  // ══ 5. Auto-squelch: timeout after MAX_TX_MS ══════════════════════════
  console.log('\nRadio · auto-squelch timeout (MAX_TX_MS)');
  {
    let now = 1000;
    const clock = () => now;
    const r = new VhfRadio({ channel: 'coach', clock });

    r.beginTransmit();
    ok('squelch open at TX start', r.squelchOpen === true);
    ok('state is TRANSMITTING', r.state === 'TRANSMITTING');

    now += MAX_TX_MS - 100;
    r.tick(now);
    ok('squelch still open before timeout', r.squelchOpen === true);
    ok('state still TRANSMITTING before timeout', r.state === 'TRANSMITTING');

    now += 100;
    r.tick(now);
    ok('squelch closes after MAX_TX_MS', r.squelchOpen === false);
    ok('state returns to IDLE after timeout', r.state === 'IDLE');
  }

  // ══ 6. Channel switch: only allowed in IDLE ════════════════════════════
  console.log('\nRadio · channel switching');
  {
    const r = new VhfRadio({ channel: 'coach' });

    ok('initial channel is coach', r.channel === 'coach');

    const switchOk = r.setChannel('chatter');
    ok('setChannel succeeds in IDLE', switchOk.ok === true);
    ok('channel changed to chatter', r.channel === 'chatter');

    // Try to switch while TX
    r.beginTransmit();
    const switchFail = r.setChannel('coach');
    ok('setChannel fails while TRANSMITTING', switchFail.ok === false);
    ok('failure reason is CHANNEL_BUSY', switchFail.reason === 'CHANNEL_BUSY');
    ok('channel unchanged after failed switch', r.channel === 'chatter');

    r.endTransmit();

    // Try to switch while RX
    r.beginReceive('agent-1');
    const switchFail2 = r.setChannel('coach');
    ok('setChannel fails while RECEIVING', switchFail2.ok === false);
    ok('channel unchanged after failed switch (RX)', r.channel === 'chatter');

    r.endReceive('agent-1');
  }

  // ══ 7. RadioStack: two independent radios, shared onState ══════════════
  console.log('\nRadio · RadioStack independent channels');
  {
    const events = [];
    const stack = new RadioStack({
      onState: (e) => events.push(e),
    });

    ok('RadioStack has coach radio', stack.radios.coach instanceof VhfRadio);
    ok('RadioStack has chatter radio', stack.radios.chatter instanceof VhfRadio);

    // Both can be busy simultaneously
    stack.radios.coach.beginTransmit();
    ok('coach radio transmitting', stack.radios.coach.state === 'TRANSMITTING');

    stack.radios.chatter.beginReceive('agent-x');
    ok('chatter radio receiving', stack.radios.chatter.state === 'RECEIVING');
    ok('both radios busy at once',
       stack.radios.coach.isBusy() && stack.radios.chatter.isBusy());

    ok('coach channel in events', events.some(e => e.channel === 'coach'));
    ok('chatter channel in events', events.some(e => e.channel === 'chatter'));

    stack.radios.coach.endTransmit();
    stack.radios.chatter.endReceive('agent-x');
  }

  // ══ 8. parseNudge: intent, payload, targetHint, ttlMs ═════════════════
  console.log('\nRadio · parseNudge command parsing');
  {
    // 'goto' with compass direction
    let p = parseNudge('head north');
    ok('goto intent for compass', p.intent === 'goto');
    ok('north direction parsed', p.payload.dir === 'north');
    ok('payload has unit vector dx', typeof p.payload.dx === 'number');
    ok('payload has unit vector dz', typeof p.payload.dz === 'number');
    ok('goto ttl is 20000', p.ttlMs === 20000);

    // 'goto' with abbreviation
    p = parseNudge('go east');
    ok('direction east parsed', p.payload.dir === 'east');

    // 'goto' with alias (left → west)
    p = parseNudge('go left');
    ok('left maps to west', p.payload.dir === 'west');

    // 'mine' command
    p = parseNudge('mine scrap');
    ok('mine intent', p.intent === 'mine');
    ok('mine scrap payload', p.payload.what === 'scrap');
    ok('mine ttl is 30000', p.ttlMs === 30000);

    p = parseNudge('mine ore');
    ok('mine ore payload', p.payload.what === 'ore');

    // 'follow' command
    p = parseNudge('follow me');
    ok('follow intent', p.intent === 'follow');
    ok('follow ttl is 15000', p.ttlMs === 15000);

    // 'stop' command
    p = parseNudge('stop');
    ok('stop intent', p.intent === 'stop');
    ok('stop ttl is 15000', p.ttlMs === 15000);

    // 'race' command
    p = parseNudge('race the oval');
    ok('race intent', p.intent === 'race');
    ok('race ttl is 120000', p.ttlMs === 120000);

    // 'banter' (default)
    p = parseNudge('good job buddy');
    ok('banter intent', p.intent === 'banter');
    ok('banter payload has text', p.payload.text === 'good job buddy');
    ok('banter ttl is 8000', p.ttlMs === 8000);

    // Target hint: bot names
    p = parseNudge('bolt, go north');
    ok('bot name bolt extracted', p.targetHint === 'bolt');

    p = parseNudge('juno, stop');
    ok('bot name juno extracted', p.targetHint === 'juno');

    p = parseNudge('just a chat');
    ok('no bot name → targetHint null', p.targetHint === null);
  }

  // ══ 9. NudgeRouter: deliver, consume, expiry ═══════════════════════════
  console.log('\nRadio · NudgeRouter directive lifecycle');
  {
    let now = 5000;
    const clock = () => now;
    const router = new NudgeRouter({ clock });

    // deliver() wraps the parsed nudge
    const bot = { personality: { name: 'bolt' } };
    const dir = router.deliver(bot, 'go north', { now });

    ok('deliver returns directive', dir !== null);
    ok('directive has intent', dir.intent === 'goto');
    ok('directive has payload', dir.payload !== null);
    ok('directive has text', dir.text === 'go north');
    ok('directive has issuedAt', dir.issuedAt === now);
    ok('directive has expiresAt', dir.expiresAt > now);
    ok('directive assigned to bot', bot.directive === dir);

    // consume() returns unexpired directive
    const consumed = router.consume(bot, { now: now + 1000 });
    ok('consume returns directive before expiry', consumed === dir);
    ok('consume clears bot.directive', bot.directive === null);

    // expired consume() returns null
    const bot2 = {};
    router.deliver(bot2, 'race', { now: 0 });
    now = 200000; // way past the 120s race ttl
    const expiredConsume = router.consume(bot2, { now });
    ok('consume returns null for expired directive', expiredConsume === null);
    ok('bot.directive cleared on expiry', bot2.directive === null);
  }

  // ══ 10. NudgeRouter: seq increments per router ═════════════════════════
  console.log('\nRadio · NudgeRouter seq counter');
  {
    const router = new NudgeRouter();
    const bot1 = {};
    const bot2 = {};

    const dir1 = router.deliver(bot1, 'go north');
    const dir2 = router.deliver(bot2, 'go south');

    ok('first directive seq is 0', dir1.seq === 0);
    ok('second directive seq is 1', dir2.seq === 1);

    const dir3 = router.deliver(bot1, 'stop');
    ok('third directive seq is 2', dir3.seq === 2);
  }

  // ══ 11. NudgeRouter: active() peeks without clearing ════════════════════
  console.log('\nRadio · NudgeRouter active peek');
  {
    let now = 1000;
    const clock = () => now;
    const router = new NudgeRouter({ clock });
    const bot = {};

    router.deliver(bot, 'follow me', { now });
    const active1 = router.active(bot, { now });
    ok('active returns directive', active1 !== null);
    ok('active does NOT clear bot.directive', bot.directive !== null);

    // active returns null if expired
    now += 20000; // follow ttl is 15000
    const active2 = router.active(bot, { now });
    ok('active returns null for expired', active2 === null);
  }
}
