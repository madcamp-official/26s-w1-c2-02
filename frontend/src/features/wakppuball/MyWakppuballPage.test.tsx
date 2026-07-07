import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../shared/api/http';
import { renderWithRouter } from '../../test/renderWithRouter';
import { MyWakppuballPage } from './MyWakppuballPage';
import type { CreatedWakppuball, MainWakppuball } from './wakppuballApi';
import * as wakppuballApi from './wakppuballApi';

// Unit-test the component's loading/error/empty/success state machine by mocking
// the API layer. The scenario axis here mirrors scenarios.ts `hasMainWakppuball`.
vi.mock('./wakppuballApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./wakppuballApi')>();
  return { ...actual, getMainWakppuball: vi.fn(), createWakppuball: vi.fn() };
});

// The 3D viewer mounts a real WebGL <Canvas>, which jsdom can't render. These
// tests cover page state logic, not 3D — stub the viewer with a lightweight marker.
vi.mock('./WakppuballViewer', () => ({
  WakppuballViewer: () => <div data-testid="wakppuball-viewer" />
}));

const getMainWakppuball = vi.mocked(wakppuballApi.getMainWakppuball);
const createWakppuball = vi.mocked(wakppuballApi.createWakppuball);

const sampleMain: MainWakppuball = {
  ownedId: '10',
  modelId: '5',
  name: '내 첫 왁뿌볼',
  modelUrl: null,
  thumbnailUrl: '/thumb.png',
  remainingBreakCount: 3,
  status: 'ACTIVE',
  acquiredType: 'CREATED',
  isMain: true,
  acquiredAt: '2026-07-03T10:10:00.000Z'
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MyWakppuballPage — state matrix', () => {
  it('loading: shows the loading text before the request resolves', () => {
    getMainWakppuball.mockReturnValue(new Promise<{ wakppuball: MainWakppuball }>(() => {})); // never settles
    renderWithRouter(<MyWakppuballPage />);
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
  });

  // scenarios.ts `hasMainWakppuball`: true → success, false → empty (404).
  it.each([{ hasMainWakppuball: true }, { hasMainWakppuball: false }])(
    'hasMainWakppuball=$hasMainWakppuball renders the matching state',
    async ({ hasMainWakppuball }) => {
      if (hasMainWakppuball) {
        getMainWakppuball.mockResolvedValue({ wakppuball: sampleMain });
        renderWithRouter(<MyWakppuballPage />);
        expect(await screen.findByText('내 첫 왁뿌볼')).toBeInTheDocument();
        expect(screen.getByText('남은 뿌시기 횟수: 3')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '매칭하기' })).toBeInTheDocument();
      } else {
        getMainWakppuball.mockRejectedValue(
          new ApiError('MAIN_WAKPPUBALL_NOT_FOUND', '저장된 대표 왁뿌볼이 없습니다.')
        );
        renderWithRouter(<MyWakppuballPage />);
        expect(await screen.findByText(/아직 저장된 왁뿌볼이 없어요/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '나의 왁뿌볼 만들기' })).toBeInTheDocument();
      }
    }
  );

  it('error: non-404 failure shows the error message and retry button', async () => {
    getMainWakppuball.mockRejectedValue(new ApiError('INTERNAL_SERVER_ERROR', '서버 오류가 발생했습니다.'));
    renderWithRouter(<MyWakppuballPage />);
    expect(await screen.findByText('서버 오류가 발생했습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('Phase 3: creating a wakppuball moves empty → success', async () => {
    // First load (useEffect) → empty; after create, load() re-reads → success.
    getMainWakppuball
      .mockRejectedValueOnce(new ApiError('MAIN_WAKPPUBALL_NOT_FOUND', 'none'))
      .mockResolvedValueOnce({ wakppuball: sampleMain });
    const created: CreatedWakppuball = {
      ownedId: '10',
      modelId: '5',
      name: '내 첫 왁뿌볼',
      modelUrl: null,
      thumbnailUrl: '/thumb.png',
      isMain: true,
      remainingBreakCount: 3,
      status: 'ACTIVE',
      createdAt: '2026-07-03T10:10:00.000Z'
    };
    createWakppuball.mockResolvedValue({ wakppuball: created });

    renderWithRouter(<MyWakppuballPage />);
    const createButton = await screen.findByRole('button', { name: '나의 왁뿌볼 만들기' });
    await userEvent.click(createButton);

    expect(await screen.findByText('내 첫 왁뿌볼')).toBeInTheDocument();
    expect(createWakppuball).toHaveBeenCalledWith(
      expect.objectContaining({ setAsMain: true, customization: expect.any(Object) })
    );
  });
});
