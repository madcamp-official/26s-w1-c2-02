// Filenames matched to what's actually in frontend/public/sound_effect/ —
// add a file there and its path here to add more variety to a pool. These
// were delivered as .mov (QuickTime) containers wrapping a single audio
// track; <audio> can't reliably play .mov, so they were extracted to AAC
// .m4a via `afconvert -f m4af -d aac`.
const CRACK_SOUND_URLS = [
  '/sound_effect/wakppu_crack/wakppu_crack_1.m4a',
  '/sound_effect/wakppu_crack/wakppu_crack_2.m4a',
  '/sound_effect/wakppu_crack/wakppu_crack_3.m4a',
  '/sound_effect/wakppu_crack/wakppu_crack_4.m4a',
  '/sound_effect/wakppu_crack/wakppu_crack_5.m4a',
  '/sound_effect/wakppu_crack/wakppu_crack_6.m4a',
  '/sound_effect/wakppu_crack/wakppu_crack_7.m4a'
];

const SQUEEZE_SOUND_URLS = [
  '/sound_effect/wakppu_squeeze/wakppu_squeeze_1.m4a',
  '/sound_effect/wakppu_squeeze/wakppu_squeeze_2.m4a',
  '/sound_effect/wakppu_squeeze/wakppu_squeeze_3.m4a'
];

// glass_004.ogg is intentionally absent here — the file was already missing
// from frontend/public/sound_effect/button_click/ (not something deleted in
// this repo), so it's dropped from the pool instead of 404ing 1/6 of clicks.
const BUTTON_CLICK_SOUND_URLS = [
  '/sound_effect/button_click/glass_001.ogg',
  '/sound_effect/button_click/glass_002.ogg',
  '/sound_effect/button_click/glass_003.ogg',
  '/sound_effect/button_click/glass_005.ogg',
  '/sound_effect/button_click/glass_006.ogg'
];

// Four BGM tracks were delivered; one is picked at random per session when the
// singleton audio is first created (see getBgmAudio).
const BGM_URLS = [
  '/sound_effect/bgm/bgm1.mp3',
  '/sound_effect/bgm/bgm2.mp3',
  '/sound_effect/bgm/bgm3.mp3',
  '/sound_effect/bgm/bgm4.mp3'
];

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// A fresh Audio() per call, never reused — overlapping plays (crack+squeeze
// together, or two clicks in quick succession) shouldn't cut each other off.
// play() rejects on autoplay-policy or decode errors; sound is non-critical,
// so failures are silently swallowed rather than surfaced to the user.
function playOneShot(url: string, volume: number) {
  const audio = new Audio(url);
  audio.volume = volume;
  void audio.play().catch(() => {});
}

// Squeeze plays every time a piece is touched/pressed (before any crack
// judgement). Crack plays separately, only when a piece actually pops (its
// break is registered) — see WakppuballViewer.tsx.
export function playWakppuballSqueezeSound() {
  playOneShot(pickRandom(SQUEEZE_SOUND_URLS), 0.8);
}

export function playWakppuballCrackSound() {
  playOneShot(pickRandom(CRACK_SOUND_URLS), 0.8);
}

export function playButtonClickSound() {
  playOneShot(pickRandom(BUTTON_CLICK_SOUND_URLS), 0.5);
}

// Singleton element: toggling on/off controls one looping track instead of
// stacking a new one each time.
let bgmAudio: HTMLAudioElement | null = null;
function getBgmAudio(): HTMLAudioElement {
  if (!bgmAudio) {
    bgmAudio = new Audio(pickRandom(BGM_URLS));
    bgmAudio.loop = true;
    bgmAudio.volume = 0.35;
  }
  return bgmAudio;
}

export function playBgm() {
  void getBgmAudio().play().catch(() => {});
}

export function pauseBgm() {
  getBgmAudio().pause();
}
