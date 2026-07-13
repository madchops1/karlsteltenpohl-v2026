// URL ↔ command mapping. Cold loads are served by prerendered static pages;
// after hydration, navigation is soft: commands push URLs, clicks on internal
// project links run the matching command, popstate replays it.

export const SITE_TITLE = 'Karl Steltenpohl — Software Engineer'

export function commandForPath(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return 'home'
  const m = path.match(/^\/projects\/([a-z0-9-]+)$/i)
  if (m) return `open ${m[1]}`
  return null
}

export function push(path, title) {
  if (location.pathname !== path) history.pushState({}, '', path)
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
