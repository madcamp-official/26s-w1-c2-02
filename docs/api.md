# 캠퍼스 왁뿌볼 API 문서 초안

## 기본 규칙

- Base URL: `/api`
- 인증 방식: `Authorization: Bearer <accessToken>`
- 요청/응답 포맷: JSON
- 시간 포맷: ISO 8601 문자열
- ID 타입: 서버에서는 `bigint`, API에서는 문자열로 반환

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
    "createdAt": "2026-07-03T10:00:00.000Z"
  }
}
```

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
    "modelUrl": "https://example.com/models/5.glb",
    "thumbnailUrl": "https://example.com/thumbnails/5.png",
    "customization": {
      "bodyColor": "#f3d35b",
      "face": "smile",
      "accessory": "none"
    },
    "fracture": {
      "preset": "basic-crack-01",
      "pieceCount": 12
    },
    "interactionState": {
      "damageLevel": 0,
      "pressedPoints": []
    },
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

### 왁뿌볼 생성/저장

`POST /wakppuballs`

```json
{
  "name": "노란 왁뿌볼",
  "modelUrl": "https://example.com/models/temp.glb",
  "thumbnailUrl": "https://example.com/thumbnails/temp.png",
  "customization": {
    "bodyColor": "#f3d35b",
    "face": "smile",
    "accessory": "none"
  },
  "fracture": {
    "preset": "basic-crack-01",
    "pieceCount": 12
  },
  "setAsMain": true
}
```

```json
{
  "wakppuball": {
    "ownedId": "10",
    "modelId": "5",
    "name": "노란 왁뿌볼",
    "isMain": true,
    "createdAt": "2026-07-03T10:10:00.000Z"
  }
}
```

### 왁뿌볼 인터랙션 상태 저장

`PATCH /wakppuballs/:ownedId/state`

```json
{
  "interactionState": {
    "damageLevel": 2,
    "pressedPoints": [
      {
        "x": 0.12,
        "y": 0.4,
        "z": -0.2,
        "strength": 0.8
      }
    ],
    "brokenPieceIds": ["piece-01", "piece-04"]
  }
}
```

```json
{
  "ok": true
}
```

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
      "thumbnailUrl": "https://example.com/thumbnails/5.png",
      "acquiredType": "CREATED",
      "isMain": true,
      "acquiredAt": "2026-07-03T10:10:00.000Z"
    },
    {
      "ownedId": "11",
      "modelId": "8",
      "name": "친구의 왁뿌볼",
      "thumbnailUrl": "https://example.com/thumbnails/8.png",
      "acquiredType": "MATCHED",
      "acquiredFrom": {
        "id": "2",
        "username": "yoobin"
      },
      "isMain": false,
      "acquiredAt": "2026-07-03T11:00:00.000Z"
    }
  ]
}
```

### 대표 왁뿌볼 선택

`POST /collection/:ownedId/select-main`

```json
{
  "ok": true,
  "mainWakppuballId": "11"
}
```

주요 에러:

| Status | code | 상황 |
|---|---|---|
| 404 | `OWNED_WAKPPUBALL_NOT_FOUND` | 내 컬렉션에 없는 왁뿌볼 |

## 매칭 Matching

### 매칭 대기열 입장

`POST /matching/queue`

```json
{
  "wakppuballOwnedId": "10"
}
```

```json
{
  "status": "WAITING",
  "queueId": "100",
  "enteredAt": "2026-07-03T12:00:00.000Z"
}
```

매칭이 즉시 성사된 경우:

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
    "thumbnailUrl": "https://example.com/thumbnails/12.png"
  }
}
```

주요 에러:

| Status | code | 상황 |
|---|---|---|
| 400 | `MAIN_WAKPPUBALL_REQUIRED` | 저장된 왁뿌볼이 없어 매칭 불가 |
| 409 | `ALREADY_IN_QUEUE` | 이미 매칭 대기 중 |

### 매칭 대기열 이탈

`DELETE /matching/queue`

```json
{
  "ok": true
}
```

### 매칭 상태 조회

`GET /matching/status`

```json
{
  "status": "WAITING",
  "queueId": "100",
  "enteredAt": "2026-07-03T12:00:00.000Z"
}
```

가능한 상태:

| status | 의미 |
|---|---|
| `NONE` | 매칭 대기 중이 아님 |
| `WAITING` | 매칭 대기 중 |
| `MATCHED` | 매칭 성사, 교환 확인 대기 |
| `EXCHANGED` | 교환 완료 |

### 왁뿌볼 교환 확정

`POST /matching/:matchId/exchange`

```json
{
  "confirm": true
}
```

```json
{
  "ok": true,
  "receivedWakppuball": {
    "ownedId": "13",
    "modelId": "8",
    "name": "파란 왁뿌볼",
    "thumbnailUrl": "https://example.com/thumbnails/8.png",
    "acquiredType": "MATCHED"
  }
}
```

## 3D 모델 업로드

초기 MVP에서는 직접 파일 업로드 API를 만들지 않고, 서버가 임시 `modelUrl`/`thumbnailUrl`을 받는 방식으로 시작해도 된다.

실서비스 단계에서는 아래 API를 추가하는 것을 권장한다.

| Method | Endpoint | 설명 |
|---|---|---|
| `POST` | `/assets/upload-url` | S3 presigned URL 발급 |
| `POST` | `/assets/commit` | 업로드 완료 후 모델 메타데이터 확정 |

## 추후 확장 후보

- 학교 이메일 인증
- GPS 기반 캠퍼스 인증
- 매칭 취소/거절
- 받은 왁뿌볼과 만든 왁뿌볼 필터
- 왁뿌볼 손상 상태 초기화
- 랭킹/업적/방문 기록
