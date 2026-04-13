import type { ProcessDefinition } from '@regground/core';
import { StatTrendInputSchema, StatTrendOutputSchema } from './agents/StatisticalTrendAgent.js';
import { NarrativeInputSchema, NarrativeOutputSchema } from './agents/TrendNarrativeAgent.js';

export const TREND_PROCESS: ProcessDefinition = {
  id: 'trend-eumdr-v1',
  name: 'Trend Reporting',
  description: 'Statistical trend detection and narrative generation for PMS reports.',
  version: '1.0.0',
  regulations: [{ regulation: 'Regulation (EU) 2017/745', section: 'Article 88' }],
  jurisdictions: ['EU_MDR', 'GLOBAL'],
  obligationIds: ['EUMDR.83.OBL.001', 'EUMDR.86.PSUR.OBL.001'],
  requiredEvidenceTypes: ['trend_data'],
  requiredAgentTypes: ['StatisticalTrendAgent', 'TrendNarrativeAgent'],
  hitlGates: [],
  steps: [
    {
      id: 'stats',
      name: 'Statistical Analysis',
      description: 'Run UCL/LCL or Poisson/binomial test',
      agentType: 'StatisticalTrendAgent',
      inputSchema: StatTrendInputSchema,
      outputSchema: StatTrendOutputSchema,
      obligationIds: ['EUMDR.83.OBL.001'],
      dependsOn: [],
      timeoutMs: 60_000,
      retryPolicy: { maxRetries: 1, backoffMs: 3_000 },
    },
    {
      id: 'narrative',
      name: 'Narrative Generation',
      description: 'Write narrative for the report',
      agentType: 'TrendNarrativeAgent',
      inputSchema: NarrativeInputSchema,
      outputSchema: NarrativeOutputSchema,
      obligationIds: ['EUMDR.86.PSUR.OBL.001'],
      dependsOn: ['stats'],
      timeoutMs: 60_000,
      retryPolicy: { maxRetries: 1, backoffMs: 3_000 },
    },
  ],
};
