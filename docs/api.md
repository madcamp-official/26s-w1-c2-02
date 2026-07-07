# 캠퍼스 왁뿌볼 API 문서 초안

## 기본 규칙

- Base URL: `/api`
- 인증 방식: `Authorization: Bearer <accessToken>`
- 요청/응답 포맷: JSON
- 시간 포맷: ISO 8601 문자열
- ID 타입: 서버에서는 `bigint`, API에서는 문자열로 반환

## MVP 상호작용 규칙

- 보유한 왁뿌볼은 대표 왁뿌볼로 설정되면 메인 상호작용 영역에 올라간다.
- rotate, zoom, 말랑이 누르기 같은 일반 상호작용은 프론트엔드에서 처리하고 서버에 저장하지 않는다.
- 왁스 뿌시기처럼 횟수를 소모하는 행동만 서버에 API 요청을 보내 `remainingBreakCount`를 1 줄인다.
- 깨진 정도, 눌린 위치, 조각별 손상 상태는 저장하지 않는다. 새로 접속하면 모델/프리셋 기준 상태로 다시 렌더링한다.
- `remainingBreakCount`가 0이 되면, 그 세션에서 이미 확정된 조각 상태(만졌던 조각들)는 유지된 채로 더 이상 뿌시기 상호작용(터치해서 새 조각 뿌시기)이 불가능해진다. rotate/zoom은 계속 가능하다.
- `remainingBreakCount`가 0이어도 컬렉션에서 절대 사라지지 않는다. `select-main`으로 다른 왁뿌볼로 대표를 바꿔도 이전 대표는 `isMain`만 해제될 뿐 `CONSUMED`되지 않는다 — 자동으로 `CONSUMED`가 되는 경로는 없다.
- 매칭은 항상 **호출자가 직접 만든(생성한) 고유 왁뿌볼**을 사용한다 — 지금 대표로 설정된 왁뿌볼이 무엇이든 상관없다. 대표(`isMain`)는 순수히 메인 화면에 무엇을 띄워서 상호작용할지 정하는 값이고, 매칭에 오가는 정체성은 항상 자신이 생성한 그 왁뿌볼이다.
- 매칭은 `remainingBreakCount`와 무관하게 항상 진행된다(0이어도 매칭 가능). 매칭이 성사되면 양쪽이 매칭에 사용한 자신의 왁뿌볼의 `remainingBreakCount`가 기본값(3)으로 리셋된다.
- 같은 상대와 다시 매칭되면 새 컬렉션 항목을 만들지 않고, 그 상대에게서 받은 기존 왁뿌볼의 `remainingBreakCount`를 기본값(3)으로 리필한다(이미 `CONSUMED`였어도 `ACTIVE`로 되돌아온다). 유저당 상대 1명에 대해 컬렉션 항목은 항상 하나뿐이다.

