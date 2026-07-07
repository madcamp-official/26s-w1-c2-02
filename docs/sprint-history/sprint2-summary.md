# Sprint 2 Summary — 내 정보 아이콘 + 위치 동의 기반 매칭 (archived)

Confirmed 2026-07-06, wrapped 2026-07-07. This is the archived record of Sprint 2.
Stable rules from this sprint were promoted to `CLAUDE.md` → Backend Contract Notes during the sprint.

## Goal (all delivered)

1. 내 정보 아이콘 — `GET /users/me`에 `totalAcquiredCount` 추가, 프론트 내 정보 모달
2. 위치 동의 기반 매칭 — `POST /matching/queue`에 `latitude`/`longitude` 필수, 캠퍼스 지오펜스 검증, 위치 검증 로그(좌표 비저장)
3. 매칭 아키텍처 원복 — 동기식(즉시 `MATCHED`/`FAILED`) → `WAITING` 큐 + `GET /matching/status` 3초 폴링, `POST /matching/:matchId/exchange` 완전 제거

## What shipped

| Phase | Content | Key commits/files |
|---|---|---|
| 0–2 | 계약 확정 문서화 (`current-sprint.md`, `docs/api.md`, `CLAUDE.md`) | `docs/*`, `CLAUDE.md` (e1262c1) |
| 3 | 백엔드: 지오펜스(placeholder 중심좌표 + 반경 2000m), WAITING 큐/폴링, `totalAcquiredCount`, exchange 라우트 제거 | `backend/src/modules/**` (5d277e5) |
| 4 | 프론트: mock API 제거 + 실백엔드 통합, 내 정보/컬렉션 모달, geolocation → 큐 진입, 3초 폴링, 홈 화면 UI 초안(커스터마이징 생성 패널 포함) | `frontend/src/features/**` (d4edbda, ef92f4a) |

## Also landed this sprint

- **커스터마이징 스키마 확정** — `{ outerColor, innerColor, pattern: {type, id}, shape }`, `fracture`는 `{ thicknessPreset }`만 저장. 전체 스펙은 `docs/api.md` "왁뿌볼 커스터마이징 스키마" 섹션이 정본. `modelUrl`은 요청으로 받지 않고 서버가 `shape`에서 파생.
- `GET /collection`이 아이템별 `customization`/`fracture`를 반환하도록 수정 (컬렉션 렌더링 블로커였음).
- Sprint 1의 "커스터마이징 UI" 백로그 항목이 Phase 4 생성 패널(색상/패턴/두께 선택)로 함께 해소됨.

## Known gaps carried forward

- **캠퍼스 지오펜스 값은 placeholder** — `CAMPUS_CENTER` / `CAMPUS_RADIUS_METERS`(2000m)는 `backend/src/modules/matching/matching.routes.ts`의 상수. 실제 좌표/반경 별도 전달 대기.
- **여전히 501인 엔드포인트**: `GET /wakppuballs/me/main`(프론트는 `/users/me`+`/collection` 조합으로 대체 중), `POST /collection/:ownedId/select-main`, `POST /auth/logout`(프론트는 토큰 삭제만으로 처리), `POST /wakppuballs/:ownedId/break`, `POST /wakppuballs/me/main/session-end`.
- **Beautify(디자인 패스) 미착수** — Sprint 1부터 이월, Sprint 3에서 진행.
- 왁뿌볼 비주얼은 CSS 기반 임시 2D — 3D 모델 통합은 Sprint 3 기반 작업 후 진행.
