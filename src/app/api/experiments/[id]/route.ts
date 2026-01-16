/**
 * Experiment Detail API Routes
 * 
 * GET    /api/experiments/[id] - Get experiment details with metrics
 * PATCH  /api/experiments/[id] - Update experiment status and final metrics
 * DELETE /api/experiments/[id] - Delete an experiment (admin only)
 * 
 * Authentication:
 * - API key for Colab requests (X-API-Key header)
 * - Session-based for dashboard requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { 
  getExperimentById, 
  getExperimentWithMetrics,
  updateExperiment, 
  deleteExperiment 
} from '@/lib/db-utils';
import { validateApiKey, checkRateLimit } from '../auth';
import type { UpdateExperimentInput, ExperimentStatus } from '@/types/database';

// ============================================================================
// Validation Helpers
// ============================================================================

const VALID_STATUSES: ExperimentStatus[] = ['running', 'completed', 'failed', 'cancelled'];

function isValidStatus(status: string): status is ExperimentStatus {
  return VALID_STATUSES.includes(status as ExperimentStatus);
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function validateUpdateExperimentInput(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  const input = body as Record<string, unknown>;

  // Validate status if provided
  if (input.status !== undefined) {
    if (typeof input.status !== 'string' || !isValidStatus(input.status)) {
      return `status must be one of: ${VALID_STATUSES.join(', ')}`;
    }
  }

  // Validate numeric fields
  const numericFields = [
    'train_loss', 'train_accuracy', 'val_loss', 'val_accuracy',
    'test_accuracy', 'test_precision', 'test_recall', 'test_f1',
    'sharpe_ratio', 'max_drawdown', 'training_duration_seconds', 'total_epochs'
  ];

  for (const field of numericFields) {
    if (input[field] !== undefined && input[field] !== null) {
      const value = parseFloat(input[field] as string);
      if (isNaN(value)) {
        return `${field} must be a valid number`;
      }
    }
  }

  // Validate accuracy/precision/recall/f1 ranges (0-1)
  const boundedFields = ['train_accuracy', 'val_accuracy', 'test_accuracy', 'test_precision', 'test_recall', 'test_f1'];
  for (const field of boundedFields) {
    if (input[field] !== undefined && input[field] !== null) {
      const value = parseFloat(input[field] as string);
      if (value < 0 || value > 1) {
        return `${field} must be between 0 and 1`;
      }
    }
  }

  // Validate completed_at if provided
  if (input.completed_at !== undefined && input.completed_at !== null) {
    const date = new Date(input.completed_at as string);
    if (isNaN(date.getTime())) {
      return 'completed_at must be a valid date';
    }
  }

  // Validate model_id if provided
  if (input.model_id !== undefined && input.model_id !== null) {
    if (typeof input.model_id !== 'string' || !isValidUUID(input.model_id)) {
      return 'model_id must be a valid UUID';
    }
  }

  return null;
}

// ============================================================================
// Authentication Helper
// ============================================================================

async function authenticateRequest(request: NextRequest): Promise<{
  authenticated: boolean;
  source: 'api_key' | 'session' | null;
  error?: string;
}> {
  const apiKey = request.headers.get('X-API-Key');
  if (apiKey) {
    const isValid = await validateApiKey(apiKey);
    if (isValid) {
      return { authenticated: true, source: 'api_key' };
    }
    return { authenticated: false, source: null, error: 'Invalid API key' };
  }

  const session = await getServerSession();
  if (session) {
    return { authenticated: true, source: 'session' };
  }

  return { authenticated: false, source: null, error: 'Unauthorized' };
}

// ============================================================================
// Route Params Type
// ============================================================================

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ============================================================================
// GET - Get Experiment Details
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    // Validate ID format
    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid experiment ID format' },
        { status: 400 }
      );
    }

    // Authenticate request
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check rate limit
    const clientId = request.headers.get('X-API-Key') || 'session';
    const rateLimitResult = await checkRateLimit(clientId, 'list');
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter 
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.retryAfter || 60),
          }
        }
      );
    }

    // Check if metrics should be included
    const { searchParams } = new URL(request.url);
    const includeMetrics = searchParams.get('include_metrics') !== 'false';

    let result;
    if (includeMetrics) {
      result = await getExperimentWithMetrics(id);
      if (!result) {
        return NextResponse.json(
          { error: 'Experiment not found' },
          { status: 404 }
        );
      }
    } else {
      const experiment = await getExperimentById(id);
      if (!experiment) {
        return NextResponse.json(
          { error: 'Experiment not found' },
          { status: 404 }
        );
      }
      result = { experiment, metrics: [] };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching experiment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch experiment' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH - Update Experiment
// ============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    // Validate ID format
    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid experiment ID format' },
        { status: 400 }
      );
    }

    // Authenticate request
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check rate limit
    const clientId = request.headers.get('X-API-Key') || 'session';
    const rateLimitResult = await checkRateLimit(clientId, 'update');
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter 
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.retryAfter || 60),
          }
        }
      );
    }

    // Check if experiment exists
    const existing = await getExperimentById(id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Experiment not found' },
        { status: 404 }
      );
    }

    const body = await request.json();

    // Validate input
    const validationError = validateUpdateExperimentInput(body);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    // Prepare update input
    const input: UpdateExperimentInput = {};

    if (body.name !== undefined) input.name = body.name;
    if (body.status !== undefined) input.status = body.status;
    if (body.train_loss !== undefined) input.train_loss = parseFloat(body.train_loss);
    if (body.train_accuracy !== undefined) input.train_accuracy = parseFloat(body.train_accuracy);
    if (body.val_loss !== undefined) input.val_loss = parseFloat(body.val_loss);
    if (body.val_accuracy !== undefined) input.val_accuracy = parseFloat(body.val_accuracy);
    if (body.test_accuracy !== undefined) input.test_accuracy = parseFloat(body.test_accuracy);
    if (body.test_precision !== undefined) input.test_precision = parseFloat(body.test_precision);
    if (body.test_recall !== undefined) input.test_recall = parseFloat(body.test_recall);
    if (body.test_f1 !== undefined) input.test_f1 = parseFloat(body.test_f1);
    if (body.sharpe_ratio !== undefined) input.sharpe_ratio = parseFloat(body.sharpe_ratio);
    if (body.max_drawdown !== undefined) input.max_drawdown = parseFloat(body.max_drawdown);
    if (body.training_duration_seconds !== undefined) input.training_duration_seconds = parseInt(body.training_duration_seconds, 10);
    if (body.total_epochs !== undefined) input.total_epochs = parseInt(body.total_epochs, 10);
    if (body.completed_at !== undefined) input.completed_at = new Date(body.completed_at);
    if (body.wandb_run_id !== undefined) input.wandb_run_id = body.wandb_run_id;
    if (body.model_id !== undefined) input.model_id = body.model_id;

    // Auto-set completed_at if status is being set to completed/failed/cancelled
    if (input.status && ['completed', 'failed', 'cancelled'].includes(input.status) && !input.completed_at) {
      input.completed_at = new Date();
    }

    const updated = await updateExperiment(id, input);

    if (!updated) {
      return NextResponse.json(
        { error: 'Failed to update experiment' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      experiment: updated,
    });
  } catch (error) {
    console.error('Error updating experiment:', error);
    return NextResponse.json(
      { error: 'Failed to update experiment' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Delete Experiment (Admin only)
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    // Validate ID format
    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid experiment ID format' },
        { status: 400 }
      );
    }

    // Only session-based auth allowed for delete (admin operation)
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    // Check if experiment exists
    const existing = await getExperimentById(id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Experiment not found' },
        { status: 404 }
      );
    }

    // Delete experiment (cascades to metrics)
    const deleted = await deleteExperiment(id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Failed to delete experiment' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Experiment deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting experiment:', error);
    return NextResponse.json(
      { error: 'Failed to delete experiment' },
      { status: 500 }
    );
  }
}