## 공통 에러 응답

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "요청값이 올바르지 않습니다."
  }
}
```

| HTTP Status | code | 의미 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 요청값 형식 오류 |
| 401 | `UNAUTHORIZED` | 로그인 필요 또는 토큰 만료 |
| 403 | `FORBIDDEN` | 접근 권한 없음 |
| 404 | `NOT_FOUND` | 리소스를 찾을 수 없음 |
| 409 | `CONFLICT` | 중복 유저네임, 이미 매칭 중 등 상태 충돌 |
| 500 | `INTERNAL_SERVER_ERROR` | 서버 오류 |

## 인증 Auth

### 회원가입

`POST /auth/signup`

```json
{
  "username": "dohyun",
  "password": "password123"
}
```

```json
{
  "user": {
    "id": "1",
    "username": "dohyun",
    "createdAt": "2026-07-03T10:00:00.000Z"
  },
  "accessToken": "jwt-access-token"
}
```

주요 에러:

| Status | code | 상황 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 유저네임/비밀번호 형식 오류 |
| 409 | `USERNAME_ALREADY_EXISTS` | 이미 사용 중인 유저네임 |

### 로그인

`POST /auth/login`

```json
{
  "username": "dohyun",
  "password": "password123"
}
```

```json
{
  "user": {
    "id": "1",
    "username": "dohyun"
  },
  "accessToken": "jwt-access-token"
}
```

주요 에러:

| Status | code | 상황 |
|---|---|---|
| 401 | `INVALID_CREDENTIALS` | 유저네임 또는 비밀번호 불일치 |

### 로그아웃

`POST /auth/logout`

클라이언트가 보관 중인 토큰을 삭제하는 방식이면 서버 응답은 단순 성공 처리로 둔다.

```json
{
  "ok": true
}
```

## 유저 Users

### 내 정보 조회

`GET /users/me`

```json
{
  "user": {
    "id": "1",
    "username": "dohyun",
    "mainWakppuballId": "10",
    "collectionCount": 3,
    "totalAcquiredCount": 5,
    "createdAt": "2026-07-03T10:00:00.000Z"
  }
}
```

`totalAcquiredCount`: 지금까지 획득한 전체 누적 개수. `POST /wakppuballs` 성공 시 +1, 매칭 `MATCHED` 확정 시 양측 유저 모두 +1. `CONSUMED`되어 컬렉션에서 사라져도 감소하지 않는 단조 증가 값이다 (`collectionCount`는 현재 보유 중인 개수라 감소할 수 있지만, `totalAcquiredCount`는 감소하지 않는다).

### 유저네임 수정

`PATCH /users/me`

```json
{
  "username": "newname"
}
```

`username` 규칙은 회원가입과 동일(`^[a-zA-Z0-9_]+$`, 2~20자).

```json
{
  "user": {
    "id": "1",
    "username": "newname"
  }
}
```

주요 에러:

| Status | code | 상황 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | username 형식 위반 |
| 409 | `USERNAME_ALREADY_EXISTS` | 이미 사용 중인 유저네임 |

## 왁뿌볼 Wakppuballs

### 대표 왁뿌볼 조회

`GET /wakppuballs/me/main`

로그인하지 않은 사용자는 기본 왁뿌볼 또는 비저장 임시 상태를 프론트에서 보여준다.

```json
{
  "wakppuball": {
    "ownedId": "10",
    "modelId": "5",
    "name": "내 첫 왁뿌볼",
    "modelUrl": "https://example.com/models/sphere.glb",
    "thumbnailUrl": "https://example.com/thumbnails/5.png",
    "customization": {
      "outerColor": "#f3d35b",
      "innerColor": "#ffffff",
      "pattern": {
        "type": "preset",
        "id": "dots"
      },
      "shape": "sphere"
    },
    "fracture": {
      "thicknessPreset": "medium"
    },
    "remainingBreakCount": 3,
    "defaultBreakCount": 3,
    "status": "ACTIVE",
    "willDisappearOnUnmount": false,
    "acquiredType": "CREATED",
    "isMain": true,
    "acquiredAt": "2026-07-03T10:10:00.000Z"
  }
}
```

주요 에러:

| Status | code | 상황 |
|---|---|---|
| 401 | `UNAUTHORIZED` | 로그인 필요 |
| 404 | `MAIN_WAKPPUBALL_NOT_FOUND` | 저장된 대표 왁뿌볼 없음 |

### 왁뿌볼 커스터마이징 스키마 (스프린트 2 확정)

`customization`은 `POST /wakppuballs` 요청/응답, `GET /wakppuballs/me/main`, `GET /collection` 등 왁뿌볼을 반환하는 모든 응답에 공통으로 쓰인다.

```json
{
  "outerColor": "#f3d35b",
  "innerColor": "#ffffff",
  "pattern": {
    "type": "preset",
    "id": "dots"
  },
  "shape": "sphere"
}
```

| 필드 | 검증 규칙 |
|---|---|
| `outerColor` / `innerColor` | 유효한 hex color(`#rrggbb`) 형식이어야 함 |
| `pattern.type` | 현재 `"preset"`만 허용. `"custom"`을 보내면 `400 VALIDATION_ERROR` (추후 스프린트에서 유저 커스텀 이미지 지원 예정) |
| `pattern.id` | 정해진 프리셋 목록 중 하나만 허용. 현재 목록: `"dots"`, `"stripes"` (프리셋이 늘어나면 이 목록만 갱신) |
| `shape` | 현재 `"sphere"`만 허용하는 enum (모양이 늘어나면 이 enum에만 값 추가) |

