import { Screen } from '../parts'
import { leak } from '../records'

// 03, the interlude: the leaked key alone, struck through, and the one line
// that says it is dead.
export function DeadKey() {
  return (
    <Screen ground="black" className="dead-key" label="The leaked key, revoked">
      <p className="dead-string"><s><span>{leak.keyStart}</span><span>{leak.keyEnd}</span></s></p>
      <span className="dead-drop" aria-hidden="true" />
      <p className="dead-line"><span className="seg">revoked {leak.day} ·</span> <span className="seg">{leak.revoked} pm ·</span> <span className="seg">refused by AWS {leak.awsRefused} ✓</span></p>
    </Screen>
  )
}
