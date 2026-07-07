export type WakppuballPattern = {
  type: 'preset';
  id: 'dots' | 'stripes';
};

export type WakppuballShape = 'sphere';

export type WakppuballCustomization = {
  outerColor: string;
  innerColor: string;
  pattern: WakppuballPattern;
  shape: WakppuballShape;
};

export type WakppuballFracture = {
  thicknessPreset: 'thin' | 'medium' | 'thick';
};

export type WakppuballStatus = 'ACTIVE' | 'CONSUMED';

export type WakppuballAcquiredType = 'CREATED' | 'MATCHED';
