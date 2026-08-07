// A background sync firing off the home LAN is known to fail (the PC is
// only reachable from home Wi-Fi — see
// docs/superpowers/specs/2026-08-07-offline-pwa-sync-design.md), so skip
// attempting it on cellular rather than spending battery/data on a doomed
// request. `navigator.connection` isn't universally supported, so a
// missing/undefined connection defaults to attempting — the request will
// just fail harmlessly if it's actually unreachable.
export function shouldAttemptBackgroundSync(connection: { type?: string } | undefined): boolean {
  return connection?.type !== 'cellular'
}
