// Departments and sub-groups.
//
// A team (CalendarGroup) without a parent is a department; one with a parent
// is a sub-group of that department. Only two levels exist.
// A 'group_admin' of a department manages the department and all its
// sub-groups; a 'group_admin' of a sub-group manages that sub-group only.
// The database enforces the same rules (supabase/migrations/005_departments.sql).

import type { CalendarGroup, CalendarPerson, CalendarProfile } from './calendar-context';

type Group = Pick<CalendarGroup, 'id' | 'name' | 'parent_id' | 'sort_order'>;

const byOrder = (a: Group, b: Group) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);

export const isDepartment = (group: Pick<CalendarGroup, 'parent_id'> | undefined | null) => !!group && !group.parent_id;

export function findGroup<G extends Group>(groups: G[], id: string | null | undefined): G | undefined {
  return id ? groups.find((group) => group.id === id) : undefined;
}

/** Top-level departments, in display order. */
export function departmentsOf<G extends Group>(groups: G[]): G[] {
  return groups.filter((group) => !group.parent_id).sort(byOrder);
}

/** The sub-groups of a department, in display order. */
export function subGroupsOf<G extends Group>(groups: G[], departmentId: string): G[] {
  return groups.filter((group) => group.parent_id === departmentId).sort(byOrder);
}

/** The department a team belongs to (the team itself for a department). */
export function departmentOf<G extends Group>(groups: G[], id: string | null | undefined): G | undefined {
  const group = findGroup(groups, id);
  if (!group) return undefined;
  return group.parent_id ? findGroup(groups, group.parent_id) ?? group : group;
}

/** Is `id` the team `rootId` itself or one of its sub-groups? */
export function inTree(groups: Group[], id: string | null | undefined, rootId: string): boolean {
  if (!id) return false;
  if (id === rootId) return true;
  return findGroup(groups, id)?.parent_id === rootId;
}

/** "Marketing › Group 1" for a sub-group, "Marketing" for a department. */
export function groupPath(groups: Group[], id: string | null | undefined, fallback = ''): string {
  const group = findGroup(groups, id);
  if (!group) return fallback;
  const parent = group.parent_id ? findGroup(groups, group.parent_id) : undefined;
  return parent ? `${parent.name} › ${group.name}` : group.name;
}

/**
 * Departments followed by their sub-groups, for choosers and lists.
 * Sub-groups whose department is not in `groups` are listed as top-level.
 */
export function orderedGroups<G extends Group>(groups: G[]): G[] {
  const ids = new Set(groups.map((group) => group.id));
  const tops = groups.filter((group) => !group.parent_id || !ids.has(group.parent_id)).sort(byOrder);
  return tops.flatMap((top) => [top, ...subGroupsOf(groups, top.id)]);
}

/** The teams this person manages (all of them for a super admin). */
export function managedGroupIds(profile: CalendarProfile | null, groups: Group[]): Set<string> {
  if (!profile) return new Set();
  if (profile.role === 'super_admin') return new Set(groups.map((group) => group.id));
  if (profile.role === 'group_admin' && profile.group_id) {
    const own = profile.group_id;
    return new Set(groups.filter((group) => group.id === own || group.parent_id === own).map((group) => group.id));
  }
  return new Set();
}

/** Can this person manage events and people of team `groupId`? */
export function manages(profile: CalendarProfile | null, groups: Group[], groupId: string | null | undefined): boolean {
  if (!profile || !groupId) return false;
  if (profile.role === 'super_admin') return true;
  return profile.role === 'group_admin' && !!profile.group_id && inTree(groups, groupId, profile.group_id);
}

/** Active people in a team; with `withSubGroups`, a department's sub-groups too. Managers first. */
export function membersOf(
  people: CalendarPerson[],
  groups: Group[],
  groupId: string,
  withSubGroups = false,
): CalendarPerson[] {
  return people
    .filter((person) => person.is_active && (withSubGroups ? inTree(groups, person.group_id, groupId) : person.group_id === groupId))
    .sort((a, b) => {
      const rank = (p: CalendarPerson) => (p.role === 'group_admin' ? 0 : 1);
      return rank(a) - rank(b) || a.full_name.localeCompare(b.full_name);
    });
}
