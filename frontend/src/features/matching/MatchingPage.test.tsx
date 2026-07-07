import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../shared/api/http';
import { renderWithRouter } from '../../test/renderWithRouter';
import { MatchingPage } from './MatchingPage';
import type { MatchedResult } from './matchingApi';
import * as matchingApi from './matchingApi';
import * as collectionApi from '../collection/collectionApi';

vi.mock('./matchingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./matchingApi')>();
  return { ...actual, enterMatchQueue: vi.fn() };
});
vi.mock('../collection/collectionApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../collection/collectionApi')>();
  return { ...actual, getCollection: vi.fn() };
});

const enterMatchQueue = vi.mocked(matchingApi.enterMatchQueue);
const getCollection = vi.mocked(collectionApi.getCollection);

const matchedResult: MatchedResult = {
  status: 'MATCHED',
  matchId: 'temp-21',
  partner: { id: 'temp-partner-1', username: 'campus-bot-a' },
  partnerWakppuball: {
    ownedId: '21',
    modelId: '9',
    name: '파란 임시 왁뿌볼',
    modelUrl: '/blue.png',
    thumbnailUrl: '/blue.png',
    customization: {
      outerColor: '#4f8cff',
      innerColor: '#ffffff',
      pattern: { type: 'preset', id: 'dots' },
      shape: 'sphere'
    },
    fracture: { thicknessPreset: 'medium' },
    acquiredType: 'MATCHED',
    remainingBreakCount: 3,
    status: 'ACTIVE',
    acquiredAt: '2026-07-06T12:00:00.000Z'
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success) => {
        success({
          coords: {
            latitude: 36.3683750600837,
            longitude: 127.356771410201
          }
        });
      })
    }
  });
});

describe('MatchingPage — state matrix', () => {
  it('idle: shows the start button before any request', () => {
    renderWithRouter(<MatchingPage />);
    expect(screen.getByRole('button', { name: '매칭 시작' })).toBeInTheDocument();
  });

  // scenarios.ts `matchOutcome`: MATCHED → partner info + collection refetch, WAITING → queue state.
  it.each([{ matchOutcome: 'MATCHED' as const }, { matchOutcome: 'WAITING' as const }])(
    'matchOutcome=$matchOutcome renders the right result',
    async ({ matchOutcome }) => {
      if (matchOutcome === 'MATCHED') {
        enterMatchQueue.mockResolvedValue(matchedResult);
        getCollection.mockResolvedValue({ items: [] }); // count only; contents irrelevant here
        renderWithRouter(<MatchingPage />);
        await userEvent.click(screen.getByRole('button', { name: '매칭 시작' }));
        expect(await screen.findByText(/campus-bot-a 님과 매칭됐어요/)).toBeInTheDocument();
        expect(screen.getByText('받은 왁뿌볼: 파란 임시 왁뿌볼')).toBeInTheDocument();
        // MATCHED path must refetch the collection to reflect the granted ball.
        expect(getCollection).toHaveBeenCalledTimes(1);
        expect(enterMatchQueue).toHaveBeenCalledWith({
          latitude: 36.3683750600837,
          longitude: 127.356771410201
        });
      } else {
        enterMatchQueue.mockResolvedValue({
          status: 'WAITING',
          queueId: 'queue-1',
          enteredAt: '2026-07-06T12:00:00.000Z'
        });
        renderWithRouter(<MatchingPage />);
        await userEvent.click(screen.getByRole('button', { name: '매칭 시작' }));
        expect(await screen.findByText('매칭 대기 중이에요.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '상태 확인' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '대기 취소' })).toBeInTheDocument();
        expect(getCollection).not.toHaveBeenCalled();
      }
    }
  );

  it('error: MAIN_WAKPPUBALL_REQUIRED shows the error message', async () => {
    enterMatchQueue.mockRejectedValue(
      new ApiError('MAIN_WAKPPUBALL_REQUIRED', '매칭하려면 대표 왁뿌볼이 필요합니다.')
    );
    renderWithRouter(<MatchingPage />);
    await userEvent.click(screen.getByRole('button', { name: '매칭 시작' }));
    expect(await screen.findByText('매칭하려면 대표 왁뿌볼이 필요합니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });
});
