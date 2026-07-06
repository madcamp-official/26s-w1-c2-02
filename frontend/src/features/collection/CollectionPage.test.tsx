import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { ApiError } from '../../shared/api/http';
import { renderWithRouter } from '../../test/renderWithRouter';
import { CollectionPage } from './CollectionPage';
import type { CollectionItem } from './collectionApi';
import * as collectionApi from './collectionApi';

vi.mock('./collectionApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./collectionApi')>();
  return { ...actual, getCollection: vi.fn() };
});

const getCollection = vi.mocked(collectionApi.getCollection);

const createdItem: CollectionItem = {
  ownedId: '10',
  modelId: '5',
  name: '내가 만든 볼',
  modelUrl: null,
  thumbnailUrl: '/thumb.png',
  acquiredType: 'CREATED',
  remainingBreakCount: 3,
  status: 'ACTIVE',
  isMain: true,
  acquiredAt: '2026-07-03T10:10:00.000Z'
};

const matchedItem: CollectionItem = {
  ownedId: '20',
  modelId: '8',
  name: '매칭으로 받은 볼',
  modelUrl: null,
  thumbnailUrl: '/thumb2.png',
  acquiredType: 'MATCHED', // no acquiredFrom, mirroring the synchronous queue
  remainingBreakCount: 3,
  status: 'ACTIVE',
  isMain: false,
  acquiredAt: '2026-07-03T11:00:00.000Z'
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CollectionPage — state matrix', () => {
  it('loading: shows the loading text before the request resolves', () => {
    getCollection.mockReturnValue(new Promise<{ items: CollectionItem[] }>(() => {}));
    renderWithRouter(<CollectionPage />);
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
  });

  // scenarios.ts `hasMainWakppuball`: true → at least one item, false → empty.
  it.each([{ hasItems: true }, { hasItems: false }])(
    'hasItems=$hasItems renders success or empty',
    async ({ hasItems }) => {
      getCollection.mockResolvedValue({ items: hasItems ? [createdItem] : [] });
      renderWithRouter(<CollectionPage />);
      if (hasItems) {
        expect(await screen.findByText(/내가 만든 볼/)).toBeInTheDocument();
        expect(screen.getByText('내가 만든 왁뿌볼')).toBeInTheDocument();
      } else {
        expect(await screen.findByText(/아직 컬렉션이 비어 있어요/)).toBeInTheDocument();
      }
    }
  );

  it('success: matched item (no acquiredFrom) shows the matched label', async () => {
    getCollection.mockResolvedValue({ items: [matchedItem] });
    renderWithRouter(<CollectionPage />);
    expect(await screen.findByText('매칭으로 받음')).toBeInTheDocument();
  });

  it('error: failure shows the error message and retry button', async () => {
    getCollection.mockRejectedValue(new ApiError('UNAUTHORIZED', '로그인이 필요합니다.'));
    renderWithRouter(<CollectionPage />);
    expect(await screen.findByText('로그인이 필요합니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });
});
