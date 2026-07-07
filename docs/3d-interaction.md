# 3D 왁뿌볼 상호작용 — 작업 현황 & 이어서 하기 (handoff)

React Three Fiber로 대표 왁뿌볼(메인 화면)을 3D 렌더링하고 굴리기/줌/누르기
상호작용을 구현하는 작업의 진행 문서. **fresh Claude Code thread에서 이어서
작업할 때 이 문서부터 읽을 것.** 원래 작업 지시(Phase 1~9 로드맵)는 3D 에셋
리포에서 온 별도 프롬프트에 있었고, 그 요약과 실제 구현 상태를 여기 정리한다.

관련 문서: `CLAUDE.md`(프로젝트 규칙), `frontend/src/assets/models/3d-asset-contract.md`
(에셋 계약서 — 조각/머티리얼 규격).

---

## 핵심 파일

거의 모든 3D 로직은 **한 파일**에 있다:

- **`frontend/src/features/wakppuball/WakppuballViewer.tsx`** — Canvas + 모델 로드
  + 회전/줌 + 프레스(크랙/뎁레스/퍼짐/스쿼시) 전부. 상호작용을 손대려면 여기.
- `frontend/src/features/wakppuball/MyWakppuballPage.tsx` — `success` 상태에서
  `<WakppuballViewer />`를 렌더. (기존 2D `<img>`를 교체했음)
- `frontend/src/features/wakppuball/MyWakppuballPage.test.tsx` — jsdom엔 WebGL이
  없어서 `WakppuballViewer`를 stub으로 mock 처리(`vi.mock('./WakppuballViewer', …)`).
- `frontend/src/styles.css` — `.wakppuball-viewer`(Canvas가 부모 크기 없으면 접혀서
  높이만 기능적으로 지정, 비주얼은 Beautify 단계로 미룸).
- 에셋: `frontend/src/assets/models/wakppuball-base.glb`(Draco, 40조각),
  `pattern-dots.png`, `pattern-stripes.png`.

---

## 완료된 것 (Phase 1~3 + 프레스 고도화)

### Phase 1 — 에셋 반입 + 인탁트 렌더
- `useGLTF`로 GLB 로드, 무채색 그대로 렌더. 4-state(로딩/에러/빈값/성공):
  Suspense fallback + `ModelErrorBoundary`(둘 다 Canvas 안에서 `<Html>`로).

### Phase 2 — 회전/줌 + 제스처 구분
- drei `OrbitControls`(카메라 오빗)로 **드래그=회전, 스크롤/핀치=줌**(min/max
  거리 클램프, pan off). 오브젝트 자체 회전 대신 카메라 오빗 채택(더 단순, 승인됨).
- **회전 vs 누르기 구분은 "길이(length)" 기준**: 포인터가 `TAP_MOVE_THRESHOLD`(8px)
  넘게 움직이면 드래그(회전, OrbitControls가 처리), 안 넘으면 프레스로 확정.
  → **드래그로 공을 굴려도 조각이 안 뿌셔진다.** (원래 "누르는 즉시 크랙" 스펙을
  이 결정으로 릴리즈-확정 방식으로 조정함. area 기준 대신 length 기준 선택 이유:
  공이 화면을 꽉 채워서 "배경 드래그로 회전"이 어렵기 때문.)

### Phase 3 — 프레스 MVP + 고도화 (여러 겹으로 확장됨)
매 프레임 각 조각의 목표 위치를 **합성**해서 lerp로 부드럽게 접근:
```
position = restPosition
         + 영구 크랙 오프셋 (뿌셔진 조각이면)
         + 임시 프레스 오프셋 (프레스 중이면)   ← 조각별 압축+퍼짐
그리고 그 위에 부모 그룹 스케일(매크로 스쿼시)이 자동 합성됨
```
- **영구 크랙 (난이도 "하")**: 조각을 누르면 `poppedPieces`(세션 로컬 Set)에
  기록되고, 그 조각을 자기 radial 방향으로 `CRACK_DEPTH`만큼 **영구적으로**(세션
  동안) 안쪽 이동 → 틈이 벌어져 inner 머티리얼 노출. (색 어둡게 하던 방식은 제거,
  지오메트리 오프셋으로 교체.)
- **반경 기반 다중 조각 변형 (난이도 "중")**: 프레스 hit point 기준 `PRESS_RADIUS`
  안의 모든 조각에 smoothstep falloff weight 적용. 두 변형 동시:
  - 압축(inward radial): 세기 ∝ `weight` (중심에서 최대)
  - 퍼짐(tangential, hit point에서 멀어지는 접선 방향): 세기 ∝ `weight*(1-weight)`
    (falloff 중간에서 최대 → 중심은 눌림, 가장자리는 퍼짐)
