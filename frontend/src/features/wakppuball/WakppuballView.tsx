import { lazy, Suspense } from 'react';
import { SHAPE_MODEL_ASSETS } from '../../assets/models';
import { WakppuballVisual } from './WakppuballVisual';
import { DEFAULT_CUSTOMIZATION } from './wakppuballDefaults';
import type { WakppuballCustomization } from './wakppuballTypes';

// Lazy: three.js + fiber/drei are ~300kB gzipped and only needed once a
// shape actually has a registered model (see Wakppuball3DCanvas.tsx) — until
// then this import is never requested, so it costs nothing.
const Wakppuball3DCanvas = lazy(() =>
  import('./Wakppuball3DCanvas').then((module) => ({ default: module.Wakppuball3DCanvas }))
);

type WakppuballViewProps = {
  name: string;
  customization?: WakppuballCustomization | null;
};

// Drop-in replacement for WakppuballVisual: same props, so existing call
// sites don't change. Renders the real GLB once one is registered for this
// shape in assets/models/index.ts; otherwise (or if loading fails) falls
// back to the CSS ball.
export function WakppuballView({ name, customization }: WakppuballViewProps) {
  const shape = customization?.shape ?? DEFAULT_CUSTOMIZATION.shape;
  const modelUrl = SHAPE_MODEL_ASSETS[shape];
  const fallback = <WakppuballVisual name={name} customization={customization} />;

  if (!modelUrl) {
    return fallback;
  }

  return (
    <Suspense fallback={fallback}>
      <Wakppuball3DCanvas name={name} modelUrl={modelUrl} fallback={fallback} />
    </Suspense>
  );
}
