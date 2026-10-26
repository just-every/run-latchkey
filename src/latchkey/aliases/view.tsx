// Shared wording and the provider-token field for the alias screens.
const explanations: Record<string, string> = {
 provider_authorization: 'The provider refused this token. Check that it can edit Email Routing for this zone and account.',
 provider_rate_limited: 'The provider is rate limiting requests. Nothing changed; try again shortly.',
 provider_unavailable: 'The provider did not answer correctly, so the change may or may not have been made. Check the alias before relying on it.',
 provider_unreachable: 'The provider could not be reached, so the change may or may not have been made. Check the alias before relying on it.',
 provider_response_malformed: 'The provider answered in an unexpected way, so the change may or may not have been made. Check the alias before relying on it.',
 provider_rejected: 'The provider rejected the request. Nothing changed.',
 provider_rule_missing: 'The provider has no rule for this alias.',
 provider_target_mismatch: 'The provider forwards this alias somewhere other than the approved mailbox. Fix it at the provider.',
 provider_state_mismatch: 'The provider does not show the change Latchkey asked for. Check the alias at the provider.',
 alias_domain_unavailable: 'The forwarding domain is not ready at the provider. Check it again first.',
 alias_mailbox_unavailable: 'That mailbox is no longer approved.',
 alias_mailbox_unverified: 'The provider has not verified that mailbox yet. Open the message the provider sent to it.',
 alias_mailbox_scope_refused: 'Work aliases forward only to approved company mailboxes, and personal aliases only to your own.',
 alias_forwarding_change_denied: 'You are not allowed to change this alias’s forwarding.',
 alias_admin_required: 'Only the installation owner can change company aliases.',
 alias_exists: 'This login already has a live alias. Replace it instead.',
 alias_result_not_saved: 'The provider answered but Latchkey could not record the result. Reload and check the alias before using it.',
};
export const aliasMessage = (error: any) => explanations[error?.code] ?? (typeof error?.code === 'string' ? error.code.replaceAll('_', ' ') : 'The alias action could not finish.');
export const when = (value?: number | null) => value ? new Date(value).toLocaleString() : 'not yet';
export const deliveryText = (state: string, at?: number | null) => ({
 unconfirmed: 'Mail arrival not confirmed', 'received-reported': `Arrival reported by you ${when(at)}`, 'not-received-reported': `Reported not received ${when(at)}`, 'forwarding-stopped': 'Forwarding stopped at the provider', 'not-configured': 'Not configured at the provider',
}[state] ?? state);
export function TokenField({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
 return <label>Cloudflare API token<input type="password" autoComplete="off" spellCheck={false} disabled={disabled} value={value} onChange={event => onChange(event.target.value)}/><small className="muted">Used from this tab only and never sent to Latchkey.</small></label>;
}
