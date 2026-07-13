// Full-viewport Three.js background: a mountain range as a network of nodes —
// a point cloud joined by thin wireframe edges, shaped after Karl's painted
// 14er artwork (one dominant summit with long descending ridgelines, layered
// secondary ridges) but digitized, in phosphor greens with pale "snow" nodes
// on the high ground. The range is still: only star drift, a faint camera bob,
// and mouse parallax move. Purely decorative: skipped without WebGL, rendered
// once under prefers-reduced-motion, hidden by `crt off`.

let state = null
let enabled = true

// deterministic hash-based value noise (no RNG — same range every visit)
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
// ridged noise → sharp crest lines instead of rolling hills
function ridged(x, y) {
  const r = (v) => 1 - Math.abs(2 * v - 1)
  return r(noise(x, y)) * 0.55 + r(noise(x * 2.1, y * 2.1)) * 0.3 + r(noise(x * 4.3, y * 4.3)) * 0.15
}
function gauss(dx, dz, sx, sz) {
  return Math.exp(-((dx * dx) / (2 * sx * sx) + (dz * dz) / (2 * sz * sz)))
}

// heightfield shaped after the painting: main summit left-of-center with a
// ridge running right, flanking ridges, foreground shoulder — all roughened
// by ridged noise so the crests read as craggy lines of nodes
function heightAt(wx, wz) {
  const crag = ridged(wx * 0.012, wz * 0.012)
  let peaks = 0
  peaks = Math.max(peaks, 150 * gauss(wx + 70, wz + 195, 90, 55)) // main summit
  peaks = Math.max(peaks, 88 * gauss(wx - 115, wz + 175, 90, 55)) // right ridge
  peaks = Math.max(peaks, 62 * gauss(wx + 225, wz + 140, 80, 50)) // far left arm
  peaks = Math.max(peaks, 40 * gauss(wx - 175, wz + 70, 70, 42)) // foreground right
  peaks = Math.max(peaks, 28 * gauss(wx + 150, wz + 45, 60, 40)) // foreground left
  let h = peaks * (0.6 + 0.4 * crag) + crag * 16
  // soften the strip straight behind/below the terminal window
  if (Math.abs(wx) < 46 && wz > -110) h *= 0.35 + 0.65 * Math.min(1, (-wz) / 110)
  return h
}

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
  scene.fog = new THREE.Fog(0x040604, 190, 540)

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 600)
  camera.position.set(0, 26, 66)
  camera.lookAt(0, 16, -80)

  // --- the node-network range ---
  const MESH_Z = -130
  const geometry = new THREE.PlaneGeometry(640, 360, 128, 84)
  const pos = geometry.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const dim = { r: 0x14 / 255, g: 0x3f / 255, b: 0x1a / 255 }
  const bright = { r: 0x49 / 255, g: 0xd9 / 255, b: 0x51 / 255 }
  const snow = { r: 0xc9 / 255, g: 0xff / 255, b: 0xd2 / 255 }
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i)
    const wz = MESH_Z - pos.getY(i)
    const h = heightAt(wx, wz)
    pos.setZ(i, h)
    let t = Math.min(1, h / 130)
    let c = {
      r: dim.r + (bright.r - dim.r) * t,
      g: dim.g + (bright.g - dim.g) * t,
      b: dim.b + (bright.b - dim.b) * t,
    }
    if (h > 88) {
      // pale "snowfield" nodes near the crests, like the painting's patches
      const s = Math.min(1, (h - 88) / 32) * (0.35 + 0.65 * hash(wx, wz))
      c = {
        r: c.r + (snow.r - c.r) * s,
        g: c.g + (snow.g - c.g) * s,
        b: c.b + (snow.b - c.b) * s,
      }
    }
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const range = new THREE.Group()
  range.rotation.x = -Math.PI / 2
  range.position.set(0, -6, MESH_Z)

  // nodes
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ size: 1.5, vertexColors: true, sizeAttenuation: true })
  )
  range.add(points)

  // edges of the network — the triangulated wireframe between nodes
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x2a7d31, transparent: true, opacity: 0.3 })
  )
  range.add(wire)
  scene.add(range)

  // --- slow drifting stars above the horizon ---
  const starGeo = new THREE.BufferGeometry()
  const starPos = new Float32Array(300 * 3)
  for (let i = 0; i < 300; i++) {
    starPos[i * 3] = (hash(i, 1) - 0.5) * 460
    starPos[i * 3 + 1] = 30 + hash(i, 2) * 150
    starPos[i * 3 + 2] = -120 - hash(i, 3) * 260
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
    // gentle drift only — the range itself is still
    camera.position.x += (mouseX * 3 - camera.position.x) * 0.02
    camera.position.y += (26 + Math.sin(t * 0.25) * 0.8 - mouseY * 1.5 - camera.position.y) * 0.02
    camera.lookAt(0, 16, -80)
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
