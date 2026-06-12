import { describe, expect, it } from 'vitest';
import { buildPsurModel, renderPsurDocx, renderPsurHtml, renderPsurPdf } from './psurDocuments.js';
import {
  SIMULATED_DEFAULTS,
  deriveSimStats,
  runPsurSimulation,
  type SimEvent,
} from './psurSimulation.js';

const period = SIMULATED_DEFAULTS.period;
const inputs = SIMULATED_DEFAULTS.inputs;
const stats = deriveSimStats(inputs);

describe('buildPsurModel', () => {
  it('produces all 13 MDCG sections with the simulation disclaimer', () => {
    const model = buildPsurModel(period, inputs, stats);
    expect(model.sections).toHaveLength(13);
    expect(model.sections[0]?.title).toContain('Section A');
    expect(model.sections[12]?.title).toContain('Section M');
    expect(model.disclaimer).toContain('SIMULATED OUTPUT');
    expect(model.watermark).toBe('SIMULATION');
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
});

describe('renderers', () => {
  it('renders watermarked HTML with every section', () => {
    const html = renderPsurHtml(buildPsurModel(period, inputs, stats));
    expect(html).toContain('SIMULATION');
    expect(html).toContain('Section M — Benefit–Risk Determination');
    expect(html).toContain('Periodic Safety Update Report');
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
    expect(run.previewHtml).toContain('SIMULATION');
    expect(run.validation).toEqual({ passed: true, error_count: 0 });
  }, 30_000);
});
