import {
  workspaceScopeLabel,
  workspaceScopeShortKey,
  type WorkspaceAuthScope,
} from './workspaceScope.js';

export type ServerWorkspaceKind = 'organization' | 'personal' | 'custom';

export interface ServerWorkspaceContext {
  tenant: {
    key: string;
    id: string | null;
    name: string;
    kind: ServerWorkspaceKind;
    plan: string;
    clerkOrgId: string | null;
    active: boolean;
  };
  user: {
    id: string | null;
    subject: string;
    email: string | null;
    roles: string[];
  };
  membership: {
    role: string;
    createdAt: string | null;
  };
  quota: {
    monthlyRequestLimit: number;
    monthlyTokenLimit: number;
    currentMonthRequests: number;
    currentMonthTokens: number;
    periodStart: string;
    updatedAt: string;
  } | null;
}

export function workspaceContextDisplay(
  scope: WorkspaceAuthScope,
  context: ServerWorkspaceContext | null,
): { title: string; subtitle: string; shortKey: string; inactive: boolean } {
  if (!context) {
    return {
      title: workspaceScopeLabel(scope),
      subtitle: 'Syncing workspace',
      shortKey: workspaceScopeShortKey(scope),
      inactive: false,
    };
  }

  const kindLabel =
    context.tenant.kind === 'organization' ? 'Organization' :
      context.tenant.kind === 'personal' ? 'Personal' :
        'Workspace';
  const role = context.membership.role ? ` · ${context.membership.role}` : '';
  const plan = context.tenant.plan ? ` · ${context.tenant.plan}` : '';

  return {
    title: context.tenant.name,
    subtitle: `${kindLabel}${plan}${role}`,
    shortKey: workspaceScopeShortKey({
      orgId: context.tenant.kind === 'organization' ? context.tenant.key : null,
      userId: context.tenant.kind === 'personal' ? context.tenant.key : context.user.subject,
    }),
    inactive: !context.tenant.active,
  };
}
