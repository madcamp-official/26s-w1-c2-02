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
  const outerColor = customization?.outerColor ?? DEFAULT_CUSTOMIZATION.outerColor;
  const innerColor = customization?.innerColor ?? DEFAULT_CUSTOMIZATION.innerColor;
  const pattern = customization?.pattern.id ?? DEFAULT_CUSTOMIZATION.pattern.id;

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
