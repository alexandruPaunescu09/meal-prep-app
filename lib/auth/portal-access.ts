export type AccessProfile = { role?: string | null; client_id?: string | null } | null | undefined;

export type PortalAccess = {
  /** May open the customer portal: a customer with a client, or an admin linked to a "self client". */
  canUsePortal: boolean;
  isAdmin: boolean;
  clientId: string | null;
};

/**
 * The one rule for portal access. An admin whose profile has a client_id ("self client")
 * may use the portal too; an admin without one may not. Customers need a client_id.
 */
export function portalAccess(profile: AccessProfile): PortalAccess {
  const role = profile?.role;
  const clientId = profile?.client_id ?? null;
  const isAdmin = role === "admin";
  const canUsePortal = (role === "customer" || isAdmin) && !!clientId;
  return { canUsePortal, isAdmin, clientId };
}
