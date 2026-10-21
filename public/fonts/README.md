# Fonts

Latchkey's look (design desk, 20 and 21 October 2026) uses one heavy grotesk
and one monospace. Both are self-hosted under the SIL Open Font License 1.1,
with no Reserved Font Name, and `fonts.css` declares them once.

| Face | File | Use | Source | Licence |
| --- | --- | --- | --- | --- |
| Geist, weights 400 to 900 | `geist/geist-latin-wght.woff2` | headings, the wordmark, sentences | `ofl/geist/Geist[wght].ttf` in github.com/google/fonts (upstream github.com/vercel/geist-font) | `geist/OFL.txt` |
| JetBrains Mono, weights 400 to 800 | `jetbrains-mono/jetbrains-mono-latin-wght.woff2` | records, annotations, code | `ofl/jetbrainsmono/JetBrainsMono[wght].ttf` in github.com/google/fonts (upstream github.com/JetBrains/JetBrainsMono) | `jetbrains-mono/OFL.txt` |

Both files are variable WOFF2 subsets made with fontTools: the weight axis is
limited to the range above and the character set to Basic Latin, Latin-1,
general punctuation, the arrows, the minus sign and the euro and trade marks.
The JetBrains Mono file is a modified version: it adds two glyphs the original
does not have, U+2713 CHECK MARK (the page's success mark) and U+2717 BALLOT X
(its one failure), drawn for Latchkey on the font's 600-unit cell, and drops
the HVAR table (every advance is 600 at every weight). Rebuild them from the
sources above with the same unicode ranges when a page needs another character.

`outfit/outfit-latin-wght-normal.woff2` (SIL OFL 1.1, `outfit/LICENSE.txt`) is
Base's default face. Latchkey's styles do not use it; it stays only because
Base's shared sign-in and setup heads (`src/base/font-head.ts`, owned by Base)
preload that file.
