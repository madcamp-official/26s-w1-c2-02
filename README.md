# 26s-w1-c2-02

## 공통과제 I : 웹 기반 프로젝트 (2인 1팀)

**목적:** 공통 과제를 함께 수행하며 웹 개발의 전체 흐름을 빠르게 익히고 협업에 적응하기

**결과물:** 기획부터 배포까지 완료된 웹 서비스와 관련 문서 일체

---

## 팀원

| 이름 | GitHub | 역할 |
|---|---|---|
| 김도현 | KimDoDohyeon |  |
| 임유빈 | lunar-yoobin |  |

---

## 기획안

> 프로젝트 주제, 목적, 핵심 기능, 예상 사용자, 팀원별 역할 등 정리

- **주제:** 캠퍼스 온라인 왁뿌볼
- **목적:** end to end 웹사이트 개발 과정 경험
- **핵심 기능:** 유저별로 보유한 왁뿌볼을 터치를 통해 만지고 뿌시는 기능
- **예상 사용자:** 카이스트 캠퍼스 내의 모든 사람

---

## 기능 명세서

> 구현할 기능을 사용자 관점에서 정리하고, 필수 기능과 선택 기능을 구분

### 필수 기능

- [ ] 내 왁뿌볼 메인 화면
    - [ ] 3D 왁뿌볼 표시
    - [ ] 만지기, 누르기, 뿌시기 인터랙션
- [ ] 왁뿌볼 커스텀하기
    - [ ] 내 왁뿌볼 생성하기
    - [ ] 색상, 형태, 장식 등 설정
- [ ] 왁뿌볼 저장하기
    - [ ] 만든 왁뿌볼을 내 계정에 저장
    - [ ] 저장 여부가 매칭 가능 조건
- [ ] 내 컬렉션
    - [ ] 내가 만든/받은 왁뿌볼을 확인
    - [ ] 특정 왁뿌볼을 선택해서 메인에 띄움
- [ ] 매칭하기
    - [ ] 다른 사용자와 왁뿌볼을 교환
- [ ] 로그인/회원가입
    - [ ] 저장, 컬렉션, 매칭을 위해 필요

### 선택 기능

- [ ] 이메일 인증
- [ ] gps 위치 인증
- [ ] 유저 정보 팝업
- [ ] 

---

## IA 및 화면 설계서

> 서비스의 전체 페이지 구조와 페이지 간 이동 흐름; 각 페이지의 주요 UI 구성, 입력 요소, 버튼, 사용자 행동 흐름 등을 간단한 와이어프레임 형태로 정리

<!-- Figma 링크 또는 이미지 첨부 -->

---

## DB 스키마

> 필요한 테이블, 주요 필드, 데이터 타입, 테이블 간 관계를 정리

<!-- ERD 이미지 또는 테이블 정의 -->

