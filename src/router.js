// URL ↔ command mapping. Cold loads are served by prerendered static pages;
// after hydration, navigation is soft: commands push URLs, clicks on internal
// project links run the matching command, popstate replays it.

export const SITE_TITLE = 'Karl Steltenpohl — Software Engineer'

// '/' on the custom domain; '/karlsteltenpohl-v2026/' on the github.io preview
const BASE = import.meta.env.BASE_URL

// site-root-relative path ('/projects/x') → served URL
export function withBase(path) {
  return BASE.replace(/\/$/, '') + path
}

export function commandForPath(pathname) {
  let path = pathname
  if (BASE !== '/' && path.startsWith(BASE.replace(/\/$/, ''))) {
    path = path.slice(BASE.length - 1)
  }
  path = path.replace(/\/+$/, '') || '/'
  if (path === '/') return 'home'
  const m = path.match(/^\/projects\/([a-z0-9-]+)$/i)
  if (m) return `open ${m[1]}`
  return null
}

export function push(path, title) {
  const full = withBase(path)
  if (location.pathname !== full) history.pushState({}, '', full)
  document.title = title ? `${title} — Karl Steltenpohl` : SITE_TITLE
}

export function initRouter(term) {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a')
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (a.origin !== location.origin) return
    const cmd = commandForPath(a.pathname)
    if (!cmd) return
    e.preventDefault()
    term.exec(cmd, { echo: true, push: true, record: false })
  })

  window.addEventListener('popstate', () => {
    const cmd = commandForPath(location.pathname)
    if (cmd) term.exec(cmd, { echo: true, push: false, record: false })
  })
}
