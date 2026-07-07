# Current Sprint — Sprint 2: 내 정보 아이콘 + 위치 동의 기반 매칭 (confirmed 2026-07-06)

This file gets fully replaced each sprint. Past sprints are archived in `docs/sprint-history/`.
Stable cross-sprint rules live in `CLAUDE.md`; next-sprint candidates live in `docs/backlog.md`.

## This Sprint's Goal

1. 내 정보 아이콘 (`GET /users/me` 확장 — `totalAcquiredCount` 추가)
2. 위치 동의 기반 매칭 (`POST /matching/queue` 확장 — 좌표 필수, 캠퍼스 지오펜스 검증)
3. 매칭 아키텍처 원복: 동기 방식(즉시 `MATCHED`/`FAILED`) → `WAITING` 큐 + `GET /matching/status` 폴링 방식

## Explicitly Included / Excluded

**Included:**

- 내 정보 아이콘: `GET /users/me` 응답에 `totalAcquiredCount` 추가
- 위치 동의 기반 매칭: `POST /matching/queue`에 `latitude`/`longitude` 필수, 캠퍼스 지오펜스 검증, 위치 검증 시도 로그(좌표 자체는 저장하지 않음)
- 매칭 아키텍처 원복: `WAITING` 큐 + `GET /matching/status` 폴링(3초 권장) 부활, `POST /matching/:matchId/exchange` 제거

**Excluded (이번 스프린트에서 다루지 않음):**

- 공유 아이콘 관련 작업 — 취소됨. 실은 컬렉션 탭 아이콘이었고 별도 작업 불필요
- 위치 동의를 위한 별도 개인정보 동의 기록 API — 불필요, 브라우저 `navigator.geolocation` 권한 팝업으로 충분
- 실제 캠퍼스 중심 좌표/허용 반경 값 확정 — 이번 스프린트는 placeholder 값으로 구현, 실제 값은 별도 전달 예정
- 웹소켓 기반 실시간 매칭 — 검토 후 폴링 방식으로 대체하기로 결정, 미도입

## Phase-by-Phase Order

| Phase | Content | Files | API |
|---|---|---|---|
| 0 | `current-sprint.md` 갱신 (이 문서) | `docs/current-sprint.md` | - |
| 1 | `docs/api.md` 갱신 | `docs/api.md` | `GET /users/me`, `POST /matching/queue`, `GET /matching/status`, `POST /matching/:matchId/exchange`(삭제) |
| 2 | `CLAUDE.md` Backend Contract Notes 갱신 | `CLAUDE.md` | - |
| 3 | 백엔드 구현 (지오펜스, 큐/폴링, `totalAcquiredCount`) | `backend/src/**`, `backend/prisma/schema.prisma` | 위와 동일 |
| 4 | 프론트엔드 구현 (내 정보 모달, geolocation, 폴링 UI) | `frontend/src/**` | 위와 동일 |

## Notes / Decisions This Sprint

_Record decisions and any newly discovered backend rules here as the sprint runs.
Promote anything permanent to CLAUDE.md at sprint end._

### Customization schema finalized (2026-07-06)

Full spec now in `docs/api.md` ("왁뿌볼 커스터마이징 스키마" section). Summary:

