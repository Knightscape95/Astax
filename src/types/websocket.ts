/**
 * WebSocket Message Protocol Types
 * 
 * Defines the message format for real-time communication between
 * AWS VM (model server) and Next.js application.
 */

import type {
  Model,
  Trade,
  PerformanceMetric,
  ModelUpdate,
  ModelStatus,
  TradeDirection,
  TradeStatus,
} from './database';

// ============================================================================
// Base Message Types
// ============================================================================

export type MessageType =
  | 'connection'
  | 'heartbeat'
  | 'subscribe'
  | 'unsubscribe'
  | 'model_update'
  | 'trade_signal'
  | 'trade_execution'
  | 'trade_closed'
  | 'performance_update'
  | 'metrics_snapshot'
  | 'alert'
  | 'error'
  | 'ack';

export interface BaseMessage {
  id: string;
  type: MessageType;
  timestamp: number;
  version: string;
}

// ============================================================================
// Connection Messages
// ============================================================================

export interface ConnectionMessage extends BaseMessage {
  type: 'connection';
  payload: {
    status: 'connected' | 'disconnected' | 'reconnecting';
    clientId: string;
    serverTime: number;
    capabilities: string[];
  };
}

export interface HeartbeatMessage extends BaseMessage {
  type: 'heartbeat';
  payload: {
    clientTime: number;
    serverTime?: number;
    latency?: number;
  };
}

// ============================================================================
// Subscription Messages
// ============================================================================

export type SubscriptionChannel =
  | 'models'
  | 'trades'
  | 'performance'
  | 'alerts'
  | `model:${string}`
  | `trade:${string}`;

export interface SubscribeMessage extends BaseMessage {
  type: 'subscribe';
  payload: {
    channels: SubscriptionChannel[];
    filters?: Record<string, unknown>;
  };
}

export interface UnsubscribeMessage extends BaseMessage {
  type: 'unsubscribe';
  payload: {
    channels: SubscriptionChannel[];
  };
}

// ============================================================================
// Model Messages
// ============================================================================

export interface ModelUpdateMessage extends BaseMessage {
  type: 'model_update';
  payload: {
    modelId: string;
    updateType: 'status_change' | 'config_update' | 'retrain_started' | 'retrain_completed';
    previousStatus?: ModelStatus;
    newStatus?: ModelStatus;
    model?: Partial<Model>;
    metadata?: {
      triggeredBy?: string;
      reason?: string;
      estimatedCompletion?: number;
    };
  };
}

// ============================================================================
// Trade Messages
// ============================================================================

export interface TradeSignalMessage extends BaseMessage {
  type: 'trade_signal';
  payload: {
    signalId: string;
    modelId: string;
    symbol: string;
    direction: TradeDirection;
    confidence: number;
    entryPrice: number;
    stopLoss?: number;
    takeProfit?: number;
    reasoning?: string;
    features?: Record<string, number>;
    expiresAt?: number;
  };
}

export interface TradeExecutionMessage extends BaseMessage {
  type: 'trade_execution';
  payload: {
    tradeId: string;
    signalId?: string;
    modelId: string;
    symbol: string;
    direction: TradeDirection;
    entryPrice: number;
    quantity: number;
    fees: number;
    slippage?: number;
    executedAt: number;
    status: 'success' | 'partial' | 'failed';
    errorMessage?: string;
  };
}

export interface TradeClosedMessage extends BaseMessage {
  type: 'trade_closed';
  payload: {
    tradeId: string;
    modelId: string;
    symbol: string;
    direction: TradeDirection;
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    pnl: number;
    pnlPercentage: number;
    fees: number;
    holdingPeriodMs: number;
    closedAt: number;
    closeReason: 'take_profit' | 'stop_loss' | 'signal' | 'manual' | 'timeout';
  };
}

// ============================================================================
// Performance Messages
// ============================================================================

export interface PerformanceUpdateMessage extends BaseMessage {
  type: 'performance_update';
  payload: {
    modelId: string;
    metric: Partial<PerformanceMetric>;
    delta?: {
      pnlChange: number;
      tradesChange: number;
      winRateChange: number;
    };
  };
}

