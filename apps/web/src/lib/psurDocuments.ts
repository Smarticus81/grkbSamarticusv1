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

export interface PsurSectionModel {
  title: string;
  paragraphs: string[];
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

  const trendNarrative = stats.trendSignal
    ? `The complaint rate of ${stats.ratePer10k} per 10,000 units sold EXCEEDS the PMS-plan trend threshold of ${stats.threshold} per 10,000. A statistically significant increase within the meaning of EU MDR Article 88 is identified; a trend report and escalation to the risk management file are required before this report can conclude a favourable benefit–risk profile.`
    : `The complaint rate of ${stats.ratePer10k} per 10,000 units sold remains below the PMS-plan trend threshold of ${stats.threshold} per 10,000 (previous period: ${stats.prevRatePer10k}). No statistically significant increase within the meaning of EU MDR Article 88 is identified.`;

  const conclusion = stats.benefitRiskFavourable
    ? `the benefit–risk determination for the ${str(device.device_name)} remains FAVOURABLE. The known and foreseeable risks documented in the risk management file are outweighed by the clinical benefit of controlled infusion therapy, and no new hazards were identified in the reporting period.`
    : `the benefit–risk determination for the ${str(device.device_name)} CANNOT be confirmed as favourable without further action. The complaint-trend signal identified in Section E must be investigated, the risk management file updated, and corrective measures evaluated before the next periodic review.`;

  const imdrfTable: PsurTableModel = {
    title: 'Complaints by IMDRF term',
    head: ['IMDRF code', 'Term', 'Count'],
    rows:
      stats.topImdrf.length > 0
        ? stats.topImdrf.map((t) => [t.code, t.label, String(t.count)])
        : [['—', 'No coded complaints', '0']],
  };

  const sections: PsurSectionModel[] = [
    {
      title: 'Section A — Executive Summary',
      paragraphs: [
        `During the reporting period, ${fmt(stats.unitsSold)} units were sold across ${markets}. ${fmt(stats.complaintCount)} complaints were received (${stats.ratePer10k} per 10,000 units; previous period ${stats.prevRatePer10k}), of which ${fmt(stats.seriousCount)} were serious. ${fmt(stats.fscaCount)} field safety corrective action(s) were undertaken and ${fmt(stats.capaTotal)} CAPA(s) were processed (${fmt(stats.capaOpen)} remaining open). Based on the totality of post-market surveillance data summarised in Sections C–L, ${conclusion}`,
      ],
      tables: [],
    },
    {
      title: 'Section B — Device Description and Classification',
      paragraphs: [
        `${str(device.device_name)} (${str(device.intended_purpose)}). Class ${str(device.risk_class)} under EU MDR Annex VIII; certificate ${str(device.certificate_number)} issued by ${str(device.notified_body)}. Per Article 86(1), the PSUR for this class is updated at least annually and submitted to the notified body.`,
      ],
      tables: [],
    },
    {
      title: 'Section C — Sales, Usage and Population Exposure',
      paragraphs: [
        `Total units sold in the period: ${fmt(stats.unitsSold)}. Exposure is estimated per unit placed on the market; usage assumptions follow the PMS plan.`,
      ],
      tables: inputTable(inputs, 'sales'),
    },
    {
      title: 'Section D — Serious Incidents and Field Safety Corrective Actions',
      paragraphs: [
        `${fmt(stats.seriousCount)} serious incident(s) were recorded in the period. ${str(clinicalSafety.summary)}`,
      ],
      tables: inputTable(inputs, 'fsca'),
    },
    {
      title: 'Section E — Complaint Data and Trend Analysis (Article 88)',
      paragraphs: [trendNarrative],
      tables: [imdrfTable, ...inputTable(inputs, 'complaints', 'Complaint records')],
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
        `Considering the sales volume (Section C), incident and FSCA record (Section D), complaint trend (Section E), CAPA status (Section F), external vigilance (Section G), literature (Section H) and clinical evidence (Sections J–K), ${conclusion}`,
      ],
      tables: [],
    },
  ];

  return {
    docTitle: 'Periodic Safety Update Report (Simulated Draft)',
    metaLines: [
      `Device: ${str(device.device_name)} · Manufacturer: ${str(device.manufacturer)} · Basic UDI-DI: ${str(device.basic_udi_di)} · Risk class: ${str(device.risk_class)} · Notified body: ${str(device.notified_body)}`,
      `Reporting period: ${period.start} → ${period.end} · Prepared per EU MDR Article 86 and MDCG 2022-21 · PMS plan: ${str(pmsPlan.plan_id)}`,
    ],
    disclaimer:
      'SIMULATED OUTPUT — NOT A REGULATORY DOCUMENT. This draft was generated locally in your browser by the Smarticus PSUR demo simulation. No AI pipeline, obligation-graph lookup, or regulatory review was performed. Sign in at the demo to run the real engine, which produces an auditable, graph-grounded draft with a verifiable decision trace.',
    watermark: 'SIMULATION',
    sections,
    footerNote:
      'Generated by the Smarticus PSUR demo — simulation mode. Every number above was recomputed locally from the (editable) mock data pack; the narrative is template-based, not AI-generated. The real engine drafts each section with grounded LLM agents and records a hash-chained, graph-cited decision trace.',
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

export function renderPsurHtml(model: PsurModel): string {
  const sections = model.sections
    .map(
      (s) => `
<h2>${esc(s.title)}</h2>
${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n')}
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
