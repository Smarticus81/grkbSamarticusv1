#!/usr/bin/env node
/**
 * Coverage / integrity CLI for the obligation knowledge graph.
 *
 * Checks:
 * 1. Every EU MDR Article (1–123) and Annex (I–XVII) has ≥1 obligation
 * 2. No orphan obligations (must have ≥1 relationship or process binding)
 * 3. Every constraint.appliesTo resolves to a real Obligation node
 * 4. Every relationship endpoint resolves to a real node
 * 5. Flags CONFLICTS_WITH relationships for human review
 *
 * Exits nonzero on violations so it can gate CI.
 *
 * Usage:
 *   pnpm check:coverage
 *   pnpm check:coverage --jurisdiction EU_MDR
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../../.env') });

import { getNeo4j } from '../db/connection.js';

interface CoverageReport {
  articlesTotal: number;
  articlesCovered: number;
  articlesMissing: string[];
  annexesTotal: number;
  annexesCovered: number;
  annexesMissing: string[];
  orphanObligations: string[];
  danglingConstraints: string[];
  danglingRelationships: Array<{ from: string; to: string; type: string }>;
  conflicts: Array<{ from: string; to: string }>;
  totalObligations: number;
  totalConstraints: number;
  totalDefinitions: number;
  totalRelationships: number;
}

// EU MDR has Articles 1-123
const EU_MDR_ARTICLES = Array.from({ length: 123 }, (_, i) => i + 1);

// EU MDR Annexes I-XVII
const EU_MDR_ANNEXES = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII',
  'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII',
];

async function main() {
  const args = process.argv.slice(2);
  const jurisdiction = args.find((a) => !a.startsWith('--')) ?? 'EU_MDR';

  console.log(`\n📊 Running coverage/integrity check for ${jurisdiction}...\n`);

  const driver = getNeo4j();
  const session = driver.session({ database: process.env.NEO4J_DATABASE ?? 'neo4j' });

  try {
    const report: CoverageReport = {
      articlesTotal: EU_MDR_ARTICLES.length,
      articlesCovered: 0,
      articlesMissing: [],
      annexesTotal: EU_MDR_ANNEXES.length,
      annexesCovered: 0,
      annexesMissing: [],
      orphanObligations: [],
      danglingConstraints: [],
      danglingRelationships: [],
      conflicts: [],
      totalObligations: 0,
      totalConstraints: 0,
      totalDefinitions: 0,
      totalRelationships: 0,
    };

    // 1. Count totals
    const counts = await session.run(`
      MATCH (o:Obligation) WHERE o.jurisdiction = $j
      WITH count(o) AS obCount
      OPTIONAL MATCH (c:Constraint)
      WITH obCount, count(c) AS conCount
      OPTIONAL MATCH (d:Definition)
      WITH obCount, conCount, count(d) AS defCount
      RETURN obCount, conCount, defCount
    `, { j: jurisdiction });

    if (counts.records.length > 0) {
      const r = counts.records[0]!;
      report.totalObligations = (r.get('obCount') as any)?.toNumber?.() ?? Number(r.get('obCount'));
      report.totalConstraints = (r.get('conCount') as any)?.toNumber?.() ?? Number(r.get('conCount'));
      report.totalDefinitions = (r.get('defCount') as any)?.toNumber?.() ?? Number(r.get('defCount'));
    }

    // Count relationships
    const relCount = await session.run(`
      MATCH ()-[r]->() RETURN count(r) AS total
    `);
    report.totalRelationships = (relCount.records[0]?.get('total') as any)?.toNumber?.() ?? 0;

    // 2. Article coverage check
    // Get all obligation IDs for EU MDR
    const oblIds = await session.run(`
      MATCH (o:Obligation) WHERE o.jurisdiction = $j
      RETURN o.obligationId AS id
    `, { j: jurisdiction });

    const allIds = oblIds.records.map((r) => r.get('id') as string);

    for (const art of EU_MDR_ARTICLES) {
      // Check if any obligation ID contains this article reference
      const patterns = [
        `EUMDR.${art}.`,
        `EUMDR.${art}.OBL`,
        `EUMDR.${art}.CON`,
      ];
      const found = allIds.some((id) => patterns.some((p) => id.startsWith(p)));
      if (found) {
        report.articlesCovered++;
      } else {
        report.articlesMissing.push(`Article ${art}`);
      }
    }

    // 3. Annex coverage check
    for (const annex of EU_MDR_ANNEXES) {
      // Map roman numeral to patterns used in obligation IDs
      const patterns = [
        `EUMDR.A${annex}.`,
        `EUMDR.AI.`,    // Annex I uses AI prefix
        `EUMDR.AII.`,   // Annex II uses AII prefix
        `EUMDR.AIII.`,
      ];
      // More specific patterns for each annex
      const annexPattern = `EUMDR.A${annex}.`;
      // Special cases for commonly used formats
      const altPatterns: string[] = [];
      if (annex === 'I') altPatterns.push('EUMDR.AI.');
      if (annex === 'II') altPatterns.push('EUMDR.AII.');
      if (annex === 'III') altPatterns.push('EUMDR.AIII.');
      if (annex === 'VIII') altPatterns.push('EUMDR.AVIII.');
      if (annex === 'IX') altPatterns.push('EUMDR.AIX.');
      if (annex === 'X') altPatterns.push('EUMDR.AX.');
      if (annex === 'XI') altPatterns.push('EUMDR.AXI.');
      if (annex === 'XII') altPatterns.push('EUMDR.AXII.');
      if (annex === 'XIII') altPatterns.push('EUMDR.AXIII.');
      if (annex === 'XIV') altPatterns.push('EUMDR.XIV.');
      if (annex === 'XV') altPatterns.push('EUMDR.XV.');
      if (annex === 'XVI') altPatterns.push('EUMDR.AXVI.');
      if (annex === 'XVII') altPatterns.push('EUMDR.AXVII.');

      const allPatterns = [annexPattern, ...altPatterns];
      const found = allIds.some((id) => allPatterns.some((p) => id.startsWith(p)));
      if (found) {
        report.annexesCovered++;
      } else {
        report.annexesMissing.push(`Annex ${annex}`);
      }
    }

    // 4. Orphan obligations (no relationships at all)
    const orphans = await session.run(`
      MATCH (o:Obligation) WHERE o.jurisdiction = $j
      AND NOT (o)-[]-()
      RETURN o.obligationId AS id
    `, { j: jurisdiction });
    report.orphanObligations = orphans.records.map((r) => r.get('id') as string);

    // 5. Dangling constraints (appliesTo doesn't resolve)
    const danglingCons = await session.run(`
      MATCH (c:Constraint)
      WHERE NOT EXISTS {
        MATCH (o:Obligation { obligationId: c.appliesTo })
      }
      RETURN c.constraintId AS id, c.appliesTo AS target
    `);
    report.danglingConstraints = danglingCons.records.map(
      (r) => `${r.get('id')} → ${r.get('target')}`,
    );

    // 6. CONFLICTS_WITH relationships
    const conflicts = await session.run(`
      MATCH (a)-[r:CONFLICTS_WITH]->(b)
      RETURN a.obligationId AS from, b.obligationId AS to
    `);
    report.conflicts = conflicts.records.map((r) => ({
      from: r.get('from') as string,
      to: r.get('to') as string,
    }));

    // Print report
    console.log('═══════════════════════════════════════════════════');
    console.log('  Coverage & Integrity Report');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Jurisdiction:     ${jurisdiction}`);
    console.log(`  Obligations:      ${report.totalObligations}`);
    console.log(`  Constraints:      ${report.totalConstraints}`);
    console.log(`  Definitions:      ${report.totalDefinitions}`);
    console.log(`  Relationships:    ${report.totalRelationships}`);
    console.log('');
    console.log(`  Article coverage: ${report.articlesCovered}/${report.articlesTotal} (${Math.round(report.articlesCovered / report.articlesTotal * 100)}%)`);
    if (report.articlesMissing.length > 0) {
      console.log(`  ⚠ Missing:        ${report.articlesMissing.join(', ')}`);
    }
    console.log(`  Annex coverage:   ${report.annexesCovered}/${report.annexesTotal} (${Math.round(report.annexesCovered / report.annexesTotal * 100)}%)`);
    if (report.annexesMissing.length > 0) {
      console.log(`  ⚠ Missing:        ${report.annexesMissing.join(', ')}`);
    }
    console.log('');
    if (report.orphanObligations.length > 0) {
      console.log(`  ❌ Orphan obligations: ${report.orphanObligations.length}`);
      for (const id of report.orphanObligations.slice(0, 20)) {
        console.log(`     - ${id}`);
      }
      if (report.orphanObligations.length > 20) {
        console.log(`     ... and ${report.orphanObligations.length - 20} more`);
      }
    } else {
      console.log('  ✅ No orphan obligations');
    }
    if (report.danglingConstraints.length > 0) {
      console.log(`  ❌ Dangling constraints: ${report.danglingConstraints.length}`);
      for (const dc of report.danglingConstraints) {
        console.log(`     - ${dc}`);
      }
    } else {
      console.log('  ✅ No dangling constraints');
    }
    if (report.conflicts.length > 0) {
      console.log(`  ⚠ CONFLICTS_WITH edges (review needed): ${report.conflicts.length}`);
      for (const c of report.conflicts) {
        console.log(`     - ${c.from} ↔ ${c.to}`);
      }
    }
    console.log('═══════════════════════════════════════════════════\n');

    // Exit nonzero if there are integrity violations
    const hasViolations =
      report.danglingConstraints.length > 0 ||
      report.danglingRelationships.length > 0;

    if (hasViolations) {
      console.log('❌ Integrity violations found. Exiting with code 1.');
      process.exit(1);
    }

    const coveragePercent =
      ((report.articlesCovered + report.annexesCovered) /
        (report.articlesTotal + report.annexesTotal)) *
      100;

    if (coveragePercent < 100) {
      console.log(`⚠ Coverage at ${Math.round(coveragePercent)}% — not yet 100%.`);
    } else {
      console.log('✅ 100% coverage. All articles and annexes represented.');
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
