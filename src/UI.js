import { getItem } from './data/items.js';
import { BLOCK_DEF } from './data/blocks.js';
import { ACHIEVEMENT_LIST } from './Achievements.js';
import { RaceBoard } from './RaceBoard.js';

// ── Engineering Codex entries (teaches real science, middle-school tone) ──
const CODEX = [
  {
    id: 'generator',
    title: 'How Does a Generator Work?',
    icon: '⚡',
    text: `A generator converts mechanical energy into electrical energy using a concept called electromagnetic induction. When you spin a coil of wire inside a magnetic field, electrons in the wire get pushed — creating electric current. This is literally how your city's power plant works, just bigger and not made of scrap.\n\nFun fact: Michael Faraday figured this out in 1831 using a coil and a horseshoe magnet. He basically invented the modern world.`,
  },
  {
    id: 'circuit_board',
    title: 'What Are Circuit Boards?',
    icon: '🟢',
    text: `Circuit boards are flat panels that hold and connect electronic components using tiny copper pathways called traces. The green stuff is epoxy. The silver lines are actual copper (plated with tin so it doesn't corrode).\n\nThe little chips on them contain millions — sometimes billions — of transistors. A transistor is basically a tiny switch. Flip a billion switches fast enough and you get a smartphone.`,
  },
  {
    id: 'robot_helper',
    title: 'How Do Robots Work?',
    icon: '🤖',
    text: `Real robots have three main systems: sensors (to perceive), actuators (to move), and a controller (to decide). The actuators are usually motors — electric motors turn electricity into rotational force.\n\nModern robot joints use servo motors with position feedback. The robot "knows" where its arm is because sensors tell the controller. The ScrapBot uses a simplified version of this — but the principle is the same as a Mars rover.`,
  },
  {
    id: 'blowtorch',
    title: 'What Is Welding?',
    icon: '🔥',
    text: `Welding joins two pieces of metal by melting them together. A blowtorch burns a fuel gas (like acetylene) mixed with oxygen to reach temperatures above 3,000°C — hot enough to melt steel.\n\nThe science: combustion is a rapid chemical reaction where fuel reacts with oxygen, releasing heat and light. "Hot enough to melt steel" sounds like a meme but in welding it's literally Tuesday.`,
  },
  {
    id: 'gear_small',
    title: 'How Do Gears Work?',
    icon: '⚙️',
    text: `Gears transfer rotational force between shafts. When a small gear drives a big gear, you trade speed for torque (turning force). When a big gear drives a small one, you trade torque for speed. This is why bikes have multiple gears — different trade-offs for flat ground vs. hills.\n\nThe ratio matters: a 10-tooth gear driving a 40-tooth gear turns at ¼ the speed but 4× the torque. That math is behind every transmission ever built.`,
  },
  {
    id: 'rubber_chunk',
    title: 'Why Is Rubber Stretchy?',
    icon: '⬛',
    text: `Natural rubber is made of long, coiled polymer chains — like springs at the molecular level. When you stretch rubber, you're straightening those chains. When you let go, they spring back.\n\nVulcanization (heating rubber with sulfur, invented by Charles Goodyear in 1839) crosslinks those chains together, making rubber stronger and more elastic. Every tire, every seal, every rubber band owes its existence to one guy accidentally dropping a rubber-sulfur mixture on a hot stove.`,
  },
  {
    id: 'flying_machine',
    title: 'How Does Flight Work?',
    icon: '✈️',
    text: `Four forces act on any flying machine: thrust (forward), drag (backward), lift (up), weight (down). Fly if lift > weight and thrust > drag.\n\nLift comes from wings shaped so air moving over the top travels faster than air below — faster air = lower pressure (Bernoulli's principle). The wing pushes air down; by Newton's third law, air pushes the wing up.\n\nBuilding one from scrap? Earl said it couldn't be done. You proved him wrong. That's also science.`,
  },
  {
    id: 'battery_pack',
    title: 'How Do Batteries Work?',
    icon: '🔋',
    text: `A battery stores chemical energy and converts it to electrical energy through a chemical reaction called redox (reduction + oxidation). Two different materials (electrodes) sit in a chemical solution (electrolyte). Electrons flow from the negative electrode (anode) through your circuit to the positive (cathode).\n\nWhen all the chemical reactant is used up, the battery "dies." Rechargeable batteries reverse the reaction by forcing electrons back the other way. Your phone does this hundreds of times before the chemistry degrades.`,
  },
  {
    id: 'copper_wire',
    title: 'Why Copper for Wire?',
    icon: '🪢',
    text: `Copper is one of the best electrical conductors that exists at room temperature (silver is slightly better but way more expensive). Electrons flow through copper easily because its outer electrons are loosely held.\n\nCopper is also ductile — it can be drawn into very thin wire without breaking. And it's abundant. Those three things together make it the backbone of all electrical infrastructure on Earth. There's over 250 million tons of copper in global electrical systems right now.`,
  },
  {
    id: 'go_kart',
    title: 'How Do Engines Work?',
    icon: '🏎️',
    text: `Internal combustion engines turn fuel explosions into rotation. The four-stroke cycle: intake (suck air + fuel in), compression (squeeze it), combustion (spark → boom), exhaust (push the gases out). That boom pushes a piston down, which turns a crankshaft, which turns your wheels.\n\nThe go-kart doesn't need an engine because Earl didn't put one in the plans. That's a future upgrade. For now, imagine it rolling downhill. Quickly.`,
  },
  {
    id: 'track_strip',
    title: 'How Do IR Line Sensors Work?',
    icon: '🏁',
    text: `A line-following robot uses infrared (IR) sensors. An IR LED shines invisible light downward; a photodetector measures how much bounces back. Dark surfaces absorb light (low return); pale surfaces reflect it (high return). The robot reads the difference and steers to stay over the dark line.\n\nThis is exactly what robot vacuum cleaners use to detect cliff edges — they look down, see no reflection, and stop. The TRACK blocks in Scrapcraft simulate this: the bot's 'line_under' sensor goes true when it's over the dark rubber strips.`,
  },
  {
    id: 'tin_brain',
    title: 'What Is a Microcontroller?',
    icon: '🧠',
    text: `A microcontroller (MCU) is a tiny computer on a single chip. It has a CPU, memory, and input/output pins — all in one package smaller than your thumbnail. The Arduino Uno uses an ATmega328P; an ESP32 (the Spark Brain) adds WiFi and Bluetooth and runs at 240 MHz.\n\nUnlike a regular computer, a microcontroller runs one program in a loop forever. That's the "forever" tile in the Maker Lab — it's not a game abstraction, it's literally how embedded code works. void loop() {} in Arduino IS the forever block.`,
  },
  {
    id: 'floodlight',
    title: 'How Do LEDs Make Light?',
    icon: '💡',
    text: `LEDs (Light Emitting Diodes) produce light through electroluminescence. When electricity flows through a semiconductor junction, electrons drop to a lower energy state and release that energy as photons — particles of light. The color depends on the semiconductor material used.\n\nOld lights waste 90% of their energy as heat. LEDs convert 50-90% into light, making them wildly more efficient. A 10W LED produces as much light as a 60W incandescent bulb. The Floodlight in Scrapcraft uses a point-light model — the same math graphics engines use to simulate physical lights.`,
  },
  {
    id: 'robot_arm',
    title: 'How Do Robot Arms Work?',
    icon: '🦾',
    text: `Industrial robot arms have multiple joints, each controlled by a servo motor with position feedback. The controller computes inverse kinematics — given "put the gripper at position XYZ," it works backward to figure out what angle each joint needs. That's serious math involving matrices and trigonometry.\n\nThe human arm does this instantly, without you thinking about it. Your brain's motor cortex is running continuous inverse kinematics. You are already a robot. Just a wet, squishy one.`,
  },
  {
    id: 'ore_nearby',
    title: 'How Do Hall-Effect Sensors Work?',
    icon: '🧲',
    text: `A hall-effect sensor detects magnetic fields. When electrons in a conductor are moving through a magnetic field, a force pushes them sideways — this sideways voltage is called the Hall voltage. Measure it, and you know the field strength.\n\nThe AS5600 chip uses a hall-effect sensor to measure the angle of a magnet rotating above it (used in robotics for wheel encoders). But the same physics can detect the presence of metallic ore underground — strong magnetic anomalies distort the Earth's local field.\n\nThe 'ore signal' bar in the bot HUD maps this: 0 = nothing magnetic in range, 1 = ore right beneath you. Real mining robots use exactly this technique for sub-surface mapping.`,
  },
  {
    id: 'scrap_grenade',
    title: 'What Makes an Explosion?',
    icon: '💣',
    text: `An explosion is a very rapid exothermic (heat-releasing) chemical reaction. The fuel reacts with oxygen so fast that the reaction completes in microseconds, releasing a huge volume of hot gas all at once. That sudden expansion creates a pressure wave — the blast.\n\nThe Scrap Grenade in Scrapcraft simulates the physics: projectile arc under gravity (real trajectory math using initial velocity and g = 9.8 m/s²), then a spherical blast radius that mines blocks within a defined distance. Real explosive simulations in games use the same equations as mining engineers.`,
  },
  {
    id: 'waypoint_flag',
    title: 'How Does GPS Navigation Work?',
    icon: '🚩',
    text: `GPS uses trilateration: satellites broadcast radio signals with precise timestamps. Your receiver calculates how long each signal took to arrive (at the speed of light), giving it a distance from each satellite. Knowing distances from 4+ satellites pins your exact position in 3D space.\n\nWaypoint navigation in Scrapcraft mimics the bot's behavior: calculate bearing and distance to target, steer using the 'waypoint_bearing' sensor. Real autonomous vehicles (like the Mars rover) navigate using almost identical logic — just with more sensors and much more careful math.`,
  },
  {
    id: 'crystal_fragment',
    title: 'How Do Crystals Form?',
    icon: '🔮',
    text: `Crystals form when molecules arrange themselves into repeating geometric patterns as a liquid cools or a solution becomes saturated. The orderly structure is called a crystal lattice. Diamonds are carbon atoms in a tetrahedral lattice. Salt is sodium and chlorine in a cubic lattice.\n\nIn nature, large crystals take millions of years to form under high pressure deep underground. The Crystal Ore in the Deep Yard is fictional — but the physics of piezoelectric crystals (crystals that generate voltage when squeezed) is real. Your phone's microphone uses a piezo crystal. So does your car's knock sensor.`,
  },
  {
    id: 'signal_amp',
    title: 'How Do Amplifiers Work?',
    icon: '📶',
    text: `An amplifier takes a weak electrical signal and outputs a stronger version of the same signal. Operational amplifiers (op-amps) do this using transistors: the input signal controls how much current flows from the power supply to the output, amplifying the original.\n\nThe LM358 op-amp is a classic two-channel chip used in robotics for signal conditioning — boosting sensor readings before they reach the microcontroller's ADC. In Scrapcraft the Signal Amplifier extends the ore scanner range from 10 to 16 blocks: a 60% increase, representing a real op-amp gain stage applied to the magnetic sensor signal.`,
  },
  {
    id: 'floor_type',
    title: 'How Do IR Reflectance Sensors Work?',
    icon: '🏁',
    text: `An IR reflectance sensor (like the TCRT5000) shines infrared light downward and measures how much bounces back with a phototransistor. Different materials have different IR reflectivity: bare metal reflects 70-80% of IR; concrete reflects 30-40%; dirt and rubber absorb most of it.\n\nThis creates a cheap, fast floor-type detector. The 'floor_type' sensor in Scrapcraft returns values from 0 (void/dirt) to 1.0 (track/crystal) — mirroring the actual analog voltage range you'd read from a real TCRT5000 on a robot. It's used in sumo robots to detect the ring edge, and in industrial robots to detect surface transitions.`,
  },
  {
    id: 'bot_battery',
    title: 'How Do Robot Batteries Work?',
    icon: '🔋',
    text: `Real robots use lithium-ion (Li-ion) or lithium polymer (LiPo) batteries — the same chemistry in your phone. Li-ion cells store energy in lithium intercalation compounds: charging pushes Li⁺ ions into graphite layers; discharging releases them back.\n\nBattery capacity is measured in mAh (milliamp-hours). A 2000 mAh battery at 5V stores 10 Wh. A small motor drawing 250 mA would run it flat in 8 hours. But motors spike current during startup and sharp turns, which drains faster.\n\nReal autonomous robots use a Battery Management System (BMS) — a tiny circuit that monitors cell voltage, temperature, and current draw. It triggers a graceful shutdown at ~3.0V per cell to prevent permanent cell damage. Your ScrapBot does the same thing when battery hits 0%.`,
  },
  {
    id: 'acid_puddle',
    title: 'What Is Battery Acid?',
    icon: '☠',
    text: `Sulfuric acid (H₂SO₄) is the electrolyte inside lead-acid batteries — the same ones used in cars. When old batteries crack or corrode, the acid leaks out. It has a pH below 1, which means it's extremely reactive.\n\nAcid works by donating H⁺ ions (protons) to whatever it touches. Metal atoms get oxidized — they lose electrons to the acid and dissolve. That's why acid burns through iron scrap and rubber alike. Real e-waste workers handle acid with thick rubber gloves and face shields.\n\nIn Scrapcraft, acid puddles drain your HP at 4/sec. A repair kit patches the damage. In real life, you'd need a base (like baking soda — sodium bicarbonate, NaHCO₃) to neutralize it: acid + base → salt + water + CO₂ gas.`,
  },
  {
    id: 'signal_radio',
    title: 'How Do Radio Signal Finders Work?',
    icon: '📡',
    text: `Radio direction finding (RDF) is the technique of locating the source of a radio signal. Emergency locator transmitters (ELTs) on aircraft and EPIRBs on ships broadcast a distress beacon on 406 MHz — satellites pick this up and relay the position to rescue services.\n\nThe 433 MHz ISM band is used for short-range wireless devices (garage openers, weather stations, keyfobs). It's unregulated in most countries, which is why it's popular for hobbyist projects.\n\nTo find a signal source, RDF receivers use a rotating directional antenna (like a Yagi or loop antenna). Signal strength peaks when the antenna is aimed directly at the transmitter, and nulls when pointed sideways. Software-defined radios (SDR) can do this digitally.\n\nThe Signal Radio in Scrapcraft simulates RSSI (received signal strength indicator) — a 0-100% value that increases as you approach the source. The 5-bar display is the same UI pattern your phone uses for cell signal, which is also RSSI under the hood.`,
  },
  {
    id: 'ore_scanner',
    title: 'How Does Magnetic Ore Detection Work?',
    icon: '🔭',
    text: `Minerals like magnetite (Fe₃O₄) and pyrrhotite are ferromagnetic — their crystal structure means unpaired electrons all spin in the same direction, creating a measurable magnetic field.\n\nGeophysicists use aeromagnetic surveys: they fly a magnetometer (a precise magnetic field sensor) over terrain and record variations from Earth's baseline field. Ore deposits show up as "anomalies" — spikes or dips in the magnetic reading.\n\nThe INA219 current sensor measures voltage across a shunt resistor. A Hall-effect sensor (like the SS49E) measures magnetic field strength directly, outputting a voltage proportional to field strength.\n\nThe Ore Scanner in Scrapcraft uses a 24-block scan radius and points an arrow toward the nearest Crystal Ore. The real math: bearing = atan2(ΔX, ΔZ) then subtract your heading to get relative direction. That's the same calculation as GPS waypoint navigation.`,
  },
  {
    id: 'lightning_storm',
    title: 'Why Is Lightning Dangerous in a Scrapyard?',
    icon: '⛈',
    text: `Lightning is a massive electrical discharge — up to 300 million volts and 30,000 amperes — caused by charge separation between storm clouds and the ground. The discharge follows the path of least resistance to ground, which is often the tallest conducting object nearby.\n\nA scrapyard is a lightning hazard nightmare: it's full of metal objects, often sitting on conductive ground. If you're the tallest thing standing in an open metal yard during a storm, you can become part of that path.\n\nThe 30,000 Kelvin temperature is real — five times hotter than the sun's surface. The heated air expands supersonically, which is what you hear as thunder. Light travels faster, so you see it first.\n\nBest protection: get under a solid roof (which redirects the strike around you). Faraday cage principle — conducting shells protect the interior from electric fields.`,
  },
  {
    id: 'rubber_insulation',
    title: 'Why Does Rubber Protect Against Electricity?',
    icon: '🥾',
    text: `Rubber is an electrical insulator — electrons don't flow through it easily because all its electrons are tightly bound in covalent bonds (they're not free to move). This makes rubber the opposite of a conductor like copper.\n\nElectricity needs a continuous path to flow. Rubber boots break that path between your feet and the ground, so current can't easily flow through you. This is why electrical workers wear rubber-soled boots and rubber gloves.\n\nVulcanized rubber (the kind used in boots and gloves) has crosslinked polymer chains that make it even more resistant. It can withstand thousands of volts across a thin layer — Class 00 rubber gloves are rated for 500V; Class 4 gloves handle up to 36,000V.\n\nIn Scrapcraft, rubber boots give acid immunity too — because the same non-reactive polymer chains that block electrons also resist chemical attack from weak acids.`,
  },
  {
    id: 'fall_physics',
    title: 'How Does Fall Damage Work? (Real Physics)',
    icon: '💥',
    text: `When you fall, gravity accelerates you at 9.8 m/s² (32 ft/s²). After 1 second you're moving at 9.8 m/s; after 2 seconds, 19.6 m/s. This is kinetic energy building up: KE = ½mv². Speed matters a lot — double the fall height, and speed only increases by √2, but KE doubles.\n\nThe danger isn't the fall — it's the stop. When you hit the ground, your body has to decelerate from high speed to zero in a very short time. Force = mass × acceleration, and that deceleration spike is what causes injury.\n\nFall damage in Scrapcraft activates only above 12 m/s impact velocity (roughly 7.4 meters of free fall). Below that the spring boots and leg shock absorbers handle it. Above it, damage scales as (speed − 12) × 4. Real parkour athletes bend their knees on landing to increase the stopping distance and reduce peak force — same physics.`,
  },
];

