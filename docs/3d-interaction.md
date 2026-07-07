# 3D 왁뿌볼 상호작용 — 작업 현황 & 이어서 하기 (handoff)

React Three Fiber로 대표 왁뿌볼(메인 화면)을 3D 렌더링하고 굴리기/줌/누르기
상호작용을 구현하는 작업의 진행 문서. **fresh Claude Code thread에서 이어서
작업할 때 이 문서부터 읽을 것.** 원래 작업 지시(Phase 1~9 로드맵)는 3D 에셋
리포에서 온 별도 프롬프트에 있었고, 그 요약과 실제 구현 상태를 여기 정리한다.

관련 문서: `CLAUDE.md`(프로젝트 규칙), `frontend/src/assets/models/3d-asset-contract.md`
(에셋 계약서 — 조각/머티리얼 규격), `docs/api.md`(`break`/`session-end` 등 서버 계약).

---

## 핵심 파일

- **`frontend/src/features/wakppuball/WakppuballViewer.tsx`** — Canvas + 모델 로드
  + 회전/줌 + 프레스(크랙/뎁레스/퍼짐/스쿼시) + break 서버 연동 + 터치 사운드 전부.
  `forwardRef`로 감싸져 있고 `{ ownedId, remainingBreakCount }` prop을 받으며,
  ref로 `{ flushBreakReport(): Promise<void> }`를 노출한다(로그아웃이 이걸 기다림).
  상호작용을 손대려면 여기.
- `frontend/src/features/wakppuball/MyWakppuballPage.tsx` — `success` 상태에서만
  `<WakppuballViewer key={ownedId} ref={viewerRef} ownedId={…} remainingBreakCount={…} />`를
  렌더. **`key`가 필수** — 없으면 대표 왁뿌볼을 교체해도 리액트가 인스턴스를 재사용해서
  이전 공의 `poppedPieces`/리포트 상태가 새 공으로 새어나간다(아래 함정 7번).
  컬렉션 타일·생성 미리보기·매칭 결과 화면은 **의도적으로 3D를 안 씀** — `WakppuballView`가
  `assets/models/index.ts`의 `SHAPE_MODEL_ASSETS`를 조회하는데 이건 비워둔 채라 항상
  `WakppuballVisual`(CSS 2D) 폴백으로 빠진다. 3D는 메인 화면 상호작용 영역 하나뿐.
- `frontend/src/features/wakppuball/wakppuballApi.ts` — `breakWakppuball(ownedId, {keepalive})`만
  남음. `sessionEndMainWakppuball`은 제거됨(아래 Phase 4.5).
- `backend/src/modules/wakppuballs/wakppuballs.routes.ts` — `POST /:ownedId/break`만
  남음(`/me/main/session-end`는 제거). `docs/api.md` 계약대로 `remainingBreakCount` 차감,
  0이 돼도 `status`는 계속 `ACTIVE`.
- `backend/src/modules/matching/matching.routes.ts` — `createOrRefillMatchedOwnedWakppuball`
  (기존 `createMatchedOwnedWakppuball`을 교체, 아래 Phase 4.5).
- `frontend/src/shared/sound/` — `soundManager.ts`(재생 함수), `useButtonClickSound.ts`
  (전역 delegated 클릭 리스너, `App.tsx`에서 1회 마운트), `useBgmToggle.ts`(BGM on/off 상태).
- `frontend/src/features/wakppuball/MyWakppuballPage.test.tsx` — jsdom엔 WebGL이
  없어서 `WakppuballViewer`를 stub으로 mock 처리(`vi.mock('./WakppuballViewer', …)`,
  `forwardRef`로 감싸야 ref 관련 경고가 안 남).
- `frontend/src/styles.css` — `.wakppuball-viewer`(Canvas가 부모 크기 없으면 접혀서
  높이만 기능적으로 지정, 비주얼은 Beautify 단계로 미룸), `.wakppuball-viewer-hint`,
  `.home-topbar-group`.
