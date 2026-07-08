import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  type ReactNode
} from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../shared/api/http';
import { useAuth } from '../../shared/auth/AuthContext';
import { CampusMatchBadge, TierBadge } from '../../shared/badges/Badges';
import { validateUsername } from '../../shared/validation/credentials';
import { fetchMe, renameUsername, type MeResponse } from '../auth/authApi';
import { getCollection, selectMainWakppuball, type CollectionItem } from '../collection/collectionApi';
import { getLeaderboard, type LeaderboardResponse, type TierName } from '../leaderboard/leaderboardApi';
import {
  cancelMatchQueue,
  enterMatchQueue,
  getMatchStatus,
  type MatchedResult,
  type MatchQueueBody,
  type MatchStatusResult
} from '../matching/matchingApi';
import {
  createWakppuball,
  getMainWakppuball,
  renameCreatedWakppuball,
  uploadWakppuballSkin,
  type MainWakppuball
} from './wakppuballApi';
import { DEFAULT_CUSTOMIZATION, DEFAULT_FRACTURE } from './wakppuballDefaults';
import { WakppuballView } from './WakppuballView';
// The main-screen interaction stage is the one place a wakppuball renders in 3D
// (see docs/3d-interaction.md) with piece-level crack/press/squash; collection
// tiles, the create preview, and match results stay on WakppuballView's CSS
// fallback (SHAPE_MODEL_ASSETS is intentionally left empty so those call sites
// don't pick up a 3D render).
import { WakppuballViewer, type WakppuballViewerHandle } from './WakppuballViewer';
import { useBgmToggle } from '../../shared/sound/useBgmToggle';
import { useBgmTrack } from '../../shared/sound/useBgmTrack';
import { BGM_TRACK_IDS } from '../../shared/sound/soundManager';
import { useColorTheme } from '../../shared/theme/useColorTheme';
import {
  THEME_IDS,
  type ThemeHue,
  type ThemeTone
} from '../../shared/theme/themeManager';
import type { WakppuballCustomization, WakppuballFracture, WakppuballPattern } from './wakppuballTypes';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'success'; wakppuball: MainWakppuball };

type AsyncState<T> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; data: T };

type MatchView =
  | { kind: 'idle' }
  | { kind: 'loading'; message: string }
  | { kind: 'waiting'; queueId: string; enteredAt: string }
  | { kind: 'matched'; result: MatchedResult; collectionCount: number }
  | { kind: 'error'; message: string };

type ModalKind = 'profile' | 'collection' | 'leaderboard' | 'theme' | 'bgm' | null;
type MeUser = MeResponse['user'];
type LeaderboardMetric = 'breakCount' | 'distinctMatchedUsers';

const MODAL_TITLES: Record<Exclude<ModalKind, null>, string> = {
  profile: '내 정보',
  collection: '내 컬렉션',
  leaderboard: '리더보드',
  theme: '테마 선택',
  bgm: '배경음악 선택'
};

// Percentile meaning of each tier, best→worst — kept in sync with the cutoffs
// in backend/src/modules/stats/tiers.ts (computeTier). Shown as a legend in
// the leaderboard popup so users know what each badge shape represents.
const TIER_PERCENTILE_LEGEND: { tier: TierName; label: string }[] = [
  { tier: 'MASTER', label: '상위 5%' },
  { tier: 'RUBY', label: '상위 5~10%' },
  { tier: 'DIAMOND', label: '상위 10~20%' },
  { tier: 'EMERALD', label: '상위 20~40%' },
  { tier: 'GOLD', label: '상위 40~60%' },
  { tier: 'SILVER', label: '상위 60~80%' },
  { tier: 'BRONZE', label: '하위 20%' }
];

const THEME_HUE_LABELS: Record<ThemeHue, string> = {
  red: '빨강',
  orange: '주황',
  yellow: '노랑',
  green: '초록',
  blue: '파랑',
  navy: '남색',
  purple: '보라'
};

const THEME_TONE_LABELS: Record<ThemeTone, string> = {
  normal: '기본',
  pastel: '파스텔'
};
type MatchLocation = Pick<MatchQueueBody, 'latitude' | 'longitude'>;
// Viewport point (usually a trigger button's center) the popup animates in from.
type PopOrigin = { x: number; y: number };

// GET /matching/status keeps returning the same MATCHED entry forever (there's
// no separate confirm step to consume it — see CLAUDE.md), so the mount-time
// recovery effect below would otherwise reopen the exact same "매칭됐어요!"
// popup on every single visit to the main screen, not just right after a real
// match. This remembers the last matchId actually shown so a *reload* doesn't
// resurface it, while a genuinely new match (via active polling or a direct
// queue response) always still shows — those call sites don't consult this.
const LAST_SEEN_MATCH_ID_STORAGE_KEY = 'wakppuball.lastSeenMatchId';

function hasSeenMatch(matchId: string): boolean {
  return localStorage.getItem(LAST_SEEN_MATCH_ID_STORAGE_KEY) === matchId;
}

