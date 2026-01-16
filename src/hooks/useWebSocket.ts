'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  WebSocketConfig,
  WebSocketState,
  WebSocketMessage,
  IncomingMessage,
  OutgoingMessage,
  ConnectionState,
  SubscriptionChannel,
  HeartbeatMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  DEFAULT_WS_CONFIG,
  createMessage,
  parseMessage,
  serializeMessage,
} from '@/types/websocket';
import { TypedMessageQueue } from '@/lib/message-queue';

// ============================================================================
// Types
// ============================================================================

export interface UseWebSocketOptions extends Partial<WebSocketConfig> {
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onMessage?: (message: IncomingMessage) => void;
  onStateChange?: (state: WebSocketState) => void;
  autoConnect?: boolean;
}

export interface UseWebSocketReturn {
  state: WebSocketState;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  send: (message: OutgoingMessage) => boolean;
  subscribe: (channels: SubscriptionChannel[]) => void;
  unsubscribe: (channels: SubscriptionChannel[]) => void;
  getLatency: () => number | null;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const config: WebSocketConfig = { ...DEFAULT_WS_CONFIG, ...options };
  
  const [state, setState] = useState<WebSocketState>({
    connectionState: 'disconnected',
    clientId: null,
    lastHeartbeat: null,
    latency: null,
    reconnectAttempts: 0,
    subscriptions: [],
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageQueueRef = useRef<TypedMessageQueue<IncomingMessage>>();
  const pendingSubscriptionsRef = useRef<SubscriptionChannel[]>([]);
  const mountedRef = useRef(true);

  // Initialize message queue
  useEffect(() => {
    messageQueueRef.current = new TypedMessageQueue<IncomingMessage>({
      maxSize: config.messageQueueSize,
      batchSize: 20,
      processInterval: 50,
    });

    // Set up message type handlers
    if (options.onMessage) {
      messageQueueRef.current.onDefault((messages) => {
        messages.forEach((msg) => options.onMessage?.(msg));
      });
    }

    messageQueueRef.current.start();

    return () => {
      messageQueueRef.current?.stop();
    };
  }, [config.messageQueueSize]);

  // Update state helper
  const updateState = useCallback((updates: Partial<WebSocketState>) => {
    if (!mountedRef.current) return;
    
    setState((prev) => {
      const newState = { ...prev, ...updates };
      options.onStateChange?.(newState);
      return newState;
    });
  }, [options.onStateChange]);

  // Log helper
  const log = useCallback((...args: unknown[]) => {
    if (config.debug) {
      console.log('[WebSocket]', ...args);
    }
  }, [config.debug]);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  // Send heartbeat
  const sendHeartbeat = useCallback(() => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    const heartbeat = createMessage<HeartbeatMessage>('heartbeat', {
      clientTime: Date.now(),
    });

    wsRef.current.send(serializeMessage(heartbeat));
    log('Heartbeat sent');

    // Set timeout for heartbeat response
    heartbeatTimeoutRef.current = setTimeout(() => {
      log('Heartbeat timeout - connection may be stale');
      wsRef.current?.close(4000, 'Heartbeat timeout');
    }, config.heartbeatTimeout);
  }, [config.heartbeatTimeout, log]);

  // Start heartbeat interval
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) return;
    
    heartbeatIntervalRef.current = setInterval(() => {
      sendHeartbeat();
    }, config.heartbeatInterval);

