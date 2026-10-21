import { Screen } from '../parts'
import { bankFills, bankLogin } from '../records'

// 05: sharing without seeing. One vault item hangs in the right half as a
// three-row hairline record with no box.
export function BankLogin() {
  return (
    <Screen ground="black" className="bank" titleId="bank-title">
      <h2 className="screen-title" id="bank-title">The bank login <br className="desk" />four people fill.</h2>
      <p className="screen-line">Finance signs in to Chase through Latchkey, and none of the four can reveal, copy or export the password.</p>
      <div className="screen-proof vault-item">
        <p className="vault-title">{bankLogin.title}</p>
        <p className="vault-row"><span>password</span> <span className="vault-bullets" role="img" aria-label="hidden">{'•'.repeat(16)}</span></p>
        <p className="vault-row vault-use"><span className="seg">fill only ·</span> <span className="seg">{bankLogin.people} people ·</span> <span className="seg">{bankFills} fills in {bankLogin.month} ·</span> <span className="seg">{bankLogin.reveals} reveals ✓</span></p>
      </div>
    </Screen>
  )
}