function markMatchSeen(matchId: string) {
  localStorage.setItem(LAST_SEEN_MATCH_ID_STORAGE_KEY, matchId);
}

// Persisted (not just React state) so the "내 컬렉션" notification dot
// survives a reload — it should stay lit until the user actually opens the
// collection, not just until the next mount.
const COLLECTION_HAS_UNSEEN_STORAGE_KEY = 'wakppuball.collectionHasUnseen';

function getCollectionHasUnseen(): boolean {
  return localStorage.getItem(COLLECTION_HAS_UNSEEN_STORAGE_KEY) === 'true';
}

function storeCollectionHasUnseen(value: boolean) {
  if (value) {
    localStorage.setItem(COLLECTION_HAS_UNSEEN_STORAGE_KEY, 'true');
  } else {
    localStorage.removeItem(COLLECTION_HAS_UNSEEN_STORAGE_KEY);
  }
}

function getButtonCenter(event: MouseEvent<HTMLButtonElement>): PopOrigin {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// Positions a popup's CSS transform-origin at `origin` (a viewport point),
// expressed relative to the popup element's own box, so it visually expands
// out from the button that opened it.
function usePopOrigin(active: boolean, origin: PopOrigin | null, ref: { current: HTMLElement | null }) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !origin || !el) {
      return;
    }
    // The entrance animation's fill-mode applies its first-keyframe transform
    // (scale(0.04)) the instant the class takes effect — before this layout
    // effect runs. Measuring now would read that shrunk box, not the popup's
    // resting geometry, so neutralize the animation for the measurement and
    // restore it immediately after (still before the browser paints).
    const previousAnimation = el.style.animation;
    el.style.animation = 'none';
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--pop-origin-x', `${origin.x - rect.left}px`);
    el.style.setProperty('--pop-origin-y', `${origin.y - rect.top}px`);
    el.style.animation = previousAnimation;
  }, [active, origin, ref]);
}

function getCurrentLocation(): Promise<MatchLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('이 브라우저에서 위치 정보를 사용할 수 없습니다.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      () => {
        reject(new Error('매칭하려면 위치 정보 사용을 허용해야 합니다.'));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  });
}

// Phase 8-B: a cheap client-side pass before uploading a skin photo — the
// server re-resizes to at most 1024px regardless (wakppuballs.routes.ts), so
// this isn't relied on for correctness, just to avoid shipping a raw phone
// photo (often 4000px+) over the wire for no benefit.
async function downscaleImageFile(file: File, maxDimension: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) return file;
  return new File([blob], 'skin.jpg', { type: 'image/jpeg' });
}

function messageForMatchError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'MAIN_WAKPPUBALL_REQUIRED':
        return '매칭하려면 왁뿌볼을 먼저 만들어야 합니다.';
      case 'ALREADY_IN_QUEUE':
        return '이미 매칭 대기 중이에요.';
      default:
        return error.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '매칭 요청에 실패했습니다.';
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Z" />
      <path d="M4.75 20.25c.82-3.25 3.35-5.1 7.25-5.1s6.43 1.85 7.25 5.1" />
    </svg>
  );
}

function IconPalette() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4.75c-4.14 0-7.25 3.25-7.25 7.25 0 3.35 2.3 5.5 4.5 5.5.9 0 1.35-.5 1.35-1.15 0-.55-.35-.9-.35-1.5 0-.7.55-1.15 1.3-1.15h1.5c2.6 0 4.7-1.85 4.7-4.6 0-2.9-2.6-4.35-5.75-4.35Z" />
      <circle cx="8.75" cy="10.5" r="0.9" />
      <circle cx="12" cy="8.25" r="0.9" />
      <circle cx="15.25" cy="10.5" r="0.9" />
    </svg>
  );
}

function IconLeaderboard() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.75 19.25v-6.5" />
      <path d="M12 19.25V4.75" />
      <path d="M16.25 19.25v-9.5" />
    </svg>
  );
}

function IconCollection() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 4.75h11a1.75 1.75 0 0 1 1.75 1.75v11a1.75 1.75 0 0 1-1.75 1.75h-11a1.75 1.75 0 0 1-1.75-1.75v-11A1.75 1.75 0 0 1 6.5 4.75Z" />
      <path d="M8.75 9.25h6.5" />
      <path d="M8.75 13h6.5" />
      <path d="M8.75 16.75h3.25" />
    </svg>
  );
}

function IconSpeakerOn() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.75 9.75h3l4.5-3.75v12l-4.5-3.75h-3z" />
      <path d="M16.25 9.25a3.5 3.5 0 0 1 0 5.5" />
      <path d="M18.5 7a6.75 6.75 0 0 1 0 10" />
    </svg>
  );
}

