/**
 * Header notifications.
 *
 * TODO: replace the sample data with a backend feed:
 *   GET /api/notifications?since=<ISO>  -> [{ id, type, title, body, ip?, at }]
 *   PATCH /api/notifications/read       { ids }
 * and push new items over the live feed (SSE, see lib/live-updates.tsx). Event sources:
 *   - new_ip:        first log ever stored for an attacker
 *   - attack_spike:  attempts in the last N minutes above a threshold
 *   - login_success: cowrie.login.success ingested (the agent does not send it yet)
 */

export type NotificationType = "new_ip" | "attack_spike" | "login_success";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  ip?: string;
  at: string;
}

const minutesAgo = (base: number, minutes: number) => new Date(base - minutes * 60_000).toISOString();

/** Sample notifications, timestamped relative to `now` */
export function sampleNotifications(now: number): AppNotification[] {
  return [
    {
      id: "sample-login-success",
      type: "login_success",
      title: "Successful login to the honeypot",
      body: "root:123456 was accepted on the decoy SSH service.",
      ip: "203.0.113.42",
      at: minutesAgo(now, 4),
    },
    {
      id: "sample-attack-spike",
      type: "attack_spike",
      title: "Attack spike",
      body: "612 login attempts in the last 10 minutes (usual: ~15).",
      at: minutesAgo(now, 18),
    },
    {
      id: "sample-new-ip",
      type: "new_ip",
      title: "New attacking IP",
      body: "First attempts seen from 198.51.100.7.",
      ip: "198.51.100.7",
      at: minutesAgo(now, 55),
    },
  ];
}
