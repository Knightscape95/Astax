'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertHistory, AlertSeverity, AlertType } from '@/types/database';
import { playAlertSound } from '@/lib/push-notifications';

interface AlertsProps {
  userId: string;
  onAlertClick?: (alert: AlertHistory) => void;
  maxVisible?: number;
  autoRefreshInterval?: number;
}

interface ToastAlert extends AlertHistory {
  isExiting?: boolean;
}

/**
 * Alert severity colors and icons
 */
const severityConfig: Record<AlertSeverity, { 
  bgColor: string; 
  borderColor: string; 
  iconColor: string; 
  icon: string;
}> = {
  critical: {
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-500',
    iconColor: 'text-red-500',
    icon: '🚨',
  },
  warning: {
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderColor: 'border-yellow-500',
    iconColor: 'text-yellow-500',
    icon: '⚠️',
  },
  info: {
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-500',
    iconColor: 'text-blue-500',
    icon: 'ℹ️',
  },
};

/**
 * Alert type labels
 */
const alertTypeLabels: Record<AlertType, string> = {
  large_loss: 'Large Loss',
  low_confidence: 'Low Confidence',
  high_drawdown: 'High Drawdown',
  consecutive_losses: 'Consecutive Losses',
  model_degradation: 'Model Degradation',
  unusual_volume: 'Unusual Volume',
  risk_limit_breach: 'Risk Limit Breach',
  custom: 'Custom Alert',
  model_update: 'Model Update',
  performance_milestone: 'Performance Milestone',
};

/**
 * Format relative time
 */
function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

/**
 * Single Alert Item Component
 */
