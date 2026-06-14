import { describe, expect, it } from 'vitest';
import {
  workspaceScopeKey,
  workspaceScopeKind,
  workspaceScopeLabel,
  workspaceScopeShortKey,
} from './workspaceScope.js';

describe('workspaceScopeKey', () => {
  it('distinguishes organizations for the same signed-in user', () => {
    expect(workspaceScopeKey({ orgId: 'org-a', userId: 'user-1' })).toBe('org-a:user-1');
    expect(workspaceScopeKey({ orgId: 'org-b', userId: 'user-1' })).toBe('org-b:user-1');
  });

  it('keeps personal and anonymous scopes explicit', () => {
    expect(workspaceScopeKey({ orgId: null, userId: 'user-1' })).toBe('personal:user-1');
    expect(workspaceScopeKey({ orgId: null, userId: null })).toBe('personal:anonymous');
  });

  it('labels the active workspace in user-facing language', () => {
    expect(workspaceScopeKind({ orgId: 'org-a', userId: 'user-1' })).toBe('organization');
    expect(workspaceScopeLabel({ orgId: 'org-a', userId: 'user-1' })).toBe('Organization workspace');

    expect(workspaceScopeKind({ orgId: null, userId: 'user-1' })).toBe('personal');
    expect(workspaceScopeLabel({ orgId: null, userId: 'user-1' })).toBe('Personal workspace');

    expect(workspaceScopeKind({ orgId: null, userId: null })).toBe('anonymous');
    expect(workspaceScopeLabel({ orgId: null, userId: null })).toBe('Local preview workspace');
  });

  it('shortens long workspace ids without changing the cache key', () => {
    const longOrgId = 'org_1234567890abcdefghijklmnopqrstuvwxyz';

    expect(workspaceScopeKey({ orgId: longOrgId, userId: 'user-1' })).toBe(`${longOrgId}:user-1`);
    expect(workspaceScopeShortKey({ orgId: longOrgId, userId: 'user-1' })).toBe('org_12345...uvwxyz');
  });
});
