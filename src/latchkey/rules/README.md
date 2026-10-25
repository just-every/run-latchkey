# Security rules

Open Settings, then Security rules in the unlocked vault console. Select an
explicit item version and a currently authorized vault recipient. Preview the
exact target, recipient, severity, maintenance window and effect bound. Save
an inactive version, preview that saved version, then explicitly activate it.
The current console uses fixed-duration recurrence, including a 90-day review
preset; this does not claim calendar-quarter scheduling.

The service accepts only expiry, review, rotation and owner-observed anomaly
metadata. It cannot read encrypted values or independently detect an anomaly.
Unknown fields and effect types refuse. No rule changes rights, authentication,
recovery administrators or export policy. Each run has zero external effects;
notifications are assigned in-app obligations. External delivery is LKY-040.

The existing CLI also accepts `latchkey rules` with a private profile and password
on standard input, plus an `action` and its `input` object. Actions are `list`,
`get`, `preview`, `save`, `activate`, `cancel`, `decide`, `complete` and `inbox`.
The authenticated protocol uses these names beneath the rules namespace.
Read the request fields in [service.mjs](./service.mjs).

Scheduling requires the caller’s explicit event timestamp. Version and slot
uniqueness fences concurrent delivery and restart. Missed windows and changed
target versions or recipient authority produce inspectable suspended runs,
without silently proceeding. Edits preserve old definitions and decisions,
invalidate outstanding approvals and require a new exact activation preview.
Cancellation stops scheduling and queued obligations; restarting the same
version does not repeat an already recorded slot.

Rotation approval only prepares an exact proposal. Recording completion needs
an observed newer encrypted item version and leaves provider verification
unknown. Rule edits invalidate queued approvals. Actual provider execution,
complete review outcomes and broader scoping remain in LKY-054’s Gap.

Records includes rules, immutable versions, runs and decisions. Import forces
rules inactive and obligations inactive; it does not revive approval authority.
Person erasure removes affected templates and their execution records. Item
erasure removes templates referring to that item, including historical versions,
so they cannot schedule it again.