- **매크로 스쿼시 & 스트레치**: 40조각의 부모 그룹(`scene`)에 임의 축 비균등
  스케일(`R·S·R⁻¹`) 적용 → 프레스 축 방향으로 납작, 수직으로 부풀림. 조각별
  오프셋과 완전 독립(부모-자식 자동 합성). 압축 축 = `normalize(hitPoint)`
  (이미 hitPoint를 부모 로컬 스페이스로 저장하므로 오브젝트 회전 자동 반영,
  별도 inverse-world-quaternion 불필요).
- **릴리즈 동작**:
  - 진짜 릴리즈(포인터 업, 임계값 내) → 크랙 확정 + **스쿼시를 대부분 유지**하고
    `SQUASH_RELEASE_RECOVERY`만큼만 살짝 복귀(말랑 메모리폼 느낌).
  - 드래그(회전)로 전환 → 스쿼시 **완전 복귀**(공 굴릴 땐 안 눌린 상태여야 함), 크랙 X.
- 조각 지오메트리는 **절대 안 건드림** — position/transform만. 각 마운트마다
  `scene.clone()`으로 인탁트 리셋.

### 현재 튜닝 상수 (파일 상단, 전부 조정용)
| 상수 | 값 | 의미 |
|---|---|---|
| `TAP_MOVE_THRESHOLD` | 8 | 이 px 넘으면 드래그(회전), 이하면 프레스 |
| `MIN_ZOOM_DISTANCE` / `MAX_ZOOM_DISTANCE` | 1.8 / 6 | 줌 클램프 |
| `PRESS_RADIUS` | 0.5 | 프레스가 영향 주는 반경(구 반지름 1 기준) |
| `COMPRESS_STRENGTH` | 0.12 | 조각 압축(안쪽) 세기 |
| `SPREAD_STRENGTH` | 0.25 | 조각 퍼짐(접선) 세기 |
| `POSITION_LERP` | 0.28 | 조각 위치 접근 속도(스프링감) |
| `CRACK_DEPTH` | 0.03 | 뿌셔진 조각 영구 함몰 깊이 |
| `SQUASH_AMOUNT` | 0.85 | 매크로 압축률(프레스 축, 1.0=완전 팬케이크라 미만 유지) |
| `SQUASH_EXPAND_K` | 0.5 | 수직 부풀림 비율 |
| `SQUASH_LERP` | 0.1 | 스쿼시 증가/복귀 속도 |
| `SQUASH_RELEASE_RECOVERY` | 0.15 | 릴리즈 시 복귀 비율(0=계속 눌림, 1=완전 복귀) |
| Canvas camera `z` | 4 | 부푼 공이 프레임에 들어오도록 뒤로 뺌 |

> 파라미터는 사람과 함께 튜닝 중. 완벽한 수치를 코드로 확정하려 하지 말 것.

---

## 아직 안 한 것 (다음 작업 후보, 원래 Phase 로드맵)

- **Phase 4 — 세션 종료 break API 연동**: `poppedPieces`가 하나라도 있으면 언마운트
  시 `POST /wakppuballs/:ownedId/break` **1회** 호출(세션당 최대 1회). 응답의
  `consumed`/`willDisappearOnUnmount` 처리, `remainingBreakCount`는 상태로만
  들고 UI엔 아직 노출 안 함. (`poppedPieces`는 이미 `WakppuballViewer`가 Canvas
  위 상태로 lift 해둠 → "뭔가 뿌셔졌나?"를 여기서 읽으면 됨.)
- **Phase 5 — 실기기 터치 검증**: 모바일 실기기/터치 시뮬로 제스처·성능 확인.
  여기서 핵심 상호작용(회전/줌/프레스) 최종 확정.
- **Phase 6 — 색상 커스터마이징**: `outerColor`/`innerColor`를 각 조각 outer/inner
  머티리얼에 주입. ⚠️ 40조각이 outer/inner 머티리얼 **2개를 공유**하므로, 색을
  넣으려면 조각별로 머티리얼을 clone 해야 함(크랙 로직에서 배운 교훈과 동일).
- **Phase 7 — 패턴(triplanar 셰이더)**: dots/stripes 텍스처를 커스텀 ShaderMaterial
  triplanar 투영. UV 사용 안 함.
- **Phase 8 — 뿌시기 효과음**: 조각 pop 순간(현재 `handleUp`의 pop 확정 지점)에
  Web Audio API로 합성한 짧은 크랙 사운드. 재생부는 별도 모듈로 분리(나중에 실제
  파일로 교체 쉽게).
