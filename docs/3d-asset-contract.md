# 3D 에셋 계약

## 통합 파이프라인 (Sprint 3에서 구조 완성)

3D 모델은 `shape` 값(`customization.shape`, 지금은 `"sphere"`만 존재)을 키로 매핑된다.
`frontend/src/assets/models/index.ts`가 이 매핑의 유일한 등록 지점이다.

**모델러가 GLB 파일을 전달하면 다음 3단계만 하면 된다:**

1. `.glb` 파일을 `frontend/src/assets/models/`에 넣는다 (예: `sphere.glb`).
2. `frontend/src/assets/models/index.ts` 상단에 Vite의 `?url` 접미사로 import한다:
   ```ts
   import sphereUrl from './sphere.glb?url';
   ```
3. `SHAPE_MODEL_ASSETS` 맵에 엔트리를 추가한다:
   ```ts
   export const SHAPE_MODEL_ASSETS: Partial<Record<WakppuballShape, string>> = {
     sphere: sphereUrl
   };
   ```

그 외 코드 변경은 필요 없다. `WakppuballView`(`frontend/src/features/wakppuball/WakppuballView.tsx`)가
`customization.shape`로 이 맵을 조회해서, 등록된 모델이 있으면 3D로, 없으면(또는 로딩 실패 시) 기존 CSS
2D 볼(`WakppuballVisual`)로 자동 폴백한다. `MyWakppuballPage.tsx`의 모든 호출부(대표 볼, 생성 미리보기,
컬렉션 타일, 매칭 결과)는 이미 `WakppuballView`를 쓰고 있어 추가로 손댈 곳이 없다.

렌더링은 `@react-three/fiber` + `@react-three/drei`(`useGLTF`, `Bounds`, `OrbitControls`) 조합이며,
카메라 프레이밍은 `<Bounds fit clip observe>`가 모델의 실제 스케일/원점에 맞춰 자동으로 잡아준다 — 아래
"미확정 사항"이 정해지기 전에도 크기가 다른 모델을 바로 넣어볼 수 있게 하기 위함이다. 로딩 실패(404,
손상된 파일 등)는 자동으로 CSS 폴백으로 전환되며 화면이 깨지지 않는다.

## 미확정 사항 (모델러와 별도 협의 예정)

- 두께 프리셋(`thin`/`medium`/`thick`)별 조각(mesh) 개수와 명명 규칙
- 뿌시기(press/crack) 상호작용을 위한 mesh 분리 방식 — 현재는 단일 `<primitive>`로 통째 렌더링만 지원
- `customization.outerColor`/`innerColor`를 3D 모델 머티리얼에 반영하는 방법 — 현재 3D 렌더링은
  모델러가 만든 원본 머티리얼을 그대로 사용하며, 커스터마이징 색상 반영은 이 계약이 정해진 뒤 별도 작업

## 알아둘 것

- 같은 모델이 화면에 여러 개 동시에 뜨는 경우(컬렉션 그리드 등), `WakppuballView`는 매 인스턴스마다
  `scene.clone()`으로 복제해서 사용한다 — three.js의 Object3D는 한 번에 한 부모에만 속할 수 있어서,
  복제하지 않으면 마지막에 마운트된 인스턴스가 나머지에서 모델을 "가져가 버린다." 정적 mesh 기준으로
  작성된 가정이며, 스켈레톤/애니메이션이 들어간 모델을 쓰게 되면 `scene.clone()` 대신
  `three-stdlib`의 `SkeletonUtils.clone`으로 바꿔야 한다.
