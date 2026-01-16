'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { AlertType, AlertSeverity, AlertPreference } from '@/types/database';
import { DEFAULT_THRESHOLDS } from '@/lib/alert-config';
import {
  requestNotificationPermission,
  getNotificationPermission,
  isPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push-notifications';

/**
 * Alert type configuration
 */
interface AlertTypeConfig {
  type: AlertType;
  label: string;
  description: string;
  hasThresholdValue: boolean;
  hasThresholdPercentage: boolean;
  hasConsecutiveCount: boolean;
  defaultValue?: number;
  defaultPercentage?: number;
  defaultCount?: number;
  unit?: string;
}

const alertTypeConfigs: AlertTypeConfig[] = [
  {
    type: 'large_loss',
    label: 'Large Loss',
    description: 'Alert when a trade results in a significant loss',
    hasThresholdValue: true,
    hasThresholdPercentage: true,
    hasConsecutiveCount: false,
    defaultValue: DEFAULT_THRESHOLDS.large_loss.absolute,
    defaultPercentage: DEFAULT_THRESHOLDS.large_loss.percentage,
    unit: '$',
  },
  {
    type: 'low_confidence',
    label: 'Low Confidence',
    description: 'Alert when a trade is executed with low signal confidence',
    hasThresholdValue: false,
    hasThresholdPercentage: true,
    hasConsecutiveCount: false,
    defaultPercentage: DEFAULT_THRESHOLDS.low_confidence.percentage,
    unit: '%',
  },
  {
    type: 'high_drawdown',
    label: 'High Drawdown',
    description: 'Alert when portfolio drawdown exceeds threshold',
    hasThresholdValue: false,
    hasThresholdPercentage: true,
    hasConsecutiveCount: false,
    defaultPercentage: DEFAULT_THRESHOLDS.high_drawdown.percentage,
    unit: '%',
  },
  {
    type: 'consecutive_losses',
    label: 'Consecutive Losses',
    description: 'Alert after a series of losing trades',
    hasThresholdValue: false,
    hasThresholdPercentage: false,
    hasConsecutiveCount: true,
    defaultCount: DEFAULT_THRESHOLDS.consecutive_losses.count,
    unit: 'trades',
  },
  {
    type: 'model_degradation',
    label: 'Model Degradation',
    description: 'Alert when model performance drops significantly',
    hasThresholdValue: false,
    hasThresholdPercentage: true,
    hasConsecutiveCount: false,
    defaultPercentage: DEFAULT_THRESHOLDS.model_degradation.winRateDropPercentage,
    unit: '%',
  },
  {
    type: 'risk_limit_breach',
    label: 'Risk Limit Breach',
    description: 'Alert when daily loss or position size limits are exceeded',
    hasThresholdValue: false,
    hasThresholdPercentage: true,
    hasConsecutiveCount: false,
    defaultPercentage: DEFAULT_THRESHOLDS.risk_limit_breach.dailyLossLimit,
    unit: '%',
  },
];

/**
 * Severity options
 */
const severityOptions: { value: AlertSeverity; label: string; color: string }[] = [
  { value: 'info', label: 'Info', color: 'bg-blue-100 text-blue-800' },
  { value: 'warning', label: 'Warning', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-800' },
];

/**
 * Alert Settings Page
 */
export default function AlertSettingsPage() {
  const { data: session } = useSession();
  const userId = session?.user?.email || 'anonymous';

  const [preferences, setPreferences] = useState<Map<AlertType, AlertPreference>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [globalSettings, setGlobalSettings] = useState({
    pushEnabled: true,
    emailEnabled: false,
    soundEnabled: true,
  });

  /**
   * Fetch current preferences
   */
  const fetchPreferences = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/alerts/preferences?userId=${encodeURIComponent(userId)}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch preferences: ${response.statusText}`);
      }
      
      const data = await response.json();
      const prefMap = new Map<AlertType, AlertPreference>();
      
      // Handle both array response and { preferences: [] } response
      const preferences = Array.isArray(data) ? data : (data.preferences || []);
      
      for (const pref of preferences) {
        prefMap.set(pref.alert_type, pref);
      }
      
      setPreferences(prefMap);
    } catch (error) {
      console.error('Error fetching preferences:', error);
      // Set empty map on error
      setPreferences(new Map());
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /**
   * Save a preference
   */
  const savePreference = async (alertType: AlertType, updates: Partial<AlertPreference>) => {
    try {
      setSaving(true);
      
      const currentPref = preferences.get(alertType) || {
        user_id: userId,
        alert_type: alertType,
        enabled: true,
        severity: 'warning' as AlertSeverity,
        push_enabled: globalSettings.pushEnabled,
        email_enabled: globalSettings.emailEnabled,
        sound_enabled: globalSettings.soundEnabled,
      };

      const response = await fetch('/api/alerts/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...currentPref,
          ...updates,
          user_id: userId,
          alert_type: alertType,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save preference: ${response.statusText}`);
      }
      
      const data = await response.json();
      setPreferences((prev) => new Map(prev).set(alertType, data.preference || data));
    } catch (error) {
      console.error('Error saving preference:', error);
      // Show error to user
      alert('Failed to save preference. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Toggle alert enabled state
   */
  const toggleAlert = (alertType: AlertType) => {
    const current = preferences.get(alertType);
    savePreference(alertType, { enabled: !current?.enabled });
  };

  /**
   * Update threshold value
   */
  const updateThreshold = (
    alertType: AlertType,
    field: 'threshold_value' | 'threshold_percentage' | 'consecutive_count',
    value: number
  ) => {
    savePreference(alertType, { [field]: value });
  };

  /**
   * Update severity
   */
  const updateSeverity = (alertType: AlertType, severity: AlertSeverity) => {
    savePreference(alertType, { severity });
  };

  /**
   * Handle notification permission
   */
  const handleRequestPermission = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
    
    if (permission === 'granted' && !pushSubscribed) {
      const subscription = await subscribeToPush(userId);
      setPushSubscribed(!!subscription);
    }
  };

  /**
   * Toggle push subscription
   */
  const togglePushSubscription = async () => {
    if (pushSubscribed) {
      await unsubscribeFromPush(userId);
      setPushSubscribed(false);
    } else {
      const subscription = await subscribeToPush(userId);
      setPushSubscribed(!!subscription);
    }
  };

  /**
   * Initialize
   */
  useEffect(() => {
    fetchPreferences();
    setNotificationPermission(getNotificationPermission());
    isPushSubscribed().then(setPushSubscribed);
  }, [fetchPreferences]);

  /**
   * Get preference value for display
   */
  const getPreferenceValue = (alertType: AlertType, field: keyof AlertPreference, defaultValue: unknown) => {
    const pref = preferences.get(alertType);
    return pref?.[field] ?? defaultValue;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Alert Settings
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Configure notifications for significant model events and anomalies
        </p>
      </div>

      {/* Notification Permission Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Notification Permissions
        </h2>

        <div className="space-y-4">
          {/* Browser Notification Status */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                Browser Notifications
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {notificationPermission === 'granted'
                  ? 'Notifications are enabled'
                  : notificationPermission === 'denied'
                  ? 'Notifications are blocked. Please enable in browser settings.'
                  : notificationPermission === 'unsupported'
                  ? 'Notifications are not supported in this browser'
                  : 'Allow notifications to receive real-time alerts'}
              </p>
            </div>
            {notificationPermission === 'default' && (
              <button
                onClick={handleRequestPermission}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Enable
              </button>
            )}
            {notificationPermission === 'granted' && (
              <span className="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-full text-sm font-medium">
                Enabled
              </span>
            )}
            {notificationPermission === 'denied' && (
              <span className="px-3 py-1 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 rounded-full text-sm font-medium">
                Blocked
              </span>
            )}
          </div>

          {/* Push Subscription */}
          {notificationPermission === 'granted' && (
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  Push Notifications
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Receive alerts even when the app is closed
                </p>
              </div>
              <button
                onClick={togglePushSubscription}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  pushSubscribed ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    pushSubscribed ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Global Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Global Preferences
        </h2>

        <div className="space-y-4">
          {/* Sound Enabled */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">Sound Alerts</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Play a sound when alerts are triggered
              </p>
            </div>
            <button
              onClick={() => setGlobalSettings((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                globalSettings.soundEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  globalSettings.soundEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Email Enabled */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">Email Notifications</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Also receive alerts via email
              </p>
            </div>
            <button
              onClick={() => setGlobalSettings((prev) => ({ ...prev, emailEnabled: !prev.emailEnabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                globalSettings.emailEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  globalSettings.emailEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Alert Types Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Alert Types
        </h2>

        <div className="space-y-6">
          {alertTypeConfigs.map((config) => {
            const isEnabled = getPreferenceValue(config.type, 'enabled', true) as boolean;
            const severity = getPreferenceValue(config.type, 'severity', 'warning') as AlertSeverity;

            return (
              <div
                key={config.type}
                className={`p-4 rounded-lg border ${
                  isEnabled
                    ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">
                        {config.label}
                      </h3>
                      <button
                        onClick={() => toggleAlert(config.type)}
                        disabled={saving}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          isEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            isEnabled ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {config.description}
                    </p>
                  </div>
                </div>

                {/* Settings (only shown when enabled) */}
                {isEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                    {/* Threshold Value */}
                    {config.hasThresholdValue && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Threshold Value ({config.unit})
                        </label>
                        <input
                          type="number"
                          value={getPreferenceValue(config.type, 'threshold_value', config.defaultValue) as number}
                          onChange={(e) =>
                            updateThreshold(config.type, 'threshold_value', parseFloat(e.target.value))
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    )}

                    {/* Threshold Percentage */}
                    {config.hasThresholdPercentage && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Threshold ({config.unit || '%'})
                        </label>
                        <input
                          type="number"
                          value={getPreferenceValue(config.type, 'threshold_percentage', config.defaultPercentage) as number}
                          onChange={(e) =>
                            updateThreshold(config.type, 'threshold_percentage', parseFloat(e.target.value))
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    )}

                    {/* Consecutive Count */}
                    {config.hasConsecutiveCount && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Count ({config.unit})
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={getPreferenceValue(config.type, 'consecutive_count', config.defaultCount) as number}
                          onChange={(e) =>
                            updateThreshold(config.type, 'consecutive_count', parseInt(e.target.value))
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    )}

                    {/* Severity Selector */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Severity
                      </label>
                      <select
                        value={severity}
                        onChange={(e) => updateSeverity(config.type, e.target.value as AlertSeverity)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        {severityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Test Alert Button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={async () => {
            const { showNotification } = await import('@/lib/push-notifications');
            showNotification({
              title: 'Test Alert',
              body: 'This is a test notification to verify your alert settings are working correctly.',
              tag: 'test-alert',
            });
          }}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          Send Test Alert
        </button>
      </div>

      {/* Saving Indicator */}
      {saving && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
          Saving...
        </div>
      )}
    </div>
  );
}
