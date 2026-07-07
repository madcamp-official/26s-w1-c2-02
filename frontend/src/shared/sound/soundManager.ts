// Filenames matched to what's actually in frontend/public/sound_effect/ —
// add a file there and its path here to add more variety to a pool. The 4th
// crack sound started as a .flac (Safari doesn't reliably play that in
// <audio>) and was converted to PCM16 .wav via `afconvert -f WAVE -d LEI16`.
const CRACK_SOUND_URLS = [
  '/sound_effect/wakppu_crack/150479__davdud101__egg-crack.mp3',
  '/sound_effect/wakppu_crack/627927__pandartb3d__smashed-egg.wav',
  '/sound_effect/wakppu_crack/703115__franzzle__crush1.wav',
  '/sound_effect/wakppu_crack/624163__wwstudioswastaken__ice_cracking_01.wav'
];

const SQUEEZE_SOUND_URLS = [
  '/sound_effect/wakppu_squeeze/433839__archos__slime-28.wav',
  '/sound_effect/wakppu_squeeze/589613__mrfossy__sfx_squelch_squeeze_short_35.wav',
  '/sound_effect/wakppu_squeeze/589835__mrfossy__sfx_squelch_slayer_214.wav',
  '/sound_effect/wakppu_squeeze/590032__mrfossy__sfx_squelch_slayer_impulse_164.wav'
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

const BGM_URL = '/sound_effect/bgm/delosound-ambient-background-339939.mp3';

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

// Touching a piece plays one crack sound and one squeeze sound together, so
// the combination varies every time (3 x 4 = 12 possible pairs).
export function playWakppuballTouchSound() {
  playOneShot(pickRandom(CRACK_SOUND_URLS), 0.8);
  playOneShot(pickRandom(SQUEEZE_SOUND_URLS), 0.8);
}

export function playButtonClickSound() {
  playOneShot(pickRandom(BUTTON_CLICK_SOUND_URLS), 0.5);
}

// Singleton element: toggling on/off controls one looping track instead of
// stacking a new one each time.
let bgmAudio: HTMLAudioElement | null = null;
function getBgmAudio(): HTMLAudioElement {
  if (!bgmAudio) {
    bgmAudio = new Audio(BGM_URL);
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
