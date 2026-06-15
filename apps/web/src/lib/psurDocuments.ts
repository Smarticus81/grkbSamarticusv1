/**
 * PSUR document rendering for the simulated demo run.
 *
 * One document model, three renderers — all fully client-side:
 *   - renderPsurHtml  → inline preview (results step iframe)
 *   - renderPsurPdf   → downloadable PDF (jsPDF + autotable, lazy-loaded)
 *   - renderPsurDocx  → downloadable DOCX (docx, lazy-loaded)
 *
 * Every renderer stamps the output as SIMULATED: diagonal watermark on every
 * PDF page, a warning header on every DOCX page, banner + watermarks in HTML.
 */

import type { InputDefault, SimDerivedStats } from './psurSimulation.js';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface PsurTableModel {
  title?: string;
  head: string[];
  rows: string[][];
}

export interface PsurChartModel {
  title: string;
  unit: string;
  points: { label: string; value: number }[];
  threshold?: number;
}

export interface PsurSectionModel {
  title: string;
  paragraphs: string[];
  charts?: PsurChartModel[];
  tables: PsurTableModel[];
}

export interface PsurModel {
  docTitle: string;
  metaLines: string[];
  disclaimer: string;
  watermark: string;
  sections: PsurSectionModel[];
  footerNote: string;
}

export interface PsurConsistencyAudit {
  passed: boolean;
  findings: string[];
}

// ---------------------------------------------------------------------------
// Input helpers (self-contained; psurSimulation is imported as types only)
// ---------------------------------------------------------------------------

function rowsOf(inputs: Record<string, InputDefault>, name: string): Record<string, unknown>[] {
  const input = inputs[name];
  return input?.kind === 'table' ? input.rows : [];
}

