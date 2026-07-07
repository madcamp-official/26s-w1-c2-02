import { Canvas } from '@react-three/fiber';
import { Bounds, OrbitControls, useGLTF } from '@react-three/drei';
import { Component, Suspense, useMemo, type ReactNode } from 'react';

function GltfModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  // useGLTF caches and returns the same Object3D per url; the same instance
  // can't be parented into more than one Canvas at once (e.g. several
  // collection tiles showing the same shape), so each mount gets its own
  // clone. Plain clone() is enough for a static prop mesh — a skinned/rigged
  // model would need three-stdlib's SkeletonUtils.clone instead.
  const instance = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={instance} />;
}

// useGLTF suspends while loading and throws on failure; only a class
// component can catch a render-time throw from a child (no hook for this).
class ModelErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Wakppuball3DScene({ modelUrl }: { modelUrl: string }) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 2]} intensity={1.1} />
      <directionalLight position={[-3, -2, -2]} intensity={0.3} />
      {/* fit/observe re-frames the camera to whatever the model's actual
          scale and origin turn out to be — the mesh export conventions
          aren't settled with the 3D modeler yet (docs/3d-asset-contract.md). */}
      <Bounds fit clip observe margin={1.2}>
        <GltfModel url={modelUrl} />
      </Bounds>
      <OrbitControls enablePan={false} />
    </>
  );
}

// Everything that touches @react-three/fiber|drei / three lives in this file
// so WakppuballView can import it with React.lazy() — three.js is large
// enough (~300kB gzipped) that it shouldn't sit in the main bundle for a
// feature that only activates once a shape has a registered GLB.
export function Wakppuball3DCanvas({
  name,
  modelUrl,
  fallback
}: {
  name: string;
  modelUrl: string;
  fallback: ReactNode;
}) {
  return (
    <ModelErrorBoundary fallback={fallback}>
      <div className="wakppuball-visual wakppuball-visual--3d" role="img" aria-label={name}>
        <Canvas camera={{ position: [0, 0, 4], fov: 40 }} dpr={[1, 2]}>
          <Suspense fallback={null}>
            <Wakppuball3DScene modelUrl={modelUrl} />
          </Suspense>
        </Canvas>
      </div>
    </ModelErrorBoundary>
  );
}
