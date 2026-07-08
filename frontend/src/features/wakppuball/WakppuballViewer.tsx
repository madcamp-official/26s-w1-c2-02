import {
  Component,
  forwardRef,
  Suspense,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls, useGLTF, useTexture } from '@react-three/drei';
import {
  DataTexture,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Object3D,
  type Texture,
  type WebGLProgramParametersWithUniforms
} from 'three';
import { resolveUploadedAssetUrl } from '../../shared/api/http';
import { playWakppuballCrackSound, playWakppuballSqueezeSound } from '../../shared/sound/soundManager';
import { breakWakppuball } from './wakppuballApi';
import type { WakppuballPattern } from './wakppuballTypes';
// Vite resolves this to a served asset URL. The GLB is Draco-compressed;
// useGLTF pulls the Draco decoder from the gstatic CDN by default (needs network
// in dev). If we ever need fully-offline dev, self-host the decoder in /public.
import wakppuballModelUrl from '../../assets/models/wakppuball-base.glb?url';
// Phase 8-A pattern presets. White RGB + alpha-shaped mask (dot/stripe cutouts) —
// tinted white-over-outerColor at render time, not sampled as RGB. Deliberately NOT
// UV-mapped (docs/3d-interaction.md): the 40 pieces are separate submeshes with
// per-piece UV islands, and a sphere's UV has pole singularities anyway. Instead
// they're triplanar-projected from each fragment's WORLD position (see
// PATTERN_TRIPLANAR_GLSL below) — continuous across piece seams and pole-free.
import patternDotsUrl from '../../assets/models/pattern-dots.png?url';
import patternStripesUrl from '../../assets/models/pattern-stripes.png?url';

const PATTERN_MODE: Record<'none' | 'dots' | 'stripes' | 'custom', number> = {
  none: 0,
  dots: 1,
  stripes: 2,
  custom: 3
};
const PATTERN_TRIPLANAR_SCALE = 2.4; // world-space tiling frequency of the preset mask textures
const PATTERN_BLEND_STRENGTH = 0.55; // max whiteness mixed in where the mask alpha is 1
// A user photo should read as one wrap, not a repeating tile like the preset
// masks — much lower tiling frequency so roughly one copy covers a hemisphere.
const CUSTOM_TRIPLANAR_SCALE = 1.0;
// Bound whenever no custom photo is loaded (or hasn't finished loading yet) so
// the shader always has a valid sampler2D — a fully transparent 1x1 pixel
// never contributes visibly even if briefly sampled mid-mode-switch.
const PLACEHOLDER_CUSTOM_TEXTURE = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
PLACEHOLDER_CUSTOM_TEXTURE.needsUpdate = true;

// Below this pointer travel (px), a press counts as a "touch on one spot" and pops
// the piece. Past it, the gesture is a drag → OrbitControls rotates, nothing pops.
// This is how rotation and touching are differentiated (by length, not by area).
const TAP_MOVE_THRESHOLD = 8;

// Zoom clamps. Ball radius is 1.0; keep the camera outside it and not too far.
const MIN_ZOOM_DISTANCE = 1.8;
const MAX_ZOOM_DISTANCE = 6;

// ── Squash press (Phase 6.5, reference-matched — squishing a soft ball). Pressing
//    COMPRESSES the ball along the press axis (â = press point direction) and, to
//    conserve volume, SPREADS everything perpendicular to it (the surroundings squish
//    out to the sides). Every point is decomposed into an axial part (scaled down) and
//    a perpendicular part (scaled up). The inner ball spreads MUCH more than the thin
//    shell, so it bulges past the shell and oozes out through the side gaps between
//    segments — like jelly through a net. Shell and inner share the axial compression
//    so they stay coupled along the axis. (Pieces only TRANSLATE — no rotate-to-normal.)
const SHELL_COMPRESS = 0.22; // axial flatten of the outer shell at full press
const SHELL_EXPAND = 0.1; // perpendicular widen of the shell (a net barely stretches)
const CORE_COMPRESS = 0.22; // axial flatten of the inner ball (matches the shell → coupled)
const CORE_EXPAND = 0.6; // perpendicular spread of the inner — large, so it oozes out the gaps
const POSITION_LERP = 0.28; // per-frame approach of a piece toward its target