function IconSpeakerOff() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.75 9.75h3l4.5-3.75v12l-4.5-3.75h-3z" />
      <path d="m16.5 9.5 4 4" />
      <path d="m20.5 9.5-4 4" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6.75 6.75 10.5 10.5" />
      <path d="m17.25 6.75-10.5 10.5" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15.5 5.5 18.5 8.5" />
      <path d="M4.75 19.25 5.5 15.75 15.25 6 18 8.75 8.25 18.5Z" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.75 5.25H6.5a1.75 1.75 0 0 0-1.75 1.75v10a1.75 1.75 0 0 0 1.75 1.75h4.25" />
      <path d="M13.25 8.25 17 12l-3.75 3.75" />
      <path d="M8.75 12H17" />
    </svg>
  );
}

function IconButton({
  label,
  children,
  onClick,
  showBadge
}: {
  label: string;
  children: ReactNode;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  showBadge?: boolean;
}) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
      {showBadge && <span className="icon-button-badge" aria-hidden="true" />}
    </button>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="color-field" htmlFor={id}>
      <span>{label}</span>
      <span className="color-control">
        <span className="color-swatch" style={{ background: value }} />
        <input id={id} type="color" value={value} onChange={(event) => onChange(event.target.value)} />
      </span>
    </label>
  );
}

