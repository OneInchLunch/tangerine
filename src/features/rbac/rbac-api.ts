import { apiRequest } from "@/api/client";
import { deleteAndWait, mutateAndWait } from "@/api/resources";
import type { Role, User } from "@/api/types";

export async function addRoleAssignment(
  subjectHref: string,
  role: string,
  contentObject?: string,
): Promise<void> {
  await mutateAndWait(`${subjectHref}roles/`, {
    method: "POST",
    body: {
      role,
      content_object: contentObject?.trim() || null,
    },
  });
}

export async function deleteRoleAssignment(href: string): Promise<void> {
  await deleteAndWait(href);
}

export async function addGroupMember(groupHref: string, username: string): Promise<void> {
  await mutateAndWait(`${groupHref}users/`, {
    method: "POST",
    body: { username },
  });
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const payload = await apiRequest<{ results?: User[] }>(
    `users/?username=${encodeURIComponent(username)}`,
  );
  return payload.results?.[0] ?? null;
}

export async function deleteGroupMember(href: string): Promise<void> {
  await deleteAndWait(href);
}

export async function createRole(body: {
  name: string;
  description?: string | null;
  permissions: string[];
}): Promise<Role> {
  return apiRequest<Role>("roles/", { method: "POST", body });
}

export async function updateRole(
  href: string,
  body: { name: string; description?: string | null; permissions: string[] },
): Promise<Role> {
  return apiRequest<Role>(href, { method: "PATCH", body });
}

export async function changeObjectRole(
  objectHref: string,
  action: "add_role" | "remove_role",
  body: { role: string; users?: string[]; groups?: string[] },
): Promise<void> {
  await mutateAndWait(`${objectHref}${action}/`, {
    method: "POST",
    body,
  });
}