// ── Shell hollowing. The GLB pieces are SOLID wedges (verts span radius 0→1, i.e. each
//    fills a pie slice to the centre), so the "outer" reads as full-radius-thick. On
//    load we radially remap every shard vertex r∈[0,1] → [SHELL_INNER, 1], turning the
//    solid wedges into thin shell segments and freeing the interior for a large inner
//    ball that can bulge out through the gaps. (Goes beyond the "don't touch piece
//    geometry" asset-contract note — same deliberate step-over as Phase 6.)
const SHELL_INNER = 0.78; // inner face radius of the hollowed segments (thickness ≈ 0.22)

// ── Permanent crack (tap-to-pop = the break mechanic). Kept small now that pieces are
//    thin segments and the main reveal is the inner bulging through gaps — a popped
//    piece just parts a little rather than flinging off.
const CRACK_LIFT = 0.05; // outward radial lift of a popped piece
const CRACK_SLIDE = 0.08; // tangential slide off its own footprint

// ── Inner core ball. Sits just under the hollowed shell's inner face (SHELL_INNER) so
//    it's hidden while intact, but large — on press it balloons outward past the shell.
const INNER_CORE_RADIUS = 0.74;

// Press strength ramps 0→1 while held and, on a real release, settles to a frozen
// residual (memory-foam: the bulge stays a bit). A drag resets it to 0 (rolling the
// ball shouldn't leave it deformed). Replaces the old macro-squash spring.
const PRESS_LERP = 0.12; // springiness of the strength ramp up / relax down
const PRESS_RELEASE_RECOVERY = 0.15; // fraction of the bulge recovered on release

const UP_REF = new Vector3(0, 1, 0); // for deriving a stable per-piece tangent (crack slide)
const SIDE_REF = new Vector3(1, 0, 0); // fallback tangent basis near the poles (up ∥ radial)

