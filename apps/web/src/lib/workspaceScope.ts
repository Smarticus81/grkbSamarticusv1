export interface WorkspaceAuthScope {
  orgId: string | null;
  userId: string | null;
}

export type WorkspaceScopeKind = 'organization' | 'personal' | 'anonymous';

export function workspaceScopeKey(scope: WorkspaceAuthScope): string {
  return `${scope.orgId ?? 'personal'}:${scope.userId ?? 'anonymous'}`;
}

export function workspaceScopeKind(scope: WorkspaceAuthScope): WorkspaceScopeKind {
  if (scope.orgId) return 'organization';
  if (scope.userId) return 'personal';
  return 'anonymous';
}

export function workspaceScopeLabel(scope: WorkspaceAuthScope): string {
  const kind = workspaceScopeKind(scope);
  if (kind === 'organization') return 'Organization workspace';
  if (kind === 'personal') return 'Personal workspace';
  return 'Local preview workspace';
}

export function workspaceScopeShortKey(scope: WorkspaceAuthScope): string {
  const id = scope.orgId ?? scope.userId ?? 'anonymous';
  return id.length <= 18 ? id : `${id.slice(0, 9)}...${id.slice(-6)}`;
}
