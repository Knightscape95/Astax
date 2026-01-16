/**
 * Experiment Metrics API Routes
 * 
 * POST /api/experiments/[id]/metrics - Log epoch metrics (batch insert)
 * GET  /api/experiments/[id]/metrics - Get all metrics for an experiment
 * 
 * Authentication:
 * - API key for Colab requests (X-API-Key header)
 * - Session-based for dashboard requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { 
  getExperimentById,
  getExperimentMetrics,
  createExperimentMetric,
  createExperimentMetricsBatch
} from '@/lib/db-utils';
import { validateApiKey, checkRateLimit } from '../../auth';
import type { CreateExperimentMetricInput } from '@/types/database';

// ============================================================================
// Validation Helpers
// ============================================================================

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

interface MetricInput {
  epoch: number;
  train_loss: number;
  train_accuracy?: number;
  val_loss?: number;
  val_accuracy?: number;
  learning_rate?: number;
  gpu_memory_used_mb?: number;
  training_time_seconds?: number;
}

function validateMetricInput(input: unknown, index?: number): string | null {
  const prefix = index !== undefined ? `metrics[${index}].` : '';

  if (!input || typeof input !== 'object') {
    return `${prefix}metric must be an object`;
  }

  const metric = input as Record<string, unknown>;

  // Required fields
  if (metric.epoch === undefined || metric.epoch === null) {
    return `${prefix}epoch is required`;
  }

  const epoch = parseInt(metric.epoch as string, 10);
  if (isNaN(epoch) || epoch < 0) {
    return `${prefix}epoch must be a non-negative integer`;
  }

  if (metric.train_loss === undefined || metric.train_loss === null) {
    return `${prefix}train_loss is required`;
  }

  const trainLoss = parseFloat(metric.train_loss as string);
  if (isNaN(trainLoss)) {
    return `${prefix}train_loss must be a valid number`;
  }

  // Optional numeric fields
  const optionalNumericFields = [
    'train_accuracy', 'val_loss', 'val_accuracy', 
    'learning_rate', 'gpu_memory_used_mb', 'training_time_seconds'
  ];

  for (const field of optionalNumericFields) {
    if (metric[field] !== undefined && metric[field] !== null) {
      const value = parseFloat(metric[field] as string);
      if (isNaN(value)) {
        return `${prefix}${field} must be a valid number`;
      }
    }
  }

  // Validate accuracy ranges (0-1)
  const accuracyFields = ['train_accuracy', 'val_accuracy'];
  for (const field of accuracyFields) {
    if (metric[field] !== undefined && metric[field] !== null) {
      const value = parseFloat(metric[field] as string);
      if (value < 0 || value > 1) {
        return `${prefix}${field} must be between 0 and 1`;
      }
    }
  }

  return null;
}

function parseMetricInput(input: Record<string, unknown>, experimentId: string): CreateExperimentMetricInput {
  return {
    experiment_id: experimentId,
    epoch: parseInt(input.epoch as string, 10),
    train_loss: parseFloat(input.train_loss as string),
    train_accuracy: input.train_accuracy !== undefined ? parseFloat(input.train_accuracy as string) : undefined,
    val_loss: input.val_loss !== undefined ? parseFloat(input.val_loss as string) : undefined,
    val_accuracy: input.val_accuracy !== undefined ? parseFloat(input.val_accuracy as string) : undefined,
    learning_rate: input.learning_rate !== undefined ? parseFloat(input.learning_rate as string) : undefined,
    gpu_memory_used_mb: input.gpu_memory_used_mb !== undefined ? parseInt(input.gpu_memory_used_mb as string, 10) : undefined,
    training_time_seconds: input.training_time_seconds !== undefined ? parseFloat(input.training_time_seconds as string) : undefined,
  };
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
// GET - Get Experiment Metrics
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

    // Check if experiment exists
    const experiment = await getExperimentById(id);
    if (!experiment) {
      return NextResponse.json(
        { error: 'Experiment not found' },
        { status: 404 }
      );
    }

    // Get metrics
    const metrics = await getExperimentMetrics(id);

    return NextResponse.json({
      experiment_id: id,
      metrics,
      total: metrics.length,
    });
  } catch (error) {
    console.error('Error fetching experiment metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch experiment metrics' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - Log Epoch Metrics (Batch Insert)
// ============================================================================

export async function POST(
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
    const rateLimitResult = await checkRateLimit(clientId, 'metrics');
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
    const experiment = await getExperimentById(id);
    if (!experiment) {
      return NextResponse.json(
        { error: 'Experiment not found' },
        { status: 404 }
      );
    }

    // Check if experiment is in a state that accepts metrics
    if (experiment.status !== 'running') {
      return NextResponse.json(
        { 
          error: `Cannot add metrics to experiment with status '${experiment.status}'`,
          hint: 'Only experiments with status "running" can receive new metrics'
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Support both single metric and batch of metrics
    const isBatch = Array.isArray(body.metrics);
    const metricsInput = isBatch ? body.metrics : [body];

    // Validate batch size
    const MAX_BATCH_SIZE = 1000;
    if (metricsInput.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { 
          error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} metrics`,
          received: metricsInput.length 
        },
        { status: 400 }
      );
    }

    // Validate all metrics
    for (let i = 0; i < metricsInput.length; i++) {
      const validationError = validateMetricInput(metricsInput[i], isBatch ? i : undefined);
      if (validationError) {
        return NextResponse.json(
          { error: validationError },
          { status: 400 }
        );
      }
    }

    // Parse and prepare metrics
    const parsedMetrics: CreateExperimentMetricInput[] = metricsInput.map(
      (m: Record<string, unknown>) => parseMetricInput(m, id)
    );

    // Insert metrics
    let insertedMetrics;
    if (parsedMetrics.length === 1) {
      // Single metric - use simple insert
      const metric = await createExperimentMetric(parsedMetrics[0]);
      insertedMetrics = [metric];
    } else {
      // Batch insert
      insertedMetrics = await createExperimentMetricsBatch(parsedMetrics);
    }

    return NextResponse.json({
      success: true,
      experiment_id: id,
      inserted: insertedMetrics.length,
      metrics: insertedMetrics,
    }, { status: 201 });
  } catch (error) {
    console.error('Error logging experiment metrics:', error);
    
    // Check for constraint violation (e.g., experiment doesn't exist)
    if (error instanceof Error && error.message.includes('violates foreign key constraint')) {
      return NextResponse.json(
        { error: 'Invalid experiment_id reference' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to log experiment metrics' },
      { status: 500 }
    );
  }
}
