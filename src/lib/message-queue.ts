/**
 * Message Queue for handling bursts of real-time WebSocket data
 * 
 * Implements a bounded queue with batch processing capabilities
 * to prevent UI freezing during high-frequency message bursts.
 */

export interface QueueConfig {
  maxSize: number;
  batchSize: number;
  processInterval: number;
  onOverflow?: 'drop-oldest' | 'drop-newest' | 'block';
}

export interface QueueStats {
  totalEnqueued: number;
  totalProcessed: number;
  totalDropped: number;
  currentSize: number;
  peakSize: number;
  averageProcessingTime: number;
}

type MessageHandler<T> = (messages: T[]) => void | Promise<void>;

export class MessageQueue<T> {
  private queue: T[] = [];
  private config: QueueConfig;
  private handler: MessageHandler<T> | null = null;
  private processTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private stats: QueueStats = {
    totalEnqueued: 0,
    totalProcessed: 0,
    totalDropped: 0,
    currentSize: 0,
    peakSize: 0,
    averageProcessingTime: 0,
  };
  private processingTimes: number[] = [];

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = {
      maxSize: config.maxSize ?? 1000,
      batchSize: config.batchSize ?? 50,
      processInterval: config.processInterval ?? 100,
      onOverflow: config.onOverflow ?? 'drop-oldest',
    };
  }

  /**
   * Set the message handler for processing queued messages
   */
  setHandler(handler: MessageHandler<T>): void {
    this.handler = handler;
  }

  /**
   * Enqueue a single message
   */
  enqueue(message: T): boolean {
    return this.enqueueBatch([message]);
  }

  /**
   * Enqueue multiple messages at once
   */
  enqueueBatch(messages: T[]): boolean {
    if (messages.length === 0) return true;

    const availableSpace = this.config.maxSize - this.queue.length;
    
    if (messages.length <= availableSpace) {
      // All messages fit
      this.queue.push(...messages);
      this.stats.totalEnqueued += messages.length;
    } else {
      // Handle overflow
      switch (this.config.onOverflow) {
        case 'drop-oldest':
          const dropCount = messages.length - availableSpace;
          this.queue.splice(0, dropCount);
          this.queue.push(...messages);
          this.stats.totalEnqueued += messages.length;
          this.stats.totalDropped += dropCount;
          break;

        case 'drop-newest':
          const toAdd = messages.slice(0, availableSpace);
          this.queue.push(...toAdd);
          this.stats.totalEnqueued += toAdd.length;
          this.stats.totalDropped += messages.length - toAdd.length;
          break;

        case 'block':
          // Only add what fits, return false to indicate not all added
          if (availableSpace > 0) {
            const partial = messages.slice(0, availableSpace);
            this.queue.push(...partial);
            this.stats.totalEnqueued += partial.length;
          }
          this.stats.totalDropped += messages.length - availableSpace;
          return false;
      }
    }

    this.stats.currentSize = this.queue.length;
    if (this.queue.length > this.stats.peakSize) {
      this.stats.peakSize = this.queue.length;
    }

    this.scheduleProcessing();
    return true;
  }

  /**
   * Start automatic processing of queued messages
   */
  start(): void {
    if (this.processTimer) return;
    this.scheduleProcessing();
  }

  /**
   * Stop automatic processing
   */
  stop(): void {
    if (this.processTimer) {
      clearTimeout(this.processTimer);
      this.processTimer = null;
    }
  }

  /**
   * Process all queued messages immediately
   */
  async flush(): Promise<void> {
    this.stop();
    while (this.queue.length > 0) {
      await this.processBatch();
    }
  }

  /**
   * Clear all queued messages without processing
   */
  clear(): void {
    const dropped = this.queue.length;
    this.queue = [];
    this.stats.currentSize = 0;
    this.stats.totalDropped += dropped;
  }

  /**
   * Get current queue statistics
   */
  getStats(): QueueStats {
    return { ...this.stats };
  }

  /**
   * Get current queue size
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Check if queue is at capacity
   */
  get isFull(): boolean {
    return this.queue.length >= this.config.maxSize;
  }

  private scheduleProcessing(): void {
    if (this.processTimer || this.queue.length === 0) return;

    this.processTimer = setTimeout(async () => {
      this.processTimer = null;
      await this.processBatch();
      
      if (this.queue.length > 0) {
        this.scheduleProcessing();
      }
    }, this.config.processInterval);
  }

  private async processBatch(): Promise<void> {
    if (this.isProcessing || !this.handler || this.queue.length === 0) return;

    this.isProcessing = true;
    const startTime = performance.now();

    try {
      const batch = this.queue.splice(0, this.config.batchSize);
      await this.handler(batch);
      
      this.stats.totalProcessed += batch.length;
      this.stats.currentSize = this.queue.length;

      // Track processing time for stats
      const processingTime = performance.now() - startTime;
      this.processingTimes.push(processingTime);
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift();
      }
      this.stats.averageProcessingTime =
        this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
    } catch (error) {
      console.error('Error processing message batch:', error);
    } finally {
      this.isProcessing = false;
    }
  }
}

