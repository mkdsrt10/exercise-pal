import "server-only";
import { headers } from "next/headers";

/**
 * Identity comes from Tailscale. `tailscale serve` adds the signed-in tailnet
 * user's login to every proxied request, so there is no separate login screen.
 * Outside Tailscale (local dev) everything belongs to "local".
 */
export async function currentUser(): Promise<string> {
  const h = await headers();
  return h.get("tailscale-user-login") ?? "local";
}
