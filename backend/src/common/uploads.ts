import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));

// Lives next to dist/ (not inside it), so a rebuild/redeploy never wipes
// user-uploaded skins. TODO(Phase 8-B+): swap for S3 per infra/aws-notes.md
// once that's actually wired up — only this path + the upload route's write
// step should need to change.
export const uploadsDir = join(currentDir, '../../uploads');
export const skinsDir = join(uploadsDir, 'skins');
