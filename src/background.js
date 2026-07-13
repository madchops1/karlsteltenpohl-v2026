// Full-viewport Three.js background: a still voxel diorama — terraced
// blocky mountains (Crossy Road-style) in phosphor greens, flanking an open
// valley behind the terminal window, with water in the lowlands and sparse
// tree blocks on the heights. Almost no motion: just a slow star drift,
// a faint camera bob, and mouse parallax. Purely decorative: skipped without
// WebGL, rendered once under prefers-reduced-motion, hidden by `crt off`.

let state = null
let enabled = true

// deterministic hash-based value noise (no RNG — same diorama every visit)
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function noise(x, y) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

const LEVEL_COLORS = [0x103618, 0x185422, 0x21732b, 0x2a9234, 0x33b13d, 0x3dd046]
const CELL = 10 // voxel footprint in world units
const STEP = 7 // height per terrace level

export async function initBackground() {
  const container = document.getElementById('bg')
  if (!container || state) return
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let THREE
  try {
    THREE = await import('three')
  } catch {
    return
  }

  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' })
  } catch {
    return
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x040604)
  scene.fog = new THREE.Fog(0x040604, 130, 330)

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500)
  camera.position.set(0, 26, 66)
  camera.lookAt(0, 6, -60)

  scene.add(new THREE.AmbientLight(0x9db89d, 0.65))
  const sun = new THREE.DirectionalLight(0xd8ffd8, 1.0)
  sun.position.set(70, 120, 50)
  scene.add(sun)

  // --- terraced voxel terrain, running from deep fog to the camera's feet ---
  const COLS = 40
  const ROWS = 30
  const tiles = []
  for (let gx = 0; gx < COLS; gx++) {
    for (let gz = 0; gz < ROWS; gz++) {
      const x = (gx - COLS / 2 + 0.5) * CELL
      const z = -270 + gz * CELL
      // two octaves of noise → 0..1, pushed higher on the flanks so the
      // middle stays an open valley behind the window
      let h = noise(gx * 0.16, gz * 0.19) * 0.7 + noise(gx * 0.4, gz * 0.45) * 0.3
      const flank = Math.min(1, Math.max(0, (Math.abs(x) - 20) / 70))
      h = h * (0.12 + 1.2 * flank)
      const level = Math.min(LEVEL_COLORS.length - 1, Math.floor(h * LEVEL_COLORS.length))
      tiles.push({ x, z, level })
    }
  }

  const box = new THREE.BoxGeometry(1, 1, 1)
  const terrain = new THREE.InstancedMesh(
    box,
    new THREE.MeshLambertMaterial(),
    tiles.length
  )
  const m = new THREE.Matrix4()
  const color = new THREE.Color()
  tiles.forEach((t, i) => {
    const height = (t.level + 1) * STEP
    m.makeScale(CELL, height, CELL)
    m.setPosition(t.x, height / 2 - 4, t.z)
    terrain.setMatrixAt(i, m)
    terrain.setColorAt(i, color.setHex(LEVEL_COLORS[t.level]))
  })
  scene.add(terrain)

  // --- sparse tree blocks on the mid/high tiles ---
  const treeTiles = tiles.filter(
    (t) => t.level >= 3 && hash(t.x * 0.7, t.z * 1.3) > 0.82
  )
  if (treeTiles.length) {
    const trees = new THREE.InstancedMesh(
      box,
      new THREE.MeshLambertMaterial(),
      treeTiles.length
    )
    treeTiles.forEach((t, i) => {
      const base = (t.level + 1) * STEP - 4
      const s = CELL * 0.42
      m.makeScale(s, s * 1.5, s)
      m.setPosition(t.x, base + (s * 1.5) / 2, t.z)
      trees.setMatrixAt(i, m)
      trees.setColorAt(i, color.setHex(hash(t.z, t.x) > 0.5 ? 0x49d951 : 0x3fc247))
    })
    scene.add(trees)
  }

  // --- still water filling the valley floor ---
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(COLS * CELL, ROWS * CELL + 80),
    new THREE.MeshBasicMaterial({ color: 0x08301f, transparent: true, opacity: 0.9 })
  )
  water.rotation.x = -Math.PI / 2
  water.position.set(0, STEP * 0.8, -270 + (ROWS * CELL + 80) / 2 - 40)
  scene.add(water)

  // --- slow drifting stars above the horizon ---
  const starGeo = new THREE.BufferGeometry()
  const starPos = new Float32Array(300 * 3)
  for (let i = 0; i < 300; i++) {
    starPos[i * 3] = (hash(i, 1) - 0.5) * 420
    starPos[i * 3 + 1] = 20 + hash(i, 2) * 130
    starPos[i * 3 + 2] = -80 - hash(i, 3) * 240
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0x2a5a2a, size: 1.2, sizeAttenuation: true })
  )
  scene.add(stars)

  state = { renderer, container }

  let mouseX = 0
  let mouseY = 0
  window.addEventListener('pointermove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2
  })
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    if (reduceMotion) renderer.render(scene, camera)
  })

  if (reduceMotion) {
    renderer.render(scene, camera)
    return
  }

  const t0 = performance.now()
  function frame(now) {
    state.raf = requestAnimationFrame(frame)
    if (document.hidden || !enabled) return
    const t = (now - t0) / 1000
    // gentle drift only — the diorama itself is still
    camera.position.x += (mouseX * 3 - camera.position.x) * 0.02
    camera.position.y += (26 + Math.sin(t * 0.25) * 0.8 - mouseY * 1.5 - camera.position.y) * 0.02
    camera.lookAt(0, 6, -60)
    stars.rotation.y = t / 220
    renderer.render(scene, camera)
  }
  state.raf = requestAnimationFrame(frame)
}

// `crt off` hides the background; `crt on` brings it back.
export function setBackgroundEnabled(on) {
  enabled = on
  const container = document.getElementById('bg')
  if (container) container.style.display = on ? '' : 'none'
}