[![](https://mermaid.ink/img/pako:eNqdVduOmzAQ_RXLT62UjRIICeEtaVVVWq3al6pSS4UmYMAt2NSXzWaT_Psaw-ZCLtuUF5iZM7czY7zGMU8IDjARHylkAsqQIfNoSYREm83dHV-jJfypKr2Aongw4EKiAMWCgCLyDLgWvu8caixfsg6w3z8LlFyLmHxJZ_FfTSVVlLOQNZ4nJVzMJkhKBGExSearV--jAktQcf6ZSsXFyuArEIrGtKrbmcnZrQ7z6_V1fCVhar6a_YfP_KiXnyG27xD_QutGXz8LmlGmEE3Q1_u9VipBWWYdGZQEfbtHIX4EEecg3jmD9yE-wVYg5ZKLJMpB5odozzuCJ4YERU3MZh-SCFRj3F4anKl8r4pKq_unLlqtTcRFVHcTGcin00Ztk_uaveMOFXlSyOaNtCg6epXrcsGAdmy_JWco1mYiJX2Gei-jWtUBpAJipQXp2N7mqLPE7XCjPU83MWSOGznPTwvo8n-BRqhPoTD1qlVV89mWjzbNgtqvjKaNijyaLT2kuc21C5IKXh4UZeIxXRSwKMiRF-cFAYaojEqg50jcBTxh8fDYGAqtGOWNfAt_tki4wJ01Lq4ZIaoP7MHwrkd6A7zru-X8sG3cw5mgCQ6U0KSHSyIMZ0bEttMQq5yUht3AfCYkBV3YAW2NWwXsB-flq6fgOstxkEIhjaSrOml7G-y05peaEPGBa6ZwMBxPbBAcrPETDsZe3_U913MHvu9O_GkPr3DgeP2BNxo6I991hp7rOtsefrZJB33fdyZT1xs5Y_P2pm4Pk4SaOT00d5G9krYv_KAskg?type=png)](https://mermaid.live/edit#pako:eNqdVduO2jAQ_RXLT60ECAhmIW_Qqqq0WrUvVaU2VTQkDnGb2Kkvy7LAv6_jZCGEy5bmJZmZM7cz43iDIxFT7GMqPzJYSsgDjuxjFJUKbbfdrtigFfwpCrOALHuw4EwhH0WSgqbqDLgUvu8dSqxY8Raw1zsLVMLIiH5JZtFfwxTTTPCAV54nJVzMJmlCJeURjefrV--jAnPQUfqZKS3k2uILkJpFrCjbmanZrQ7z6_W1fBXler6e_YfP_KiXnwF27wD_QptKXz4LtmRcIxajr_cHrdKS8aVz5JBT9O0eBfgRZJSCfDfsvw_wCbYApVZCxmEKKm2iCTmCx5YEzWzMah_iEHRl3F0anK38oApzp_unLmqtSyRkWHYTWsin00Zdk4eayXGHmj5p5PKGRmYtvU5NvuDAWrbfSnAUGTuRnD1DuZdhqWoBEgmRNpK2bG9z1FrierjhgaebGLLHjZ7npwa0-b9AI5SnUNp69boo-azLR9tqQd3XkiWVij7aLW3SXOfaB0mkyBtF2XjcZBksMnrkJURGgSOmwhzYORL3AU9YbB4bS6ETw7SSb-HPFQkXuHPGxTUjhOWBbQzveqQ3wPu-a86bbeMOXkoWY19LQzs4p9JyZkXsOg2wTmlu2fXtZ0wTMJkb0M66FcB_CJG_ekphlin2E8iUlUxRJq1vg73W_lJjKj8IwzX2B57ngmB_g5-wT0jPmxBvOhh6xCMDMu7gNfa7Xm86IpPRdEzu-mRyNxjvOvjZpe33JpPh3dQjo-HYvsnUhqMxs5N6qG4jdyntXgBNgi0B)

---

## API 문서

> API 주소, 요청 방식, 요청값, 응답값, 에러 상황을 정리

[API 문서 초안](docs/api.md)

---

## 프로젝트 구조

```txt
26s-w1-c2-02/
  frontend/    # React/Vite 웹 클라이언트
  backend/     # Express/TypeScript API 서버
  docs/        # API, DB, ERD 등 설계 문서
  infra/       # 로컬 개발/배포 인프라 메모
  scripts/     # 문서/디자인 생성 보조 스크립트
  outputs/     # 생성 산출물
```

---

## 배포 결과물

> 접속 가능한 링크, 실행 방법, 주요 구현 내용

- **서비스 URL:**
- **실행 방법:**

```bash
npm install
npm run db:dev
npm run dev:backend
npm run dev:frontend
```

---

## 회고 문서

> 개발 과정에서의 어려움, 해결 방법, 역할 분담, 다음에 개선할 점 (KPT 방법론 참고)

### Keep

### Problem

### Try

---

## 참고 자료

- [SDD(스펙 주도 개발) 이해하기](https://news.hada.io/topic?id=21338)
- [Software Design Document Best Practices](https://www.atlassian.com/work-management/project-management/design-document)
- [IA 정보구조도 작성 방법](https://brunch.co.kr/@nyonyo/7)
- [기획자 화면설계서 작성법](https://brunch.co.kr/@soup/10)
- [Figma 와이어프레임 가이드](https://www.figma.com/ko-kr/resource-library/what-is-wireframing/)
- [무료 Figma 와이어프레임 키트](https://www.figma.com/ko-kr/templates/wireframe-kits/)
- [ERD/DB 설계 총정리](https://inpa.tistory.com/entry/DB-%F0%9F%93%9A-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8%EB%A7%81-%EA%B0%9C%EB%85%90-ERD-%EB%8B%A4%EC%9D%B4%EC%96%B4%EA%B7%B8%EB%9E%A8)
- [API 명세서 작성 가이드라인](https://velog.io/@sebinChu/BackEnd-API-%EB%AA%85%EC%84%B8%EC%84%9C-%EC%9E%91%EC%84%B1-%EA%B0%80%EC%9D%B4%EB%93%9C-%EB%9D%BC%EC%9D%B8)
- [좋은 README 작성하는 방법](https://velog.io/@sabo/good-readme)
- [단기 프로젝트 회고 KPT 방법론](https://velog.io/@habwa/%EB%8B%A8%EA%B8%B0-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%ED%9A%8C%EA%B3%A0-KPT-%EB%B0%A9%EB%B2%95%EB%A1%A0)
