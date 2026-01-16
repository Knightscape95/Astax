import webpush from 'web-push';
import { sql } from '@/lib/db';

// Configure web-push with VAPID details
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

let isConfigured = false;

if (vapidPublicKey && vapidPrivateKey) {
  try {
    webpush.setVapidDetails(
      'mailto:' + (process.env.VAPID_EMAIL || 'admin@example.com'),
      vapidPublicKey,
      vapidPrivateKey
    );
    isConfigured = true;
  } catch (error) {
    console.error('Failed to configure VAPID details:', error);
  }
} else {
  console.warn('VAPID keys not found. Push notifications will not work.');
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: any;
}

/**
 * Send push notification to a specific user
 * Validates preferences before sending is handled by the caller or this function?
 * For flexibility, this function just sends to all subscriptions for the user.
 * The caller should check if the user WANTS the notification.
 */
export async function sendPushNotification(userId: string, payload: PushPayload) {
  if (!isConfigured) {
    console.warn('Push notifications not configured, skipping send.');
    return { success: false, error: 'Not configured' };
  }

  try {
    // Get user's push subscriptions
    const result = await sql`
      SELECT endpoint, p256dh, auth
      FROM push_subscriptions 
      WHERE user_id = ${userId}
    `;

    if (result.rows.length === 0) {
      return { success: false, error: 'No subscriptions found' };
    }

    const notifications = result.rows.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(payload)
        );
        return { success: true };
      } catch (error: any) {
        // If 410 (Gone) or 404 (Not Found), remove subscription
        if (error.statusCode === 410 || error.statusCode === 404) {
            await sql`
            DELETE FROM push_subscriptions 
            WHERE endpoint = ${sub.endpoint}
            `;
        }
        console.error('Error sending push notification to subscription:', error);
        return { success: false, error };
      }
    });

    const results = await Promise.all(notifications);
    const successCount = results.filter(r => r.success).length;

    return { 
      success: successCount > 0, 
      sent: successCount,
      total: result.rows.length 
    };

  } catch (error) {
    console.error('Error in sendPushNotification:', error);
    return { success: false, error };
  }
}
