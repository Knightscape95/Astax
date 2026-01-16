'use client';

// WebSocketProvider supports both WebSocket and Server-Sent Events (SSE).
// For Vercel deployments SSE is the recommended default transport (configure
// `NEXT_PUBLIC_WS_TRANSPORT` to override).

import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useReducer,
  useEffect,
  ReactNode,
} from 'react';
import {
  WebSocketState,
  WebSocketMessage,
  IncomingMessage,
  OutgoingMessage,
  SubscriptionChannel,
  ConnectionState,
  TradeSignalMessage,
  TradeExecutionMessage,
  TradeClosedMessage,
  ModelUpdateMessage,
  PerformanceUpdateMessage,
  MetricsSnapshotMessage,
  AlertMessage,
} from '@/types/websocket';
import { useWebSocket, UseWebSocketOptions } from '@/hooks/useWebSocket';

// ============================================================================
// Types
// ============================================================================

interface WebSocketContextState extends WebSocketState {
  // Cached data from messages
  latestSignals: Map<string, TradeSignalMessage>;
  openTrades: Map<string, TradeExecutionMessage>;
  recentAlerts: AlertMessage[];
  modelMetrics: Map<string, MetricsSnapshotMessage>;
  
  // Connection metrics
  messagesReceived: number;
  messagesSent: number;
  connectionUptime: number;
}

interface WebSocketContextValue {
  state: WebSocketContextState;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  send: (message: OutgoingMessage) => boolean;
  subscribe: (channels: SubscriptionChannel[]) => void;
  unsubscribe: (channels: SubscriptionChannel[]) => void;
  clearAlerts: () => void;
}

type WebSocketAction =
  | { type: 'SET_CONNECTION_STATE'; payload: ConnectionState }
  | { type: 'SET_STATE'; payload: Partial<WebSocketState> }
  | { type: 'SIGNAL_RECEIVED'; payload: TradeSignalMessage }
  | { type: 'TRADE_OPENED'; payload: TradeExecutionMessage }
  | { type: 'TRADE_CLOSED'; payload: TradeClosedMessage }
  | { type: 'MODEL_UPDATED'; payload: ModelUpdateMessage }
  | { type: 'METRICS_UPDATED'; payload: MetricsSnapshotMessage }
  | { type: 'ALERT_RECEIVED'; payload: AlertMessage }
  | { type: 'CLEAR_ALERTS' }
  | { type: 'MESSAGE_RECEIVED' }
  | { type: 'MESSAGE_SENT' }
  | { type: 'RESET' };

// ============================================================================
// Initial State & Reducer
// ============================================================================

const initialState: WebSocketContextState = {
  connectionState: 'disconnected',
  clientId: null,
  lastHeartbeat: null,
  latency: null,
  reconnectAttempts: 0,
  subscriptions: [],
  error: null,
  latestSignals: new Map(),
  openTrades: new Map(),
  recentAlerts: [],
  modelMetrics: new Map(),
  messagesReceived: 0,
  messagesSent: 0,
  connectionUptime: 0,
};

