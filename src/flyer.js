// Konami-code bonus mode. Enter ↑↓↑↓←→←→ B A ⏎ and the background stops being
// Minesweeper and becomes a low-altitude synthwave flyer: you skim just above a
// neon ground plane that rushes beneath you toward a gridded horizon (with a
// retro sun), weaving your hovercraft around solid obstacles that rise up out of
// the ground. Steer with the arrow keys (← → strafe, ↑ ↓ push forward / pull back
// toward the camera) or WASD. It speeds up the longer you last. Crash and it's
// game over (ENTER to fly again); ESC drops back to Minesweeper. Everything —
// obstacles and the ship — lives in a shared 3D world and is drawn through one
// perspective projection onto the same 2D canvas the background already owns.
// No WebGL, no second context.

const PAL = ['#21f3ff', '#ff2e88', '#b14dff', '#ffe14d', '#4dff9e']
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const MONO = "'JetBrains Mono', ui-monospace, monospace"

export function createFlyer({ ctx, view, onExit }) {
  const FOCAL = 380
  const CAMY = 66 // eye height above the ground plane (world units) — raised for a higher, looking-down view
  const ZNEAR = 14 // near plane for the ground grid
  const ZGONE = 48 // obstacles vanish here — before they get close enough that a
                   // vertex crosses the near plane and the projection streaks/flips
  const ZFAR = 1300 // spawn depth (near the horizon)
  const HOVER = 7 // the ship's fixed altitude — it skims just above the ground plane
  const ZFRONT = 52 // closest the ship can pull back toward the camera
  const ZBACK = 240 // farthest ahead the ship can push
  const DEPTHSPD = 130 // how fast ↑/↓ move the ship through depth
  const GHOVER = 4 // obstacles hover this far off the ground
  const SHIP_HALFW = 9 // smaller ship
  const ACCEL = 8.5 // lateral ease-in/out rate — the ship glides to a stop / start

  const keys = new Set()
  let W = 0, H = 0, cx = 0, horizon = 0, shipSpd = 120
  let objs = []
  let stars = []
  let ship, roll, speed, spawnT, elapsed, score, dead, gridPhase
  let lastT = 0, frameNow = 0, running = false

  // perspective: X lateral · Y height above ground · Z depth ahead of camera
  function project(X, Y, Z) {
    const s = FOCAL / Z
    return { x: cx + X * s, y: horizon + (CAMY - Y) * s, s }
  }

  function resize() {
    const v = view()
    W = v.w; H = v.h; cx = W / 2
    horizon = H * 0.42
    shipSpd = 175 // max horizontal speed (world units/s)
  }
  function seedStar(s) {
    s.x = Math.random() * W
    s.y = Math.random() * horizon * 0.96
    s.tw = 0.4 + Math.random() * 0.6
  }
  function spawnObj() {
    const w = 11 + Math.random() * 13
    objs.push({
      X: (Math.random() * 2 - 1) * 168,
      Z: ZFAR,
      w,
      h: 12 + Math.random() * 38,
      yaw: Math.random() * 6,
      spin: (Math.random() * 2 - 1) * 1.1,
      pyramid: Math.random() < 0.4,
      color: PAL[(Math.random() * PAL.length) | 0],
    })
  }
  function reset(now) {
    objs = []
    stars = []
    for (let i = 0; i < 70; i++) { const s = {}; seedStar(s); stars.push(s) }
    ship = { x: 0, y: HOVER, z: 120, vx: 0 } // X lateral · Y fixed at HOVER · Z depth · vx = eased lateral velocity
    roll = 0
    speed = 150
    spawnT = 0.7
    elapsed = 0
    score = 0
    dead = false
    gridPhase = 0
    lastT = now
  }

  function update(dt) {
    elapsed += dt
    speed = Math.min(820, speed + 7 * dt) // slowly gets faster and faster
    score += speed * dt * 0.1

    let dx = 0
    if (keys.has('l')) dx -= 1
    if (keys.has('r')) dx += 1
    // ease lateral velocity toward its target so it glides to a stop / start
    ship.vx += (dx * shipSpd - ship.vx) * Math.min(1, dt * ACCEL)
    ship.x = clamp(ship.x + ship.vx * dt, -182, 182)
    // ↑ pushes ahead (deeper), ↓ pulls back all the way toward the camera
    let dz = 0
    if (keys.has('u')) dz += 1
    if (keys.has('d')) dz -= 1
    ship.z = clamp(ship.z + dz * DEPTHSPD * dt, ZFRONT, ZBACK)
    roll += (clamp(ship.vx / shipSpd, -1, 1) * 0.5 - roll) * Math.min(1, dt * 9) // bank into turns

    spawnT -= dt
    if (spawnT <= 0) {
      spawnObj()
      spawnT = Math.max(0.32, 0.9 - elapsed * 0.011)
      if (elapsed > 15 && Math.random() < 0.32) spawnObj()
    }

    gridPhase += speed * dt
    for (const o of objs) { o.Z -= speed * dt; o.yaw += o.spin * dt }

    for (const o of objs) {
      if (o.Z <= ZGONE) { o.gone = true; score += 4; continue }
      // no climbing over anything now — an obstacle sharing the ship's depth and
      // lateral lane is always a hit
      if (Math.abs(o.Z - ship.z) < 34 && Math.abs(o.X - ship.x) < o.w + SHIP_HALFW) {
        dead = true
        break
      }
    }
    objs = objs.filter((o) => !o.gone && o.Z > ZGONE)
  }

  // --- drawing ---
  function drawSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, horizon)
    sky.addColorStop(0, '#0a0320')
    sky.addColorStop(1, '#37103a')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, horizon)
    ctx.fillStyle = '#06020f'
    ctx.fillRect(0, horizon, W, H - horizon)
    // stars
    for (const s of stars) {
      ctx.globalAlpha = s.tw * 0.9
      ctx.fillStyle = '#dcefff'
      ctx.fillRect(s.x, s.y, 1.4, 1.4)
    }
    ctx.globalAlpha = 1
    // retro sun sitting on the horizon
    const R = H * 0.17
    ctx.save()
    ctx.beginPath(); ctx.rect(0, 0, W, horizon); ctx.clip()
    const g = ctx.createLinearGradient(0, horizon - R, 0, horizon + R)
    g.addColorStop(0, '#ffe14d')
    g.addColorStop(0.5, '#ff5fa2')
    g.addColorStop(1, '#b14dff')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(cx, horizon, R, Math.PI, 2 * Math.PI); ctx.fill()
    // scanline gaps across the sun's lower band
    ctx.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < 7; i++) {
      const yy = horizon - R * 0.42 + i * (R * 0.13)
      ctx.fillRect(cx - R, yy, R * 2, Math.max(1.5, R * 0.04 + i))
    }
    ctx.restore()
  }
  function drawGround() {
    const XMAX = 260, GX = 26, range = ZFAR - ZNEAR
    ctx.lineWidth = 1
    // depth lines sweeping toward the viewer
    for (let i = 0; i < 26; i++) {
      const z = ZNEAR + ((((i / 26) * range - gridPhase) % range) + range) % range
      const a = project(-XMAX, 0, z), b = project(XMAX, 0, z)
      ctx.globalAlpha = clamp(1 - z / ZFAR, 0, 1) * 0.6
      ctx.strokeStyle = '#18c6e0'
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    }
    // rails converging to the vanishing point
    ctx.globalAlpha = 0.32
    ctx.strokeStyle = '#c23a86'
    for (let k = -10; k <= 10; k++) {
      const a = project(k * GX, 0, ZNEAR), b = project(k * GX, 0, ZFAR)
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  function drawShadow(X, Z, rw, mul = 1) {
    const p = project(X, 0, Z)
    const s = FOCAL / Z
    ctx.globalAlpha = clamp(1 - Z / ZFAR, 0, 1) * 0.45 * mul
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.ellipse(p.x, p.y, Math.max(2, rw * s), Math.max(1.4, rw * s * 0.34), 0, 0, 7)
    ctx.fill()
    ctx.globalAlpha = 1
  }
  function objVerts(o) {
    const cs = Math.cos(o.yaw), sn = Math.sin(o.yaw)
    const base = [[-o.w, -o.w], [o.w, -o.w], [o.w, o.w], [-o.w, o.w]]
    const bottom = base.map(([lx, lz]) => project(o.X + lx * cs - lz * sn, GHOVER, o.Z + lx * sn + lz * cs))
    if (o.pyramid) return { bottom, apex: project(o.X, GHOVER + o.h, o.Z) }
    const top = base.map(([lx, lz]) => project(o.X + lx * cs - lz * sn, GHOVER + o.h, o.Z + lx * sn + lz * cs))
    return { bottom, top }
  }
  // a projected vertex carries s = FOCAL / Z, so its world depth is FOCAL / s
  const faceDepth = (f) => {
    let z = 0
    for (const p of f) z += FOCAL / p.s
    return z / f.length
  }
  // dark opaque tint of a neon hex — solid enough that nothing shows through
  function shade(hex) {
    const n = parseInt(hex.slice(1), 16)
    const k = 0.22
    return `rgb(${(((n >> 16) & 255) * k) | 0},${(((n >> 8) & 255) * k) | 0},${((n & 255) * k) | 0})`
  }
  // obstacles fade out over the last stretch before ZGONE so they dissolve rather
  // than pop as they vanish near the camera
  const nearFade = (Z) => clamp((Z - ZGONE) / 26, 0, 1)
  function drawObj(o) {
    const a = Math.min(1, (ZFAR - o.Z) / (ZFAR * 0.55)) * nearFade(o.Z)
    if (a <= 0) return
    const v = objVerts(o)
    const b = v.bottom
    // solid faces so obstacles aren't see-through: fill each face opaque and draw
    // them far-to-near, so nearer faces cover the far edges (painter's algorithm)
    const faces = o.pyramid
      ? [b, [b[0], b[1], v.apex], [b[1], b[2], v.apex], [b[2], b[3], v.apex], [b[3], b[0], v.apex]]
      : [
          b,
          v.top,
          [b[0], b[1], v.top[1], v.top[0]],
          [b[1], b[2], v.top[2], v.top[1]],
          [b[2], b[3], v.top[3], v.top[2]],
          [b[3], b[0], v.top[0], v.top[3]],
        ]
    faces.sort((f1, f2) => faceDepth(f2) - faceDepth(f1))
    ctx.save()
    ctx.globalAlpha = a
    ctx.lineJoin = 'round'
    ctx.strokeStyle = o.color
    ctx.shadowColor = o.color
    ctx.lineWidth = clamp((FOCAL / o.Z) * 1.6, 1, 4)
    const fill = shade(o.color)
    for (const f of faces) {
      ctx.beginPath()
      ctx.moveTo(f[0].x, f[0].y)
      for (let i = 1; i < f.length; i++) ctx.lineTo(f[i].x, f[i].y)
      ctx.closePath()
      ctx.shadowBlur = 0
      ctx.fillStyle = fill
      ctx.fill()
      ctx.shadowBlur = 10
      ctx.stroke()
    }
    ctx.restore()
  }
  function drawShip() {
    // local model — nose toward the camera (−z), wings back (+z), small fin up
    const V = [
      { x: 0, y: 1.4, z: 11 }, // nose — points toward the horizon (flying into the screen)
      { x: -9, y: 0, z: -7 }, // left wing (aft, nearest the camera)
      { x: 9, y: 0, z: -7 }, // right wing
      { x: 0, y: 0.7, z: -4 }, // tail
      { x: 0, y: 6.5, z: -4 }, // fin
    ]
    const cr = Math.cos(roll), sr = Math.sin(roll)
    const p = V.map((vt) => {
      const rx = vt.x * cr - vt.y * sr
      const ry = vt.x * sr + vt.y * cr
      return project(ship.x + rx, ship.y + ry, ship.z + vt.z)
    })
    drawShadow(ship.x, ship.z, 9)
    ctx.save()
    ctx.shadowColor = '#21f3ff'
    ctx.shadowBlur = 16
    ctx.fillStyle = 'rgba(33,243,255,0.16)'
    ctx.beginPath()
    ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[1].x, p[1].y); ctx.lineTo(p[3].x, p[3].y)
    ctx.lineTo(p[2].x, p[2].y); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = '#d6ffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[1].x, p[1].y)
    ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[2].x, p[2].y)
    ctx.moveTo(p[1].x, p[1].y); ctx.lineTo(p[3].x, p[3].y)
    ctx.moveTo(p[2].x, p[2].y); ctx.lineTo(p[3].x, p[3].y)
    ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[3].x, p[3].y)
    ctx.moveTo(p[3].x, p[3].y); ctx.lineTo(p[4].x, p[4].y)
    ctx.stroke()
    // engine glow at the tail
    ctx.fillStyle = '#ff2e88'
    ctx.shadowColor = '#ff2e88'
    ctx.beginPath(); ctx.arc(p[3].x, p[3].y, 2.3, 0, 7); ctx.fill()
    ctx.restore()
  }
  function drawHud() {
    ctx.save()
    ctx.textBaseline = 'top'
    ctx.shadowBlur = 8
    ctx.font = `700 16px ${MONO}`
    ctx.textAlign = 'left'
    ctx.fillStyle = '#4dff9e'; ctx.shadowColor = '#4dff9e'
    ctx.fillText('SCORE ' + String(Math.floor(score)).padStart(5, '0'), 18, 16)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#21f3ff'; ctx.shadowColor = '#21f3ff'
    ctx.fillText('SPD ' + Math.floor(speed), W - 18, 16)
    ctx.textAlign = 'center'
    ctx.shadowBlur = 0
    ctx.globalAlpha = 0.7
    ctx.font = `700 11px ${MONO}`
    ctx.fillStyle = '#9fe8ff'
    ctx.fillText('← → STRAFE   ↑ ↓ DEPTH   ·   ESC  EXIT', cx, 20)
    ctx.restore()
  }
  function drawOver() {
    ctx.save()
    ctx.fillStyle = 'rgba(5,1,14,0.55)'
    ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowBlur = 18
    ctx.fillStyle = '#ff2e88'; ctx.shadowColor = '#ff2e88'
    ctx.font = `700 46px ${MONO}`
    ctx.fillText('GAME OVER', cx, horizon - 26)
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#21f3ff'
    ctx.font = `700 20px ${MONO}`
    ctx.fillText('SCORE ' + Math.floor(score), cx, horizon + 16)
    ctx.shadowBlur = 0
    ctx.fillStyle = '#9fe8ff'
    ctx.font = `700 13px ${MONO}`
    ctx.fillText('ENTER / ▲  —  FLY AGAIN        ESC  —  EXIT', cx, horizon + 50)
    ctx.restore()
  }
  function draw() {
    drawSky()
    drawGround()
    objs.sort((a, b) => b.Z - a.Z)
    for (const o of objs) drawShadow(o.X, o.Z, o.w * 1.1, nearFade(o.Z))
    let shipDrawn = false
    for (const o of objs) {
      if (!shipDrawn && o.Z < ship.z) { drawShip(); shipDrawn = true }
      drawObj(o)
    }
    if (!shipDrawn) drawShip()
    drawHud()
    if (dead) drawOver()
  }

  // --- input ---
  const DIR = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd', a: 'l', d: 'r', w: 'u', s: 'd' }
  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); onExit(); return }
    if (dead) {
      if (e.key === 'Enter' || e.key === ' ' || e.key.startsWith('Arrow')) { e.preventDefault(); reset(frameNow || performance.now()) }
      return
    }
    const m = DIR[e.key] || DIR[e.key.toLowerCase()]
    if (m) { e.preventDefault(); keys.add(m) }
  }
  function onKeyUp(e) {
    const m = DIR[e.key] || DIR[e.key.toLowerCase()]
    if (m) keys.delete(m)
  }

  return {
    resize,
    start(now) {
      resize()
      reset(now)
      running = true
      window.addEventListener('keydown', onKeyDown, true)
      window.addEventListener('keyup', onKeyUp, true)
    },
    stop() {
      running = false
      keys.clear()
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    },
    frame(now) {
      if (!running) return
      frameNow = now
      let dt = (now - lastT) / 1000
      lastT = now
      if (dt > 0.05) dt = 0.05
      if (dt < 0) dt = 0
      if (!dead) update(dt)
      draw()
    },
  }
}
