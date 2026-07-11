/**
 * Deterministic pre-flight readiness gate for the PSUR intake wizard.
 *
 * Mirrors the compliant-intake mandate's readiness scorecard (§10): every
 * check here is a pure, deterministic classification of the edited data pack
 * — no inference, no network. BLOCKERs must be fixed in the Inputs step
 * before a run can start; WARNINGs ship, but the operator is told exactly
 * what the pipeline will do with the data as-is.
 *
 * The live pipeline buckets `region` values through
 * `classify_country_to_psur_region()` on the Python side, where any
 * unrecognized label silently falls to "Rest of World" — the failure mode
 * that zeroes the EEA+TR+XI tables. The region checks below reproduce that
 * classifier's country table so the operator learns about the misfire
 * BEFORE the run instead of in the rendered document.
 *
 * The signed-out simulation models regions as bucket labels (EU / UK /
 * Non-EU) by design, so in simulation mode the region gate validates
 * against those buckets instead of the country table.
 */
import type { Defaults, InputDefault } from './psurSimulation.js';

export type GateSeverity = 'pass' | 'warning' | 'blocker';

export interface GateCheck {
  id: string;
  title: string;
  severity: GateSeverity;
  detail: string;
}

export interface GateResult {
  checks: GateCheck[];
  blockers: number;
  warnings: number;
  green: boolean;
}

// Bloc-level labels that cannot be disaggregated after the fact. Matching is
// case-insensitive on the trimmed value.
const REGION_REJECT_LIST = new Set([
  'emea', 'eu', 'europe', 'european union', 'eea', 'apac', 'asia pacific',
  'asia', 'latam', 'latin america', 'americas', 'north america',
  'northamerica', 'na', 'south america', 'middle east', 'mea', 'africa',
  'nordics', 'dach', 'benelux', 'row', 'rest of world', 'international',
  'global', 'worldwide', 'domestic', 'export', 'other', 'non-eu',
]);

// The country table of classify_country_to_psur_region() (statistics_tables.py),
// title-cased the same way the backend compares (str.title()).
const KNOWN_COUNTRIES = new Set([
  // EEA + Turkey
  'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic',
  'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary',
  'Iceland', 'Ireland', 'Italy', 'Latvia', 'Liechtenstein', 'Lithuania',
  'Luxembourg', 'Malta', 'Netherlands', 'Norway', 'Poland', 'Portugal',
  'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Turkey',
  // Northern Ireland (Windsor Framework → EEA+TR+XI)
  'Northern Ireland', 'Xi',
  // Great Britain bucket
  'United Kingdom', 'Uk', 'Great Britain', 'Gb', 'England', 'Scotland', 'Wales',
  // Named single-country buckets
  'Australia', 'Brazil', 'Canada', 'China', 'Hong Kong', 'Macau', 'Macao',
  'Japan', 'United States', 'Usa', 'Us', 'U.S.', 'U.S.A.', 'Puerto Rico',
]);

const SIM_REGION_BUCKETS = new Set(['EU', 'UK', 'Non-EU']);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function titleCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/(^|[\s\-.])(\p{L})/gu, (m) => m.toUpperCase());
}

function tableRows(inputs: Record<string, InputDefault>, name: string): Record<string, unknown>[] {
  const input = inputs[name];
  return input?.kind === 'table' ? input.rows : [];
}

function jsonValue(inputs: Record<string, InputDefault>, name: string): Record<string, unknown> | null {
  const input = inputs[name];
  return input?.kind === 'json' ? input.value : null;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function uniqueCounts(values: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of values) out.set(v, (out.get(v) ?? 0) + 1);
  return out;
}

function fmtValueCounts(counts: Map<string, number>): string {
  return [...counts.entries()].map(([v, n]) => `"${v}" ×${n}`).join(', ');
}

function monthsBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startIso.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${endIso.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  for (let d = start; d <= end && out.length < 240; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/** All region-bearing values across sales, complaints, and fsca. */
function collectRegionValues(inputs: Record<string, InputDefault>): string[] {
  const values: string[] = [];
  for (const name of ['sales', 'complaints']) {
    for (const row of tableRows(inputs, name)) {
      if ('region' in row) {
        const v = asString(row.region).trim();
        if (v) values.push(v);
      }
    }
  }
  for (const row of tableRows(inputs, 'fsca')) {
    const raw = asString(row.regions_affected);
    for (const part of raw.split(',')) {
      const v = part.trim();
      if (v) values.push(v);
    }
  }
  return values;
}

function firstDateColumn(rows: Record<string, unknown>[]): string | null {
  if (rows.length === 0) return null;
  const first = rows[0]!;
  for (const candidate of ['date', 'event_date', 'received_date']) {
    if (candidate in first) return candidate;
  }
  return null;
}

export function evaluateIntakeReadiness(
  mode: 'live' | 'simulation',
  defaults: Pick<Defaults, 'period'>,
  inputs: Record<string, InputDefault>,
): GateResult {
  const checks: GateCheck[] = [];
  const add = (id: string, title: string, severity: GateSeverity, detail: string) =>
    checks.push({ id, title, severity, detail });

  // ── 1. Region Gate ─────────────────────────────────────────────────
  const regionValues = collectRegionValues(inputs);
  if (regionValues.length > 0) {
    if (mode === 'simulation') {
      const bad = uniqueCounts(regionValues.filter((v) => !SIM_REGION_BUCKETS.has(v)));
      if (bad.size > 0) {
        add('region-gate', 'Region labels', 'blocker',
          `Unknown region label(s): ${fmtValueCounts(bad)}. The simulation buckets on EU / UK / Non-EU — anything else is dropped from the regional tables.`);
      } else {
        add('region-gate', 'Region labels', 'pass',
          `All ${regionValues.length} region values use the simulation's EU / UK / Non-EU buckets.`);
      }
    } else {
      const rejected = uniqueCounts(regionValues.filter((v) => REGION_REJECT_LIST.has(v.trim().toLowerCase())));
      const unrecognized = uniqueCounts(regionValues.filter((v) =>
        !REGION_REJECT_LIST.has(v.trim().toLowerCase()) && !KNOWN_COUNTRIES.has(titleCase(v))));
      if (rejected.size > 0) {
        add('region-reject', 'Region Gate — bloc-level labels', 'blocker',
          `Bloc-level region value(s) found: ${fmtValueCounts(rejected)}. These cannot be disaggregated and the pipeline silently buckets them into "Rest of World" — the EEA+TR+XI tables would read zero. Re-export at country level (one country per row).`);
      }
      if (unrecognized.size > 0) {
        add('region-unknown', 'Region Gate — unrecognized countries', 'warning',
          `Value(s) not in the pipeline's country table: ${fmtValueCounts(unrecognized)}. They will silently fall to "Rest of World". Check spelling (e.g. "Türkiye" → "Turkey").`);
      }
      if (rejected.size === 0 && unrecognized.size === 0) {
        add('region-gate', 'Region Gate', 'pass',
          `All ${regionValues.length} region values resolve to a PSUR region bucket (EEA+TR+XI, United Kingdom, named country, …).`);
      }
    }
  }

  // ── 2. ISO dates + period coverage ────────────────────────────────
  for (const name of ['sales', 'complaints'] as const) {
    const rows = tableRows(inputs, name);
    if (rows.length === 0) continue;
    const dateCol = firstDateColumn(rows);
    if (!dateCol) continue;

    const values = rows.map((r) => asString(r[dateCol]).trim()).filter(Boolean);
    const nonIso = values.filter((v) => !ISO_DATE.test(v));
    if (nonIso.length > 0) {
      add(`${name}-iso`, `${name}: date format`, 'blocker',
        `${nonIso.length} value(s) in "${dateCol}" are not ISO dates (YYYY-MM-DD), e.g. "${nonIso[0]}". Ambiguous day/month orders are never inferred — fix the export.`);
      continue; // coverage below would be noise on unparseable dates
    }

    const expected = monthsBetween(defaults.period.start, defaults.period.end);
    if (expected.length > 0) {
      // Month gaps only indicate missing data for SALES (a monthly export
      // with holes breaks the denominator). Months with zero complaints are
      // normal surveillance reality, not a coverage gap.
      if (name === 'sales') {
        const present = new Set(values.map((v) => v.slice(0, 7)));
        const gaps = expected.filter((m) => !present.has(m));
        if (gaps.length > 0) {
          add('sales-coverage', 'sales: period coverage', 'blocker',
            `No sales rows for ${gaps.length} month(s) of the reporting period: ${gaps.slice(0, 6).join(', ')}${gaps.length > 6 ? ', …' : ''}. Gap months make the denominator and trend charts wrong for the whole period.`);
        } else {
          add('sales-coverage', 'sales: period coverage', 'pass',
            `All ${expected.length} months of the reporting period are covered.`);
        }
      }
      const outside = values.filter((v) => v < defaults.period.start || v > defaults.period.end);
      if (outside.length > 0) {
        add(`${name}-outside`, `${name}: rows outside the period`, 'warning',
          `${outside.length} row(s) dated outside ${defaults.period.start} → ${defaults.period.end} (e.g. "${outside[0]}"). They will be excluded or skew cumulative tables.`);
      }
    }
  }

  // ── 3. serious ∈ {0,1} ─────────────────────────────────────────────
  for (const name of ['complaints', 'external_events'] as const) {
    const rows = tableRows(inputs, name);
    if (rows.length === 0 || !('serious' in (rows[0] ?? {}))) continue;
    const bad = rows
      .map((r) => asString(r.serious).trim())
      .filter((v) => v !== '0' && v !== '1');
    if (bad.length > 0) {
      add(`${name}-serious`, `${name}: seriousness flag`, 'blocker',
        `${bad.length} value(s) in "serious" are not 0/1 (e.g. "${bad[0]}"). Free-text seriousness must be coerced (MDR Art. 2(65)) before the run.`);
    } else {
      add(`${name}-serious`, `${name}: seriousness flag`, 'pass',
        `All ${rows.length} rows carry serious ∈ {0, 1}.`);
    }
  }

  // ── 4. Device context decisive fields ─────────────────────────────
  const device = jsonValue(inputs, 'device_context');
  if (device) {
    const classField = asString(
      device.eu_mdr_classification_and_rule ?? device.risk_class ?? device.device_class,
    );
    if (!classField.trim()) {
      add('device-class', 'Device classification', 'blocker',
        'No EU classification present in device_context. Classification decides PSUR vs PMSR and the reporting cadence.');
    } else if (/class\s+i\b(?!i)/i.test(classField) || classField.trim().toUpperCase() === 'I') {
      add('device-class', 'Device classification', 'blocker',
        `Classification reads "${classField}" — Class I devices produce a PMSR on a biennial cycle, not a PSUR. Reroute before running.`);
    } else {
      add('device-class', 'Device classification', 'pass', `${classField} — PSUR cadence applies.`);
    }

    if ('single_use_or_reusable' in device) {
      const sur = asString(device.single_use_or_reusable).trim();
      if (!sur) {
        add('device-denominator', 'Denominator basis', 'blocker',
          'single_use_or_reusable is empty. This field decides the denominator for every rate in the report (single-use ⇒ units distributed; reusable ⇒ estimated procedures).');
      } else {
        add('device-denominator', 'Denominator basis', 'pass',
          /single/i.test(sur)
            ? 'Single-use ⇒ every rate is computed against units distributed.'
            : `"${sur}" ⇒ rates are computed against estimated procedures — a procedures estimate and methodology must accompany the pack.`);
      }
    }
  }

  // ── 5. RACT rate-format guard ──────────────────────────────────────
  const ract = jsonValue(inputs, 'ract');
  const hazards = Array.isArray(ract?.hazards) ? (ract.hazards as Record<string, unknown>[]) : [];
  if (hazards.length > 0) {
    const suspicious = hazards.filter((h) => {
      const rate = Number(h.max_expected_rate);
      return Number.isFinite(rate) && rate >= 0.05;
    });
    if (suspicious.length > 0) {
      add('ract-rates', 'RACT expected rates', 'warning',
        `${suspicious.length} hazard(s) have max_expected_rate ≥ 0.05 — that looks like a percentage or per-1000 figure, not a raw fraction. A per-1000 value taken raw inflates thresholds 1000× and every occurrence code reads compliant.`);
    } else {
      add('ract-rates', 'RACT expected rates', 'pass',
        `All ${hazards.length} hazard thresholds are plausible raw fractions.`);
    }
  }

  // ── 6. Previous-PSUR period contiguity ─────────────────────────────
  const prev = jsonValue(inputs, 'previous_psur');
  const prevEnd = asString(prev?.reporting_period_end).trim();
  if (prevEnd && ISO_DATE.test(prevEnd) && ISO_DATE.test(defaults.period.start)) {
    const expectedStart = new Date(`${prevEnd}T00:00:00Z`);
    expectedStart.setUTCDate(expectedStart.getUTCDate() + 1);
    const abuts = expectedStart.toISOString().slice(0, 10) === defaults.period.start;
    if (abuts) {
      add('period-contiguity', 'Period contiguity', 'pass',
        `This period starts the day after the previous PSUR ended (${prevEnd}).`);
    } else {
      add('period-contiguity', 'Period contiguity', 'warning',
        `The previous PSUR ended ${prevEnd} but this period starts ${defaults.period.start}. MDCG 2022-21 expects consecutive periods — a gap or overlap needs a documented deviation and comparability statement.`);
    }
  }

  const blockers = checks.filter((c) => c.severity === 'blocker').length;
  const warnings = checks.filter((c) => c.severity === 'warning').length;
  return { checks, blockers, warnings, green: blockers === 0 };
}
