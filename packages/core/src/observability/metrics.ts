import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('regground');

export const requestDuration = meter.createHistogram('request_duration_ms', {
  description: 'HTTP request duration in milliseconds',
  unit: 'ms',
});

export const mcpToolCalls = meter.createCounter('mcp_tool_calls_total', {
  description: 'Total MCP tool calls',
});

export const complianceFindings = meter.createCounter('compliance_validator_findings_total', {
  description: 'Compliance validator findings',
});

export const llmCost = meter.createCounter('llm_cost_usd_total', {
  description: 'LLM cost in USD',
});

export const llmTokens = meter.createCounter('llm_tokens_total', {
  description: 'LLM tokens used',
});
