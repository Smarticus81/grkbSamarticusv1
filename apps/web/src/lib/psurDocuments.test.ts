import { describe, expect, it } from 'vitest';
import {
  buildPsurModel,
  renderPsurDocx,
  renderPsurHtml,
  renderPsurPdf,
  validatePsurModelConsistency,
} from './psurDocuments.js';
import {
  SIMULATED_DEFAULTS,
  deriveSimStats,
  runPsurSimulation,
  type SimEvent,
} from './psurSimulation.js';

const period = SIMULATED_DEFAULTS.period;
const inputs = SIMULATED_DEFAULTS.inputs;
const stats = deriveSimStats(inputs);

function sectionTitleIncludes(model: ReturnType<typeof buildPsurModel>, needle: string) {
  const section = model.sections.find((s) => s.title.includes(needle));
  expect(section).toBeDefined();
  return section!;
}

function tableWithFirstHeader(section: ReturnType<typeof buildPsurModel>['sections'][number], header: string) {
  const table = section.tables.find((t) => t.head[0] === header);
  expect(table, `${section.title} contains table headed ${header}`).toBeDefined();
  return table!;
}

describe('buildPsurModel', () => {
  it('produces all 13 MDCG sections with the simulation disclaimer', () => {
    const model = buildPsurModel(period, inputs, stats);
    expect(model.sections).toHaveLength(13);
    expect(model.sections[0]?.title).toContain('Section A');
    expect(model.sections[12]?.title).toContain('Section M');
    expect(model.disclaimer).toContain('SIMULATED OUTPUT');
    expect(model.watermark).toBe('SIMULATION');
    expect(model.sections.some((section) => (section.charts?.length ?? 0) > 0)).toBe(true);
    expect(model.metaLines.join(' ')).toContain('UK MDR 2024 Reg 44ZM');
  });

  it('includes explicit data reconciliation, regulatory basis, and serious incident tables', () => {
    const model = buildPsurModel(period, inputs, stats);

    const sectionA = sectionTitleIncludes(model, 'Section A');
    const reconciliation = sectionA.tables.find((table) => table.title === 'Data reconciliation summary');
    expect(reconciliation).toBeDefined();
    expect(reconciliation?.rows).toContainEqual(['Units sold', stats.unitsSold.toLocaleString('en-GB'), 'sales.units_sold']);
    expect(reconciliation?.rows).toContainEqual(['Complaints received', stats.complaintCount.toLocaleString('en-GB'), 'complaints rows']);
    expect(reconciliation?.rows).toContainEqual(['Complaint rate', `${stats.ratePer10k} per 10,000 units`, 'complaints / sales * 10,000']);

    const sectionB = sectionTitleIncludes(model, 'Section B');
    const basis = sectionB.tables.find((table) => table.title === 'Regulatory basis and cadence');
    expect(basis?.rows.map((row) => row[0])).toEqual(['EU MDR', 'MDCG 2022-21', 'UK MDR', 'IMDRF', 'ISO 14971', 'ISO 13485']);
    expect(basis?.rows.find((row) => row[0] === 'UK MDR')?.[1]).toBe(stats.ukCadenceCitation);
    expect(basis?.rows.find((row) => row[0] === 'IMDRF')?.[1]).toBe('IMDRF/AE WG/N43 adverse-event terminology');

    const coverage = sectionB.tables.find((table) => table.title === 'Section-level regulatory coverage matrix');
    expect(coverage).toBeDefined();
    expect(coverage?.rows).toHaveLength(13);
    expect(coverage?.rows.map((row) => row[0]?.charAt(0))).toEqual([
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    ]);
    expect(coverage?.rows.find((row) => row[0] === 'E Complaint data and trend analysis')?.[1]).toContain('EU MDR Art. 88');
    expect(coverage?.rows.find((row) => row[0] === 'E Complaint data and trend analysis')?.[1]).toContain('IMDRF/AE WG/N43');
    expect(coverage?.rows.find((row) => row[0] === 'L Risk management file reconciliation')?.[1]).toContain('ISO 14971');
    expect(coverage?.rows.find((row) => row[0] === 'B Device description and classification')?.[1]).toContain(stats.ukCadenceCitation);

    const sectionD = sectionTitleIncludes(model, 'Section D');
    const serious = sectionD.tables.find((table) => table.title === 'Serious incident complaint records');
    expect(serious).toBeDefined();
    expect(serious?.rows).toHaveLength(stats.seriousCount);

    const sectionE = sectionTitleIncludes(model, 'Section E');
    const severity = sectionE.tables.find((table) => table.title === 'Complaint severity and patient harm breakdown');
    expect(severity).toBeDefined();
    expect(severity?.rows).toContainEqual(['Serious', '1', '1', '1']);
    expect(severity?.rows.reduce((sum, row) => sum + Number(row[1]), 0)).toBe(stats.complaintCount);
    expect(severity?.rows.reduce((sum, row) => sum + Number(row[3]), 0)).toBe(stats.seriousCount);
  });

  it('keeps chart values numerically tied to the derived statistics', () => {
    const model = buildPsurModel(period, inputs, stats);

    const sectionC = sectionTitleIncludes(model, 'Section C');
    const salesChart = sectionC.charts?.find((chart) => chart.title === 'Units sold by market');
    expect(salesChart?.points.reduce((sum, point) => sum + point.value, 0)).toBe(stats.unitsSold);

    const sectionE = sectionTitleIncludes(model, 'Section E');
    const quarterChart = sectionE.charts?.find((chart) => chart.title === 'Complaints received by quarter');
    expect(quarterChart?.points.reduce((sum, point) => sum + point.value, 0)).toBe(stats.complaintCount);

    const rateChart = sectionE.charts?.find((chart) => chart.title === 'Complaint rate versus PMS threshold');
    expect(rateChart?.points.find((point) => point.label === 'Current period')?.value).toBe(stats.ratePer10k);
    expect(rateChart?.points.find((point) => point.label === 'PMS threshold')?.value).toBe(stats.threshold);
  });

  it('passes a full consistency audit for the default simulated report', () => {
    const model = buildPsurModel(period, inputs, stats);

    expect(validatePsurModelConsistency(inputs, stats, model)).toEqual({ passed: true, findings: [] });
  });

  it('flags incoherent edited data or tampered report values before artifacts are marked valid', () => {
    const inconsistent = structuredClone(inputs);
    const clinicalSafety = inconsistent.clinical_safety;
    if (clinicalSafety?.kind === 'json') clinicalSafety.value.serious_incidents_reported = 99;
    const inconsistentStats = deriveSimStats(inconsistent);
    const model = buildPsurModel(period, inconsistent, inconsistentStats);

    const sectionC = sectionTitleIncludes(model, 'Section C');
    const salesChart = sectionC.charts?.find((chart) => chart.title === 'Units sold by market');
    expect(salesChart).toBeDefined();
    salesChart!.points[0] = { ...salesChart!.points[0]!, value: salesChart!.points[0]!.value + 1 };

    const sectionE = sectionTitleIncludes(model, 'Section E');
    const severity = sectionE.tables.find((table) => table.title === 'Complaint severity and patient harm breakdown');
    expect(severity).toBeDefined();
    const seriousRowIndex = severity!.rows.findIndex((row) => row[0] === 'Serious');
    expect(seriousRowIndex).toBeGreaterThanOrEqual(0);
    severity!.rows[seriousRowIndex] = [...severity!.rows[seriousRowIndex]!];
    severity!.rows[seriousRowIndex]![3] = '0';

    const audit = validatePsurModelConsistency(inconsistent, inconsistentStats, model);

    expect(audit.passed).toBe(false);
    expect(audit.findings.some((finding) => finding.includes('Sales chart total'))).toBe(true);
    expect(audit.findings.some((finding) => finding.includes('Clinical safety serious_incidents_reported'))).toBe(true);
    expect(audit.findings.some((finding) => finding.includes('Serious-count table contribution'))).toBe(true);
  });

  it('flags missing or altered regulatory basis tables before artifacts are marked valid', () => {
    const model = buildPsurModel(period, inputs, stats);
    const sectionB = sectionTitleIncludes(model, 'Section B');
    sectionB.tables = sectionB.tables.filter((table) => table.title !== 'Regulatory basis and cadence');

    const audit = validatePsurModelConsistency(inputs, stats, model);

    expect(audit.passed).toBe(false);
    expect(audit.findings).toContain('Regulatory basis and cadence table is missing.');
  });

  it('flags incomplete regulatory coverage matrices before artifacts are marked valid', () => {
    const model = buildPsurModel(period, inputs, stats);
    const sectionB = sectionTitleIncludes(model, 'Section B');
    const coverage = sectionB.tables.find((table) => table.title === 'Section-level regulatory coverage matrix');
    expect(coverage).toBeDefined();
    coverage!.rows = coverage!.rows.slice(0, 12);
    coverage!.rows[4] = [...coverage!.rows[4]!];
    coverage!.rows[4]![1] = coverage!.rows[4]![1]!.replace('EU MDR Art. 88', 'EU MDR');

    const audit = validatePsurModelConsistency(inputs, stats, model);

    expect(audit.passed).toBe(false);
    expect(audit.findings).toContain('Section-level regulatory coverage matrix should contain 13 rows, found 12.');
    expect(audit.findings).toContain('Section-level regulatory coverage matrix does not cover sections A-M in order.');
    expect(audit.findings).toContain('Section-level regulatory coverage matrix is missing EU MDR Art. 88.');
  });

  it('represents every editable mock data source in the report model', () => {
    const model = buildPsurModel(period, inputs, stats);

    const sales = inputs.sales;
    const complaints = inputs.complaints;
    const capa = inputs.capa;
    const fsca = inputs.fsca;
    const externalEvents = inputs.external_events;
    const literature = inputs.literature;
    const ract = inputs.ract;
    expect(sales?.kind).toBe('table');
    expect(complaints?.kind).toBe('table');
    expect(capa?.kind).toBe('table');
    expect(fsca?.kind).toBe('table');
    expect(externalEvents?.kind).toBe('table');
    expect(literature?.kind).toBe('table');
    expect(ract?.kind).toBe('table');

    expect(tableWithFirstHeader(sectionTitleIncludes(model, 'Section C'), 'quarter').rows).toHaveLength(
      sales?.kind === 'table' ? sales.rows.length : 0,
    );
    expect(tableWithFirstHeader(sectionTitleIncludes(model, 'Section E'), 'complaint id').rows).toHaveLength(
      complaints?.kind === 'table' ? complaints.rows.length : 0,
    );
    expect(tableWithFirstHeader(sectionTitleIncludes(model, 'Section F'), 'capa id').rows).toHaveLength(
      capa?.kind === 'table' ? capa.rows.length : 0,
    );
    expect(tableWithFirstHeader(sectionTitleIncludes(model, 'Section D'), 'fsca id').rows).toHaveLength(
      fsca?.kind === 'table' ? fsca.rows.length : 0,
    );
    expect(tableWithFirstHeader(sectionTitleIncludes(model, 'Section G'), 'source').rows).toHaveLength(
      externalEvents?.kind === 'table' ? externalEvents.rows.length : 0,
    );
    expect(tableWithFirstHeader(sectionTitleIncludes(model, 'Section H'), 'citation').rows).toHaveLength(
      literature?.kind === 'table' ? literature.rows.length : 0,
    );
    expect(tableWithFirstHeader(sectionTitleIncludes(model, 'Section L'), 'risk id').rows).toHaveLength(
      ract?.kind === 'table' ? ract.rows.length : 0,
    );

    const reportText = [
      ...model.metaLines,
      ...model.sections.flatMap((section) => section.paragraphs),
    ].join(' ');
    const device = inputs.device_context?.kind === 'json' ? inputs.device_context.value : {};
    const pmsPlan = inputs.pms_plan?.kind === 'json' ? inputs.pms_plan.value : {};
    const previous = inputs.previous_psur?.kind === 'json' ? inputs.previous_psur.value : {};
    const clinicalSafety = inputs.clinical_safety?.kind === 'json' ? inputs.clinical_safety.value : {};
    const clinicalPerformance = inputs.clinical_performance?.kind === 'json' ? inputs.clinical_performance.value : {};

    expect(reportText).toContain(String(device.device_name));
    expect(reportText).toContain(String(device.basic_udi_di));
    expect(reportText).toContain(String(pmsPlan.plan_id));
    expect(reportText).toContain(String(previous.period_end));
    expect(reportText).toContain(String(clinicalSafety.serious_incidents_reported));
    expect(reportText).toContain(String(clinicalPerformance.flow_accuracy_spec));
  });

  it('reflects edited inputs in the narrative (trend signal flips the conclusion)', () => {
    const noisy = structuredClone(inputs);
    const complaints = noisy.complaints;
    if (complaints?.kind === 'table') {
      const template = complaints.rows[0]!;
      for (let i = 0; i < 200; i += 1) complaints.rows.push({ ...template, complaint_id: `C-X-${i}` });
    }
    const noisyStats = deriveSimStats(noisy);
    expect(noisyStats.trendSignal).toBe(true);
    const model = buildPsurModel(period, noisy, noisyStats);
    const sectionM = model.sections[12]!;
    expect(sectionM.paragraphs.join(' ')).toContain('CANNOT be confirmed as favourable');
  });

  it('activates and deactivates UK MDR from edited market exposure', () => {
    const noUk = structuredClone(inputs);
    const noUkSales = noUk.sales;
    if (noUkSales?.kind === 'table') {
      noUkSales.rows = noUkSales.rows.map((row) => ({
        ...row,
        region: row.region === 'UK' ? 'EU' : row.region,
      }));
    }
    const noUkDevice = noUk.device_context;
    if (noUkDevice?.kind === 'json') noUkDevice.value.markets = ['EU', 'CA'];

    const noUkStats = deriveSimStats(noUk);
    expect(noUkStats.ukUnitsSold).toBe(0);
    expect(noUkStats.ukMdrApplies).toBe(false);
    const noUkModel = buildPsurModel(period, noUk, noUkStats);
    expect(noUkModel.metaLines.join(' ')).toContain('UK basis: not activated');
    const noUkBasis = sectionTitleIncludes(noUkModel, 'Section B')
      .tables.find((table) => table.title === 'Regulatory basis and cadence');
    expect(noUkBasis?.rows.find((row) => row[0] === 'UK MDR')?.[1]).toBe('Not activated');

    const ukMarketString = structuredClone(noUk);
    const ukMarketStringDevice = ukMarketString.device_context;
    if (ukMarketStringDevice?.kind === 'json') ukMarketStringDevice.value.markets = 'EU, United Kingdom';

    const ukMarketStringStats = deriveSimStats(ukMarketString);
    expect(ukMarketStringStats.ukUnitsSold).toBe(0);
    expect(ukMarketStringStats.ukMdrApplies).toBe(true);

    const unitedKingdom = structuredClone(noUk);
    const ukSales = unitedKingdom.sales;
    if (ukSales?.kind === 'table') ukSales.rows[0] = { ...ukSales.rows[0]!, region: 'United Kingdom' };
    const ukDevice = unitedKingdom.device_context;
    if (ukDevice?.kind === 'json') ukDevice.value.markets = ['EU', 'United Kingdom'];

    const ukStats = deriveSimStats(unitedKingdom);
    expect(ukStats.ukMdrApplies).toBe(true);
    expect(ukStats.ukUnitsSold).toBeGreaterThan(0);
    const ukModel = buildPsurModel(period, unitedKingdom, ukStats);
    expect(ukModel.metaLines.join(' ')).toContain('UK MDR 2024 Reg 44ZM');
  });
});

