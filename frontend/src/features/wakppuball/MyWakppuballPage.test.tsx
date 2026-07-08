import { forwardRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../shared/api/http';
import { renderWithRouter } from '../../test/renderWithRouter';
import { MyWakppuballPage } from './MyWakppuballPage';
import type { CreatedWakppuball, MainWakppuball } from './wakppuballApi';
import * as wakppuballApi from './wakppuballApi';

// Unit-test the component's loading/error/empty/success state machine by mocking
// the API layer.
vi.mock('./wakppuballApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./wakppuballApi')>();
  return { ...actual, getMainWakppuball: vi.fn(), createWakppuball: vi.fn() };
});
vi.mock('../../shared/auth/AuthContext', () => ({
  useAuth: () => ({
    status: 'authenticated',
    user: { id: '1', username: 'dohyun' },
    signIn: vi.fn(),
    signOut: vi.fn()
  })
}));

// The main-screen 3D stage mounts a real WebGL <Canvas>, which jsdom can't
// render. These tests cover page state logic, not 3D — stub it with a marker.
// forwardRef so MyWakppuballPage's ref={viewerRef} (used to flush a break
// report before logout) doesn't warn about refs on a plain function component.
vi.mock('./WakppuballViewer', () => ({
  WakppuballViewer: forwardRef((_props: unknown, _ref: unknown) => <div data-testid="wakppuball-viewer" />)
}));

const getMainWakppuball = vi.mocked(wakppuballApi.getMainWakppuball);
const createWakppuball = vi.mocked(wakppuballApi.createWakppuball);

const sampleMain: MainWakppuball = {
  ownedId: '10',
  modelId: '5',
  name: '내 첫 왁뿌볼',
  modelUrl: null,
  thumbnailUrl: '/thumb.png',
  customization: {
    outerColor: '#f3d35b',
    innerColor: '#ffffff',
    pattern: { type: 'preset', id: 'dots' },
    shape: 'sphere'
  },
  fracture: { thicknessPreset: 'medium' },
  isCampusMatch: false,
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

  it.each([{ hasMainWakppuball: true }, { hasMainWakppuball: false }])(
    'hasMainWakppuball=$hasMainWakppuball renders the matching state',
    async ({ hasMainWakppuball }) => {
      if (hasMainWakppuball) {
        getMainWakppuball.mockResolvedValue({ wakppuball: sampleMain });
        renderWithRouter(<MyWakppuballPage />);
        expect(await screen.findByText('내 첫 왁뿌볼')).toBeInTheDocument();
        expect(screen.getByText('남은 뿌시기 횟수 3')).toBeInTheDocument();
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
      customization: {
        outerColor: '#f3d35b',
        innerColor: '#ffffff',
        pattern: { type: 'preset', id: 'dots' },
        shape: 'sphere'
      },
      fracture: { thicknessPreset: 'medium' },
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