- 에셋: `frontend/src/assets/models/wakppuball-base.glb`(Draco, 40조각),
  `pattern-dots.png`, `pattern-stripes.png`, `frontend/public/sound_effect/*`.

---

## 완료된 것

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

### Phase 4 — 세션 종료 break API 연동 (완료, 이후 수정됨 — 아래 참고)
- **`break`**: `poppedPieces`가 하나라도 있으면 **1회만**(세션당 최대 1회, `reportedRef`로
  가드) `POST /wakppuballs/:ownedId/break` 호출. 두 가지 트리거로 나눠서 처리:
  - **인앱 unmount** (다른 라우트로 이동, 또는 대표 왁뿌볼 교체로 `key`가 바뀌어
    강제 리마운트) → 일반 `useEffect` cleanup에서 처리. 페이지가 살아있으므로
    `keepalive` 불필요.
  - **진짜 탭 종료/새로고침** → React unmount 자체가 안 돈다(JS 실행이 그냥 끊김).
    `window.addEventListener('pagehide', …)`로 감지하고 `fetch`에 `keepalive: true`를
    넘겨서 페이지가 죽은 뒤에도 요청이 살아남게 함(`docs/api.md`가 명시적으로
    권장하는 방식).
- **백엔드**: `backend/src/modules/wakppuballs/wakppuballs.routes.ts`의 라우트를
  501 스텁에서 실제 구현으로 교체. 에러 코드(`NO_BREAK_COUNT_LEFT` 등)까지 `docs/api.md`
  그대로 맞춤. `ApiError` union에 `NO_BREAK_COUNT_LEFT` 추가(`common/api-error.ts`).
- `remainingBreakCount`는 여전히 프론트 상태로 노출 안 함(응답은 받되 UI에 안 씀) —
  이 부분은 원래 계획대로 유지.

### Phase 5 — 실기기 터치 검증: **패스**
사람 판단으로 스킵 확정. 재개하려면 여기 다시 적어둘 것.

### Phase 4.5 — 로그아웃 버그 수정 + count=0 동작 변경 + 매칭 중복 버그 수정 + 사운드 (완료, 2026-07-07)

**로그아웃 시 `break`가 401로 실패하던 버그 고침.** 원인은 아래 "알려진 버그"였던
그대로: `signOut()`이 토큰을 지운 **뒤에** `WakppuballViewer`가 언마운트되면서 그
cleanup의 `breakWakppuball()`이 토큰 없이 나갔음. 고친 방법은 문서에 적어뒀던 방향
(a) 그대로 — `WakppuballViewer`를 `forwardRef`로 바꿔 `flushBreakReport(): Promise<void>`를
`useImperativeHandle`로 노출하고, `MyWakppuballPage.handleLogout`이 `signOut()`을
부르기 **전에** `await viewerRef.current?.flushBreakReport()`로 먼저 기다린다.
`sessionEndMainWakppuball`은 아래 이유로 통째로 제거됐으므로 로그아웃 시 그건 더
이상 호출 안 함.

**`remainingBreakCount === 0`이어도 컬렉션에서 안 사라지게 스펙 변경.** 기존엔
`session-end`가 "0인 채로 대표에서 내려가면 `CONSUMED`"였는데, 이제 그 자체가
없어졌다 — `POST /wakppuballs/me/main/session-end` 라우트와 프론트 호출부를
**전부 제거**(로그아웃/`pagehide` 어느 쪽에서도 더 이상 안 부름). 0이 되면 하는 일은:
- `WakppuballViewer`가 `remainingBreakCount` prop(로드 시점 값, 세션 내 라이브 갱신
  아님)이 `<= 0`이면 `interactionDisabled=true` → `handlePointerDown`이 조기 리턴,
  터치로 조각을 더 못 뿌심(회전/줌은 그대로 됨). 안내 문구
  ("뿌시기 횟수를 다 썼어요. 만지고 돌려볼 수는 있어요.")로 대체 표시.
