import type { CSSProperties } from 'react';
import { DEFAULT_CUSTOMIZATION } from './wakppuballDefaults';
import type { WakppuballCustomization } from './wakppuballTypes';

// CSS-only 2D placeholder ball. Used directly until a shape has a registered
// 3D asset, and as the fallback WakppuballView swaps to if a model fails to
// load. See wakppuballDefaults.ts for the color/pattern defaults.
export function WakppuballVisual({
  name,
  customization
}: {
  name: string;
  customization?: WakppuballCustomization | null;
}) {
  const runtimeCustomization = customization as
    | (WakppuballCustomization & { bodyColor?: string })
    | null
    | undefined;
  const outerColor =
    runtimeCustomization?.outerColor ??
    runtimeCustomization?.bodyColor ??
    DEFAULT_CUSTOMIZATION.outerColor;
  const innerColor = runtimeCustomization?.innerColor ?? DEFAULT_CUSTOMIZATION.innerColor;
  // CSS fallback has no way to render an uploaded photo, so a 'custom'
  // pattern just falls back to the "no pattern" look here (Phase 8-B
  // rendering is 3D-only, via WakppuballViewer's triplanar wrap).
  const patternId =
    runtimeCustomization?.pattern?.type === 'preset' ? runtimeCustomization.pattern.id : undefined;
  const pattern =
    patternId === 'none' || patternId === 'dots' || patternId === 'stripes' ? patternId : 'none';

  return (
    <div
      className={`wakppuball-visual pattern-${pattern}`}
      role="img"
      aria-label={name}
      style={
        {
          '--wakppuball-outer': outerColor,
          '--wakppuball-inner': innerColor
        } as CSSProperties
      }
    >
      <span className="wakppuball-highlight" />
      <span className="wakppuball-core" />
    </div>
  );
}
