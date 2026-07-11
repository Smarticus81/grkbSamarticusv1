import { describe, expect, it } from 'vitest';
import { evaluateIntakeReadiness, type GateResult } from './psurIntakeGate.js';
import { SIMULATED_DEFAULTS, type Defaults, type InputDefault } from './psurSimulation.js';

function table(columns: string[], rows: Record<string, unknown>[]): InputDefault {
  return {
    kind: 'table',
    columns: columns.map((name) => ({ name, type: 'string', required: true })),
    rows,
  };
}

function monthlyRows(field: string, extra: Record<string, unknown>): Record<string, unknown>[] {
  return Array.from({ length: 12 }, (_, i) => ({
    [field]: `2023-${String(i + 1).padStart(2, '0')}-05`,
    ...extra,
  }));
}

function livePack(overrides: Partial<Record<string, InputDefault>> = {}): {
  defaults: Pick<Defaults, 'period'>;
  inputs: Record<string, InputDefault>;
} {
  const inputs: Record<string, InputDefault> = {
    sales: table(['date', 'region', 'units_sold'], monthlyRows('date', { region: 'Germany', units_sold: 100 })),
    complaints: table(
      ['complaint_id', 'event_date', 'region', 'serious'],
      monthlyRows('event_date', { complaint_id: 'C', region: 'France', serious: '0' }),
    ),
    fsca: table(['action_id', 'regions_affected'], [{ action_id: 'F1', regions_affected: 'Germany, United States' }]),
    device_context: {
      kind: 'json',
      value: {
        eu_mdr_classification_and_rule: 'EU Class IIb under EU MDR 2017/745, Rule 10',
        single_use_or_reusable: 'Single-use',
      },
    },
    ract: { kind: 'json', value: { hazards: [{ hazard_id: 'HZ1', max_expected_rate: 0.0005 }] } },
    previous_psur: { kind: 'json', value: { reporting_period_end: '2022-12-31' } },
    ...overrides,
  };
  return { defaults: { period: { start: '2023-01-01', end: '2023-12-31' } }, inputs };
}

function byId(result: GateResult, id: string) {
  return result.checks.find((c) => c.id === id);
}

