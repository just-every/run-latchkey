import { Agent } from './sections/Agent'
import { BankLogin } from './sections/BankLogin'
import { Close } from './sections/Close'
import { DeadKey } from './sections/DeadKey'
import { Hero } from './sections/Hero'
import { Leak } from './sections/Leak'
import { Leaver } from './sections/Leaver'
import { Move } from './sections/Move'
import { SecretsOut } from './sections/SecretsOut'

// The homepage: nine screens, each one viewport, grounds alternating tangerine
// and black (design desk page round 2, 21 Oct 2026).
export function Landing() {
  return (
    <main className="landing">
      <Hero />
      <Leak />
      <DeadKey />
      <Leaver />
      <BankLogin />
      <Agent />
      <SecretsOut />
      <Move />
      <Close />
    </main>
  )
}
