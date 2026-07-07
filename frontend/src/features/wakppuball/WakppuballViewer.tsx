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
import { Html, OrbitControls, useGLTF } from '@react-three/drei';
import { Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { playWakppuballTouchSound } from '../../shared/sound/soundManager';
import { breakWakppuball } from './wakppuballApi';
// Vite resolves this to a served asset URL. The GLB is Draco-compressed;
// useGLTF pulls the Draco decoder from the gstatic CDN by default (needs network
// in dev). If we ever need fully-offline dev, self-host the decoder in /public.
import wakppuballModelUrl from '../../assets/models/wakppuball-base.glb?url';

// Below this pointer travel (px), a press counts as a "touch on one spot" and pops
// the piece. Past it, the gesture is a drag → OrbitControls rotates, nothing pops.
// This is how rotation and touching are differentiated (by length, not by area).
const TAP_MOVE_THRESHOLD = 8;

// Zoom clamps. Ball radius is 1.0; keep the camera outside it and not too far.
const MIN_ZOOM_DISTANCE = 1.8;
const MAX_ZOOM_DISTANCE = 6;

// ── Press deformation (difficulty "중"). All tunable — expect to adjust together
//    during review. Pressing deforms not just the hit piece but every piece whose
//    rest position is within PRESS_RADIUS of the hit point, with a smooth falloff.
const PRESS_RADIUS = 0.5; // sphere radius is 1.0; a ~half-sphere cap of influence
const COMPRESS_STRENGTH = 0.12; // inward sink; peaks at the press center
const SPREAD_STRENGTH = 0.25; // outward tangential splay; peaks mid-falloff
const POSITION_LERP = 0.28; // per-frame approach toward target (press AND release)

// ── Permanent crack (difficulty "하"). A popped piece stays nudged inward along its
//    radial for the session, widening its hairline gaps so the inner material shows.
//    Replaces the old darken-the-material approach with geometry only.
const CRACK_DEPTH = 0.03;

// ── Macro squash & stretch (whole-ball). A single non-uniform scale on the pieces'
//    parent group, layered on top of (and independent of) the per-piece offsets:
//    the ball flattens along the press axis and bulges perpendicular to it. Tunable.
const SQUASH_AMOUNT = 0.85; // compression fraction along the press axis at full hold
const SQUASH_EXPAND_K = 0.5; // perpendicular bulge factor (volume-preservation approx)
const SQUASH_LERP = 0.1; // springiness of the squash growing while held / relaxing on release
// On a real release the ball stays mostly squashed and only springs back a little,
// for a soft "memory-foam" feel. This is the fraction of squash recovered on release
// (0 = stays fully deformed, 1 = returns to round). A rotation-drag recovers fully.
const SQUASH_RELEASE_RECOVERY = 0.15;

const UNIT_Z = new Vector3(0, 0, 1); // reference axis we align the press axis to for R·S·R⁻¹

// Smooth 0→1 curve. x is normalized closeness: 1 at the press center, 0 at the edge.
function smoothstep(x: number): number {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
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

type Piece = { node: Object3D; rest: Vector3; radial: Vector3 };

// Phase 1–3: render intact + achromatic (no color/pattern yet — those come later).
// Press deforms a radius of pieces around the hit point (compress + spread); the hit
// piece pops permanently (cracks open). Never touches geometry — position only.
// Each frame every piece is driven toward:
//   rest  +  permanent crack offset (if popped)  +  temporary press offset (if pressing)
function InteractiveWakppuball({
  onPiecePopped,
  interactionDisabled
}: {
  onPiecePopped: (pieceName: string) => void;
  interactionDisabled: boolean;
}) {
  const { scene: original } = useGLTF(wakppuballModelUrl);
  // useGLTF caches the scene; clone per mount so cracks/depress reset every visit.
  const scene = useMemo(() => original.clone(true), [original]);

  // Every piece with its rest position and radial (origin→rest) direction, once.
  const pieces = useMemo<Piece[]>(() => {
    const list: Piece[] = [];
    scene.traverse((node) => {
      if (PIECE_NODE_NAME.test(node.name)) {
        const rest = node.position.clone();
        list.push({ node, rest, radial: rest.clone().normalize() });
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
  const spreadVec = useRef(new Vector3());

  // Macro squash: driven by a single scalar (0 = round, grows while held). Applied
  // as a manual non-uniform-scale matrix on `scene`, so we manage its matrix ourselves.
  const baseMatrix = useRef(new Matrix4());
  const squashAmount = useRef(0);
  // Where the squash relaxes to when not pressing: 0 while round, or a frozen
  // residual after a real release (so it stays mostly deformed = squishy memory).
  const residualAmount = useRef(0);
  const squashAxis = useRef(new Vector3(0, 0, 1));
  const mq = useRef(new Quaternion());
  const mR = useRef(new Matrix4());
  const mRinv = useRef(new Matrix4());
  const mS = useRef(new Matrix4());

  // Take over `scene`'s matrix so we can apply an arbitrary-axis non-uniform scale
  // (object.scale is axis-aligned only). Capture its base transform first.
  useEffect(() => {
    scene.updateMatrix();
    baseMatrix.current.copy(scene.matrix);
    scene.matrixAutoUpdate = false;
    return () => {
      scene.matrixAutoUpdate = true;
    };
  }, [scene]);

  // Window-level up/move so a drag that leaves the ball still aborts the press.
  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const press = pressRef.current;
      if (!press || e.pointerId !== press.pointerId) return;
      const moved = Math.hypot(e.clientX - press.startX, e.clientY - press.startY);
      // Turned into a drag → hand off to rotation; fully un-squash (rotating a ball
      // shouldn't leave it dented), no pop.
      if (moved > TAP_MOVE_THRESHOLD) {
        residualAmount.current = 0;
        pressRef.current = null;
      }
    }
    function handleUp(e: PointerEvent) {
      const press = pressRef.current;
      if (!press || e.pointerId !== press.pointerId) return;
      const moved = Math.hypot(e.clientX - press.startX, e.clientY - press.startY);
      if (moved <= TAP_MOVE_THRESHOLD) {
        // The sound already played on press (handlePointerDown) — only the
        // *first* tap on a given piece pops it open here (idempotent,
        // session-local; that's the part that costs a break).
        if (!poppedRef.current.has(press.node.name)) {
          poppedRef.current.add(press.node.name);
          onPiecePopped(press.node.name);
        }
      }
      // Real release → keep most of the squash, spring back only a little.
      residualAmount.current = squashAmount.current * (1 - SQUASH_RELEASE_RECOVERY);
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
    // Plays on press, not release — squeezing/cracking should be felt the
    // instant a finger lands, even if the gesture then turns into a drag.
    playWakppuballTouchSound();
    const hitPoint = hit.point.clone();
    node.parent?.worldToLocal(hitPoint); // match the pieces' parent-local space
    pressRef.current = { node, hitPoint, startX: e.nativeEvent.clientX, startY: e.nativeEvent.clientY, pointerId: e.nativeEvent.pointerId };
  }

  // Drive every piece toward rest + (permanent crack) + (temporary press), smoothly.
  useFrame(() => {
    const press = pressRef.current;
    for (const piece of pieces) {
      const target = targetVec.current.copy(piece.rest);

      // Permanent crack ("하"): popped pieces sit slightly sunk in, gaps opened.
      if (poppedRef.current.has(piece.node.name)) {
        target.addScaledVector(piece.radial, -CRACK_DEPTH);
      }

      // Temporary press ("중"): radius-based, distance falloff around the hit point.
      if (press) {
        const dist = piece.rest.distanceTo(press.hitPoint);
        if (dist < PRESS_RADIUS) {
          const weight = smoothstep(1 - dist / PRESS_RADIUS);
          // Compression: inward, strongest at the center of the press.
          target.addScaledVector(piece.radial, -COMPRESS_STRENGTH * weight);
          // Spread: outward along the surface (tangential), strongest mid-falloff so
          // the center mostly sinks while the ring around it splays open.
          const spread = spreadVec.current.copy(piece.rest).sub(press.hitPoint);
          spread.addScaledVector(piece.radial, -spread.dot(piece.radial)); // drop radial part
          if (spread.lengthSq() > 1e-8) {
            spread.normalize();
            target.addScaledVector(spread, SPREAD_STRENGTH * weight * (1 - weight));
          }
        }
      }

      piece.node.position.lerp(target, POSITION_LERP);
    }

    // Macro squash & stretch: flatten the whole ball along the press axis, bulge
    // perpendicular. Independent of the per-piece offsets — parent/child compose.
    if (press) squashAxis.current.copy(press.hitPoint).normalize();
    // While held → grow to full; released → settle to the frozen residual (not 0).
    const targetAmount = press ? SQUASH_AMOUNT : residualAmount.current;
    squashAmount.current += (targetAmount - squashAmount.current) * SQUASH_LERP;

    if (squashAmount.current > 0.001) {
      const amount = squashAmount.current;
      // Align the press axis to Z, scale (perp, perp, along), rotate back: R·S·R⁻¹.
      mq.current.setFromUnitVectors(UNIT_Z, squashAxis.current);
      mR.current.makeRotationFromQuaternion(mq.current);
      mRinv.current.copy(mR.current).transpose(); // rotation inverse = transpose
      mS.current.makeScale(1 + amount * SQUASH_EXPAND_K, 1 + amount * SQUASH_EXPAND_K, 1 - amount);
      scene.matrix.copy(baseMatrix.current).multiply(mR.current).multiply(mS.current).multiply(mRinv.current);
    } else {
      scene.matrix.copy(baseMatrix.current);
    }
    scene.matrixWorldNeedsUpdate = true;
  });

  return <primitive object={scene} onPointerDown={handlePointerDown} />;
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
  { ownedId: string; remainingBreakCount: number }
>(function WakppuballViewer({ ownedId, remainingBreakCount }, ref) {
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
            <InteractiveWakppuball onPiecePopped={handlePiecePopped} interactionDisabled={interactionDisabled} />
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
