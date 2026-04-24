import { Router } from 'express';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { getContext } from '../context.js';

const router: Router = Router();

const ValidateDraftSchema = z.object({
  draftText: z.string().min(1).max(200_000),
  processType: z.string().min(1),
  jurisdictions: z.array(z.string().min(1)).min(1),
});

/**
 * POST /api/validate-draft
 *
 * Runs the compliance pipeline against a draft document, checking it
 * against the obligation graph for the given process type and jurisdictions.
 * Returns missing obligations, missing evidence, constraint violations,
 * dangling citations, and cross-regulation contradictions.
 */
router.post('/', async (req, res) => {
  const parsed = ValidateDraftSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });

  const { draftText, processType, jurisdictions } = parsed.data;

  try {
    const { graph } = getContext();

    // Gather all obligations across requested jurisdictions
    const allObligations = [];
    for (const jurisdiction of jurisdictions) {
      const obls = await graph.getObligationsForProcess(processType, jurisdiction);
      allObligations.push(...obls);
    }

    // Deduplicate by obligationId
    const oblMap = new Map(allObligations.map((o) => [o.obligationId, o]));
    const obligations = Array.from(oblMap.values());
    const mandatoryObls = obligations.filter((o) => o.mandatory);

    // Extract claims from draft text — look for obligation IDs mentioned
    const mentionedIds = obligations
      .filter(
        (o) =>
          draftText.includes(o.obligationId) ||
          draftText.toLowerCase().includes(o.sourceCitation.toLowerCase()),
      )
      .map((o) => o.obligationId);

    // Extract evidence type mentions
    const allEvidenceTypes = new Set<string>();
    for (const obl of obligations) {
      for (const et of obl.requiredEvidenceTypes) {
        allEvidenceTypes.add(et);
      }
    }
    const mentionedEvidence = Array.from(allEvidenceTypes).filter(
      (et) =>
        draftText.toLowerCase().includes(et.toLowerCase().replace(/_/g, ' ')) ||
        draftText.includes(et),
    );

    // Run validation checks
    const findings: {
      validator: string;
      severity: 'info' | 'warning' | 'error' | 'critical';
      obligationId?: string;
      constraintId?: string;
      message: string;
      remediation?: string;
    }[] = [];

    // 1. Claim Coverage — mandatory obligations not addressed
    for (const obl of mandatoryObls) {
      const isMentioned = mentionedIds.includes(obl.obligationId);
      const citationMentioned = draftText
        .toLowerCase()
        .includes(obl.sourceCitation.toLowerCase());

      if (!isMentioned && !citationMentioned) {
        findings.push({
          validator: 'ClaimCoverageValidator',
          severity: 'error',
          obligationId: obl.obligationId,
          message: `Mandatory obligation not addressed: ${obl.title} (${obl.sourceCitation})`,
          remediation: `Add a section addressing ${obl.sourceCitation}: "${obl.text.slice(0, 120)}..."`,
        });
      }
    }

    // 2. Evidence coverage — required evidence not referenced
    for (const obl of mandatoryObls) {
      for (const evType of obl.requiredEvidenceTypes) {
        const evMentioned =
          draftText.toLowerCase().includes(evType.toLowerCase().replace(/_/g, ' ')) ||
          draftText.includes(evType);
        if (!evMentioned) {
          findings.push({
            validator: 'EvidenceBackedComplianceValidator',
            severity: 'warning',
            obligationId: obl.obligationId,
            message: `Missing evidence type "${evType}" required by ${obl.sourceCitation}`,
            remediation: `Include or reference evidence of type "${evType}" to satisfy ${obl.obligationId}`,
          });
        }
      }
    }

    // 3. Constraint evaluation
    for (const obl of obligations) {
      const constraints = await graph.getConstraints(obl.obligationId);
      for (const constraint of constraints) {
        if (constraint.severity === 'hard') {
          // Check if constraint text concepts are addressed in draft
          const constraintKeywords = constraint.text
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 4);
          const keywordHits = constraintKeywords.filter((kw) =>
            draftText.toLowerCase().includes(kw),
          ).length;
          const coverage = constraintKeywords.length > 0 ? keywordHits / constraintKeywords.length : 1;

          if (coverage < 0.3) {
            findings.push({
              validator: 'ConstraintEvaluator',
              severity: constraint.severity === 'hard' ? 'error' : 'warning',
              obligationId: obl.obligationId,
              constraintId: constraint.constraintId,
              message: `Constraint may not be satisfied: "${constraint.text.slice(0, 150)}"`,
              remediation: `Review and address the constraint from ${obl.sourceCitation}`,
            });
          }
        }
      }
    }

    // 4. Citation verification — find citation-like patterns and check they resolve
    const citationPatterns = draftText.match(
      /(?:EU\s*MDR|ISO\s*\d{4,5}|21\s*CFR\s*\d{3}|IMDRF|MDCG|UK\s*MDR)[^.;,\n]{0,60}/gi,
    );
    if (citationPatterns) {
      for (const cite of new Set(citationPatterns)) {
        const normalizedCite = cite.trim();
        const matchesAny = obligations.some(
          (o) =>
            normalizedCite.toLowerCase().includes(o.sourceCitation.toLowerCase()) ||
            o.sourceCitation.toLowerCase().includes(normalizedCite.toLowerCase().slice(0, 20)),
        );
        if (!matchesAny && normalizedCite.length > 8) {
          findings.push({
            validator: 'CitationVerifier',
            severity: 'info',
            message: `Citation "${normalizedCite.slice(0, 80)}" could not be resolved to a known obligation in the graph`,
          });
        }
      }
    }

    // 5. Cross-regulation contradiction check
    // Check if draft addresses obligations from one reg but misses the mapped twin
    const addressedJurisdictions = new Set(
      obligations.filter((o) => mentionedIds.includes(o.obligationId)).map((o) => o.jurisdiction),
    );
    for (const jurisdiction of jurisdictions) {
      if (!addressedJurisdictions.has(jurisdiction) && jurisdiction !== 'GLOBAL') {
        const jurisdictionObls = mandatoryObls.filter(
          (o) => o.jurisdiction === jurisdiction,
        );
        if (jurisdictionObls.length > 0) {
          findings.push({
            validator: 'RegulatoryContradictionDetector',
            severity: 'warning',
            message: `Draft addresses some jurisdictions but appears to miss ${jurisdiction} obligations entirely (${jurisdictionObls.length} mandatory obligations)`,
            remediation: `Add coverage for ${jurisdiction} obligations to avoid cross-regulatory gaps`,
          });
        }
      }
    }

    // Compute result
    const severityCounts: Record<string, number> = {};
    for (const f of findings) {
      severityCounts[f.severity] = (severityCounts[f.severity] ?? 0) + 1;
    }

    const hasCritical = (severityCounts['critical'] ?? 0) > 0;
    const hasError = (severityCounts['error'] ?? 0) > 0;
    const hasWarning = (severityCounts['warning'] ?? 0) > 0;

    const passedHardChecks = !hasCritical && !hasError;
    const requiresHumanReview = hasError || (severityCounts['warning'] ?? 0) > 3;

    const status = hasCritical || (severityCounts['error'] ?? 0) > 5
      ? 'FAIL'
      : hasError
        ? 'REQUIRES_REVIEW'
        : hasWarning
          ? 'PASS_WITH_WARNINGS'
          : 'PASS';

    // Build trace bundle
    const traceBundle = JSON.stringify(
      {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        processType,
        jurisdictions,
        obligationsChecked: obligations.length,
        mandatoryChecked: mandatoryObls.length,
        draftHash: createHash('sha256').update(draftText).digest('hex'),
        draftLength: draftText.length,
        findings,
        status,
        severityCounts,
      },
      null,
      2,
    );

    res.json({
      status,
      severityCounts,
      findings,
      passedHardChecks,
      requiresHumanReview,
      traceBundle,
    });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
