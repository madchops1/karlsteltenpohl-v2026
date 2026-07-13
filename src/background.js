// Full-viewport Three.js background: an endless wireframe terrain rolling
// toward the camera, phosphor-green with depth fade — behind the terminal
// window. Purely decorative: skipped without WebGL, frozen to a single frame
// under prefers-reduced-motion, hidden entirely by `crt off`.

let state = null // { renderer, scene, camera, material, raf, container }
let enabled = true

const VERTEX = /* glsl */ `
  uniform float uTime;
  varying float vGlow;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  varying float vDepth;

  float ridge(vec2 p) {
    return 1.0 - abs(2.0 * noise(p) - 1.0);
  }

  void main() {
    vec3 pos = position;
    // ridged fractal — sharp geometric peaks, scrolling slowly toward camera
    vec2 p = vec2(pos.x * 0.035, (pos.y + uTime * 9.0) * 0.035);
    float h = ridge(p) * 0.60 + ridge(p * 2.1) * 0.27 + ridge(p * 4.3) * 0.13;
    h = pow(h, 2.4);
    // keep a flat valley down the middle so the horizon stays open
    float valley = smoothstep(8.0, 60.0, abs(pos.x));
    pos.z = h * 58.0 * (0.05 + 0.95 * valley);
    vGlow = h;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uBg;
  varying float vGlow;
  varying float vDepth;
  void main() {
    vec3 c = uColor * (0.35 + vGlow * 0.9);
    // fade into the background with distance so the horizon dissolves
    c = mix(c, uBg, smoothstep(70.0, 230.0, vDepth));
    gl_FragColor = vec4(c, 1.0);
  }
`

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

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400)
  camera.position.set(0, 15, 46)
  camera.lookAt(0, 4, -60)

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x2fae2f) },
      uBg: { value: new THREE.Color(0x040604) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    wireframe: true,
  })
  // coarser mesh = bigger facets, more low-poly-mountain
  const geometry = new THREE.PlaneGeometry(320, 300, 80, 64)
  const terrain = new THREE.Mesh(geometry, material)
  terrain.rotation.x = -Math.PI / 2
  terrain.position.set(0, -6, -80)
  scene.add(terrain)

  // slow drifting star points above the horizon
  const starGeo = new THREE.BufferGeometry()
  const starPos = new Float32Array(300 * 3)
  for (let i = 0; i < 300; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 400
    starPos[i * 3 + 1] = 10 + Math.random() * 120
    starPos[i * 3 + 2] = -60 - Math.random() * 240
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0x2a5a2a, size: 1.2, sizeAttenuation: true })
  )
  scene.add(stars)

  state = { renderer, scene, camera, material, raf: 0, container, stars }

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
    material.uniforms.uTime.value = 20
    renderer.render(scene, camera)
    return
  }

  const t0 = performance.now()
  function frame(now) {
    state.raf = requestAnimationFrame(frame)
    if (document.hidden || !enabled) return
    material.uniforms.uTime.value = (now - t0) / 1000
    camera.position.x += (mouseX * 4 - camera.position.x) * 0.02
    camera.position.y += (15 - mouseY * 2 - camera.position.y) * 0.02
    camera.lookAt(0, 4, -60)
    stars.rotation.y = (now - t0) / 90000
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
