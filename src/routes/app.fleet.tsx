import { createFileRoute } from '@tanstack/react-router';
import { FleetScreen } from '../latchkey/msp/ui';

export const Route = createFileRoute('/app/fleet')({
 head: () => ({ meta: [{ title: 'Company fleet · Latchkey' }] }),
 component: FleetScreen,
});
