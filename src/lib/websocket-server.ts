/**
 * WebSocket Server for Model Performance Tracking
 * 
 * This server runs separately from Next.js and handles real-time
 * communication between the AWS VM (model server) and web clients.
 * 
 * Run with: npx ts-node --esm src/lib/websocket-server.ts
 * Or add to package.json scripts: "ws:server": "ts-node --esm src/lib/websocket-server.ts"
 */

import { WebSocketServer, WebSocket, RawData } from 'ws';
import { createServer, IncomingMessage } from 'http';
import {
  WebSocketMessage,
  ConnectionMessage,
  HeartbeatMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  AckMessage,
  SubscriptionChannel,
  createMessage,
  parseMessage,
  serializeMessage,
  isValidMessage,
} from '@/types/websocket';

// ============================================================================
// Types
// ============================================================================

interface ClientInfo {
  id: string;
  socket: WebSocket;
  subscriptions: Set<SubscriptionChannel>;
  lastHeartbeat: number;
  connectedAt: number;
  metadata?: Record<string, unknown>;
}

interface ServerConfig {
  port: number;
  host: string;
  heartbeatInterval: number;
  clientTimeout: number;
  maxClients: number;
  authRequired: boolean;
  authToken?: string;
}

// ============================================================================
// WebSocket Server Class
// ============================================================================

