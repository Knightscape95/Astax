import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  getModelById,
  updateModel,
  deleteModel,
  getTradesByModel,
  getLatestPerformanceMetric,
  getModelUpdateHistory,
} from '@/lib/db-utils';
import type { UpdateModelInput } from '@/types/database';

interface RouteParams {
  params: { id: string };
}

/**
 * GET /api/models/[id] - Get a specific model with related data
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeMetrics = searchParams.get('include_metrics') === 'true';
    const includeTrades = searchParams.get('include_trades') === 'true';
    const includeUpdates = searchParams.get('include_updates') === 'true';

    const model = await getModelById(params.id);

    if (!model) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const response: Record<string, unknown> = { model };

    // Optionally include related data
    if (includeMetrics) {
      response.latestMetrics = await getLatestPerformanceMetric(params.id);
    }

    if (includeTrades) {
      const openTrades = await getTradesByModel(params.id, 'open');
      response.openTrades = openTrades;
      response.openTradesCount = openTrades.length;
    }

    if (includeUpdates) {
      response.updateHistory = await getModelUpdateHistory(params.id);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching model:', error);
    return NextResponse.json(
      { error: 'Failed to fetch model' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/models/[id] - Update a model
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    const input: UpdateModelInput = {};
    
    if (body.name !== undefined) {
      input.name = body.name;
    }
    if (body.description !== undefined) {
      input.description = body.description;
    }
    if (body.version !== undefined) {
      input.version = body.version;
    }
    if (body.status !== undefined) {
      input.status = body.status;
    }
    if (body.algorithm !== undefined) {
      input.algorithm = body.algorithm;
    }
    if (body.hyperparameters !== undefined) {
      input.hyperparameters = body.hyperparameters;
    }
    if (body.features !== undefined) {
      input.features = body.features;
    }
    if (body.target_asset !== undefined) {
      input.target_asset = body.target_asset;
    }
    if (body.training_start_date !== undefined) {
      input.training_start_date = body.training_start_date ? new Date(body.training_start_date) : undefined;
    }
    if (body.training_end_date !== undefined) {
      input.training_end_date = body.training_end_date ? new Date(body.training_end_date) : undefined;
    }

    const model = await updateModel(params.id, input);

    if (!model) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    return NextResponse.json(model);
  } catch (error) {
    console.error('Error updating model:', error);
    return NextResponse.json(
      { error: 'Failed to update model' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/models/[id] - Delete a model
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check for open trades first
    const openTrades = await getTradesByModel(params.id, 'open');
    if (openTrades.length > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot delete model with open trades',
          openTradesCount: openTrades.length,
        },
        { status: 400 }
      );
    }

    const deleted = await deleteModel(params.id);

    if (!deleted) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting model:', error);
    return NextResponse.json(
      { error: 'Failed to delete model' },
      { status: 500 }
    );
  }
}