export class UI {
  constructor(game) {
    this.game = game;
    this._hotbar          = document.getElementById('hotbar');
    this._overlay         = document.getElementById('overlay');
    this._invGrid         = document.getElementById('inv-grid');
    this._recipeList      = document.getElementById('recipe-list');
    this._craftBtn        = document.getElementById('craft-btn');
    this._craftBtnX5      = document.getElementById('craft-btn-x5');
    this._foremanBubble   = document.getElementById('foreman-bubble');
    this._foremanText     = document.getElementById('foreman-text');
    this._questBox        = document.getElementById('quest-box');
    this._questTitle      = document.getElementById('quest-title');
    this._questSteps      = document.getElementById('quest-steps');
    this._blockLabel      = document.getElementById('block-label');
    this._notifContainer  = document.getElementById('notifications');
    this._tooltip         = document.getElementById('tooltip');
    this._tipName         = document.getElementById('tip-name');
    this._tipDesc         = document.getElementById('tip-desc');
    this._zoneLabel       = document.getElementById('zone-label');
    this._achieveToast    = document.getElementById('achieve-toast');
    this._codexList    = document.getElementById('codex-list');
    this._codexContent = document.getElementById('codex-content');

    this._selectedRecipe  = null;
    this._overlayOpen     = false;
    this._currentStation  = 'any';
    this._dismissTimer    = null;
    this._achieveQueue    = [];
    this._showingAchieve  = false;
    this._activeTab       = 'crafting';
    this._zoneToastTimer  = null;
    this._paused          = false;

    // Crosshair & mine ring elements
    this._crosshair   = document.getElementById('crosshair');
    this._mineArc     = document.getElementById('mine-arc');
    this._pauseOverlay = document.getElementById('pause-overlay');
    this._zoneToast   = document.getElementById('zone-toast');
    this._activeLabel = document.getElementById('active-item-label');

    // XP bar
    this._xpFill      = document.getElementById('xp-fill');
    this._xpLevelText = document.getElementById('xp-level-text');
    this._xpSkillBadge= document.getElementById('xp-skill-badge');
    this._levelupToast = document.getElementById('levelup-toast');
    this._luIcon  = document.getElementById('lu-icon');
    this._luTitle = document.getElementById('lu-title');
    this._luSkill = document.getElementById('lu-skill');
    this._luTimer = null;

    this._hotbarTip = document.getElementById('hotbar-tip');

    // Per-frame dirty-check caches — setZone/setBlockLabel/updateHotbar are
    // called every frame but their content almost never changes.
    this._zoneLast        = null;
    this._blockLabelLast  = undefined;
    this._activeLabelTxt  = null;
    this._hotbarSlots     = [];   // cached {el, icon, count} refs + last-written strings

    this._buildHotbar();
    this._buildCodex();
    this._bindOverlayEvents();

    document.getElementById('foreman-dismiss').addEventListener('click', () => this.hideForeman());
  }

