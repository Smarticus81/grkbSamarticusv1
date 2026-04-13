---
name: create-process
description: "Scaffold a new QMS process with process definition, obligation bindings, agent stubs, and test harness. Use when: creating a new quality process, adding a process type, building a workflow."
---

# Create Process

Scaffold a new QMS process under `packages/sandbox/src/processes/<name>/`.

## Procedure

1. Copy `assets/process-template.yaml` to your new process folder and fill in
   the steps, agents, and obligation bindings.
2. Create `<Name>ProcessDefinition.ts` exporting a `ProcessDefinition` value
   that matches the YAML.
3. For each step, create an agent file under `agents/` extending
   `BaseGroundedAgent`. Use the `create-agent` skill to scaffold.
4. Create `obligations.yaml` listing the subset of obligationIds this process
   addresses (these must already exist in the graph).
5. Create `harness/<process>-scenarios.yaml` with at least 5 test scenarios.
6. Validate the process:
   ```ts
   const v = new ProcessValidator(graph);
   const result = await v.validate(definition);
   if (!result.valid) throw new Error(result.errors.join('\n'));
   ```
7. Register the process in `ProcessRegistry`.

## Hard rules

- Every mandatory obligation for `(processType, jurisdiction)` must be
  addressed by at least one step.
- The DAG must be acyclic.
- HITL gates are required wherever the regulation calls for human judgment.
