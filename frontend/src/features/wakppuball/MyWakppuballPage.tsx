import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode
} from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../shared/api/http';
import { useAuth } from '../../shared/auth/AuthContext';
import { fetchMe, type MeResponse } from '../auth/authApi';
import { getCollection, selectMainWakppuball, type CollectionItem } from '../collection/collectionApi';
import {
  cancelMatchQueue,
  enterMatchQueue,
  getMatchStatus,
  type MatchedResult,
  type MatchQueueBody,
  type MatchStatusResult
} from '../matching/matchingApi';
import { createWakppuball, getMainWakppuball, type MainWakppuball } from './wakppuballApi';
import { DEFAULT_CUSTOMIZATION, DEFAULT_FRACTURE } from './wakppuballDefaults';
import { WakppuballView } from './WakppuballView';
// The main-screen interaction stage is the one place a wakppuball renders in 3D
// (see docs/3d-interaction.md) with piece-level crack/press/squash; collection
// tiles, the create preview, and match results stay on WakppuballView's CSS
// fallback (SHAPE_MODEL_ASSETS is intentionally left empty so those call sites
// don't pick up a 3D render).
import { WakppuballViewer, type WakppuballViewerHandle } from './WakppuballViewer';
import { useBgmToggle } from '../../shared/sound/useBgmToggle';
import type {
  WakppuballCustomization,
  WakppuballFracture,
  WakppuballPattern
} from './wakppuballTypes';

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

type ModalKind = 'profile' | 'collection' | null;
type MeUser = MeResponse['user'];
type MatchLocation = Pick<MatchQueueBody, 'latitude' | 'longitude'>;
// Viewport point (usually a trigger button's center) the popup animates in from.
type PopOrigin = { x: number; y: number };

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

function messageForMatchError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'LOCATION_REQUIRED':
        return '매칭하려면 위치 정보 사용을 허용해야 합니다.';
      case 'OUTSIDE_CAMPUS_AREA':
        return '캠퍼스 안에서만 매칭할 수 있어요.';
      case 'MAIN_WAKPPUBALL_REQUIRED':
        return '매칭하려면 대표 왁뿌볼이 필요합니다.';
      case 'BREAK_COUNT_REQUIRED':
        return '남은 뿌시기 횟수가 있는 왁뿌볼만 매칭할 수 있어요.';
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
  onClick
}: {
  label: string;
  children: ReactNode;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
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
  onSelect
}: {
  value: T;
  selected: boolean;
  children: ReactNode;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      className={selected ? 'segment-button selected' : 'segment-button'}
      onClick={() => onSelect(value)}
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
  const [selectingMain, setSelectingMain] = useState(false);
  const [selectMainError, setSelectMainError] = useState<string | null>(null);
  const [matchOpen, setMatchOpen] = useState(false);
  const [matchView, setMatchView] = useState<MatchView>({ kind: 'idle' });
  const [popOrigin, setPopOrigin] = useState<PopOrigin | null>(null);
  const [matchOrigin, setMatchOrigin] = useState<PopOrigin | null>(null);
  const modalSheetRef = useRef<HTMLElement | null>(null);
  const matchSheetRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<WakppuballViewerHandle>(null);
  const bgm = useBgmToggle();

  usePopOrigin(activeModal !== null, popOrigin, modalSheetRef);
  usePopOrigin(matchOpen, matchOrigin, matchSheetRef);

  const [name, setName] = useState('나의 왁뿌볼');
  const [outerColor, setOuterColor] = useState(DEFAULT_CUSTOMIZATION.outerColor);
  const [innerColor, setInnerColor] = useState(DEFAULT_CUSTOMIZATION.innerColor);
  const [patternId, setPatternId] = useState<WakppuballPattern['id']>('dots');
  const [thicknessPreset, setThicknessPreset] =
    useState<WakppuballFracture['thicknessPreset']>('medium');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
    await loadCollection();
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
      pattern: { type: 'preset', id: patternId },
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

    try {
      const location = await getCurrentLocation();
      setMatchView({ kind: 'loading', message: '매칭 상대를 찾는 중…' });
      const result = await enterMatchQueue(location);
      await applyMatchResult(result);
    } catch (error) {
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
          pattern: { type: 'preset', id: patternId },
          shape: 'sphere'
        };

  return (
    <section className="home-screen">
      <header className="home-topbar">
        <IconButton label="내 정보" onClick={openProfile}>
          <IconUser />
        </IconButton>
        <div className="home-topbar-group">
          <IconButton label={bgm.isOn ? '배경음악 끄기' : '배경음악 켜기'} onClick={bgm.toggle}>
            {bgm.isOn ? <IconSpeakerOn /> : <IconSpeakerOff />}
          </IconButton>
          <IconButton label="내 컬렉션" onClick={openCollection}>
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
                  <SegmentButton value="dots" selected={patternId === 'dots'} onSelect={setPatternId}>
                    dots
                  </SegmentButton>
                  <SegmentButton value="stripes" selected={patternId === 'stripes'} onSelect={setPatternId}>
                    stripes
                  </SegmentButton>
                </div>
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
              <button className="primary-button" type="button" onClick={handleCreate} disabled={creating}>
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
            />
            <div className="main-ball-caption">
              <p>{view.wakppuball.name}</p>
              <span>남은 뿌시기 횟수 {view.wakppuball.remainingBreakCount}</span>
            </div>
          </>
        )}
      </section>

      {view.kind === 'success' && (
        <button className="match-button" type="button" onClick={handleStartMatch}>
          매칭하기
        </button>
      )}

      {activeModal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setActiveModal(null)}>
          <section
            className={
              activeModal === 'profile' ? 'modal-sheet modal-sheet--profile' : 'modal-sheet modal-sheet--collection'
            }
            ref={modalSheetRef}
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sheet-header">
              <h2>{activeModal === 'profile' ? '내 정보' : '내 컬렉션'}</h2>
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
                      <strong>{profileView.data.username}</strong>
                    </div>
                    <div className="stat-grid">
                      <div>
                        <span>현재 보유</span>
                        <strong>{profileView.data.collectionCount}</strong>
                      </div>
                      <div>
                        <span>누적 획득</span>
                        <strong>{profileView.data.totalAcquiredCount}</strong>
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
                        className={item.isMain ? 'collection-tile collection-tile--main' : 'collection-tile'}
                        key={item.ownedId}
                        onClick={() => handleSelectMain(item)}
                        disabled={selectingMain}
                      >
                        <WakppuballView name={item.name} customization={item.customization} />
                        <strong>{item.name}</strong>
                        <span>{item.isMain ? '대표 왁뿌볼' : item.acquiredType === 'MATCHED' ? '매칭 획득' : '직접 생성'}</span>
                        <span>남은 뿌시기 {item.remainingBreakCount}</span>
                      </button>
                    ))}
                  </div>
                )}
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
                <strong>{matchView.result.partnerWakppuball.name}</strong>
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
