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
  + 회전/줌 + **스쿼시 프레스(Phase 6.5, 아래)** + 크랙(tap) + break 서버 연동 +
  터치 사운드 전부. `forwardRef`로 감싸져 있고 `{ ownedId, remainingBreakCount }`
  prop을 받으며, ref로 `{ flushBreakReport(): Promise<void> }`를 노출한다(로그아웃이
  이걸 기다림). **튜닝 상수는 파일 상단(31~69행 부근)에 다 모여 있음** —
  `SHELL_COMPRESS`/`SHELL_EXPAND`/`CORE_COMPRESS`/`CORE_EXPAND`(스쿼시), `SHELL_INNER`
  (껍질 두께), `INNER_CORE_RADIUS`(안쪽 볼 크기), `PRESS_LERP`/`PRESS_RELEASE_RECOVERY`
  (스프링). 상호작용/비주얼을 손대려면 여기.
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
- (2026-07-07 추가 수정으로 더 단순해짐 — 아래 "Phase 4.6" 참고: `select-main`도
  더 이상 소멸시키지 않음. 지금은 자동으로 `CONSUMED`가 되는 경로가 없다.)

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
`useBgmToggle.ts`). 조각을 **누르는 순간**(`handlePointerDown`, 드래그로 이어져도
이미 재생됨) crack 4개 중 하나 + squeeze 4개 중 하나를 동시 재생 — 처음엔
`handleUp`(뗄 때)이었다가 "누를 때 나야 한다"는 피드백으로 Phase 4.6에서 이동함.
버튼 클릭음은 개별 버튼에 안 걸고 `App.tsx`에 문서 레벨 delegated click 리스너
하나(`useButtonClickSound`)로 전체 `<button>`을 커버 — 새 버튼 추가돼도 자동 적용.
BGM은 메인 화면 상단 스피커 아이콘 토글(`useBgmToggle`), 기본 꺼짐(자동재생
정책상 리로드 후 기억해봐야 어차피 못 트니 영속화 안 함). 파일은 `sound_effect/`
(레포 루트, 이후 삭제됨)에서 `frontend/public/sound_effect/`로 복사 — crack의
`.flac` 1개는 Safari `<audio>` 호환성 문제로 `afconvert -f WAVE -d LEI16`로 PCM16
`.wav`로 변환해서 포함(2026-07-07). button_click의 `glass_004.ogg`는 애초에 실물
파일 없이 코드에만 참조돼 있던 걸 발견해서 목록에서 제거(5개로 로테이션).

### Phase 4.6 — select-main 완전 비소멸화 + 매칭을 "생성한 고유 볼" 기준으로 전환 (2026-07-07)

Phase 4.5로 세션 종료 시 소멸은 없앴지만, **`select-main`으로 대표를 바꿀 때 여전히
"이전 대표가 0개 남았으면 CONSUMED"** 로직이 남아있었다 — 사람이 직접 재현해서 발견:
자기 대표 왁뿌볼을 뿌셔서 0을 만든 뒤 컬렉션의 다른 볼로 대표를 바꾸면 원래 볼이
컬렉션에서 통째로 사라짐(본인이 생성한 볼도 예외 없이). `collection.routes.ts`의
`select-main`에서 그 분기를 완전히 제거 — 이제 이전 대표는 `remainingBreakCount`와
무관하게 `isMain`만 해제되고 절대 `CONSUMED`되지 않는다. 결과적으로 지금 앱 전체에서
`CONSUMED`로 자동 전이되는 경로가 없어짐(스키마의 `CONSUMED`는 여전히 존재하지만
현재는 아무 코드도 도달하지 않는 상태 — 향후 다른 기능에서 쓰일 수 있어 남겨둠).

