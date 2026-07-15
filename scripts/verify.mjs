// Build gate: fails the build (and therefore the deploy) unless every project
// is present and complete in dist/ — the 26 migrated from the old site plus any
// added since (StraightPath Forward).
import { readFile, readdir, stat } from 'node:fs/promises'

const SLUGS = [
  'cvj-1',
  'visualz',
  'the-desire-company',
  'straightpathforward',
  '58peaks',
  'visualz-v1-v2',
  'robot-and-puppy-2',
  'robot-and-puppy-1',
  'json-threejs-character-generator',
  'dutchess-ai',
  'oranj-financial-advisor-tools',
  'botmap-sitemap-generator',
  'bonnaroo-website-2016',
  'outsidelands-website-2016',
  'label-insight',
  'barchart',
  'goreturnme',
  'tatanka-php-framework',
  'music-dealers',
  'lightology',
  'etecc',
  'melba-toast-for-everyday-health',
  'philips-internal-desktop-tool',
  'hp-moms-for-simplicity',
  'warwick-publishing',
  'etw',
  'fox-valley-values',
]

const dist = new URL('../dist/', import.meta.url)
const BASE = (process.env.BASE_PATH || '').replace(/\/$/, '')
const errors = []
const check = (cond, msg) => {
  if (!cond) errors.push(msg)
}

// exactly the 26 expected project pages
const pageFiles = (await readdir(new URL('projects/', dist)).catch(() => []))
  .filter((f) => f.endsWith('.html'))
  .map((f) => f.replace(/\.html$/, ''))
check(
  pageFiles.length === SLUGS.length,
  `expected ${SLUGS.length} project pages, found ${pageFiles.length}`
)
for (const slug of SLUGS) check(pageFiles.includes(slug), `missing page: projects/${slug}.html`)
for (const f of pageFiles) check(SLUGS.includes(f), `unexpected page: projects/${f}.html`)

// per-page content
for (const slug of SLUGS) {
  let html = ''
  try {
    html = await readFile(new URL(`projects/${slug}.html`, dist), 'utf8')
  } catch {
    continue // missing page already reported
  }
  check(/<title>.+ — Karl Steltenpohl<\/title>/.test(html), `${slug}: bad <title>`)
  check(
    /<meta name="description" content=".{10,}"/.test(html),
    `${slug}: empty meta description`
  )
  check(
    html.includes(`<link rel="canonical" href="https://karlsteltenpohl.com/projects/${slug}"`),
    `${slug}: bad canonical`
  )
  check(
    /<meta property="og:image" content="https:\/\/karlsteltenpohl\.com\/images\//.test(html),
    `${slug}: og:image not absolute`
  )
  check(html.includes('class="project"'), `${slug}: missing project markup`)
  check(html.includes('class="frame"'), `${slug}: missing image frame markup`)

  const imgs = [...html.matchAll(/<img src="([^"]*\/images\/projects\/[^"]+)"/g)].map((m) => m[1])
  check(imgs.length >= 1, `${slug}: no project images in page`)
  for (const src of imgs) {
    check(src.startsWith(`${BASE}/images/`), `${slug}: image src not under base: ${src}`)
    const distPath = src.slice(BASE.length + 1)
    const s = await stat(new URL(distPath, dist)).catch(() => null)
    check(s && s.size > 5 * 1024, `${slug}: image missing or tiny in dist: ${src}`)
  }
}

// home lists all 26
const home = await readFile(new URL('index.html', dist), 'utf8').catch(() => '')
for (const slug of SLUGS) {
  check(home.includes(`href="${BASE}/projects/${slug}"`), `home: missing link to ${slug}`)
}

// sitemap, CNAME, 404
const sitemap = await readFile(new URL('sitemap.xml', dist), 'utf8').catch(() => '')
const locs = [...sitemap.matchAll(/<loc>/g)].length
check(locs === SLUGS.length + 1, `sitemap: expected ${SLUGS.length + 1} <loc>, found ${locs}`)
check(
  (await stat(new URL('CNAME', dist)).catch(() => null)) !== null,
  'missing CNAME in dist'
)
check(
  (await stat(new URL('404.html', dist)).catch(() => null)) !== null,
  'missing 404.html in dist'
)

if (errors.length) {
  console.error(`VERIFY FAILED (${errors.length}):`)
  for (const e of errors) console.error('  ✗ ' + e)
  process.exit(1)
}
console.log(`verify ok: ${SLUGS.length} project pages, home listing, sitemap, CNAME, 404`)
