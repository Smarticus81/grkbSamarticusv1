import { describe, expect, it } from 'vitest';
import { workspaceContextDisplay, type ServerWorkspaceContext } from './workspaceContext.js';

const serverContext: ServerWorkspaceContext = {
  tenant: {
    key: 'org_acme_1234567890',
    id: 'tenant-uuid',
    name: 'Acme Devices',
    kind: 'organization',
    plan: 'professional',
    clerkOrgId: 'org_acme_1234567890',
    active: true,
  },
  user: {
    id: 'user-uuid',
    subject: 'user_current',
    email: 'current@example.com',
    roles: ['viewer'],
  },
  membership: {
    role: 'viewer',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  quota: null,
};

describe('workspaceContextDisplay', () => {
  it('uses server workspace identity when available', () => {
    expect(workspaceContextDisplay({ orgId: 'org_other', userId: 'user_current' }, serverContext)).toEqual({
      title: 'Acme Devices',
      subtitle: 'Organization · professional · viewer',
      shortKey: 'org_acme_...567890',
      inactive: false,
    });
  });

  it('falls back to client scope while server context is loading', () => {
    expect(workspaceContextDisplay({ orgId: null, userId: 'user_current' }, null)).toEqual({
      title: 'Personal workspace',
      subtitle: 'Syncing workspace',
      shortKey: 'user_current',
      inactive: false,
    });
  });

  it('surfaces inactive tenant state from the server', () => {
    const inactive = {
      ...serverContext,
      tenant: { ...serverContext.tenant, active: false },
    };
    expect(workspaceContextDisplay({ orgId: 'org_acme_1234567890', userId: 'user_current' }, inactive).inactive).toBe(true);
  });
});
