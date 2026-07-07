# Sprint 3 Summary — UI Beautify + 3D 통합 기반 (archived)

Confirmed 2026-07-07, wrapped 2026-07-07. This is the archived record of Sprint 3.
Stable rules from this sprint were promoted to `CLAUDE.md` at sprint end.

## Goal (all delivered)

1. UI Beautify — 라바 램프 배경 애니메이션, Apple Liquid Glass 팝업/패널, 애플 기준 곡률, 버튼-오리진 팝업 등장 애니메이션
2. 컬렉션 → 대표 왁뿌볼 선택 — `POST /collection/:ownedId/select-main` 501 스텁 해제 + 프론트 연결
3. 3D 모델 통합 기반 — `WakppuballView` 추상화, GLB 로딩 파이프라인 구조 (실제 모델 파일 적용은 제외)

## What shipped

| Phase | Content | Key files |
|---|---|---|
| 1 | 라바 램프 배경: `body::before`/`::after` 두 blob 레이어, `--lava-*` 토큰, `prefers-reduced-motion` 대응 | `frontend/src/styles.css` |
| 2 | 글라스 UI + 곡률: `--radius-*`/`--glass-*` CSS 변수 도입, 모달·버튼·인풋·카드 전면 적용 | `frontend/src/styles.css` |
| 3 | 팝업 버튼-오리진 등장 애니메이션 + (요청에 따라) 하단 시트 → 아이콘 앵커 팝오버(모바일 화면 1/4 크기)로 전환 | `frontend/src/styles.css`, `MyWakppuballPage.tsx` |
| 4 | `select-main` 백엔드 구현 + 프론트 컬렉션 타일 선택 로직 | `backend/src/modules/collection/collection.routes.ts`, `frontend/src/features/collection/collectionApi.ts`, `MyWakppuballPage.tsx` |
| 5 | `WakppuballView`/`WakppuballVisual` 분리, `assets/models/index.ts` GLB 레지스트리, R3F 렌더링 구조 | `frontend/src/features/wakppuball/*`, `frontend/src/assets/models/index.ts`, `docs/3d-asset-contract.md` |

## Decisions (promoted to CLAUDE.md)

- `POST /collection/:ownedId/select-main` 동작: 이미 대표면 no-op, 기존 대표는 `remainingBreakCount`가 0일 때만 `CONSUMED`, 아니면 `isMain`만 해제.
- `WakppuballView`가 모든 왁뿌볼 렌더링의 표준 진입점 — `customization.shape` → `assets/models/index.ts`의 `SHAPE_MODEL_ASSETS` 조회 → 있으면 3D, 없으면(또는 실패 시) `WakppuballVisual`(CSS) 폴백.
- `--radius-*`/`--glass-*` CSS 변수 토큰이 표준 디자인 토큰으로 확정 — 신규 UI는 임의 값 대신 이 토큰을 재사용.

## Bugs found and fixed during this sprint

- **배경 미표시 버그**: `:root`에 `background`가 있으면 body의 `z-index:-1` 라바 램프 pseudo-엘리먼트가 항상 가려짐 (특이도 문제). 베이스 그라데이션을 `html`로 이동해 해결 — 배경 선언은 반드시 `html {}`에만 둘 것.
- **팝업 오리진 계산 버그**: `usePopOrigin`의 `useLayoutEffect`가 박스를 측정하는 시점에 `animation-fill-mode: both`가 이미 첫 키프레임(`scale(0.04)`)을 적용해서 측정값이 왜곡됨. 측정 직전 `animation: none`으로 껐다가 복원해서 해결.
- **3D 리스트 렌더링 버그(사전 방지)**: 같은 GLB를 여러 인스턴스(컬렉션 그리드)가 동시에 쓰면 three.js Object3D가 마지막 마운트에 "가로채기"당함 — `scene.clone()`으로 인스턴스별 복제해서 예방.
- **번들 크기 문제(푸시 전 점검 중 발견)**: `WakppuballView`가 `@react-three/fiber`/`@react-three/drei`/`three`를 직접 import하고 있어서, `SHAPE_MODEL_ASSETS`가 비어 있어 3D를 전혀 렌더링하지 않는 지금도 메인 번들에 약 308KB(gzip)가 항상 포함됐음. `Wakppuball3DCanvas.tsx`로 three 관련 코드를 전부 분리하고 `React.lazy()`로 불러오도록 변경 — 실제로 `modelUrl`이 있을 때만 해당 청크를 요청함. 메인 번들 60.68KB(gzip)로 축소, three.js는 별도 246.86KB 청크로 분리(현재는 요청되지 않음).

## Also discovered (out of scope, flagged separately)

- `@types/express`는 v5인데 실제 설치된 `express`는 v4라 `req.params[key]`가 `string | string[]`로 잘못 추론됨. `backend/src/modules/collection/collection.routes.ts`에서 로컬 `Array.isArray` 정규화로 우회, 근본 수정(버전 핀)은 별도 작업으로 분리(`docs/backlog.md`).

## Known gaps carried forward

- 실제 3D 모델 파일 미적용 — `SHAPE_MODEL_ASSETS`는 비어 있음, 팀메이트 전달 대기.
- 뿌시기 상호작용(누르기/깨짐), `remainingBreakCount` 차감/소멸 처리 — `break`/`session-end` API 501 유지.
- 커스터마이징 색상(`outerColor`/`innerColor`)을 3D 모델 머티리얼에 반영하는 방법 미정 — 3D 렌더링은 현재 모델러의 원본 머티리얼 그대로 사용.
- 로그인/회원가입 화면은 공용 토큰만 적용, 전체 리디자인은 안 함.
