// Terminal core: prompt input, command registry, echo/output log, history,
// tab completion. Content-specific commands live in commands.js.

const HISTORY_KEY = 'term-history'
const HISTORY_MAX = 100

export class Terminal {
  constructor({ screen, form, input, scroller }) {
    this.screen = screen
    this.form = form
    this.input = input
    this.scroller = scroller
    this.commands = new Map()
    this.aliases = new Map()
    this.history = this.loadHistory()
    this.historyIdx = this.history.length
    this.completions = null // cycled candidates for repeated Tab

    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const line = input.value.trim()
      input.value = ''
      this.updateCaret()
      if (line) this.exec(line)
    })

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.recall(-1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.recall(1)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        this.complete()
      } else {
        this.completions = null
      }
    })

    input.addEventListener('input', () => this.updateCaret())
    input.addEventListener('focus', () => this.updateCaret())
    input.addEventListener('blur', () => this.updateCaret())
    this.updateCaret()
  }

  register(def) {
    this.commands.set(def.name, def)
    for (const a of def.aliases || []) this.aliases.set(a, def.name)
  }

  lookup(name) {
    return this.commands.get(name) || this.commands.get(this.aliases.get(name))
  }

  print(node) {
    if (!node) return
    this.screen.appendChild(node)
    this.scrollToPrompt()
  }

  echo(line) {
    const div = document.createElement('div')
    div.className = 'echo'
    const user = document.createElement('span')
    user.className = 'user'
    user.textContent = 'guest@karlsteltenpohl.com:~$ '
    const cmd = document.createElement('span')
    cmd.className = 'cmd'
    cmd.textContent = line
    div.append(user, cmd)
    this.screen.appendChild(div)
  }

  error(text) {
    const div = document.createElement('div')
    div.className = 'error'
    div.textContent = text
    return div
  }

  // Execute a command line. opts.echo prints the prompt echo; opts.push lets the
  // command update the URL (false when replaying history/popstate).
  exec(line, opts = {}) {
    const { echo = true, push = true, record = true } = opts
    if (echo) this.echo(line)
    if (record) this.remember(line)

    if (this.beforeExec) this.beforeExec()
    const [name, ...args] = line.split(/\s+/)
    const def = this.lookup(name.toLowerCase())
    if (!def) {
      const near = this.suggest(name)
      let msg = `zsh: command not found: ${name}`
      if (near.length) msg += `  (did you mean: ${near.join(', ')}?)`
      this.print(this.error(msg + `  — type 'help'`))
      return
    }
    try {
      const out = def.run(args, { term: this, push })
      if (out) {
        if (this.decorate) this.decorate(out)
        this.print(out)
      }
      if (!def.noAutoScroll) this.scrollToPrompt()
    } catch (err) {
      this.print(this.error(`${name}: ${err.message}`))
      this.scrollToPrompt()
    }
  }

  suggest(name) {
    const all = [...this.commands.keys(), ...this.aliases.keys()]
    return all
      .filter((c) => c.startsWith(name[0]) || c.includes(name.slice(0, 3)))
      .slice(0, 3)
  }

  remember(line) {
    if (this.history[this.history.length - 1] !== line) {
      this.history.push(line)
      if (this.history.length > HISTORY_MAX) this.history.shift()
      try {
        sessionStorage.setItem(HISTORY_KEY, JSON.stringify(this.history))
      } catch { /* storage unavailable — history is per-page-load only */ }
    }
    this.historyIdx = this.history.length
  }

  loadHistory() {
    try {
      return JSON.parse(sessionStorage.getItem(HISTORY_KEY)) || []
    } catch {
      return []
    }
  }

  recall(dir) {
    const next = this.historyIdx + dir
    if (next < 0 || next > this.history.length) return
    this.historyIdx = next
    this.input.value = this.history[next] || ''
    this.input.setSelectionRange(this.input.value.length, this.input.value.length)
    this.updateCaret()
  }

  // Tab completion: first token from command names; second token (after a
  // slug-taking command) from the provider registered via setSlugCompleter.
  complete() {
    const value = this.input.value
    const parts = value.split(/\s+/)
    let candidates = []
    let prefixLen = 0

    if (parts.length <= 1) {
      const word = parts[0] || ''
      candidates = [...this.commands.keys()].filter((c) => c.startsWith(word))
      prefixLen = word.length
    } else if (this.slugCompleter) {
      const def = this.lookup(parts[0].toLowerCase())
      if (def && def.completesSlug) {
        const word = parts[parts.length - 1]
        candidates = this.slugCompleter().filter((s) => s.startsWith(word))
        prefixLen = word.length
      }
    }

    if (candidates.length === 0) return
    if (candidates.length === 1) {
      this.input.value = value.slice(0, value.length - prefixLen) + candidates[0] + ' '
    } else {
      // extend to longest common prefix; on a repeat Tab, list candidates
      let common = candidates[0]
      for (const c of candidates) {
        while (!c.startsWith(common)) common = common.slice(0, -1)
      }
      if (common.length > prefixLen) {
        this.input.value = value.slice(0, value.length - prefixLen) + common
      } else if (this.completions === value) {
        const div = document.createElement('div')
        div.className = 'hint'
        div.textContent = candidates.join('  ')
        this.echo(value)
        this.print(div)
      }
      this.completions = this.input.value
    }
    this.updateCaret()
  }

  setSlugCompleter(fn) {
    this.slugCompleter = fn
  }

  updateCaret() {
    const wrap = this.input.closest('.input-wrap')
    if (!wrap) return
    const hide = this.input.value.length > 0 || document.activeElement === this.input
    wrap.classList.toggle('hide-caret', hide)
  }

  scrollToPrompt() {
    if (this.scroller) this.scroller.scrollTop = this.scroller.scrollHeight
    else this.form.scrollIntoView({ block: 'end' })
  }

  scrollToTop() {
    if (this.scroller) this.scroller.scrollTop = 0
    else window.scrollTo(0, 0)
  }

  // bring a freshly printed block (e.g. a project view) to the top of the
  // viewport so long content is read from the start
  scrollToNode(node) {
    if (!this.scroller) return node.scrollIntoView()
    const sr = this.scroller.getBoundingClientRect()
    const nr = node.getBoundingClientRect()
    this.scroller.scrollTop += nr.top - sr.top - 8
  }

  clear() {
    this.screen.replaceChildren()
  }
}
