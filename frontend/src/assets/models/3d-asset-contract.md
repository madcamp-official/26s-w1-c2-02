# 왁뿌볼 3D 에셋 계약서 (3d-asset-contract.md)

이 문서는 실제 산출물 기준의 **프론트(React Three Fiber) ↔ 3D 에셋** 계약이다.
`export/` 안의 파일들을 메인 웹앱 리포의 `frontend/src/assets/models/`로 수동 복사해서 사용한다.

최종 갱신: 2026-07-07

---

## 1. 파일 목록 / 경로

| 파일 | 경로 | 크기 | 설명 |
|---|---|---|---|
| 베이스 모델 | `export/wakppuball-base.glb` | ~128 KB | 40조각 왁뿌볼, Draco 압축, **단색(무채색) 베이스** |
| 도트 패턴 | `export/pattern-dots.png` | ~50 KB | 1024², RGBA 알파 마스크, tileable |
| 스트라이프 패턴 | `export/pattern-stripes.png` | ~22 KB | 1024², RGBA 알파 마스크, tileable |
| (작업 원본) | `blend/wakppuball.blend` | — | 40조각 작업 파일 |
| (인탁트 백업) | `blend/wakppuball-intact-base.blend` | — | 분할 전 매끈한 구(64×32). 조각 수 변형 재작업용 |

> `export/`의 3개 파일만 웹앱으로 넘긴다. `.blend`는 재작업용 원본이라 넘기지 않는다.

---

## 2. 지오메트리 / 조각 규격

- **형태**: 반경 1.0 unit, 원점(0,0,0) 중심의 완전한 구. 매듭·비대칭 디테일 없음.
- **조각 노드 이름**: `piece_001` ~ `piece_040` (제로패딩 3자리). 총 **40조각**.
- **모든 조각이 표면 타일**: 시드 포인트를 구 표면에 균일 분포(면적 기준)시켜 Voronoi 분할 → **40조각 전부 표면에 노출되어 개별 레이캐스트/탭 가능**. 속에만 묻힌 내부 전용 조각은 **0개**.
- **조각 위치/회전**: 원래 구를 이루던 정위치 그대로. **런타임에 이동·회전·분리·폭발시키지 않는다** (이번 스코프에 분리/소멸 애니메이션 없음).
- **hairline 갭**: 조각 사이 margin ≈ 반경의 0.05% (0.0005 unit). 조립 상태에서는 사실상 매끈한 구로 보이지만, 프론트가 특정 조각을 "뿌셨을 때" 그 조각의 `inner` 단면을 드러낼 수 있는 최소 간격이 존재.

### 폴리곤 / 텍스처 실측치

| 항목 | 값 |
|---|---|
| 베이스 구 (분할 전) | 3,968 tris (64 seg × 32 ring) — Phase 1 "조각 전 ≤5,000" 기준 통과 |
| **분할 후 총 삼각형 (40조각 합산)** | **7,229 tris** |
| GLB 파일 크기 | ~128 KB (목표 1~2MB 이하 충족) |
| 패턴 텍스처 해상도 | 1024 × 1024, RGBA |
| Export | GLB, Y-up, Draco level 6, 머티리얼 포함 |

---

## 3. 머티리얼 규격

머티리얼은 **정확히 2개**뿐이다. 둘 다 **무채색(흰색 계열) 베이스** — 색은 런타임에 three.js에서 `Material.color`로 갈아끼운다 (색을 구워넣지 않음).

| 머티리얼 | 적용 위치 | Base(무채색) | Roughness | 의도 |
|---|---|---|---|---|
| `outer` | 원래 구 표면(조각 바깥면) | 0.90 | 0.72 | 매트·거친 **"바삭한 셸"** |
| `inner` | 분할로 생긴 단면(조각 안쪽면) | 0.95 | 0.25 | 광택 있는 **"말랑한"** 단면 |

- 각 `piece_XXX`는 두 머티리얼 슬롯 `[outer, inner]`를 모두 가진다 (슬롯0=outer, 슬롯1=inner).
- 커스터마이징: 프론트가 `outerColor` → `outer.color`, `innerColor` → `inner.color`로 주입.

---

## 4. 패턴 텍스처 (단색/도트/스트라이프)

MVP 표면 스타일 3종:

