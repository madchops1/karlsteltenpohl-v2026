// Fake 90s popup ads for Karl's projects, styled as Tokyo-neon web junk. Any of the
// 27 projects can appear, but the three featured (VISUALZ 3, the CVJ-1 deck, The
// Desire Company) come up far more often. A fresh random one pops up
// every 30s (first a few seconds after boot), scattered and askew at a random
// size, up to MAX_OPEN on screen at once (the oldest recycles past that). Each can
// be dragged by its title bar or dismissed with the ×, and its CTA routes into the
// matching project page via the router (an internal /projects/<slug> link the
// router intercepts). Purely decorative: suppressed while the Konami dodge-flyer
// is running, gated behind effects (hidden by `crt off`, suppressed under
// prefers-reduced-motion via applyCrtPreference), and aria-hidden so the noise
// stays out of assistive tech — the same projects are reachable from `ls`.
import './styles/ads.css'
import { withBase } from './router.js'
import projects from './data/projects.json'

// Each ad has two actions: `more` reads the project inside the terminal (internal
// /projects/<slug> route the router intercepts); `cta` launches the real product
// site (`url`, opened in a new tab) when there is one. The three featured projects
// get hand-written neon copy here; every other project gets a generated ad below.
const CURATED = [
  {
    slug: 'visualz', theme: 'ad--cyan',
    bar: 'VISUALZ3.EXE', badge: 'NEW!!',
    title: 'VISUALZ 3', sub: 'Real-time VJ workstation',
    blurb: 'Make video as performable as audio — generate, mix, layer & FX your visuals live.',
    marquee: '⚡ 60 FPS ⚡ NODE FX ⚡ LIVE VISUALS ⚡ MIDI + AUDIO REACTIVE ⚡',
    stat: '★ SYSTEM v3.x.x',
    more: 'SEE MORE', cta: '▶ LAUNCH', url: 'https://visualzstudio.com',
  },
  {
    slug: 'cvj-1', theme: 'ad--magenta',
    bar: 'CVJ-1.SYS', badge: 'HOT!',
    title: 'CVJ-1', sub: 'Touchscreen VJ deck',
    blurb: 'Spin visuals like a DJ. A compact hardware deck built around VISUALZ 3.',
    marquee: '⚡ TOUCH ⚡ PERFORM ⚡ HANDS-ON ⚡ BUILT FOR THE STAGE ⚡',
    stat: 'LIMITED RUN',
    more: 'SEE MORE', cta: '▶ GRAB IT', url: 'https://visualzstudio.com/cvj-1-vj-deck',
  },
  {
    slug: 'the-desire-company', theme: 'ad--violet',
    bar: 'DESIRE.CO', badge: '★★★★★',
    title: 'THE DESIRE CO.', sub: 'Engineering that ships',
    blurb: 'Product strategy, platforms & portals. Karl leads engineering — Director since 2025.',
    marquee: '⚡ PRODUCT ⚡ PLATFORMS ⚡ STRATEGY ⚡ SHIPPING SINCE 2019 ⚡',
    stat: 'EST. 2019 // REMOTE',
    more: 'READ MORE', cta: '▶ VISIT', url: 'https://thedesirecompany.com',
  },
]

const FEATURED_WEIGHT = 6 // featured ads surface ~6× as often as the rest
const THEMES = ['ad--cyan', 'ad--magenta', 'ad--violet']
const BADGES = ['NEW!!', 'HOT!', 'WOW!', '★★★★★', 'RARE', 'FRESH', 'RETRO', 'BONUS']

