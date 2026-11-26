import { defineAuthz, OWNER_ROLE } from '@lathe/application-foundation';

/**
 * Team Operations roles (task P7-02). Org-wide roles apply to every team and project;
 * grants on a team or project (P7-01 scopes) add a role there and below; an explicit
 * deny on a team or project wins over everything, including the owner.
 *
 *   - owner: everything, the only role that changes or removes members;
 *   - manager: creates teams and projects, manages scope rules, works on every task;
 *   - member: reads every team and project and works on tasks; manages nothing;
 *   - guest: sees nothing org-wide. Works only where a team or project grant gives a role.
 */
const GUEST = ['scopes.read', 'members.leave'] as const;
const WORK = [
  'teams.read',
  'projects.read',
  'tasks.read',
  'tasks.list',
  'tasks.create',
  'tasks.update',
] as const;
const MEMBER = [...GUEST, ...WORK, 'members.read'] as const;
const MANAGER = [...MEMBER, 'tasks.delete', 'scopes.manage', 'members.invite'] as const;

export const authz = defineAuthz({
  permissions: [...MANAGER, 'members.manage'],
  roles: {
    [OWNER_ROLE]: [...MANAGER, 'members.manage'],
    manager: MANAGER,
    member: MEMBER,
    guest: GUEST,
    // Grant-only roles: meant for team or project grants, never needed org-wide.
    contributor: [...WORK],
    reader: ['teams.read', 'projects.read', 'tasks.read', 'tasks.list'],
  },
});

export type AppPermission = (typeof authz.permissions)[number];
export type AppRole = (typeof authz.roles)[number];
