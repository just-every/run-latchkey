import type { ReactNode } from 'react'
import { type Ground } from '../shell/Lockup'
import { paths } from '../shell/links'
import { GroundPlate } from './GroundPlate'

// The shared pieces of the nine screens: one viewport each on a flat tangerine
// or black ground, a heading, at most one sentence and one proof.

export function Screen({ ground, className, label, titleId, leaders, children }: {
  ground: Ground; className: string; label?: string; titleId?: string; leaders?: boolean; children: ReactNode
}) {
  return (
    <section className={`screen ${className}`} data-ground={ground} aria-label={label} aria-labelledby={titleId} data-leaders={leaders ? '' : undefined}>
      {ground === 'tangerine' ? <GroundPlate /> : null}
      {children}
      {leaders ? <svg className="leaders" aria-hidden="true" focusable="false" /> : null}
    </section>
  )
}

/**
 * One end of a leader drawn by the leaders script (leaders.ts) from `from` to
 * the element marked `to` with the same name. `at` is the point inside the
 * element's first box, as fractions of its width and height.
 */
export function From({ name, at, children }: { name: string; at: string; children: ReactNode }) {
  return <span className="leader-from" data-leader-from={name} data-at={at}>{children}</span>
}
export function To({ name, at = '0 0' }: { name: string; at?: string }) {
  return <span className="leader-to" data-leader-to={name} data-at={at} aria-hidden="true" />
}

/** The square white "Run Latchkey →" button. */
export function RunButton() {
  return <a className="run-button" href={paths.run}>Run Latchkey <span aria-hidden="true">→</span></a>
}

/** "Read the docs", underlined. */
export function DocsLink() {
  return <a className="text-link" href={paths.docs}>Read the docs</a>
}