`modelUrl`은 클라이언트가 보내지 않는다. 서버가 `shape` 값을 보고 내부 매핑 테이블(`shape → modelUrl`)을 조회해 **응답에만** 채워서 반환한다. 현재 매핑 테이블에는 `"sphere"` 하나만 있다.

`fracture` 구조:

```json
{
  "thicknessPreset": "medium"
}
```

| 필드 | 검증 규칙 |
|---|---|
| `thicknessPreset` | `"thin"` / `"medium"` / `"thick"` 중 하나만 허용 |

`pieceCount`, `crackSoundUrl`은 서버에 저장하지 않는다. 둘 다 `thicknessPreset`으로부터 파생되는 값이라, 프론트엔드가 `thicknessPreset` 기준 상수 매핑 테이블로 직접 계산/조회한다. 조각(mesh) 개수·명명 규칙 등 3D 에셋과의 계약은 `docs/3d-asset-contract.md`에 별도로 기록한다.

### 왁뿌볼 생성/저장

`POST /wakppuballs`

```json
{
  "name": "노란 왁뿌볼",
  "thumbnailUrl": "https://example.com/thumbnails/temp.png",
  "customization": {
    "outerColor": "#f3d35b",
    "innerColor": "#ffffff",
    "pattern": {
      "type": "preset",
      "id": "dots"
    },
    "shape": "sphere"
  },
  "fracture": {
    "thicknessPreset": "medium"
  },
  "setAsMain": true
}
```

`defaultBreakCount`와 최초 `remainingBreakCount`는 서버가 서비스 규칙에 따라 부여한다. MVP에서는 모든 새 왁뿌볼에 `3`을 부여한다. `customization`/`fracture`를 생략하면 서버가 기본값을 채운다.

```json
{
  "wakppuball": {
    "ownedId": "10",
    "modelId": "5",
    "name": "노란 왁뿌볼",
    "modelUrl": "https://example.com/models/sphere.glb",
    "thumbnailUrl": "https://example.com/thumbnails/temp.png",
    "customization": {
      "outerColor": "#f3d35b",
      "innerColor": "#ffffff",
      "pattern": {
        "type": "preset",
        "id": "dots"
      },
      "shape": "sphere"
    },
    "fracture": {
      "thicknessPreset": "medium"
    },
    "isMain": true,
    "remainingBreakCount": 3,
    "status": "ACTIVE",
    "createdAt": "2026-07-03T10:10:00.000Z"
  }
}
```

### 내 왁뿌볼 이름 수정

`PATCH /wakppuballs/me/created`

호출자가 직접 생성한 고유 왁뿌볼의 이름만 바꾼다(`:ownedId` 없음 — 유저당 항상 하나뿐이라 특정할 필요가 없다). 매칭으로 받은 왁뿌볼은 이 엔드포인트로 바꿀 수 없다 — 원본 창작자와 모델 row를 공유하므로, 그쪽 이름까지 같이 바뀌는 걸 막기 위함이다.

```json
{
  "name": "새 이름"
}
```

```json
{
  "ok": true,
  "ownedId": "10",
  "name": "새 이름"
}
```

주요 에러:

| Status | code | 상황 |
|---|---|---|
| 404 | `OWNED_WAKPPUBALL_NOT_FOUND` | 생성한 왁뿌볼이 없음 |

### 왁뿌볼 뿌시기 카운트 차감

`POST /wakppuballs/:ownedId/break`

왁스 뿌시기처럼 횟수를 소모하는 상호작용이 확정될 때 호출한다. rotate, zoom, 말랑이 누르기처럼 횟수를 소모하지 않는 상호작용은 호출하지 않는다.

```json
{
  "interactionType": "WAX_BREAK"
}
```

```json
{
  "wakppuball": {
    "ownedId": "10",
    "remainingBreakCount": 2,
    "status": "ACTIVE"
  }
}
```

카운트가 0이 된 경우에도 `status`는 `ACTIVE`로 유지된다 — 위 "MVP 상호작용 규칙" 참고. 소멸(`CONSUMED`)은 이 엔드포인트가 아니라 `select-main`(교체 시점)에서만 일어난다.

주요 에러:

