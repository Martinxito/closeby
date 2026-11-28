'use client';

import { useState } from 'react';
import { PhysicalSellForm } from './physical-sell-form';
import { SellForm } from './sell-form';

/** "¿Qué vendes?": a file (digital, primary) or something to hand over in person. */
export function SaleKindChooser() {
  const [kind, setKind] = useState<'digital' | 'physical'>('digital');
  return (
    <div className="stack">
      <div className="segmented" role="tablist" aria-label="Tipo de venta">
        <button type="button" role="tab" aria-selected={kind === 'digital'} onClick={() => setKind('digital')}>
          Un archivo
        </button>
        <button type="button" role="tab" aria-selected={kind === 'physical'} onClick={() => setKind('physical')}>
          Algo para entregar en persona
        </button>
      </div>
      {kind === 'digital' ? <SellForm /> : <PhysicalSellForm />}
    </div>
  );
}