    // Send initial heartbeat
    sendHeartbeat();
  }, [config.heartbeatInterval, sendHeartbeat]);

  // Handle incoming messages
  const handleMessage = useCallback((event: MessageEvent) => {
    const message = parseMessage(event.data);
    
    if (!message) {
      log('Failed to parse message:', event.data);
      return;
    }

    log('Received:', message.type);

    // Handle heartbeat response
    if (message.type === 'heartbeat') {
      const heartbeat = message as HeartbeatMessage;
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
        heartbeatTimeoutRef.current = null;
      }
      
      const latency = heartbeat.payload.serverTime 
        ? Date.now() - heartbeat.payload.clientTime
        : null;
      
      updateState({
        lastHeartbeat: Date.now(),
        latency,
      });
      return;
    }

    // Handle connection message
    if (message.type === 'connection') {
      updateState({
        clientId: message.payload.clientId,
      });

      // Subscribe to pending channels
      if (pendingSubscriptionsRef.current.length > 0) {
        const subMsg = createMessage<SubscribeMessage>('subscribe', {
          channels: pendingSubscriptionsRef.current,
        });
        wsRef.current?.send(serializeMessage(subMsg));
      }
      return;
    }

    // Queue other messages for processing
    messageQueueRef.current?.enqueue(message as IncomingMessage);
  }, [log, updateState]);

  // Connect to server (WebSocket preferred if configured; SSE otherwise)
  const connect = useCallback(() => {
    // Prevent double-connect
    if (config.transport === 'ws') {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        log('Already connected via WebSocket');
        return;
      }

      if (wsRef.current?.readyState === WebSocket.CONNECTING) {
        log('WebSocket connection in progress');
        return;
      }
    } else {
      if (esRef.current) {
        log('EventSource already connected');
        return;
      }
    }

    clearTimers();
    updateState({ connectionState: 'connecting', error: null });
    log('Connecting to', config.url, 'via', config.transport || (isSSE ? 'sse' : 'ws'));

    // Helper to connect via SSE
    const connectSSE = () => {
      try {
        const url = config.url;
        esRef.current = new EventSource(url);

        esRef.current.onopen = () => {
          log('SSE connected');
          updateState({ connectionState: 'connected', reconnectAttempts: 0, error: null });
          options.onOpen?.(new Event('open'));
        };

        esRef.current.onmessage = (event) => {
          handleMessage(event as MessageEvent);
        };

        esRef.current.onerror = (ev) => {
          log('SSE error', ev);
          updateState({ connectionState: 'error', error: new Error('SSE error') });
          options.onError?.(ev as Event);

          // EventSource auto-reconnects; if it fails repeatedly, let state reflect it
        };
      } catch (error) {
        log('SSE connection failed:', error);
        updateState({ connectionState: 'error', error: new Error('SSE connection failed') });
      }
    };

    // Helper to connect via WebSocket
    const connectWS = () => {
      try {
        wsRef.current = new WebSocket(config.url);

        wsRef.current.onopen = (event) => {
          log('WebSocket connected');
          updateState({ connectionState: 'connected', reconnectAttempts: 0, error: null });
          startHeartbeat();
          options.onOpen?.(event);
        };

        wsRef.current.onclose = (event) => {
          log('WebSocket disconnected:', event.code, event.reason);
          clearTimers();
          updateState({ connectionState: 'disconnected', clientId: null });
          options.onClose?.(event);

          // On error or non-clean close, fallback to SSE
          if (config.reconnect && event.code !== 1000 && state.reconnectAttempts < config.reconnectMaxAttempts) {
            const delay = Math.min(config.reconnectInterval * Math.pow(2, state.reconnectAttempts), 30000);
            log(`WebSocket reconnecting in ${delay}ms (attempt ${state.reconnectAttempts + 1})`);
            updateState({ connectionState: 'reconnecting', reconnectAttempts: state.reconnectAttempts + 1 });
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, delay);
          } else {
            log('Falling back to SSE');
            connectSSE();
          }
        };

        wsRef.current.onerror = (event) => {
          log('WebSocket error:', event);
          updateState({ connectionState: 'error', error: new Error('WebSocket error') });
          options.onError?.(event);

          // Try fallback to SSE
          log('Attempting SSE fallback due to WebSocket error');
          connectSSE();
        };

        wsRef.current.onmessage = handleMessage;
      } catch (error) {
        log('WebSocket connection failed:', error);
        updateState({ connectionState: 'error', error: error instanceof Error ? error : new Error('Connection failed') });

        // Fallback to SSE if WS fails
        connectSSE();
      }
    };

    if (config.transport === 'ws') {
      connectWS();
    } else if (config.transport === 'sse' || isSSE) {
      connectSSE();
    } else {
      // Default: try WebSocket first, then SSE
      connectWS();
    }
  }, [
    config.url,
    config.transport,
    config.reconnect,
    config.reconnectInterval,
    config.reconnectMaxAttempts,
    state.connectionState,
    state.reconnectAttempts,
    clearTimers,
    handleMessage,
    log,
    options,
    startHeartbeat,
    updateState,
    isSSE,
  ]);

  // Disconnect from WebSocket server
  const disconnect = useCallback(() => {
    log('Disconnecting');
    clearTimers();
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    updateState({
      connectionState: 'disconnected',
      clientId: null,
      reconnectAttempts: 0,
    });
  }, [clearTimers, log, updateState]);

  // Send a message
  const send = useCallback((message: OutgoingMessage): boolean => {
    // If WebSocket is available and open, use it
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(serializeMessage(message));
        log('Sent via WebSocket:', message.type);
        return true;
      } catch (error) {
        log('WebSocket send error:', error);
        return false;
      }
    }

    // SSE is read-only; clients cannot push messages via EventSource.
    // If using SSE and a server-side POST endpoint is available for client actions,
    // implement it as needed. For now, notify and return false.
    if (esRef.current) {
      log('Cannot send via SSE (read-only) - consider POSTing to server endpoint');
      return false;
    }

    log('Cannot send - not connected');
    return false;
  }, [log]);

  // Subscribe to channels
  const subscribe = useCallback((channels: SubscriptionChannel[]) => {
    const newChannels = channels.filter(
      (c) => !state.subscriptions.includes(c)
    );
    
    if (newChannels.length === 0) return;

    // Store for reconnection/local state
    pendingSubscriptionsRef.current = [
      ...new Set([...pendingSubscriptionsRef.current, ...newChannels]),
    ];

    // If using WebSocket, inform server. If using SSE, subscriptions are local-only
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message = createMessage<SubscribeMessage>('subscribe', {
        channels: newChannels,
      });
      send(message);
    } else if (esRef.current) {
      // SSE transport is one-way; server-side broadcasting will reach all clients
      log('Using SSE transport - subscriptions are client-side filters only');
    }

    updateState({
      subscriptions: [...state.subscriptions, ...newChannels],
    });
  }, [send, state.subscriptions, updateState]);

  // Unsubscribe from channels
  const unsubscribe = useCallback((channels: SubscriptionChannel[]) => {
    pendingSubscriptionsRef.current = pendingSubscriptionsRef.current.filter(
      (c) => !channels.includes(c)
    );

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message = createMessage<UnsubscribeMessage>('unsubscribe', {
        channels,
      });
      send(message);
    } else if (esRef.current) {
      log('Using SSE transport - unsubscriptions are client-side only');
    }

    updateState({
      subscriptions: state.subscriptions.filter((c) => !channels.includes(c)),
    });
  }, [send, state.subscriptions, updateState]);

  // Get current latency
  const getLatency = useCallback(() => state.latency, [state.latency]);

  // Auto-connect on mount
  useEffect(() => {
    mountedRef.current = true;
    
    if (options.autoConnect !== false) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, []); // Intentionally empty - only run on mount/unmount

  return {
    state,
    isConnected: state.connectionState === 'connected',
    connect,
    disconnect,
    send,
    subscribe,
    unsubscribe,
    getLatency,
  };
}

