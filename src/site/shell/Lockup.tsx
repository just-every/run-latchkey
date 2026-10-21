// The mark beside the "Latchkey" wordmark. Each ground has its own drawing of
// the mark: on tangerine the last tooth turns white, on black the key does.
export type Ground = 'tangerine' | 'black'

const marks: Record<Ground, string> = { tangerine: '/brand/mark-on-tangerine.svg', black: '/brand/mark-on-black.svg' }

export function Lockup({ ground }: { ground: Ground }) {
  return (
    <a className="lockup" href="/">
      <img className="lockup-mark" src={marks[ground]} alt="" width={248} height={100} />
      <span className="lockup-word">Latchkey</span>
    </a>
  )
}
