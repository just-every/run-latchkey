import { createFileRoute } from '@tanstack/react-router';
import { VaultScreen } from '../latchkey/ui/vault';

export const Route = createFileRoute('/app/vault')({
 head: () => ({ meta: [{ title: 'Vault · Latchkey' }] }),
 component: VaultScreen,
});