describe('renderers', () => {
  it('renders watermarked HTML with every section', () => {
    const html = renderPsurHtml(buildPsurModel(period, inputs, stats));
    expect(html).toContain('SIMULATION');
    expect(html).toContain('Section M - Benefit-Risk Determination');
    expect(html).toContain('Periodic Safety Update Report');
    expect(html).toContain('Units sold by market');
    expect(html).toContain('Complaint rate versus PMS threshold');
    expect(html).toContain('Complaints by severity');
    expect(html).toContain('Data reconciliation summary');
    expect(html).toContain('Regulatory basis and cadence');
    expect(html).toContain('IMDRF/AE WG/N43 adverse-event terminology');
    expect(html).toContain('Complaint severity and patient harm breakdown');
    expect(html).toContain('Section-level regulatory coverage matrix');
    expect(html).toContain('Serious incident complaint records');
  });

  it('renders a non-trivial PDF blob', async () => {
    const blob = await renderPsurPdf(buildPsurModel(period, inputs, stats));
    expect(blob.type).toContain('pdf');
    expect(blob.size).toBeGreaterThan(10_000);
    const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    expect(String.fromCharCode(...head)).toBe('%PDF-');
  });

  it('renders a non-trivial DOCX blob (zip container)', async () => {
    const blob = await renderPsurDocx(buildPsurModel(period, inputs, stats));
    expect(blob.size).toBeGreaterThan(5_000);
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    // DOCX is a zip: magic bytes PK
    expect(String.fromCharCode(...head)).toBe('PK');
  });
});