// pull a punchy headline out of a project title — résumé entries read
// "Role - Company Year" (take the company); product entries keep their own name
function headline(p) {
  const parts = p.title.split(/\s+[-–—]\s+/)
  const t = (parts.length > 1 ? parts[1] : parts[0]).replace(/\s*\b(?:19|20)\d{2}\b.*$/, '').trim()
  return t || parts[0] || p.title
}
function blurbOf(p) {
  const first = p.description.split('\n\n')[0].split(/(?<=[.!?])\s/)[0]
  return first.length > 108 ? first.slice(0, 107).trimEnd() + '…' : first
}
// generated neon ad for any non-featured project, from its projects.json entry
function generate(p, i) {
  const head = headline(p)
  const ext = p.links.find((l) => /^https?:/i.test(l.url))
  return {
    slug: p.slug,
    theme: THEMES[i % THEMES.length],
    bar: head.toUpperCase(),
    badge: BADGES[i % BADGES.length],
    title: head,
    sub: p.year || 'From the archive',
    blurb: blurbOf(p),
    marquee: `⚡ ${head.toUpperCase()} ⚡ PORTFOLIO ⚡ KARL STELTENPOHL ⚡`,
    stat: p.year ? '// ' + p.year : '// ARCHIVE',
    more: 'SEE MORE', cta: '▶ VISIT', url: ext ? ext.url : null,
  }
}

// the full pool: one ad per project (curated copy for the featured three, generated
// for the rest), each tagged with a selection weight
const curatedBySlug = new Map(CURATED.map((a) => [a.slug, a]))
const POOL = projects.map((p, i) => ({
  ...(curatedBySlug.get(p.slug) || generate(p, i)),
  weight: curatedBySlug.has(p.slug) ? FEATURED_WEIGHT : 1,
}))

const FIRST_MS = 4500 // first popup lands a few seconds after boot
const PERIOD_MS = 30000 // then a fresh random ad every 30s
const MAX_OPEN = 3 // keep the screen busy but bounded — oldest recycles past this
const SIZES = ['ad--sm', 'ad--md', 'ad--lg'] // random size tier per spawn
const ZONES = ['p0', 'p1', 'p2'] // scatter spots — a spawn avoids occupied ones

let started = false
let topZ = 901
let host = null
let lastSlug = null
const openAds = [] // currently-visible ad boxes, oldest first

export function initAds() {
  if (started) return
  started = true
  host = document.createElement('div')
  host.id = 'ads'
  host.setAttribute('aria-hidden', 'true')
  document.body.appendChild(host)
  setTimeout(tick, FIRST_MS)
  setInterval(tick, PERIOD_MS)
}

// Don't pop ads while the Konami dodge-flyer owns the screen, or when effects are
// off (crt off / reduced motion also hides #ads via CSS). Missed ticks just wait
// for the next 30s beat — no catch-up pile.
function suppressed() {
  const cl = document.documentElement.classList
  return cl.contains('crt-off') || cl.contains('flyer-on')
}

function tick() {
  if (suppressed()) return
  while (openAds.length >= MAX_OPEN) close(openAds[0])
  spawn(pickAd(), pickZone(), SIZES[(Math.random() * SIZES.length) | 0])
}

// random project — never one already on screen, and never the same one twice in a
// row (so it still varies when only one is showing). Falls back gracefully if the
// pool is smaller than what's open.
function pickAd() {
  const openSlugs = new Set(openAds.map((el) => el.dataset.slug))
  let pool = POOL.filter((a) => !openSlugs.has(a.slug))
  if (!pool.length) pool = POOL.filter((a) => a.slug !== lastSlug)
  if (!pool.length) pool = POOL
  const ad = weightedPick(pool)
  lastSlug = ad.slug
  return ad
}

// weighted random draw — featured ads (higher weight) come up more often
function weightedPick(pool) {
  let total = 0
  for (const a of pool) total += a.weight
  let r = Math.random() * total
  for (const a of pool) if ((r -= a.weight) < 0) return a
  return pool[pool.length - 1]
}

// random zone that isn't already occupied (MAX_OPEN ≤ ZONES, so one is always free)
function pickZone() {
  const used = new Set(openAds.map((el) => el.dataset.zone))
  const free = ZONES.filter((z) => !used.has(z))
  const pool = free.length ? free : ZONES
  return pool[(Math.random() * pool.length) | 0]
}

