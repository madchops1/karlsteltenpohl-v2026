import { Terminal } from './terminal.js'
import { registerCommands, applyCrtPreference } from './commands.js'
import { initRouter, commandForPath } from './router.js'

applyCrtPreference()

const term = new Terminal({
  screen: document.getElementById('screen'),
  form: document.getElementById('prompt'),
  input: document.getElementById('prompt-input'),
})

registerCommands(term)
initRouter(term)

// Palette chips: tap runs the command (and echoes it, keeping the metaphor).
document.getElementById('palette').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-cmd]')
  if (btn) term.exec(btn.dataset.cmd, { record: false })
})

// Tap anywhere on the terminal to focus the prompt (synchronously, so iOS
// raises the keyboard) — unless tapping a link/button or selecting text.
document.getElementById('terminal').addEventListener('click', (e) => {
  if (e.target.closest('a, button, input')) return
  const sel = window.getSelection()
  if (sel && !sel.isCollapsed) return
  term.input.focus({ preventScroll: true })
})

// Hydrate: replace prerendered static content with the identical client render
// for the current URL (which also plays the glitch reveal on project pages).
const initial = commandForPath(location.pathname) || 'home'
term.clear()
term.exec(initial, { echo: true, push: false, record: false })
window.scrollTo(0, 0)
