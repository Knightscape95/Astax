/**
 * Health Check Endpoint
 *
 * Provides system health status for monitoring and deployment verification.
 * Used by:
 * - Vercel deployment checks
 * - AWS VM connectivity verification
 * - External monitoring services (UptimeRobot, Pingdom, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: CheckResult;
    environment: CheckResult;
  };
}

interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  latency?: number;
}

// Track server start time for uptime calculation
const serverStartTime = Date.now();

/**
 * GET /api/health
 *
 * Returns health status of the application and its dependencies
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Check for detailed health info (requires API key for security)
  const detailed =
    request.nextUrl.searchParams.get('detailed') === 'true' &&
    request.headers.get('x-api-key') === process.env.INTERNAL_API_KEY;

  const checks = {
    database: await checkDatabase(),
    environment: checkEnvironment(),
  };

  // Determine overall status
  const hasFailure = Object.values(checks).some((c) => c.status === 'fail');
  const hasWarning = Object.values(checks).some((c) => c.status === 'warn');

  const overallStatus: HealthCheckResult['status'] = hasFailure
    ? 'unhealthy'
    : hasWarning
      ? 'degraded'
      : 'healthy';

  const response: HealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    checks: detailed
      ? checks
      : {
          database: { status: checks.database.status, message: checks.database.status },
          environment: { status: checks.environment.status, message: checks.environment.status },
        },
  };

  // Set appropriate HTTP status code
  const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;

  return NextResponse.json(response, {
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': 'application/json',
    },
  });
}

/**
 * HEAD /api/health
 *
 * Simple ping endpoint for basic availability checks
 */
export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

/**
 * OPTIONS /api/health
 *
 * CORS preflight handler
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Check database connectivity and response time
 */
async function checkDatabase(): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    // Simple query to verify database connectivity
    await sql`SELECT 1 as health_check`;
    const latency = Date.now() - startTime;

    // Warn if database response is slow (>500ms)
    if (latency > 500) {
      return {
        status: 'warn',
        message: 'Database responding slowly',
        latency,
      };
    }

    return {
      status: 'pass',
      message: 'Database connected',
      latency,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      status: 'fail',
      message: `Database connection failed: ${errorMessage}`,
      latency: Date.now() - startTime,
    };
  }
}

/**
 * Check required environment variables
 */
function checkEnvironment(): CheckResult {
  const requiredVars = [
    'POSTGRES_URL',
    'NEXTAUTH_SECRET',
    'NEXTAUTH_URL',
  ];

  const optionalVars = [
    'AWS_VM_URL',
    'INTERNAL_API_KEY',
  ];

  const missingRequired = requiredVars.filter((v) => !process.env[v]);
  const missingOptional = optionalVars.filter((v) => !process.env[v]);

  if (missingRequired.length > 0) {
    return {
      status: 'fail',
      message: `Missing required env vars: ${missingRequired.join(', ')}`,
    };
  }

  if (missingOptional.length > 0) {
    return {
      status: 'warn',
      message: `Missing optional env vars: ${missingOptional.join(', ')}`,
    };
  }

  return {
    status: 'pass',
    message: 'All environment variables configured',
  };
}