이어서 발견된 연쇄 버그: 볼이 사라지지 않게 막았더니, 컬렉션에 있는 볼 전부가
`remainingBreakCount 0`인 상태(위 버그로 이미 소멸된 대체 이력이 없어서)가 되면
매칭 자체가 `BREAK_COUNT_REQUIRED`로 막혀서 "매칭하면 count가 3으로 리셋된다"는
Phase 4.5 로직에 영영 도달할 수 없는 죽은 코드가 됨. 근본 원인은 매칭이 애초에
**"지금 대표로 설정된 볼"**(`isMain: true`)을 보내도록 설계돼 있었다는 것 — 사람의
요구사항은 "대표(뭘 볼지 고르는 것)와 무관하게, 내가 생성한 유일한 고유 왁뿌볼이
항상 매칭 정체성이어야 한다"였음. 고친 내용(`matching.routes.ts`):
- `findSelectedWakppuball(tx, ownerUserId, wakppuballOwnedId?)` → `findOwnCreatedWakppuball(tx, ownerUserId)`로 교체: `isMain`도 안 보고 body의 `wakppuballOwnedId` 파라미터도 완전히 제거, 오직 `acquiredType: 'CREATED'`인 자기 볼만 찾음(유저당 하나만 있다는 게 create UI의 암묵적 불변식이라 `orderBy: acquiredAt asc`로 결정적 선택 — DB에 강제하는 유니크 제약은 없음, 여러 개 생겨도 가장 오래된 걸 씀).
- `remainingBreakCount` 체크(`BREAK_COUNT_REQUIRED`) 완전 제거 — 매칭은 count와 무관하게 항상 진행. `findValidWaitingEntry`의 대기열 후보 유효성 검사에서도 동일하게 제거.
- `ApiError`의 `BREAK_COUNT_REQUIRED` 코드 자체를 삭제(더 이상 어디서도 throw 안 함).
- curl로 실제 검증: 자기 볼(count 0, 대표 아님) → 다른 유저와 매칭 성공 → 그 볼이 실제로 상대에게 전달되고 자기 count도 3으로 리셋되는 것까지 end-to-end 확인.

**신규 기능 — 이름 수정 2종:**
- `PATCH /wakppuballs/me/created` (`{ name }`): 생성한 고유 왁뿌볼 이름 수정. 매칭받은 볼은 대상이 아님(같은 `WakppuballModel` row를 원본 창작자와 공유하므로, 리시버가 바꾸면 원본 이름까지 바뀌어버림 — 그래서 `acquiredType: CREATED`로 제한).
- `PATCH /users/me` (`{ username }`): 유저네임 수정, 회원가입과 같은 정규식 재사용(`auth.routes.ts`의 `usernameSchema`를 export해서 공유), 중복 시 `409 USERNAME_ALREADY_EXISTS`.
- 프론트: 메인 화면 캡션의 볼 이름(단, `acquiredType === 'CREATED'`일 때만 연필 아이콘 노출 — 매칭 볼이 대표일 땐 숨김)과 "내 정보" 모달의 유저네임 옆에 각각 인라인 수정 폼(`.inline-edit-form`) 추가. 좁은 팝오버 폭(최소 200px)에서 input+버튼 2개가 한 줄에 다 안 들어가서 넘치는 걸 발견 — `flex-wrap`으로 input은 한 줄 통째로, 버튼 2개는 다음 줄에 나눠 갖도록 수정.

### Phase 6 + 6.5 — 이중 레이어 + 소프트바디 스쿼시 상호작용 (완료, 2026-07-08)

> 이 두 Phase는 한 세션에서 여러 번 방향이 바뀌며 이어졌다(레퍼런스: **말랑
> 사과 스퀴시볼** — 초록 조각 껍질 사이로 흰 젤리가 삐져나옴). 최종 결론만 아니라
> **버린 접근도** 아래 함정 9~12에 남겨둠(같은 삽질 반복 방지).

- **Phase 6 — 실제 안쪽 구 추가**: `<sphereGeometry>` + 흰색 `<meshStandardMaterial>`
  프리미티브 구를 셸 안쪽에 하나 추가(코드만, GLB 재작업 없음). 온전할 땐 껍질에
  가려 안 보이고, 눌러야/뿌셔야 드러남. 처음엔 크랙(tap-pop)이 조각을 바깥으로
  튕겨내며 속을 드러내는 방식이었음.
- **핵심 발견 — GLB 조각은 "속이 꽉 찬 웨지"다**: 조각 정점 반지름이 **0→1.0**
  (오렌지 알맹이처럼 중심까지 솔리드). 그래서 "outer가 너무 두껍고", 안쪽 볼을
  키워도 웨지에 파묻힘. → 로드 시 각 조각 정점을 **radial remap
  `r∈[0,1]→[SHELL_INNER,1]`** 해서 **속을 비워 얇은 껍질 세그먼트로** 만듦
  (`scene` useMemo 안, 지오메트리를 조각별로 clone 후 변형 — useGLTF 캐시 공유
  버퍼 오염 방지, `computeVertexNormals` + **`computeBoundingSphere` 필수**(함정 10)).
  이제 outer는 두께 ~0.22 껍질, 안쪽 볼(`INNER_CORE_RADIUS 0.74`)이 그 안을 채움.
