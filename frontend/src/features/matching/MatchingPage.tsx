import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../shared/api/http';
import { getCollection } from '../collection/collectionApi';
import { enterMatchQueue, type MatchedResult } from './matchingApi';

// Option (A): one POST /matching/queue call resolves immediately.
// idle → loading → matched | failed | error.
type ViewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'matched'; result: MatchedResult; collectionCount: number }
  | { kind: 'failed'; message: string }
  | { kind: 'error'; message: string };

export function MatchingPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>({ kind: 'idle' });

  async function handleMatch() {
    setView({ kind: 'loading' });
    try {
      const result = await enterMatchQueue();
      if (result.status === 'FAILED') {
        setView({ kind: 'failed', message: result.message });
        return;
      }
      // MATCHED: the partner ball is already in the collection — refetch to reflect it.
      const { items } = await getCollection();
      setView({ kind: 'matched', result, collectionCount: items.length });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '매칭 요청에 실패했습니다.';
      setView({ kind: 'error', message });
    }
  }

  return (
    <section className="page">
      <h1>매칭하기</h1>

      {view.kind === 'idle' && (
        <div className="panel">
          <p>대표 왁뿌볼로 다른 사용자와 매칭해 왁뿌볼을 교환합니다.</p>
          <button type="button" onClick={handleMatch}>
            매칭 시작
          </button>
        </div>
      )}

      {view.kind === 'loading' && <p className="panel">매칭 중…</p>}

      {view.kind === 'failed' && (
        <div className="panel">
          <p>{view.message}</p>
          <button type="button" onClick={handleMatch}>
            다시 시도
          </button>
        </div>
      )}

      {view.kind === 'error' && (
        <div className="panel">
          <p role="alert">{view.message}</p>
          <button type="button" onClick={handleMatch}>
            다시 시도
          </button>
        </div>
      )}

      {view.kind === 'matched' && (
        <div className="panel">
          <p>{view.result.partner.username} 님과 매칭됐어요!</p>
          {view.result.partnerWakppuball.thumbnailUrl ? (
            <img
              src={view.result.partnerWakppuball.thumbnailUrl}
              alt={view.result.partnerWakppuball.name}
              style={{ maxWidth: '100%' }}
            />
          ) : (
            <div aria-label="왁뿌볼 이미지 없음">[왁뿌볼 이미지]</div>
          )}
          <p>받은 왁뿌볼: {view.result.partnerWakppuball.name}</p>
          <p>내 컬렉션에 추가됐어요 (현재 {view.collectionCount}개)</p>
          <button type="button" onClick={() => navigate('/collection')}>
            컬렉션에서 확인
          </button>
          <button type="button" onClick={handleMatch}>
            다시 매칭
          </button>
        </div>
      )}
    </section>
  );
}
