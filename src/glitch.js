// Three.js glitch reveal: when media opens, a WebGL canvas overlays the image
// and plays ~1s of slice displacement / RGB split / scanline noise that settles
// into the clean picture. The <img> underneath is never hidden — if anything
// here fails, the photo is simply visible. Three is loaded on first use.

let THREE = null
let renderer = null
let disposeTimer = null
const queue = []
let running = false

const FRAGMENT = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uTime;
  uniform float uProgress;
  varying vec2 vUv;

  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = vUv;
    float p = uProgress;

    // horizontal slice displacement, re-rolled a few times during the effect
    float band = floor(uv.y * 24.0);
    float roll = floor(uTime * 18.0);
    float n = rand(vec2(band, roll));
    uv.x += (n - 0.5) * 0.5 * p * step(0.55, n);

    // occasional vertical jump of the whole field
    uv.y += (rand(vec2(roll, 7.0)) - 0.5) * 0.08 * p * step(0.8, rand(vec2(roll, 3.0)));
    uv = clamp(uv, 0.0, 1.0);

    // RGB split
    float ca = 0.015 * p;
    float r = texture2D(uTex, uv + vec2(ca, 0.0)).r;
    float g = texture2D(uTex, uv).g;
    float b = texture2D(uTex, uv - vec2(ca, 0.0)).b;
    vec3 c = vec3(r, g, b);

    // block dropout to solid green
    float bx = floor(uv.x * 16.0);
    float by = floor(uv.y * 12.0);
    if (rand(vec2(bx + roll, by)) > 1.0 - 0.12 * p) {
      c = mix(c, vec3(0.2, 1.0, 0.2), 0.85);
    }

    // scanline noise + frame flicker
    c *= 1.0 - 0.18 * p * rand(vec2(uv.y * 400.0, roll));
    c *= 1.0 + 0.25 * p * (rand(vec2(roll, 1.0)) - 0.5);

    gl_FragColor = vec4(c, 1.0);
  }
`

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

export function effectsEnabled() {
  if (document.documentElement.classList.contains('crt-off')) return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  return true
}

// Queue a glitch reveal for every framed image inside `root` (staggered).
export function glitchReveal(root) {
  if (!effectsEnabled()) return
  const imgs = root.querySelectorAll('.frame .img-wrap img')
  for (const img of imgs) queue.push(img)
  if (!running) drain()
}

async function drain() {
  running = true
  while (queue.length) {
    const img = queue.shift()
    try {
      await playOne(img)
    } catch { /* effect is decorative — the plain <img> is already visible */ }
    await new Promise((r) => setTimeout(r, 150))
  }
  running = false
  clearTimeout(disposeTimer)
  disposeTimer = setTimeout(disposeRenderer, 5000)
}

async function playOne(img) {
  if (!img.isConnected) return
  if (!img.complete) {
    await img.decode().catch(() => {})
  }
  if (!img.naturalWidth || !img.isConnected) return

  if (!THREE) {
    THREE = await import('three')
  }
  if (!renderer) {
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' })
    } catch {
      return // no WebGL — skip silently
    }
    renderer.domElement.className = 'glitch-canvas'
  }

  const rect = img.getBoundingClientRect()
  if (rect.width < 10 || rect.height < 10) return
  renderer.setSize(rect.width, rect.height, false)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  const texture = new THREE.Texture(img)
  texture.needsUpdate = true
  texture.colorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: texture },
      uTime: { value: 0 },
      uProgress: { value: 1 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  })
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))

  const wrap = img.closest('.img-wrap')
  wrap.appendChild(renderer.domElement)

  const DURATION = 950
  const start = performance.now()
  await new Promise((resolve) => {
    function frame(now) {
      const t = (now - start) / DURATION
      if (t >= 1 || !img.isConnected) return resolve()
      material.uniforms.uTime.value = now / 1000
      // ease-out: heavy glitch up front, settling toward clean
      material.uniforms.uProgress.value = Math.pow(1 - t, 2.2)
      renderer.render(scene, camera)
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })

  renderer.domElement.remove()
  texture.dispose()
  material.dispose()
}

function disposeRenderer() {
  if (renderer && !running && queue.length === 0) {
    renderer.dispose()
    renderer = null
  }
}