- **상호작용 엔진 — 최종은 "스쿼시"** (`squashOffset`): 프레스 축
  `â = normalize(pressPoint)` 기준으로 각 점을 **축방향 성분(×`1−compress`)**과
  **수직 성분(×`1+expand`)**으로 분해 → 누른 방향으로 납작해지고 옆으로 퍼짐.
  **안쪽 볼은 `CORE_EXPAND`(0.6)로 껍질(`SHELL_EXPAND` 0.1)보다 훨씬 크게 수직
  확장**돼서 껍질을 뚫고 조각 사이 틈으로 삐져나옴("net 사이로 젤리"). 축방향
  압축은 껍질·안쪽 볼 동일(`0.22`)이라 축 방향으론 붙어 있음. 사람이 **전체 공
  스쿼시(글로벌, 반대쪽도 움직임)**를 선택.
- **크랙(tap-pop)**: 이제 껍질이 얇아서 조각을 크게 튕기면 이상함 → `CRACK_LIFT`
  /`CRACK_SLIDE`를 작게(0.05/0.08) 줄여 살짝 벌어지기만. break 카운트 소비 로직은
  그대로.
- **스프링/메모리폼**: `PRESS_LERP` 램프 + 릴리즈 시 `PRESS_RELEASE_RECOVERY`만큼만
  복귀(눌린 채 살짝 남음), 드래그(회전) 전환 시 완전 복귀(공 굴릴 땐 안 눌린 상태).
- **안쪽 볼은 흰색(`#ffffff`)** — 무채색 단계라 흰 젤리가 회색 껍질에 저대비지만,
  이건 **Phase 7이 껍질을 초록으로 칠하면 바로 레퍼런스처럼 살아남**(그래서 색상보다
  레이어/스쿼시를 먼저 한 것). 검증 땐 진단용으로 core를 주황(`#ff5a3c`)으로 잠깐
  칠해 "gap으로 젤리가 나오는지"를 눈으로 확인함.
- **검증**: 세션 scratchpad `puppeteer-core`(시스템 Chrome, foreground)로 임시
  `/dev/3d-test` 라우트에 `WakppuballViewer`를 직접 마운트 → 정면/측면 press-hold
  스크린샷으로 스쿼시·젤리 삐짐·드래그 리셋 확인. **임시 라우트/진단 색은 커밋 전
  되돌림.**

---

## 다음 작업 (로드맵) — **Phase 7~8은 다른 스레드에서 진행 예정**

- **Phase 7 — 색상 커스터마이징**: `outerColor`(껍질 초록 등)/`innerColor`(안쪽 볼)를
  주입. **주의**: 이제 칠할 대상이 셋이다 — ① 껍질 세그먼트의 outer 머티리얼 슬롯,
  ② 껍질 세그먼트의 inner(단면) 슬롯, ③ **새로 추가된 안쪽 구 머티리얼**(현재
  `color="#ffffff"` 하드코딩된 `<meshStandardMaterial>`). ③에 `innerColor`를 꼭 같이
  먹여야 "젤리 색"이 맞는다. 머티리얼은 40조각이 공유하므로 조각별 clone 없이 공유
  머티리얼만 건드리면 되지만, DoubleSide+공유라 색 오버라이드 시 clone 필요할 수
  있음(함정 2 참고). 저대비 이슈(흰 젤리/회색 껍질)가 여기서 해소됨.
- **Phase 8 — 패턴(triplanar 셰이더)**: dots/stripes 텍스처(`assets/models/pattern-*.png`)를
  커스텀 ShaderMaterial triplanar 투영. UV 안 씀. 껍질이 이제 얇은 세그먼트라 예전
  전제(한 겹 셸)와 지오메트리가 달라졌다는 점 인지하고 진행.
- ~~Phase 9 — 뿌시기 효과음~~ **완료 (2026-07-07, Phase 4.5)**: 실제 사운드 파일 사용
  (`frontend/src/shared/sound/soundManager.ts`). 버튼 클릭음/BGM 토글 포함.
- **Phase 10 — 눌림 텍스처 고도화** (후순위·선택): 크랙/스쿼시 셰이딩 자연스럽게.
  사람이 명시적으로 요청할 때만.