function AlertItem({
  alert,
  onDismiss,
  onClick,
  isToast = false,
  isExiting = false,
}: {
  alert: AlertHistory;
  onDismiss: (id: string) => void;
  onClick?: (alert: AlertHistory) => void;
  isToast?: boolean;
  isExiting?: boolean;
}) {
  const config = severityConfig[alert.severity];

  return (
    <div
      className={`
        relative flex items-start gap-3 p-4 rounded-lg border-l-4 shadow-sm
        ${config.bgColor} ${config.borderColor}
        ${isToast ? 'animate-slide-in' : ''}
        ${isExiting ? 'animate-slide-out' : ''}
        ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}
      `}
      onClick={() => onClick?.(alert)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick(alert);
        }
      }}
    >
      {/* Icon */}
      <span className="text-xl flex-shrink-0" role="img" aria-label={alert.severity}>
        {config.icon}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${config.iconColor} bg-white/50 dark:bg-black/20`}>
            {alertTypeLabels[alert.alert_type]}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatRelativeTime(alert.created_at)}
          </span>
        </div>
        <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
          {alert.title}
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-2">
          {alert.message}
        </p>
      </div>

      {/* Dismiss Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(alert.id);
        }}
        className="flex-shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        aria-label="Dismiss alert"
      >
        <svg
          className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Toast Notifications Container
 */
function ToastContainer({
  alerts,
  onDismiss,
  onClick,
}: {
  alerts: ToastAlert[];
  onDismiss: (id: string) => void;
  onClick?: (alert: AlertHistory) => void;
}) {
  if (alerts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-md w-full"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {alerts.map((alert) => (
        <AlertItem
          key={alert.id}
          alert={alert}
          onDismiss={onDismiss}
          onClick={onClick}
          isToast
          isExiting={alert.isExiting}
        />
      ))}
    </div>
  );
}

/**
 * Alerts List Component
 */
function AlertsList({
  alerts,
  onDismiss,
  onClick,
  loading,
  hasMore,
  onLoadMore,
}: {
  alerts: AlertHistory[];
  onDismiss: (id: string) => void;
  onClick?: (alert: AlertHistory) => void;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  if (loading && alerts.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <svg
          className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        <p>No alerts</p>
        <p className="text-sm mt-1">You&apos;re all caught up!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <AlertItem
          key={alert.id}
          alert={alert}
          onDismiss={onDismiss}
          onClick={onClick}
        />
      ))}
      
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loading}
          className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}

/**
 * Main Alerts Component
 */
export default function Alerts({
  userId,
  onAlertClick,
  maxVisible = 5,
  autoRefreshInterval = 30000,
}: AlertsProps) {
  const [alerts, setAlerts] = useState<AlertHistory[]>([]);
  const [toastAlerts, setToastAlerts] = useState<ToastAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<'all' | 'active' | 'dismissed'>('active');

  /**
   * Fetch alerts from API
   */
  const fetchAlerts = useCallback(async (reset = false) => {
    try {
      setLoading(true);
      const newOffset = reset ? 0 : offset;
      const status = filter === 'all' ? '' : filter;
      
      const response = await fetch(
        `/api/alerts?userId=${encodeURIComponent(userId)}&status=${status}&limit=${maxVisible}&offset=${newOffset}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch alerts: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (reset) {
        setAlerts(data.alerts || []);
        setOffset((data.alerts || []).length);
      } else {
        setAlerts((prev) => [...prev, ...(data.alerts || [])]);
        setOffset((prev) => prev + (data.alerts || []).length);
      }
      
      setHasMore(data.hasMore || false);
    } catch (error) {
      console.error('Error fetching alerts:', error);
      // Set empty state on error to prevent infinite loading
      if (reset) {
        setAlerts([]);
        setOffset(0);
      }
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [userId, filter, maxVisible, offset]);

  /**
   * Dismiss an alert
   */
  const handleDismiss = useCallback(async (alertId: string) => {
    // Optimistic update
    const alertToRestore = alerts.find(a => a.id === alertId);
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    setToastAlerts((prev) => 
      prev.map((a) => (a.id === alertId ? { ...a, isExiting: true } : a))
    );

    // Remove from toasts after animation
    setTimeout(() => {
      setToastAlerts((prev) => prev.filter((a) => a.id !== alertId));
    }, 300);

    try {
      const response = await fetch(`/api/alerts`, { 
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', alert_ids: [alertId] })
      });

      if (!response.ok) {
        throw new Error('Failed to dismiss alert');
      }
    } catch (error) {
      console.error('Error dismissing alert:', error);
      // Revert on error
      if (alertToRestore) {
        setAlerts((prev) => [alertToRestore, ...prev]);
      }
    }
  }, [alerts]);

  /**
   * Add new alert (for real-time updates)
   */
  const addAlert = useCallback((alert: AlertHistory) => {
    // Add to toast notifications
    setToastAlerts((prev) => [alert, ...prev].slice(0, 3));
    
    // Play sound based on preference
    playAlertSound(alert.severity, true);

    // Auto-dismiss toast after delay
    setTimeout(() => {
      setToastAlerts((prev) =>
        prev.map((a) => (a.id === alert.id ? { ...a, isExiting: true } : a))
      );
      setTimeout(() => {
        setToastAlerts((prev) => prev.filter((a) => a.id !== alert.id));
      }, 300);
    }, alert.severity === 'critical' ? 10000 : 5000);

    // Add to main list if viewing active
    if (filter === 'active' || filter === 'all') {
      setAlerts((prev) => [alert, ...prev]);
    }
  }, [filter]);

  /**
   * Initial fetch and auto-refresh
   */
  useEffect(() => {
    fetchAlerts(true);
    
    const interval = setInterval(() => {
      fetchAlerts(true);
    }, autoRefreshInterval);

    return () => clearInterval(interval);
  }, [filter, autoRefreshInterval]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Expose addAlert for external use (e.g., WebSocket)
   */
  useEffect(() => {
    // @ts-expect-error - Exposing for external access
    window.__addAlert = addAlert;
    return () => {
      // @ts-expect-error - Cleanup
      delete window.__addAlert;
    };
  }, [addAlert]);

  return (
    <div className="alerts-container">
      {/* Toast Notifications */}
      <ToastContainer
        alerts={toastAlerts}
        onDismiss={handleDismiss}
        onClick={onAlertClick}
      />

      {/* Alerts Panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            Alerts
            {alerts.filter((a) => a.status === 'active').length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {alerts.filter((a) => a.status === 'active').length}
              </span>
            )}
          </h2>

          {/* Filter Tabs */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {(['active', 'all', 'dismissed'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setFilter(tab);
                  setOffset(0);
                }}
                className={`
                  px-3 py-1 text-sm rounded-md transition-colors
                  ${filter === tab
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }
                `}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Alerts List */}
        <div className="p-4 max-h-96 overflow-y-auto">
          <AlertsList
            alerts={alerts}
            onDismiss={handleDismiss}
            onClick={onAlertClick}
            loading={loading}
            hasMore={hasMore}
            onLoadMore={() => fetchAlerts(false)}
          />
        </div>
      </div>

      {/* CSS for animations */}
      <style jsx global>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes slide-out {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }

        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }

        .animate-slide-out {
          animation: slide-out 0.3s ease-in forwards;
        }
      `}</style>
    </div>
  );
}

/**
 * Alert Badge Component - For showing alert count in nav
 */
export function AlertBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full">
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Alert Bell Icon Component
 */
export function AlertBell({
  count,
  onClick,
}: {
  count: number;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      aria-label={`Alerts ${count > 0 ? `(${count} unread)` : ''}`}
    >
      <svg
        className={`w-6 h-6 ${count > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
      <AlertBadge count={count} />
    </button>
  );
}
