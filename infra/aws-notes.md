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