- `customizationJson` structure is now `{ outerColor, innerColor, pattern: { type, id }, shape }`. The old `bodyColor`/`face`/`accessory` example (Sprint 1 placeholder) is fully retired.
- `pattern.type` only accepts `"preset"` for now; `"custom"` is rejected with `400 VALIDATION_ERROR` (custom user images are a future sprint).
- `pattern.id` allows a fixed preset list (`"dots"`, `"stripes"` today).
- `shape` is an enum, `"sphere"` only today, deliberately structured so more shapes are just more enum entries.
- **`modelUrl` is no longer accepted in the `POST /wakppuballs` request body.** The server derives it from `customization.shape` via an internal `shape → modelUrl` mapping table (`SHAPE_MODEL_URLS` in `backend/src/modules/wakppuballs/wakppuballs.routes.ts`) and only returns it in responses.
- `fractureJson` is now just `{ thicknessPreset: "thin" | "medium" | "thick" }`. `pieceCount` and `crackSoundUrl` are **not stored** — they're derived values the frontend computes from `thicknessPreset` via its own constant mapping table. The actual mesh/piece-count/naming contract with the 3D modeler is tracked as a placeholder in `docs/3d-asset-contract.md` until that's settled.
- `customization`/`fracture` remain optional on `POST /wakppuballs` (consistent with the existing "all fields optional" contract) — server fills `DEFAULT_CUSTOMIZATION`/`DEFAULT_FRACTURE` when omitted.
- Fixed a gap found while implementing this: `GET /collection` was not returning `customization`/`fracture` for owned items at all (blocking, since the collection screen needs them to render each ball). Now included in the response for every item, alongside the existing `POST /wakppuballs` response.
- No `schema.prisma` change was needed — `customization_json`/`fracture_json` were already generic `Json?` columns; only zod validation and response-mapping code changed.

### 내 정보 아이콘 + 위치 동의 기반 매칭 + 매칭 아키텍처 원복 (2026-07-06, 기획 스레드 확정)

사람이 미리 승인한 스펙. Phase 1(`docs/api.md`)·Phase 2(`CLAUDE.md`)에서 문서에 반영 예정, Phase 3~4에서 백엔드/프론트엔드 구현 예정 (아직 미구현).

**`GET /users/me`**

- `totalAcquiredCount`(number) 추가, `collectionCount` 옆에 위치.
- 지금까지 획득한 전체 누적 개수. `POST /wakppuballs` 성공 시 +1, 매칭 `MATCHED` 확정 시 양측 유저 모두 +1. `CONSUMED`되어 row가 삭제되어도 감소하지 않음(단조 증가, 파생값 아님 — 별도 컬럼으로 저장).

**`POST /matching/queue`**

- 요청 바디에 `latitude`/`longitude`(number) 필수 추가. `accuracy`는 받지 않음.
- 좌표 자체는 저장하지 않음 — 위치 검증 시도 결과(성공/실패 + 시각)만 별도로 로그 기록.
- 응답은 두 가지: 즉시 상대를 찾으면 `MATCHED`(기존 예시 응답 형식 그대로, exchange 단계 없이 파트너 왁뿌볼이 이미 내 컬렉션에 반영된 것으로 취급), 즉시 상대가 없으면 `WAITING` + `queueId` + `enteredAt`.
- 새 에러 `LOCATION_REQUIRED`(400, 좌표 미제공), `OUTSIDE_CAMPUS_AREA`(400, 좌표는 있으나 캠퍼스 허용 반경 밖) — 기존 에러 표 최상단, 최우선순위로 체크.
- 에러 체크 순서: 위치(`LOCATION_REQUIRED`/`OUTSIDE_CAMPUS_AREA`) → `MAIN_WAKPPUBALL_REQUIRED` → `BREAK_COUNT_REQUIRED` → `ALREADY_IN_QUEUE`/`WAKPPUBALL_CONSUMED` (앞에서 실패하면 뒤 조건은 확인 안 함).

**`GET /matching/status`**

- 더 이상 501 스텁이 아님 — 실제 구현. `NONE` / `WAITING`(+`queueId`+`enteredAt`) / `MATCHED`(+`matchId`+`partner`+`partnerWakppuball`) 3가지 상태.
- 클라이언트는 3초 간격 폴링 권장.

**`POST /matching/:matchId/exchange`**

- 완전 삭제(엔드포인트 자체가 없어짐). 매칭이 잡히는 즉시 파트너 왁뿌볼이 자동으로 컬렉션에 반영되므로 별도 confirm 단계가 없어짐.

**`DELETE /matching/queue`**

- 변경 없음.

