import type { ObligationGraph } from '../../graph/ObligationGraph.js';
import type { ObligationNode, ConstraintNode } from '../../graph/types.js';
import type { ComplianceContext } from '../types.js';
import type { Validator, ValidationFinding } from './types.js';

/**
 * Pulls obligation constraints from the graph and evaluates each against the
 * output payload. Produces pass/fail per constraint. Uses the `expression`
 * field from ConstraintNode if available for machine-readable evaluation.
 */
export class ConstraintEvaluator implements Validator {
  readonly name = 'ConstraintEvaluator';

  constructor(private readonly graph: ObligationGraph) {}

  async validate(
    output: unknown,
    obligations: ObligationNode[],
    _context: ComplianceContext,
  ): Promise<ValidationFinding[]> {
    const findings: ValidationFinding[] = [];
    const claimed = this.extractClaims(output);

    for (const obl of obligations) {
      // Only evaluate constraints for obligations that the output claims to address.
      if (!claimed.includes(obl.obligationId)) continue;

      const constraints = await this.graph.getConstraints(obl.obligationId);
      for (const constraint of constraints) {
        const result = this.evaluateConstraint(constraint, output);
        if (!result.satisfied) {
          findings.push({
            validator: this.name,
            severity: constraint.severity === 'hard' ? 'critical' : 'warning',
            obligationId: obl.obligationId,
            constraintId: constraint.constraintId,
            message: `Constraint ${constraint.constraintId} not satisfied: ${constraint.text}${result.reason ? ` (${result.reason})` : ''}`,
            remediation: `Ensure output satisfies constraint: "${constraint.text}"`,
          });
        } else {
          findings.push({
            validator: this.name,
            severity: 'info',
            obligationId: obl.obligationId,
            constraintId: constraint.constraintId,
            message: `Constraint ${constraint.constraintId} satisfied.`,
          });
        }
      }
    }

    return findings;
  }

  /**
   * Evaluates a single constraint against the output.
   *
   * If the constraint has a machine-readable `expression`, we attempt to evaluate
   * it against the output payload using a safe property-path check. Otherwise, we
   * fall back to a structural heuristic: the constraint is considered satisfied if
   * the output references the constraint's parent obligation.
   */
  private evaluateConstraint(
    constraint: ConstraintNode,
    output: unknown,
  ): { satisfied: boolean; reason?: string } {
    if (!constraint.expression) {
      // No machine-readable expression — we cannot machine-verify.
      // Default to satisfied (the obligation claim itself is the attestation).
      return { satisfied: true };
    }

    // Expression format: "field.path OPERATOR value"
    // Supported operators: EXISTS, EQUALS, CONTAINS, MIN_LENGTH, NOT_EMPTY
    return this.evaluateExpression(constraint.expression, output);
  }

  private evaluateExpression(
    expression: string,
    output: unknown,
  ): { satisfied: boolean; reason?: string } {
    const obj = output && typeof output === 'object' ? (output as Record<string, unknown>) : {};

    const parts = expression.trim().split(/\s+/);
    if (parts.length < 2) {
      return { satisfied: false, reason: `Malformed expression: "${expression}"` };
    }

    const fieldPath = parts[0]!;
    const operator = parts[1]!.toUpperCase();
    const operand = parts.slice(2).join(' ');

    const fieldValue = this.getNestedValue(obj, fieldPath);

    switch (operator) {
      case 'EXISTS':
        return fieldValue !== undefined
          ? { satisfied: true }
          : { satisfied: false, reason: `Field "${fieldPath}" does not exist` };

      case 'NOT_EMPTY': {
        if (fieldValue === undefined || fieldValue === null) {
          return { satisfied: false, reason: `Field "${fieldPath}" is missing` };
        }
        if (typeof fieldValue === 'string' && fieldValue.trim() === '') {
          return { satisfied: false, reason: `Field "${fieldPath}" is empty` };
        }
        if (Array.isArray(fieldValue) && fieldValue.length === 0) {
          return { satisfied: false, reason: `Field "${fieldPath}" is an empty array` };
        }
        return { satisfied: true };
      }

      case 'EQUALS':
        return String(fieldValue) === operand
          ? { satisfied: true }
          : { satisfied: false, reason: `Field "${fieldPath}" is "${String(fieldValue)}", expected "${operand}"` };

      case 'CONTAINS': {
        if (typeof fieldValue === 'string') {
          return fieldValue.includes(operand)
            ? { satisfied: true }
            : { satisfied: false, reason: `Field "${fieldPath}" does not contain "${operand}"` };
        }
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(operand)
            ? { satisfied: true }
            : { satisfied: false, reason: `Array "${fieldPath}" does not contain "${operand}"` };
        }
        return { satisfied: false, reason: `Field "${fieldPath}" is not a string or array` };
      }

      case 'MIN_LENGTH': {
        const minLen = parseInt(operand, 10);
        if (isNaN(minLen)) {
          return { satisfied: false, reason: `Invalid MIN_LENGTH operand: "${operand}"` };
        }
        if (typeof fieldValue === 'string') {
          return fieldValue.length >= minLen
            ? { satisfied: true }
            : { satisfied: false, reason: `Field "${fieldPath}" length is ${fieldValue.length}, minimum is ${minLen}` };
        }
        if (Array.isArray(fieldValue)) {
          return fieldValue.length >= minLen
            ? { satisfied: true }
            : { satisfied: false, reason: `Array "${fieldPath}" length is ${fieldValue.length}, minimum is ${minLen}` };
        }
        return { satisfied: false, reason: `Field "${fieldPath}" is not a string or array` };
      }

      default:
        return { satisfied: false, reason: `Unknown operator "${operator}" in expression` };
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = obj;
    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  private extractClaims(output: unknown): string[] {
    if (!output || typeof output !== 'object') return [];
    const obj = output as Record<string, unknown>;
    const raw = obj.addressedObligations ?? obj.obligationsAddressed ?? obj.obligationIds;
    if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
    return [];
  }
}
