import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { escape } from '../base/run-site'
import { iconHead } from '../base/icon-head'
import { identity } from '../identity'

// The run site's own pages (the homepage and the docs) as complete documents:
// Base's icon links, Latchkey's two faces preloaded, the theme's tokens, the
// compiled site stylesheet, and the share card for links posted elsewhere.

const SHARE_IMAGE = `${identity.runSite}/site/share.jpg`
const FONTS = ['/fonts/geist/geist-latin-wght.woff2', '/fonts/jetbrains-mono/jetbrains-mono-latin-wght.woff2']

export function siteDocument({ title, description, styles, body, script }: { title: string; description: string; styles: string[]; body: ReactElement; script?: string }): string {
  const head = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + `<title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta name="theme-color" content="#fd6415">`
    + `<meta property="og:type" content="website"><meta property="og:site_name" content="Latchkey"><meta property="og:title" content="${escape(title)}">`
    + `<meta property="og:description" content="${escape(description)}"><meta property="og:image" content="${SHARE_IMAGE}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`
    + '<meta name="twitter:card" content="summary_large_image">'
    + iconHead
    + FONTS.map(href => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin>`).join('')
    + `<link rel="stylesheet" href="${escape(identity.fonts!)}"><link rel="stylesheet" href="${escape(identity.theme)}">`
    + styles.map(href => `<link rel="stylesheet" href="${escape(href)}">`).join('')
  return `<!doctype html><html lang="en"><head>${head}</head><body>${renderToStaticMarkup(body)}${script ? `<script>${script}</script>` : ''}</body></html>`
}
