/**
 * Public exports for the task agent module.
 */

export * from './types.js';
export { TaskRunner, TaskEventStream, taskEventToSSE } from './TaskRunner.js';
export { TASK_AGENTS, listTasks, getTask, type TaskCatalogEntry } from './registry.js';
export { judgeLane, type JudgeOptions } from './eval/llm-judge.js';
