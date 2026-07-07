import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../shared/api/http';
import { createWakppuball, getMainWakppuball, type MainWakppuball } from './wakppuballApi';
import type { WakppuballCustomization, WakppuballFracture } from './wakppuballTypes';

// Customization UI is out of scope this sprint — send a fixed value.
// Kept as a top-level constant so it's easy to swap for real state later.
const DEFAULT_CUSTOMIZATION: WakppuballCustomization = {
  outerColor: '#f3d35b',
  innerColor: '#ffffff',
  pattern: { type: 'preset', id: 'dots' },
  shape: 'sphere'
};
const DEFAULT_FRACTURE: WakppuballFracture = {
  thicknessPreset: 'medium'
};
// Temporary 2D asset placeholder until real 3D model upload exists.
const TEMP_WAKPPUBALL_ASSET = {
  thumbnailUrl: '/assets/temp-wakppuball.png'
};

// Every API screen handles 4 states (see CLAUDE.md): loading / error / empty / success.
type ViewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' } // 404 MAIN_WAKPPUBALL_NOT_FOUND → no main ball yet
  | { kind: 'success'; wakppuball: MainWakppuball };

export function MyWakppuballPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>({ kind: 'loading' });

  // Phase 3 creation form state (only used in the empty state).
  const [name, setName] = useState('나의 왁뿌볼');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setView({ kind: 'loading' });
    try {
      const { wakppuball } = await getMainWakppuball();
      setView({ kind: 'success', wakppuball });
    } catch (error) {
      // "No main ball yet" is a normal empty state, not an error.
      if (error instanceof ApiError && error.code === 'MAIN_WAKPPUBALL_NOT_FOUND') {
        setView({ kind: 'empty' });
        return;
      }
      const message = error instanceof ApiError ? error.message : '왁뿌볼을 불러오지 못했습니다.';
      setView({ kind: 'error', message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    setCreateError(null);
    setCreating(true);
    try {
      await createWakppuball({
        name: name.trim() || undefined,
        thumbnailUrl: TEMP_WAKPPUBALL_ASSET.thumbnailUrl,
        customization: DEFAULT_CUSTOMIZATION,
        fracture: DEFAULT_FRACTURE,
        setAsMain: true
      });
      // Saved + set as main → re-read the main ball and show it.
      await load();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '왁뿌볼을 저장하지 못했습니다.';
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="page">
      <h1>내 왁뿌볼</h1>

      {view.kind === 'loading' && <p className="panel">불러오는 중…</p>}

      {view.kind === 'error' && (
        <div className="panel">
          <p role="alert">{view.message}</p>
          <button type="button" onClick={load}>
            다시 시도
          </button>
        </div>
      )}

      {view.kind === 'empty' && (
        <div className="panel">
          <p>아직 저장된 왁뿌볼이 없어요. 나의 왁뿌볼을 만들어 보세요.</p>
          <div>
            <label htmlFor="wakppuball-name">이름</label>
            <input
              id="wakppuball-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={creating}
            />
          </div>
          {createError && <p role="alert">{createError}</p>}
          <button type="button" onClick={handleCreate} disabled={creating}>
            {creating ? '저장 중…' : '나의 왁뿌볼 만들기'}
          </button>
        </div>
      )}

      {view.kind === 'success' && (
        <div className="panel">
          {/* Static 2D display only this sprint — no break/crack interaction. */}
          {view.wakppuball.thumbnailUrl ? (
            <img
              src={view.wakppuball.thumbnailUrl}
              alt={view.wakppuball.name}
              style={{ maxWidth: '100%' }}
            />
          ) : (
            <div aria-label="왁뿌볼 이미지 없음">[왁뿌볼 이미지]</div>
          )}
          <p>{view.wakppuball.name}</p>
          <p>남은 뿌시기 횟수: {view.wakppuball.remainingBreakCount}</p>
          <button type="button" onClick={() => navigate('/matching')}>
            매칭하기
          </button>
        </div>
      )}
    </section>
  );
}
