// The mark beside the "Latchkey" wordmark. Each ground has its own drawing of
// the mark: on tangerine the last tooth turns white, on black the key does,
// and on the app's white ground the key is black with its tangerine tooth.
export type Ground = 'tangerine' | 'black' | 'white'

export const marks: Record<Ground, string> = { tangerine: '/brand/mark-on-tangerine.svg', black: '/brand/mark-on-black.svg', white: '/brand/mark.svg' }

export function Lockup({ ground, href = '/' }: { ground: Ground; href?: string }) {
  return (
    <a className="lockup" href={href}>
      <img className="lockup-mark" src={marks[ground]} alt="" width={248} height={100} />
      <span className="lockup-word">Latchkey</span>
    </a>
  )
}