function valueOf(inputs: Record<string, InputDefault>, name: string): Record<string, unknown> {
  const input = inputs[name];
  return input?.kind === 'json' ? input.value : {};
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function str(value: unknown): string {
  return cell(value);
}

const fmt = (n: number): string => n.toLocaleString('en-GB');

function inputTable(inputs: Record<string, InputDefault>, name: string, title?: string): PsurTableModel[] {
  const input = inputs[name];
  if (!input || input.kind !== 'table' || input.rows.length === 0) return [];
  const head = input.columns.map((c) => c.name.replace(/_/g, ' '));
  const rows = input.rows.map((row) => input.columns.map((c) => cell(row[c.name])));
  return [{ ...(title ? { title } : {}), head, rows }];
}

function filteredInputTable(
  inputs: Record<string, InputDefault>,
  name: string,
  predicate: (row: Record<string, unknown>) => boolean,
  title: string,
): PsurTableModel[] {
  const input = inputs[name];
  if (!input || input.kind !== 'table') return [];
  const selected = input.rows.filter(predicate);
  if (selected.length === 0) return [];
  const head = input.columns.map((c) => c.name.replace(/_/g, ' '));
  const rows = selected.map((row) => input.columns.map((c) => cell(row[c.name])));
  return [{ title, head, rows }];
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function groupSum(rows: Record<string, unknown>[], labelKey: string, valueKey: string): { label: string; value: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const label = str(row[labelKey]).trim() || 'Unspecified';
    totals.set(label, (totals.get(label) ?? 0) + num(row[valueKey]));
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function groupCount(rows: Record<string, unknown>[], labelKey: string): { label: string; value: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const label = str(row[labelKey]).trim() || 'Unspecified';
    totals.set(label, (totals.get(label) ?? 0) + 1);
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function severityLabel(value: unknown): string {
  const raw = str(value).trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : 'Unspecified';
}

function severityOrder(label: string): number {
  const normalized = label.toLowerCase();
  if (normalized === 'minor') return 1;
  if (normalized === 'major') return 2;
  if (normalized === 'serious') return 3;
  if (normalized === 'critical') return 4;
  return 99;
}

function severityBreakdown(rows: Record<string, unknown>[]): Array<{
  severity: string;
  complaints: number;
  patientHarmCases: number;
  seriousContribution: number;
}> {
  const totals = new Map<string, { complaints: number; patientHarmCases: number; seriousContribution: number }>();
  for (const row of rows) {
    const severity = severityLabel(row.severity);
    const patientHarm = row.patient_harm === true;
    const bucket = totals.get(severity) ?? { complaints: 0, patientHarmCases: 0, seriousContribution: 0 };
    bucket.complaints += 1;
    if (patientHarm) bucket.patientHarmCases += 1;
    if (severity.toLowerCase() === 'serious' || patientHarm) bucket.seriousContribution += 1;
    totals.set(severity, bucket);
  }
  return [...totals.entries()]
    .map(([severity, totalsForSeverity]) => ({ severity, ...totalsForSeverity }))
    .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity) || a.severity.localeCompare(b.severity));
}

function severityBreakdownTable(rows: Record<string, unknown>[]): PsurTableModel {
  const breakdown = severityBreakdown(rows);
  return {
    title: 'Complaint severity and patient harm breakdown',
    head: ['Severity', 'Complaints', 'Patient harm cases', 'Serious-count contribution'],
    rows:
      breakdown.length > 0
        ? breakdown.map((row) => [
            row.severity,
            fmt(row.complaints),
            fmt(row.patientHarmCases),
            fmt(row.seriousContribution),
          ])
        : [['No complaints', '0', '0', '0']],
  };
}

function complaintQuarter(row: Record<string, unknown>): string {
  const month = Number(str(row.received_date).slice(5, 7));
  if (month >= 1 && month <= 3) return 'Q1';
  if (month >= 4 && month <= 6) return 'Q2';
  if (month >= 7 && month <= 9) return 'Q3';
  if (month >= 10 && month <= 12) return 'Q4';
  return 'Undated';
}

function chartTable(chart: PsurChartModel): PsurTableModel {
  const max = Math.max(chart.threshold ?? 0, ...chart.points.map((p) => p.value), 1);
  return {
    title: `${chart.title} chart data`,
    head: ['Metric', 'Value', 'Visual scale'],
    rows: chart.points.map((point) => {
      const marks = Math.max(1, Math.round((point.value / max) * 24));
      return [point.label, `${fmt(point.value)} ${chart.unit}`, '#'.repeat(marks)];
    }),
  };
}

// ---------------------------------------------------------------------------
// Model builder
// ---------------------------------------------------------------------------

export function buildPsurModel(
  period: { start: string; end: string },
  inputs: Record<string, InputDefault>,
  stats: SimDerivedStats,
): PsurModel {
  const device = valueOf(inputs, 'device_context');
  const pmsPlan = valueOf(inputs, 'pms_plan');
  const previous = valueOf(inputs, 'previous_psur');
  const clinicalSafety = valueOf(inputs, 'clinical_safety');
  const clinicalPerformance = valueOf(inputs, 'clinical_performance');

  const markets = Array.isArray(device.markets) ? (device.markets as unknown[]).join(', ') : str(device.markets);
  const salesRows = rowsOf(inputs, 'sales');
  const complaintRows = rowsOf(inputs, 'complaints');
  const salesByRegionChart: PsurChartModel = {
    title: 'Units sold by market',
    unit: 'units',
    points: groupSum(salesRows, 'region', 'units_sold'),
  };
  const complaintsByQuarterChart: PsurChartModel = {
    title: 'Complaints received by quarter',
    unit: 'complaints',
    points: groupCount(complaintRows.map((row) => ({ ...row, quarter: complaintQuarter(row) })), 'quarter'),
  };
  const complaintsBySeverityChart: PsurChartModel = {
    title: 'Complaints by severity',
    unit: 'complaints',
    points: severityBreakdown(complaintRows).map((row) => ({ label: row.severity, value: row.complaints })),
  };
  const complaintRateChart: PsurChartModel = {
    title: 'Complaint rate versus PMS threshold',
    unit: 'per 10,000 units',
    points: [
      { label: 'Previous PSUR', value: stats.prevRatePer10k },
      { label: 'Current period', value: stats.ratePer10k },
      { label: 'PMS threshold', value: stats.threshold },
    ],
    threshold: stats.threshold,
  };

  const trendNarrative = stats.trendSignal
    ? `The complaint rate of ${stats.ratePer10k} per 10,000 units sold EXCEEDS the PMS-plan trend threshold of ${stats.threshold} per 10,000. A statistically significant increase within the meaning of EU MDR Article 88 is identified; a trend report and escalation to the risk management file are required before this report can conclude a favourable benefit–risk profile.`
    : `The complaint rate of ${stats.ratePer10k} per 10,000 units sold remains below the PMS-plan trend threshold of ${stats.threshold} per 10,000 (previous period: ${stats.prevRatePer10k}). No statistically significant increase within the meaning of EU MDR Article 88 is identified.`;

  const conclusion = stats.benefitRiskFavourable
    ? `the benefit–risk determination for the ${str(device.device_name)} remains FAVOURABLE. The known and foreseeable risks documented in the risk management file are outweighed by the clinical benefit of controlled infusion therapy, and no new hazards were identified in the reporting period.`
    : `the benefit–risk determination for the ${str(device.device_name)} CANNOT be confirmed as favourable without further action. The complaint-trend signal identified in Section E must be investigated, the risk management file updated, and corrective measures evaluated before the next periodic review.`;

  const euCadenceText =
    stats.reportType === 'PMSR'
      ? `EU PMSR path selected under ${stats.euCadenceCitation}; the report remains available to competent authorities and is updated when necessary.`
      : `EU PSUR path selected under ${stats.euCadenceCitation}; the report is updated at least annually and submitted to the notified body.`;
  const ukCadenceText = stats.ukMdrApplies
    ? `UK MDR applies because ${fmt(stats.ukUnitsSold)} UK unit(s) were sold or the UK market is listed; the applicable UK cadence basis is ${stats.ukCadenceCitation}.`
    : 'UK MDR post-market reporting cadence is not activated because no UK market or UK sales are present in the edited data pack.';

  const imdrfTable: PsurTableModel = {
    title: 'Complaints by IMDRF term',
    head: ['IMDRF code', 'Term', 'Count'],
    rows:
      stats.topImdrf.length > 0
        ? stats.topImdrf.map((t) => [t.code, t.label, String(t.count)])
        : [['—', 'No coded complaints', '0']],
  };

  const regulatoryBasisTable: PsurTableModel = {
    title: 'Regulatory basis and cadence',
    head: ['Regime / guidance', 'Basis applied', 'Report implication'],
    rows: [
      [
        'EU MDR',
        stats.euCadenceCitation,
        stats.reportType === 'PMSR'
          ? 'Class I PMSR path; report retained and updated when necessary.'
          : 'PSUR path; report updated at least annually for the simulated class.',
      ],
      [
        'MDCG 2022-21',
        'Sections A-M PSUR content structure',
        'All 13 sections are populated and reconciled against the mock data pack.',
      ],
      [
        'UK MDR',
        stats.ukMdrApplies ? stats.ukCadenceCitation : 'Not activated',
        stats.ukMdrApplies
          ? `${fmt(stats.ukUnitsSold)} UK unit(s) trigger UK post-market reporting consideration.`
          : 'No UK sales or UK market in the edited data pack.',
      ],
      [
        'IMDRF',
        'IMDRF/AE WG/N43 adverse-event terminology',
        'Complaint device-problem codes are grouped into IMDRF terms for trend review.',
      ],
      ['ISO 14971', 'Post-production information review', 'Complaint and PMS signals are reconciled to the risk analysis file.'],
      ['ISO 13485', 'CAPA / PMS process controls', 'Open CAPA and PMS-plan actions remain visible in this draft.'],
    ],
  };
  const sectionCoverageTable: PsurTableModel = {
    title: 'Section-level regulatory coverage matrix',
    head: ['Section', 'Regulatory / standard basis', 'Source data used', 'Traceable calculation / conclusion'],
    rows: [
      [
        'A Executive summary',
        `${stats.euCadenceCitation}; MDCG 2022-21 A-M summary expectations`,
        'All input domains',
        'Totals, trend verdict, serious incidents, CAPA status, FSCA count and benefit-risk conclusion are reconciled from Sections C-M.',
      ],
      [
        'B Device description and classification',
        `${stats.euCadenceCitation}; ${stats.ukMdrApplies ? stats.ukCadenceCitation : 'UK MDR not activated'}; MDCG 2022-21 device identification`,
        'device_context; pms_plan',
        `${stats.reportType} path selected from device class and market exposure.`,
      ],
      [
        'C Sales, usage and population exposure',
        'MDCG 2022-21 sales / estimated usage content',
        'sales',
        `${fmt(stats.unitsSold)} total units and ${fmt(stats.ukUnitsSold)} UK units drive exposure denominators.`,
      ],
      [
        'D Serious incidents and FSCAs',
        'EU MDR vigilance and MDCG 2022-21 serious incident / FSCA content',
        'complaints; fsca; clinical_safety',
        `${fmt(stats.seriousCount)} serious incident(s) and ${fmt(stats.fscaCount)} FSCA(s) carried into the report body.`,
      ],
      [
        'E Complaint data and trend analysis',
        'EU MDR Art. 88; MDCG 2022-21 trend section; IMDRF/AE WG/N43',
        'complaints; sales; pms_plan',
        `${stats.ratePer10k} per 10,000 complaint rate compared with ${stats.threshold} per 10,000 PMS threshold.`,
      ],
      [
        'F CAPA',
        'ISO 13485 §8.5.2; MDCG 2022-21 CAPA follow-up',
        'capa',
        `${fmt(stats.capaOpen)} open CAPA(s) remain visible for closure tracking.`,
      ],
      [
        'G External vigilance and similar-device events',
        'MDCG 2022-21 external event review',
        'external_events',
        `${fmt(stats.externalEventCount)} external event(s) screened for new hazards.`,
      ],
      [
        'H Literature review',
        'MDCG 2022-21 literature review content',
        'literature',
        `${fmt(stats.literatureCount)} literature record(s) included in the safety/performance source data set.`,
      ],
      [
        'I Previous PSUR follow-up',
        'MDCG 2022-21 previous-period follow-up',
        'previous_psur',
        `Previous complaint rate ${stats.prevRatePer10k} per 10,000 retained as comparator.`,
      ],
      [
        'J Clinical safety summary',
        'MDCG 2022-21 clinical safety content',
        'clinical_safety; complaints',
        `${fmt(stats.seriousCount)} serious complaint(s) reconciled against clinical safety summary fields.`,
      ],
      [
        'K Clinical performance summary',
        'MDCG 2022-21 clinical performance content',
        'clinical_performance',
        'Specified and observed flow accuracy are reported together so performance claims remain data-backed.',
      ],
      [
        'L Risk management file reconciliation',
        'ISO 14971 §10; MDCG 2022-21 risk reconciliation',
        'ract; complaints; pms_plan',
        `${fmt(stats.ractControlled)} of ${fmt(stats.ractTotal)} risk-file line item(s) are controlled.`,
      ],
      [
        'M Benefit-risk determination',
        `${stats.euCadenceCitation}; ISO 14971; MDCG 2022-21 conclusion`,
        'Sections C-L',
        stats.benefitRiskFavourable
          ? 'Benefit-risk remains favourable because no trend threshold is exceeded.'
          : 'Benefit-risk cannot be confirmed until the trend signal is investigated.',
      ],
    ],
  };
  const reconciliationTable: PsurTableModel = {
    title: 'Data reconciliation summary',
    head: ['Measure', 'Value used in report', 'Source in mock data'],
    rows: [
      ['Units sold', fmt(stats.unitsSold), 'sales.units_sold'],
      ['UK units sold', fmt(stats.ukUnitsSold), 'sales rows where region/market is UK'],
      ['Complaints received', fmt(stats.complaintCount), 'complaints rows'],
      ['Complaint rate', `${stats.ratePer10k} per 10,000 units`, 'complaints / sales * 10,000'],
      ['PMS threshold', `${stats.threshold} per 10,000 units`, 'pms_plan.trend_threshold_per_10k'],
      ['Previous PSUR complaint rate', `${stats.prevRatePer10k} per 10,000 units`, 'previous_psur.complaint_rate_per_10k'],
      ['Serious incidents', fmt(stats.seriousCount), 'complaints severity/patient_harm fields'],
      ['FSCAs', fmt(stats.fscaCount), 'fsca rows'],
      ['CAPAs total / open', `${fmt(stats.capaTotal)} / ${fmt(stats.capaOpen)}`, 'capa rows and status'],
      ['Literature records', fmt(stats.literatureCount), 'literature rows'],
      ['Benefit-risk conclusion', stats.benefitRiskFavourable ? 'Favourable' : 'Cannot be confirmed as favourable', 'Derived from trend signal and clinical/risk source data'],
    ],
  };
  const seriousComplaintTables = filteredInputTable(
    inputs,
    'complaints',
    (row) => str(row.severity).toLowerCase() === 'serious' || row.patient_harm === true,
    'Serious incident complaint records',
  );

  const sections: PsurSectionModel[] = [
    {
      title: 'Section A — Executive Summary',
      paragraphs: [
        `During the reporting period, ${fmt(stats.unitsSold)} units were sold across ${markets}. ${fmt(stats.complaintCount)} complaints were received (${stats.ratePer10k} per 10,000 units; previous period ${stats.prevRatePer10k}), of which ${fmt(stats.seriousCount)} were serious. ${fmt(stats.fscaCount)} field safety corrective action(s) were undertaken and ${fmt(stats.capaTotal)} CAPA(s) were processed (${fmt(stats.capaOpen)} remaining open). Based on the totality of post-market surveillance data summarised in Sections C–L, ${conclusion}`,
      ],
      tables: [reconciliationTable],
    },
    {
      title: 'Section B — Device Description and Classification',
      paragraphs: [
        `${str(device.device_name)} (${str(device.intended_purpose)}). Class ${str(device.risk_class)} under EU MDR Annex VIII; certificate ${str(device.certificate_number)} issued by ${str(device.notified_body)}. ${euCadenceText} ${ukCadenceText}`,
      ],
      tables: [regulatoryBasisTable, sectionCoverageTable],
    },
    {
      title: 'Section C — Sales, Usage and Population Exposure',
      paragraphs: [
        `Total units sold in the period: ${fmt(stats.unitsSold)}, including ${fmt(stats.ukUnitsSold)} unit(s) in the UK market. Exposure is estimated per unit placed on the market; usage assumptions follow the PMS plan.`,
      ],
      charts: [salesByRegionChart],
      tables: inputTable(inputs, 'sales'),
    },
    {
      title: 'Section D — Serious Incidents and Field Safety Corrective Actions',
      paragraphs: [
        `${fmt(stats.seriousCount)} serious incident(s) were recorded in the period. ${str(clinicalSafety.summary)}`,
      ],
      tables: [...seriousComplaintTables, ...inputTable(inputs, 'fsca')],
    },
    {
      title: 'Section E — Complaint Data and Trend Analysis (Article 88)',
      paragraphs: [trendNarrative],
      charts: [complaintsByQuarterChart, complaintsBySeverityChart, complaintRateChart],
      tables: [imdrfTable, severityBreakdownTable(complaintRows), ...inputTable(inputs, 'complaints', 'Complaint records')],
    },
    {
      title: 'Section F — Corrective and Preventive Actions',
      paragraphs: [
        `${fmt(stats.capaTotal)} CAPA(s) were linked to post-market data in the period; ${fmt(stats.capaOpen)} remain open and are tracked to closure under ISO 13485 §8.5.2.`,
      ],
      tables: inputTable(inputs, 'capa'),
    },
    {
      title: 'Section G — External Vigilance and Similar-Device Events',
      paragraphs: [
        `${fmt(stats.externalEventCount)} relevant event(s) were identified in external vigilance databases. None indicate a new hazard not already addressed by the risk management file.`,
      ],
      tables: inputTable(inputs, 'external_events'),
    },
    {
      title: 'Section H — Literature Review',
      paragraphs: [
        `${fmt(stats.literatureCount)} publication(s) met the inclusion criteria of the literature search protocol.`,
      ],
      tables: inputTable(inputs, 'literature'),
    },
    {
      title: 'Section I — Follow-up on Previous PSUR',
      paragraphs: [
        `The previous PSUR (period ending ${str(previous.period_end)}) concluded a ${str(previous.benefit_risk_conclusion)} benefit–risk profile with a complaint rate of ${stats.prevRatePer10k} per 10,000 units. Open actions carried forward: ${str(previous.open_actions)}.`,
      ],
      tables: [],
    },
    {
      title: 'Section J — Clinical Safety Summary',
      paragraphs: [
        `Serious incidents reported: ${str(clinicalSafety.serious_incidents_reported)}; deaths: ${str(clinicalSafety.deaths)}. ${str(clinicalSafety.summary)}`,
      ],
      tables: [],
    },
    {
      title: 'Section K — Clinical Performance Summary',
      paragraphs: [
        `Specified flow accuracy: ${str(clinicalPerformance.flow_accuracy_spec)}; observed: ${str(clinicalPerformance.observed_flow_accuracy)}. ${str(clinicalPerformance.summary)}`,
      ],
      tables: [],
    },
    {
      title: 'Section L — Risk Management File Reconciliation',
      paragraphs: [
        `${fmt(stats.ractControlled)} of ${fmt(stats.ractTotal)} risk-file line items are in a controlled state. Post-market data in this period were reconciled against the risk analysis per ISO 14971 §10; no new hazards required addition to the file${stats.trendSignal ? ', except that the Article 88 trend signal in Section E mandates a risk-file review before closure' : ''}.`,
      ],
      tables: inputTable(inputs, 'ract'),
    },
    {
      title: 'Section M — Benefit–Risk Determination',
      paragraphs: [
        `Considering the sales volume (Section C), incident and FSCA record (Section D), complaint trend (Section E), CAPA status (Section F), external vigilance (Section G), literature (Section H) and clinical/risk source data (Sections J–K), ${conclusion}`,
      ],
      tables: [],
    },
  ];

  return {
    docTitle:
      stats.reportType === 'PMSR'
        ? 'Post-Market Surveillance Report (Simulated Draft)'
        : 'Periodic Safety Update Report (Simulated Draft)',
    metaLines: [
      `Report type: ${stats.reportType} | EU basis: ${stats.euCadenceCitation} | UK basis: ${stats.ukMdrApplies ? stats.ukCadenceCitation : 'not activated'} | UK units: ${fmt(stats.ukUnitsSold)}`,
      `Device: ${str(device.device_name)} · Manufacturer: ${str(device.manufacturer)} · Basic UDI-DI: ${str(device.basic_udi_di)} · Risk class: ${str(device.risk_class)} · Notified body: ${str(device.notified_body)}`,
      `Reporting period: ${period.start} → ${period.end} · Prepared per EU MDR Article 86 and MDCG 2022-21 · PMS plan: ${str(pmsPlan.plan_id)}`,
    ].filter((line) => !(stats.reportType === 'PMSR' && line.includes('Article 86'))),
    disclaimer:
      'SIMULATED OUTPUT — NOT A REGULATORY DOCUMENT. This draft was generated locally in your browser by the Smarticus PSUR demo simulation. No requirements lookup or regulatory review was performed. Sign in at the demo to run the signed-in builder, which produces an auditable draft with a verifiable audit trail.',
    watermark: 'SIMULATION',
    sections,
    footerNote:
      'Generated by the Smarticus PSUR demo — simulation mode. Every number above was recomputed locally from the editable mock data pack; the narrative is template-based. The signed-in builder drafts each section and records a tamper-evident audit trail with requirement citations.',
  };
}

// ---------------------------------------------------------------------------
// HTML renderer (inline preview)
// ---------------------------------------------------------------------------

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tableHtml(t: PsurTableModel): string {
  const head = t.head.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('\n');
  const title = t.title ? `<p class="table-title">${esc(t.title)}</p>` : '';
  return `${title}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function chartHtml(chart: PsurChartModel): string {
  const max = Math.max(chart.threshold ?? 0, ...chart.points.map((p) => p.value), 1);
  const rows = chart.points
    .map((point) => {
      const pct = Math.max(2, Math.round((point.value / max) * 100));
      return `
        <div class="chart-row">
          <div class="chart-label">${esc(point.label)}</div>
          <div class="chart-track"><span style="width:${pct}%"></span></div>
          <div class="chart-value">${esc(`${fmt(point.value)} ${chart.unit}`)}</div>
        </div>`;
    })
    .join('\n');
  return `
    <figure class="chart">
      <figcaption>${esc(chart.title)}</figcaption>
      ${rows}
    </figure>`;
}

export function renderPsurHtml(model: PsurModel): string {
  const sections = model.sections
    .map(
      (s) => `
<h2>${esc(s.title)}</h2>
${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n')}
${(s.charts ?? []).map(chartHtml).join('\n')}
${s.tables.map(tableHtml).join('\n')}`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(model.docTitle)}</title>
<style>
  body { font: 14px/1.65 Georgia, 'Times New Roman', serif; color: #1b1b1b; background: #fff; max-width: 840px; margin: 0 auto; padding: 36px 28px 72px; }
  h1 { font-size: 25px; letter-spacing: -0.01em; margin: 18px 0 4px; }
  h2 { font-size: 16.5px; margin: 34px 0 10px; border-bottom: 1px solid #d8d4cc; padding-bottom: 6px; }
  p { margin: 10px 0; }
  .table-title { font: 600 11px 'Helvetica Neue', Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.06em; color: #555; margin: 14px 0 4px; }
  table { border-collapse: collapse; width: 100%; font-size: 12.5px; margin: 10px 0 16px; }
  th, td { border: 1px solid #d8d4cc; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #f4f1ea; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; }
  .chart { border: 1px solid #d8d4cc; background: #fbfaf7; padding: 12px 14px; margin: 14px 0 18px; }
  .chart figcaption { font: 700 11px 'Helvetica Neue', Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.06em; color: #3c3c3c; margin: 0 0 10px; }
  .chart-row { display: grid; grid-template-columns: 128px minmax(120px, 1fr) 126px; gap: 9px; align-items: center; margin: 7px 0; font: 12px 'Helvetica Neue', Arial, sans-serif; }
  .chart-track { height: 10px; background: #ece7de; border-radius: 999px; overflow: hidden; }
  .chart-track span { display: block; height: 100%; background: #e8632b; border-radius: 999px; }
  .chart-value { color: #555; text-align: right; }
  .meta { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #555; }
  .sim-banner { font-family: 'Helvetica Neue', Arial, sans-serif; background: #fff3e8; border: 2px solid #e8632b; border-radius: 8px; padding: 14px 18px; font-size: 13px; color: #8a3a12; font-weight: 600; }
  .watermark { position: fixed; left: 50%; pointer-events: none; transform: translateX(-50%) rotate(-28deg); font: 700 104px 'Helvetica Neue', Arial, sans-serif; letter-spacing: 0.12em; color: rgba(232, 99, 43, 0.07); white-space: nowrap; z-index: 0; }
  main { position: relative; z-index: 1; }
</style>
</head>
<body>
<div class="watermark" style="top: 22%">${esc(model.watermark)}</div>
<div class="watermark" style="top: 58%">${esc(model.watermark)}</div>
<div class="watermark" style="top: 92%">${esc(model.watermark)}</div>
<main>
<div class="sim-banner">${esc(model.disclaimer)}</div>
<h1>${esc(model.docTitle)}</h1>
${model.metaLines.map((l) => `<p class="meta">${esc(l)}</p>`).join('\n')}
${sections}
<hr style="margin-top:40px; border:0; border-top:1px solid #d8d4cc;"/>
<p class="meta">${esc(model.footerNote)}</p>
</main>
</body>
</html>`;
}

export function validatePsurModelConsistency(
  inputs: Record<string, InputDefault>,
  stats: SimDerivedStats,
  model: PsurModel,
): PsurConsistencyAudit {
  const findings: string[] = [];
  const section = (needle: string): PsurSectionModel | undefined => model.sections.find((s) => s.title.includes(needle));
  const rowByMeasure = (measure: string): string[] | undefined =>
    section('Section A')
      ?.tables.find((table) => table.title === 'Data reconciliation summary')
      ?.rows.find((row) => row[0] === measure);
  const numericCell = (value: string | undefined): number => {
    const n = Number((value ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };

  if (model.sections.length !== 13) findings.push(`Expected 13 MDCG 2022-21 sections, found ${model.sections.length}.`);

  const sectionB = section('Section B');
  const regulatoryBasisTable = sectionB?.tables.find((table) => table.title === 'Regulatory basis and cadence');
  if (!regulatoryBasisTable) {
    findings.push('Regulatory basis and cadence table is missing.');
  } else {
    const expectedBasisRows: Array<[string, string]> = [
      ['EU MDR', stats.euCadenceCitation],
      ['MDCG 2022-21', 'Sections A-M PSUR content structure'],
      ['UK MDR', stats.ukMdrApplies ? stats.ukCadenceCitation : 'Not activated'],
      ['IMDRF', 'IMDRF/AE WG/N43 adverse-event terminology'],
      ['ISO 14971', 'Post-production information review'],
      ['ISO 13485', 'CAPA / PMS process controls'],
    ];
    for (const [regime, expectedBasis] of expectedBasisRows) {
      const row = regulatoryBasisTable.rows.find((candidate) => candidate[0] === regime);
      if (!row) {
        findings.push(`${regime} regulatory basis row is missing.`);
      } else if (row[1] !== expectedBasis) {
        findings.push(`${regime} regulatory basis mismatch: expected "${expectedBasis}", found "${row[1] ?? 'missing'}".`);
      }
    }
  }

  const coverageTable = sectionB?.tables.find((table) => table.title === 'Section-level regulatory coverage matrix');
  if (!coverageTable) {
    findings.push('Section-level regulatory coverage matrix is missing.');
  } else {
    if (coverageTable.rows.length !== 13) {
      findings.push(`Section-level regulatory coverage matrix should contain 13 rows, found ${coverageTable.rows.length}.`);
    }
    const sectionLabels = coverageTable.rows.map((row) => row[0]?.charAt(0)).join('');
    if (sectionLabels !== 'ABCDEFGHIJKLM') {
      findings.push('Section-level regulatory coverage matrix does not cover sections A-M in order.');
    }
    const coverageText = coverageTable.rows.map((row) => row.join(' ')).join(' ');
    const requiredCoverage = [
      'MDCG 2022-21',
      'EU MDR Art. 88',
      'IMDRF/AE WG/N43',
      'ISO 14971',
      'ISO 13485',
    ];
    for (const citation of requiredCoverage) {
      if (!coverageText.includes(citation)) findings.push(`Section-level regulatory coverage matrix is missing ${citation}.`);
    }
    if (stats.ukMdrApplies && !coverageText.includes(stats.ukCadenceCitation)) {
      findings.push(`Section-level regulatory coverage matrix is missing ${stats.ukCadenceCitation}.`);
    }
  }

  const reconciliationExpectations: Array<[string, string]> = [
    ['Units sold', fmt(stats.unitsSold)],
    ['UK units sold', fmt(stats.ukUnitsSold)],
    ['Complaints received', fmt(stats.complaintCount)],
    ['Complaint rate', `${stats.ratePer10k} per 10,000 units`],
    ['PMS threshold', `${stats.threshold} per 10,000 units`],
    ['Previous PSUR complaint rate', `${stats.prevRatePer10k} per 10,000 units`],
    ['Serious incidents', fmt(stats.seriousCount)],
    ['FSCAs', fmt(stats.fscaCount)],
    ['CAPAs total / open', `${fmt(stats.capaTotal)} / ${fmt(stats.capaOpen)}`],
    ['Literature records', fmt(stats.literatureCount)],
  ];
  for (const [measure, expected] of reconciliationExpectations) {
    const actual = rowByMeasure(measure)?.[1];
    if (actual !== expected) findings.push(`${measure} reconciliation mismatch: expected "${expected}", found "${actual ?? 'missing'}".`);
  }

  const salesRows = rowsOf(inputs, 'sales');
  const complaintRows = rowsOf(inputs, 'complaints');
  const capaRows = rowsOf(inputs, 'capa');
  const fscaRows = rowsOf(inputs, 'fsca');
  const externalRows = rowsOf(inputs, 'external_events');
  const literatureRows = rowsOf(inputs, 'literature');
  const ractRows = rowsOf(inputs, 'ract');

  const salesChart = section('Section C')?.charts?.find((chart) => chart.title === 'Units sold by market');
  const salesChartTotal = salesChart?.points.reduce((sum, point) => sum + point.value, 0) ?? NaN;
  if (salesChartTotal !== stats.unitsSold) findings.push(`Sales chart total ${salesChartTotal} does not match units sold ${stats.unitsSold}.`);

  const complaintQuarterChart = section('Section E')?.charts?.find((chart) => chart.title === 'Complaints received by quarter');
  const complaintChartTotal = complaintQuarterChart?.points.reduce((sum, point) => sum + point.value, 0) ?? NaN;
  if (complaintChartTotal !== stats.complaintCount) findings.push(`Complaint chart total ${complaintChartTotal} does not match complaint count ${stats.complaintCount}.`);

  const complaintSeverityChart = section('Section E')?.charts?.find((chart) => chart.title === 'Complaints by severity');
  const complaintSeverityChartTotal = complaintSeverityChart?.points.reduce((sum, point) => sum + point.value, 0) ?? NaN;
  if (complaintSeverityChartTotal !== stats.complaintCount) {
    findings.push(`Complaint severity chart total ${complaintSeverityChartTotal} does not match complaint count ${stats.complaintCount}.`);
  }

  const rateChart = section('Section E')?.charts?.find((chart) => chart.title === 'Complaint rate versus PMS threshold');
  const currentRate = rateChart?.points.find((point) => point.label === 'Current period')?.value;
  const previousRate = rateChart?.points.find((point) => point.label === 'Previous PSUR')?.value;
  const threshold = rateChart?.points.find((point) => point.label === 'PMS threshold')?.value;
  if (currentRate !== stats.ratePer10k) findings.push(`Current complaint rate chart value ${currentRate ?? 'missing'} does not match ${stats.ratePer10k}.`);
  if (previousRate !== stats.prevRatePer10k) findings.push(`Previous complaint rate chart value ${previousRate ?? 'missing'} does not match ${stats.prevRatePer10k}.`);
  if (threshold !== stats.threshold) findings.push(`PMS threshold chart value ${threshold ?? 'missing'} does not match ${stats.threshold}.`);

  const tableRows = (sectionNeedle: string, firstHeader: string): number | undefined =>
    section(sectionNeedle)?.tables.find((table) => table.head[0] === firstHeader)?.rows.length;
  if (tableRows('Section C', 'quarter') !== salesRows.length) findings.push('Sales table row count does not match editable sales input.');
  if (tableRows('Section E', 'complaint id') !== complaintRows.length) findings.push('Complaint table row count does not match editable complaints input.');
  if (tableRows('Section F', 'capa id') !== capaRows.length) findings.push('CAPA table row count does not match editable CAPA input.');
  if (tableRows('Section D', 'fsca id') !== fscaRows.length) findings.push('FSCA table row count does not match editable FSCA input.');
  if (tableRows('Section G', 'source') !== externalRows.length) findings.push('External-event table row count does not match editable external-event input.');
  if (tableRows('Section H', 'citation') !== literatureRows.length) findings.push('Literature table row count does not match editable literature input.');
  if (tableRows('Section L', 'risk id') !== ractRows.length) findings.push('Risk table row count does not match editable risk input.');

  const severityTable = section('Section E')?.tables.find((table) => table.title === 'Complaint severity and patient harm breakdown');
  if (!severityTable) {
    findings.push('Complaint severity breakdown table is missing.');
  } else {
    const severityComplaintTotal = severityTable.rows.reduce((sum, row) => sum + numericCell(row[1]), 0);
    const patientHarmTotal = severityTable.rows.reduce((sum, row) => sum + numericCell(row[2]), 0);
    const seriousContributionTotal = severityTable.rows.reduce((sum, row) => sum + numericCell(row[3]), 0);
    const expectedPatientHarmTotal = complaintRows.filter((row) => row.patient_harm === true).length;
    if (severityComplaintTotal !== stats.complaintCount) {
      findings.push(`Complaint severity table total ${severityComplaintTotal} does not match complaint count ${stats.complaintCount}.`);
    }
    if (patientHarmTotal !== expectedPatientHarmTotal) {
      findings.push(`Patient harm table total ${patientHarmTotal} does not match complaint records (${expectedPatientHarmTotal}).`);
    }
    if (seriousContributionTotal !== stats.seriousCount) {
      findings.push(`Serious-count table contribution ${seriousContributionTotal} does not match serious complaint records (${stats.seriousCount}).`);
    }
  }

  const expectedConclusion = stats.benefitRiskFavourable ? 'remains FAVOURABLE' : 'CANNOT be confirmed as favourable';
  const sectionAText = section('Section A')?.paragraphs.join(' ') ?? '';
  const sectionMText = section('Section M')?.paragraphs.join(' ') ?? '';
  if (!sectionAText.includes(expectedConclusion)) findings.push('Section A conclusion does not match the derived benefit-risk verdict.');
  if (!sectionMText.includes(expectedConclusion)) findings.push('Section M conclusion does not match the derived benefit-risk verdict.');

  const seriousInput = valueOf(inputs, 'clinical_safety').serious_incidents_reported;
  if (seriousInput !== undefined && num(seriousInput) !== stats.seriousCount) {
    findings.push(`Clinical safety serious_incidents_reported (${num(seriousInput)}) does not match serious complaint records (${stats.seriousCount}).`);
  }

  return { passed: findings.length === 0, findings };
}

// ---------------------------------------------------------------------------
// PDF renderer (jsPDF + autotable, lazy-loaded)
// ---------------------------------------------------------------------------

const PAGE_W = 595.28; // A4 portrait, pt
const PAGE_H = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 64;
const MARGIN_BOTTOM = 64;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;

export async function renderPsurPdf(model: PsurModel): Promise<Blob> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = MARGIN_TOP;

  const ensure = (height: number): void => {
    if (y + height > PAGE_H - MARGIN_BOTTOM) {
      doc.addPage();
      y = MARGIN_TOP;
    }
  };

  const paragraph = (text: string, size: number, color: [number, number, number], lineGap = 1.45): void => {
    doc.setFont('times', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, CONTENT_W) as string[];
    const lineH = size * lineGap;
    for (const line of lines) {
      ensure(lineH);
      doc.text(line, MARGIN_X, y);
      y += lineH;
    }
    y += 4;
  };

  const chart = (c: PsurChartModel): void => {
    const rowH = 18;
    const chartH = 28 + c.points.length * rowH;
    ensure(chartH + 10);
    doc.setDrawColor(216, 212, 204);
    doc.setFillColor(251, 250, 247);
    doc.roundedRect(MARGIN_X, y, CONTENT_W, chartH, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text(c.title.toUpperCase(), MARGIN_X + 10, y + 15);
    const max = Math.max(c.threshold ?? 0, ...c.points.map((p) => p.value), 1);
    let cy = y + 32;
    for (const point of c.points) {
      const label = doc.splitTextToSize(point.label, 96) as string[];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(85, 85, 85);
      doc.text(label[0] ?? point.label, MARGIN_X + 10, cy);
      doc.setFillColor(236, 231, 222);
      doc.roundedRect(MARGIN_X + 122, cy - 8, 250, 8, 4, 4, 'F');
      doc.setFillColor(232, 99, 43);
      doc.roundedRect(MARGIN_X + 122, cy - 8, Math.max(4, (point.value / max) * 250), 8, 4, 4, 'F');
      doc.text(`${fmt(point.value)} ${c.unit}`, MARGIN_X + 386, cy);
      cy += rowH;
    }
    y += chartH + 12;
  };

  // -- Disclaimer box ---------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const disclaimerLines = doc.splitTextToSize(model.disclaimer, CONTENT_W - 24) as string[];
  const boxH = disclaimerLines.length * 11 + 20;
  doc.setDrawColor(232, 99, 43);
  doc.setFillColor(255, 243, 232);
  doc.roundedRect(MARGIN_X, y, CONTENT_W, boxH, 4, 4, 'FD');
  doc.setTextColor(138, 58, 18);
  let dy = y + 16;
  for (const line of disclaimerLines) {
    doc.text(line, MARGIN_X + 12, dy);
    dy += 11;
  }
  y += boxH + 22;

  // -- Title + meta -----------------------------------------------------------
  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(27, 27, 27);
  const titleLines = doc.splitTextToSize(model.docTitle, CONTENT_W) as string[];
  for (const line of titleLines) {
    doc.text(line, MARGIN_X, y);
    y += 24;
  }
  y += 2;
  for (const meta of model.metaLines) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(85, 85, 85);
    const lines = doc.splitTextToSize(meta, CONTENT_W) as string[];
    for (const line of lines) {
      ensure(11);
      doc.text(line, MARGIN_X, y);
      y += 11;
    }
    y += 3;
  }
  y += 10;

  // -- Sections ----------------------------------------------------------------
  const lastTableY = (): number => {
    const withTable = doc as unknown as { lastAutoTable?: { finalY?: number } };
    return withTable.lastAutoTable?.finalY ?? y;
  };

  for (const section of model.sections) {
    ensure(48);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(27, 27, 27);
    doc.text(section.title, MARGIN_X, y);
    y += 6;
    doc.setDrawColor(216, 212, 204);
    doc.line(MARGIN_X, y, MARGIN_X + CONTENT_W, y);
    y += 14;

    for (const p of section.paragraphs) {
      paragraph(p, 10, [40, 40, 40]);
    }

    for (const c of section.charts ?? []) {
      chart(c);
    }

    for (const table of section.tables) {
      if (table.title) {
        ensure(16);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(85, 85, 85);
        doc.text(table.title.toUpperCase(), MARGIN_X, y);
        y += 8;
      }
      autoTable(doc, {
        startY: y,
        head: [table.head],
        body: table.rows,
        margin: { left: MARGIN_X, right: MARGIN_X, top: MARGIN_TOP, bottom: MARGIN_BOTTOM },
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8, textColor: [40, 40, 40], lineColor: [216, 212, 204], lineWidth: 0.5, cellPadding: 4 },
        headStyles: { fillColor: [244, 241, 234], textColor: [60, 60, 60], fontStyle: 'bold', fontSize: 7.5 },
      });
      y = lastTableY() + 14;
    }
    y += 6;
  }

  ensure(40);
  doc.setDrawColor(216, 212, 204);
  doc.line(MARGIN_X, y, MARGIN_X + CONTENT_W, y);
  y += 14;
  paragraph(model.footerNote, 8.5, [85, 85, 85], 1.4);

  // -- Per-page watermark + footer (drawn last so every page is stamped) -------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(92);
    doc.setTextColor(250, 222, 207); // pale orange — visible, never obscuring
    doc.text(model.watermark, PAGE_W / 2, PAGE_H / 2, { angle: 32, align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text('SIMULATED OUTPUT — NOT A REGULATORY DOCUMENT', MARGIN_X, PAGE_H - 32);
    doc.text(`Page ${i} of ${pageCount}`, PAGE_W - MARGIN_X, PAGE_H - 32, { align: 'right' });
  }

  return doc.output('blob');
}

// ---------------------------------------------------------------------------
// DOCX renderer (docx, lazy-loaded)
// ---------------------------------------------------------------------------

export async function renderPsurDocx(model: PsurModel): Promise<Blob> {
  const docx = await import('docx');
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    Header,
    Packer,
    PageNumber,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = docx;

  const bodyChildren: InstanceType<typeof Paragraph | typeof Table>[] = [];

  // Disclaimer banner
  bodyChildren.push(
    new Paragraph({
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FFF3E8' },
      spacing: { after: 280 },
      border: {
        top: { style: BorderStyle.SINGLE, size: 12, color: 'E8632B' },
        bottom: { style: BorderStyle.SINGLE, size: 12, color: 'E8632B' },
        left: { style: BorderStyle.SINGLE, size: 12, color: 'E8632B' },
        right: { style: BorderStyle.SINGLE, size: 12, color: 'E8632B' },
      },
      children: [new TextRun({ text: model.disclaimer, bold: true, color: '8A3A12', size: 18, font: 'Arial' })],
    }),
  );

  // Title + meta
  bodyChildren.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: model.docTitle, bold: true, size: 40, font: 'Georgia' })],
    }),
  );
  for (const meta of model.metaLines) {
    bodyChildren.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: meta, size: 17, color: '555555', font: 'Arial' })],
      }),
    );
  }

  const tableOf = (t: PsurTableModel): InstanceType<typeof Table> =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: t.head.map(
            (h) =>
              new TableCell({
                shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F4F1EA' },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: h.toUpperCase(), bold: true, size: 14, font: 'Arial', color: '3C3C3C' })],
                  }),
                ],
              }),
          ),
        }),
        ...t.rows.map(
          (row) =>
            new TableRow({
              children: row.map(
                (c) =>
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: c, size: 16, font: 'Arial' })] })],
                  }),
              ),
            }),
        ),
      ],
    });

  for (const section of model.sections) {
    bodyChildren.push(
      new Paragraph({
        spacing: { before: 320, after: 140 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D8D4CC', space: 2 } },
        children: [new TextRun({ text: section.title, bold: true, size: 26, font: 'Georgia' })],
      }),
    );
    for (const p of section.paragraphs) {
      bodyChildren.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [new TextRun({ text: p, size: 21, font: 'Georgia' })],
        }),
      );
    }
    for (const c of section.charts ?? []) {
      bodyChildren.push(
        new Paragraph({
          spacing: { before: 120, after: 60 },
          children: [new TextRun({ text: c.title.toUpperCase(), bold: true, size: 15, color: '555555', font: 'Arial' })],
        }),
      );
      bodyChildren.push(tableOf(chartTable(c)));
      bodyChildren.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    }
    for (const t of section.tables) {
      if (t.title) {
        bodyChildren.push(
          new Paragraph({
            spacing: { before: 120, after: 60 },
            children: [new TextRun({ text: t.title.toUpperCase(), bold: true, size: 15, color: '555555', font: 'Arial' })],
          }),
        );
      }
      bodyChildren.push(tableOf(t));
      bodyChildren.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    }
  }

  bodyChildren.push(
    new Paragraph({
      spacing: { before: 360 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'D8D4CC', space: 8 } },
      children: [new TextRun({ text: model.footerNote, size: 16, color: '555555', font: 'Arial' })],
    }),
  );

  const document = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'SIMULATED OUTPUT — NOT A REGULATORY DOCUMENT',
                    bold: true,
                    color: 'C2491A',
                    size: 16,
                    font: 'Arial',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16, color: '777777', font: 'Arial' }),
                ],
              }),
            ],
          }),
        },
        children: bodyChildren,
      },
    ],
  });

  return Packer.toBlob(document);
}
