# VHF Radio Doctrine — Half-Duplex Agent Communications

## Origin: The Vessel Metaphor

In Casey's vision: *"A coach/spectator mode to watch and listen to your AGENTS play, and you chat with them and nudge them — STT/TTS with VHF-radio-like communications. Chat windows are most like radio: transmitting and receiving usually do NOT happen at the same time on the same vessel; and if they do, it's two radios on two different channels."*

This doctrine grounds our implementation in that metaphor: **voice chat is not a telephone, it is half-duplex radio**. A single agent (vessel) on a single frequency (channel) cannot transmit and receive simultaneously. The coach and agent take turns with the microphone, just as two people on a walkie-talkie cannot talk over each other.

## Half-Duplex PTT: The UX Model

The interface follows **Push-To-Talk (PTT)** protocol from real VHF radio:

- **Press (begin transmit)**: coach holds PTT, sends text or voice
- **Hold**: transmit continues, agent hears but cannot interrupt
- **Release (end transmit)**: coach releases PTT, transmission ends, squelch closes, agent can respond
- **Agent responds**: agent holds PTT, coach listens (coach's mic is closed)

This is distinct from **full-duplex** telephony (both parties can speak simultaneously). PTT is the constraint that makes the UX clear: when one is speaking, the other is *definitely* listening. No confusion, no stepping on each other, no "go ahead" protocols needed.

## State Machine: Three Exclusive States

Every VhfRadio instance maintains exactly one state; all three states are mutually exclusive:

### IDLE
- No transmission, no reception.
- Squelch is **closed** — microphone cannot transmit.
- Coach can press PTT to begin transmit.
- Agent can begin speaking (coach begins receive).
- Channel can be switched (only allowed from IDLE).

### TRANSMITTING
- Coach holds PTT; text/voice is sent to agent.
- Squelch is **open** — microphone is hot, transmission active.
- Agent *cannot* interrupt (half-duplex constraint).
- Timeout: after MAX_TX_MS (8 seconds), squelch auto-closes even if PTT is still held.
- No state transitions except to IDLE (via release or timeout).

### RECEIVING
- Agent is speaking; coach listens.
- Squelch is **closed** (coach's mic is locked, hearing agent instead).
- Coach *cannot* begin transmit (half-duplex constraint: CHANNEL_BUSY).
- Agent can release and return to IDLE for coach to respond.
- No timeout enforced on receive (agent can ramble).

## Squelch: Mic Open Only When Transmitting

**Squelch** is the state of the microphone (coach's input path):

- **Closed (false)**: microphone is dead; coach cannot speak; PTT-press does nothing until squelch opens.
  - Active in IDLE and RECEIVING states.
  - Protects against hot-mic and unintended broadcasts.
  
- **Open (true)**: microphone is live; coach's words are sent to agent.
  - Active only during TRANSMITTING state.
  - Opens when PTT is pressed (`beginTransmit`).
  - Closes when PTT is released (`endTransmit`) or timeout fires (`tick` after MAX_TX_MS).

Squelch is the **safety layer**: even if the coach reaches for the radio repeatedly, they won't transmit if they don't hold PTT or if the channel is busy.

## Channel Busy: Half-Duplex Enforcement

The term **CHANNEL_BUSY** encodes the half-duplex law:

- `canTransmit()` returns `{ ok: false, reason: 'CHANNEL_BUSY' }` if the radio is not IDLE.
- `beginTransmit()` fails with CHANNEL_BUSY if already receiving.
- `beginReceive(agentId)` fails with CHANNEL_BUSY if already transmitting.
- `setChannel(name)` fails with CHANNEL_BUSY if not IDLE.

**This is the contract of half-duplex**: you cannot start a transmit while receiving, and you cannot start a receive while transmitting. No overlaps, no time-sharing of the same channel by one radio. If you want the agent and coach to talk simultaneously, use two separate radios on two separate channels.

## Two Channels, One Radio Per Channel

The coach uses a **RadioStack** holding two independent VhfRadio instances:

- **'coach' channel**: orders, directives, nudges sent by the coach to the followed agent.
  - Example: "go north", "stop", "mine scrap".
  - Coach transmits, agent receives and acts.
  
- **'chatter' channel**: companion banter, casual conversation.
  - Example: "good job buddy", "nice run".
  - Can overlap in real time because they are on separate channels (two radios, not one).

Each channel is its own independent state machine. The coach can be receiving chatter from agent-A while transmitting orders to agent-B (on coach channel), because those are two different radios in two different channels.

**Key rule**: one radio listens to one channel at a time. To listen to both channels, you need two radios. To broadcast on both channels simultaneously, you need two separate transmissions (one per radio).

## Fail-Soft: No Permissions → Text Fallback

If the device lacks microphone permissions:

1. STT (coach cannot speak to agent via voice) falls back to text input.
2. TTS (agent cannot speak to coach via voice) falls back to text display.
3. **Text enters the same half-duplex state machine as voice**: when the coach types and sends a text nudge, it is a TX event; the radio enters TRANSMITTING, squelch opens, and closes after MAX_TX_MS or when confirmed.
4. The panel layout is unchanged; the same PTT button becomes a "send" button for text.
5. State machine enforcement (no overlaps, squelch, channel busy) applies equally to text.

This ensures that even in a text-only fallback, the user experiences the same half-duplex discipline and radio semantics.

## Transmit Timeout and Auto-Squelch

Real VHF radios have a **Time-Out Timer (TOT)** to prevent accidental or rude long transmissions. In this system:

- **MAX_TX_MS = 8000** (8 seconds) is the hard limit for a single transmit.
- Coach holds PTT beyond 8 seconds? The radio auto-closes squelch, returning to IDLE.
- Agent hears the signal cut off abruptly — expected behavior on a real radio.
- Coach must release PTT and press again to send another message.

This constraint **prevents hogging the channel**, enforces message discipline (keep them short), and mirrors real radio practice. The `tick(now)` method enforces this when called with the current time.

## onState Callback: Every Transition Fires

Every state transition (IDLE → TX, TX → IDLE, IDLE → RX, etc.) fires the `onState` callback:

```js
onState({ from, to, channel, speaker })
```

- **from**: previous state
- **to**: new state
- **channel**: which channel ('coach' or 'chatter')
- **speaker**: agentId if receiving, null otherwise

The UI uses this to:
- Show visual feedback (red light when busy, green when idle).
- Update button states (PTT disabled if CHANNEL_BUSY).
- Display who is currently speaking.
- Flash the squelch indicator.

Callbacks never throw; if a callback fails, the radio continues.

## NudgeRouter: Commands as Directives

The **NudgeRouter** parses natural-language nudges (coach input) into directives with intent, payload, TTL, and target hint:

- **'goto'**: navigation (compass or coordinates), TTL 20s.
- **'mine'**: resource gathering, TTL 30s.
- **'follow'**: follow the coach, TTL 15s.
- **'stop'**: hold position, TTL 15s.
- **'race'**: lap the oval, TTL 120s.
- **'banter'**: everything else (casual chat), TTL 8s.

Each directive is stamped with `issuedAt` and `expiresAt` times. The router enforces expiry: `consume()` returns null if the directive has expired, preventing stale commands from executing.

The `seq` counter increments per router instance, disambiguating old vs. new commands in case of network latency or retries.

## Summary: Radio Discipline for Agent Teams

By adopting half-duplex radio semantics:

1. **Clarity**: everyone knows who is speaking and who is listening at any moment.
2. **Fairness**: no voice stepping on voice; turns are enforced by state.
3. **Simplicity**: no conference-bridge complexity; just two parties with a radio between them.
4. **Realism**: mirrors how real teams coordinate (aircraft, emergency services, construction sites).
5. **Fallback resilience**: text input slots into the same state machine, no special cases.

The coach is in command, but the agent is heard. Both respect the channel.
