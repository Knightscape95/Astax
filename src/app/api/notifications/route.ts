import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sql } from '@/lib/db';
import { sendPushNotification } from '@/lib/push-server';

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/**
 * GET /api/notifications/vapid-key - Get VAPID public key for push subscriptions
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    if (searchParams.get('action') === 'vapid-key') {
      // VAPID key check moved to lib or handled here
      if (!vapidPublicKey) {
        return NextResponse.json(
          { error: 'Push notifications not configured' },
          { status: 500 }
        );
      }
      return NextResponse.json({ publicKey: vapidPublicKey });
    }

    // Get user's push subscriptions
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await sql`
      SELECT id, endpoint, created_at 
      FROM push_subscriptions 
      WHERE user_id = ${session.user.email}
      ORDER BY created_at DESC
    `;

    return NextResponse.json({ subscriptions: result.rows });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notifications - Subscribe to push notifications
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { subscription, action } = body;

    // Handle test notification
    if (action === 'test') {
      const result = await sendPushNotification(session.user.email, {
        title: 'Test Notification',
        body: 'Push notifications are working correctly!',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        data: { type: 'test' },
      });

      if (!result.success) {
         if (result.error === 'No subscriptions found') {
            return NextResponse.json(
                { error: 'No push subscription found' },
                { status: 400 }
            );
         }
        // Log error but don't crash
        console.error('Failed to send test notification:', result.error);
        return NextResponse.json(
          { error: 'Failed to send test notification' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, message: 'Test notification sent' });
    }

    // Handle new subscription
    if (!subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json(
        { error: 'Invalid subscription data' },
        { status: 400 }
      );
    }

    const { endpoint, keys } = subscription;

    // Upsert subscription
    const result = await sql`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (
        ${session.user.email},
        ${endpoint},
        ${keys.p256dh},
        ${keys.auth}
      )
      ON CONFLICT (endpoint)
      DO UPDATE SET
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        updated_at = NOW()
      RETURNING id
    `;

    return NextResponse.json({
      success: true,
      subscriptionId: result.rows[0].id,
    });
  } catch (error) {
    console.error('Error subscribing to notifications:', error);
    return NextResponse.json(
      { error: 'Failed to subscribe' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notifications - Unsubscribe from push notifications
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');
    const all = searchParams.get('all') === 'true';

    if (all) {
      // Delete all subscriptions for user
      await sql`
        DELETE FROM push_subscriptions 
        WHERE user_id = ${session.user.email}
      `;
    } else if (endpoint) {
      // Delete specific subscription
      await sql`
        DELETE FROM push_subscriptions 
        WHERE user_id = ${session.user.email} AND endpoint = ${endpoint}
      `;
    } else {
      return NextResponse.json(
        { error: 'endpoint or all parameter required' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error unsubscribing from notifications:', error);
    return NextResponse.json(
      { error: 'Failed to unsubscribe' },
      { status: 500 }
    );
  }
}
