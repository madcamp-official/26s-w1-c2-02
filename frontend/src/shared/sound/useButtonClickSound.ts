import { useEffect } from 'react';
import { playButtonClickSound } from './soundManager';

// Mounted once (App.tsx). A single delegated listener catches clicks on any
// <button> anywhere in the app — new buttons get the sound automatically,
// no per-button wiring needed. Disabled buttons don't dispatch click events,
// so no extra check is needed for that case.
export function useButtonClickSound() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest('button')) {
        playButtonClickSound();
      }
    }

    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, []);
}
