import { escape } from '../base/run-site'
import run from './run.json'
import { marks, type Ground } from './shell/Lockup'

// Base's shared Run, contract and not-found pages (src/base, copied unchanged)
// wearing the run site's chrome: the compiled site stylesheet after Base's own
// style, the page's ground on <body>, and the mark drawn for that ground (on
// tangerine the last tooth turns white; on black the key does).

// The installer line keeps its address and "| sh" together, so a narrow screen never starts a line with the pipe.
const installer = 'https://runeditrun.com/install.sh | sh'
// The facts line's licence ("· MIT license") stays whole, and moves to its own line without the separator on a phone.
const licence = `</a> · ${escape(run.licence)} license</p>`

export function sitePage(html: string, page: 'run' | 'contract' | 'not-found', ground: Ground, styles: string[]): string {
  for (const marker of ['</head>', '<body>', 'src="/brand/mark.svg"', ...(page === 'run' ? [`${installer}</code>`, licence] : [])]) if (!html.includes(marker)) throw new Error(`Base's ${page} page no longer has ${marker}; update src/site/base-pages.ts.`)
  return html
    .replace(`${installer}</code>`, `<span class="code-word">${installer}</span></code>`)
    .replace(licence, `</a><span class="lk-licence"><span class="lk-licence-sep"> · </span>${escape(run.licence)} license</span></p>`)
    .replace('</head>', `${styles.map(href => `<link rel="stylesheet" href="${href}">`).join('')}</head>`)
    .replace('<body>', `<body class="lk-base lk-${page}" data-ground="${ground}">`)
    .replaceAll('src="/brand/mark.svg"', `src="${marks[ground]}"`)
}