describe('evaluateIntakeReadiness — live mode', () => {
  it('passes a clean country-level pack', () => {
    const { defaults, inputs } = livePack();
    const result = evaluateIntakeReadiness('live', defaults, inputs);
    expect(result.blockers).toBe(0);
    expect(result.green).toBe(true);
    expect(byId(result, 'region-gate')?.severity).toBe('pass');
    expect(byId(result, 'period-contiguity')?.severity).toBe('pass');
  });

  it('blocks bloc-level region labels (the reject-list)', () => {
    const { defaults, inputs } = livePack({
      sales: table(['date', 'region', 'units_sold'], monthlyRows('date', { region: 'Europe', units_sold: 100 })),
    });
    const result = evaluateIntakeReadiness('live', defaults, inputs);
    expect(result.green).toBe(false);
    const check = byId(result, 'region-reject');
    expect(check?.severity).toBe('blocker');
    expect(check?.detail).toContain('"Europe" ×12');
    expect(check?.detail).toContain('Rest of World');
  });

  it('warns on countries the classifier will not recognize', () => {
    const { defaults, inputs } = livePack({
      fsca: table(['action_id', 'regions_affected'], [{ action_id: 'F1', regions_affected: 'Deuchland' }]),
    });
    const result = evaluateIntakeReadiness('live', defaults, inputs);
    expect(byId(result, 'region-unknown')?.severity).toBe('warning');
    expect(byId(result, 'region-unknown')?.detail).toContain('Deuchland');
  });

  it('blocks gap months in sales coverage', () => {
    const rows = monthlyRows('date', { region: 'Germany', units_sold: 100 }).filter(
      (r) => !(r.date as string).startsWith('2023-06'),
    );
    const { defaults, inputs } = livePack({ sales: table(['date', 'region', 'units_sold'], rows) });
    const result = evaluateIntakeReadiness('live', defaults, inputs);
    const check = byId(result, 'sales-coverage');
    expect(check?.severity).toBe('blocker');
    expect(check?.detail).toContain('2023-06');
  });

  it('blocks non-ISO dates without attempting to infer day/month order', () => {
    const rows = [{ date: '03/04/2023', region: 'Germany', units_sold: 100 }];
    const { defaults, inputs } = livePack({ sales: table(['date', 'region', 'units_sold'], rows) });
    const result = evaluateIntakeReadiness('live', defaults, inputs);
    expect(byId(result, 'sales-iso')?.severity).toBe('blocker');
  });

  it('blocks serious values outside {0,1}', () => {
    const rows = monthlyRows('event_date', { complaint_id: 'C', region: 'France', serious: 'yes' });
    const { defaults, inputs } = livePack({
      complaints: table(['complaint_id', 'event_date', 'region', 'serious'], rows),
    });
    const result = evaluateIntakeReadiness('live', defaults, inputs);
    expect(byId(result, 'complaints-serious')?.severity).toBe('blocker');
  });

  it('blocks Class I devices (PMSR reroute)', () => {
    const { defaults, inputs } = livePack({
      device_context: {
        kind: 'json',
        value: { eu_mdr_classification_and_rule: 'EU Class I', single_use_or_reusable: 'Single-use' },
      },
    });
    const result = evaluateIntakeReadiness('live', defaults, inputs);
    const check = byId(result, 'device-class');
    expect(check?.severity).toBe('blocker');
    expect(check?.detail).toContain('PMSR');
  });

  it('does not misread Class IIb / III as Class I', () => {
    for (const label of ['EU Class IIb, Rule 10', 'Class III implantable', 'EU Class IIa']) {
      const { defaults, inputs } = livePack({
        device_context: {
          kind: 'json',
          value: { eu_mdr_classification_and_rule: label, single_use_or_reusable: 'Single-use' },
        },
      });
      expect(byId(evaluateIntakeReadiness('live', defaults, inputs), 'device-class')?.severity).toBe('pass');
    }
  });

  it('warns when RACT rates look like percentages or per-1000 figures', () => {
    const { defaults, inputs } = livePack({
      ract: { kind: 'json', value: { hazards: [{ hazard_id: 'HZ1', max_expected_rate: 1.2 }] } },
    });
    const result = evaluateIntakeReadiness('live', defaults, inputs);
    expect(byId(result, 'ract-rates')?.severity).toBe('warning');
  });

  it('warns on overlapping periods (D7 deviation needed)', () => {
    const { defaults, inputs } = livePack({
      previous_psur: { kind: 'json', value: { reporting_period_end: '2023-03-31' } },
    });
    const result = evaluateIntakeReadiness('live', defaults, inputs);
    const check = byId(result, 'period-contiguity');
    expect(check?.severity).toBe('warning');
    expect(check?.detail).toContain('2023-03-31');
  });
});

describe('evaluateIntakeReadiness — simulation mode', () => {
  it('passes the shipped simulation pack (bucket labels are by design)', () => {
    const result = evaluateIntakeReadiness('simulation', SIMULATED_DEFAULTS, SIMULATED_DEFAULTS.inputs);
    expect(result.blockers).toBe(0);
    expect(result.green).toBe(true);
    expect(byId(result, 'region-gate')?.severity).toBe('pass');
  });

  it('blocks unknown region labels in simulation mode', () => {
    const inputs = structuredClone(SIMULATED_DEFAULTS.inputs);
    const sales = inputs.sales;
    if (sales?.kind === 'table') sales.rows[0]!.region = 'Atlantis';
    const result = evaluateIntakeReadiness('simulation', SIMULATED_DEFAULTS, inputs);
    expect(byId(result, 'region-gate')?.severity).toBe('blocker');
    expect(byId(result, 'region-gate')?.detail).toContain('Atlantis');
  });
});
