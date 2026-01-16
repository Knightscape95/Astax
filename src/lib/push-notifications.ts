/**
 * Push Notifications Service using PWA Notification API
 * 
 * Handles browser push notification permissions and delivery
 */

import { AlertSeverity, AlertDetectionResult } from '@/types/database';

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

/**
 * Push subscription data
 */
export interface PushSubscriptionData {
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  user_agent?: string;
}

/**
 * Notification options
 */
export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
  silent?: boolean;
  actions?: NotificationAction[];
  vibrate?: number[];
}

export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

/**
 * Check if notifications are supported
 */
export function isNotificationSupported(): boolean {
  return isBrowser && 'Notification' in window;
}

/**
 * Check if push notifications are supported
 */
export function isPushSupported(): boolean {
  return isBrowser && 'PushManager' in window && 'serviceWorker' in navigator;
}

/**
 * Get current notification permission status
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) {
    console.warn('Notifications are not supported in this browser');
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return 'denied';
  }
}

/**
 * Show a browser notification
 */
export async function showNotification(options: NotificationOptions): Promise<Notification | null> {
  if (!isNotificationSupported()) {
    console.warn('Notifications are not supported');
    return null;
  }

  const permission = getNotificationPermission();
  if (permission !== 'granted') {
    console.warn('Notification permission not granted');
    return null;
  }

  try {
    // Use service worker if available for better PWA support
    if (isPushSupported() && navigator.serviceWorker.controller) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(options.title, {
        body: options.body,
        icon: options.icon || '/icons/icon-192x192.png',
        badge: options.badge || '/icons/icon-72x72.png',
        tag: options.tag,
        data: options.data,
        requireInteraction: options.requireInteraction ?? false,
        silent: options.silent ?? false,
      });
      return null; // Service worker notifications don't return a Notification object
    }

    // Fallback to direct Notification API
    const notification = new Notification(options.title, {
      body: options.body,
      icon: options.icon || '/icons/icon-192x192.png',
      badge: options.badge,
      tag: options.tag,
      data: options.data,
      requireInteraction: options.requireInteraction ?? false,
      silent: options.silent ?? false,
    });

    return notification;
  } catch (error) {
    console.error('Error showing notification:', error);
    return null;
  }
}

/**
 * Get severity icon based on alert severity
 */
function getSeverityIcon(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical':
      return '/icons/alert-critical.png';
    case 'warning':
      return '/icons/alert-warning.png';
    case 'info':
    default:
      return '/icons/alert-info.png';
  }
}

/**
 * Get vibration pattern based on severity
 */
function getSeverityVibration(severity: AlertSeverity): number[] {
  switch (severity) {
    case 'critical':
      return [300, 100, 300, 100, 300]; // Urgent pattern
    case 'warning':
      return [200, 100, 200]; // Warning pattern
    case 'info':
    default:
      return [100]; // Simple tap
  }
}

/**
 * Save alert to history via API
 */
async function saveAlertHistory(
  alert: AlertDetectionResult,
  userId: string,
  modelId?: string,
  tradeId?: string
): Promise<void> {
  try {
    const response = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        model_id: modelId,
        trade_id: tradeId,
        alert_type: alert.alertType,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        details: alert.details,
        threshold_value: alert.thresholdValue,
        actual_value: alert.actualValue,
      }),
    });
    
    if (!response.ok) {
        console.error('Failed to save alert history', await response.text());
    }
  } catch (error) {
    console.error('Error saving alert history:', error);
  }
}

/**
 * Show alert notification
 */
export async function showAlertNotification(
  alert: AlertDetectionResult,
  userId: string,
  modelId?: string,
  tradeId?: string
): Promise<void> {
  // Save to alert history
  await saveAlertHistory(alert, userId, modelId, tradeId);

  // Show browser notification
  await showNotification({
    title: alert.title,
    body: alert.message,
    icon: getSeverityIcon(alert.severity),
    tag: `alert-${alert.alertType}-${Date.now()}`,
    data: {
      alertType: alert.alertType,
      severity: alert.severity,
      ...alert.details,
    },
    requireInteraction: alert.severity === 'critical',
    vibrate: getSeverityVibration(alert.severity),
    actions: [
      { action: 'view', title: 'View Details' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  });
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPush(userId: string): Promise<PushSubscriptionData | null> {
  if (!isPushSupported()) {
    console.warn('Push notifications are not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Get the VAPID public key from environment
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.warn('VAPID public key not configured');
      return null;
    }

    // Convert VAPID key to Uint8Array
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
    });

    const subscriptionJson = subscription.toJSON();
    const keys = subscriptionJson.keys as { p256dh: string; auth: string };

    const subscriptionData: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      p256dh_key: keys.p256dh,
      auth_key: keys.auth,
      user_agent: navigator.userAgent,
    };

    // Save subscription to database
    await savePushSubscription(userId, subscriptionData);

    return subscriptionData;
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    return null;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(userId: string): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      await removePushSubscription(userId, subscription.endpoint);
    }

    return true;
  } catch (error) {
    console.error('Error unsubscribing from push:', error);
    return false;
  }
}

/**
 * Check if user is subscribed to push
 */
export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch (error) {
    console.error('Error checking push subscription:', error);
    return false;
  }
}

/**
 * Save push subscription to database
 */
async function savePushSubscription(
  userId: string,
  subscription: PushSubscriptionData
): Promise<void> {
  const result = await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  });
  if (!result.ok) throw new Error('Failed to save subscription');
}

/**
 * Remove push subscription from database
 */
async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  const result = await fetch('/api/notifications/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
  if (!result.ok) throw new Error('Failed to remove subscription');
}

/**
 * Convert base64 string to Uint8Array (for VAPID key)
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

/**
 * Play alert sound based on severity
 */
export function playAlertSound(severity: AlertSeverity, enabled: boolean = true): void {
  if (!enabled || !isBrowser) return;

  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Different frequencies based on severity
    switch (severity) {
      case 'critical':
        oscillator.frequency.value = 880; // High A note
        break;
      case 'warning':
        oscillator.frequency.value = 660; // E note
        break;
      case 'info':
      default:
        oscillator.frequency.value = 440; // A note
    }

    oscillator.type = 'sine';
    gainNode.gain.value = 0.3;

    oscillator.start();
    
    // Duration based on severity
    const duration = severity === 'critical' ? 0.5 : severity === 'warning' ? 0.3 : 0.2;
    
    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, duration * 1000);
  } catch (error) {
    console.error('Error playing alert sound:', error);
  }
}

/**
 * Initialize notification handlers
 */
export function initializeNotificationHandlers(
  onNotificationClick?: (event: NotificationEvent) => void
): void {
  if (!isBrowser || !isPushSupported()) return;

  navigator.serviceWorker.ready.then((registration) => {
    // Handle notification clicks from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NOTIFICATION_CLICK') {
        const notificationData = event.data.notification;
        if (onNotificationClick) {
          onNotificationClick(notificationData);
        }
      }
    });
  });
}

// Type for notification event from service worker
export interface NotificationEvent {
  action: string;
  notification: {
    title: string;
    body: string;
    data: Record<string, unknown>;
    tag: string;
  };
}
