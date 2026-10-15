#!/usr/bin/env python3
"""Generate cinema-mobile.html (Level 3 pocket cinema) from cinema.html.

Replaces the desktop studio v2 CSS block and markup block with mobile-first
variants. Everything else (game CSS, boot overlays, start screen, HUD,
error trap) is shared verbatim.
"""
import re, sys

SRC = '/home/hatch/workspace/build/scrapcraft/cinema.html'
DST = '/home/hatch/workspace/build/scrapcraft/cinema-mobile.html'

src = open(SRC, encoding='utf-8').read()

MOBILE_CSS = """    /* ── Level 3 pocket cinema: mobile-first ── */
    body.cinema {
      background: #080808; color: #e8dcc0;
      display: flex; flex-direction: column;
      height: 100vh; height: 100dvh; overflow: hidden;
    }
    body.cinema #canvas-container { position: absolute; inset: 0; }
    body.cinema #start-screen #start-btn,
    body.cinema #start-screen .controls-hint { display: none; }
    body.cinema #cinema-skip { display: none !important; }

    #l2-topbar {
      flex: 0 0 auto; display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; background: #0c0c0c; border-bottom: 1px solid #2a2118;
      z-index: 600; font-family: 'Courier New', monospace;
    }
    #l2-brand { color: #f0b429; font-size: 12px; letter-spacing: 2px; white-space: nowrap; }
    #l2-beat { color: #8a7a5a; font-size: 10px; letter-spacing: 1px; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; flex: 1 1 auto; min-width: 0; }
    #l2-topbar button {
      background: #141414; color: #ffd970; border: 1px solid #f0b429;
      font-family: inherit; font-size: 11px; letter-spacing: 1px;
      padding: 10px 12px; border-radius: 8px; cursor: pointer; white-space: nowrap;
      min-height: 44px;
    }
    #l2-topbar button[hidden] { display: none; }
    #l2-resume { background: #f0b429; color: #111; font-weight: bold; }

    #l3-tabs { flex: 0 0 auto; display: flex; gap: 6px; padding: 8px 10px 0; z-index: 600; }
    #l3-tabs button {
      flex: 1; background: #101010; color: #8a7a5a; border: 1px solid #2a2118;
      border-bottom: none; font-family: 'Courier New', monospace; font-size: 11px;
      letter-spacing: 3px; padding: 10px; border-radius: 8px 8px 0 0; cursor: pointer;
      min-height: 44px;
    }
    #l3-tabs button.on { background: #1c1608; color: #ffd970; border-color: #f0b429; }

    #l3-main { flex: 1 1 auto; min-height: 0; position: relative; overflow: hidden;
      display: flex; flex-direction: column; align-items: center; justify-content: center; }
    #l2-view3d { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #000; overflow: hidden; }
    #l2-view3d[hidden], #l3-viewtext[hidden] { display: none; }
    .l2-panehead {
      position: absolute; top: 8px; left: 10px; z-index: 5;
      font-family: 'Courier New', monospace; font-size: 10px; letter-spacing: 2px;
      color: #f0b429; background: rgba(0,0,0,.55); padding: 3px 8px; border-radius: 4px;
      pointer-events: none;
    }
    #l3-viewtext {
      position: relative; width: 100%; aspect-ratio: 16 / 9; display: flex; flex-direction: column;
      background: #050505; overflow: hidden; cursor: pointer;
    }
    #l2-ascii {
      flex: 1 1 auto; min-height: 0; overflow: hidden; margin: 0; padding: 26px 6px 8px;
      white-space: pre; font-family: 'Courier New', monospace; font-size: 8px;
      line-height: 1.05; color: #d8c890; user-select: none;
    }
    #l2-view3d #cs-bar-top, #l2-view3d #cs-bar-bot {
      height: 7vh !important; background: #000;
    }
    #l2-view3d #cs-subtitle {
      bottom: calc(7vh + 8px); font-size: 15px; padding: 0 14px;
      text-shadow: 0 2px 8px #000, 0 0 2px #000;
    }
    #l2-veil {
      position: absolute; inset: 0; z-index: 20; background: #050505;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 10px; transition: opacity 1.4s ease; text-align: center; padding: 0 24px;
    }
    #l2-veil.gone { opacity: 0; pointer-events: none; }
    #l2-veil h1 { margin: 0; font-family: Georgia, serif; font-size: 34px;
      letter-spacing: 10px; color: #f0b429; }
    #l2-veil .l2-veil-sub { font-family: 'Courier New', monospace; font-size: 11px;
      letter-spacing: 4px; color: #8a7a5a; }
    #l2-veil .l2-veil-tag { font-family: Georgia, serif; font-style: italic;
      font-size: 14px; color: #b8a888; }
    #l2-held-badge {
      position: absolute; top: 34px; left: 50%; transform: translateX(-50%); z-index: 15;
      background: rgba(240,180,41,.92); color: #111; font-family: 'Courier New', monospace;
      font-size: 10px; letter-spacing: 1px; padding: 8px 12px; border-radius: 6px;
      white-space: nowrap; max-width: 92vw; overflow: hidden; text-overflow: ellipsis;
    }

    #l3-sheet {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 700;
      background: #0b0b0b; border-top: 1px solid #2a2118; border-radius: 14px 14px 0 0;
      transform: translateY(calc(100% - 46px)); transition: transform .28s ease;
      padding-bottom: env(safe-area-inset-bottom, 0);
      max-height: 64dvh; display: flex; flex-direction: column;
      font-family: 'Courier New', monospace;
    }
    #l3-sheet.open { transform: translateY(0); }
    #l3-handle { flex: 0 0 46px; display: flex; align-items: center; justify-content: center;
      cursor: pointer; }
    #l3-handle span { width: 44px; height: 5px; border-radius: 3px; background: #3a3a3a; }
    #l3-sheetbody { overflow-y: auto; padding: 0 14px 22px; }
    #l3-chips { display: flex; gap: 8px; overflow-x: auto; padding: 4px 0 12px;
      -webkit-overflow-scrolling: touch; }
    #l3-chips button {
      flex: 0 0 auto; background: #141414; color: #ffd970; border: 1px solid #3a3a3a;
      font-family: inherit; font-size: 11px; letter-spacing: 1px;
      padding: 10px 16px; border-radius: 20px; cursor: pointer; min-height: 44px;
      white-space: nowrap;
    }
    #l3-chips button.on { border-color: #f0b429; background: #241c08; }
    .l3-dial { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
    .l3-dial span { color: #8a7a5a; font-size: 10px; letter-spacing: 2px; flex: 0 0 82px; }
    .l3-dial input[type=range] { flex: 1 1 auto; accent-color: #f0b429; min-height: 32px; }
    .l3-dial b { color: #ffd970; font-size: 11px; flex: 0 0 40px; text-align: right; }
    .l3-check { display: flex; align-items: center; justify-content: space-between;
      margin: 10px 0; cursor: pointer; min-height: 44px; }
    .l3-check span { color: #8a7a5a; font-size: 10px; letter-spacing: 2px; }
    .l3-check input { width: 22px; height: 22px; accent-color: #f0b429; }
    #l3-teleline {
      margin-top: 10px; padding-top: 10px; border-top: 1px solid #1e1e1e;
      color: #6a6a6a; font-size: 10px; letter-spacing: 1px; line-height: 1.7;
    }
    #l3-moments { margin-top: 6px; }
    .l3-moment { color: #8a7a5a; font-size: 10px; letter-spacing: 1px; padding: 3px 0; }
    .l3-moment.dim { color: #4a4a4a; }
"""

