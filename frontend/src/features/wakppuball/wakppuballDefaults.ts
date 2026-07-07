import type { WakppuballCustomization, WakppuballFracture } from './wakppuballTypes';

export const DEFAULT_CUSTOMIZATION: WakppuballCustomization = {
  outerColor: '#f3d35b',
  innerColor: '#ffffff',
  pattern: { type: 'preset', id: 'dots' },
  shape: 'sphere'
};

export const DEFAULT_FRACTURE: WakppuballFracture = {
  thicknessPreset: 'medium'
};