**매칭 아키텍처**

- Sprint 1에서 결정했던 동기 방식(즉시 `MATCHED`/`FAILED`)에서 다시 `WAITING` 큐 + 폴링 방식으로 원복. 기존 매칭 상대 찾기 알고리즘 자체는 그대로 두고, 진입 조건에 위치 검증만 추가.
- 웹소켓은 검토했으나 채택하지 않기로 결정 — 폴링으로 대체.
- 캠퍼스 지오펜스(중심 좌표 + 허용 반경)는 서버 상수/설정값. **실제 좌표/반경 값 미확정 — Phase 3에서 placeholder 값 + TODO 주석으로 구현, 실제 값은 추후 별도 전달 예정.**
- 참고: 공유 아이콘 관련 논의는 취소(실은 컬렉션 탭 아이콘이었음), 위치 동의용 별도 개인정보 동의 기록 API도 불필요(브라우저 권한 팝업으로 충분) — 위 "Excluded" 참고.

### Phase 3~4 구현 체크리스트 (인수인계용 — API 문서/CLAUDE.md만 확정, 구현은 미착수)

`docs/api.md`·`CLAUDE.md`는 Phase 0~2에서 확정·커밋됨. 아래는 Phase 3(백엔드)·Phase 4(프론트엔드) 담당자/agent가 참고할 구현 태스크 목록 — 아직 코드는 작성되지 않았다.

**Phase 3 (백엔드)**

- `users` 테이블에 `total_acquired_count` 컬럼 추가 (기본값 0, Prisma 마이그레이션 필요)
- `POST /wakppuballs` 성공 트랜잭션에 `total_acquired_count +1` 로직 추가
- 매칭 `MATCHED` 확정 시점(즉시 매칭이든 큐에서 매칭이든) 양쪽 유저 모두 `total_acquired_count +1`
- 캠퍼스 지오펜스: 중심 좌표 + 허용 반경(m)을 서버 상수/설정값으로 추가. **실제 좌표/반경 값 미정 — placeholder 값 + TODO 주석만 남기고, 실제 값은 별도 전달을 기다릴 것.**
- 위치 검증 로그: 좌표는 저장하지 말고 `(user_id, passed: boolean, checked_at)` 정도의 간단한 테이블/로그로 구현 (스키마는 구현자 재량)
- 매칭 로직: 기존 매칭 상대 찾기 알고리즘은 그대로 두고, 진입 조건에 위치 검증만 추가. 큐/폴링 아키텍처로 재구현 (동기식 session/exchange 로직 제거)
- `GET /matching/status` 구현 (501 스텁 해제)
- `POST /matching/:matchId/exchange` 라우트 완전 제거

**Phase 4 (프론트엔드)**

- 내 정보 아이콘: 메인 화면 좌상단 아이콘 → 모달 컴포넌트 (이름/보유/누적 + 로그아웃 버튼, 로그아웃은 기존 구현 재사용)
- 매칭 진입 시 `navigator.geolocation`으로 좌표 획득(브라우저 네이티브 권한 팝업) → 실패 시 `LOCATION_REQUIRED` 대응 메시지, 성공 시 좌표 포함해 `POST /matching/queue` 호출
- `WAITING` 응답 시 `GET /matching/status`를 3초 간격 폴링, `MATCHED` 받으면 폴링 중단하고 결과 화면으로 전환
- `OUTSIDE_CAMPUS_AREA` 에러 메시지 처리 추가

**참고**: 공유 아이콘 관련 작업은 불필요(컬렉션 탭 아이콘이었음), 위치 동의용 별도 개인정보 동의 기록 API도 불필요.

---

**Previous sprint:** Sprint 1 (Frontend MVP) — see `docs/sprint-history/sprint1-summary.md`.
Sprint 1 shipped signup/login, main screen, save, collection, and synchronous matching against a temporary mock API, plus component tests. Phase 7 (Beautify) was deferred.
