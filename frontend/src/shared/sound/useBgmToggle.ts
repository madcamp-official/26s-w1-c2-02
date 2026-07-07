import { useState } from 'react';
import { pauseBgm, playBgm } from './soundManager';

// Starts paused: browsers block audio-with-sound autoplay without a user
// gesture anyway, so there'd be nothing to resume even if this remembered
// "was on" across a reload.
export function useBgmToggle() {
  const [isOn, setIsOn] = useState(false);

  function toggle() {
    setIsOn((prev) => {
      const next = !prev;
      if (next) {
        playBgm();
      } else {
        pauseBgm();
      }
      return next;
    });
  }

  return { isOn, toggle };
}
