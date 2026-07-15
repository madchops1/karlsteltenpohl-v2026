import { Terminal } from './terminal.js'
import { registerCommands, applyCrtPreference } from './commands.js'
import { initRouter, commandForPath } from './router.js'
import { initBackground, startFlyer } from './background.js'
import { initAds } from './ads.js'
import { typewrite, finishActive } from './typewriter.js'

applyCrtPreference()

const term = new Terminal({
  screen: document.getElementById('screen'),
  form: document.getElementById('prompt'),
  input: document.getElementById('prompt-input'),
  scroller: document.getElementById('term-scroll'),
})

registerCommands(term)
initRouter(term)

// Returned command output types itself out; frames glitch in when reached.
// Running a new command finishes whatever is still typing.
term.decorate = (node) => typewrite(node, { follow: true, scroller: term.scroller })
term.beforeExec = finishActive

// Anything with data-cmd (palette chips, the masthead QR badge) runs a command.
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-cmd]')
  if (el) term.exec(el.dataset.cmd, { record: false })
})

// Tap anywhere on the terminal to focus the prompt (synchronously, so iOS
// raises the keyboard) — unless tapping a link/button or selecting text.
document.getElementById('terminal').addEventListener('click', (e) => {
  if (e.target.closest('a, button, input')) return
  const sel = window.getSelection()
  if (sel && !sel.isCollapsed) return
  term.input.focus({ preventScroll: true })
})

// --- minimize the terminal to play the whole background game ---
const restore = document.createElement('button')
restore.id = 'term-restore'
restore.type = 'button'
restore.title = 'restore terminal'
restore.innerHTML = '<span class="tr-dot" aria-hidden="true"></span>guest@karlsteltenpohl.com — zsh'
document.body.appendChild(restore)

const setMinimized = (on) => document.documentElement.classList.toggle('term-min', on)
restore.addEventListener('click', () => setMinimized(false))
// yellow titlebar dot minimizes; green one restores
const tlMin = document.querySelector('.tl-min')
const tlMax = document.querySelector('.tl-max')
if (tlMin) { tlMin.title = 'minimize'; tlMin.addEventListener('click', () => setMinimized(true)) }
if (tlMax) { tlMax.title = 'restore'; tlMax.addEventListener('click', () => setMinimized(false)) }

// --- Konami code → 3D dodge-flyer bonus (↑ ↓ ↑ ↓ ← → ← → B A ⏎) ---
const KONAMI = ['ArrowUp', 'ArrowDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'Enter']
let konamiI = 0
let flyerOn = false
window.addEventListener('keydown', (e) => {
  if (flyerOn) return // the flyer owns the keyboard while it runs
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (key === KONAMI[konamiI]) {
    if (konamiI >= 8) { e.preventDefault(); e.stopPropagation() } // don't leak B/A/⏎ to the prompt
    konamiI++
    if (konamiI === KONAMI.length) {
      konamiI = 0
      const doc = document.documentElement
      if (startFlyer(() => { flyerOn = false; doc.classList.remove('flyer-on'); setMinimized(false) })) {
        flyerOn = true
        doc.classList.add('flyer-on')
        setMinimized(true)
      }
    }
  } else {
    konamiI = key === KONAMI[0] ? 1 : 0
  }
}, true)

// ESC restores a minimized terminal (the flyer handles its own ESC)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !flyerOn && document.documentElement.classList.contains('term-min')) {
    setMinimized(false)
  }
})

// Hydrate: boot sequence — the masthead (title banner + tagline) types itself
// out first, then the route's command runs and its output types in turn.
// Cold project pages get the same boot. typewrite() is instant when effects
// are off, so boot() still runs immediately in that case.
const initial = commandForPath(location.pathname) || 'home'
term.clear()
const boot = () => {
  term.exec(initial, { echo: true, push: false, record: false })
  term.scrollToTop()
  // Start the animated background only after the boot sequence has the
  // stage — keeps the canvas render loop off the main thread during load.
  if (!document.documentElement.classList.contains('crt-off')) {
    const start = () => initBackground()
    'requestIdleCallback' in window
      ? requestIdleCallback(start, { timeout: 2500 })
      : setTimeout(start, 1500)
    initAds() // featured-work popups, staggered a few seconds in
  }
}
typewrite(document.getElementById('masthead'), { onDone: boot })
