# Your password health findings

Open Password health in Settings after unlocking a permitted vault. Health checks
run in your client. Unknown feed coverage stays unknown, and a changed vault
requires a fresh check.

A member with current read access can snooze or dismiss their own findings.
Enter a reason and, for a snooze, a future time. This does not grant permission
to edit the item or administer the vault. Another member or the vault owner has
an independent suppression history. Underlying risk totals do not decrease.

Your suppression history retains each actor-signed encrypted observation and reason.
Finding categories and reasons stay inside that encrypted payload. Snoozes
expire; a changed item version, key epoch or account generation invalidates the
old suppression. Losing read access prevents subsequent history reads and
suppression changes. Previously decrypted copies cannot be recalled.

Earlier observations stored in shared vault records remain visible as inactive
history. Those records cannot verify the person named as their actor, so they
cannot suppress a finding. Record a new personal decision after reviewing it.

Installation archives retain encrypted history, with all restored suppressions
inactive. Destination vault access does not transfer another actor's private
history or activate their decisions. Erasing an item removes its suppression
records. Owner-reviewed person erasure removes that actor's records and records
replay fences in the later erasure journal. Another owner's encrypted content
is not automatically redacted, and external copies remain outstanding.

These controls record your review decision. They do not verify provider password
changes, prove remediation, or establish a complete historical security audit.