  // ── Hotbar ────────────────────────────────────────────────────────────

  _buildHotbar() {
    this._hotbar.innerHTML = '';
    this._hotbarSlots = [];
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.innerHTML = `<span class="slot-num">${i + 1}</span>
        <span class="item-icon"></span><span class="item-count"></span>`;
      slot.addEventListener('mouseenter', () => this._showHotbarTip(i));
      slot.addEventListener('mouseleave', () => this._hideHotbarTip());
      this._hotbar.appendChild(slot);
      // Cache the slot + its icon/count children once — updateHotbar runs
      // every frame and must not re-query the DOM per call.
      this._hotbarSlots.push({
        el: slot,
        icon: slot.querySelector('.item-icon'),
        count: slot.querySelector('.item-count'),
        id: undefined, qty: undefined, active: undefined,
      });
    }
  }

  _showHotbarTip(index) {
    if (!this._hotbarTip) return;
    const item = this.game?.player?.inventory?.[index];
    if (!item) { this._hideHotbarTip(); return; }
    const def = getItem(item.id);
    if (!def) return;
    this._hotbarTip.textContent = `${def.icon} ${def.name}`;
    this._hotbarTip.classList.add('show');
  }

  _hideHotbarTip() {
    this._hotbarTip?.classList.remove('show');
  }

  updateHotbar(player) {
    // Per-slot dirty checks: skip DOM writes (and getItem lookups) whenever
    // the id/qty/active state hasn't changed — the steady-state every frame.
    const slots = this._hotbarSlots;
    const prevIndex = this._lastHotbarIndex ?? player.hotbarIndex;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const item  = player.inventory[i];
      const id    = item ? item.id : null;
      const qty   = item?.qty > 1 ? String(item.qty) : '';
      if (s.id !== id) {
        s.id = id;
        s.icon.textContent = item ? (getItem(item.id)?.icon ?? '?') : '';
      }
      if (s.qty !== qty) {
        s.qty = qty;
        s.count.textContent = qty;
      }
      const active = i === player.hotbarIndex;
      if (s.active !== active) {
        s.active = active;
        s.el.classList.toggle('active', active);
      }
    }
    // Active item label above hotbar
    const active = player.inventory[player.hotbarIndex];
    if (this._activeLabel) {
      const def = active ? getItem(active.id) : null;
      const label = def ? `${def.icon} ${def.name}` : '';
      if (this._activeLabelTxt !== label) {
        this._activeLabelTxt = label;
        this._activeLabel.textContent = label;
        this._activeLabel.style.opacity = def ? '1' : '0';
      }
    }
    // Flash item tooltip on keyboard slot switch
    if (player.hotbarIndex !== prevIndex) {
      this._lastHotbarIndex = player.hotbarIndex;
      this._showItemFlash(active);
    } else if (this._lastHotbarIndex === undefined) {
      this._lastHotbarIndex = player.hotbarIndex;
    }
  }

  _showItemFlash(item) {
    const el = document.getElementById('item-flash');
    if (!el) return;
    clearTimeout(this._itemFlashTimer);
    if (!item) { el.classList.remove('show'); return; }
    const def = getItem(item.id);
    if (!def) { el.classList.remove('show'); return; }
    el.querySelector('.if-icon').textContent = def.icon ?? '';
    el.querySelector('.if-name').textContent = def.name;
    el.querySelector('.if-desc').textContent = def.desc ?? '';
    el.classList.add('show');
    this._itemFlashTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ── Crosshair state ───────────────────────────────────────────────────

  setCrosshairState(moving, interactive, mineProgress) {
    if (!this._crosshair) return;
    this._crosshair.classList.toggle('ch-spread',      moving && mineProgress < 0.05);
    this._crosshair.classList.toggle('ch-interactive', interactive);
    this._crosshair.classList.toggle('ch-mining',      mineProgress > 0.02);
  }

  setMineProgress(p) {
    if (!this._mineArc) return;
    // stroke-dasharray circumference = 2*π*17 ≈ 106.8
    const circ = 106.8;
    this._mineArc.style.strokeDashoffset = `${circ * (1 - Math.min(1, p))}`;
    this._mineArc.style.opacity = p > 0.01 ? '1' : '0';
  }

  // ── Pause overlay ─────────────────────────────────────────────────────

  setPaused(paused) {
    this._paused = paused;
    if (this._pauseOverlay) {
      this._pauseOverlay.style.display = paused ? 'flex' : 'none';
    }
  }

  // ── Weather HUD ───────────────────────────────────────────────────────

  setWeather(state, intensity) {
    const el = document.getElementById('weather-hud');
    if (!el) return;
    const icons = { clear: '☀️', rain: '🌧️', storm: '⛈️' };
    el.textContent = icons[state] ?? '☀️';
    el.style.opacity = state === 'clear' ? '0.5' : '1';
    el.title = `${state.charAt(0).toUpperCase() + state.slice(1)} (${(intensity * 100).toFixed(0)}%)`;
    const warn = document.getElementById('storm-shelter-warn');
    if (warn) warn.style.display = (state === 'storm' && intensity >= 0.5) ? 'block' : 'none';
  }

  // ── Challenge HUD ────────────────────────────────────────────────────

  updateChallenge(challenge, progress, completed) {
    const hud     = document.getElementById('challenge-hud');
    const label   = document.getElementById('ch-label');
    const fill    = document.getElementById('ch-bar-fill');
    const counter = document.getElementById('ch-counter');
    if (!hud || !label || !fill || !counter) return;
    const pct = Math.min(1, progress / challenge.need);
    const col = completed ? '#44ff44' : '#44cc44';
    hud.classList.toggle('complete', completed);
    label.textContent   = `${challenge.icon ?? ''} ${challenge.label}`;
    fill.style.width      = `${pct * 100}%`;
    fill.style.background = col;
    counter.style.color   = col;
    if (completed) {
      counter.textContent = '✓ COMPLETE!';
    } else {
      const shown = challenge.type === 'bot_run'
        ? `${Math.floor(progress)}s / ${challenge.need}s`
        : `${Math.floor(progress)} / ${challenge.need}`;
      counter.textContent = shown;
    }
  }

  // ── Daily Contract HUD (under the Salvage Run chip) ───────────────────

  updateDaily(contract, progress, claimed) {
    const hud     = document.getElementById('daily-hud');
    const label   = document.getElementById('dc-label');
    const fill    = document.getElementById('dc-bar-fill');
    const counter = document.getElementById('dc-counter');
    const streak  = document.getElementById('dc-streak');
    if (!hud || !label || !fill || !counter) return;
    const c = contract.contract ?? contract;
    if (!c) { hud.style.display = 'none'; return; }
    hud.style.display = 'block';
    const pct = Math.min(1, progress / c.need);
    const col = claimed ? '#f0b429' : '#c88a2a';
    hud.classList.toggle('complete', claimed);
    label.textContent   = `${c.icon} ${c.label}`;
    fill.style.width      = `${pct * 100}%`;
    fill.style.background = col;
    counter.style.color   = col;
    if (claimed) {
      counter.textContent = `✓ +${c.reward.xp} XP`;
    } else if (c.type === 'bot_run') {
      counter.textContent = `${Math.floor(progress)}s / ${c.need}s`;
    } else {
      counter.textContent = `${Math.floor(progress)} / ${c.need}`;
    }
    if (streak) {
      const n = contract.streak?.count ?? 1;
      const shieldHeld = contract.streak?.shield !== false;
      const mercy = contract.streak?.lastMercy;
      streak.textContent = (n > 1 ? `🔥×${n}` : '🔥') + (shieldHeld || mercy ? ' 🛡️' : '');
      streak.title = shieldHeld
        ? `${n}-day streak (best ${contract.streak?.best ?? n}) — shield armed: one missed day is forgiven`
        : `${n}-day streak (best ${contract.streak?.best ?? n}) — shield burned${mercy ? ' ' + mercy : ''}: a miss now resets the streak`;
      streak.classList.toggle('shield-burned', !shieldHeld);
    }
  }

  /** Night-shift payout notice — lives in the comeback cluster, transient. */
  notifyNightShift(result, botName = 'Your bot') {
    const row = document.getElementById('dc-night');
    if (!row || !result) return;
    const total = Object.values(result.loot).reduce((a, b) => a + b, 0);
    row.textContent = `🌙 ${botName} hauled ${total} items overnight — check the card`;
    row.classList.add('show');
    clearTimeout(this._dcNightTimer);
    this._dcNightTimer = setTimeout(() => row.classList.remove('show'), 20000);
  }

  // ── Welcome Back card (returning sessions) ────────────────────────────

  showWelcomeBack(report) {
    const card = document.getElementById('welcome-back');
    if (!card) return;
    const sub  = document.getElementById('wb-subtitle');
    const rows = document.getElementById('wb-rows');
    if (sub)  sub.textContent  = report.subtitle;
    if (rows) rows.innerHTML   = report.rows.map(r =>
      `<div class="wb-row"><span class="wb-icon">${r.icon}</span><span class="wb-text">${r.text}</span></div>`).join('');
    card.classList.add('show');
    clearTimeout(this._wbTimer);
    this._wbTimer = setTimeout(() => this.hideWelcomeBack(), 9000);
    document.getElementById('wb-close')?.addEventListener('click', () => this.hideWelcomeBack());
    card.onclick = e => { if (e.target === card) this.hideWelcomeBack(); };
  }

  hideWelcomeBack() {
    document.getElementById('welcome-back')?.classList.remove('show');
  }

  // ── Zone / Time HUD ──────────────────────────────────────────────────

  setZone(zone, timeLabel) {
    if (!this._zoneLabel) return;
    const icon = { Night:'🌙', Dawn:'🌅', Morning:'☀️', Midday:'☀️', Afternoon:'🌤️', Dusk:'🌇' }[timeLabel] ?? '🌙';
    const text = `${zone}  ·  ${icon} ${timeLabel}`;
    if (this._zoneLast === text) return;   // zone+time are stable most frames
    this._zoneLast = text;
    this._zoneLabel.textContent = text;
  }

  showZoneToast(name) {
    if (!this._zoneToast) return;
    this._zoneToast.textContent = `▶  ${name.toUpperCase()}`;
    this._zoneToast.classList.add('show');
    clearTimeout(this._zoneToastTimer);
    this._zoneToastTimer = setTimeout(() => this._zoneToast.classList.remove('show'), 3000);
  }

  // ── Block label ───────────────────────────────────────────────────────

  setBlockLabel(blockId) {
    if (blockId === this._blockLabelLast) return;   // crosshair id stable most frames
    this._blockLabelLast = blockId;
    if (blockId == null) {
      this._blockLabel.style.display = 'none';
    } else {
      const def = BLOCK_DEF[blockId];
      this._blockLabel.textContent = def ? `[ ${def.name.toUpperCase()} ]` : '';
      this._blockLabel.style.display = 'block';
    }
  }

  // ── Inventory overlay ─────────────────────────────────────────────────

  _bindOverlayEvents() {
    this._craftBtn.addEventListener('click', () => this._doCraft());
    this._craftBtnX5.addEventListener('click', () => this._doCraftBatch(5));
    document.addEventListener('mousemove', e => this._moveTooltip(e));

    document.getElementById('btn-print-report')
      ?.addEventListener('click', () => this.printProgressReport());

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeTab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
        document.getElementById(`tab-${this._activeTab}`)?.style.setProperty('display', 'block');
        if (this._activeTab === 'crafting') this._renderRecipes();
        if (this._activeTab === 'achievements') this._renderAchievements();
        if (this._activeTab === 'codex') this._renderCodexList();
        if (this._activeTab === 'stats') this._renderStats();
      });
    });
  }

  openInventory(station = 'any') {
    this._currentStation = station;
    this._overlayOpen = true;
    this._overlay.classList.add('open');
    this._activeTab = 'crafting';
    document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    document.querySelectorAll('.tab-panel').forEach((p, i) => p.style.display = i === 0 ? 'block' : 'none');
    this._renderInventory();
    this._renderRecipes();
    document.exitPointerLock();
  }

  closeInventory() {
    this._overlayOpen = false;
    this._overlay.classList.remove('open');
    this._selectedRecipe = null;
    this._craftBtn.style.display = 'none';
    this._craftBtnX5.style.display = 'none';
    // Guarded: unguarded requestPointerLock() here froze tabs when the browser
    // denies the lock (no user gesture / headless) — rig v2 P1.
    try { document.getElementById('game-canvas')?.requestPointerLock?.(); } catch { /* lock denied — fine */ }
  }

  toggleInventory() {
    if (this._overlayOpen) this.closeInventory();
    else this.openInventory(this._currentStation);
  }

  get isOpen() { return this._overlayOpen; }

  _renderInventory() {
    this._invGrid.innerHTML = '';
    for (let i = 0; i < 36; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      const item = this.game.player.inventory[i];
      if (item) {
        const def = getItem(item.id);
        slot.innerHTML = `<span class="item-icon">${def?.icon ?? '?'}</span>
          <span class="item-name">${def?.name ?? item.id}</span>
          ${item.qty > 1 ? `<span class="item-count">${item.qty}</span>` : ''}`;
        slot.addEventListener('mouseenter', e => this._showTooltip(e, item.id));
        slot.addEventListener('mouseleave', () => this.hideTooltip());
      }
      this._invGrid.appendChild(slot);
    }
  }

  _renderRecipes() {
    this._recipeList.innerHTML = '';
    const recipes = this.game.craftingSystem.getAvailableRecipes(
      this._currentStation, this.game.player.crafted,
    );

    for (const r of recipes) {
      const card = document.createElement('div');
      card.className = `recipe-card${r.canCraft ? ' craftable' : ''}`;
      const def = getItem(r.output);

      const ingLines = Object.entries(r.ingredients).map(([id, qty]) => {
        const have = this.game.player.countItem(id);
        const idef = getItem(id);
        const ok = have >= qty;
        return `<span class="${ok ? 'ok' : 'missing'}">${ok ? '✓' : '✗'} ${qty}× ${idef?.name ?? id} (${have})</span>`;
      });
      if (r.tool) {
        const have = this.game.player.hasTool(r.tool);
        const tdef = getItem(r.tool);
        ingLines.push(`<span class="${have ? 'ok' : 'missing'}">${have ? '✓' : '✗'} Tool: ${tdef?.name ?? r.tool}</span>`);
      }

      card.innerHTML = `
        <div class="r-name">${def?.icon ?? ''} ${def?.name ?? r.output} ×${r.qty}</div>
        <div class="r-result">${def?.desc ?? ''}</div>
        <div class="r-station">Station: ${r.station}${r.tier ? ` · Tier ${r.tier}` : ''}</div>
        <div class="r-reqs">${ingLines.join('<br>')}</div>`;

      card.addEventListener('click', () => {
        this._selectedRecipe = r;
        this._craftBtn.style.display = r.canCraft ? 'block' : 'none';
        this._craftBtnX5.style.display = r.canCraft ? 'block' : 'none';
        document.querySelectorAll('.recipe-card').forEach(c => c.style.outline = 'none');
        card.style.outline = '2px solid #f0b429';
      });
      this._recipeList.appendChild(card);
    }
  }

  _doCraft() {
    if (!this._selectedRecipe) return;
    const result = this.game.craftingSystem.craft(this._selectedRecipe.id);
    if (result.ok) {
      if (result.dropped > 0) this.notify('Inventory full — some items were lost!');
      this._renderInventory();
      this._renderRecipes();
      this._selectedRecipe = null;
      this._craftBtn.style.display = 'none';
      this._craftBtnX5.style.display = 'none';
      this.updateHotbar(this.game.player);
    } else {
      this.notify(`Can't craft: ${result.reason}`);
      this.game.audio.error();
    }
  }

  _doCraftBatch(n) {
    if (!this._selectedRecipe) return;
    const id = this._selectedRecipe.id;
    let crafted = 0, full = false;
    for (let i = 0; i < n; i++) {
      const result = this.game.craftingSystem.craft(id);
      if (!result.ok) break;
      crafted++;
      if (result.dropped > 0) { full = true; break; }
    }
    if (crafted === 0) {
      this.notify(`Can't craft: not enough materials`);
      this.game.audio.error();
      return;
    }
    if (full) this.notify('Inventory full — some items were lost!');
    this.notify(`⚒ Crafted ×${crafted}${crafted < n ? ' (materials exhausted)' : ''}!`);
    this._renderInventory();
    this._renderRecipes();
    this._selectedRecipe = null;
    this._craftBtn.style.display = 'none';
    this._craftBtnX5.style.display = 'none';
    this.updateHotbar(this.game.player);
  }

  // ── Achievement tab ───────────────────────────────────────────────────

  _renderAchievements() {
    const list = document.getElementById('ach-list');
    if (!list) return;
    const all = this.game.achievements.getAll();
    list.innerHTML = all.map(a => `
      <div class="ach-item ${a.done ? 'done' : 'locked'}">
        <span class="ach-icon">${a.icon}</span>
        <div class="ach-info">
          <div class="ach-name">${a.name}</div>
          <div class="ach-desc">${a.done ? a.desc : '???'}</div>
        </div>
        ${a.done ? '<span class="ach-check">✓</span>' : ''}
      </div>`).join('');
  }

  onAchievement(id) {
    const ach = ACHIEVEMENT_LIST.find(a => a.id === id);
    if (!ach) return;
    this._achieveQueue.push(ach);
    this.game.audio.achievement();
    if (!this._showingAchieve) this._showNextAchieve();
  }

  _showNextAchieve() {
    if (!this._achieveQueue.length) { this._showingAchieve = false; return; }
    this._showingAchieve = true;
    const ach = this._achieveQueue.shift();
    const toast = this._achieveToast;
    document.getElementById('ach-toast-icon').textContent = ach.icon;
    document.getElementById('ach-toast-name').textContent = ach.name;
    document.getElementById('ach-toast-desc').textContent = ach.desc;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => this._showNextAchieve(), 400);
    }, 4000);
  }

  // ── Codex ─────────────────────────────────────────────────────────────

  _buildCodex() {
    if (!this._codexList) return;
    this._codexList.innerHTML = CODEX.map(e => `
      <div class="codex-entry" data-id="${e.id}">
        <span>${e.icon}</span> ${e.title}
      </div>`).join('');
    this._codexList.querySelectorAll('.codex-entry').forEach(el => {
      el.addEventListener('click', () => this._showCodexEntry(el.dataset.id));
    });
  }

  _renderCodexList() { /* already built statically */ }

  _renderStats() {
    const panel = document.getElementById('stats-panel');
    if (!panel) return;
    const s = this.game.achievements?.stats ?? {};
    const x = this.game.xpSystem;

    const bar = (val, max = 100) => {
      const pct = Math.min(100, Math.round((val / max) * 100));
      return `<div class="stat-bar-wrap"><div class="stat-bar-fill" style="width:${pct}%"></div></div>`;
    };
    const row = (label, val, barMax = 0) =>
      `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-val">${val}</span></div>${barMax ? bar(val, barMax) : ''}`;

    panel.innerHTML = `
      <div class="stat-card">
        <h4>FIELD ACTIVITY</h4>
        ${row('Blocks mined', s.totalMined ?? 0, 200)}
        ${row('Blocks placed', s.blocksPlaced ?? 0, 50)}
        ${row('Night mines', s.nightMines ?? 0, 20)}
        ${row('Crystal ore', s.crystalMined ?? 0, 10)}
        ${row('Lucky finds', s.luckyFinds ?? 0, 5)}
      </div>
      <div class="stat-card">
        <h4>CRAFTING</h4>
        ${row('Recipes known', (s.crafted?.size ?? 0), 25)}
        ${row('Items crafted (types)', (s.crafted?.size ?? 0))}
        ${row('Quests completed', s.questsCompleted ?? 0, 14)}
        ${row('XP earned', x?.xp ?? 0, 1440)}
        ${row('Level', x?.level ?? 0, 12)}
      </div>
      <div class="stat-card">
        <h4>MAKER LAB</h4>
        ${row('Programs run', s.programsRun ?? 0, 20)}
        ${row('Sensors explored', s.uniqueSensorsUsed ?? 0, 12)}
        ${row('Wokwi exports', s.wokwiExported ?? 0, 5)}
        ${row('Lap records', s.lapsCompleted ?? 0, 5)}
        ${row('Waypoints reached', s.waypointReached ?? 0, 5)}
      </div>
      <div class="stat-card">
        <h4>CHAOS METRICS</h4>
        ${row('Cannons fired', s.cannonsFired ?? 0, 20)}
        ${row('Airdrop loots', s.airdropLoots ?? 0, 10)}
        ${row('Ore detections', s.oreDetections ?? 0, 10)}
        ${row('Grenade max blast', s.grenadeMaxBlocks ?? 0, 10)}
        ${row('Headlamp uses', s.headlampUsed ?? 0, 5)}
      </div>`;
  }

  printProgressReport() {
    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const s  = this.game.achievements?.stats ?? {};
    const x  = this.game.xpSystem;
    const ac = this.game.achievements?.getAll() ?? [];
    const unlocked = ac.filter(a => a.done);
    const session  = (() => { try { return JSON.parse(localStorage.getItem('scrapcraft_session') ?? 'null'); } catch { return null; } })();
    const myBrains = (() => { try { return JSON.parse(localStorage.getItem('scrapcraft_my_brains') ?? '[]'); } catch { return []; } })();
    const name = session?.displayName ?? 'Engineer';
    const date = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

    const GRADE_COLOR = { 'A+': '#00bb77', A: '#00aa66', B: '#558800', C: '#aa7700', D: '#cc3300' };

    const badgeHTML = unlocked.slice(0, 30).map(a =>
      `<span style="background:#f0f8f0;border:1px solid #cce4cc;border-radius:5px;padding:3px 8px;font-size:11px;margin:3px;display:inline-block">${a.icon} ${a.name}</span>`
    ).join('');

    const brainHTML = myBrains.slice(0, 5).map(b =>
      `<li>${b.name} <span style="color:${GRADE_COLOR[b.grade] ?? '#555'}">${b.grade}</span></li>`
    ).join('') || '<li style="color:#888">No programs published yet</li>';

    const makerStats = [
      ['Programs run',      s.programsRun     ?? 0],
      ['Sensors explored',  s.uniqueSensorsUsed ?? 0],
      ['Wokwi exports',     s.wokwiExported   ?? 0],
      ['Challenges done',   s.challengesCompleted ?? 0],
      ['Hardware flashes',  s.hardwareFlashes ?? 0],
      ['Brains shared',     s.brainsShared    ?? 0],
    ];

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Scrapcraft Progress Report — ${name}</title>
<style>
  body { font-family: 'Courier New', monospace; background: #f4faf4; color: #1a3a1a; max-width: 700px; margin: 32px auto; padding: 24px; }
  h1 { font-size: 22px; color: #226622; letter-spacing: 2px; border-bottom: 2px solid #44aa44; padding-bottom: 8px; }
  h2 { font-size: 13px; color: #336633; letter-spacing: 1px; margin: 20px 0 8px; }
  .meta { font-size: 11px; color: #447744; margin-bottom: 16px; }
  .level-badge { display: inline-block; background: #226622; color: #fff; border-radius: 6px; padding: 4px 14px; font-size: 14px; font-weight: bold; margin-right: 12px; }
  .xp-label { font-size: 12px; color: #447744; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  td, th { text-align: left; padding: 5px 8px; border-bottom: 1px solid #d4e8d4; }
  th { color: #336633; font-size: 9px; letter-spacing: 1px; background: #e8f8e8; }
  .badges { margin: 6px 0; }
  ul { margin: 4px 0; padding-left: 18px; font-size: 11px; }
  li { margin: 3px 0; }
  .footer { margin-top: 24px; font-size: 9px; color: #779977; border-top: 1px solid #cce4cc; padding-top: 8px; }
  @media print { body { margin: 8px; padding: 8px; } }
</style></head><body>
<h1>⚙️ SCRAPCRAFT PROGRESS REPORT</h1>
<div class="meta">
  Student: <strong>${esc(name)}</strong>&nbsp;&nbsp;|&nbsp;&nbsp;Date: ${date}${session?.classCode ? `&nbsp;&nbsp;|&nbsp;&nbsp;Class: ${esc(session.classCode)}` : ''}
</div>

<span class="level-badge">Level ${x?.level ?? 0}</span>
<span class="xp-label">${x?.xp ?? 0} XP total</span>

<h2>MAKER LAB ACTIVITY</h2>
<table>
  <tr><th>METRIC</th><th>COUNT</th></tr>
  ${makerStats.map(([k, v]) => `<tr><td>${k}</td><td><strong>${v}</strong></td></tr>`).join('')}
</table>

<h2>PUBLISHED PROGRAMS</h2>
<ul>${brainHTML}</ul>

<h2>ACHIEVEMENTS UNLOCKED (${unlocked.length} / ${ac.length})</h2>
<div class="badges">${badgeHTML || '<span style="color:#888">No achievements yet</span>'}</div>

<div class="footer">
  Generated by Scrapcraft Educational Edition &nbsp;|&nbsp; ${date}<br>
  CSTA K-12 CS Standards: 1B-AP-10, 2-AP-10 through 2-AP-19
</div>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) { this.notify('⚠ Pop-up blocked — allow pop-ups to print.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  _showCodexEntry(id) {
    const entry = CODEX.find(e => e.id === id);
    if (!entry || !this._codexContent) return;
    this._codexContent.innerHTML = `
      <h3>${entry.icon} ${entry.title}</h3>
      <div class="codex-text">${entry.text.split('\n\n').map(p => `<p>${p}</p>`).join('')}</div>`;
  }

  // ── Foreman bubble ────────────────────────────────────────────────────

  showForeman(text) {
    this._foremanText.textContent = text;
    this._foremanBubble.style.display = 'block';
    clearTimeout(this._dismissTimer);
    this._dismissTimer = setTimeout(() => this.hideForeman(), 9000);
    this.game.audio?.earlSpeak();
  }

  hideForeman() { this._foremanBubble.style.display = 'none'; }

  showQuest(quest) {
    this._questTitle.textContent = quest.title;
    this._questSteps.innerHTML = quest.steps.map(s => `<div class="quest-step">${s.label}</div>`).join('');
    this._questBox.style.display = 'block';
  }

  updateQuestProgress(quest, player) {
    const els = this._questSteps.querySelectorAll('.quest-step');
    quest.steps.forEach((s, i) => els[i]?.classList.toggle('done', s.check(player)));
  }

  clearQuest() { this._questBox.style.display = 'none'; }

  // ── Tooltip ───────────────────────────────────────────────────────────

  _showTooltip(e, itemId) {
    const def = getItem(itemId);
    if (!def) return;
    this._tipName.textContent = `${def.icon} ${def.name}`;
    this._tipDesc.textContent = def.desc ?? '';
    this._tooltip.style.display = 'block';
    this._moveTooltip(e);
  }

  _moveTooltip(e) {
    this._tooltip.style.left = (e.clientX + 14) + 'px';
    this._tooltip.style.top  = (e.clientY + 14) + 'px';
  }

  hideTooltip() { this._tooltip.style.display = 'none'; }

  // ── XP Bar ────────────────────────────────────────────────────────────

  setXP(level, progress, skillName = '') {
    if (this._xpFill)       this._xpFill.style.width       = `${Math.round(progress * 100)}%`;
    if (this._xpLevelText)  this._xpLevelText.textContent  = `Lv.${level}`;
    if (this._xpSkillBadge) this._xpSkillBadge.textContent = skillName;
  }

  showLevelUp(level, skill = null) {
    if (!this._levelupToast) return;
    this._luIcon.textContent  = skill?.icon ?? '⬆️';
    this._luTitle.textContent = `LEVEL ${level}`;
    this._luSkill.textContent = skill ? skill.name : '';
    this._levelupToast.classList.add('show');
    clearTimeout(this._luTimer);
    this._luTimer = setTimeout(() => {
      this._levelupToast.classList.remove('show');
    }, 3200);
  }

  // ── Notifications ─────────────────────────────────────────────────────

  notify(text) {
    const el = document.createElement('div');
    el.className = 'notif';
    el.textContent = text;
    this._notifContainer.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  // ── Bot Speech Bubble ─────────────────────────────────────────────────

  showBotSpeech(botName, line) {
    let el = document.getElementById('bot-speech-card');
    if (!el) return;
    // Truncate very long lines for the card
    const display = line.length > 80 ? line.slice(0, 77) + '…' : line;
    const nameEl  = el.querySelector('#bsc-name');
    const textEl  = el.querySelector('#bsc-text');
    if (nameEl) nameEl.textContent = `🤖 ${botName ?? 'BOT'}`;
    if (textEl) textEl.textContent = display;
    el.classList.add('show');
    clearTimeout(this._botSpeechTimer);
    this._botSpeechTimer = setTimeout(() => el.classList.remove('show'), 5000);
  }

  updateBotBond(name, bond) {
    const nameEl = document.getElementById('bot-badge-name');
    const barEl  = document.getElementById('bot-badge-bar');
    const pctEl  = document.getElementById('bot-badge-pct');
    const badge  = document.getElementById('bot-name-badge');
    if (!badge) return;
    if (nameEl) nameEl.textContent = name ?? '?';
    const pct = Math.round(bond ?? 0);
    if (pctEl) pctEl.textContent = `Bond ${pct}%`;
    if (barEl)  barEl.style.width = `${pct}%`;
  }

  showBotBadge(visible) {
    const badge = document.getElementById('bot-name-badge');
    if (badge) badge.style.display = visible ? 'block' : 'none';
  }

  // ── Bot Serial Monitor (legacy, used by TileEditor) ───────────────────

  logBotMessage(line) {
    this._botLog = this._botLog ?? [];
    this._botLog.push(line);
    if (this._botLog.length > 5) this._botLog.shift();
    const logEl  = document.getElementById('bot-serial-log');
    const linesEl = document.getElementById('bsl-lines');
    if (!logEl || !linesEl) return;
    logEl.classList.add('active');
    linesEl.innerHTML = this._botLog.map((msg, i) =>
      `<div class="bsl-line${i === this._botLog.length - 1 ? ' new' : ''}">${msg.replace(/</g,'&lt;').slice(0, 30)}</div>`
    ).join('');
    clearTimeout(this._botLogHideTimer);
    this._botLogHideTimer = setTimeout(() => logEl.classList.remove('active'), 6000);
  }

  clearBotLog() {
    this._botLog = [];
    const logEl = document.getElementById('bot-serial-log');
    if (logEl) logEl.classList.remove('active');
  }

  // ── Field Notes ───────────────────────────────────────────────────────

  toggleFieldNotes() {
    let panel = document.getElementById('field-notes-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'field-notes-panel';
      panel.innerHTML = `
        <div id="fn-title">📓 FIELD NOTES  <span id="fn-close" style="float:right;cursor:pointer;color:#888">✕</span></div>
        <div style="font-size:9px;color:#555;margin-bottom:5px;">Engineering notebooks save careers. [N] to close.</div>
        <textarea id="fn-text" spellcheck="false" placeholder="Write coordinates, observations, program ideas..."></textarea>`;
      panel.style.cssText = `
        position:fixed; top:80px; right:230px; width:220px;
        background:rgba(10,12,8,0.95); border:1px solid #3a5a3a;
        border-radius:7px; padding:10px; font-family:'Courier New',monospace;
        font-size:10px; color:#aaa; z-index:300;`;
      document.getElementById('hud').appendChild(panel);
      const ta = panel.querySelector('#fn-text');
      ta.style.cssText = `
        width:100%; height:160px; background:#0a0e08; border:1px solid #2a3a2a;
        border-radius:4px; color:#88cc88; font-family:inherit; font-size:10px;
        padding:6px; resize:none; outline:none; line-height:1.5;`;
      ta.value = localStorage.getItem('scrapcraft_notes') ?? '';
      ta.addEventListener('input', () => localStorage.setItem('scrapcraft_notes', ta.value));
      panel.querySelector('#fn-close').addEventListener('click', () => panel.remove());
      setTimeout(() => ta.focus(), 50);
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      panel.remove();
    }
  }

  /**
   * Radio tower control panel. Shows component install progress and, once all
   * four components are seated, an ACTIVATE button. Reuses the field-notes
   * overlay pattern (DOM panel appended to #hud, releases pointer lock).
   */
  // ── Landmark plaques — readable signage ────────────────────────────────

  showPlaquePanel(plaque, onRead) {
    document.getElementById('plaque-panel')?.remove();
    if (document.pointerLockElement) document.exitPointerLock();

    const panel = document.createElement('div');
    panel.id = 'plaque-panel';
    panel.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      width:360px; background:rgba(12,10,4,0.97); border:2px solid #b08d57;
      border-radius:10px; padding:18px; font-family:'Courier New',monospace;
      color:#e8d5a3; z-index:400; box-shadow:0 0 40px rgba(176,141,87,0.3);`;

    panel.innerHTML = `
      <div style="font-size:10px;color:#8a744c;letter-spacing:2px;margin-bottom:6px;">🪧 BRASS PLAQUE · BRIGHTWORKS YARD</div>
      <div style="font-size:15px;font-weight:bold;color:#ffd98a;margin-bottom:2px;">${plaque.name} <span style="font-weight:normal;color:#b08d57;">— ${plaque.epithet}</span></div>
      <div style="font-size:11px;line-height:1.7;margin:10px 0;color:#d8c696;font-style:italic;">${plaque.line}</div>
      <div style="font-size:11px;line-height:1.7;padding:10px;background:rgba(176,141,87,0.08);border-left:3px solid #b08d57;border-radius:4px;">
        <b style="color:#ffd98a;">What it taught us:</b> ${plaque.lesson}
      </div>
      <div style="font-size:10px;color:#8a744c;margin-top:10px;text-align:center;">Thank this machine.</div>
      <button id="plq-close" style="margin-top:12px;width:100%;padding:9px;
        background:#2a2114;color:#e8d5a3;border:1px solid #b08d57;border-radius:6px;
        font-family:inherit;font-weight:bold;cursor:pointer;letter-spacing:1px;">CLOSE  [E]</button>`;
    document.body.appendChild(panel);

    panel.querySelector('#plq-close').addEventListener('click', () => {
      panel.remove();
      document.getElementById('game-canvas')?.requestPointerLock();
    });
    onRead?.();
  }

  showTowerPanel(slots, reqs, activated, onInstall, onActivate) {
    document.getElementById('tower-panel')?.remove();
    if (document.pointerLockElement) document.exitPointerLock();

    const panel = document.createElement('div');
    panel.id = 'tower-panel';
    panel.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      width:340px; background:rgba(6,10,16,0.97); border:2px solid #2a6688;
      border-radius:10px; padding:18px; font-family:'Courier New',monospace;
      color:#9fd8ff; z-index:400; box-shadow:0 0 40px rgba(0,120,200,0.35);`;

    const allDone = Object.entries(reqs).every(([id, n]) => (slots[id] ?? 0) >= n);

    const rows = Object.entries(reqs).map(([id, need]) => {
      const have = slots[id] ?? 0;
      const def  = getItem(id);
      const done = have >= need;
      const carry = this.game.player.countItem(id);
      return `<div style="display:flex;justify-content:space-between;align-items:center;
          padding:5px 0;border-bottom:1px solid #16384a;">
          <span>${done ? '✅' : '⬜'} ${def?.icon ?? ''} ${def?.name ?? id}</span>
          <span style="color:${done ? '#44ff99' : '#ffcc44'}">${have}/${need}
            ${!done ? `<span style="color:#557;font-size:9px">(carry ${carry})</span>` : ''}</span>
        </div>`;
    }).join('');

    if (activated) {
      panel.innerHTML = `
        <div style="font-size:15px;font-weight:bold;color:#44ff99;margin-bottom:8px;">📡 TRANSMITTER ONLINE</div>
        <div style="font-size:11px;line-height:1.6;color:#8fc8e8;">
          The tower hums. Somewhere out past the yard, someone is listening.<br><br>
          Signal strength: <b style="color:#44ff99">100%</b><br>
          Broadcasting on 433&nbsp;MHz.</div>
        <button id="tw-close" style="margin-top:14px;width:100%;padding:9px;
          background:#163a4a;color:#9fd8ff;border:1px solid #2a6688;border-radius:6px;
          font-family:inherit;font-weight:bold;cursor:pointer;letter-spacing:1px;">CLOSE  [E]</button>`;
    } else {
      panel.innerHTML = `
        <div style="font-size:15px;font-weight:bold;margin-bottom:4px;">📡 RADIO TOWER</div>
        <div style="font-size:10px;color:#5a7a8a;margin-bottom:10px;line-height:1.5;">
          Dead since before your time. Seat all four components, then fire it up.</div>
        ${rows}
        <button id="tw-install" style="margin-top:12px;width:100%;padding:9px;
          background:#1a4a2a;color:#9fffcc;border:1px solid #2a8855;border-radius:6px;
          font-family:inherit;font-weight:bold;cursor:pointer;letter-spacing:1px;">⬆ INSTALL FROM INVENTORY</button>
        <button id="tw-activate" style="margin-top:7px;width:100%;padding:9px;
          background:${allDone ? '#aa6600' : '#222'};color:${allDone ? '#fff' : '#555'};
          border:1px solid ${allDone ? '#ffaa00' : '#333'};border-radius:6px;
          font-family:inherit;font-weight:bold;letter-spacing:1px;
          cursor:${allDone ? 'pointer' : 'not-allowed'};">⚡ ACTIVATE TRANSMITTER</button>
        <button id="tw-close" style="margin-top:7px;width:100%;padding:7px;
          background:transparent;color:#557;border:1px solid #234;border-radius:6px;
          font-family:inherit;font-size:11px;cursor:pointer;">Close  [E]</button>`;
    }

    document.getElementById('hud').appendChild(panel);
    this._towerPanelOpen = true;
    const close = () => { panel.remove(); this._towerPanelOpen = false;
      document.getElementById('game-canvas')?.requestPointerLock(); };
    panel.querySelector('#tw-close')?.addEventListener('click', close);
    panel.querySelector('#tw-install')?.addEventListener('click', () => { onInstall?.(); close();
      this.game.foreman?.onEvent('near_tower', {}); });
    panel.querySelector('#tw-activate')?.addEventListener('click', () => {
      if (!allDone) { this.notify('Tower needs all four components first.'); this.game.audio.error(); return; }
      close(); onActivate?.();
    });
  }

  setHealth(hp, maxHp = 100) {
    const fill = document.getElementById('hud-health-fill');
    const num  = document.getElementById('hud-health-num');
    if (!fill || !num) return;
    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    fill.style.width = `${pct}%`;
    fill.classList.toggle('warn', pct <= 50 && pct > 25);
    fill.classList.toggle('crit', pct <= 25);
    num.textContent = Math.round(hp);
  }

  flashDamage() {
    const el = document.getElementById('damage-vignette');
    if (!el) return;
    el.classList.add('flash');
    clearTimeout(this._dmgFlashTimer);
    this._dmgFlashTimer = setTimeout(() => el.classList.remove('flash'), 350);
  }

  // ── Scrap Exchange Panel ─────────────────────────────────────────────────────

  showExchangePanel(deals, exchange, player, xpSystem, onTrade) {
    const existing = document.getElementById('exchange-panel');
    if (existing) { existing.remove(); return null; }

    const panel = document.createElement('div');
    panel.id = 'exchange-panel';
    panel.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      background:#0a0a0a; border:1px solid #2a2a2a; border-radius:10px;
      padding:20px 24px; z-index:900; min-width:460px; max-width:540px;
      font-family:'Courier New',monospace; color:#ccc; font-size:11px;
      box-shadow:0 8px 40px rgba(0,0,0,0.8);
    `;

    const refreshHrs = Math.ceil(exchange.msUntilRefresh / 3_600_000);
    const haveItem   = (id, qty) => {
      const s = player.inventory?.find(s => s?.id === id);
      return (s?.qty ?? 0) >= qty;
    };

    const rows = deals.map((deal, i) => {
      const canTrade = haveItem(deal.give.item, deal.give.qty);
      const giveLabel = `${deal.give.qty}× ${deal.give.item.replace(/_/g,' ')}`;
      const getLabel  = `${deal.get.qty}× ${deal.get.item.replace(/_/g,' ')}`;
      const haveQty   = player.inventory?.find(s => s?.id === deal.give.item)?.qty ?? 0;
      return `
        <div style="border:1px solid ${canTrade?'#1a3040':'#1a1a1a'};border-radius:7px;
                    padding:10px 14px;margin-bottom:8px;background:${canTrade?'#070e14':'#080808'};
                    display:flex;align-items:center;gap:12px">
          <div style="flex:1">
            <div style="color:#888;font-size:9px;letter-spacing:1px;margin-bottom:4px">TRADE</div>
            <div style="color:${canTrade?'#cc8844':'#666'}">${giveLabel}</div>
            <div style="color:#444;font-size:9px;margin-top:1px">have: ${haveQty}</div>
          </div>
          <div style="color:#33557a;font-size:20px;padding:0 4px">→</div>
          <div style="flex:1">
            <div style="color:#888;font-size:9px;letter-spacing:1px;margin-bottom:4px">RECEIVE</div>
            <div style="color:#4af">${getLabel}</div>
          </div>
          ${canTrade
            ? `<button class="exc-trade" data-idx="${i}" style="
                background:#071420;border:1px solid #1a4060;border-radius:4px;
                color:#4af;padding:5px 14px;font-family:inherit;font-size:10px;
                cursor:pointer;letter-spacing:1px;white-space:nowrap;">TRADE</button>`
            : `<span style="color:#333;font-size:9px">need ${deal.give.qty - haveQty} more</span>`}
        </div>`;
    }).join('');

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;
                  margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid #1a1a1a">
        <div>
          <div style="color:#f0b429;font-size:14px;font-weight:bold;letter-spacing:2px">📦 SCRAP EXCHANGE</div>
          <div style="color:#555;font-size:9px;margin-top:2px">Daily deals — resets in ~${refreshHrs}h · Trades: ${exchange.tradesCompleted}</div>
        </div>
        <button id="exc-close" style="background:none;border:none;color:#555;font-size:18px;cursor:pointer;padding:0 4px">✕</button>
      </div>
      <div style="color:#444;font-size:9px;margin-bottom:12px;font-style:italic">Earl's contact drops three deals per day. Same deals for everyone. First come, first served.</div>
      ${rows}
      <div style="color:#333;font-size:9px;margin-top:10px;text-align:center">[E] to close</div>
    `;

    document.getElementById('hud').appendChild(panel);

    panel.querySelector('#exc-close').addEventListener('click', () => panel.remove());
    panel.querySelectorAll('.exc-trade').forEach(btn => {
      btn.addEventListener('click', () => onTrade?.(parseInt(btn.dataset.idx)));
    });

    return panel;
  }

  // ── Bot Upgrade Panel ───────────────────────────────────────────────────────

  showBotUpgradePanel(upgradeDefs, botUpgrades, xpSystem, player, onPurchase) {
    const existing = document.getElementById('bot-upgrade-panel');
    if (existing) { existing.remove(); return null; }

    const panel = document.createElement('div');
    panel.id = 'bot-upgrade-panel';
    panel.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      background:#0a0a0a; border:1px solid #2a2a2a; border-radius:10px;
      padding:20px 24px; z-index:900; min-width:480px; max-width:580px;
      font-family:'Courier New',monospace; color:#ccc; font-size:11px;
      box-shadow:0 8px 40px rgba(0,0,0,0.8);
    `;

    const lvl = xpSystem?.level ?? 0;

    const rows = upgradeDefs.map(def => {
      const owned      = botUpgrades.purchased.has(def.id);
      const prereqOk   = botUpgrades.prereqsMet(def.id);
      const levelOk    = lvl >= def.levelReq;
      const affordable = botUpgrades.canAfford(def.id, player.inventory);
      const available  = !owned && prereqOk && levelOk && affordable;
      const locked     = !prereqOk;

      const costHTML = Object.entries(def.cost)
        .map(([item, qty]) => {
          const slot = player.inventory?.find(s => s?.id === item);
          const have = slot?.qty ?? 0;
          const ok   = have >= qty;
          return `<span style="color:${ok?'#6c6':'#c66'}">${qty}× ${item.replace(/_/g,' ')}</span>`;
        }).join(', ');

      const prereqNames = def.prereqs
        .map(id => upgradeDefs.find(u => u.id === id)?.name ?? id)
        .join(' + ');

      let statusBadge;
      if (owned)      statusBadge = `<span style="color:#4c4;font-size:9px;padding:2px 6px;border:1px solid #1a3a1a;border-radius:3px;">✓ INSTALLED</span>`;
      else if (locked) statusBadge = `<span style="color:#555;font-size:9px;padding:2px 6px;border:1px solid #222;border-radius:3px;">LOCKED</span>`;
      else if (!levelOk) statusBadge = `<span style="color:#866;font-size:9px;padding:2px 6px;border:1px solid #431;border-radius:3px;">LEVEL ${def.levelReq} REQ</span>`;
      else if (!affordable) statusBadge = `<span style="color:#a84;font-size:9px;padding:2px 6px;border:1px solid #430;border-radius:3px;">MATERIALS NEEDED</span>`;
      else             statusBadge = `<span style="color:#4af;font-size:9px;padding:2px 6px;border:1px solid #148;border-radius:3px;">AVAILABLE</span>`;

      const canBtn = available && !owned;
      return `
        <div style="border:1px solid ${owned?'#1a3a1a':available?'#0a2030':'#1a1a1a'};border-radius:7px;
                    padding:10px 12px;margin-bottom:8px;background:${owned?'#080e08':available?'#080c10':'#080808'};">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
            <span style="font-size:18px">${def.icon}</span>
            <div style="flex:1">
              <div style="color:${owned?'#4c4':available?'#4af':'#888'};font-weight:bold;letter-spacing:1px">${def.name}</div>
              <div style="color:#555;font-size:9px;margin-top:1px">${def.desc}</div>
            </div>
            ${statusBadge}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
            <div style="color:#444;font-size:9px">${costHTML}${locked?` · Requires: ${prereqNames}`:''}</div>
            ${canBtn ? `<button class="bup-install" data-id="${def.id}" style="
              background:#071420;border:1px solid #1a4060;border-radius:4px;
              color:#4af;padding:4px 12px;font-family:inherit;font-size:10px;
              cursor:pointer;letter-spacing:1px;white-space:nowrap;">Install</button>` : ''}
          </div>
        </div>`;
    }).join('');

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;
                  padding-bottom:10px;border-bottom:1px solid #1a1a1a">
        <div>
          <div style="color:#f0b429;font-size:14px;font-weight:bold;letter-spacing:2px">🔧 BOT WORKSHOP</div>
          <div style="color:#555;font-size:9px;margin-top:2px">Install permanent hardware upgrades · Level ${lvl}</div>
        </div>
        <button id="bup-close" style="background:none;border:none;color:#555;font-size:18px;cursor:pointer;padding:0 4px">✕</button>
      </div>
      <div id="bup-rows">${rows}</div>
      <div style="color:#333;font-size:9px;margin-top:12px;text-align:center">[U] to close</div>
    `;

    document.getElementById('hud').appendChild(panel);

    panel.querySelector('#bup-close').addEventListener('click', () => panel.remove());
    panel.querySelectorAll('.bup-install').forEach(btn => {
      btn.addEventListener('click', () => onPurchase?.(btn.dataset.id));
    });

    return panel;
  }

  // ── Race Board Panel ─────────────────────────────────────────────────────

  showRaceBoardPanel(raceBoard) {
    const existing = document.getElementById('race-board-panel');
    if (existing) { existing.remove(); return; }

    const board = raceBoard.getBoard();
    const rows = board.map(e => {
      const t      = RaceBoard.formatTime(e.ms);
      const hilit  = e.isPlayer ? 'border-color:#f0b429;background:rgba(240,180,41,0.08)' : '';
      const medal  = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : `${e.rank}.`;
      const name   = e.isPlayer ? `<b style="color:#f0b429">${e.name}</b>` : e.name;
      const bot    = e.bot ? `<span style="color:#555;font-size:9px"> · bot: ${e.bot}</span>` : '';
      const note   = `<div style="color:#444;font-size:9px;margin-top:1px">${e.note}</div>`;
      return `<div style="border:1px solid #222;border-radius:4px;padding:7px 10px;margin-bottom:4px;${hilit}">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="color:#888;font-size:10px;min-width:20px">${medal}</span>
          <span style="flex:1;color:#ccc;font-size:12px;padding:0 8px">${name}${bot}</span>
          <span style="color:${e.isPlayer ? '#f0b429' : '#88cc88'};font-size:13px;font-weight:bold;font-family:'Courier New',monospace">${t}</span>
        </div>${note}</div>`;
    }).join('');

    const panel = document.createElement('div');
    panel.id = 'race-board-panel';
    panel.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      background:#0e0e0e; border:2px solid #f0b429; border-radius:10px;
      padding:18px 20px; width:360px; z-index:9002;
      font-family:'Courier New',monospace; font-size:11px; color:#ccc;
      box-shadow:0 0 32px rgba(240,180,41,0.2);
    `;
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #333">
        <div>
          <div style="color:#f0b429;font-size:15px;font-weight:bold;letter-spacing:2px">🏟 OVAL CIRCUIT</div>
          <div style="color:#555;font-size:9px;margin-top:2px">RACE BOARD — Circuit City Grand Prix</div>
        </div>
        <button id="rb-close" style="background:none;border:none;color:#555;font-size:18px;cursor:pointer;padding:0 4px">✕</button>
      </div>
      ${rows}
      <div style="color:#333;font-size:9px;margin-top:10px;text-align:center">Run a bot lap to set your time · [E] to close</div>
    `;
    document.getElementById('hud').appendChild(panel);
    panel.querySelector('#rb-close').addEventListener('click', () => panel.remove());
    return panel;
  }

  /** Toggle the Codex (Field Guide) panel. */
  toggleCodex(codex) {
    const panel = document.getElementById('codex-panel');
    if (!panel) return;
    const isOpen = panel.classList.toggle('open');
    if (!isOpen) return;
    this._renderCodex(codex, 'all');
    if (!panel.dataset.listenersAttached) {
      panel.dataset.listenersAttached = '1';
      panel.querySelectorAll('.cx-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          panel.querySelectorAll('.cx-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._renderCodex(codex, btn.dataset.cat);
        });
      });
      panel.querySelector('#codex-close').onclick = () => panel.classList.remove('open');
    }
  }

  _renderCodex(codex, cat = 'all') {
    const grid   = document.getElementById('codex-grid');
    const detail = document.getElementById('codex-detail');
    const countEl = document.getElementById('codex-count');
    const barEl   = document.getElementById('codex-bar');
    if (!grid || !detail) return;

    countEl.textContent = `${codex.count} / ${codex.total} DISCOVERED`;
    barEl.style.width   = `${codex.percent}%`;

    const all = codex.getAll();
    const items = cat === 'all' ? all : all.filter(i => (i.category ?? 'other') === cat);

    grid.innerHTML = items.map(item => {
      const unk = !item.discovered;
      return `<div class="cx-card${unk ? ' unknown' : ''}" data-id="${item.id}" title="${unk ? '???' : item.name}">
        <span class="cx-icon">${unk ? '❓' : (item.icon ?? '📦')}</span>
        <span class="cx-label">${unk ? '???' : item.name}</span>
      </div>`;
    }).join('');

    detail.innerHTML = `<div id="codex-detail-empty">Select an item to see details</div>`;

    grid.querySelectorAll('.cx-card:not(.unknown)').forEach(card => {
      card.addEventListener('click', () => {
        grid.querySelectorAll('.cx-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const item = all.find(i => i.id === card.dataset.id);
        if (!item) return;
        detail.innerHTML = `
          <span id="codex-detail-icon">${item.icon ?? '📦'}</span>
          <div id="codex-detail-name">${item.name}</div>
          <div id="codex-detail-cat">${(item.category ?? '—').toUpperCase()} · ${item.id}</div>
          <div id="codex-detail-desc">${item.desc ?? ''}</div>
        `;
      });
    });
  }
}
