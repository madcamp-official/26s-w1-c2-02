import { useState } from 'react';
import { getStoredBgmTrack, setBgmTrack as applyBgmTrack, storeBgmTrack, type BgmTrackId } from './soundManager';

// Unlike useColorTheme, the pick isn't applied via a mount-time effect —
// that would eagerly create (and start fetching) the BGM <audio> element the
// instant this hook mounts, even for a user who never turns BGM on. Applying
// inline in setTrack keeps creation lazy, matching useBgmToggle's existing
// lazy-singleton behavior (see soundManager.ts's getBgmAudio).
export function useBgmTrack() {
  const [track, setTrackState] = useState<BgmTrackId>(() => getStoredBgmTrack());

  function setTrack(next: BgmTrackId) {
    setTrackState(next);
    storeBgmTrack(next);
    applyBgmTrack(next);
  }

  return { track, setTrack };
}
