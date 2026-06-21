import { getItem } from './data/items.js';
import { BLOCK_DEF } from './data/blocks.js';
import { ACHIEVEMENT_LIST } from './Achievements.js';

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

    this._buildHotbar();
    this._buildCodex();
    this._bindOverlayEvents();

    document.getElementById('foreman-dismiss').addEventListener('click', () => this.hideForeman());
  }

  // ── Hotbar ────────────────────────────────────────────────────────────

  _buildHotbar() {
    this._hotbar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.innerHTML = `<span class="slot-num">${i + 1}</span>
        <span class="item-icon"></span><span class="item-count"></span>`;
      slot.addEventListener('mouseenter', () => this._showHotbarTip(i));
      slot.addEventListener('mouseleave', () => this._hideHotbarTip());
      this._hotbar.appendChild(slot);
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
    const slots = this._hotbar.querySelectorAll('.hotbar-slot');
    const prevIndex = this._lastHotbarIndex ?? player.hotbarIndex;
    slots.forEach((slot, i) => {
      const item = player.inventory[i];
      slot.classList.toggle('active', i === player.hotbarIndex);
      slot.querySelector('.item-icon').textContent  = item ? (getItem(item.id)?.icon ?? '?') : '';
      slot.querySelector('.item-count').textContent = item?.qty > 1 ? item.qty : '';
    });
    // Active item label above hotbar
    const active = player.inventory[player.hotbarIndex];
    if (this._activeLabel) {
      const def = active ? getItem(active.id) : null;
      this._activeLabel.textContent = def ? `${def.icon} ${def.name}` : '';
      this._activeLabel.style.opacity = def ? '1' : '0';
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

  // ── Zone / Time HUD ──────────────────────────────────────────────────

  setZone(zone, timeLabel) {
    if (!this._zoneLabel) return;
    const icon = { Night:'🌙', Dawn:'🌅', Morning:'☀️', Midday:'☀️', Afternoon:'🌤️', Dusk:'🌇' }[timeLabel] ?? '🌙';
    this._zoneLabel.textContent = `${zone}  ·  ${icon} ${timeLabel}`;
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
    document.addEventListener('mousemove', e => this._moveTooltip(e));

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
    document.getElementById('game-canvas').requestPointerLock();
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
      this.updateHotbar(this.game.player);
    } else {
      this.notify(`Can't craft: ${result.reason}`);
      this.game.audio.error();
    }
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

  // ── Bot Serial Monitor ────────────────────────────────────────────────

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
}
