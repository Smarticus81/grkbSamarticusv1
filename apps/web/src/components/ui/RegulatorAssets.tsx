import { useState } from 'react';
import { REGULATOR_ASSETS } from '../../lib/regulators.js';

function useAssetAvailability() {
  const [availability, setAvailability] = useState<Record<string, boolean | null>>(() =>
    Object.fromEntries(REGULATOR_ASSETS.map((item) => [item.id, null])),
  );

  return {
    availability,
    markLoaded: (id: string) => setAvailability((current) => ({ ...current, [id]: true })),
    markMissing: (id: string) => setAvailability((current) => ({ ...current, [id]: false })),
  };
}

export function RegulatorHeroRail() {
  const { availability, markLoaded, markMissing } = useAssetAvailability();

  return (
    <div style={{ marginTop: 28 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>Regulatory coverage</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, minmax(128px, 1fr))',
          gap: 10,
          overflowX: 'auto',
          paddingBottom: 6,
        }}
      >
        {REGULATOR_ASSETS.map((item) => {
          const isMissing = availability[item.id] === false;
          if (isMissing) return null;

          return (
            <div
              key={item.id}
              style={{
                minWidth: 128,
                padding: '14px 12px',
                border: '1px solid var(--rule)',
                borderRadius: 'var(--r-3)',
                background: 'var(--paper-deep)',
                display: 'grid',
                gap: 10,
                alignContent: 'start',
              }}
            >
              <div
                style={{
                  height: 34,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                }}
              >
                <img
                  src={item.assetPath}
                  alt={`${item.authority} official mark`}
                  style={{ maxHeight: 28, maxWidth: '100%', objectFit: 'contain' }}
                  onLoad={() => markLoaded(item.id)}
                  onError={() => markMissing(item.id)}
                />
              </div>
              <div>
                <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.35 }}>{item.label}</div>
                <div style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>
                  {item.authority}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RegulatorCompactStrip() {
  const { markLoaded, markMissing } = useAssetAvailability();

  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
      {REGULATOR_ASSETS.map((item) => (
        <div
          key={item.id}
          title={`${item.label} - ${item.authority}`}
          style={{
            minWidth: 88,
            height: 44,
            padding: '8px 10px',
            border: '1px solid var(--rule)',
            borderRadius: 'var(--r-2)',
            background: 'var(--paper-deep)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={item.assetPath}
            alt={`${item.authority} official mark`}
            style={{ maxWidth: '100%', maxHeight: 20, objectFit: 'contain' }}
            onLoad={() => markLoaded(item.id)}
            onError={(event) => {
              markMissing(item.id);
              event.currentTarget.style.display = 'none';
            }}
          />
        </div>
      ))}
    </div>
  );
}
