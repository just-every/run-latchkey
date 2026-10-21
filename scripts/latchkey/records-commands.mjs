import { sealRecordsArchive, openRecordsArchive } from '../../src/latchkey/portability/archive.mjs';
import { planDestinationRewrap, approveDestinationRewrap, verifyDestinationRewrap } from '../../src/latchkey/portability/rewrap.mjs';

// The caller owns stdin parsing, unlock and private result-file custody. Keys
// and signatures never become command arguments or stdout values here.
export async function recordsCommand(command, input, { client } = {}) {
 switch (command) {
  case 'records-seal': return sealRecordsArchive(input);
  case 'records-open': return openRecordsArchive(input);
  case 'records-rewrap-plan': return planDestinationRewrap(input);
  case 'records-rewrap-approve': return approveDestinationRewrap({ ...input, client });
  case 'records-rewrap-verify': return verifyDestinationRewrap(input);
  default: throw Error('unknown_records_command');
 }
}
export { sealRecordsArchive, openRecordsArchive, planDestinationRewrap, approveDestinationRewrap, verifyDestinationRewrap };
