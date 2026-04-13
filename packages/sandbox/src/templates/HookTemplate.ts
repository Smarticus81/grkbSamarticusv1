export interface HookTemplateParams {
  preToolUse?: { matcher: string; command: string; timeout?: number }[];
  postToolUse?: { matcher: string; command: string; timeout?: number }[];
  onSubmit?: { command: string; timeout?: number }[];
}

export function generateHooksJson(params: HookTemplateParams): string {
  const hooks: Record<string, unknown[]> = {};
  if (params.preToolUse?.length) {
    hooks.PreToolUse = params.preToolUse.map((h) => ({
      matcher: h.matcher,
      type: 'command',
      command: h.command,
      timeout: h.timeout ?? 10,
    }));
  }
  if (params.postToolUse?.length) {
    hooks.PostToolUse = params.postToolUse.map((h) => ({
      matcher: h.matcher,
      type: 'command',
      command: h.command,
      timeout: h.timeout ?? 10,
    }));
  }
  if (params.onSubmit?.length) {
    hooks.UserPromptSubmit = params.onSubmit.map((h) => ({
      type: 'command',
      command: h.command,
      timeout: h.timeout ?? 10,
    }));
  }
  return JSON.stringify(
    { $schema: 'https://json.schemastore.org/claude-code-hooks', hooks },
    null,
    2,
  );
}
