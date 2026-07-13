// One-time content migration from the live Squarespace site (karlsteltenpohl.com).
// Fetches all 26 project pages, extracts title/description/images/links, downloads
// images to public/images/projects/<slug>/, and writes src/data/projects.json.
// After the manual touch-up pass, projects.json is canonical — do not re-run.
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { parse } from 'node-html-parser'

const ORIGIN = 'https://karlsteltenpohl.com'

// Display order = live homepage order. This list is the completeness contract;
// scripts/verify.mjs asserts the same 26 slugs against the build output.
const SLUGS = [
  'cvj-1',
  'visualz',
  'the-desire-company',
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

const JUNK_TEXT = /^(open menu|close menu|cart|instagram|linkedin|0)$|copyright ©|\[dot\]|\[at\]/i

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchWithRetry(url, opts = {}, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { redirect: 'follow', ...opts })
      if (res.ok) return res
      if (i === tries) throw new Error(`HTTP ${res.status} for ${url}`)
    } catch (err) {
      if (i === tries) throw err
    }
    await sleep(500 * i)
  }
}

function cleanText(s) {
  return s
    .replace(/[​‌﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function extractProject(slug) {
  // Squarespace JSON API: canonical title + hero image. Body/excerpt are empty on
  // this site — the description lives in page sections, so we always parse HTML too.
  let title = ''
  let assetUrl = ''
  try {
    const res = await fetchWithRetry(`${ORIGIN}/projects/${slug}?format=json`, {
      headers: { accept: 'application/json' },
    })
    if ((res.headers.get('content-type') || '').includes('json')) {
      const item = (await res.json()).item
      if (item) {
        title = cleanText(item.title || '')
        assetUrl = item.assetUrl || ''
      }
    }
  } catch { /* HTML path below covers everything */ }

  const res = await fetchWithRetry(`${ORIGIN}/projects/${slug}`)
  const root = parse(await res.text())
  const article =
    root.querySelector('article') ||
    root.querySelector('main') ||
    root.querySelector('.sqs-layout') ||
    root

  if (!title) {
    const ogTitle = root
      .querySelector('meta[property="og:title"]')
      ?.getAttribute('content')
    title = cleanText(article.querySelector('h1, h2')?.text || (ogTitle || '').split('—')[0])
  }

  // Text/links live in .sqs-html-content blocks inside the article; scoping there
  // keeps out prev/next navigation and site chrome.
  const blocks = article.querySelectorAll('.sqs-html-content')
  const paragraphs = []
  const links = []
  let headingText = ''
  for (const block of blocks) {
    for (const h of block.querySelectorAll('h1, h2, h3')) headingText += ' ' + cleanText(h.text)
    for (const p of block.querySelectorAll('p')) {
      const t = cleanText(p.text)
      if (t && !JUNK_TEXT.test(t)) paragraphs.push(t)
    }
    for (const a of block.querySelectorAll('a')) {
      const href = a.getAttribute('href') || ''
      if (!/^https?:\/\//.test(href)) continue
      try {
        const host = new URL(href).hostname
        if (host.endsWith('karlsteltenpohl.com')) continue
        links.push({ label: cleanText(a.text) || host, url: href })
      } catch { /* unparseable href — skip */ }
    }
  }
  let description = paragraphs.join('\n\n')
  if (!description) {
    const metaDesc = root.querySelector('meta[name="description"]')?.getAttribute('content')
    description = cleanText(metaDesc || '')
  }

  const images = []
  if (assetUrl) images.push(assetUrl)
  for (const img of article.querySelectorAll('img')) {
    const src = img.getAttribute('data-src') || img.getAttribute('src') || ''
    if (src.includes('squarespace-cdn.com')) images.push(src)
  }

  return { source: assetUrl ? 'json+html' : 'html', title, headingText, description, images, links }
}

function imageExt(url) {
  const m = new URL(url).pathname.match(/\.(png|jpe?g|gif|webp)$/i)
  return m ? m[0].toLowerCase().replace('jpeg', 'jpg') : '.jpg'
}

async function downloadImage(url, destPath) {
  if (url.startsWith('//')) url = 'https:' + url
  const clean = url.split('?')[0]
  const res = await fetchWithRetry(`${clean}?format=1500w`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(destPath, buf)
  return buf.length
}

function extractYear(title) {
  const m = title.match(/\b(19|20)\d{2}(\s*[-–]\s*((19|20)\d{2}|present))?\b/i)
  return m ? m[0].replace(/\s*[-–]\s*/, '–') : ''
}

async function main() {
  const projects = []
  const report = []

  for (const slug of SLUGS) {
    const p = await extractProject(slug)
    const dir = new URL(`../public/images/projects/${slug}/`, import.meta.url)
    await mkdir(dir, { recursive: true })

    const seen = new Set()
    const localImages = []
    for (const src of p.images) {
      const key = src.split('?')[0]
      if (seen.has(key)) continue
      seen.add(key)
      const n = String(localImages.length + 1).padStart(2, '0')
      const file = `${n}${imageExt(key)}`
      try {
        const size = await downloadImage(src, new URL(file, dir))
        if (size < 5 * 1024) {
          console.warn(`  ! ${slug}/${file} is ${size}B — likely junk, skipping`)
          continue
        }
        localImages.push({ src: `/images/projects/${slug}/${file}`, alt: p.title })
      } catch (err) {
        console.warn(`  ! failed image for ${slug}: ${key} (${err.message})`)
      }
      await sleep(250)
    }

    projects.push({
      slug,
      title: p.title,
      year: extractYear(p.title) || extractYear(p.headingText || ''),
      description: p.description,
      images: localImages,
      links: p.links,
    })

    const flags = []
    if (!p.title) flags.push('NO TITLE')
    if (p.description.length < 30) flags.push('SHORT DESC')
    if (/open menu|cart/i.test(p.description)) flags.push('NAV JUNK')
    if (localImages.length === 0) flags.push('NO IMAGES')
    report.push({
      slug,
      src: p.source,
      title: p.title.slice(0, 40),
      imgs: localImages.length,
      links: p.links.length,
      desc: p.description.length,
      flags: flags.join(',') || 'ok',
    })
    console.log(`✓ ${slug} (${p.source}) — ${localImages.length} img, ${p.description.length} desc chars`)
    await sleep(250)
  }

  // Profile photo from homepage header
  try {
    const res = await fetchWithRetry(ORIGIN)
    const root = parse(await res.text())
    const headerImg = (root.querySelector('header') || root)
      .querySelectorAll('img')
      .map((i) => i.getAttribute('data-src') || i.getAttribute('src') || '')
      .find((s) => s.includes('squarespace-cdn.com'))
    if (headerImg) {
      const size = await downloadImage(
        headerImg,
        new URL('../public/images/profile.jpg', import.meta.url)
      )
      console.log(`✓ profile.jpg (${(size / 1024).toFixed(0)}KB)`)
    } else {
      console.warn('! no profile photo found on homepage header')
    }
  } catch (err) {
    console.warn(`! profile photo failed: ${err.message}`)
  }

  const out = new URL('../src/data/projects.json', import.meta.url)
  await writeFile(out, JSON.stringify(projects, null, 2) + '\n')

  console.log('\n--- REPORT ---')
  console.table(report)

  // Completeness contract
  const errors = []
  if (projects.length !== SLUGS.length)
    errors.push(`expected ${SLUGS.length} projects, got ${projects.length}`)
  for (const p of projects) {
    if (!p.title) errors.push(`${p.slug}: missing title`)
    if (!p.description) errors.push(`${p.slug}: missing description`)
    if (p.images.length === 0) errors.push(`${p.slug}: no images`)
    for (const img of p.images) {
      const f = new URL(`../public${img.src}`, import.meta.url)
      const s = await stat(f).catch(() => null)
      if (!s || s.size < 5 * 1024) errors.push(`${p.slug}: bad image file ${img.src}`)
    }
  }
  if (errors.length) {
    console.error('\nMIGRATION INCOMPLETE:')
    for (const e of errors) console.error('  ✗ ' + e)
    process.exit(1)
  }
  console.log(`\nAll ${projects.length} projects migrated with titles, descriptions, and images.`)
}

main()