// ============================================================================
// Specialized Hooks
// ============================================================================

/**
 * Hook for subscribing to specific message types
 */
export function useWebSocketMessage<T extends IncomingMessage['type']>(
  ws: UseWebSocketReturn,
  messageType: T,
  handler: (message: Extract<IncomingMessage, { type: T }>) => void
) {
  useEffect(() => {
    // This would integrate with the message queue's type routing
    // For now, handle via the main onMessage callback
  }, [ws, messageType, handler]);
}

/**
 * Hook for model-specific updates
 */
export function useModelUpdates(modelId: string, wsOptions?: UseWebSocketOptions) {
  const ws = useWebSocket({
    ...wsOptions,
    onMessage: (message) => {
      // Filter messages for this model
      if ('modelId' in message.payload && message.payload.modelId !== modelId) {
        return;
      }
      wsOptions?.onMessage?.(message);
    },
  });

  useEffect(() => {
    if (ws.isConnected) {
      ws.subscribe([`model:${modelId}` as SubscriptionChannel]);
    }
    
    return () => {
      ws.unsubscribe([`model:${modelId}` as SubscriptionChannel]);
    };
  }, [ws.isConnected, modelId]);

  return ws;
}

/**
 * Hook for trade updates
 */
export function useTradeUpdates(wsOptions?: UseWebSocketOptions) {
  const ws = useWebSocket(wsOptions);

  useEffect(() => {
    if (ws.isConnected) {
      ws.subscribe(['trades']);
    }
    
    return () => {
      ws.unsubscribe(['trades']);
    };
  }, [ws.isConnected]);

  return ws;
}

export default useWebSocket;
