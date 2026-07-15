// Full-viewport Minesweeper, rendered on a 2D canvas as the site's background —
// and actually playable. On load an auto-solver deals one board and plays it out
// as an "attract" opening (it does not loop: it plays a single game, then stops).
// The moment you click, it hands control over: click a covered cell to reveal it
// (first click is always safe), right-click or long-press to flag, and click a
// satisfied number to chord its neighbors. Play happens in the margins around the
// terminal window, which sits on top and covers the middle of the board. Phosphor
// greens throughout to match the terminal, with the classic beveled buttons,
// numbered cells, little red flags and spoked mines. Purely decorative otherwise:
// renders a single frozen board under prefers-reduced-motion, hidden by `crt off`.

import { createFlyer } from './flyer.js'

let state = null
let enabled = true
let controller = null // set once the canvas is live; bridges the Konami trigger

// Konami-code entry point (main.js calls this): swap the Minesweeper background
// for the dodge-flyer. `onExit` fires when the player leaves the flyer (ESC).
export function startFlyer(onExit) {
  return controller ? controller.startFlyer(onExit) : false
}

// small seeded PRNG (mulberry32) — a fixed seed makes the opening board stable
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// phosphor palette, tuned to the terminal's greens
const C = {
  frame: '#040604', // gaps between cells / board backing
  cover: '#15321a', // raised button face
  coverHi: '#2f6b39', // bevel highlight (top-left)
  coverLo: '#081108', // bevel shadow (bottom-right)
  hover: 'rgba(180, 255, 190, 0.13)', // hovered covered cell
  face: '#0b160c', // revealed, sunken face
  faceEdge: '#060d06', // inset line on a revealed face
  boom: '#7a201a', // the cell whose mine was hit
  flag: '#ff5f56', // little flag (echoes the titlebar close dot)
  pole: '#c8ffc8',
  mine: '#d8ffe0',
  // number colors 1..8 — leaning classic, but glowing and green-forward
  num: ['', '#4bd865', '#7ff0b0', '#ffd257', '#5ab0ff', '#ff8a6b', '#4fe0cf', '#d8ffe0', '#9fbf9f'],
}

const MINE_DENSITY = 0.15
const STEP_MS = 130 // how often the attract solver takes a turn
const REVEAL_MS = 150
const FLAG_MS = 160
const MINE_MS = 260
const LONGPRESS_MS = 500 // touch: hold to flag

const easeOutBack = (p) => {
  const c1 = 1.70158
  const x = p - 1
  return 1 + (c1 + 1) * x * x * x + c1 * x * x
}