- **Phase 9 — 눌림 텍스처 고도화(후순위, 선택)**: 크랙/뎁레스 셰이딩 자연스럽게.
  사람이 명시적으로 요청할 때만.

### 커밋 전 남겨둔 임시 요소 (정리 대상)
- `WakppuballViewer` 안 **"뿌셔진 조각: N개" 캡션**은 검증용 dev aid. Phase 4/Beautify
  때 제거하거나 실제 UI로 교체.
- `scenarios.ts`의 `hasMainWakppuball`은 **false로 커밋**했음. 3D 화면을 보려면
  dev에서 잠깐 `true`로 바꿔서 확인(seed 계정으로 로그인하면 대표 왁뿌볼이 보임).

---

## 발견한 함정들 (다시 안 밟게)

1. **R3F 루트 primitive 이벤트 재디스패치**: `<primitive>` 루트에 `onPointerDown`을
   달면 R3F가 교차된 조각마다(앞→뒤) 핸들러를 재호출해서, 그냥 `e.object`를 쓰면
   **맨 뒤(반대편) 조각**이 잡힌다. 반드시 `e.intersections[0].object`(가장 가까운
   것) + `e.stopPropagation()` 사용. (이거 때문에 크랙/뎁레스가 "적용은 됐는데 안
   보이는"(뒤쪽 조각에 걸림) 현상으로 한참 헤맴.)
2. **머티리얼 side = DoubleSide**: GLB의 outer/inner 둘 다 DoubleSide라 레이캐스트가
   앞뒤 다 맞음(그래서 nearest 정렬이 중요). 조각별 색/크랙 오버라이드하려면 공유
   머티리얼을 clone 해야 함(안 그러면 40조각 전부 같이 바뀜).
3. **매크로 스쿼시용 matrix 직접 관리**: `object.scale`은 축 정렬 스케일만 됨.
   임의 축 비균등 스케일은 `scene.matrixAutoUpdate=false`로 잡고 매 프레임
   `scene.matrix = base·R·S·R⁻¹` 직접 세팅 + `scene.matrixWorldNeedsUpdate=true`.
   조각 position(자식)은 각자 matrixAutoUpdate로 갱신되어 부모 스케일과 자동 합성.
4. **로컬/월드 스페이스**: hitPoint를 `node.parent.worldToLocal`로 조각 부모의
   로컬 스페이스에 저장 → 조각 rest position(로컬)과 직접 거리 비교 가능하고,
   압축 축 = `normalize(hitPoint)`가 곧 로컬 축이 됨. (OrbitControls는 카메라만
   돌리고 오브젝트는 안 돌리므로 대체로 world≈local이지만, 위 방식이면 회전 상태도
   안전.)
5. **Draco 디코더는 CDN에서 받음**: `useGLTF` 기본값이 gstatic CDN에서 Draco
   디코더를 가져옴 → dev에서 네트워크 필요. 완전 오프라인 필요하면 `/public`에
   디코더 self-host.
6. **헤드리스 스크린샷의 rAF 스로틀**: 백그라운드 탭에선 continuous 렌더가
   스로틀돼서 조각 변형이 스크린샷에 안 잡힐 수 있음(OrbitControls 회전은 invalidate
   때문에 잡힘). 검증 스크립트에서 헷갈리게 만든 원인. 실제 브라우저(포그라운드)에선
   정상.

---

## 실행 / 검증 방법

```bash
cd frontend && npm run dev
# http://localhost:5173, Chrome 권장(WebGL)
# seed 로그인: dohyun / password123
# 3D 화면 보려면 src/mocks/scenarios.ts 의 hasMainWakppuball 를 잠깐 true 로
```
- 조작: **드래그=회전, 스크롤/핀치=줌, 탭=조각 뿌시기, 누르고 홀드=스쿼시**.
- 테스트: `npm test -w frontend` (17 passing). 타입: `npx tsc -b`. 빌드: `npm run build`.
- 스크린샷 자동 검증: 세션 scratchpad에 `puppeteer-core`(시스템 Chrome 구동)로
  로그인 토큰 주입 후 캔버스 좌표에 마우스 이벤트 → 스크린샷 방식 사용했음.
  토큰은 `localStorage.accessToken = 'mock-access-token-1'`(MSW가 `mock-access-token-*`
  prefix면 인증 통과)로 로그인 UI 건너뜀.
```

---

## 상태 한 줄 요약
Phase 1~3(+프레스 고도화: 조각별 크랙/압축/퍼짐 + 매크로 스쿼시&스트레치, 말랑
메모리 릴리즈)까지 완료·검증. 다음은 **Phase 4(break API 연동)**. 튜닝 상수는
`WakppuballViewer.tsx` 상단에 모여 있음.
