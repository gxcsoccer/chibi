/**
 * Chibi CLI Entry Point
 */

import { main } from '../src/cli/index.js';

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