export interface MetricsSnapshotMessage extends BaseMessage {
  type: 'metrics_snapshot';
  payload: {
    modelId: string;
    timestamp: number;
    metrics: {
      totalPnl: number;
      totalTrades: number;
      openTrades: number;
      winRate: number;
      sharpeRatio: number | null;
      maxDrawdown: number;
      dailyPnl: number;
      weeklyPnl: number;
    };
    systemMetrics?: {
      cpuUsage: number;
      memoryUsage: number;
      latency: number;
      uptime: number;
    };
  };
}

// ============================================================================
// Alert Messages
// ============================================================================

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AlertCategory = 
  | 'performance'
  | 'risk'
  | 'system'
  | 'trade'
  | 'model'
  | 'connection';

export interface AlertMessage extends BaseMessage {
  type: 'alert';
  payload: {
    alertId: string;
    severity: AlertSeverity;
    category: AlertCategory;
    title: string;
    message: string;
    modelId?: string;
    tradeId?: string;
    data?: Record<string, unknown>;
    actionRequired?: boolean;
    acknowledgedAt?: number;
  };
}

// ============================================================================
// System Messages
// ============================================================================

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    details?: unknown;
    recoverable: boolean;
    retryAfter?: number;
  };
}

export interface AckMessage extends BaseMessage {
  type: 'ack';
  payload: {
    originalMessageId: string;
    success: boolean;
    error?: string;
  };
}

// ============================================================================
// Union Types
// ============================================================================

export type WebSocketMessage =
  | ConnectionMessage
  | HeartbeatMessage
  | SubscribeMessage
  | UnsubscribeMessage
  | ModelUpdateMessage
  | TradeSignalMessage
  | TradeExecutionMessage
  | TradeClosedMessage
  | PerformanceUpdateMessage
  | MetricsSnapshotMessage
  | AlertMessage
  | ErrorMessage
  | AckMessage;

export type IncomingMessage =
  | ConnectionMessage
  | HeartbeatMessage
  | ModelUpdateMessage
  | TradeSignalMessage
  | TradeExecutionMessage
  | TradeClosedMessage
  | PerformanceUpdateMessage
  | MetricsSnapshotMessage
  | AlertMessage
  | ErrorMessage
  | AckMessage;

export type OutgoingMessage =
  | HeartbeatMessage
  | SubscribeMessage
  | UnsubscribeMessage
  | AckMessage;

// ============================================================================
// WebSocket State Types
// ============================================================================

export type ConnectionState = 
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

export interface WebSocketState {
  connectionState: ConnectionState;
  clientId: string | null;
  lastHeartbeat: number | null;
  latency: number | null;
  reconnectAttempts: number;
  subscriptions: SubscriptionChannel[];
  error: Error | null;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface WebSocketConfig {
  url: string;
  transport?: 'sse' | 'ws';
  reconnect: boolean;
  reconnectInterval: number;
  reconnectMaxAttempts: number;
  heartbeatInterval: number;
  heartbeatTimeout: number;
  messageQueueSize: number;
  debug: boolean;
}

export const DEFAULT_WS_CONFIG: WebSocketConfig = {
  // Prefer Server-Sent Events (SSE) for Vercel compatibility. Override with
  // NEXT_PUBLIC_WS_TRANSPORT=ws and NEXT_PUBLIC_WS_URL to use a remote WS server.
  url: process.env.NEXT_PUBLIC_SSE_URL || '/api/ws',
  transport: (process.env.NEXT_PUBLIC_WS_TRANSPORT as 'sse' | 'ws') || 'sse',
  reconnect: true,
  reconnectInterval: 1000,
  reconnectMaxAttempts: 10,
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
  messageQueueSize: 1000,
  debug: process.env.NODE_ENV === 'development',
};

// ============================================================================
// Utility Functions
// ============================================================================

export function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createMessage<T extends WebSocketMessage>(
  type: T['type'],
  payload: T['payload']
): T {
  return {
    id: createMessageId(),
    type,
    timestamp: Date.now(),
    version: '1.0',
    payload,
  } as T;
}

export function isValidMessage(data: unknown): data is WebSocketMessage {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Partial<WebSocketMessage>;
  return (
    typeof msg.id === 'string' &&
    typeof msg.type === 'string' &&
    typeof msg.timestamp === 'number' &&
    typeof msg.version === 'string' &&
    typeof msg.payload === 'object'
  );
}

export function parseMessage(data: string | ArrayBuffer): WebSocketMessage | null {
  try {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    const parsed = JSON.parse(text);
    return isValidMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function serializeMessage(message: WebSocketMessage): string {
  return JSON.stringify(message);
}