function websocketReducer(
  state: WebSocketContextState,
  action: WebSocketAction
): WebSocketContextState {
  switch (action.type) {
    case 'SET_CONNECTION_STATE':
      return {
        ...state,
        connectionState: action.payload,
        connectionUptime: action.payload === 'connected' ? Date.now() : state.connectionUptime,
      };

    case 'SET_STATE':
      return { ...state, ...action.payload };

    case 'SIGNAL_RECEIVED': {
      const newSignals = new Map(state.latestSignals);
      newSignals.set(action.payload.payload.signalId, action.payload);
      
      // Keep only last 100 signals
      if (newSignals.size > 100) {
        const keys = Array.from(newSignals.keys());
        for (let i = 0; i < keys.length - 100; i++) {
          newSignals.delete(keys[i]);
        }
      }
      
      return { ...state, latestSignals: newSignals };
    }

    case 'TRADE_OPENED': {
      const newTrades = new Map(state.openTrades);
      newTrades.set(action.payload.payload.tradeId, action.payload);
      return { ...state, openTrades: newTrades };
    }

    case 'TRADE_CLOSED': {
      const newTrades = new Map(state.openTrades);
      newTrades.delete(action.payload.payload.tradeId);
      return { ...state, openTrades: newTrades };
    }

    case 'MODEL_UPDATED':
      // Model updates are handled by UI components
      return state;

    case 'METRICS_UPDATED': {
      const newMetrics = new Map(state.modelMetrics);
      newMetrics.set(action.payload.payload.modelId, action.payload);
      return { ...state, modelMetrics: newMetrics };
    }

    case 'ALERT_RECEIVED': {
      const newAlerts = [action.payload, ...state.recentAlerts].slice(0, 50);
      return { ...state, recentAlerts: newAlerts };
    }

    case 'CLEAR_ALERTS':
      return { ...state, recentAlerts: [] };

    case 'MESSAGE_RECEIVED':
      return { ...state, messagesReceived: state.messagesReceived + 1 };

    case 'MESSAGE_SENT':
      return { ...state, messagesSent: state.messagesSent + 1 };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// ============================================================================
// Context
// ============================================================================

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

interface WebSocketProviderProps {
  children: ReactNode;
  config?: UseWebSocketOptions;
  autoConnect?: boolean;
}

export function WebSocketProvider({
  children,
  config = {},
  autoConnect = true,
}: WebSocketProviderProps) {
  const [state, dispatch] = useReducer(websocketReducer, initialState);

  // Message handler
  const handleMessage = useCallback((message: IncomingMessage) => {
    dispatch({ type: 'MESSAGE_RECEIVED' });

    switch (message.type) {
      case 'trade_signal':
        dispatch({ type: 'SIGNAL_RECEIVED', payload: message as TradeSignalMessage });
        break;

      case 'trade_execution':
        dispatch({ type: 'TRADE_OPENED', payload: message as TradeExecutionMessage });
        break;

      case 'trade_closed':
        dispatch({ type: 'TRADE_CLOSED', payload: message as TradeClosedMessage });
        break;

      case 'model_update':
        dispatch({ type: 'MODEL_UPDATED', payload: message as ModelUpdateMessage });
        break;

      case 'metrics_snapshot':
        dispatch({ type: 'METRICS_UPDATED', payload: message as MetricsSnapshotMessage });
        break;

      case 'alert':
        dispatch({ type: 'ALERT_RECEIVED', payload: message as AlertMessage });
        break;
    }

    // Call user-provided handler
    config.onMessage?.(message);
  }, [config.onMessage]);

  // State change handler
  const handleStateChange = useCallback((wsState: WebSocketState) => {
    dispatch({ type: 'SET_STATE', payload: wsState });
    config.onStateChange?.(wsState);
  }, [config.onStateChange]);

  // Initialize WebSocket hook
  const ws = useWebSocket({
    ...config,
    onMessage: handleMessage,
    onStateChange: handleStateChange,
    autoConnect,
  });

  // Wrap send to track messages
  const send = useCallback((message: OutgoingMessage): boolean => {
    const result = ws.send(message);
    if (result) {
      dispatch({ type: 'MESSAGE_SENT' });
    }
    return result;
  }, [ws.send]);

  // Clear alerts action
  const clearAlerts = useCallback(() => {
    dispatch({ type: 'CLEAR_ALERTS' });
  }, []);

  // Memoized context value
  const contextValue = useMemo<WebSocketContextValue>(() => ({
    state,
    isConnected: ws.isConnected,
    connect: ws.connect,
    disconnect: ws.disconnect,
    send,
    subscribe: ws.subscribe,
    unsubscribe: ws.unsubscribe,
    clearAlerts,
  }), [
    state,
    ws.isConnected,
    ws.connect,
    ws.disconnect,
    send,
    ws.subscribe,
    ws.unsubscribe,
    clearAlerts,
  ]);

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Main hook to access WebSocket context
 */
export function useWebSocketContext(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}

/**
 * Hook for connection state only
 */
export function useConnectionState(): {
  connectionState: ConnectionState;
  isConnected: boolean;
  latency: number | null;
  reconnectAttempts: number;
} {
  const { state, isConnected } = useWebSocketContext();
  return {
    connectionState: state.connectionState,
    isConnected,
    latency: state.latency,
    reconnectAttempts: state.reconnectAttempts,
  };
}

/**
 * Hook for trade signals
 */
export function useTradeSignals(modelId?: string): TradeSignalMessage[] {
  const { state } = useWebSocketContext();
  
  return useMemo(() => {
    const signals = Array.from(state.latestSignals.values());
    if (modelId) {
      return signals.filter((s) => s.payload.modelId === modelId);
    }
    return signals;
  }, [state.latestSignals, modelId]);
}

/**
 * Hook for open trades
 */
export function useOpenTrades(modelId?: string): TradeExecutionMessage[] {
  const { state } = useWebSocketContext();
  
  return useMemo(() => {
    const trades = Array.from(state.openTrades.values());
    if (modelId) {
      return trades.filter((t) => t.payload.modelId === modelId);
    }
    return trades;
  }, [state.openTrades, modelId]);
}

/**
 * Hook for alerts
 */
export function useAlerts(severity?: AlertMessage['payload']['severity']): AlertMessage[] {
  const { state } = useWebSocketContext();
  
  return useMemo(() => {
    if (severity) {
      return state.recentAlerts.filter((a) => a.payload.severity === severity);
    }
    return state.recentAlerts;
  }, [state.recentAlerts, severity]);
}

/**
 * Hook for model metrics
 */
export function useModelMetrics(modelId: string): MetricsSnapshotMessage | undefined {
  const { state } = useWebSocketContext();
  return state.modelMetrics.get(modelId);
}

/**
 * Hook for subscribing to channels on mount
 */
export function useSubscription(channels: SubscriptionChannel[]): void {
  const { subscribe, unsubscribe, isConnected } = useWebSocketContext();

  useEffect(() => {
    if (isConnected && channels.length > 0) {
      subscribe(channels);
      return () => {
        unsubscribe(channels);
      };
    }
  }, [isConnected, channels.join(',')]);
}

export default WebSocketProvider;