export class ModelWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientInfo> = new Map();
  private config: ServerConfig;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = {
      port: config.port ?? parseInt(process.env.WS_PORT || '3001', 10),
      host: config.host ?? '0.0.0.0',
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      clientTimeout: config.clientTimeout ?? 60000,
      maxClients: config.maxClients ?? 1000,
      authRequired: config.authRequired ?? false,
      authToken: config.authToken ?? process.env.WS_AUTH_TOKEN,
    };
  }

  /**
   * Start the WebSocket server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        resolve();
        return;
      }

      const server = createServer((req, res) => {
        // Health check endpoint
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            clients: this.clients.size,
            uptime: process.uptime(),
          }));
          return;
        }

        res.writeHead(404);
        res.end('Not Found');
      });

      this.wss = new WebSocketServer({ server });

      this.wss.on('connection', (socket, request) => {
        this.handleConnection(socket, request);
      });

      this.wss.on('error', (error) => {
        console.error('[WS Server] Error:', error);
      });

      server.listen(this.config.port, this.config.host, () => {
        this.isRunning = true;
        this.startHeartbeatCheck();
        console.log(`[WS Server] Running on ws://${this.config.host}:${this.config.port}`);
        resolve();
      });

      server.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Stop the WebSocket server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isRunning) {
        resolve();
        return;
      }

      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }

      // Close all client connections
      for (const client of this.clients.values()) {
        client.socket.close(1001, 'Server shutting down');
      }
      this.clients.clear();

      if (this.wss) {
        this.wss.close(() => {
          this.isRunning = false;
          console.log('[WS Server] Stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle new client connection
   */
  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    // Check max clients
    if (this.clients.size >= this.config.maxClients) {
      socket.close(1013, 'Server at capacity');
      return;
    }

    // Authentication check
    if (this.config.authRequired) {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const token = url.searchParams.get('token');
      
      if (token !== this.config.authToken) {
        socket.close(4001, 'Unauthorized');
        return;
      }
    }

    const clientId = this.generateClientId();
    const clientInfo: ClientInfo = {
      id: clientId,
      socket,
      subscriptions: new Set(),
      lastHeartbeat: Date.now(),
      connectedAt: Date.now(),
    };

    this.clients.set(clientId, clientInfo);
    console.log(`[WS Server] Client connected: ${clientId} (total: ${this.clients.size})`);

    // Send connection confirmation
    const connectionMsg = createMessage<ConnectionMessage>('connection', {
      status: 'connected',
      clientId,
      serverTime: Date.now(),
      capabilities: ['models', 'trades', 'performance', 'alerts'],
    });
    socket.send(serializeMessage(connectionMsg));

    // Handle messages
    socket.on('message', (data) => {
      this.handleMessage(clientId, data);
    });

    // Handle close
    socket.on('close', (code, reason) => {
      this.clients.delete(clientId);
      console.log(`[WS Server] Client disconnected: ${clientId} (code: ${code})`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`[WS Server] Client error (${clientId}):`, error);
    });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(clientId: string, data: RawData): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const message = parseMessage(data.toString());
    if (!message) {
      console.warn(`[WS Server] Invalid message from ${clientId}`);
      return;
    }

    switch (message.type) {
      case 'heartbeat':
        this.handleHeartbeat(client, message as HeartbeatMessage);
        break;

      case 'subscribe':
        this.handleSubscribe(client, message as SubscribeMessage);
        break;

      case 'unsubscribe':
        this.handleUnsubscribe(client, message as UnsubscribeMessage);
        break;

      default:
        console.log(`[WS Server] Unknown message type from ${clientId}: ${message.type}`);
    }
  }

  /**
   * Handle heartbeat message
   */
  private handleHeartbeat(client: ClientInfo, message: HeartbeatMessage): void {
    client.lastHeartbeat = Date.now();

    const response = createMessage<HeartbeatMessage>('heartbeat', {
      clientTime: message.payload.clientTime,
      serverTime: Date.now(),
      latency: Date.now() - message.payload.clientTime,
    });

    client.socket.send(serializeMessage(response));
  }

  /**
   * Handle subscribe message
   */
  private handleSubscribe(client: ClientInfo, message: SubscribeMessage): void {
    for (const channel of message.payload.channels) {
      client.subscriptions.add(channel);
    }

    const ack = createMessage<AckMessage>('ack', {
      originalMessageId: message.id,
      success: true,
    });

    client.socket.send(serializeMessage(ack));
    console.log(`[WS Server] Client ${client.id} subscribed to:`, message.payload.channels);
  }

  /**
   * Handle unsubscribe message
   */
  private handleUnsubscribe(client: ClientInfo, message: UnsubscribeMessage): void {
    for (const channel of message.payload.channels) {
      client.subscriptions.delete(channel);
    }

    const ack = createMessage<AckMessage>('ack', {
      originalMessageId: message.id,
      success: true,
    });

    client.socket.send(serializeMessage(ack));
  }

  /**
   * Broadcast message to all clients subscribed to a channel
   */
  broadcast(channel: SubscriptionChannel, message: WebSocketMessage): number {
    let sent = 0;

    for (const client of this.clients.values()) {
      if (this.isSubscribed(client, channel)) {
        if (client.socket.readyState === WebSocket.OPEN) {
          client.socket.send(serializeMessage(message));
          sent++;
        }
      }
    }

    return sent;
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId: string, message: WebSocketMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    client.socket.send(serializeMessage(message));
    return true;
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcastAll(message: WebSocketMessage): number {
    let sent = 0;

    for (const client of this.clients.values()) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(serializeMessage(message));
        sent++;
      }
    }

    return sent;
  }

  /**
   * Check if client is subscribed to a channel
   */
  private isSubscribed(client: ClientInfo, channel: SubscriptionChannel): boolean {
    // Direct subscription
    if (client.subscriptions.has(channel)) return true;

    // Check for wildcard subscriptions
    if (channel.startsWith('model:') && client.subscriptions.has('models')) {
      return true;
    }
    if (channel.startsWith('trade:') && client.subscriptions.has('trades')) {
      return true;
    }

    return false;
  }

  /**
   * Start heartbeat check interval
   */
  private startHeartbeatCheck(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeout = this.config.clientTimeout;

      for (const [clientId, client] of this.clients) {
        if (now - client.lastHeartbeat > timeout) {
          console.log(`[WS Server] Client ${clientId} timed out`);
          client.socket.close(4000, 'Heartbeat timeout');
          this.clients.delete(clientId);
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      clientCount: this.clients.size,
      maxClients: this.config.maxClients,
      port: this.config.port,
      clients: Array.from(this.clients.values()).map((c) => ({
        id: c.id,
        connectedAt: c.connectedAt,
        lastHeartbeat: c.lastHeartbeat,
        subscriptions: Array.from(c.subscriptions),
      })),
    };
  }
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
