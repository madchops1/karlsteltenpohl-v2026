import projects from './data/projects.json'
import {
  el,
  renderHome,
  renderLs,
  renderProject,
  renderAbout,
  renderContact,
  renderHelp,
  renderHint,
} from './render.js'
import { push, SITE_TITLE } from './router.js'
import { glitchReveal, effectsEnabled } from './glitch.js'
import { initBackground, setBackgroundEnabled } from './background.js'
import { typewrite } from './typewriter.js'

const CRT_KEY = 'crt-off'

export function applyCrtPreference() {
  const off =
    localStorage.getItem(CRT_KEY) === '1' ||
    (localStorage.getItem(CRT_KEY) === null &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  document.documentElement.classList.toggle('crt-off', off)
}

export function registerCommands(term) {
  const defs = [
    {
      name: 'help',
      desc: 'list available commands',
      run: () => renderHelp(defs),
    },
    {
      name: 'ls',
      aliases: ['projects', 'll', 'dir'],
      desc: `list all ${projects.length} projects`,
      run: () => renderLs(projects),
    },
    {
      name: 'open',
      aliases: ['cat', 'view'],
      usage: 'open <slug>',
      desc: 'open a project (tab-completes)',
      completesSlug: true,
      run: (args, ctx) => {
        const slug = (args[0] || '').toLowerCase().replace(/^~?\/?(projects\/)?/, '')
        if (!slug) return renderHint(`usage: <code>open &lt;slug&gt;</code> — try <code>ls</code> to see slugs`)
        const p = projects.find((x) => x.slug === slug)
        if (!p) {
          const near = projects
            .map((x) => x.slug)
            .filter((s) => s.includes(slug) || slug.includes(s.slice(0, 4)))
            .slice(0, 3)
          const msg = el('div', { class: 'error', text: `open: no such project: ${slug}` })
          if (near.length) {
            msg.append(el('div', { class: 'hint', text: `did you mean: ${near.join(', ')}?` }))
          }
          return msg
        }
        if (ctx.push) push(`/projects/${p.slug}`, p.title)
        else document.title = `${p.title} — Karl Steltenpohl`
        const node = renderProject(p)
        typewrite(node, { onFrame: (f) => glitchReveal(f) })
        term.print(node)
        term.scrollToNode(node)
        return null
      },
      noAutoScroll: true,
    },
    {
      name: 'about',
      aliases: ['whoami'],
      desc: 'who is karl?',
      run: () => {
        const node = renderAbout(projects)
        typewrite(node, { onFrame: (f) => glitchReveal(f) })
        term.print(node)
        term.scrollToNode(node)
        return null
      },
      noAutoScroll: true,
    },
    {
      name: 'contact',
      aliases: ['email'],
      desc: 'email + social links',
      run: () => renderContact(),
    },
    {
      name: 'home',
      aliases: ['cd'],
      desc: 'back to the start',
      run: (args, ctx) => {
        if (ctx.push) push('/', null)
        document.title = SITE_TITLE
        return renderHome(projects)
      },
    },
    {
      name: 'clear',
      aliases: ['cls'],
      desc: 'clear the screen',
      run: () => {
        term.clear()
        return null
      },
    },
    {
      name: 'crt',
      usage: 'crt on|off',
      desc: 'toggle CRT + glitch effects',
      run: (args) => {
        const arg = (args[0] || '').toLowerCase()
        const off = arg === 'off' ? true : arg === 'on' ? false : !document.documentElement.classList.contains('crt-off')
        localStorage.setItem(CRT_KEY, off ? '1' : '0')
        document.documentElement.classList.toggle('crt-off', off)
        if (!off) initBackground()
        setBackgroundEnabled(!off)
        return renderHint(`effects ${off ? 'off' : 'on'}`)
      },
    },
    {
      name: 'glitch',
      desc: 'replay the glitch on visible media',
      run: () => {
        if (!effectsEnabled()) return renderHint(`effects are off — try <code>crt on</code>`)
        glitchReveal(term.screen)
        return null
      },
    },
    // easter eggs
    {
      name: 'pwd',
      hidden: true,
      desc: '',
      run: () => renderHint('/home/guest/portfolio'),
    },
    {
      name: 'sudo',
      hidden: true,
      desc: '',
      run: () => el('div', { class: 'error', text: 'guest is not in the sudoers file. This incident will be reported.' }),
    },
    {
      name: 'exit',
      hidden: true,
      aliases: ['logout', 'q'],
      desc: '',
      run: () => renderHint('there is no escape. try <code>ls</code> instead.'),
    },
  ]

  for (const def of defs) term.register(def)
  term.setSlugCompleter(() => projects.map((p) => p.slug))
}