/**
 * Priority Message Queue - processes high priority messages first
 */
export class PriorityMessageQueue<T> {
  private queues: Map<number, MessageQueue<T>> = new Map();
  private priorities: number[] = [];
  private handler: MessageHandler<T> | null = null;

  constructor(
    priorities: number[] = [0, 1, 2],
    config: Partial<QueueConfig> = {}
  ) {
    this.priorities = priorities.sort((a, b) => b - a); // Higher priority first
    
    for (const priority of this.priorities) {
      this.queues.set(priority, new MessageQueue<T>(config));
    }
  }

  setHandler(handler: MessageHandler<T>): void {
    this.handler = handler;
    for (const queue of this.queues.values()) {
      queue.setHandler(handler);
    }
  }

  enqueue(message: T, priority: number = 0): boolean {
    const queue = this.queues.get(priority) || this.queues.get(this.priorities[this.priorities.length - 1])!;
    return queue.enqueue(message);
  }

  start(): void {
    for (const queue of this.queues.values()) {
      queue.start();
    }
  }

  stop(): void {
    for (const queue of this.queues.values()) {
      queue.stop();
    }
  }

  async flush(): Promise<void> {
    for (const priority of this.priorities) {
      const queue = this.queues.get(priority);
      if (queue) await queue.flush();
    }
  }

  clear(): void {
    for (const queue of this.queues.values()) {
      queue.clear();
    }
  }

  getStats(): Record<number, QueueStats> {
    const stats: Record<number, QueueStats> = {};
    for (const [priority, queue] of this.queues) {
      stats[priority] = queue.getStats();
    }
    return stats;
  }

  get totalSize(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.size;
    }
    return total;
  }
}

/**
 * Typed message queue with message type routing
 */
export type MessageTypeHandler<T, K extends keyof T> = (messages: Array<T & { type: K }>) => void | Promise<void>;

export class TypedMessageQueue<T extends { type: string }> {
  private queue: MessageQueue<T>;
  private handlers: Map<string, MessageTypeHandler<T, keyof T & string>> = new Map();
  private defaultHandler: MessageHandler<T> | null = null;

  constructor(config: Partial<QueueConfig> = {}) {
    this.queue = new MessageQueue<T>(config);
    this.queue.setHandler(this.routeMessages.bind(this));
  }

  /**
   * Register a handler for a specific message type
   */
  on<K extends T['type']>(
    type: K,
    handler: (messages: Array<Extract<T, { type: K }>>) => void | Promise<void>
  ): void {
    this.handlers.set(type, handler as MessageTypeHandler<T, keyof T & string>);
  }

  /**
   * Register a default handler for unmatched message types
   */
  onDefault(handler: MessageHandler<T>): void {
    this.defaultHandler = handler;
  }

  enqueue(message: T): boolean {
    return this.queue.enqueue(message);
  }

  enqueueBatch(messages: T[]): boolean {
    return this.queue.enqueueBatch(messages);
  }

  start(): void {
    this.queue.start();
  }

  stop(): void {
    this.queue.stop();
  }

  async flush(): Promise<void> {
    await this.queue.flush();
  }

  clear(): void {
    this.queue.clear();
  }

  getStats(): QueueStats {
    return this.queue.getStats();
  }

  private async routeMessages(messages: T[]): Promise<void> {
    // Group messages by type
    const grouped = new Map<string, T[]>();
    const unhandled: T[] = [];

    for (const msg of messages) {
      if (this.handlers.has(msg.type)) {
        const group = grouped.get(msg.type) || [];
        group.push(msg);
        grouped.set(msg.type, group);
      } else {
        unhandled.push(msg);
      }
    }

    // Process each type group
    const promises: Promise<void>[] = [];
    
    for (const [type, group] of grouped) {
      const handler = this.handlers.get(type);
      if (handler) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = handler(group as any);
        if (result instanceof Promise) {
          promises.push(result);
        }
      }
    }

    // Handle unmatched messages
    if (unhandled.length > 0 && this.defaultHandler) {
      const result = this.defaultHandler(unhandled);
      if (result instanceof Promise) {
        promises.push(result);
      }
    }

    await Promise.all(promises);
  }
}