// Smooth 0→1 curve. x is normalized closeness: 1 at the press center, 0 at the edge.
function smoothstep(x: number): number {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

// Squash displacement at `point`: decompose into its component ALONG the press axis
// (scaled by 1−compress·strength → flatten) and PERPENDICULAR to it (scaled by
// 1+expand·strength → spread sideways), and return the resulting offset. `axis` must be
// unit. Pieces call it with the shell params, the inner-core vertices with the (larger-
// spread) core params — the shared axial compression keeps them coupled along the axis
// while the inner spreads out past the shell.
const _sqAxial = new Vector3();
const _sqPerp = new Vector3();
function squashOffset(out: Vector3, point: Vector3, axis: Vector3, strength: number, compress: number, expand: number): Vector3 {
  out.set(0, 0, 0);
  if (strength <= 0.0001) return out;
  const axialLen = point.dot(axis);
  _sqAxial.copy(axis).multiplyScalar(axialLen); // component along the press axis
  _sqPerp.copy(point).sub(_sqAxial); // component perpendicular to it
  const newAxialLen = axialLen * (1 - compress * strength);
  const perpScale = 1 + expand * strength;
  // out = (axis·newAxialLen + perp·perpScale) − point
  out.copy(axis).multiplyScalar(newAxialLen).addScaledVector(_sqPerp, perpScale).sub(point);
  return out;
}

// A piece node is named exactly piece_001..piece_040. Its mesh has two primitives
// (outer/inner materials), so a raycast hits a child submesh like
// "piece_013_mesh002" — walk up to the owning piece node to get the canonical id.
const PIECE_NODE_NAME = /^piece_\d{3}$/;
function resolvePieceNode(object: Object3D): Object3D | null {
  let node: Object3D | null = object;
  while (node) {
    if (PIECE_NODE_NAME.test(node.name)) return node;
    node = node.parent;
  }
  return null;
}

type Piece = { node: Object3D; rest: Vector3; radial: Vector3; tangent: Vector3 };

type PatternUniforms = {
  uPatternMode: { value: number };
  uCustomMap: { value: Texture };
};

// Phase 8-A: patches the outer shell's compiled MeshStandardMaterial program to
// triplanar-project the dots/stripes alpha masks from each fragment's WORLD position,
// instead of UV — the 40 pieces are separate submeshes (their own UV islands, seams at
// every piece boundary) and a sphere's UV has pole singularities either way. Sampling by
// world position/normal (all pieces share one rigid parent transform, and at rest
// reconstruct one continuous sphere) reads as one continuous pattern across every seam
// and has no poles. Runs once per material (onBeforeCompile fires on first compile);
// `uPatternMode` is then live-updated via the returned uniform ref (0 keeps the material
// a flat MeshStandardMaterial with no visible cost — the branch just isn't taken).
//
// Phase 8-B extends the same mechanism for a user-uploaded photo skin (mode 3):
// unlike the alpha-cutout preset masks, the custom map's full RGB replaces
// diffuseColor outright (a photo needs to show its own colors, not tint
// outerColor), and it's triplanar-sampled at a much lower frequency
// (uCustomScale) so one photo wraps the ball instead of tiling like a pattern.
// The texture itself is loaded asynchronously at runtime (not a static Vite
// import like the preset masks) — see the pattern effect below, which swaps
// uCustomMap.value once the load resolves, live, same as uPatternMode.
function attachTriplanarPattern(
  material: MeshStandardMaterial,
  dotsMap: Texture,
  stripesMap: Texture,
  customMap: Texture
): PatternUniforms {
  const uniformsRef: PatternUniforms = {
    uPatternMode: { value: 0 },
    uCustomMap: { value: customMap }
  };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uDotsMap = { value: dotsMap };
    shader.uniforms.uStripesMap = { value: stripesMap };
    shader.uniforms.uCustomMap = uniformsRef.uCustomMap;
    shader.uniforms.uPatternMode = uniformsRef.uPatternMode;
    shader.uniforms.uPatternScale = { value: PATTERN_TRIPLANAR_SCALE };
    shader.uniforms.uCustomScale = { value: CUSTOM_TRIPLANAR_SCALE };
    shader.uniforms.uPatternBlend = { value: PATTERN_BLEND_STRENGTH };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPatternWorldPos;\nvarying vec3 vPatternWorldNormal;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\tvPatternWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;\n\tvPatternWorldNormal = normalize(mat3(modelMatrix) * normal);'
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vPatternWorldPos;
varying vec3 vPatternWorldNormal;
uniform sampler2D uDotsMap;
uniform sampler2D uStripesMap;
uniform sampler2D uCustomMap;
uniform float uPatternMode;
uniform float uPatternScale;
uniform float uCustomScale;
uniform float uPatternBlend;

// Box/triplanar projection: sample the mask from all 3 axis-aligned planes and blend
// by how much the surface faces each axis — seamless across separate meshes sharing one
// world space, and pole-free (no spherical UV involved).
vec4 wakppuballTriplanar(sampler2D tex, vec3 worldPos, vec3 worldNormal, float scale) {
  vec3 blendWeight = abs(worldNormal);
  blendWeight /= max(blendWeight.x + blendWeight.y + blendWeight.z, 1e-5);
  vec4 xTex = texture2D(tex, worldPos.yz * scale);
  vec4 yTex = texture2D(tex, worldPos.xz * scale);
  vec4 zTex = texture2D(tex, worldPos.xy * scale);
  return xTex * blendWeight.x + yTex * blendWeight.y + zTex * blendWeight.z;
}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
	if (uPatternMode > 2.5) {
		vec3 patternNormal = normalize(vPatternWorldNormal);
		diffuseColor.rgb = wakppuballTriplanar(uCustomMap, vPatternWorldPos, patternNormal, uCustomScale).rgb;
	} else if (uPatternMode > 0.5) {
		vec3 patternNormal = normalize(vPatternWorldNormal);
		vec4 patternSample = uPatternMode < 1.5
			? wakppuballTriplanar(uDotsMap, vPatternWorldPos, patternNormal, uPatternScale)
			: wakppuballTriplanar(uStripesMap, vPatternWorldPos, patternNormal, uPatternScale);
		diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), patternSample.a * uPatternBlend);
	}`
      );
  };
  // onBeforeCompile's code edits above are identical on every call (only the uniform
  // *values* change afterward) — one cache key keeps three.js from needlessly
  // recompiling/re-diffing the shader per instance.
  material.customProgramCacheKey = () => 'wakppuball-outer-triplanar-pattern';
  return uniformsRef;
}

// Phase 1–3: render intact + achromatic (no color/pattern yet — those come later).
// Press deforms a radius of pieces around the hit point (compress + spread); the hit
// piece pops permanently (cracks open). Never touches geometry — position only.
// Each frame every piece is driven toward:
//   rest  +  permanent crack offset (if popped)  +  temporary press offset (if pressing)
function InteractiveWakppuball({
  onPiecePopped,
  interactionDisabled,
  outerColor,
  innerColor,
  pattern
}: {
  onPiecePopped: (pieceName: string) => void;
  interactionDisabled: boolean;
  outerColor: string;
  innerColor: string;
  pattern: WakppuballPattern;
}) {
  const { scene: original } = useGLTF(wakppuballModelUrl);
  const [dotsMap, stripesMap] = useTexture([patternDotsUrl, patternStripesUrl]);
  useMemo(() => {
    for (const tex of [dotsMap, stripesMap]) {
      tex.wrapS = tex.wrapT = RepeatWrapping;
    }
  }, [dotsMap, stripesMap]);
  // Materials named "outer"/"inner" in the GLB (docs/3d-asset-contract.md), shared by
  // reference across all 40 pieces' two submeshes. Filled in by the scene useMemo below;
  // read by the color effect so outerColor/innerColor (Phase 7) can be applied/updated
  // without re-touching geometry.
  const outerMaterialRef = useRef<MeshStandardMaterial | null>(null);
  const innerMaterialRef = useRef<MeshStandardMaterial | null>(null);
  // Set by attachTriplanarPattern (Phase 8-A) when the outer material clone first
  // compiles; the pattern-mode effect below writes into it to switch none/dots/stripes
  // live without re-triggering a shader recompile.
  const outerPatternUniformsRef = useRef<PatternUniforms | null>(null);
  // The last runtime-loaded custom skin texture, tracked so it can be disposed
  // when replaced or on unmount — three.js doesn't free GPU texture memory on GC,
  // so swapping photos would otherwise leak VRAM. The shared PLACEHOLDER texture
  // is never stored here, so it's never disposed.
  const loadedCustomTextureRef = useRef<Texture | null>(null);
  // useGLTF caches the scene; clone per mount so cracks/depress reset every visit. Then
  // hollow the solid wedges into thin shell segments (radial remap r∈[0,1]→[SHELL_INNER,1])
  // so a large inner ball fits inside and can bulge out through the gaps. Geometry is
  // cloned per mesh first, so we don't mutate the shared useGLTF-cached buffers. Materials
  // are cloned too (once per instance, keyed by the original) — colors are set per-ball
  // (Phase 7), and the useGLTF scene/materials are cached globally across every viewer
  // instance, so mutating a shared material's color would leak across balls.
  const scene = useMemo(() => {
    const s = original.clone(true);
    s.updateMatrixWorld(true);
    const local = new Vector3();
    const world = new Vector3();
    const inv = new Matrix4();
    const materialClones = new Map<Material, Material>();
    function cloneMaterial(mat: Material): Material {
      let clone = materialClones.get(mat);
      if (!clone) {
        clone = mat.clone();
        materialClones.set(mat, clone);
        if (clone.name === 'outer') {
          outerMaterialRef.current = clone as MeshStandardMaterial;
          outerPatternUniformsRef.current = attachTriplanarPattern(
            clone as MeshStandardMaterial,
            dotsMap,
            stripesMap,
            PLACEHOLDER_CUSTOM_TEXTURE
          );
        } else if (clone.name === 'inner') {
          innerMaterialRef.current = clone as MeshStandardMaterial;
        }
      }
      return clone;
    }
    s.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      mesh.geometry = mesh.geometry.clone();
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneMaterial) : cloneMaterial(mesh.material);
      const pos = mesh.geometry.attributes.position;
      inv.copy(mesh.matrixWorld).invert();
      for (let i = 0; i < pos.count; i++) {
        // vertex → scene-space radius (matrixWorld folds in the piece's centroid offset)
        world.copy(local.set(pos.getX(i), pos.getY(i), pos.getZ(i))).applyMatrix4(mesh.matrixWorld);
        const r = world.length();
        if (r > 1e-4) {
          world.multiplyScalar((SHELL_INNER + (1 - SHELL_INNER) * r) / r); // remap radius
          local.copy(world).applyMatrix4(inv); // back to mesh-local, keeping the node transform
          pos.setXYZ(i, local.x, local.y, local.z);
        }
      }
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      // Positions moved → the stale bounding volumes would make the raycaster miss the
      // shell (it culls by bounding sphere first). Recompute so presses still hit.
      mesh.geometry.computeBoundingSphere();
      mesh.geometry.computeBoundingBox();
    });
    return s;
  }, [original, dotsMap, stripesMap]);

  // Phase 7: outer shell + inner (cross-section) materials follow the ball's
  // customization. Runs on scene rebuild too, since the memo above assigns fresh
  // material clones each time.
  useEffect(() => {
    outerMaterialRef.current?.color.set(outerColor);
    innerMaterialRef.current?.color.set(innerColor);
  }, [scene, outerColor, innerColor]);

  // Phase 8-A/8-B: pattern mode (and, for 'custom', the photo texture itself) are
  // live uniforms (see attachTriplanarPattern), so switching patterns never needs a
  // shader recompile. Presets are static Vite assets already loaded (uPatternMode
  // flips instantly); a custom photo is a runtime URL, so it's fetched here via
  // TextureLoader and only flipped to mode 3 once the load resolves — until then
  // the material keeps showing whatever pattern (or none) was active before,
  // rather than a flash of the untextured placeholder.
  const patternDepKey = pattern.type === 'preset' ? `preset:${pattern.id}` : `custom:${pattern.imageUrl}`;
  useEffect(() => {
    const uniforms = outerPatternUniformsRef.current;
    if (!uniforms) return;

    if (pattern.type === 'preset') {
      uniforms.uPatternMode.value = PATTERN_MODE[pattern.id];
      return;
    }

    let cancelled = false;
    new TextureLoader().load(
      resolveUploadedAssetUrl(pattern.imageUrl),
      (texture) => {
        if (cancelled) {
          texture.dispose(); // resolved after this effect was superseded — don't leak it
          return;
        }
        texture.wrapS = texture.wrapT = RepeatWrapping;
        texture.colorSpace = SRGBColorSpace;
        loadedCustomTextureRef.current?.dispose(); // free the photo we're replacing
        loadedCustomTextureRef.current = texture;
        uniforms.uCustomMap.value = texture;
        uniforms.uPatternMode.value = PATTERN_MODE.custom;
      },
      undefined,
      (error) => {
        // The skin URL is persisted server-side, but the fetch can still fail
        // (file deleted, transient network). Log it instead of failing silently
        // — the ball keeps whatever pattern was showing before.
        if (cancelled) return;
        console.error('커스텀 왁뿌볼 스킨 텍스처를 불러오지 못했습니다.', error);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [scene, patternDepKey]);

  // Free the last loaded custom skin texture when this ball unmounts.
  useEffect(
    () => () => {
      loadedCustomTextureRef.current?.dispose();
      loadedCustomTextureRef.current = null;
    },
    []
  );

  // Every piece with its rest position and radial (origin→rest) direction, once.
  const pieces = useMemo<Piece[]>(() => {
    const list: Piece[] = [];
    scene.traverse((node) => {
      if (PIECE_NODE_NAME.test(node.name)) {
        const rest = node.position.clone();
        const radial = rest.clone().normalize();
        // Stable tangent for sliding a popped piece off its own hole. cross with
        // world-up, falling back to world-x near the poles where up ∥ radial.
        const tangent = new Vector3().crossVectors(radial, UP_REF);
        if (tangent.lengthSq() < 1e-6) tangent.crossVectors(radial, SIDE_REF);
        tangent.normalize();
        list.push({ node, rest, radial, tangent });
      }
    });
    return list;
  }, [scene]);

  // Imperative interaction state (kept in refs so it doesn't trigger re-renders).
  const poppedRef = useRef(new Set<string>());
  // hitPoint is stored in the pieces' (parent-local) space so it can be compared to
  // rest positions directly.
  const pressRef = useRef<{ node: Object3D; hitPoint: Vector3; startX: number; startY: number; pointerId: number } | null>(null);
  const targetVec = useRef(new Vector3());
  const offsetVec = useRef(new Vector3());

  // Soft-body press strength (0 = round, ramps to 1 while held). Scalar shared by the
  // whole field; the press *location* is remembered separately so a residual dent
  // stays put after release.
  const pressStrength = useRef(0);
  // What the strength relaxes to when not pressing: 0 while round, or a frozen residual
  // after a real release (memory-foam). The press point is kept so the dent stays put.
  const residualStrength = useRef(0);
  const pressPointRef = useRef(new Vector3(0, 0, 1));
  const pressAxis = useRef(new Vector3(0, 0, 1)); // normalized press direction (squash axis)

  // Inner core soft-body deform. The core mesh shares the scene-local space of the
  // pieces (probe confirmed: pieces' parent === scene root), so the same field +
  // pressPoint drives it directly. Its rest (pristine sphere) vertices are cached
  // once and re-deformed each frame while pressed.
  const coreRef = useRef<Mesh>(null);
  const coreRestPositions = useRef<Float32Array | null>(null);
  const coreVertexVec = useRef(new Vector3());
  const coreOffsetVec = useRef(new Vector3());
  // True while the core geometry is currently displaced, so we know to run one final
  // pass resetting it to the pristine sphere when the press strength returns to ~0.
  const coreDirty = useRef(false);

  // Window-level up/move so a drag that leaves the ball still aborts the press.
  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const press = pressRef.current;
      if (!press || e.pointerId !== press.pointerId) return;
      const moved = Math.hypot(e.clientX - press.startX, e.clientY - press.startY);
      // Turned into a drag → hand off to rotation; fully un-dent (rotating a ball
      // shouldn't leave it dented), no pop.
      if (moved > TAP_MOVE_THRESHOLD) {
        residualStrength.current = 0;
        pressRef.current = null;
      }
    }
    function handleUp(e: PointerEvent) {
      const press = pressRef.current;
      if (!press || e.pointerId !== press.pointerId) return;
      const moved = Math.hypot(e.clientX - press.startX, e.clientY - press.startY);
      if (moved <= TAP_MOVE_THRESHOLD) {
        // The squeeze sound already played on press (handlePointerDown) — only
        // the *first* tap on a given piece pops it open here (idempotent,
        // session-local; that's the part that costs a break). The crack sound
        // fires exactly on that break judgement, not on every touch.
        if (!poppedRef.current.has(press.node.name)) {
          poppedRef.current.add(press.node.name);
          playWakppuballCrackSound();
          onPiecePopped(press.node.name);
        }
      }
      // Real release → keep most of the dent, spring back only a little (memory-foam).
      residualStrength.current = pressStrength.current * (1 - PRESS_RELEASE_RECOVERY);
      pressRef.current = null;
    }
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [onPiecePopped]);

  function handlePointerDown(e: ThreeEvent<PointerEvent>) {
    // Out of break count: view/rotate/zoom only, no press-to-crack. OrbitControls
    // sits alongside this handler (not gated by it), so rotation still works.
    if (interactionDisabled) return;
    // The handler sits on the root, so R3F would re-dispatch for every intersected
    // piece (front→back). Take the nearest hit and stop, else we'd press a back piece.
    e.stopPropagation();
    const hit = e.intersections[0];
    if (!hit) return;
    const node = resolvePieceNode(hit.object);
    if (!node) return;
    // Squeeze plays on press, not release — the squish should be felt the
    // instant a finger lands, even if the gesture then turns into a drag. The
    // crack sound is separate and only fires when a piece actually pops.
    playWakppuballSqueezeSound();
    const hitPoint = hit.point.clone();
    node.parent?.worldToLocal(hitPoint); // match the pieces' parent-local space
    pressRef.current = { node, hitPoint, startX: e.nativeEvent.clientX, startY: e.nativeEvent.clientY, pointerId: e.nativeEvent.pointerId };
  }

  // Drive every piece toward rest + (permanent crack) + (soft-body press field).
  useFrame(() => {
    const press = pressRef.current;
    // Remember the press location while held so a residual dent stays put after release.
    if (press) pressPointRef.current.copy(press.hitPoint);
    // Strength ramps toward 1 while held, or toward the frozen residual after release.
    const targetStrength = press ? 1 : residualStrength.current;
    pressStrength.current += (targetStrength - pressStrength.current) * PRESS_LERP;
    const strength = pressStrength.current;
    const pressPoint = pressPointRef.current;
    const axis = pressAxis.current;
    if (pressPoint.lengthSq() > 1e-8) axis.copy(pressPoint).normalize();

    for (const piece of pieces) {
      const target = targetVec.current.copy(piece.rest);

      // Permanent crack ("하"): popped pieces lift outward + slide off their hole,
      // opening a real gap so the inner core shows through (Phase 6).
      if (poppedRef.current.has(piece.node.name)) {
        target.addScaledVector(piece.radial, CRACK_LIFT);
        target.addScaledVector(piece.tangent, CRACK_SLIDE);
      }

      // Squash: flatten this segment along the press axis + spread it perpendicular.
      if (strength > 0.001) {
        squashOffset(offsetVec.current, piece.rest, axis, strength, SHELL_COMPRESS, SHELL_EXPAND);
        target.add(offsetVec.current);
      }

      piece.node.position.lerp(target, POSITION_LERP);
    }

    // Inner core: squash its vertices with a MUCH larger perpendicular spread than the
    // shell, so it bulges out past the shell and oozes through the side gaps. 32×32
    // sphere (~1089 verts); normals recomputed each frame so the bulge shades correctly.
    const core = coreRef.current;
    if (core) {
      const posAttr = core.geometry.attributes.position;
      if (!coreRestPositions.current) {
        coreRestPositions.current = new Float32Array(posAttr.array as Float32Array);
      }
      const rest = coreRestPositions.current;
      if (strength > 0.001) {
        for (let i = 0; i < posAttr.count; i++) {
          const ix = i * 3;
          coreVertexVec.current.set(rest[ix], rest[ix + 1], rest[ix + 2]);
          squashOffset(coreOffsetVec.current, coreVertexVec.current, axis, strength, CORE_COMPRESS, CORE_EXPAND);
          posAttr.setXYZ(i, rest[ix] + coreOffsetVec.current.x, rest[ix + 1] + coreOffsetVec.current.y, rest[ix + 2] + coreOffsetVec.current.z);
        }
        posAttr.needsUpdate = true;
        core.geometry.computeVertexNormals();
        coreDirty.current = true;
      } else if (coreDirty.current) {
        // Strength fell back to ~0 — settle the core to the pristine sphere once.
        for (let i = 0; i < posAttr.count; i++) {
          const ix = i * 3;
          posAttr.setXYZ(i, rest[ix], rest[ix + 1], rest[ix + 2]);
        }
        posAttr.needsUpdate = true;
        core.geometry.computeVertexNormals();
        coreDirty.current = false;
      }
    }
  });

  // The inner core sits inside the shell and deforms with the same field as the
  // pieces (see useFrame). raycastable but unhandled: a press that only hits the core
  // (through an open gap) resolves to no piece node and is ignored — see
  // handlePointerDown / resolvePieceNode. 32×32 so per-frame CPU vertex deform + normal
  // recompute stays cheap.
  return (
    <primitive object={scene} onPointerDown={handlePointerDown}>
      <mesh ref={coreRef}>
        <sphereGeometry args={[INNER_CORE_RADIUS, 32, 32]} />
        {/* Phase 7: the "jelly" that oozes through the shell gaps is the innerColor
            slot too (docs/3d-interaction.md roadmap called out 3 material slots —
            outer, inner cross-section, and this core — innerColor feeds both). */}
        <meshStandardMaterial color={innerColor} roughness={0.25} />
      </mesh>
    </primitive>
  );
}

// The GLB load can fail (network, decode). React Suspense covers "loading";
// this covers "error". Both fallbacks render inside the Canvas via <Html>.
class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <Html center>
          <p role="alert">3D 왁뿌볼을 불러오지 못했습니다.</p>
        </Html>
      );
    }
    return this.props.children;
  }
}

export type WakppuballViewerHandle = {
  // Awaits any pending break report — used by logout so the request goes out
  // (and finishes) while the auth token is still valid, instead of racing
  // signOut(). See MyWakppuballPage.tsx handleLogout.
  flushBreakReport: () => Promise<void>;
};

export const WakppuballViewer = forwardRef<
  WakppuballViewerHandle,
  { ownedId: string; remainingBreakCount: number; outerColor: string; innerColor: string; pattern: WakppuballPattern }
>(function WakppuballViewer({ ownedId, remainingBreakCount, outerColor, innerColor, pattern }, ref) {
  // Evaluated once against the count as loaded — not re-checked live against
  // pops made *this* session, since the server decrement itself only lands
  // when the session ends (see reportBreakIfNeeded). Started this session
  // with 0 left → view/rotate/zoom only, no more press-to-crack.
  const interactionDisabled = remainingBreakCount <= 0;

  // Session-local popped set. Kept here (lifted above the Canvas) because
  // "was anything popped?" fires the break API once on unmount.
  const [poppedPieces, setPoppedPieces] = useState<Set<string>>(() => new Set());

  function handlePiecePopped(pieceName: string) {
    setPoppedPieces((prev) => {
      if (prev.has(pieceName)) return prev;
      const next = new Set(prev);
      next.add(pieceName);
      return next;
    });
  }

  // rotate/zoom/press-and-hold never call the server (docs/api.md) — only a
  // piece actually popping consumes a break. Fires once, iff anything popped
  // this session. A ref (not `poppedPieces` itself) is read here so callers
  // don't need to re-run — and therefore don't re-fire the request — on
  // every pop. Returns the in-flight promise (or undefined if there's
  // nothing to report) so a caller that needs to wait for it can.
  const poppedPiecesRef = useRef(poppedPieces);
  poppedPiecesRef.current = poppedPieces;
  const reportedRef = useRef(false);
  function reportBreakIfNeeded(keepalive: boolean): Promise<void> | undefined {
    if (reportedRef.current || poppedPiecesRef.current.size === 0) return undefined;
    reportedRef.current = true;
    // Best-effort: the break endpoint doesn't change what's already rendered
    // (this viewer is going away), so a failure here has nothing to roll back.
    return breakWakppuball(ownedId, { keepalive })
      .then(() => undefined)
      .catch((error) => {
        console.error('Failed to report wakppuball break', error);
      });
  }

  useImperativeHandle(ref, () => ({
    flushBreakReport: () => reportBreakIfNeeded(false) ?? Promise.resolve()
  }));

  // A normal in-app unmount (navigating elsewhere, or `key` forcing a remount
  // when the main ball changes — see MyWakppuballPage.tsx) fires the cleanup
  // below. A real tab close/refresh never reaches React's unmount at all — the
  // page just dies — so `pagehide` is the actual signal there (docs/api.md
  // calls this out explicitly), and `keepalive` lets the request outlive it.
  useEffect(() => {
    function handlePageHide() {
      reportBreakIfNeeded(true);
    }
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      reportBreakIfNeeded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedId]);

  return (
    <div className="wakppuball-viewer" style={{ position: 'relative' }}>
      {/* Camera sits back far enough that a fully-squashed, bulged ball still fits. */}
      <Canvas camera={{ position: [0, 0, 4], fov: 40 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 5, 4]} intensity={1.1} />
        <directionalLight position={[-4, -2, -3]} intensity={0.3} />
        {/* Rotate (drag) + zoom (scroll/pinch, clamped). Panning off. */}
        <OrbitControls
          enablePan={false}
          enableDamping
          dampingFactor={0.12}
          rotateSpeed={0.6}
          minDistance={MIN_ZOOM_DISTANCE}
          maxDistance={MAX_ZOOM_DISTANCE}
        />
        <ModelErrorBoundary>
          <Suspense fallback={<Html center>3D 불러오는 중…</Html>}>
            <InteractiveWakppuball
              onPiecePopped={handlePiecePopped}
              interactionDisabled={interactionDisabled}
              outerColor={outerColor}
              innerColor={innerColor}
              pattern={pattern}
            />
          </Suspense>
        </ModelErrorBoundary>
      </Canvas>

      {/* TEMPORARY dev aid. Not the server's remainingBreakCount display (see backlog). */}
      {interactionDisabled ? (
        <span className="wakppuball-viewer-hint">뿌시기 횟수를 다 썼어요. 만지고 돌려볼 수는 있어요.</span>
      ) : (
        poppedPieces.size > 0 && <span className="wakppuball-viewer-hint">뿌셔진 조각: {poppedPieces.size}개</span>
      )}
    </div>
  );
});

// Warm the cache so the model is ready by the time the success state mounts.
useGLTF.preload(wakppuballModelUrl);
