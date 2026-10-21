import type { Ground } from './shell/Lockup'

// Base's shared Run, contract and not-found pages (src/base, copied unchanged)
// wearing the run site's chrome: the compiled site stylesheet after Base's own
// style, the page's ground on <body>, and the mark drawn for that ground (on
// tangerine the last tooth turns white; on black the key does).

const marks: Record<Ground, string> = { tangerine: '/brand/mark-on-tangerine.svg', black: '/brand/mark-on-black.svg' }

// The installer line keeps its address and "| sh" together, so a narrow screen never starts a line with the pipe.
const installer = 'https://runeditrun.com/install.sh | sh'

export function sitePage(html: string, page: 'run' | 'contract' | 'not-found', ground: Ground, styles: string[]): string {
  for (const marker of ['</head>', '<body>', 'src="/brand/mark.svg"', ...(page === 'run' ? [`${installer}</code>`] : [])]) if (!html.includes(marker)) throw new Error(`Base's ${page} page no longer has ${marker}; update src/site/base-pages.ts.`)
  return html
    .replace(`${installer}</code>`, `<span class="code-word">${installer}</span></code>`)
    .replace('</head>', `${styles.map(href => `<link rel="stylesheet" href="${href}">`).join('')}</head>`)
    .replace('<body>', `<body class="lk-base lk-${page}" data-ground="${ground}">`)
    .replaceAll('src="/brand/mark.svg"', `src="${marks[ground]}"`)
}