| 스타일 | 제공 방식 |
|---|---|
| **단색 (기본)** | 베이스 GLB의 `outer` 그대로. 패턴 텍스처 미적용. |
| **도트** | `pattern-dots.png`를 `outer`에 얹음 |
| **스트라이프** | `pattern-stripes.png`를 `outer`에 얹음 |

- 두 PNG는 **알파 마스크**: `RGB = 흰색(1,1,1)`, `Alpha = 패턴 모양`. 런타임에서 원하는 색으로 틴트(곱)해서 사용.
- **tileable**: 2×2 반복 시 이음새 없음.
- **매핑은 런타임(triplanar) 담당**: 이 에셋의 UV는 equirectangular로 존재하지만, 패턴은 프론트가 **triplanar**로 입힐 예정이라 UV 품질에 의존하지 않는다. (즉 UV 이음새/극점 왜곡은 무시 가능.)

---

## 5. 프론트(React Three Fiber)와의 계약

- 각 `piece_001`~`piece_040`은 **개별 레이캐스트 대상**이 될 수 있다. gltfjsx로 파싱하면 노드 이름 그대로 참조 가능.
- 세션 동안의 "뿌셔짐 여부"는 **프론트 로컬 상태로만** 관리한다 (예: `poppedPieces: boolean[40]`). 서버에 저장하지 않으며, 새 접속마다 전부 안 뿌셔진 인탁트 상태로 리셋.
- 특정 조각이 뿌셔지면 프론트가 **그 조각의 재질을 독립적으로 오버라이드**해 "금 간" 것처럼 렌더 (예: 해당 조각 `outer`를 어둡게/틈을 도드라지게, 또는 `inner` 단면을 노출). 정확한 셰이더 연출은 프론트 담당 — 이 에셋은 **"조각별 독립 재질 오버라이드가 가능하다"는 조건만 충족**한다.
- **조각의 위치/회전은 절대 바뀌지 않는다.** 분리/폭발/소멸 애니메이션은 이 에셋에 없다.
- `remainingBreakCount`, 최종 소멸 연출, 서버 API는 이 에셋과 무관 (스코프 밖).

---

## 6. 조각 개수 변형 (thin / medium / thick)

조각 수를 바꾼 GLB가 필요하면 재작업은 간단하다:

1. `blend/wakppuball-intact-base.blend` (또는 동일 파라미터로 64×32 구 재생성)에서 시작.
2. 파티클 시스템: **`emit_from='FACE'`, `use_even_distribution=True`, `distribution='RAND'`** (표면 균일 분포가 핵심 — 볼륨 분포로 하면 내부 전용 조각이 생김), `count = 원하는 조각 수`, `seed=7`.
3. Cell Fracture 애드온(`cell_fracture`, Blender 5.x 익스텐션)으로 `source={'PARTICLE_OWN'}`, `source_limit = 조각 수`, `margin=0.0005`, `material_index=1`(=inner), `use_data_match=True`, `use_recenter=True`, `use_remove_original=True`.
4. 조각을 `piece_001`~`piece_0NN`으로 재명명.
5. 40조각 = 7,229 tris이므로 조각 수를 크게 늘려도 폴리곤 예산 여유 있음.

> **★ 필수 규칙**: 조각 수를 몇 개로 바꾸든 시드는 **반드시 구 표면에 분포**시킨다(볼륨 전체 분포 금지). 볼륨 분포로 하면 표면에 안 닿는 내부 전용 조각이 생겨 `poppedPieces` 배열을 오염시키고 폴리곤만 낭비한다. **재생성 후 전 조각이 `outer` 면을 1개 이상 가지는지(=내부 전용 조각 0개) 반드시 검증하고, 하나라도 나오면 재생성한다.**

> 현재 MVP는 조각 수 1종(**40개**)으로 확정. thin/medium/thick 3벌 분리 export는 이번 스코프 아님(Phase 11, 나중).

---

## 7. 검증 결과 (Phase 9)

export된 GLB를 독립 파싱해 확인:

- ✅ 노드 40개, 이름 `piece_001`~`piece_040` 정확 (누락/여분 없음, piece 외 노드 없음)
- ✅ 머티리얼 정확히 2개: `outer`, `inner`
- ✅ 40조각 전부 `outer`(표면) + `inner`(단면) 면 보유 → 전부 탭 가능
- ✅ Draco 압축 적용(`KHR_draco_mesh_compression`)
- ✅ 조각 조립 시 시각적으로 매끈한 구 (hairline만)