function SegmentButton<T extends string>({
  value,
  selected,
  children,
  onSelect,
  disabled
}: {
  value: T;
  selected: boolean;
  children: ReactNode;
  onSelect: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={selected ? 'segment-button selected' : 'segment-button'}
      onClick={() => onSelect(value)}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function MyWakppuballPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const [view, setView] = useState<ViewState>({ kind: 'loading' });
  const [activeModal, setActiveModal] = useState<ModalKind>(null);
  const [profileView, setProfileView] = useState<AsyncState<MeUser>>({ kind: 'idle' });
  const [collectionView, setCollectionView] = useState<AsyncState<CollectionItem[]>>({ kind: 'idle' });
  const [leaderboardView, setLeaderboardView] = useState<AsyncState<LeaderboardResponse>>({ kind: 'idle' });
  const [leaderboardMetric, setLeaderboardMetric] = useState<LeaderboardMetric>('breakCount');
  const [selectingMain, setSelectingMain] = useState(false);
  const [selectMainError, setSelectMainError] = useState<string | null>(null);
  const [editingBallName, setEditingBallName] = useState(false);
  const [ballNameDraft, setBallNameDraft] = useState('');
  const [renamingBall, setRenamingBall] = useState(false);
  const [renameBallError, setRenameBallError] = useState<string | null>(null);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [renamingUsername, setRenamingUsername] = useState(false);
  const [renameUsernameError, setRenameUsernameError] = useState<string | null>(null);
  const [matchOpen, setMatchOpen] = useState(false);
  const [hasUnseenCollectionUpdate, setHasUnseenCollectionUpdate] = useState(() => getCollectionHasUnseen());
  const [matchView, setMatchView] = useState<MatchView>({ kind: 'idle' });
  const [popOrigin, setPopOrigin] = useState<PopOrigin | null>(null);
  const [matchOrigin, setMatchOrigin] = useState<PopOrigin | null>(null);
  const modalSheetRef = useRef<HTMLElement | null>(null);
  const matchSheetRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<WakppuballViewerHandle>(null);
  const bgm = useBgmToggle();
  const bgmTrack = useBgmTrack();
  const colorTheme = useColorTheme();

  usePopOrigin(activeModal !== null, popOrigin, modalSheetRef);
  usePopOrigin(matchOpen, matchOrigin, matchSheetRef);

  const [name, setName] = useState('나의 왁뿌볼');
  const [outerColor, setOuterColor] = useState(DEFAULT_CUSTOMIZATION.outerColor);
  const [innerColor, setInnerColor] = useState(DEFAULT_CUSTOMIZATION.innerColor);
  const [pattern, setPattern] = useState<WakppuballPattern>({ type: 'preset', id: 'none' });
  // Uploading a skin photo is its own async operation, independent of the
  // ball-creation submit below (creating/createError) — separate Loading/
  // Error/Success states per screen, per CLAUDE.md.
  const [skinUploadState, setSkinUploadState] = useState<
    { kind: 'idle' } | { kind: 'uploading' } | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const skinFileInputRef = useRef<HTMLInputElement | null>(null);
  const [thicknessPreset, setThicknessPreset] =
    useState<WakppuballFracture['thicknessPreset']>('medium');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const patternSegment = pattern.type === 'preset' ? pattern.id : 'custom';
  const uploadingSkin = skinUploadState.kind === 'uploading';

  function handlePatternSegmentSelect(value: 'none' | 'dots' | 'stripes' | 'custom') {
    if (value === 'custom') {
      // Selecting/reselecting "내 사진" always opens the file picker — there's
      // no separate "browse" affordance, and re-picking is how you replace an
      // already-uploaded photo.
      skinFileInputRef.current?.click();
      return;
    }
    setPattern({ type: 'preset', id: value });
    setSkinUploadState({ kind: 'idle' });
  }

  async function handleSkinFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // clear so picking the same file again still fires onChange
    if (!file) return;

    setSkinUploadState({ kind: 'uploading' });
    try {
      const resized = await downscaleImageFile(file, 1600);
      const { imageUrl } = await uploadWakppuballSkin(resized);
      setPattern({ type: 'custom', imageUrl });
      setSkinUploadState({ kind: 'idle' });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '이미지 업로드에 실패했습니다.';
      setSkinUploadState({ kind: 'error', message });
    }
  }

  const load = useCallback(async () => {
    setView({ kind: 'loading' });
    try {
      const { wakppuball } = await getMainWakppuball();
      setView({ kind: 'success', wakppuball });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'MAIN_WAKPPUBALL_NOT_FOUND') {
        setView({ kind: 'empty' });
        return;
      }
      const message = error instanceof ApiError ? error.message : '왁뿌볼을 불러오지 못했습니다.';
      setView({ kind: 'error', message });
    }
  }, []);

  const loadCollection = useCallback(async () => {
    setCollectionView({ kind: 'loading' });
    try {
      const { items } = await getCollection();
      setCollectionView({ kind: 'success', data: items });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '컬렉션을 불러오지 못했습니다.';
      setCollectionView({ kind: 'error', message });
    }
  }, []);

  const applyMatchResult = useCallback(
    async (result: MatchStatusResult) => {
      if (result.status === 'NONE') {
        setMatchView({ kind: 'idle' });
        return;
      }

      if (result.status === 'WAITING') {
        setMatchView({
          kind: 'waiting',
          queueId: result.queueId,
          enteredAt: result.enteredAt
        });
        return;
      }

      // A genuinely new match (not one we've already surfaced before, e.g. on
      // a stale reload — see hasSeenMatch above) means the collection just
      // gained a new/refilled ball, so light up its notification dot too.
      if (!hasSeenMatch(result.matchId)) {
        storeCollectionHasUnseen(true);
        setHasUnseenCollectionUpdate(true);
      }
      markMatchSeen(result.matchId);
      const { items } = await getCollection();
      setMatchView({ kind: 'matched', result, collectionCount: items.length });
      await load();
    },
    [load]
  );

  const checkMatchStatus = useCallback(async () => {
    try {
      const result = await getMatchStatus();
      await applyMatchResult(result);
    } catch (error) {
      setMatchView({
        kind: 'error',
        message: error instanceof ApiError ? error.message : '매칭 상태를 확인하지 못했습니다.'
      });
    }
  }, [applyMatchResult]);

  useEffect(() => {
    load();
  }, [load]);

  // Recovers a queue/match entry that outlived a reload (or the bug below,
  // where a real WAITING entry existed server-side but the sheet showing its
  // cancel button had been lost client-side) — otherwise it's invisible until
  // the user hits "매칭하기" again and immediately gets ALREADY_IN_QUEUE with
  // no way back to a cancel button. A MATCHED entry, unlike WAITING, never
  // goes away server-side on its own — only reopen it here if it's a match
  // the user hasn't already been shown (see hasSeenMatch), so simply
  // revisiting the main screen doesn't keep resurfacing an old result.
  useEffect(() => {
    (async () => {
      try {
        const result = await getMatchStatus();
        if (result.status === 'WAITING' || (result.status === 'MATCHED' && !hasSeenMatch(result.matchId))) {
          setMatchOpen(true);
        }
        await applyMatchResult(result);
      } catch {
        // Best-effort: worst case the user just doesn't see a stale queue
        // entry on load and can start fresh.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (matchView.kind !== 'waiting') {
      return undefined;
    }

    const timer = window.setInterval(() => {
      checkMatchStatus();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [checkMatchStatus, matchView.kind]);

  async function openProfile(event: MouseEvent<HTMLButtonElement>) {
    setPopOrigin(getButtonCenter(event));
    setActiveModal('profile');
    setProfileView({ kind: 'loading' });
    try {
      const { user } = await fetchMe();
      setProfileView({ kind: 'success', data: user });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '내 정보를 불러오지 못했습니다.';
      setProfileView({ kind: 'error', message });
    }
  }

  async function openCollection(event: MouseEvent<HTMLButtonElement>) {
    setPopOrigin(getButtonCenter(event));
    setActiveModal('collection');
    setSelectMainError(null);
    storeCollectionHasUnseen(false);
    setHasUnseenCollectionUpdate(false);
    await loadCollection();
  }

  function openTheme(event: MouseEvent<HTMLButtonElement>) {
    setPopOrigin(getButtonCenter(event));
    setActiveModal('theme');
  }

  function openBgm(event: MouseEvent<HTMLButtonElement>) {
    setPopOrigin(getButtonCenter(event));
    setActiveModal('bgm');
  }

  async function openLeaderboard(event: MouseEvent<HTMLButtonElement>) {
    setPopOrigin(getButtonCenter(event));
    setActiveModal('leaderboard');
    setLeaderboardView({ kind: 'loading' });
    try {
      const result = await getLeaderboard();
      setLeaderboardView({ kind: 'success', data: result });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '리더보드를 불러오지 못했습니다.';
      setLeaderboardView({ kind: 'error', message });
    }
  }

  async function handleSelectMain(item: CollectionItem) {
    if (item.isMain || selectingMain) {
      return;
    }

    setSelectMainError(null);
    setSelectingMain(true);
    try {
      await selectMainWakppuball(item.ownedId);
      setActiveModal(null);
      await load();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '대표 왁뿌볼을 변경하지 못했습니다.';
      setSelectMainError(message);
    } finally {
      setSelectingMain(false);
    }
  }

  function startEditingBallName() {
    if (view.kind !== 'success') {
      return;
    }
    setRenameBallError(null);
    setBallNameDraft(view.wakppuball.name);
    setEditingBallName(true);
  }

  async function handleSubmitBallName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = ballNameDraft.trim();
    if (!trimmed) {
      setRenameBallError('이름을 입력해주세요.');
      return;
    }

    setRenameBallError(null);
    setRenamingBall(true);
    try {
      await renameCreatedWakppuball(trimmed);
      setEditingBallName(false);
      await load();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '이름을 변경하지 못했습니다.';
      setRenameBallError(message);
    } finally {
      setRenamingBall(false);
    }
  }

  function startEditingUsername() {
    if (profileView.kind !== 'success') {
      return;
    }
    setRenameUsernameError(null);
    setUsernameDraft(profileView.data.username);
    setEditingUsername(true);
  }

  async function handleSubmitUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = usernameDraft.trim();
    const validationError = validateUsername(trimmed);
    if (validationError) {
      setRenameUsernameError(validationError);
      return;
    }

    setRenameUsernameError(null);
    setRenamingUsername(true);
    try {
      await renameUsername(trimmed);
      setEditingUsername(false);
      setProfileView({ kind: 'loading' });
      const { user } = await fetchMe();
      setProfileView({ kind: 'success', data: user });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '유저네임을 변경하지 못했습니다.';
      setRenameUsernameError(message);
    } finally {
      setRenamingUsername(false);
    }
  }

  async function handleLogout() {
    // Await the pending break report (if any) before signOut() clears the
    // token — apiRequest reads it synchronously from storage, so firing this
    // afterward would send it unauthenticated and lose the decrement.
    await viewerRef.current?.flushBreakReport();
    signOut();
    navigate('/login', { replace: true });
  }

  async function handleCreate() {
    setCreateError(null);
    setCreating(true);

    const customization: WakppuballCustomization = {
      outerColor,
      innerColor,
      pattern,
      shape: 'sphere'
    };
    const fracture: WakppuballFracture = { thicknessPreset };

    try {
      await createWakppuball({
        name: name.trim() || undefined,
        customization,
        fracture,
        setAsMain: true
      });
      await load();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '왁뿌볼을 저장하지 못했습니다.';
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }

  async function handleStartMatch(event: MouseEvent<HTMLButtonElement>) {
    setMatchOrigin(getButtonCenter(event));
    setMatchOpen(true);
    setMatchView({ kind: 'loading', message: '위치 확인 중…' });

    // Location is purely cosmetic now (it only decides the campus-match
    // badge) and never blocks matching, so a denied/unavailable geolocation
    // just proceeds without it instead of aborting the match attempt.
    let location: MatchLocation | undefined;
    try {
      location = await getCurrentLocation();
    } catch {
      location = undefined;
    }

    try {
      setMatchView({ kind: 'loading', message: '매칭 상대를 찾는 중…' });
      const result = await enterMatchQueue(location ?? {});
      await applyMatchResult(result);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ALREADY_IN_QUEUE') {
        // A duplicate click (or a stale WAITING entry from before) raced
        // ahead of this one — recover into the real waiting/matched state
        // (with its cancel button) instead of a dead-end error message that
        // can never reach it again.
        await checkMatchStatus();
        return;
      }
      setMatchView({ kind: 'error', message: messageForMatchError(error) });
    }
  }

  async function handleCancelMatch() {
    setMatchView({ kind: 'loading', message: '대기를 취소하는 중…' });
    try {
      await cancelMatchQueue();
      setMatchView({ kind: 'idle' });
      setMatchOpen(false);
    } catch (error) {
      setMatchView({
        kind: 'error',
        message: error instanceof ApiError ? error.message : '매칭 대기를 취소하지 못했습니다.'
      });
    }
  }

  const previewCustomization: WakppuballCustomization =
    view.kind === 'success'
      ? view.wakppuball.customization ?? DEFAULT_CUSTOMIZATION
      : {
          outerColor,
          innerColor,
          pattern,
          shape: 'sphere'
        };

  return (
    <section className="home-screen">
      <header className="home-topbar">
        <div className="home-topbar-group">
          <IconButton label="내 정보" onClick={openProfile}>
            <IconUser />
          </IconButton>
          <IconButton label="리더보드" onClick={openLeaderboard}>
            <IconLeaderboard />
          </IconButton>
        </div>
        <div className="home-topbar-group">
          <IconButton label="배경 테마 선택" onClick={openTheme}>
            <IconPalette />
          </IconButton>
          <IconButton label="배경음악 선택" onClick={openBgm}>
            {bgm.isOn ? <IconSpeakerOn /> : <IconSpeakerOff />}
          </IconButton>
          <IconButton label="내 컬렉션" onClick={openCollection} showBadge={hasUnseenCollectionUpdate}>
            <IconCollection />
          </IconButton>
        </div>
      </header>

      <div className="brand-mark">
        <span>Campus</span>
        <strong>왁뿌볼</strong>
      </div>

      <section className="wakppuball-stage" aria-label="대표 왁뿌볼">
        {view.kind === 'loading' && <p className="surface-panel">불러오는 중…</p>}

        {view.kind === 'error' && (
          <div className="surface-panel compact-panel">
            <p role="alert">{view.message}</p>
            <button className="secondary-button" type="button" onClick={load}>
              다시 시도
            </button>
          </div>
        )}

        {view.kind === 'empty' && (
          <>
            <WakppuballView name="새 왁뿌볼 미리보기" customization={previewCustomization} />
            <div className="create-panel" aria-label="왁뿌볼 생성">
              <p>아직 저장된 왁뿌볼이 없어요. 나의 왁뿌볼을 만들어 보세요.</p>

              <label className="field-stack" htmlFor="wakppuball-name">
                <span>이름</span>
                <input
                  id="wakppuball-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={creating}
                />
              </label>

              <div className="color-grid">
                <ColorField id="outer-color" label="바깥 색" value={outerColor} onChange={setOuterColor} />
                <ColorField id="inner-color" label="안쪽 색" value={innerColor} onChange={setInnerColor} />
              </div>

              <div className="field-stack">
                <span>패턴</span>
                <div className="segmented-control" aria-label="패턴 선택">
                  <SegmentButton
                    value="none"
                    selected={patternSegment === 'none'}
                    onSelect={handlePatternSegmentSelect}
                    disabled={uploadingSkin}
                  >
                    기본
                  </SegmentButton>
                  <SegmentButton
                    value="dots"
                    selected={patternSegment === 'dots'}
                    onSelect={handlePatternSegmentSelect}
                    disabled={uploadingSkin}
                  >
                    dots
                  </SegmentButton>
                  <SegmentButton
                    value="stripes"
                    selected={patternSegment === 'stripes'}
                    onSelect={handlePatternSegmentSelect}
                    disabled={uploadingSkin}
                  >
                    stripes
                  </SegmentButton>
                  <SegmentButton
                    value="custom"
                    selected={patternSegment === 'custom'}
                    onSelect={handlePatternSegmentSelect}
                    disabled={uploadingSkin}
                  >
                    {uploadingSkin ? '업로드 중…' : '내 사진'}
                  </SegmentButton>
                </div>
                <input
                  ref={skinFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleSkinFileChange}
                  style={{ display: 'none' }}
                  aria-hidden="true"
                  tabIndex={-1}
                />
                {skinUploadState.kind === 'error' && <p role="alert">{skinUploadState.message}</p>}
              </div>

              <div className="field-stack">
                <span>두께</span>
                <div className="segmented-control" aria-label="두께 선택">
                  <SegmentButton
                    value="thin"
                    selected={thicknessPreset === 'thin'}
                    onSelect={setThicknessPreset}
                  >
                    thin
                  </SegmentButton>
                  <SegmentButton
                    value="medium"
                    selected={thicknessPreset === 'medium'}
                    onSelect={setThicknessPreset}
                  >
                    medium
                  </SegmentButton>
                  <SegmentButton
                    value="thick"
                    selected={thicknessPreset === 'thick'}
                    onSelect={setThicknessPreset}
                  >
                    thick
                  </SegmentButton>
                </div>
              </div>

              {createError && <p role="alert">{createError}</p>}
              <button
                className="primary-button"
                type="button"
                onClick={handleCreate}
                disabled={creating || uploadingSkin}
              >
                {creating ? '저장 중…' : '나의 왁뿌볼 만들기'}
              </button>
            </div>
          </>
        )}

        {view.kind === 'success' && (
          <>
            {/* key forces a real mount/unmount per ball: switching main via the
                collection changes `ownedId` but keeps this JSX slot, and without
                a key React would just update props on the same instance — the
                old ball's popped pieces (and the effect that reports them once
                per session, see WakppuballViewer.tsx) would leak into the new one. */}
            <WakppuballViewer
              key={view.wakppuball.ownedId}
              ref={viewerRef}
              ownedId={view.wakppuball.ownedId}
              remainingBreakCount={view.wakppuball.remainingBreakCount}
              outerColor={(view.wakppuball.customization ?? DEFAULT_CUSTOMIZATION).outerColor}
              innerColor={(view.wakppuball.customization ?? DEFAULT_CUSTOMIZATION).innerColor}
              pattern={(view.wakppuball.customization ?? DEFAULT_CUSTOMIZATION).pattern}
            />
            <div className="main-ball-caption">
              {editingBallName ? (
                <form className="inline-edit-form" onSubmit={handleSubmitBallName}>
                  <input
                    value={ballNameDraft}
                    onChange={(event) => setBallNameDraft(event.target.value)}
                    maxLength={50}
                    autoFocus
                    disabled={renamingBall}
                    aria-label="왁뿌볼 이름"
                  />
                  <button type="submit" disabled={renamingBall}>
                    저장
                  </button>
                  <button type="button" onClick={() => setEditingBallName(false)} disabled={renamingBall}>
                    취소
                  </button>
                </form>
              ) : (
                <p>
                  {view.wakppuball.name}
                  <CampusMatchBadge show={view.wakppuball.isCampusMatch} />
                  {view.wakppuball.acquiredType === 'CREATED' && (
                    <button type="button" className="icon-button-inline" aria-label="왁뿌볼 이름 수정" onClick={startEditingBallName}>
                      <IconEdit />
                    </button>
                  )}
                </p>
              )}
              {renameBallError && <p role="alert">{renameBallError}</p>}
              <span>남은 뿌시기 횟수 {view.wakppuball.remainingBreakCount}</span>
            </div>
          </>
        )}
      </section>

      {view.kind === 'success' && (
        // Fixed-position, so it stays clickable underneath the sheet unless
        // explicitly disabled — without this, mashing it while a match is
        // already in flight raced two enterMatchQueue calls against each
        // other and could strand the UI on a dead-end ALREADY_IN_QUEUE error.
        <button className="match-button" type="button" onClick={handleStartMatch} disabled={matchOpen}>
          매칭하기
        </button>
      )}

      {activeModal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setActiveModal(null)}>
          <section
            className={`modal-sheet modal-sheet--${activeModal}`}
            ref={modalSheetRef}
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sheet-header">
              <h2>{MODAL_TITLES[activeModal]}</h2>
              <IconButton label="닫기" onClick={() => setActiveModal(null)}>
                <IconClose />
              </IconButton>
            </div>

            {activeModal === 'profile' && (
              <div className="sheet-content">
                {profileView.kind === 'loading' && <p>불러오는 중…</p>}
                {profileView.kind === 'error' && <p role="alert">{profileView.message}</p>}
                {profileView.kind === 'success' && (
                  <>
                    <div className="profile-card">
                      <span>유저네임</span>
                      {editingUsername ? (
                        <form className="inline-edit-form" onSubmit={handleSubmitUsername}>
                          <input
                            value={usernameDraft}
                            onChange={(event) => setUsernameDraft(event.target.value)}
                            maxLength={20}
                            autoFocus
                            disabled={renamingUsername}
                            aria-label="유저네임"
                          />
                          <button type="submit" disabled={renamingUsername}>
                            저장
                          </button>
                          <button type="button" onClick={() => setEditingUsername(false)} disabled={renamingUsername}>
                            취소
                          </button>
                        </form>
                      ) : (
                        <strong>
                          {profileView.data.username}
                          <button type="button" className="icon-button-inline" aria-label="유저네임 수정" onClick={startEditingUsername}>
                            <IconEdit />
                          </button>
                        </strong>
                      )}
                      {renameUsernameError && <p role="alert">{renameUsernameError}</p>}
                    </div>
                    <div className="stat-grid">
                      <div>
                        <span>현재 보유</span>
                        <strong>
                          {profileView.data.distinctMatchedUserCount}
                          <TierBadge tier={profileView.data.tiers.distinctMatchedUsers} />
                        </strong>
                      </div>
                      <div>
                        <span>누적 뿌신 횟수</span>
                        <strong>
                          {profileView.data.totalBreakCount}
                          <TierBadge tier={profileView.data.tiers.breakCount} />
                        </strong>
                      </div>
                    </div>
                    <button className="danger-button" type="button" onClick={handleLogout}>
                      <IconLogout />
                      로그아웃
                    </button>
                  </>
                )}
              </div>
            )}

            {activeModal === 'collection' && (
              <div className="sheet-content">
                {collectionView.kind === 'loading' && <p>불러오는 중…</p>}
                {collectionView.kind === 'error' && <p role="alert">{collectionView.message}</p>}
                {collectionView.kind === 'success' && collectionView.data.length === 0 && (
                  <p>아직 컬렉션이 비어 있어요.</p>
                )}
                {selectMainError && <p role="alert">{selectMainError}</p>}
                {collectionView.kind === 'success' && collectionView.data.length > 0 && (
                  <div className="collection-grid">
                    {collectionView.data.map((item) => (
                      <button
                        type="button"
                        className={[
                          'collection-tile',
                          item.isMain && 'collection-tile--main',
                          item.acquiredType === 'CREATED' && 'collection-tile--created'
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        key={item.ownedId}
                        onClick={() => handleSelectMain(item)}
                        disabled={selectingMain}
                      >
                        <WakppuballView name={item.name} customization={item.customization} />
                        <strong>
                          <span className="collection-tile-name">{item.name}</span>
                          <CampusMatchBadge show={item.isCampusMatch} />
                        </strong>
                        <span>{item.isMain ? '대표 왁뿌볼' : item.acquiredType === 'MATCHED' ? '매칭 획득' : '직접 생성'}</span>
                        {item.creatorUsername && <span>제작자 {item.creatorUsername}</span>}
                        <span>남은 뿌시기 {item.remainingBreakCount}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeModal === 'leaderboard' && (
              <div className="sheet-content">
                {leaderboardView.kind === 'loading' && <p>불러오는 중…</p>}
                {leaderboardView.kind === 'error' && <p role="alert">{leaderboardView.message}</p>}
                {leaderboardView.kind === 'success' && (
                  <>
                    <div className="segmented-control" aria-label="리더보드 기준 선택">
                      <SegmentButton
                        value="breakCount"
                        selected={leaderboardMetric === 'breakCount'}
                        onSelect={setLeaderboardMetric}
                      >
                        뿌시기 횟수
                      </SegmentButton>
                      <SegmentButton
                        value="distinctMatchedUsers"
                        selected={leaderboardMetric === 'distinctMatchedUsers'}
                        onSelect={setLeaderboardMetric}
                      >
                        매칭 유저 수
                      </SegmentButton>
                    </div>
                    {leaderboardView.data[leaderboardMetric].length === 0 && <p>아직 순위가 없어요.</p>}
                    <div className="leaderboard-list">
                      {leaderboardView.data[leaderboardMetric].map((entry) => (
                        <div className="leaderboard-row" key={entry.userId}>
                          <span>{entry.rank}</span>
                          <TierBadge tier={entry.tier} />
                          <strong>{entry.username}</strong>
                          <span>{entry.value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="tier-legend">
                      <span className="tier-legend-title">티어 안내</span>
                      {TIER_PERCENTILE_LEGEND.map(({ tier, label }) => (
                        <div className="tier-legend-row" key={tier}>
                          <TierBadge tier={tier} />
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeModal === 'theme' && (
              <div className="sheet-content">
                <div className="theme-grid" role="radiogroup" aria-label="배경 테마 선택">
                  {THEME_IDS.map((id) => {
                    const [hue, tone] = id.split('-') as [ThemeHue, ThemeTone];
                    return (
                      <button
                        key={id}
                        type="button"
                        className={
                          id === colorTheme.theme ? 'theme-swatch-button selected' : 'theme-swatch-button'
                        }
                        data-hue={hue}
                        data-tone={tone}
                        aria-pressed={id === colorTheme.theme}
                        onClick={() => colorTheme.setTheme(id)}
                      >
                        {THEME_HUE_LABELS[hue]} · {THEME_TONE_LABELS[tone]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeModal === 'bgm' && (
              <div className="sheet-content">
                <button
                  type="button"
                  className={bgm.isOn ? 'bgm-power-button on' : 'bgm-power-button'}
                  onClick={bgm.toggle}
                >
                  {bgm.isOn ? <IconSpeakerOn /> : <IconSpeakerOff />}
                  {bgm.isOn ? '배경음악 끄기' : '배경음악 켜기'}
                </button>
                <div className="bgm-track-grid" role="radiogroup" aria-label="배경음악 트랙 선택">
                  {BGM_TRACK_IDS.map((id, index) => (
                    <button
                      key={id}
                      type="button"
                      className={id === bgmTrack.track ? 'bgm-track-button selected' : 'bgm-track-button'}
                      aria-pressed={id === bgmTrack.track}
                      onClick={() => bgmTrack.setTrack(id)}
                    >
                      BGM {index + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {matchOpen && (
        <div className="match-sheet" ref={matchSheetRef} role="dialog" aria-modal="true" aria-label="매칭 상태">
          {matchView.kind === 'idle' && <p>매칭을 시작해 보세요.</p>}

          {matchView.kind === 'loading' && <p>{matchView.message}</p>}

          {matchView.kind === 'waiting' && (
            <>
              <p>매칭 대기 중이에요.</p>
              <span>상대가 들어오면 자동으로 확인합니다.</span>
              <div className="match-actions">
                <button className="secondary-button" type="button" onClick={checkMatchStatus}>
                  상태 확인
                </button>
                <button className="secondary-button" type="button" onClick={handleCancelMatch}>
                  대기 취소
                </button>
              </div>
            </>
          )}

          {matchView.kind === 'matched' && (
            <>
              <p>{matchView.result.partner.username} 님과 매칭됐어요!</p>
              <div className="matched-ball">
                <WakppuballView
                  name={matchView.result.partnerWakppuball.name}
                  customization={matchView.result.partnerWakppuball.customization}
                />
                <strong>
                  {matchView.result.partnerWakppuball.name}
                  <CampusMatchBadge show={matchView.result.partnerWakppuball.isCampusMatch} />
                </strong>
                <span>컬렉션 {matchView.collectionCount}개</span>
              </div>
              <button className="primary-button" type="button" onClick={() => setMatchOpen(false)}>
                확인
              </button>
            </>
          )}

          {matchView.kind === 'error' && (
            <>
              <p role="alert">{matchView.message}</p>
              <div className="match-actions">
                <button className="secondary-button" type="button" onClick={handleStartMatch}>
                  다시 시도
                </button>
                <button className="secondary-button" type="button" onClick={() => setMatchOpen(false)}>
                  닫기
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
