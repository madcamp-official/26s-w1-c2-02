import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../shared/api/http';
import { getCollection, type CollectionItem } from './collectionApi';

// loading / error / empty / success (see CLAUDE.md).
type ViewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'success'; items: CollectionItem[] };

function acquiredLabel(item: CollectionItem): string {
  if (item.acquiredType === 'MATCHED') {
    return item.acquiredFrom ? `매칭으로 받음 (from ${item.acquiredFrom.username})` : '매칭으로 받음';
  }
  return '내가 만든 왁뿌볼';
}

export function CollectionPage() {
  const [view, setView] = useState<ViewState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setView({ kind: 'loading' });
    try {
      const { items } = await getCollection();
      setView(items.length === 0 ? { kind: 'empty' } : { kind: 'success', items });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '컬렉션을 불러오지 못했습니다.';
      setView({ kind: 'error', message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="page">
      <h1>내 컬렉션</h1>

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
          <p>아직 컬렉션이 비어 있어요. 왁뿌볼을 만들거나 매칭으로 받아보세요.</p>
        </div>
      )}

      {view.kind === 'success' && (
        <ul>
          {view.items.map((item) => (
            <li key={item.ownedId} className="panel">
              {item.thumbnailUrl ? (
                <img src={item.thumbnailUrl} alt={item.name} style={{ maxWidth: '100%' }} />
              ) : (
                <div aria-label="왁뿌볼 이미지 없음">[왁뿌볼 이미지]</div>
              )}
              <p>
                {item.name}
                {item.isMain && ' (대표)'}
              </p>
              <p>{acquiredLabel(item)}</p>
              <p>남은 뿌시기 횟수: {item.remainingBreakCount}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
