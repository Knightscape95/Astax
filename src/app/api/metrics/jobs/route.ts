import { NextRequest, NextResponse } from 'next/server';
import { 
  runMetricsUpdateJob, 
  updateMetricsForModel,
  cleanupOldMetrics,
  type PeriodType 
} from '@/lib/jobs/update-metrics';

/**
 * POST /api/metrics/jobs
 * 
 * Triggers background jobs for metrics recalculation.
 * 
 * Request Body:
 * - action: 'update_all' | 'update_model' | 'cleanup'
 * - model_id: Required for 'update_model' action
 * - periods: Array of period types (optional, default: ['daily', 'weekly', 'monthly'])
 * - older_than_days: For cleanup action (default: 365)
 * 
 * Response:
 * - 200: Job completed successfully
 * - 400: Invalid parameters
 * - 500: Server error
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, model_id, periods, older_than_days } = body;

    // Validate action
    if (!action || !['update_all', 'update_model', 'cleanup'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "update_all", "update_model", or "cleanup"' },
        { status: 400 }
      );
    }

    // Validate periods if provided
    const validPeriods: PeriodType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'all_time'];
    const requestedPeriods: PeriodType[] = periods || ['daily', 'weekly', 'monthly'];
    
    for (const period of requestedPeriods) {
      if (!validPeriods.includes(period)) {
        return NextResponse.json(
          { error: `Invalid period "${period}". Must be one of: ${validPeriods.join(', ')}` },
          { status: 400 }
        );
      }
    }

    switch (action) {
      case 'update_all': {
        const result = await runMetricsUpdateJob({ periods: requestedPeriods });
        return NextResponse.json({
          success: result.success,
          action: 'update_all',
          result: {
            models_processed: result.modelsProcessed,
            metrics_created: result.metricsCreated,
            errors: result.errors,
            duration_ms: result.duration,
            started_at: result.startedAt.toISOString(),
            completed_at: result.completedAt.toISOString(),
          },
        });
      }

      case 'update_model': {
        if (!model_id) {
          return NextResponse.json(
            { error: 'model_id is required for update_model action' },
            { status: 400 }
          );
        }

        const result = await updateMetricsForModel(model_id, requestedPeriods);
        return NextResponse.json({
          success: result.success,
          action: 'update_model',
          model_id,
          periods: requestedPeriods,
          errors: result.errors,
        });
      }

      case 'cleanup': {
        const days = older_than_days || 365;
        if (typeof days !== 'number' || days < 1) {
          return NextResponse.json(
            { error: 'older_than_days must be a positive number' },
            { status: 400 }
          );
        }

        const deletedCount = await cleanupOldMetrics(days);
        return NextResponse.json({
          success: true,
          action: 'cleanup',
          deleted_count: deletedCount,
          older_than_days: days,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error running metrics job:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to run metrics job',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/metrics/jobs
 * 
 * Returns information about the metrics job system.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    available_actions: [
      {
        action: 'update_all',
        description: 'Recalculate metrics for all models with trades',
        parameters: {
          periods: {
            type: 'array',
            optional: true,
            default: ['daily', 'weekly', 'monthly'],
            valid_values: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'all_time'],
          },
        },
      },
      {
        action: 'update_model',
        description: 'Recalculate metrics for a specific model',
        parameters: {
          model_id: {
            type: 'string',
            required: true,
            description: 'UUID of the model to update',
          },
          periods: {
            type: 'array',
            optional: true,
            default: ['daily', 'weekly', 'monthly'],
            valid_values: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'all_time'],
          },
        },
      },
      {
        action: 'cleanup',
        description: 'Delete old metrics records',
        parameters: {
          older_than_days: {
            type: 'number',
            optional: true,
            default: 365,
            description: 'Delete metrics older than this many days',
          },
        },
      },
    ],
    usage: {
      method: 'POST',
      content_type: 'application/json',
      example: {
        action: 'update_all',
        periods: ['daily', 'weekly'],
      },
    },
  });
}
