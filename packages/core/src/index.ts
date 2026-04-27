// @regground/core — public barrel.

export const CORE_VERSION = '0.1.0';

// db
export * as schema from './db/schema.js';
export { getDB, getNeo4j, closeAll, type RegGroundDB, type DBConfig } from './db/connection.js';
export { withTenant } from './db/tenant.js';
export { eq, desc, and, gte, sql, count, asc } from 'drizzle-orm';

// graph
export * from './graph/types.js';
export { ObligationGraph } from './graph/ObligationGraph.js';
export { GraphSeeder, type RegulationFile } from './graph/GraphSeeder.js';
export { GraphQuerier } from './graph/GraphQuerier.js';
export { GraphVersioning } from './graph/GraphVersioning.js';
export { ObligationDiscovery, type DiscoveredScope } from './graph/ObligationDiscovery.js';
export { ALL_RELATION_TYPES, isValidRelationType } from './graph/relationships.js';

// traceability
export * from './traceability/types.js';
export { DecisionTraceService } from './traceability/DecisionTraceService.js';
export { ContentTraceService } from './traceability/ContentTraceService.js';
export { ProvenanceRegistry } from './traceability/ProvenanceRegistry.js';
export { ChainVerifier } from './traceability/ChainVerifier.js';
export { TraceExporter } from './traceability/TraceExporter.js';

// guardrails
export * from './guardrails/types.js';
export { BOUNDARY_POLICIES, getPolicy, listPolicies } from './guardrails/BoundaryPolicy.js';
export { StrictGate } from './guardrails/StrictGate.js';
export { QualificationGate } from './guardrails/QualificationGate.js';
export { ComplianceValidator } from './guardrails/ComplianceValidator.js';
export { CompliancePipeline } from './guardrails/CompliancePipeline.js';
export type { Validator, ValidationFinding, ValidationReport } from './guardrails/validators/types.js';
export { ValidationFindingSchema, ValidationReportSchema } from './guardrails/validators/types.js';
export { ClaimCoverageValidator } from './guardrails/validators/ClaimCoverageValidator.js';
export { EvidenceBackedComplianceValidator } from './guardrails/validators/EvidenceBackedComplianceValidator.js';
export { ConstraintEvaluator } from './guardrails/validators/ConstraintEvaluator.js';
export { CitationVerifier } from './guardrails/validators/CitationVerifier.js';
export { RegulatoryContradictionDetector } from './guardrails/validators/RegulatoryContradictionDetector.js';

// llm
export * from './llm/types.js';
export { LLMAbstraction } from './llm/LLMAbstraction.js';
export { CapabilityNegotiator } from './llm/CapabilityNegotiator.js';
export { FallbackChain } from './llm/FallbackChain.js';
export { ModelBenchmark, type BenchmarkResult } from './llm/ModelBenchmark.js';
export { OpenAIProvider, type OpenAIProviderConfig } from './llm/providers/OpenAIProvider.js';
export {
  AnthropicProvider,
  type AnthropicProviderConfig,
} from './llm/providers/AnthropicProvider.js';
export { GoogleProvider, type GoogleProviderConfig } from './llm/providers/GoogleProvider.js';
export { GenericProvider, type GenericProviderConfig } from './llm/providers/GenericProvider.js';

// agents
export * from './agents/types.js';
export { BaseGroundedAgent, type BaseGroundedAgentDeps } from './agents/BaseGroundedAgent.js';
export { AgentRegistry, type AgentRegistration, type AgentFactory } from './agents/AgentRegistry.js';
export { AgentOrchestrator, type DAGNode, type OrchestrationResult } from './agents/AgentOrchestrator.js';
export { PromptComposer } from './agents/PromptComposer.js';
export { AgentMetrics, type AgentMetricsSnapshot } from './agents/AgentMetrics.js';
export {
  AgentConfigSchema,
  CreateAgentConfigSchema,
  type AgentConfig,
  type CreateAgentConfig,
  type SchemaDefinition,
  type FieldDefinition,
  schemaToZod,
} from './agents/AgentConfig.js';
export { AgentConfigStore } from './agents/AgentConfigStore.js';
export { DynamicGroundedAgent } from './agents/DynamicGroundedAgent.js';

// evidence
export * from './evidence/types.js';
export { EvidenceTypeRegistry } from './evidence/EvidenceTypeRegistry.js';
export { Atomizer } from './evidence/Atomizer.js';
export { SlotMapper } from './evidence/SlotMapper.js';
export { ParserRegistry, type EvidenceParser } from './evidence/parsers/ParserRegistry.js';
export { JSONParser } from './evidence/parsers/JSONParser.js';
export { CSVParser } from './evidence/parsers/CSVParser.js';
export { ExcelParser } from './evidence/parsers/ExcelParser.js';
export { PDFParser } from './evidence/parsers/PDFParser.js';
export { FileStore } from './evidence/FileStore.js';

// skills
export { SkillStore, type SkillDefinition } from './skills/SkillStore.js';

// prompt context types
export { type FileContext, type SkillContext } from './agents/PromptComposer.js';

// process
export * from './process/types.js';
export { ProcessInstanceState } from './process/ProcessInstance.js';
export { HITLGate } from './process/HITLGate.js';
export { ProcessValidator } from './process/ProcessValidator.js';

// auth
export { VALID_SCOPES, ScopeSchema, type Scope } from './auth/scopes.js';

// harness
export * from './harness/types.js';
export { TestHarness, InMemoryTraceService } from './harness/TestHarness.js';
export { MockGraph } from './harness/MockGraph.js';
export { MockLLM } from './harness/MockLLM.js';
export { TraceAssertions } from './harness/TraceAssertions.js';
export { ComplianceAssertions } from './harness/ComplianceAssertions.js';
export { HarnessRunner, type ScenarioFile, type AgentLookup } from './harness/HarnessRunner.js';

// observability
export * from './observability/index.js';
