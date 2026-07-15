// Pure DOM builders: projects.json entries → output fragments. The prerender
// template in scripts/prerender.mjs mirrors this markup — keep them in sync
// (scripts/verify.mjs asserts the shared class names/structure in the build).
import { withBase } from './router.js'

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v
    else node.setAttribute(k, v)
  }
  for (const c of children) node.append(c)
  return node
}

function block(children) {
  return el('div', { class: 'block' }, children)
}

export function renderHint(text) {
  const div = el('div', { class: 'hint' })
  div.innerHTML = text // trusted, static strings only
  return div
}

export function renderLs(projects) {
  const nav = el('nav', { class: 'ls', 'aria-label': 'projects' })
  nav.append(el('div', { class: 'ls-total', text: `total ${projects.length}` }))
  const head = el('div', { class: 'ls-head', 'aria-hidden': 'true' })
  head.append(
    el('span', { text: 'slug' }),
    el('span', { text: 'year' }),
    el('span', { text: 'title' })
  )
  nav.append(head)
  for (const p of projects) {
    const row = el('a', { class: 'ls-row', href: withBase(`/projects/${p.slug}`) })
    row.append(
      el('span', { class: 'ls-slug', text: p.slug }),
      el('span', { class: p.year ? 'ls-year' : 'ls-year ls-year-empty', text: p.year || '····' }),
      el('span', { class: 'ls-title', text: p.title })
    )
    nav.append(row)
  }
  return nav
}

export function renderFrame(img, label, { eager = false } = {}) {
  const figure = el('figure', { class: 'frame' })
  figure.append(el('span', { class: 'frame-label', 'aria-hidden': 'true', text: label }))
  const wrap = el('span', { class: 'img-wrap' })
  const attrs = { src: withBase(img.src), alt: img.alt, decoding: 'async' }
  if (img.width && img.height) {
    attrs.width = img.width
    attrs.height = img.height
  }
  if (eager) attrs.fetchpriority = 'high'
  else attrs.loading = 'lazy'
  wrap.append(el('img', attrs))
  figure.append(wrap)
  return figure
}

export function renderProject(p) {
  const article = el('article', { class: 'project' })
  article.append(el('h2', { text: p.title }))
  const meta = []
  if (p.year) meta.push(p.year)
  meta.push(`~/projects/${p.slug}`)
  article.append(el('div', { class: 'meta', text: meta.join(' · ') }))

  const desc = el('div', { class: 'desc' })
  for (const para of p.description.split('\n\n')) {
    desc.append(el('p', { text: para }))
  }
  article.append(desc)

  p.images.forEach((img, i) => {
    article.append(
      renderFrame(img, `img: ${String(i + 1).padStart(2, '0')} / ${p.images.length}`, { eager: i === 0 })
    )
  })

  if (p.links.length) {
    const ul = el('ul', { class: 'links' })
    for (const l of p.links) {
      ul.append(el('li', {}, [el('a', { href: l.url, rel: 'noopener', text: l.label })]))
    }
    article.append(ul)
  }

  article.append(el('a', { class: 'nav-back', href: withBase('/'), text: '[← back to all projects]' }))
  return article
}

export function renderHome(projects) {
  const frag = document.createDocumentFragment()
  frag.append(
    block([
      el('p', {
        text:
          'Welcome to my site — two decades of software engineering: full-stack, ' +
          'devsecops, frameworks, fintech, ecommerce, consulting, SAAS, VJ tools and ' +
          'live-visual hardware, web platforms, creative code, building teams, scaling ' +
          'AI agents to production, and engineering leadership.',
      }),
    ])
  )
  const hint = renderHint(
    `type <code>help</code> for commands, <code>open &lt;slug&gt;</code> to view a project — or just click around.`
  )
  frag.append(hint)
  frag.append(renderLs(projects))
  return frag
}

export function renderAbout(projects) {
  const article = el('article', { class: 'project about' })
  article.append(el('h2', { text: 'Karl Steltenpohl' }))
  article.append(el('div', { class: 'meta', text: 'software engineer · vj · maker' }))
  const desc = el('div', { class: 'desc' })
  desc.append(
    el('p', {
      text:
        'Software engineer with two decades of shipped work — from full-stack web ' +
        'platforms and high-traffic festival sites to financial tools and creative ' +
        'coding experiments.',
    }),
    el('p', {
      text:
        'Currently Director of Engineering at The Desire Company, and the maker of ' +
        'VISUALZ, a VJ workstation for live visual performance, and the CVJ-1 VJ deck.',
    }),
    el('p', { text: `This terminal holds ${projects.length} projects — type 'ls' to list them.` })
  )
  article.append(desc)
  article.append(
    renderFrame({ src: '/images/profile.jpg', alt: 'Karl Steltenpohl' }, 'img: profile.jpg', { eager: true })
  )
  return article
}

export function renderContact() {
  const article = el('article', { class: 'project contact' })
  article.append(el('h2', { text: 'Contact' }))
  const ul = el('ul', { class: 'links' })
  // email assembled at render time — real mailto for humans, absent from static HTML
  const addr = ['karl', 'steltenpohl'].join('.') + '@' + ['gmail', 'com'].join('.')
  ul.append(
    el('li', {}, [el('a', { href: 'mailto:' + addr, text: addr })]),
    el('li', {}, [
      el('a', {
        href: 'https://www.instagram.com/karl.steltenpohl',
        rel: 'me noopener',
        text: 'instagram/karl.steltenpohl',
      }),
    ]),
    el('li', {}, [
      el('a', {
        href: 'https://www.linkedin.com/in/karl-steltenpohl-26ab338/',
        rel: 'me noopener',
        text: 'linkedin/karl-steltenpohl',
      }),
    ]),
    el('li', {}, [
      el('a', { href: 'https://x.com/madchops1', rel: 'me noopener', text: 'x/madchops1' }),
    ])
  )
  article.append(ul)
  return article
}

export function renderHelp(commands) {
  const div = el('div', { class: 'help-table', role: 'table' })
  for (const def of commands) {
    if (def.hidden) continue
    div.append(
      el('span', { class: 'cmd-name', text: def.usage || def.name }),
      el('span', { class: 'cmd-desc', text: def.desc })
    )
  }
  return div
}
