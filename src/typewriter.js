// Typewriter reveal for command output: text nodes stream in character by
// character (fast, capped at ~1.4s per output regardless of length); image
// frames stay hidden until the "cursor" reaches them, then reveal — which is
// when the glitch effect fires. Any click or keypress skips to the end.
// Disabled (instant) under prefers-reduced-motion or `crt off`.
import { effectsEnabled } from './glitch.js'

let active = null

export function finishActive() {
  if (active) active.finish()
}

// Prepare + start typing `root` (may still be detached; reveal starts on rAF).
// opts.follow keeps `opts.scroller` pinned to the bottom while typing.
// opts.onFrame fires once per revealed .frame element.
export function typewrite(root, { follow = false, scroller = null, onFrame = null, onDone = null } = {}) {
  if (!effectsEnabled()) {
    if (onFrame) for (const f of root.querySelectorAll('.frame')) onFrame(f)
    if (onDone) onDone()
    return
  }
  finishActive()

  const steps = []
  ;(function collect(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.nodeValue) steps.push({ text: node.nodeValue, node })
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return
    if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('frame')) {
      steps.push({ frame: node })
      return
    }
    for (const child of [...node.childNodes]) collect(child)
  })(root)

  let total = 0
  for (const s of steps) {
    if (s.text) {
      total += s.text.length
      s.node.nodeValue = ''
    } else {
      s.frame.classList.add('tw-pending')
    }
  }
  if (steps.length === 0) {
    if (onDone) onDone()
    return
  }

  const duration = Math.min(1400, Math.max(350, total * 1.1))
  const rate = total / duration // chars per ms
  let idx = 0
  let raf = 0

  const revealFrame = (frame) => {
    if (!frame.classList.contains('tw-pending')) return
    frame.classList.remove('tw-pending')
    if (onFrame) onFrame(frame)
  }

  // NOTE: no pointer-based skip — finishing on pointerdown reflows the layout
  // between mousedown and mouseup, which kills the click. Keystrokes skip;
  // running any command also finishes the previous animation (beforeExec).
  const cleanup = () => {
    cancelAnimationFrame(raf)
    document.removeEventListener('keydown', finish, true)
    if (active && active.finish === finish) active = null
    if (onDone) {
      const cb = onDone
      onDone = null // fire once, whether finished naturally or skipped
      cb()
    }
  }

  const finish = () => {
    for (const s of steps) {
      if (s.text) s.node.nodeValue = s.text
      else revealFrame(s.frame)
    }
    cleanup()
    if (follow && scroller) scroller.scrollTop = scroller.scrollHeight
  }

  let last = performance.now()
  let budget = 0
  const frame = (now) => {
    budget += (now - last) * rate
    last = now
    while (idx < steps.length) {
      const s = steps[idx]
      if (s.frame) {
        revealFrame(s.frame)
        idx++
        continue
      }
      const have = s.node.nodeValue.length
      const want = Math.min(Math.floor(budget), s.text.length - have)
      if (want <= 0) break
      s.node.nodeValue = s.text.slice(0, have + want)
      budget -= want
      if (s.node.nodeValue.length >= s.text.length) idx++
    }
    if (follow && scroller) scroller.scrollTop = scroller.scrollHeight
    if (idx >= steps.length) return cleanup()
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  document.addEventListener('keydown', finish, true)
  active = { finish }
}
