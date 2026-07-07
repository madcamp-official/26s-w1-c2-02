import type { WakppuballShape } from '../../features/wakppuball/wakppuballTypes';

// Local GLB assets, keyed by wakppuball shape. WakppuballView looks a
// customization.shape up here first; shapes with no entry fall back to the
// CSS ball. Empty until the 3D modeler delivers files — see
// docs/3d-asset-contract.md for how to wire a delivered model in.
export const SHAPE_MODEL_ASSETS: Partial<Record<WakppuballShape, string>> = {};