- 소멸(`CONSUMED`)은 이제 **오직** `select-main`으로 다른 볼로 교체하는 순간(기존
  Phase 4 select-main 로직, 안 건드림) 아니면 아래 매칭 리필에서만 상태가 바뀐다.

**매칭 중복 생성 버그 수정**: `backend/src/modules/matching/matching.routes.ts`의
`createMatchedOwnedWakppuball`이 매칭될 때마다 무조건 새 `UserWakppuball` row를
만들고 있었음 — 같은 상대와 여러 번 매칭하면 그 상대의 왁뿌볼이 컬렉션에 계속
쌓이는 버그. `createOrRefillMatchedOwnedWakppuball`로 교체: `(ownerUserId,
acquiredFromUserId)`로 기존 row를 먼저 찾고, 있으면 `remainingBreakCount`를
`defaultBreakCount`로 리필(+ `status: ACTIVE`, `consumedAt: null`로 복구 — 이전에
`CONSUMED`였어도 되살아남) + `isMain`은 안 건드림, 없으면 새로 생성. DB에도
`@@unique([ownerUserId, acquiredFromUserId])`를 추가해서(마이그레이션
`20260707120000_dedup_matched_wakppuballs`, 기존 중복은 대표 우선·최신순으로
병합 후 인덱스 추가) 애플리케이션 레벨 가드가 뚫려도 DB가 막아줌.
추가로, 매칭이 성사되면 **양쪽이 보낸 자신의 왁뿌볼도** `remainingBreakCount`가
`defaultBreakCount`로 리셋됨(트레이드가 곧 충전) — curl로 두 테스트 계정을 만들어
매칭→분해(2로)→재매칭까지 end-to-end로 검증, 두 번째 매칭에서 `ownedId`가 그대로
재사용되고 count가 3으로 돌아오는 것 확인함.

**사운드**: `frontend/src/shared/sound/soundManager.ts`(+ `useButtonClickSound.ts`,
`useBgmToggle.ts`). 조각을 탭할 때마다(첫 뿌시기든 이미 뿌셔진 조각 재탭이든)
crack 3개 중 하나 + squeeze 4개 중 하나를 동시 재생(`WakppuballViewer.tsx`의
`handleUp` 확정-탭 지점). 버튼 클릭음은 개별 버튼에 안 걸고 `App.tsx`에 문서
레벨 delegated click 리스너 하나(`useButtonClickSound`)로 전체 `<button>`을
커버 — 새 버튼 추가돼도 자동 적용. BGM은 메인 화면 상단 스피커 아이콘 토글
(`useBgmToggle`), 기본 꺼짐(자동재생 정책상 리로드 후 기억해봐야 어차피 못 트니
영속화 안 함). 파일은 `sound_effect/`(레포 루트)에서 `frontend/public/sound_effect/`로
복사 — `.flac` 1개는 Safari `<audio>` 호환성 문제로 `afconvert -f WAVE -d LEI16`로
PCM16 `.wav`로 변환해서 사용(2026-07-07).

---

## 다음 작업 (로드맵, 순서 확정)

> 원래 로드맵의 Phase 6 이후 번호가 아래에서 한 칸씩 밀렸다 — 레이어 분리를
> 색상 커스터마이징보다 먼저 하기로 결정했기 때문(이유는 바로 아래 Phase 6 설명 참고).