MOBILE_MARKUP = """  <!-- ══ Level 3 pocket cinema: topbar + tabs + one full-width pane + bottom sheet ══ -->
  <div id="l2-topbar">
    <span id="l2-brand">POCKET&nbsp;CINEMA</span>
    <span id="l2-beat">···</span>
    <button id="l2-take" title="Take the camera">TAKE</button>
    <button id="l2-resume" title="Hand the camera back" hidden>RESUME</button>
    <button id="l2-skip" title="Skip this beat">SKIP</button>
    <button id="l2-mark" title="Mark this moment">♥</button>
  </div>
  <div id="l3-tabs">
    <button id="l3-tab-voxel" class="on">VOXEL</button>
    <button id="l3-tab-text">TEXT</button>
  </div>
  <div id="l3-main">
    <div id="l2-view3d">
      <div class="l2-panehead">VOXEL</div>
      <div id="cs-subtitle"></div>
      <div id="l2-held-badge" hidden>YOU HAVE THE CAMERA — tap RESUME</div>
      <div id="l2-veil">
        <h1>SCRAPCRAFT</h1>
        <div class="l2-veil-sub">A STORY CINEMA · POCKET EDITION</div>
        <div class="l2-veil-tag">The yard&rsquo;s story, told by itself. Tap anywhere for sound.</div>
      </div>
    </div>
    <div id="l3-viewtext" hidden>
      <div class="l2-panehead">PROJECTIONIST · TEXT — tap for the next look</div>
      <pre id="l2-ascii"></pre>
    </div>
  </div>
  <div id="l3-sheet">
    <div id="l3-handle"><span></span></div>
    <div id="l3-sheetbody">
      <div id="l3-chips"></div>
      <div id="l3-dials"></div>
      <label class="l3-check"><span>DRIFT — the machine changes its mind</span><input type="checkbox" id="l3-drift" checked></label>
      <div id="l3-teleline">—</div>
      <div id="l3-moments"></div>
    </div>
  </div>
"""

# ── swap the CSS block ──────────────────────────────────────────────────────
css_start = src.index('/* ── Level 2 studio v2')
css_end = src.index('  </style>', css_start)
src = src[:css_start] + MOBILE_CSS + src[css_end:]

# ── swap the studio markup block ────────────────────────────────────────────
mk_start = src.index('<!-- ══ Level 2 studio: topbar')
mk_end = src.index('<!-- ══ Start screen')
src = src[:mk_start] + MOBILE_MARKUP + '\n' + src[mk_end:]

# ── title + inline boot flag ────────────────────────────────────────────────
src = src.replace('<title>Scrapcraft</title>', '<title>Scrapcraft — Pocket Cinema</title>')
src = src.replace('window.__CINEMA__ = true;',
                  'window.__CINEMA__ = true;\n  window.__CINEMA_MOBILE__ = true;')
# ── Level 3 branding: the shared cinema.html says "Level 2" ────────────────
src = src.replace('Projectionist Level 2', 'Pocket Cinema — Level 3')

open(DST, 'w', encoding='utf-8').write(src)
print('wrote', DST, len(src), 'bytes')
