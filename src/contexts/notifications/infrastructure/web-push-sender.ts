import webpush from "web-push";
import type { PushSender, PushSubscriptionRecord } from "../application/ports";
import type { PushMessage } from "../domain/messages";

/**
 * Web Push with VAPID keys (`npx web-push generate-vapid-keys`). Works on Android browsers and on
 * iPhone once the app is added to the home screen. A 404/410 from the push service means the
 * subscription is gone.
 */
export class WebPushSender implements PushSender {
  constructor(opts: { publicKey: string; privateKey: string; subject: string }) {
    webpush.setVapidDetails(opts.subject, opts.publicKey, opts.privateKey);
  }

  async send(sub: PushSubscriptionRecord, message: PushMessage): Promise<"sent" | "gone"> {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(message),
        { TTL: 60 * 60 * 12, urgency: "normal", topic: message.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined },
      );
      return "sent";
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return "gone";
      throw error;
    }
  }
}