- **Phase 6 — 레이어 분리 (outer/inner 이중 레이어)**: 지금은 기하학적으로 **한
  겹**이다 — `outer`/`inner`는 별도 오브젝트가 아니라 40조각 셸의 서로 다른 면
  (원래 구 표면 vs Cell Fracture로 생긴 hairline 단면)에 붙은 머티리얼 슬롯일
  뿐이라, 크랙이 나도 얇은 절단면만 살짝 드러난다. "초록 outer 조각이 크게
  벌어져서 그 안의 흰 inner가 보이는" 연출을 하려면 안쪽에 **실제로 존재하는
  구**가 있어야 한다.
  - **블렌더 재작업 불필요** — three.js 쪽에서 `<sphereGeometry>` + 흰색
    `<meshStandardMaterial roughness={0.25}>` 프리미티브 구를 40조각 셸 안쪽
    (반경은 조각 rest position보다 살짝 작게, 예 0.9~0.95)에 하나 추가하면 된다.
    별도 GLB export 없이 순수 코드로 끝남.
  - 난이도 대부분은 "조각이 크게 벌어지는 느낌" 튜닝에 있음: 지금 프레스 로직은
    조각을 **안쪽으로 누르는(compress)** 방향이라, "펼쳐져서 속이 보이는" 느낌을
    내려면 크랙된 조각을 **바깥쪽/접선 방향으로 더 크게** 밀어내도록 방향·크기를
    다시 튜닝해야 한다(조각이 꽃잎처럼 젖혀지는 느낌까지 원하면 이동만이 아니라
    회전/힌지가 필요해서 그만큼 더 어려움). 대략 반나절~하루 규모의 튜닝 작업으로
    추정.
  - 셸 지오메트리 자체를 "분리·폭발시키지 않는다"던 `3d-asset-contract.md` §2의
    원 전제를 넘어서는 방향이라는 점은 인지하고 진행할 것(기술적으로 막을 요소는
    없음, 스코프가 넓어지는 것뿐).
- **Phase 7 — 색상 커스터마이징** (원래 Phase 6): `outerColor`/`innerColor`를
  주입. 레이어 분리를 먼저 하는 이유가 여기 있음 — 색상 주입은 전체 공에 같은
  색을 입히는 것이라 조각별 클론 없이 공유 머티리얼 2개(`outer`, `inner`)만
  건드리면 되는데, 안쪽 구를 나중에 추가하면 그 구의 머티리얼에도 `innerColor`를
  또 적용해줘야 한다. 레이어 분리를 먼저 해두면 "기존 `inner` 단면 머티리얼 + 새
  안쪽 구 머티리얼" 둘을 한 번에 같은 색상-주입 코드로 처리할 수 있다.
- **Phase 8 — 패턴(triplanar 셰이더)** (원래 Phase 7): dots/stripes 텍스처를
  커스텀 ShaderMaterial triplanar 투영. UV 사용 안 함.
- ~~Phase 9 — 뿌시기 효과음~~ **완료 (2026-07-07, Phase 4.5)**: 처음 계획은 Web Audio
  합성이었지만, 실제 사운드 파일이 `sound_effect/`로 전달되어 그걸 그대로 씀
  (`frontend/src/shared/sound/soundManager.ts`) — 위 Phase 4.5 참고. 버튼 클릭음/BGM
  토글도 같이 추가됨(원래 로드맵엔 없던 범위 확장).
- **Phase 10 — 눌림 텍스처 고도화** (원래 Phase 9, 후순위·선택): 크랙/뎁레스
  셰이딩 자연스럽게. 사람이 명시적으로 요청할 때만.

### 커밋 전 남겨둔 임시 요소 (정리 대상)
- `WakppuballViewer` 안 **"뿌셔진 조각: N개" / "뿌시기 횟수를 다 썼어요" 캡션**(`.wakppuball-viewer-hint`)은
  검증용 dev aid. 실제 UI로 교체하거나 Beautify 때 제거할 것.

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
7. **`key` 없이 prop만 바꾸면 컴포넌트가 재사용된다**: `<WakppuballViewer ownedId={…} />`를
   대표 왁뿌볼 교체마다 새 `ownedId`로 리렌더해도, 트리 위치가 같으면 리액트는
   언마운트하지 않고 같은 인스턴스에 새 prop만 준다. 그 결과 (a) `poppedPieces`/크랙
   상태가 이전 공에서 새 공으로 새어나가고, (b) `break` 리포트를 "1회만" 보내려던
   가드(`reportedRef`)가 첫 공 이후로 영원히 `true`로 남아 **두 번째 공부터는 리포트
   자체가 안 나간다.** `key={ownedId}`로 강제 리마운트해서 해결.
