/**
 * WebSocket API Route Handler
 * 
 * Note: Next.js App Router does not natively support WebSocket connections
 * in route handlers because they use HTTP request/response cycles.
 * 
 * This route provides:
 * 1. Server-Sent Events (SSE) as an alternative for server-to-client streaming
 * 2. API endpoints for the external WebSocket server
 * 
 * For full WebSocket support, use the separate WebSocket server at:
 * src/lib/websocket-server.ts
 */

import { NextRequest, NextResponse } from 'next/server';

// Store for SSE connections (in production, use Redis or similar)
const sseClients = new Map<string, ReadableStreamDefaultController>();

/**
 * Get CORS headers based on environment configuration
 */
function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [];
  const awsVmOrigin = process.env.AWS_VM_ORIGIN || '';
  
  // Add AWS VM origin to allowed origins if configured
  if (awsVmOrigin && !allowedOrigins.includes(awsVmOrigin)) {
    allowedOrigins.push(awsVmOrigin);
  }

  // Check if origin is allowed (allow all if no origins configured)
  const isAllowed = allowedOrigins.length === 0 || 
    allowedOrigins.includes(origin) || 
    allowedOrigins.includes('*');

  const allowOrigin = isAllowed ? (origin || '*') : '';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * OPTIONS - CORS preflight handler
 */
export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

/**
 * GET - Server-Sent Events endpoint for real-time updates
 * 
 * Usage from client:
 * const eventSource = new EventSource('/api/ws');
 * eventSource.onmessage = (event) => console.log(JSON.parse(event.data));
 */
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId') || 
    `sse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const corsHeaders = getCorsHeaders(request);


  const stream = new ReadableStream({
    start(controller) {
      // Store controller for broadcasting
      sseClients.set(clientId, controller);

      // Send initial connection message
      const connectionMessage = JSON.stringify({
        type: 'connection',
        payload: {
          status: 'connected',
          clientId,
          serverTime: Date.now(),
          transport: 'sse',
        },
      });
      controller.enqueue(`data: ${connectionMessage}\n\n`);

      // Heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          const heartbeat = JSON.stringify({
            type: 'heartbeat',
            payload: { serverTime: Date.now() },
          });
          controller.enqueue(`data: ${heartbeat}\n\n`);
        } catch {
          clearInterval(heartbeatInterval);
          sseClients.delete(clientId);
        }
      }, 30000);

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval);
        sseClients.delete(clientId);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
    cancel() {
      sseClients.delete(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * POST - Broadcast message to all SSE clients
 * 
 * Used by the AWS VM or internal services to push updates
 * Requires API key authentication
 */
export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request);

  // Verify API key
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const body = await request.json();
    const { channel, message } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Broadcast to all SSE clients
    const messageStr = JSON.stringify(message);
    let sent = 0;

    for (const [clientId, controller] of sseClients) {
      try {
        controller.enqueue(`data: ${messageStr}\n\n`);
        sent++;
      } catch (error) {
        // Client disconnected
        sseClients.delete(clientId);
      }
    }

    return NextResponse.json({
      success: true,
      clientsNotified: sent,
      timestamp: Date.now(),
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('[SSE] Broadcast error:', error);
    return NextResponse.json(
      { error: 'Failed to broadcast message' },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * Helper function to broadcast from other API routes
 */
export function broadcastSSE(message: object): number {
  const messageStr = JSON.stringify(message);
  let sent = 0;

  for (const [clientId, controller] of sseClients) {
    try {
      controller.enqueue(`data: ${messageStr}\n\n`);
      sent++;
    } catch {
      sseClients.delete(clientId);
    }
  }

  return sent;
}

/**
 * Get current SSE client count
 */
export function getSSEClientCount(): number {
  return sseClients.size;
}
