import type { ObligationGraph } from '../graph/ObligationGraph.js';
import type { ConstraintNode } from '../graph/types.js';
import type { QualificationInput, QualificationResult } from './types.js';

/**
 * Pre-execution gate. Asks: "given the available evidence, can this process
 * legally and competently begin?" Grades qualification on a five-level scale
 * based on obligation coverage, constraint satisfaction, and risk assessment.
 *
 * Grading thresholds:
 *   - No applicable obligations          → OUT_OF_SCOPE
 *   - All mandatory covered              → QUALIFIED (low risk)
 *   - >80% covered, only soft missing    → QUALIFIED_WITH_WARNINGS (medium risk)
 *   - >50% covered                       → NEEDS_HUMAN_REVIEW (high risk)
 *   - ≤50% covered                       → BLOCKED (critical risk)
 */
export class QualificationGate {
  constructor(private readonly graph: ObligationGraph) {}

  async check(input: QualificationInput): Promise<QualificationResult> {
    const obligations = await this.graph.getObligationsForProcess(
      input.processType,
      input.jurisdiction,
    );
    const mandatory = obligations.filter((o) => o.mandatory);

    // If no obligations apply at all, this process is out of scope.
    if (obligations.length === 0) {
      return {
        status: 'OUT_OF_SCOPE',
        riskLevel: 'low',
        coverageScore: 0,
        mandatoryTotal: 0,
        mandatoryCovered: 0,
        missingObligations: [],
        missingEvidence: [],
        unsatisfiedConstraints: [],
        constraints: [],
        blockingErrors: [],
        recommendedNextActions: [
          'Verify that the process type and jurisdiction are correct.',
          'Check if the obligation graph has been seeded for this regulation.',
        ],
        canProceedWithHumanApproval: false,
      };
    }

    const missingObligations: string[] = [];
    const missingEvidence = new Set<string>();
    const blockingErrors: string[] = [];

    for (const obl of mandatory) {
      const required = obl.requiredEvidenceTypes ?? [];
      const fromGraph = await this.graph.getRequiredEvidence(obl.obligationId);
      const allRequired = Array.from(new Set([...required, ...fromGraph]));
      const missing = allRequired.filter((t) => !input.availableEvidence.includes(t));
      if (missing.length > 0) {
        missingObligations.push(obl.obligationId);
        for (const m of missing) missingEvidence.add(m);
        blockingErrors.push(
          `Obligation ${obl.obligationId} (${obl.sourceCitation}) missing evidence: ${missing.join(', ')}`,
        );
      }
    }

    // Collect constraints across all applicable obligations and check for unsatisfied ones.
    const constraints: ConstraintNode[] = [];
    const unsatisfiedConstraints: string[] = [];

    for (const obl of obligations) {
      const cs = await this.graph.getConstraints(obl.obligationId);
      constraints.push(...cs);
    }

    // A constraint is unsatisfied if its parent obligation is in the missing list
    // or if the constraint has an expression that cannot be resolved from available evidence.
    for (const c of constraints) {
      if (missingObligations.includes(c.appliesTo)) {
        unsatisfiedConstraints.push(
          `${c.constraintId}: ${c.text} (parent obligation ${c.appliesTo} lacks evidence)`,
        );
      }
    }

    const mandatoryCovered = mandatory.length - missingObligations.length;
    const coverageScore = mandatory.length === 0 ? 1 : mandatoryCovered / mandatory.length;

    // Determine whether only soft constraints are unsatisfied among covered obligations.
    const hardConstraintsMissing = constraints.some(
      (c) =>
        c.severity === 'hard' &&
        missingObligations.includes(c.appliesTo),
    );

    // Grade the qualification.
    const { status, riskLevel, canProceedWithHumanApproval } = this.grade(
      coverageScore,
      hardConstraintsMissing,
      mandatory.length,
    );

    // Build recommended next actions based on what is missing.
    const recommendedNextActions = this.buildRecommendations(
      missingObligations,
      Array.from(missingEvidence),
      unsatisfiedConstraints,
      status,
    );

    return {
      status,
      riskLevel,
      coverageScore,
      mandatoryTotal: mandatory.length,
      mandatoryCovered,
      missingObligations,
      missingEvidence: Array.from(missingEvidence),
      unsatisfiedConstraints,
      constraints,
      blockingErrors,
      recommendedNextActions,
      canProceedWithHumanApproval,
    };
  }

  private grade(
    coverageScore: number,
    hardConstraintsMissing: boolean,
    mandatoryTotal: number,
  ): {
    status: QualificationResult['status'];
    riskLevel: QualificationResult['riskLevel'];
    canProceedWithHumanApproval: boolean;
  } {
    // No mandatory obligations but some optional obligations exist — fully qualified.
    if (mandatoryTotal === 0) {
      return { status: 'QUALIFIED', riskLevel: 'low', canProceedWithHumanApproval: false };
    }

    // All mandatory obligations covered.
    if (coverageScore === 1) {
      return { status: 'QUALIFIED', riskLevel: 'low', canProceedWithHumanApproval: false };
    }

    // >80% covered and no hard constraints are failing.
    if (coverageScore > 0.8 && !hardConstraintsMissing) {
      return { status: 'QUALIFIED_WITH_WARNINGS', riskLevel: 'medium', canProceedWithHumanApproval: false };
    }

    // >50% covered — human review can unblock.
    if (coverageScore > 0.5) {
      return { status: 'NEEDS_HUMAN_REVIEW', riskLevel: 'high', canProceedWithHumanApproval: true };
    }

    // ≤50% covered — blocked.
    return { status: 'BLOCKED', riskLevel: 'critical', canProceedWithHumanApproval: false };
  }

  private buildRecommendations(
    missingObligations: string[],
    missingEvidence: string[],
    unsatisfiedConstraints: string[],
    status: QualificationResult['status'],
  ): string[] {
    const actions: string[] = [];

    if (missingEvidence.length > 0) {
      actions.push(
        `Provide missing evidence types: ${missingEvidence.slice(0, 5).join(', ')}${missingEvidence.length > 5 ? ` (+${missingEvidence.length - 5} more)` : ''}`,
      );
    }

    if (missingObligations.length > 0) {
      actions.push(
        `Address ${missingObligations.length} unsatisfied mandatory obligation(s): ${missingObligations.slice(0, 3).join(', ')}${missingObligations.length > 3 ? ` (+${missingObligations.length - 3} more)` : ''}`,
      );
    }

    if (unsatisfiedConstraints.length > 0) {
      actions.push(
        `Resolve ${unsatisfiedConstraints.length} unsatisfied constraint(s).`,
      );
    }

    if (status === 'NEEDS_HUMAN_REVIEW') {
      actions.push('Request human review and approval to proceed with partial coverage.');
    }

    if (status === 'BLOCKED') {
      actions.push('Do not proceed. Mandatory obligation coverage is critically low.');
    }

    return actions;
  }
}