describe('runPsurSimulation (end to end, fast-forwarded)', () => {
  it('streams every phase, 13 agents, decisions, and yields verified artifacts', async () => {
    const events: SimEvent[] = [];
    const result = await runPsurSimulation({
      period,
      inputs,
      speed: () => 1000, // collapse waits to the 40ms floor
      onEvent: (ev) => events.push(ev),
    });

    expect(result).not.toBeNull();
    const run = result!;

    // End-to-end coverage: every pipeline phase appears started and completed.
    const phases = [
      'discovery', 'parsing', 'device_context', 'imdrf_coding', 'statistics', 'charts',
      'generation', 'audit', 'remediation', 'validation', 'rendering', 'artifacts',
    ];
    for (const phase of phases) {
      expect(events.some((e) => e.kind === 'progress' && e.phase === phase && e.status === 'started')).toBe(true);
      expect(events.some((e) => e.kind === 'progress' && e.phase === phase && e.status === 'completed')).toBe(true);
    }

    // All 13 section agents ran.
    const sections = new Set(
      events.flatMap((e) => (e.kind === 'progress' && e.section ? [e.section.charAt(0)] : [])),
    );
    expect(sections.size).toBe(13);

    // Artifacts: PDF + DOCX + trace JSON, all non-empty.
    expect(run.artifacts.map((a) => a.name)).toEqual([
      'psur-draft-SIMULATED.pdf',
      'psur-draft-SIMULATED.docx',
      'decision-trace-SIMULATED.json',
    ]);
    for (const artifact of run.artifacts) {
      expect(artifact.blob.size).toBeGreaterThan(0);
      expect(artifact.sizeBytes).toBe(artifact.blob.size);
    }

    // The local hash chain genuinely verifies.
    expect(run.trace.verification.valid).toBe(true);
    expect(run.trace.verification.verifiedEntries).toBe(run.trace.entries.length);
    expect(run.trace.entries.some((entry) => entry.decision === 'UK MDR path activated')).toBe(true);
    expect(run.previewHtml).toContain('SIMULATION');
    expect(run.validation).toMatchObject({ passed: true, error_count: 0, errors: [] });
  }, 30_000);

  it('switches simulated Class I devices to the PMSR path with UK MDR cadence', async () => {
    const classIInputs = structuredClone(inputs);
    const device = classIInputs.device_context;
    if (device?.kind === 'json') device.value.risk_class = 'I';

    const classIStats = deriveSimStats(classIInputs);
    expect(classIStats.reportType).toBe('PMSR');
    expect(classIStats.euCadenceCitation).toBe('EU MDR Art. 85');
    expect(classIStats.ukCadenceCitation).toBe('UK MDR 2024 Reg 44ZL');

    const model = buildPsurModel(period, classIInputs, classIStats);
    expect(model.docTitle).toContain('Post-Market Surveillance Report');
    expect(model.metaLines.join(' ')).toContain('UK MDR 2024 Reg 44ZL');
    expect(model.metaLines.join(' ')).not.toContain('Article 86');

    const events: SimEvent[] = [];
    const result = await runPsurSimulation({
      period,
      inputs: classIInputs,
      speed: () => 1000,
      onEvent: (ev) => events.push(ev),
    });

    expect(result).not.toBeNull();
    expect(events.some((event) => event.kind === 'decision' && event.decision === 'PMSR cadence resolved from device class')).toBe(true);
    expect(events.some((event) => event.kind === 'decision' && event.regulatory_basis.includes('UK MDR 2024 Reg 44ZL'))).toBe(true);
  }, 30_000);
});
