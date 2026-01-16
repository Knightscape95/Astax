/**
 * DEPRECATED - Standalone WebSocket server removed for Vercel compatibility
 * ----------------------------------------------------------------------
 * This repository uses Server-Sent Events (SSE) via `/api/ws` for real-time
 * updates which is compatible with Vercel Serverless functions. If you need
 * a full WebSocket server, host it externally (Railway, Render, EC2, etc.) and
 * set the following in your environment:
 *
 *   NEXT_PUBLIC_WS_TRANSPORT=ws
 *   NEXT_PUBLIC_WS_URL=ws://your-external-ws:port
 *
 * The original WebSocket server has been removed from this codebase. See
 * project documentation for instructions to host it separately.
 */

export function startStandaloneWebSocketServer(): never {
  throw new Error('Standalone WebSocket server removed. Host externally and set NEXT_PUBLIC_WS_TRANSPORT=ws and NEXT_PUBLIC_WS_URL accordingly.');
}

// ============================================================================
// Singleton Instance & Exports
// ============================================================================

let serverInstance: ModelWebSocketServer | null = null;

export function getWebSocketServer(config?: Partial<ServerConfig>): ModelWebSocketServer {
  if (!serverInstance) {
    serverInstance = new ModelWebSocketServer(config);
  }
  return serverInstance;
}

// Run if executed directly
if (require.main === module) {
  const server = getWebSocketServer();
  
  server.start().then(() => {
    console.log('[WS Server] Ready to accept connections');
  }).catch((error) => {
    console.error('[WS Server] Failed to start:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[WS Server] Shutting down...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
}

export default ModelWebSocketServer;