| Status | code | 상황 |
|---|---|---|
| 400 | `NO_BREAK_COUNT_LEFT` | 이미 남은 뿌시기 횟수가 0 |
| 404 | `OWNED_WAKPPUBALL_NOT_FOUND` | 내 보유 왁뿌볼이 아님 |
| 409 | `WAKPPUBALL_CONSUMED` | 이미 소멸된 왁뿌볼 |

## 컬렉션 Collection

### 내 컬렉션 조회

`GET /collection`

```json
{
  "items": [
    {
      "ownedId": "10",
      "modelId": "5",
      "name": "노란 왁뿌볼",
      "modelUrl": "https://example.com/models/sphere.glb",
      "thumbnailUrl": "https://example.com/thumbnails/5.png",
      "customization": {
        "outerColor": "#f3d35b",
        "innerColor": "#ffffff",
        "pattern": {
          "type": "preset",
          "id": "dots"
        },
        "shape": "sphere"
      },
      "fracture": {
        "thicknessPreset": "medium"
      },
      "acquiredType": "CREATED",
      "remainingBreakCount": 2,
      "status": "ACTIVE",
      "isMain": true,
      "acquiredAt": "2026-07-03T10:10:00.000Z"
    },
    {
      "ownedId": "11",
      "modelId": "8",
      "name": "친구의 왁뿌볼",
      "modelUrl": "https://example.com/models/sphere.glb",
      "thumbnailUrl": "https://example.com/thumbnails/8.png",
      "customization": {
        "outerColor": "#5b8ff3",
        "innerColor": "#ffffff",
        "pattern": {
          "type": "preset",
          "id": "stripes"
        },
        "shape": "sphere"
      },
      "fracture": {
        "thicknessPreset": "thin"
      },
      "acquiredType": "MATCHED",
      "acquiredFrom": {
        "id": "2",
        "username": "yoobin"
      },
      "remainingBreakCount": 3,
      "status": "ACTIVE",
      "isMain": false,
      "acquiredAt": "2026-07-03T11:00:00.000Z"
    }
  ]
}
```

`CONSUMED` 상태의 왁뿌볼은 컬렉션 목록에 포함하지 않는다.

### 대표 왁뿌볼 선택

`POST /collection/:ownedId/select-main`

```json
{
  "ok": true,
  "mainWakppuballId": "11"
}
```

기존 대표 왁뿌볼은 `remainingBreakCount`와 무관하게 `isMain`만 해제되고 컬렉션에 그대로 남는다 — 이 요청으로 무언가 `CONSUMED`되는 경우는 없다.

주요 에러:

| Status | code | 상황 |
|---|---|---|
| 404 | `OWNED_WAKPPUBALL_NOT_FOUND` | 내 컬렉션에 없는 왁뿌볼 |
| 409 | `WAKPPUBALL_CONSUMED` | 이미 소멸된 왁뿌볼 |

## 매칭 Matching

### 매칭 대기열 입장

`POST /matching/queue`

요청 바디에 `latitude`/`longitude`(number)가 필수다. 위치 동의 기반 매칭이므로 캠퍼스 허용 반경 밖이거나 좌표가 없으면 대기열 진입 자체가 거부된다. `accuracy` 값은 받지 않는다. 어떤 왁뿌볼을 보낼지 고르는 파라미터는 없다 — 항상 호출자가 생성한 고유 왁뿌볼로 자동 결정된다(위 "MVP 상호작용 규칙" 참고).

```json
{
  "latitude": 37.5665,
  "longitude": 126.9780
}
```

이미 대기 중인 상대가 매칭 조건에 맞으면 그 자리에서 바로 매칭이 성사된다. 별도 exchange 단계 없이, 이 시점에 파트너 왁뿌볼이 이미 내 컬렉션에 반영된 것으로 취급한다:

```json
{
  "status": "MATCHED",
  "matchId": "200",
  "partner": {
    "id": "2",
    "username": "yoobin"
  },
  "partnerWakppuball": {
    "ownedId": "12",
    "name": "파란 왁뿌볼",
    "modelUrl": "https://example.com/models/sphere.glb",
    "thumbnailUrl": "https://example.com/thumbnails/12.png",
    "customization": {
      "outerColor": "#4f8cff",
      "innerColor": "#ffffff",
      "pattern": {
        "type": "preset",
        "id": "dots"
      },
      "shape": "sphere"
    },
    "fracture": {
      "thicknessPreset": "medium"
    },
    "remainingBreakCount": 3
  }
}
```

