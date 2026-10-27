# Quarterly review results

In Settings, open Security rules and create a Recurring review with Calendar
quarter (UTC) recurrence. Preview the exact item versions, recipient and optional
group and project constraints, then save and activate that version.

When a quarterly obligation opens, choose **Find matching campaigns**. The list
contains owner-led access reviews for the same company vault and assigned lead
reviewer, scheduled and due within that obligation's quarter. These campaigns
review the full vault; they also cover the rule's narrower target constraints.
Review the displayed rule version, slot, vault, group, project and reviewer, then
explicitly confirm and bind the selected campaign. A campaign can back only one
obligation. Binding neither records a review decision nor removes a grant.

Complete the campaign in Access reviews. Every grant needs its own authorized
decision. Apply removal decisions and reconcile changed access before closing.
Independent review remains required for a person's own access. An unfinished
campaign cannot complete a security-rule obligation.

The scheduler reconciles bound campaigns after restart as well as during normal
runs. **Observe closed review result** checks the same observed state on demand.
Completion requires a closed campaign, all decisions, no pending removals and
currently effective removal outcomes. Future, approval-pending and temporarily
inactive grants still retain authority and must be removed; their current lack
of access does not complete a removal decision. A closed report that predates
that removal stays incomplete until the retained grant is revoked. Rule version, run slot, vault authority,
reviewer access, target versions and scope are checked again. Editing or
cancelling a rule prevents completion of its superseded or cancelled obligations.
Repeated or concurrent observation retains one result and one completion event.

Archives retain historical bindings and results, with rules, obligations and
bindings inactive on restore. They cannot resume scheduling or completion from
restored authority. Person erasure removes affected campaign bindings and
inactivates their retained obligations; erasing a target removes its rule history
and bindings through the reviewed item-erasure flow.

A closed access review proves the product's observed access decisions and
removals. It does not prove provider remediation or provider execution. Provider
outcomes remain unknown, and notification delivery is tracked separately.
