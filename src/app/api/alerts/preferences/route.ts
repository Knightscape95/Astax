import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sql } from '@/lib/db';
import type { AlertType, AlertSeverity } from '@/types/database';

/**
 * GET /api/alerts/preferences - Get user's alert preferences
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.email;
    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get('model_id');

    let result;
    if (modelId) {
      result = await sql`
        SELECT * FROM alert_preferences 
        WHERE user_id = ${userId} 
          AND (model_id = ${modelId} OR model_id IS NULL)
        ORDER BY alert_type
      `;
    } else {
      result = await sql`
        SELECT * FROM alert_preferences 
        WHERE user_id = ${userId}
        ORDER BY alert_type
      `;
    }

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching alert preferences:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/alerts/preferences - Create or update alert preference
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const userId = session.user.email;

    const {
      alert_type,
      model_id,
      enabled,
      email_enabled,
      push_enabled,
      min_severity,
      thresholds,
    } = body;

    if (!alert_type) {
      return NextResponse.json(
        { error: 'alert_type is required' },
        { status: 400 }
      );
    }

    // Validate severity if provided
    const validSeverities = ['info', 'warning', 'critical'];
    if (min_severity && !validSeverities.includes(min_severity)) {
      return NextResponse.json(
        { error: 'Invalid min_severity value' },
        { status: 400 }
      );
    }

    const result = await sql`
      INSERT INTO alert_preferences (
        user_id, alert_type, model_id, enabled, email_enabled, 
        push_enabled, min_severity, thresholds
      ) VALUES (
        ${userId},
        ${alert_type},
        ${model_id || null},
        ${enabled ?? true},
        ${email_enabled ?? false},
        ${push_enabled ?? true},
        ${min_severity || 'warning'},
        ${thresholds ? JSON.stringify(thresholds) : null}
      )
      ON CONFLICT (user_id, alert_type, COALESCE(model_id, '00000000-0000-0000-0000-000000000000'))
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        email_enabled = EXCLUDED.email_enabled,
        push_enabled = EXCLUDED.push_enabled,
        min_severity = EXCLUDED.min_severity,
        thresholds = EXCLUDED.thresholds,
        updated_at = NOW()
      RETURNING *
    `;

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating alert preference:', error);
    return NextResponse.json(
      { error: 'Failed to update preference' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/alerts/preferences - Delete alert preference
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const preferenceId = searchParams.get('id');
    const userId = session.user.email;

    if (!preferenceId) {
      return NextResponse.json(
        { error: 'Preference id is required' },
        { status: 400 }
      );
    }

    const result = await sql`
      DELETE FROM alert_preferences 
      WHERE id = ${preferenceId} AND user_id = ${userId}
      RETURNING id
    `;

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Preference not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting alert preference:', error);
    return NextResponse.json(
      { error: 'Failed to delete preference' },
      { status: 500 }
    );
  }
}
