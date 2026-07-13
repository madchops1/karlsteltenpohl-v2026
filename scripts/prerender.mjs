// Post-build prerender: stamps a real static HTML page for each project at
// dist/projects/<slug>.html (GitHub Pages serves .html extensionless, so the
// live /projects/<slug> URLs survive the migration byte-for-byte), injects the
// home listing + per-page meta/OG, and generates sitemap.xml + 404.html.
// The content markup mirrors src/render.js — scripts/verify.mjs guards drift.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const ORIGIN = 'https://karlsteltenpohl.com'
const SITE_TITLE = 'Karl Steltenpohl — Software Engineer'

const dist = new URL('../dist/', import.meta.url)
const shell = await readFile(new URL('index.html', dist), 'utf8')
const projects = JSON.parse(
  await readFile(new URL('../src/data/projects.json', import.meta.url), 'utf8')
)

const esc = (s) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const truncate = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…')

function echoHtml(cmd) {
  return `<div class="echo"><span class="user">guest@karlsteltenpohl.com:~$ </span><span class="cmd">${esc(cmd)}</span></div>`
}

function lsHtml() {
  const rows = projects
    .map(
      (p) =>
        `<a class="ls-row" href="/projects/${p.slug}">` +
        `<span class="ls-slug">${esc(p.slug)}</span>` +
        `<span class="${p.year ? 'ls-year' : 'ls-year ls-year-empty'}">${esc(p.year || '····')}</span>` +
        `<span class="ls-title">${esc(p.title)}</span></a>`
    )
    .join('\n')
  return (
    `<nav class="ls" aria-label="projects"><div class="ls-total">total ${projects.length}</div>` +
    `<div class="ls-head" aria-hidden="true"><span>slug</span><span>year</span><span>title</span></div>\n${rows}</nav>`
  )
}

function projectHtml(p) {
  const meta = [p.year, `~/projects/${p.slug}`].filter(Boolean).join(' · ')
  const desc = p.description
    .split('\n\n')
    .map((t) => `<p>${esc(t)}</p>`)
    .join('\n')
  const figures = p.images
    .map(
      (img, i) =>
        `<figure class="frame"><span class="frame-label" aria-hidden="true">img: ${String(i + 1).padStart(2, '0')} / ${p.images.length}</span>` +
        `<span class="img-wrap"><img src="${esc(img.src)}" alt="${esc(img.alt)}" loading="lazy" decoding="async"></span></figure>`
    )
    .join('\n')
  const links = p.links.length
    ? `<ul class="links">${p.links
        .map((l) => `<li><a href="${esc(l.url)}" rel="noopener">${esc(l.label)}</a></li>`)
        .join('')}</ul>`
    : ''
  return (
    `${echoHtml('open ' + p.slug)}<article class="project"><h2>${esc(p.title)}</h2>` +
    `<div class="meta">${esc(meta)}</div><div class="desc">${desc}</div>\n${figures}\n${links}` +
    `<a class="nav-back" href="/">[← back to all projects]</a></article>`
  )
}

function homeHtml() {
  return (
    `${echoHtml('home')}<div class="block"><p>Welcome. This is the portfolio of Karl Steltenpohl — two decades of software: ` +
    `VJ tools and live-visual hardware, web platforms, creative code, and engineering leadership.</p></div>` +
    `<div class="hint">type <code>help</code> for commands, <code>open &lt;slug&gt;</code> to view a project — or just click around.</div>\n` +
    lsHtml()
  )
}

function stampPage({ content, title, description, canonicalPath, ogImage, ogType, extraHead = '' }) {
  let html = shell
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
  html = html.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${esc(description)}"`
  )
  html = html.replace(
    /<link rel="canonical" href="[^"]*"/,
    `<link rel="canonical" href="${ORIGIN}${canonicalPath}"`
  )
  const og = [
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:type" content="${ogType}" />`,
    `<meta property="og:url" content="${ORIGIN}${canonicalPath}" />`,
    `<meta property="og:image" content="${ORIGIN}${ogImage}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    extraHead,
  ].join('\n  ')
  html = html.replace('</head>', `  ${og}\n</head>`)
  html = html.replace('<!--ssr-->', content)
  return html
}

// project pages
await mkdir(new URL('projects/', dist), { recursive: true })
for (const p of projects) {
  const description = truncate(p.description.replace(/\n+/g, ' '), 155)
  const html = stampPage({
    content: projectHtml(p),
    title: `${p.title} — Karl Steltenpohl`,
    description,
    canonicalPath: `/projects/${p.slug}`,
    ogImage: p.images[0].src,
    ogType: 'article',
  })
  await writeFile(new URL(`projects/${p.slug}.html`, dist), html)
}

// home
const personJsonLd = `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Karl Steltenpohl',
  url: ORIGIN,
  image: `${ORIGIN}/images/profile.jpg`,
  jobTitle: 'Software Engineer',
  sameAs: [
    'https://www.instagram.com/karl.steltenpohl',
    'https://www.linkedin.com/in/karl-steltenpohl-26ab338/',
  ],
})}</script>`
await writeFile(
  new URL('index.html', dist),
  stampPage({
    content: homeHtml(),
    title: SITE_TITLE,
    description:
      "Karl Steltenpohl — software engineer. Two decades of projects: VJ tools, web platforms, creative code. Type 'help' to look around.",
    canonicalPath: '/',
    ogImage: '/images/profile.jpg',
    ogType: 'website',
    extraHead: personJsonLd,
  })
)

// 404 — a real error page, terminal-styled
await writeFile(
  new URL('404.html', dist),
  stampPage({
    content:
      `${echoHtml('open ???')}<div class="error">zsh: no such file or directory</div>` +
      `<div class="hint">try <a href="/">home</a> or <code>ls</code> — all projects live under /projects/&lt;slug&gt;</div>${lsHtml()}`,
    title: `404 — ${SITE_TITLE}`,
    description: 'No such file or directory.',
    canonicalPath: '/404.html',
    ogImage: '/images/profile.jpg',
    ogType: 'website',
    extraHead: '<meta name="robots" content="noindex" />',
  })
)

// sitemap
const urls = ['/', ...projects.map((p) => `/projects/${p.slug}`)]
const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${ORIGIN}${u}</loc></url>`).join('\n') +
  `\n</urlset>\n`
await writeFile(new URL('sitemap.xml', dist), sitemap)

console.log(`prerendered ${projects.length} project pages + home + 404 + sitemap (${urls.length} urls)`)
