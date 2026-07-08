# AWS 배포 메모

## MVP 추천 구성

- Frontend: S3 + CloudFront 또는 AWS Amplify
- Backend: EC2 1대 + Docker
- Database: RDS PostgreSQL 또는 EC2 내부 PostgreSQL
- 3D model/thumbnail storage: S3
- HTTPS: ACM 인증서 + CloudFront 또는 ALB

## 무료 티어 주의점

- AWS 무료 플랜은 계정/서비스/기간/크레딧 조건에 따라 과금 조건이 달라질 수 있다.
- 배포 전 Billing alarm을 먼저 설정한다.
- S3, CloudFront, EC2, RDS는 사용량 초과 시 비용이 발생할 수 있다.

## 초기 배포 순서

1. Docker로 backend 이미지 빌드
2. EC2에 Docker 설치 후 backend 실행
3. PostgreSQL 연결
4. frontend 빌드 후 S3 또는 Amplify에 배포
5. API base URL 환경변수 연결
6. HTTPS와 도메인 연결

## CloudFront/ALB로 API를 프록시할 경우 주의 (실제 겪었던 버그)

`/api/*`를 CloudFront(또는 다른 CDN) 뒤에 두면, 기본 캐시 정책은 `Authorization`
헤더로 캐시 키를 구분하지 않는다 — 즉 유저 A의 `GET /users/me` 응답이 캐시된 뒤,
유저 B가 같은 URL로 접속하면 CloudFront가 "A의 응답"을 그대로 돌려줄 수 있다.
실제로 "링크에 접속했더니 다른 사람 계정으로 로그인되어 있다"는 버그가 이래서
발생했다.

- 서버 코드 쪽은 이미 모든 `/api/*` 응답에 `Cache-Control: no-store`를 붙이도록
  고쳐뒀다(`backend/src/app.ts`) — 표준을 지키는 캐시라면 이것만으로도 막힌다.
- 그래도 CloudFront 등 CDN을 앞에 둘 때는 `/api/*` behavior를 **캐시 비활성화
  (Managed-CachingDisabled 등)**로 설정하고, Origin Request Policy에서
  `Authorization` 헤더를 origin으로 그대로 전달하도록 설정할 것. 기본
  `CachingOptimized` 정책은 Authorization 헤더 자체를 캐시 키/origin 요청 모두에서
  누락시킬 수 있어 위 응답 헤더와 별개로 반드시 확인이 필요하다.