상대에게서 받은 왁뿌볼은 상대 유저당 컬렉션에 항상 하나만 존재한다 — 같은 상대와 다시 매칭되면 새 항목을 만들지 않고 기존 항목의 `remainingBreakCount`를 3으로 리필한다(이미 `CONSUMED`였어도 `ACTIVE`로 되돌아온다). 매칭에 사용한 자신의 왁뿌볼도 이 시점에 `remainingBreakCount`가 3으로 리셋된다 — 위 "MVP 상호작용 규칙" 참고.

즉시 매칭 상대가 없으면 대기열에 들어간다:

```json
{
  "status": "WAITING",
  "queueId": "100",
  "enteredAt": "2026-07-03T12:00:00.000Z"
}
```

좌표 자체는 저장하지 않는다. 위치 검증 시도 결과(성공/실패 여부 + 시각)만 별도로 로그를 남긴다.

주요 에러 (아래 순서대로 확인하며, 앞 조건에서 실패하면 뒤 조건은 확인하지 않는다):

| Status | code | 상황 |
|---|---|---|
| 400 | `LOCATION_REQUIRED` | `latitude`/`longitude` 미제공 |
| 400 | `OUTSIDE_CAMPUS_AREA` | 좌표는 있으나 캠퍼스 허용 반경 밖 |
| 400 | `MAIN_WAKPPUBALL_REQUIRED` | 생성한 왁뿌볼이 없어 매칭 불가 |
| 409 | `ALREADY_IN_QUEUE` | 이미 매칭 대기 중 |
| 409 | `WAKPPUBALL_CONSUMED` | 이미 소멸된 왁뿌볼 |

### 매칭 대기열 이탈

`DELETE /matching/queue`

```json
{
  "ok": true
}
```

### 매칭 상태 조회

`GET /matching/status`

클라이언트는 3초 간격으로 폴링할 것을 권장한다.

대기열에도 없고 보여줄 매칭 결과도 없는 경우:

```json
{
  "status": "NONE"
}
```

대기 중인 경우:

```json
{
  "status": "WAITING",
  "queueId": "100",
  "enteredAt": "2026-07-03T12:00:00.000Z"
}
```

매칭이 성사된 경우 (`POST /matching/queue`의 `MATCHED` 응답과 동일한 형식):

```json
{
  "status": "MATCHED",
  "matchId": "200",
  "partner": {
    "id": "2",
    "username": "yoobin"
  },
  "partnerWakppuball": {
    "ownedId": "12",
    "name": "파란 왁뿌볼",
    "modelUrl": "https://example.com/models/sphere.glb",
    "thumbnailUrl": "https://example.com/thumbnails/12.png",
    "customization": {
      "outerColor": "#4f8cff",
      "innerColor": "#ffffff",
      "pattern": {
        "type": "preset",
        "id": "dots"
      },
      "shape": "sphere"
    },
    "fracture": {
      "thicknessPreset": "medium"
    },
    "remainingBreakCount": 3
  }
}
```

가능한 상태:

| status | 의미 |
|---|---|
| `NONE` | 매칭 대기 중이 아니고 보여줄 매칭 결과도 없음 |
| `WAITING` | 매칭 대기 중 |
| `MATCHED` | 매칭 성사. 별도 확인/교환 단계 없이 이미 완료된 상태 (파트너 왁뿌볼은 이미 컬렉션에 반영됨) |

## 3D 모델 업로드

초기 MVP에서는 직접 파일 업로드 API를 만들지 않고, 서버가 임시 `modelUrl`/`thumbnailUrl`을 받는 방식으로 시작해도 된다.

실서비스 단계에서는 아래 API를 추가하는 것을 권장한다.

| Method | Endpoint | 설명 |
|---|---|---|
| `POST` | `/assets/upload-url` | S3 presigned URL 발급 |
| `POST` | `/assets/commit` | 업로드 완료 후 모델 메타데이터 확정 |

## 추후 확장 후보

- 학교 이메일 인증
- 매칭 취소/거절
- 받은 왁뿌볼과 만든 왁뿌볼 필터
- 접속 종료 감지 실패 시 소멸 보정 작업
- 랭킹/업적/방문 기록
