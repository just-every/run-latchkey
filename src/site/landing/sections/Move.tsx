import { Screen } from '../parts'
import { move } from '../records'

// 08: the switcher's question, answered by one equation and its label.
export function Move() {
  return (
    <Screen ground="tangerine" className="move" titleId="move-title">
      <h2 className="screen-title" id="move-title">The move from 1Password, <br className="desk" />item&nbsp;for&nbsp;item.</h2>
      <p className="screen-line">Every vault, group, two-factor code and secret reference came across, and the counts matched before the old accounts closed.</p>
      <div className="screen-proof equation">
        <p className="equation-sum">{move.items} = {move.items}</p>
        <p className="equation-label"><span className="leader-h" aria-hidden="true" /><span className="seg">items in 1Password ·</span> <span className="seg">items in Latchkey ·</span> <span className="seg">{move.closed} ✓</span></p>
      </div>
    </Screen>
  )
}
