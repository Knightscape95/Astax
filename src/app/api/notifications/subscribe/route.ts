import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sql } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const subscription = await request.json();
    const userId = session.user.email;

    // Validate required fields
    if (!subscription.endpoint || !subscription.p256dh_key || !subscription.auth_key) {
      return NextResponse.json(
        { error: 'Missing required subscription fields' },
        { status: 400 }
      );
    }

    // Validate endpoint is a valid URL
    try {
      new URL(subscription.endpoint);
    } catch {
      return NextResponse.json(
        { error: 'Invalid endpoint URL' },
        { status: 400 }
      );
    }

    // Limit to 5 subscriptions per user
    const existingCount = await sql`
      SELECT COUNT(*) as count
      FROM push_subscriptions
      WHERE user_id = ${userId}
    `;

    if (parseInt(existingCount.rows[0]?.count || '0', 10) >= 5) {
      // Delete oldest subscription if limit reached
      await sql`
        DELETE FROM push_subscriptions
        WHERE id IN (
          SELECT id FROM push_subscriptions
          WHERE user_id = ${userId}
          ORDER BY created_at ASC
          LIMIT 1
        )
      `;
    }

    await sql`
      INSERT INTO push_subscriptions (
        user_id, endpoint, p256dh_key, auth_key, user_agent, created_at, updated_at
      ) VALUES (
        ${userId},
        ${subscription.endpoint},
        ${subscription.p256dh_key},
        ${subscription.auth_key},
        ${subscription.user_agent || request.headers.get('user-agent')},
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id, endpoint)
      DO UPDATE SET
        p256dh_key = EXCLUDED.p256dh_key,
        auth_key = EXCLUDED.auth_key,
        user_agent = EXCLUDED.user_agent,
        updated_at = NOW()
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving subscription:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endpoint } = await request.json();
    const userId = session.user.email;

    await sql`
      DELETE FROM push_subscriptions
      WHERE user_id = ${userId} AND endpoint = ${endpoint}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing subscription:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
