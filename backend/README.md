# Backend

캠퍼스 왁뿌볼 API 서버입니다.

## 역할

- 회원가입/로그인
- 사용자별 왁뿌볼 보유 목록 관리
- 3D 모델 메타데이터 관리
- 컬렉션 대표 왁뿌볼 선택
- 매칭 대기열과 교환 기록 관리

## 추천 스택

- Node.js
- Express
- TypeScript
- PostgreSQL
- Prisma

## 개발 시작

```bash
npm install

# 1) .env 준비 (레포 루트의 .env.example 참고: DATABASE_URL, JWT_SECRET 등)
# 2) DB 기동 (레포 루트에서: npm run db:dev)

# 3) Prisma Client 생성 — 반드시 필요. 누락 시 @prisma/client import가 실패한다.
npm run prisma:generate

# 4) DB 스키마 마이그레이션 적용
npm run prisma:migrate

# 5) 개발 서버 실행
npm run dev
```

> `npm install` 이후 `prisma generate`를 실행하지 않으면 Prisma Client가 만들어지지 않아
> 서버가 뜨지 않는다. 스키마(`prisma/schema.prisma`)를 바꾼 뒤에도 다시 실행해야 한다.
