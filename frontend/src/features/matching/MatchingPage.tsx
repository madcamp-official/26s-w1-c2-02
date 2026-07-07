import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../shared/api/http';
import { getCollection } from '../collection/collectionApi';
import {
  cancelMatchQueue,
  enterMatchQueue,
  getMatchStatus,
  type MatchedResult,
  type MatchQueueBody,
  type MatchStatusResult
} from './matchingApi';

type MatchLocation = Pick<MatchQueueBody, 'latitude' | 'longitude'>;

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

type ViewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'waiting'; queueId: string; enteredAt: string }
  | { kind: 'matched'; result: MatchedResult; collectionCount: number }
  | { kind: 'error'; message: string };

export function MatchingPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>({ kind: 'idle' });

  async function applyMatchResult(result: MatchStatusResult) {
    if (result.status === 'NONE') {
      setView({ kind: 'idle' });
      return;
    }

    if (result.status === 'WAITING') {
      setView({
        kind: 'waiting',
        queueId: result.queueId,
        enteredAt: result.enteredAt
      });
      return;
    }

    const { items } = await getCollection();
    setView({ kind: 'matched', result, collectionCount: items.length });
  }

  async function handleMatch() {
    setView({ kind: 'loading' });
    try {
      const location = await getCurrentLocation();
      const result = await enterMatchQueue(location);
      await applyMatchResult(result);
    } catch (error) {
      const message =
        error instanceof ApiError || error instanceof Error ? error.message : '매칭 요청에 실패했습니다.';
      setView({ kind: 'error', message });
    }
  }

  async function handleCheckStatus() {
    setView({ kind: 'loading' });
    try {
      const result = await getMatchStatus();
      await applyMatchResult(result);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '매칭 상태를 확인하지 못했습니다.';
      setView({ kind: 'error', message });
    }
  }

  async function handleCancel() {
    setView({ kind: 'loading' });
    try {
      await cancelMatchQueue();
      setView({ kind: 'idle' });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '매칭 대기를 취소하지 못했습니다.';
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

      {view.kind === 'waiting' && (
        <div className="panel">
          <p>매칭 대기 중이에요.</p>
          <button type="button" onClick={handleCheckStatus}>
            상태 확인
          </button>
          <button type="button" onClick={handleCancel}>
            대기 취소
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
