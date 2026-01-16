import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sql } from '@/lib/db';
import { sendPushNotification } from '@/lib/push-server';
import type { AlertHistory, AlertStatus, AlertSeverity } from '@/types/database';

/**
 * GET /api/alerts - Get alert history with filters
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = session.user.email;
    
    const status = searchParams.get('status') as AlertStatus | null;
    const severity = searchParams.get('severity') as AlertSeverity | null;
    const modelId = searchParams.get('model_id');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let result;

    if (status && severity && modelId) {
      result = await sql`
        SELECT * FROM alert_history 
        WHERE user_id = ${userId}
          AND status = ${status}
          AND severity = ${severity}
          AND model_id = ${modelId}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (status && severity) {
      result = await sql`
        SELECT * FROM alert_history 
        WHERE user_id = ${userId}
          AND status = ${status}
          AND severity = ${severity}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (status) {
      result = await sql`
        SELECT * FROM alert_history 
        WHERE user_id = ${userId}
          AND status = ${status}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (severity) {
      result = await sql`
        SELECT * FROM alert_history 
        WHERE user_id = ${userId}
          AND severity = ${severity}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      result = await sql`
        SELECT * FROM alert_history 
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    // Get total count
    const countResult = await sql`
      SELECT COUNT(*) as total FROM alert_history WHERE user_id = ${userId}
    `;

    // Get unread count
    const unreadResult = await sql`
      SELECT COUNT(*) as unread FROM alert_history 
      WHERE user_id = ${userId} AND status = 'pending'
    `;

    return NextResponse.json({
      alerts: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
      unread: parseInt(unreadResult.rows[0].unread, 10),
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alerts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/alerts - Create a new alert (internal use)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify internal API key for automated alerts
    const apiKey = request.headers.get('x-api-key');
    const session = await getServerSession();
    
    if (apiKey !== process.env.INTERNAL_API_KEY && !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    const {
      user_id,
      model_id,
      trade_id,
      alert_type,
      severity,
      title,
      message,
      data,
    } = body;

    if (!user_id || !alert_type || !severity || !title || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Rate limiting: max 100 alerts per user per minute
    const recentCount = await sql`
      SELECT COUNT(*) as count
      FROM alert_history
      WHERE user_id = ${user_id}
        AND created_at > NOW() - INTERVAL '1 minute'
    `;

    if (parseInt(recentCount.rows[0]?.count || '0', 10) > 100) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    const result = await sql`
      INSERT INTO alert_history (
        user_id, model_id, trade_id, alert_type, severity, 
        title, message, data, status, sent_at
      ) VALUES (
        ${user_id},
        ${model_id || null},
        ${trade_id || null},
        ${alert_type},
        ${severity},
        ${title?.substring(0, 255) || 'Alert'},
        ${message?.substring(0, 1000) || 'An alert was triggered'},
        ${data ? JSON.stringify(data) : null},
        'active',
        NOW()
      )
      RETURNING *
    `;

    // Check if user wants push notifications for this alert type
    // If no preference found, default to true (as per schema default)
    const prefResult = await sql`
        SELECT push_enabled 
        FROM alert_preferences 
        WHERE user_id = ${user_id} 
          AND alert_type = ${alert_type}
        LIMIT 1
    `;

    const shouldSendPush = prefResult.rows.length === 0 || prefResult.rows[0].push_enabled;

    if (shouldSendPush) {
      // Don't await specifically to avoid slowing down response significantly? 
      // Or await to ensure it works? 
      // Vercel serverless functions might kill background tasks if we don't await. 
      // So we MUST await.
      await sendPushNotification(user_id, {
        title,
        body: message,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        data: { 
            url: '/alerts',
            alertId: result.rows[0].id
        }
      });
    }

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Error creating alert:', error);
    return NextResponse.json(
      { error: 'Failed to create alert' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/alerts - Bulk update alerts (mark as read, dismiss)
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, alert_ids } = body;
    const userId = session.user.email;

    if (!action || !['acknowledged', 'dismiss', 'acknowledge_all', 'dismiss_all'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    let result;

    switch (action) {
      case 'acknowledged':
        if (!alert_ids?.length) {
          return NextResponse.json({ error: 'alert_ids required' }, { status: 400 });
        }
        result = await sql`
          UPDATE alert_history 
          SET status = 'acknowledged', acknowledged_at = NOW()
          WHERE user_id = ${userId} AND id = ANY(${alert_ids})
          RETURNING id
        `;
        break;

      case 'dismiss':
        if (!alert_ids?.length) {
          return NextResponse.json({ error: 'alert_ids required' }, { status: 400 });
        }
        result = await sql`
          UPDATE alert_history 
          SET status = 'dismissed', dismissed_at = NOW()
          WHERE user_id = ${userId} AND id = ANY(${alert_ids})
          RETURNING id
        `;
        break;

      case 'acknowledge_all':
        result = await sql`
          UPDATE alert_history 
          SET status = 'acknowledged', acknowledged_at = NOW()
          WHERE user_id = ${userId} AND status = 'active'
          RETURNING id
        `;
        break;

      case 'dismiss_all':
        result = await sql`
          UPDATE alert_history 
          SET status = 'dismissed', dismissed_at = NOW()
          WHERE user_id = ${userId} AND status IN ('active', 'acknowledged')
          RETURNING id
        `;
        break;
    }

    return NextResponse.json({
      success: true,
      updated: result?.rows.length || 0,
    });
  } catch (error) {
    console.error('Error updating alerts:', error);
    return NextResponse.json(
      { error: 'Failed to update alerts' },
      { status: 500 }
    );
  }
}
