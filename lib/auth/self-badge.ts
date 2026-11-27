export type SelfBadge = "you" | "admin" | null;

/**
 * Badge for a client card. "you" = the signed-in admin's own record (the only one that gets Unlink),
 * "admin" = linked to another admin, null = regular client.
 */
export function selfBadge(client: { id: string; admin_linked?: boolean }, myClientId: string | null): SelfBadge {
  if (myClientId && client.id === myClientId) return "you";
  if (client.admin_linked) return "admin";
  return null;
}
