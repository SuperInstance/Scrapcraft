# SCRAPCRAFT — Research & Positioning, August 2026

> Branch: `research` · Docs only · All claims cite URLs in [docs/briefs/research-notes-2026-08-23.md](briefs/research-notes-2026-08-23.md) or inline.
> Method: web survey (Aug 23 2026) + two synthesis passes (opencode/GLM-5.3 analyst run + doc critique run; claude pass attempted, session-limited). Critique-driven revisions folded in — see §4.4.

---

## 1. The Landscape — build-and-program-robot games for ages 10–14

The field sorts into **three clusters**. Nobody straddles them.

**Cluster 1 — Premium sandbox builders (the soul, paywalled):**
Deep, joyful machine-building with real physics; programming stops at "logic blocks." Buy-once pricing ($15–25) excludes the classroom and the cashless kid.

| Game | Teaches | Business model | Why kids stay | Missing |
|---|---|---|---|---|
| **Trailmakers** ([site](https://www.playtrailmakers.com/), [review](https://nerdtropolis.com/trailmakers-video-game-review/)) | Vehicle engineering, physics intuition; "logic blocks" for input→output wiring | Premium buy-once (~$25) | LEGO-snap building + iteration loop (crash → edit → retry) | No real code, no hardware, no AI |
| **Scrap Mechanic** ([Steam](https://store.steampowered.com/app/387990/Scrap_Mechanic/), [Wikipedia](https://en.wikipedia.org/wiki/Scrap_Mechanic)) | Gear ratios, bearings, logic gates; "Minecraft meets mechanical engineering"; ages ~8–16 | Premium, 1.0 launched Jul 2026; praised by parents for zero microtransactions ([screenwise](https://screenwiseapp.com/guides/scrap-mechanic-game)) | Creative freedom, community workshop, survival stakes | Same as above |
| **Besiege** ([Steam](https://store.steampowered.com/app/346010/Besiege/)) | Structural physics, iterative design; used in a published game-based robotics-concepts study ([ResearchGate](https://www.researchgate.net/publication/381807963_Teaching_Robotics_Concepts_with_Besiege_A_Game-_Based_Approach_for_Developing_Design_and_Problem-Solving_Skills)) | Premium (~$20) | Watch-it-collapse comedy + mastery | No code, no hardware |
| **Autonauts** ([Steam](https://store.steampowered.com/app/979120/Autonauts/)) | Visual-programming workerbot brains — the *closest* comp to "tile-programmed bot brains" | Premium | Automation compounding; cozy tone | No real code export, no hardware, scripted-not-real AI |
| **SimpleRockets 2 / Juno** ([Jundroo](https://jundroo.com/)) | Orbital mechanics, staging | Premium + **free education version** | Mastery, math-as-play | Aerospace-only scope |
| **KerbalEdu** ([forum](https://forum.kerbalspaceprogram.com/topic/211800-educational-licensing/), [reddit](https://www.reddit.com/r/KerbalSpaceProgram/comments/17hob7z/is_kerbaledu_dead/)) | Physics, systems thinking | Edu license via 3rd party (TeacherGaming, **ceased ~2021**); KSP1 edu persists via Private Division | Same as KSP | **Cautionary tale**: edu wrapper bolted onto a premium game via a dead middleman |

**Cluster 2 — Educational virtual robotics (the rigor, sterile):**
Free/cheap browser platforms with block→Python pipelines and curriculum alignment. No world to love, no characters, no game.

| Platform | Teaches | Business model | Missing |
|---|---|---|---|
| **VEX VR** ([vexrobotics.com](https://www.vexrobotics.com/vexcode/vr), [educators guide](https://kb.vex.com/hc/en-us/articles/10237033931028-VR-Educators-Start-Here)) | Blocks→Python, virtual sensors, competition-style playgrounds | **Free** (funnels to VEX hardware) | Soul. It's a worksheet with wheels |
| **Microsoft MakeCode** ([makecode.com](https://www.microsoft.com/en-us/makecode)) | Blocks→JS/Python, **browser device flashing** for micro:bit/Circuit Playground; **Arcade is a free browser game editor with hardware export** | **Free** (Microsoft-funded) | Arcade is a 2D game *editor* — not a persistent world, narrative, or robot companions. Still, our closest feature-rival for the hardware bridge; see §4.2 honesty check |
| **CoderZ** ([gocoderz.com](https://gocoderz.com/)) | 3D robot missions, Blockly→Python, grades 3–12 | Paid school licenses | Play, personality, hardware export |
| **LEGO SPIKE Prime / FLL** ([LEGO update](https://education.lego.com/en-us/spike-update-2026/), [FLL Future Edition](https://www.first-lego-league.org/en/divisions/future-edition-8)) | Scratch-blocks→Python on $359.99 hardware ([brickeconomy](https://www.brickeconomy.com/set/45678-1/lego-education-spike-prime-set)) | Kit + competition ecosystem | **SPIKE is being RETIRED**; app supported only to Jun 2031; FLL transitions to new "Computer Science & AI kits" (Future Edition) alongside SPIKE until 2027–28 ([FIRST](https://community.firstinspires.org/new-era-first-lego-league-future-edition)). *Timing honesty: schools may ride SPIKE to end-of-life — the procurement peak could be 2028+, but **coach uncertainty about 2026–28 seasons starts now**, and that planning anxiety is the real opening*
| **MIT RAISE DAILy / "How to Train Your Robot"** ([SIGCSE report](https://robots.media.mit.edu/wp-content/uploads/sites/7/2021/03/SIGCSE_2021-DAILy-experience-report.pdf), [AAAI](https://ojs.aaai.org/index.php/AAAI/article/view/17847)) | 30-hr AI+ethics curriculum, grades 5–8 | Free (research) | Not a game — no sustained voluntary engagement |
| **Experience AI** ([experience-ai.org](https://experience-ai.org/en/), [launch](https://www.raspberrypi.org/blog/experience-ai-launch-lessons/)) | AI literacy for **ages 11–14 exactly** | Free (Raspberry Pi Foundation + Google DeepMind) | Lessons, not worlds |

**Cluster 3 — Free UGC platforms (the reach, toxic economics):**

| Platform | Teaches | Business model | Reality |
|---|---|---|---|
| **Roblox** (Plane Crazy, Build a Boat) ([tutorial evidence](https://plane-crazy.fandom.com/wiki/Tutorials/Basic_Plane)) | Aerodynamics, center-of-mass/lift, mechanisms | Free; devs keep ~**25% effective** ([analysis](https://rolearn.dev/insights/roblox-developer-revenue-share-2026/)); Robux economy | Aug 2026 **US Senate child-safety investigation** ([gamesindustry.biz](https://www.gamesindustry.biz/us-senate-to-investigate-roblox-following-claims-it-prioritises-revenue-and-engagement-over-child-safety)) — parent-trust vacuum |
| **Minecraft Create mod** ([wiki](https://github.com/Creators-of-Create/Create/wiki), [Outschool class](https://outschool.com/classes/minecraft-engineering-with-the-create-mod-camp-with-teacher-tom-10-14yo-eSpaoKOj)) | Rotational power, RPM, stress capacity, gear ratios | Free (Minecraft + $0 mod); **Outschool charges for guided classes aimed at exactly 10–14yo** — proof parents pay for curated engineering play | Requires Minecraft + mod installs — IT-hostile in schools |

### Brutal honesty
- **"Voxel sandbox where you build machines" is the most crowded corner** (Scrap Mechanic, Trailmakers, Besiege, Roblox UGC). We do not win there.
- **"Browser blocks→Python robot sim" is also crowded and free** (VEX VR, MakeCode). We do not out-free Microsoft.
- **What nobody occupies:** the *bridge* — a world worth loving (Cluster 1's soul) + a real pipeline to real hardware and real AI (Cluster 2's rigor) + zero-install free access (Cluster 3's reach). That gap is real, but crossing it means being excellent at two halves, not one.

---

## 2. Pedagogy — what the research actually supports

- **Constructionism (Papert lineage).** *Mindstorms* (1980) → Logo turtles → LEGO Mindstorms kits named in his honor. Reviews of game-making studies (55 over a decade) show problem-solving gains ([overview](https://en.wikipedia.org/wiki/Constructionism_(learning_theory)), [arXiv review](https://arxiv.org/html/1610.09610v1), [EV3 study](https://pmc.ncbi.nlm.nih.gov/articles/PMC4784508/)). Scrapcraft's mine→build→program→race loop is constructionist to the bone; this is the defensible framing for educators.
- **AI4K12 (AAAI + CSTA).** Five Big Ideas: Perception, Representation & Reasoning, Learning, Natural Interaction, Societal Impact. In **grades 6–8, societal impact becomes a first-class topic** ([ai4k12.org](https://ai4k12.org/), [grade-band charts](https://ai4k12.org/gradeband-progression-charts/)). Scrapcraft's curriculum mapping should target these five explicitly — Big Idea 3 (learning from data) and 4 (natural interaction) map directly onto Spark and teach-back.
- **AI literacy curricula exist and are free** — and that's an opportunity, not a threat: Experience AI targets **exactly ages 11–14** ([experience-ai.org](https://experience-ai.org/en/)); MIT RAISE DAILy pilots (n=31, 87% underrepresented in STEM) showed significant gains in AI conceptual understanding and bias awareness ([SIGCSE 2021](https://robots.media.mit.edu/wp-content/uploads/sites/7/2021/03/SIGCSE_2021-DAILy-experience-report.pdf)). **The gap is not curriculum — it's an engaging vehicle.** Teachers have lessons; they lack a world students will voluntarily re-enter.
- **Teach-back assessment has published backing**, from two directions:
  1. **Teach-back method** (health-literacy origin): AHRQ-endorsed ([AHRQ TeamSTEPPS](https://www.ahrq.gov/teamstepps-program/curriculum/communication/tools/teachback.html)); systematic reviews show knowledge and adherence gains, with retention evidence noted as mixed ([review](https://pmc.ncbi.nlm.nih.gov/articles/PMC6590951/)).
  2. **Protégé effect / teachable agents**: expecting-to-teach improves recall and organization; Stanford's AAA Lab (Betty's Brain lineage) showed students learn more, faster, and *work harder for their agent* ([Stanford AAA Lab](https://aaalab.stanford.edu/teachable-agents/research), [protégé effect paper](https://aaalab.stanford.edu/papers/Protege_Effect_Teachable_Agents.pdf)).
  Scrapcraft's bot-heart (a bot the student is responsible for) + teach-back moments (explain your bot's brain back to Earl/Spark) implement the protégé effect *inside a game*. That is a citable, rare alignment.

---

## 3. Distribution — channels and compliance for a ~1.5MB-built web game

| Channel | Deal shape | Fit | Dealbreakers |
|---|---|---|---|
| **Web-direct** (own domain) | Own everything; dist is 1.5MB → loads in seconds on school Chromebooks | **Best for Bet A.** Teachers get a URL, not an install; full control of Spark/gallery | Zero built-in discovery — reach must be earned (SEO, teachers, communities) |
| **CrazyGames** ([docs](https://docs.crazygames.com/)) | Non-exclusive; SDK required for monetization; PEGI 12; ≤50MB initial | Fine for Bet C reach; bundle size trivially passes | Ad-SDK monetization only; external-call policies need review for scrap-spark |
| **Poki** ([dev docs summary](https://donislawdev.com/earnings-and-statistics-from-my-8-games-android-ios-webgl/)) *(secondary source — verify terms directly before deciding)* | Prefers **5-yr web exclusivity**; 100% rev when we bring the player, 50% when they do; flat fee if non-exclusive | Poor fit | **Blocks external requests by default → breaks the scrap-spark AI backend.** A Spark-lobotomized Scrapcraft is not Scrapcraft |
| **itch.io** ([creator FAQ](https://itch.io/docs/creators/faq)) | Open revenue sharing — we choose itch's cut; embeddable iframe widget; no ads | Credible indie page + widget for the teacher blog | Weak under-13 discovery |
| **Roblox** | Not a channel for a web game — full Luau rebuild required; ~25% effective dev share *(estimate; see [rolearn analysis](https://rolearn.dev/insights/roblox-developer-revenue-share-2026/))*; child-safety investigation | No (2026–27) | Economics + brand risk contradict the kid-safe positioning |

**COPPA (under-13) — the hard rules** ([FTC voice guidance](https://www.ftc.gov/news-events/news/press-releases/2017/10/ftc-provides-additional-guidance-coppa-voice-recordings), [six-step plan](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business)):
- Persistent saves + accounts + voice = **personal information of children** → verifiable parental consent required before collection.
- Voice exception is narrow: only when audio is used transiently to replace written words and is **promptly deleted** after transcription. Long-lived voice or voice-derived profiles are squarely regulated.
- School context (with a district contract) is the classic clean path — another argument for Bet A's classroom-first posture.
- Consequence for product: **under-13 defaults = local saves, no persistent voice, parental-consent gate before any cloud feature**; classroom mode operates under school agreements.

---

## 4. Synthesis — landscape map, thesis, three bets

### The map (one line each)
1. **Soul cluster** (Trailmakers/Scrap Mechanic/Autonauts): worlds kids love; paywalled; no real code, no hardware, no AI.
2. **Rigor cluster** (VEX VR/MakeCode/CoderZ): pipelines teachers trust; free or licensed; no world, no characters, no love.
3. **Reach cluster** (Roblox/Minecraft): free and everywhere; unsafe-feeling (Roblox) or IT-hostile (mods); creators keep scraps.

### Differentiation thesis — what only Scrapcraft can do
**The agent fleet IS the game's soul.** Companions backed by real models (Spark via scrap-spark, SHA-256-cached so the fleet's economics are designed to survive a classroom of 30 — *cost math TBD*), QC'd by a 1,196-test internal harness (a development discipline, **not a market differentiator** — teachers don't buy test suites), teaching real embedded concepts (tile programs that compile to actual Arduino C++/MicroPython and flash real boards over WebSerial, with a virtual Uno twin enforcing real pin constraints). Three "only-we" pillars:
1. **Programs that leave the game — inside a world worth staying in.** No competitor compiles a visual program to real firmware and flashes real hardware from the browser *inside a persistent 3D world with characters*. (Honesty check: **MakeCode Arcade** is free, browser-based, and flashes hardware — but it is a 2D game *editor*, not a world; Autonauts has brains but they die in the save file.)
2. **AI companions that are actually AI** — not dialogue trees — with a cache doctrine intended to collapse per-student cost (*cost math not yet published — hit-rate and $/student-hour audit is a todo*), and failure-as-content (Most Interesting Failure of the Week) that turns the protégé effect into shareable moments.
3. **Bot-heart characters implementing teach-back** — the citable pedagogy (§2) embodied as gameplay, aligned to AI4K12's Big Ideas and Experience AI's exact age band.

### Three positioning bets, ranked (synthesis of two independent model analyses)

**BET 1 — Classroom beachhead in the LEGO transition window. (Highest conviction.)**
LEGO is retiring SPIKE (support ends 2031; the FLL program splits into Founders/Future Editions with "Computer Science & AI kits" arriving by 2027–28 — [FIRST](https://community.firstinspires.org/new-era-first-lego-league-future-edition)). Simultaneously, free AI curricula (Experience AI, ages 11–14) create demand for an engaging vehicle. Schools structurally solve COPPA; teacher mode already exists; the hardware bridge is a moat vs. free virtual-only rivals.
*Honest failure modes:* district procurement is 6–18 months; FLL may anoint partners that aren't us; **WebSerial is blocked on many managed Chromebooks** — the moat must degrade gracefully to downloadable .hex/.uf2 + full simulation; teacher PD burden.
*Build next (90 days):* (1) an 8–10 lesson unit mapping chapters to AI4K12 five Big Ideas + Experience AI, with offline/Spark-less fallback and per-student progress export; (2) school-IT hardening — WebSerial audit on managed Chromebooks, .hex/.uf2 download fallback, rosterless room codes, one-page COPPA/data agreement; (3) 5–10 instrumented pilot classrooms + one case study presented at a CSTA chapter or FLL educator event.

**BET 2 — Companion-soul as the shareable wedge. (Amplifier, not a standalone strategy.)**
The bot heart (name, dents, repair log, retirement shelf) and failure gallery are the most original design material; protégé-effect research says kids work harder *for* their agent. But virality is a lottery, web-direct has zero discovery, and a viral spike means inference bills with no revenue. Post-Senate-scrutiny, "AI companion for kids" is a headline we don't fully control.
*Build next:* 15-second clip export of bot milestones and Most Interesting Failure; strict COPPA-clean under-13 defaults; a 2-minute demo video showing tiles→C++→real board blink — the single most persuasive artifact this project can produce.

**BET 3 — Free web game + hardware kit upsell + premium teacher dashboard. (Lowest; deferred.)**
Three businesses at once (game, kit logistics, SaaS) with muscle for none; kit margins thin; and the channel math is fatal — Poki breaks the AI backend, so "free web game" ships lobotomized or doesn't ship. The dashboard without pilots is a feature, not a company. Revisit only after Bet 1 pilots produce pricing evidence (per-class vs per-site).

### The single biggest honest risk
**Our moat and our market contradict each other.** The differentiator — flashing real hardware from a browser — is precisely what locked-down school Chromebooks and district IT policy block. If WebSerial fails in situ, Bet 1 collapses into a virtual robotics sim competing with free, Microsoft-funded MakeCode. Mitigation is cheap and immediate: make simulation-first the default posture, with .hex/.uf2 export as the compliant bridge and WebSerial as the progressive enhancement. Audit in week one, not month six.

### §4.4 Sequencing correction (from the critique pass)
The two model passes disagreed on order, and the critique wins on logic: classrooms are the **slowest, costliest place to test the core unproven premise** — that kids voluntarily re-enter the world. Revised execution order:
- **Step 0 (now): engagement validation.** The 2-minute tiles→C++→real-board demo video; instrumented informal play sessions (club night, library, one robotics team); optionally an Outschool-style paid class — our own research shows parents already pay for Create-mod classes for exactly 10–14yo ([Outschool](https://outschool.com/classes/minecraft-engineering-with-the-create-mod-camp-with-teacher-tom-10-14yo-eSpaoKOj)).
- **Step 0.5 (week 1): WebSerial audit** on managed Chromebooks — gates whether Bet 1 leads with hardware or simulation-first.
- **Then Bet 1** as the destination, with pilot classrooms scaled on evidence, not hope.

### The missing foundation (stated loudly)
**Zero primary customer evidence exists.** No teacher interviews, no pilot data, no kid has played it yet. Every bet above is a hypothesis until Step 0 produces first signal. "The gap is not curriculum — it's an engaging vehicle" is an inference from free-curriculum supply, not yet from teacher testimony. Fix this before spending on any bet's build list.

---

## 5. Source index
All URLs verified Aug 23 2026; raw notes with per-topic groupings in [docs/briefs/research-notes-2026-08-23.md](briefs/research-notes-2026-08-23.md).
Key primary sources: ai4k12.org · experience-ai.org · education.lego.com/spike-update-2026 · firstinspires.org (FLL Future Edition) · ftc.gov (COPPA voice guidance, six-step plan) · docs.crazygames.com · itch.io/docs/creators/faq · robots.media.mit.edu (SIGCSE 2021 DAILy) · aaalab.stanford.edu (teachable agents) · vexrobotics.com/vexcode/vr · microsoft.com/makecode · store.steampowered.com (Scrap Mechanic, Besiege, Autonauts) · gamesindustry.biz (Roblox Senate investigation).