export async function initBackground() {
  const container = document.getElementById('bg')
  if (!container || state) return
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  container.appendChild(canvas)

  let CELL = 26
  let NOW = 0
  let VW = 0 // viewport size in CSS px (for the flyer's projection)
  let VH = 0
  let mode = 'auto' // 'auto' = attract solver plays · 'user' = you play
  let game = 'mines' // 'mines' = Minesweeper · 'flyer' = Konami dodge-flyer
  let flyer = null
  let flyerExitCb = null
  let looping = false
  let resizeQueued = false
  // board — flat typed arrays, reallocated on resize
  const B = {
    cols: 0, rows: 0, total: 0, mineCnt: 0,
    mine: null, adj: null, st: null, // st: 0 covered · 1 revealed · 2 flagged
    animT: null, animEnd: null, // per-cell animation window (animEnd <= 0 → done)
    live: new Set(), // cells currently animating (repainted each frame)
    revealed: 0, flagged: 0, hover: -1,
    phase: 'play', boom: -1, showMines: false, lastThink: 0,
    seed: 0x9e37, rng: null, instant: false,
  }

  const idx = (r, c) => r * B.cols + c
  function neighbors(i, cb) {
    const c = i % B.cols
    const r = (i / B.cols) | 0
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue
        const nr = r + dr
        const nc = c + dc
        if (nr < 0 || nc < 0 || nr >= B.rows || nc >= B.cols) continue
        cb(idx(nr, nc))
      }
    }
  }

  function startAnim(i, dur, delay) {
    if (B.instant) {
      B.animEnd[i] = -1
      return
    }
    B.animT[i] = NOW + (delay || 0)
    B.animEnd[i] = NOW + (delay || 0) + dur
    B.live.add(i)
  }
  function animP(i) {
    const end = B.animEnd[i]
    if (end <= 0) return 1
    const t = (NOW - B.animT[i]) / (end - B.animT[i])
    return t < 0 ? 0 : t > 1 ? 1 : t
  }

  // --- drawing (each cell is self-contained; no cross-cell shadows) ---
  function drawButton(fx, fy, fw, fh) {
    ctx.fillStyle = C.cover
    ctx.fillRect(fx, fy, fw, fh)
    const b = 2
    ctx.fillStyle = C.coverHi
    ctx.fillRect(fx, fy, fw, b)
    ctx.fillRect(fx, fy, b, fh)
    ctx.fillStyle = C.coverLo
    ctx.fillRect(fx, fy + fh - b, fw, b)
    ctx.fillRect(fx + fw - b, fy, b, fh)
  }
  function drawNumber(x, y, s, n, p) {
    ctx.save()
    ctx.globalAlpha = p
    ctx.fillStyle = C.num[n]
    ctx.shadowColor = C.num[n]
    ctx.shadowBlur = s * 0.12
    ctx.font = `700 ${Math.round(s * 0.56)}px 'JetBrains Mono', ui-monospace, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(n), x + s / 2, y + s / 2 + 1)
    ctx.restore()
  }
  function drawFlag(x, y, s, p) {
    const cx = x + s / 2
    const cy = y + s / 2
    const k = easeOutBack(p)
    const px = x + s * 0.44
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(k, k)
    ctx.translate(-cx, -cy)
    ctx.strokeStyle = C.pole
    ctx.lineWidth = Math.max(1, s * 0.06)
    ctx.beginPath()
    ctx.moveTo(px, y + s * 0.26)
    ctx.lineTo(px, y + s * 0.72)
    ctx.moveTo(x + s * 0.3, y + s * 0.72)
    ctx.lineTo(x + s * 0.68, y + s * 0.72)
    ctx.stroke()
    ctx.fillStyle = C.flag
    ctx.shadowColor = C.flag
    ctx.shadowBlur = s * 0.12
    ctx.beginPath()
    ctx.moveTo(px, y + s * 0.28)
    ctx.lineTo(px - s * 0.22, y + s * 0.38)
    ctx.lineTo(px, y + s * 0.48)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  function drawMine(x, y, s, p, boom) {
    const cx = x + s / 2
    const cy = y + s / 2
    const rad = s * 0.24 * easeOutBack(p)
    ctx.save()
    ctx.fillStyle = C.mine
    ctx.strokeStyle = C.mine
    ctx.lineWidth = Math.max(1, s * 0.06)
    ctx.shadowColor = boom ? C.flag : C.mine
    ctx.shadowBlur = s * 0.14
    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(ang) * rad * 1.5, cy + Math.sin(ang) * rad * 1.5)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(cx, cy, rad, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.globalAlpha = 0.5 * p
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(cx - rad * 0.3, cy - rad * 0.3, rad * 0.28, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  function drawCell(i) {
    const c = i % B.cols
    const r = (i / B.cols) | 0
    const x = c * CELL
    const y = r * CELL
    const s = CELL
    ctx.fillStyle = C.frame
    ctx.fillRect(x, y, s, s)
    const fx = x + 1
    const fy = y + 1
    const fw = s - 2
    const fh = s - 2
    const revealed = B.st[i] === 1
    const flagged = B.st[i] === 2
    const exposedMine = B.showMines && B.mine[i] && !flagged

    if (revealed || exposedMine) {
      const boom = i === B.boom
      ctx.fillStyle = boom ? C.boom : C.face
      ctx.fillRect(fx, fy, fw, fh)
      ctx.fillStyle = C.faceEdge
      ctx.fillRect(fx, fy, fw, 1)
      ctx.fillRect(fx, fy, 1, fh)
      if (exposedMine || (revealed && B.mine[i])) {
        drawMine(x, y, s, animP(i), boom)
      } else if (revealed && B.adj[i] > 0) {
        const p = animP(i)
        drawNumber(x, y, s, B.adj[i], p)
        if (!B.showMines && p < 1) {
          ctx.globalAlpha = 1 - p
          drawButton(fx, fy, fw, fh)
          ctx.globalAlpha = 1
        }
      } else if (revealed && !B.showMines) {
        // empty cell — dissolve the cover away
        const p = animP(i)
        if (p < 1) {
          ctx.globalAlpha = 1 - p
          drawButton(fx, fy, fw, fh)
          ctx.globalAlpha = 1
        }
      }
    } else {
      drawButton(fx, fy, fw, fh)
      if (flagged) drawFlag(x, y, s, animP(i))
      else if (i === B.hover) {
        ctx.fillStyle = C.hover
        ctx.fillRect(fx, fy, fw, fh)
      }
    }
  }
  function paintAll() {
    ctx.fillStyle = C.frame
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < B.total; i++) drawCell(i)
  }
  // after a move: animated mode repaints via the frame loop's `live` set; the
  // static (reduced-motion) mode has no loop, so repaint everything here.
  function commit(full) {
    if (full || reduceMotion) paintAll()
  }

  // --- game mechanics ---
  function reveal(start) {
    if (B.st[start] !== 0) return
    const stack = [start]
    let order = 0
    while (stack.length) {
      const j = stack.pop()
      if (B.st[j] !== 0) continue
      B.st[j] = 1
      B.revealed++
      startAnim(j, REVEAL_MS, Math.min(order * 6, 160))
      order++
      if (B.adj[j] === 0) neighbors(j, (n) => { if (B.st[n] === 0) stack.push(n) })
    }
  }
  function flag(i, delay) {
    if (B.st[i] !== 0) return
    B.st[i] = 2
    B.flagged++
    startAnim(i, FLAG_MS, delay || 0)
  }
  function lose(i) {
    B.st[i] = 1
    B.revealed++
    B.boom = i
    B.showMines = true
    B.phase = 'over'
    let order = 0
    for (let k = 0; k < B.total; k++) {
      if (B.mine[k] && B.st[k] !== 2 && k !== i) startAnim(k, MINE_MS, Math.min(order++ * 10, 700))
    }
    startAnim(i, MINE_MS, 0)
  }
  function win() {
    B.phase = 'over'
    let order = 0
    for (let k = 0; k < B.total; k++) {
      if (B.mine[k] && B.st[k] !== 2) flag(k, Math.min(order++ * 12, 600))
    }
  }
  function chord(i) {
    if (B.adj[i] === 0) return
    let f = 0
    const cov = []
    neighbors(i, (n) => { if (B.st[n] === 2) f++; else if (B.st[n] === 0) cov.push(n) })
    if (f !== B.adj[i] || cov.length === 0) return
    for (const n of cov) if (B.mine[n]) { lose(n); return }
    for (const n of cov) reveal(n)
  }

  // --- attract-mode auto solver ---
  function guess() {
    let best = -1
    let bestRisk = Infinity
    let coveredTotal = 0
    for (let i = 0; i < B.total; i++) if (B.st[i] === 0) coveredTotal++
    const baseRisk = coveredTotal ? (B.mineCnt - B.flagged) / coveredTotal : 1
    for (let i = 0; i < B.total; i++) {
      if (B.st[i] !== 0) continue
      let risk = -1
      neighbors(i, (n) => {
        if (B.st[n] !== 1 || B.adj[n] === 0) return
        let f = 0
        let cov = 0
        neighbors(n, (m) => { if (B.st[m] === 2) f++; else if (B.st[m] === 0) cov++ })
        if (cov > 0) {
          const p = (B.adj[n] - f) / cov
          if (p > risk) risk = p
        }
      })
      if (risk < 0) risk = baseRisk - 0.05 // prefer interior unknowns
      risk += B.rng() * 0.015 // jitter so boards diverge
      if (risk < bestRisk) {
        bestRisk = risk
        best = i
      }
    }
    if (best < 0) return
    if (B.mine[best]) lose(best)
    else reveal(best)
  }
  function solverStep() {
    const toReveal = new Set()
    const toFlag = new Set()
    for (let i = 0; i < B.total; i++) {
      if (B.st[i] !== 1 || B.adj[i] === 0) continue
      let f = 0
      const cov = []
      neighbors(i, (n) => { if (B.st[n] === 2) f++; else if (B.st[n] === 0) cov.push(n) })
      if (cov.length === 0) continue
      if (B.adj[i] === f) cov.forEach((n) => toReveal.add(n))
      else if (B.adj[i] === f + cov.length) cov.forEach((n) => toFlag.add(n))
    }
    if (toFlag.size || toReveal.size) {
      toFlag.forEach((i) => flag(i, 0))
      toReveal.forEach((i) => reveal(i))
      return
    }
    guess()
  }
  function playToEnd() {
    let guard = 0
    while (B.phase === 'play' && guard++ < 6000) {
      solverStep()
      if (B.phase !== 'play') break
      if (B.revealed === B.total - B.mineCnt) { win(); break }
    }
  }

  // --- board setup ---
  function pickStart() {
    const cx = (B.cols / 2) | 0
    const cy = (B.rows / 2) | 0
    const c = Math.max(1, Math.min(B.cols - 2, cx + ((B.rng() * 7) | 0) - 3))
    const r = Math.max(1, Math.min(B.rows - 2, cy + ((B.rng() * 7) | 0) - 3))
    return idx(r, c)
  }
  function generate(start) {
    const forbid = new Set([start])
    neighbors(start, (n) => forbid.add(n))
    const pool = []
    for (let i = 0; i < B.total; i++) if (!forbid.has(i)) pool.push(i)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (B.rng() * (i + 1)) | 0
      const t = pool[i]
      pool[i] = pool[j]
      pool[j] = t
    }
    B.mineCnt = Math.min(pool.length, Math.round(B.total * MINE_DENSITY))
    for (let k = 0; k < B.mineCnt; k++) B.mine[pool[k]] = 1
    for (let i = 0; i < B.total; i++) {
      if (B.mine[i]) { B.adj[i] = 0; continue }
      let a = 0
      neighbors(i, (n) => { if (B.mine[n]) a++ })
      B.adj[i] = a
    }
  }
  // deal a fresh board whose `start` cell is guaranteed safe and opens a region
  function startGame(start, m) {
    mode = m
    B.mine.fill(0)
    B.adj.fill(0)
    B.st.fill(0)
    B.animT.fill(0)
    B.animEnd.fill(0)
    B.live.clear()
    B.revealed = 0
    B.flagged = 0
    B.boom = -1
    B.showMines = false
    B.phase = 'play'
    B.lastThink = NOW
    generate(start)
    reveal(start)
  }

  // --- interaction (the exposed margins around the terminal are playable) ---
  function cellAt(e) {
    const c = Math.floor(e.clientX / CELL)
    const r = Math.floor(e.clientY / CELL)
    if (c < 0 || r < 0 || c >= B.cols || r >= B.rows) return -1
    return idx(r, c)
  }
  function handleReveal(i) {
    if (i < 0 || game !== 'mines') return
    // a click while the solver is playing (or on a finished board) deals a new
    // game that opens right where you clicked
    if (mode === 'auto' || B.phase === 'over') {
      B.seed = (B.seed + 1) | 0
      B.rng = mulberry32(B.seed)
      startGame(i, 'user')
      paintAll()
      return
    }
    if (B.st[i] === 2) return // flagged — protected
    if (B.st[i] === 0) {
      if (B.mine[i]) lose(i)
      else reveal(i)
    } else if (B.st[i] === 1) chord(i)
    if (B.phase === 'play' && B.revealed === B.total - B.mineCnt) win()
    commit(false)
  }
  function handleFlag(i) {
    if (i < 0 || game !== 'mines' || mode !== 'user' || B.phase !== 'play') return
    if (B.st[i] === 0) { B.st[i] = 2; B.flagged++; startAnim(i, FLAG_MS, 0) }
    else if (B.st[i] === 2) { B.st[i] = 0; B.flagged--; startAnim(i, FLAG_MS, 0) }
    else return
    commit(false)
  }

  function allocate() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = window.innerWidth
    const H = window.innerHeight
    VW = W
    VH = H
    CELL = W < 600 ? 20 : 26
    B.cols = Math.ceil(W / CELL)
    B.rows = Math.ceil(H / CELL)
    B.total = B.cols * B.rows
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    B.mine = new Uint8Array(B.total)
    B.adj = new Uint8Array(B.total)
    B.st = new Uint8Array(B.total)
    B.animT = new Float64Array(B.total)
    B.animEnd = new Float64Array(B.total)
    B.live.clear()
    B.hover = -1
  }
  function build() {
    NOW = performance.now()
    B.instant = reduceMotion
    allocate()
    B.seed = 0x9e37
    B.rng = mulberry32(B.seed)
    startGame(pickStart(), 'auto') // attract game — solver plays it, once
    if (reduceMotion) playToEnd()
    paintAll()
  }

  state = { container, canvas }
  controller = { startFlyer: startFlyerInternal }
  build()

  window.addEventListener('resize', () => {
    if (resizeQueued) return
    resizeQueued = true
    requestAnimationFrame(() => {
      resizeQueued = false
      NOW = performance.now()
      B.instant = reduceMotion
      allocate()
      if (game === 'flyer') {
        if (flyer) flyer.resize()
      } else {
        startGame(pickStart(), 'auto')
        if (reduceMotion) playToEnd()
        paintAll()
      }
    })
  })

  // pointer wiring — listeners live on the canvas, so events only fire on the
  // exposed board (the terminal window on top swallows clicks over the middle)
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    handleFlag(cellAt(e))
  })
  let suppressClick = false
  canvas.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; return }
    handleReveal(cellAt(e))
  })
  canvas.addEventListener('pointermove', (e) => {
    if (game !== 'mines') return
    if (lpTimer) cancelLongPress()
    const ni = cellAt(e)
    canvas.style.cursor = ni >= 0 ? 'pointer' : 'default'
    if (ni === B.hover) return
    const old = B.hover
    B.hover = ni
    if (old >= 0) drawCell(old)
    if (ni >= 0) drawCell(ni)
  })
  canvas.addEventListener('pointerleave', () => {
    const old = B.hover
    B.hover = -1
    if (old >= 0) drawCell(old)
  })
  // touch: tap reveals, hold flags
  let lpTimer = null
  function cancelLongPress() {
    if (lpTimer) { clearTimeout(lpTimer); lpTimer = null }
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return
    const i = cellAt(e)
    lpTimer = setTimeout(() => {
      lpTimer = null
      suppressClick = true
      handleFlag(i)
    }, LONGPRESS_MS)
  })
  canvas.addEventListener('pointerup', cancelLongPress)
  canvas.addEventListener('pointercancel', cancelLongPress)

  // Minesweeper is static under reduced motion (no loop); the flyer starts its
  // own loop on demand. Otherwise run the attract/animation loop now.
  if (!reduceMotion) ensureLoop()

  function ensureLoop() {
    if (looping) return
    looping = true
    state.raf = requestAnimationFrame(frame)
  }
  function startFlyerInternal(onExit) {
    flyerExitCb = onExit || null
    game = 'flyer'
    B.hover = -1
    if (!flyer) flyer = createFlyer({ ctx, view: () => ({ w: VW, h: VH }), onExit: exitFlyer })
    flyer.resize()
    flyer.start(NOW || performance.now())
    ensureLoop()
    return true
  }
  function exitFlyer() {
    if (game !== 'flyer') return
    if (flyer) flyer.stop()
    game = 'mines'
    NOW = performance.now()
    startGame(pickStart(), 'auto')
    if (reduceMotion) playToEnd()
    paintAll()
    if (reduceMotion) looping = false // let the loop wind down; board is static again
    const cb = flyerExitCb
    flyerExitCb = null
    if (cb) cb()
  }
  function frame(t) {
    if (!looping) return
    state.raf = requestAnimationFrame(frame)
    if (document.hidden || !enabled) return
    NOW = t
    if (game === 'flyer') {
      if (flyer) flyer.frame(t)
      return
    }
    if (mode === 'auto' && B.phase === 'play' && t - B.lastThink >= STEP_MS) {
      B.lastThink = t
      solverStep()
      if (B.phase === 'play' && B.revealed === B.total - B.mineCnt) win()
    }
    if (B.live.size) {
      for (const i of B.live) drawCell(i)
      for (const i of B.live) if (t >= B.animEnd[i]) B.live.delete(i)
    }
  }
}

// `crt off` hides the background; `crt on` brings it back.
export function setBackgroundEnabled(on) {
  enabled = on
  const container = document.getElementById('bg')
  if (container) container.style.display = on ? '' : 'none'
}