8. **헤드리스 Chrome이 `pagehide` 트리거 요청을 놓친다(`await page.goto()`로 기다리면)**:
   `pagehide` 핸들러 안에서 쏜 `fetch(..., {keepalive:true})`를 Puppeteer로
   검증할 때, 새 페이지로의 네비게이션을 `await`로 끝까지 기다리면 CDP가 그 요청을
   못 잡는다(옛 페이지의 네트워크 도메인이 너무 빨리 끊기는 것으로 보임). 네비게이션을
   기다리지 않고(`page.goto(url).catch(() => {})`, await 없이) 곧바로 짧은 폴링
   루프로 요청 목록을 확인해야 잡힌다. 실제 브라우저(사람이 쓰는 환경)에서는 이
   문제가 없음 — 순수하게 자동화 검증 스크립트의 타이밍 이슈.

---

## 실행 / 검증 방법

로그인/회원가입은 이제 **실제 백엔드**를 통한다(MSW 목업은 이번 스프린트에 완전히
제거됨). 풀 스택 기동 방법은 `docs/integration-testing.md` 참고 — 요약하면:

```bash
npm run db:dev              # Postgres (Docker)
npm run -w backend prisma:generate
npm run -w backend prisma:migrate
npm run dev:backend         # http://localhost:3000
npm run dev:frontend        # http://localhost:5173 (또는 다음 빈 포트)
```

- 회원가입 → 왁뿌볼 생성(대표로 설정) → 메인 화면에 3D 렌더.
- 조작: **드래그=회전, 스크롤/핀치=줌, 탭=조각 뿌시기, 누르고 홀드=스쿼시**.
- 테스트: `npm test -w frontend` (17 passing). 타입: `npx tsc -b`(프론트),
  `npx tsc --noEmit`(백엔드, `backend/`에서). 빌드: `npm run build`.
- Docker 없는 환경에서 백엔드까지 검증해야 하면: Homebrew로 `postgresql@16` 설치 →
  `LC_ALL="en_US.UTF-8" pg_ctl -D /opt/homebrew/var/postgresql@16 start`(macOS에서
  `LC_ALL` 안 주면 "became multithreaded during startup"로 기동 실패) → `backend/.env`의
  `DATABASE_URL`에 맞는 role/db 생성 → 위 마이그레이션/기동 순서 동일.
- 3D 상호작용/서버 연동 자동 검증: 세션 scratchpad에 `puppeteer-core`(시스템 Chrome
  구동)로 App.tsx에 임시 `/dev/3d-test` 라우트를 추가해 `WakppuballViewer`를 직접
  마운트하고, 마우스 이벤트로 프레스/크랙을 재현 → 스크린샷 또는 `fetch`
  가로채기로 `break`/`session-end` 호출을 검증했음. **검증 끝나면 반드시 App.tsx의
  임시 라우트를 되돌릴 것**(커밋에 남기지 않음).

---

## 상태 한 줄 요약
Phase 1~4 완료(회전/줌/프레스/크랙/스쿼시 + break 서버 연동), Phase 5(실기기 검증)는
패스로 확정, Phase 4.5(로그아웃 버그 수정 + count=0 시 컬렉션 유지로 스펙 변경 +
매칭 중복 생성 버그 수정/리필 + 사운드 전체)까지 완료. 다음은 **Phase 6(레이어 분리:
outer/inner를 실제 이중 레이어로 — 안쪽 구 추가 + 조각 벌어짐 튜닝)**, 그다음 Phase 7
(색상 커스터마이징)로 이어감. 튜닝 상수는 `WakppuballViewer.tsx` 상단에 모여 있음.