function spawn(ad, zone, size) {
  if (suppressed()) return
  const href = withBase(`/projects/${ad.slug}`)
  const el = document.createElement('div')
  el.className = `ad ${ad.theme} ${zone} ${size}`
  el.dataset.zone = zone
  el.dataset.slug = ad.slug
  el.innerHTML = `
    <div class="ad-bar">
      <span class="ad-bar-title">◈ ${ad.bar}</span>
      <span class="ad-bar-btns">
        <i class="ad-min" aria-hidden="true"></i><i class="ad-max" aria-hidden="true"></i>
        <button class="ad-close" type="button" tabindex="-1" aria-label="close ad">×</button>
      </span>
    </div>
    <div class="ad-body">
      <span class="ad-badge" aria-hidden="true">${ad.badge}</span>
      <a class="ad-hero" href="${href}" tabindex="-1" aria-hidden="true">
        <span class="ad-thumb"><img src="${withBase(`/images/projects/${ad.slug}/01.jpg`)}" alt="" loading="lazy" decoding="async"></span>
      </a>
      <div class="ad-copy">
        <div class="ad-title">${ad.title}</div>
        <div class="ad-sub">${ad.sub}</div>
        <p class="ad-blurb">${ad.blurb}</p>
      </div>
      <div class="ad-marquee" aria-hidden="true"><span>${ad.marquee}&nbsp;&nbsp;${ad.marquee}&nbsp;&nbsp;</span></div>
      <div class="ad-actions">
        <a class="ad-btn ad-more" href="${href}" tabindex="-1" aria-hidden="true">${ad.more}</a>
        ${ad.url ? `<a class="ad-btn ad-cta" href="${ad.url}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true">${ad.cta}</a>` : ''}
      </div>
      <div class="ad-foot" aria-hidden="true">
        <span>${ad.stat}</span>
        <span class="ad-visitor">visitor #1,000,000</span>
      </div>
    </div>`

  el.style.zIndex = ++topZ
  el.addEventListener('pointerdown', () => { el.style.zIndex = ++topZ }, true)

  el.querySelector('.ad-close').addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    close(el)
  })
  // let the router (internal) or the browser (external new tab) handle the click,
  // then dismiss the popup
  el.querySelectorAll('a.ad-hero, a.ad-more, a.ad-cta').forEach((a) =>
    a.addEventListener('click', () => setTimeout(() => close(el), 30))
  )

  makeDraggable(el, el.querySelector('.ad-bar'))
  host.appendChild(el)
  openAds.push(el)
}

function close(el) {
  const i = openAds.indexOf(el)
  if (i !== -1) openAds.splice(i, 1)
  el.classList.add('closing')
  el.addEventListener('animationend', () => el.remove(), { once: true })
  setTimeout(() => el.remove(), 300) // fallback if animations are off
}

function makeDraggable(el, bar) {
  let dragging = false
  let sx = 0
  let sy = 0
  let ox = 0
  let oy = 0
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.ad-close')) return
    dragging = true
    const r = el.getBoundingClientRect()
    ox = r.left
    oy = r.top
    sx = e.clientX
    sy = e.clientY
    el.style.left = ox + 'px'
    el.style.top = oy + 'px'
    el.style.right = 'auto'
    el.style.bottom = 'auto'
    el.style.transform = 'none' // switch off the CSS tilt/centering while dragging
    el.classList.add('dragging')
    bar.setPointerCapture(e.pointerId)
  })
  bar.addEventListener('pointermove', (e) => {
    if (!dragging) return
    el.style.left = ox + (e.clientX - sx) + 'px'
    el.style.top = oy + (e.clientY - sy) + 'px'
  })
  const end = () => {
    if (!dragging) return
    dragging = false
    el.classList.remove('dragging')
  }
  bar.addEventListener('pointerup', end)
  bar.addEventListener('pointercancel', end)
}