### 남은 튜닝/정리 대상 (Phase 7 스레드가 알아둘 것)
- **스쿼시 "느낌" 미세튜닝은 아직 확정 아님** — 방향(압축+퍼짐, 젤리 gap 삐짐)만
  확정됨. 상수(`SHELL_COMPRESS`/`SHELL_EXPAND`/`CORE_EXPAND`/`PRESS_*`)는 라이브로
  더 만질 수 있음. 색을 입히면 대비가 생겨 느낌 판단이 쉬워지니 Phase 7 후 재조정 권장.
- 안쪽 구 `<sphereGeometry>` 해상도는 **32×32**(매 프레임 CPU 정점 변형 + 노멀 재계산).
  bulge가 faceted해 보이면 48/64로 올리되 프레임 비용 확인.
- `WakppuballViewer` 안 **"뿌셔진 조각: N개"/"뿌시기 횟수를 다 썼어요" 캡션**(`.wakppuball-viewer-hint`)은
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
9. **GLB 조각은 속이 꽉 찬 웨지다(얇은 셸 아님)**: 정점 반지름이 0→1.0. "outer가
   두껍다"는 인상의 근본 원인. 얇게 하려면 정점을 radial remap해서 속을 비워야 함
   (Phase 6.5). 크기 상수만 만져선 안 됨 — 안쪽 볼을 키워도 솔리드 웨지에 파묻힌다.
10. **지오메트리 정점을 옮겼으면 `computeBoundingSphere()` 필수**: 껍질 hollowing 후
    이걸 안 불렀더니 레이캐스터가 **stale bounding sphere로 컬링**해서 프레스가 아예
    안 먹었다(눌러도 무반응, 팝도 안 됨). `computeVertexNormals()`와 같이
    `computeBoundingSphere()`(+`computeBoundingBox()`)도 호출할 것.
11. **스쿼시/필드 falloff는 각도(angular) 기준으로**: 프레스 포인트까지의 3D
    유클리드 거리로 falloff를 주면, 반지름이 다른 껍질·안쪽 볼이 **서로 다른 양만큼
    변형돼 교차(crossover)**한다(안쪽이 껍질을 뚫고 나오거나 파고듦). 프레스 축과의
    **각도**로 falloff를 주면 같은 각도의 두 점이 동일 변위를 받아 겹이 유지됨.
    (스쿼시는 축분해라 자연히 각도 기반이지만, dent/bulge류 필드 쓸 때 반드시 기억.)
12. **버린 접근들(다시 시도 말 것)**: (a) 조각을 변형 노멀에 맞춰 **회전**시키기 →
    각 조각을 제 중심으로 돌리니 이웃과 **seam이 벌어지고** 그 틈으로 속이 샘 → 조각은
    **translate만**. (b) 프레스에서 조각을 **바깥으로 밀어 젤리를 poke로 삐져나오게** →
    사람 피드백은 "poke가 아니라 눌린 방향 압축 + 옆으로 퍼짐"이라 스쿼시로 교체. (c)
    안쪽 볼을 셸과 **같은 반지름(~0.9)**에 두기 → 조각 centroid(0.907)와 거의 붙어
    z-fighting/삐짐. 확실히 아래로(0.74 등) 내려 마진 확보.

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
Phase 1~4.6 완료(회전/줌/프레스/크랙 + break 서버 연동 + 로그아웃 버그/매칭 버그
수정 + 사운드 + 이름 수정), Phase 5(실기기 검증) 패스. **Phase 6 + 6.5 완료
(2026-07-08)**: 실제 안쪽 구 추가 → GLB 조각이 솔리드 웨지임을 발견하고 **radial
remap으로 껍질을 얇게 hollowing** → 상호작용 엔진을 **소프트바디 스쿼시**(누른 방향
압축 + 수직 퍼짐, 안쪽 볼이 껍질보다 크게 퍼져 조각 틈으로 젤리처럼 삐져나옴,
말랑 사과 스퀴시볼 레퍼런스)로 재설계. 안쪽 볼은 흰색(무채색이라 저대비 — Phase 7이
색 입히면 살아남). **다음: Phase 7(색상 `outerColor`/`innerColor` — 안쪽 구 머티리얼
포함 3곳) + Phase 8(패턴 triplanar)은 별도 스레드에서 진행.** 스쿼시 "느낌" 미세튜닝
상수는 `WakppuballViewer.tsx` 상단에 모여 있고, 방향만 확정·수치는 재조정 여지 있음.
