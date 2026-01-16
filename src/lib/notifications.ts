/**
 * Notification Service for Model Event Alerts
 * 
 * Detects anomalies and significant events from model performance data
 */

import { sql } from './db';
import {
  AlertType,
  AlertSeverity,
  AlertPreference,
  AlertHistory,
  CreateAlertHistoryInput,
  Trade,
  PerformanceMetric,
  AlertDetectionResult,
} from '@/types/database';
import { DEFAULT_THRESHOLDS } from './alert-config';

export { DEFAULT_THRESHOLDS }; // Re-export for potential legacy usage if any, or just use imported.

/**
 * Get user's alert preferences
 */
export async function getAlertPreferences(
  userId: string,
  modelId?: string
): Promise<AlertPreference[]> {
  try {
    let result;
    if (modelId) {
      result = await sql`
        SELECT * FROM alert_preferences 
        WHERE user_id = ${userId} 
        AND (model_id = ${modelId} OR model_id IS NULL)
        AND enabled = true
        ORDER BY alert_type
      `;
    } else {
      result = await sql`
        SELECT * FROM alert_preferences 
        WHERE user_id = ${userId} AND enabled = true
        ORDER BY alert_type
      `;
    }
    return result.rows as AlertPreference[];
  } catch (error) {
    console.error('Error fetching alert preferences:', error);
    return [];
  }
}

/**
 * Create or update alert preference
 */
export async function upsertAlertPreference(
  preference: Partial<AlertPreference> & { user_id: string; alert_type: AlertType }
): Promise<AlertPreference | null> {
  try {
    const result = await sql`
      INSERT INTO alert_preferences (
        user_id, model_id, alert_type, enabled, threshold_value,
        threshold_percentage, consecutive_count, time_window_minutes,
        severity, push_enabled, email_enabled, sound_enabled, custom_message
      ) VALUES (
        ${preference.user_id},
        ${preference.model_id || null},
        ${preference.alert_type},
        ${preference.enabled ?? true},
        ${preference.threshold_value || null},
        ${preference.threshold_percentage || null},
        ${preference.consecutive_count || null},
        ${preference.time_window_minutes || null},
        ${preference.severity || 'warning'},
        ${preference.push_enabled ?? true},
        ${preference.email_enabled ?? false},
        ${preference.sound_enabled ?? true},
        ${preference.custom_message || null}
      )
      ON CONFLICT (user_id, model_id, alert_type)
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        threshold_value = EXCLUDED.threshold_value,
        threshold_percentage = EXCLUDED.threshold_percentage,
        consecutive_count = EXCLUDED.consecutive_count,
        time_window_minutes = EXCLUDED.time_window_minutes,
        severity = EXCLUDED.severity,
        push_enabled = EXCLUDED.push_enabled,
        email_enabled = EXCLUDED.email_enabled,
        sound_enabled = EXCLUDED.sound_enabled,
        custom_message = EXCLUDED.custom_message,
        updated_at = NOW()
      RETURNING *
    `;
    return result.rows[0] as AlertPreference;
  } catch (error) {
    console.error('Error upserting alert preference:', error);
    return null;
  }
}

/**
 * Save triggered alert to history
 */
export async function createAlertHistory(
  alert: CreateAlertHistoryInput
): Promise<AlertHistory | null> {
  try {
    // Validate required fields
    if (!alert.user_id || !alert.alert_type || !alert.severity) {
      console.error('Missing required alert fields:', { user_id: alert.user_id, alert_type: alert.alert_type, severity: alert.severity });
      return null;
    }

    // Validate title and message length
    const title = alert.title?.substring(0, 255) || 'Alert';
    const message = alert.message?.substring(0, 1000) || 'An alert was triggered';

    const result = await sql`
      INSERT INTO alert_history (
        user_id, model_id, trade_id, alert_type, severity, status,
        title, message, details, threshold_value, actual_value
      ) VALUES (
        ${alert.user_id},
        ${alert.model_id || null},
        ${alert.trade_id || null},
        ${alert.alert_type},
        ${alert.severity},
        'active',
        ${title},
        ${message},
        ${JSON.stringify(alert.details || {})},
        ${alert.threshold_value || null},
        ${alert.actual_value || null}
      )
      RETURNING *
    `;
    return result.rows[0] as AlertHistory;
  } catch (error) {
    console.error('Error creating alert history:', error);
    return null;
  }
}

/**
 * Get alert history for user
 */
export async function getAlertHistory(
  userId: string,
  options: {
    status?: string;
    limit?: number;
    offset?: number;
    modelId?: string;
  } = {}
): Promise<AlertHistory[]> {
  const { status, limit = 50, offset = 0, modelId } = options;
  
  try {
    let result;
    if (status && modelId) {
      result = await sql`
        SELECT * FROM alert_history 
        WHERE user_id = ${userId} 
        AND status = ${status}
        AND model_id = ${modelId}
        ORDER BY triggered_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (status) {
      result = await sql`
        SELECT * FROM alert_history 
        WHERE user_id = ${userId} AND status = ${status}
        ORDER BY triggered_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (modelId) {
      result = await sql`
        SELECT * FROM alert_history 
        WHERE user_id = ${userId} AND model_id = ${modelId}
        ORDER BY triggered_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      result = await sql`
        SELECT * FROM alert_history 
        WHERE user_id = ${userId}
        ORDER BY triggered_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }
    return result.rows as AlertHistory[];
  } catch (error) {
    console.error('Error fetching alert history:', error);
    return [];
  }
}

/**
 * Update alert status
 */
export async function updateAlertStatus(
  alertId: string,
  status: 'read' | 'dismissed' | 'acknowledged' | 'resolved'
): Promise<AlertHistory | null> {
  try {
    let result;
    
    // @ts-ignore - 'read' is not in the type definition but used in logic
    if (status === 'read' || status === 'acknowledged') {
      result = await sql`
        UPDATE alert_history 
        SET status = 'read', read_at = NOW()
        WHERE id = ${alertId}
        RETURNING *
      `;
    } else if (status === 'resolved') {
        // Map resolved to read/dismissed or handle separately if DB supports it
        // For now, mapping to read
      result = await sql`
        UPDATE alert_history 
        SET status = 'read', read_at = NOW()
        WHERE id = ${alertId}
        RETURNING *
      `;
    } else {
      result = await sql`
        UPDATE alert_history 
        SET status = 'dismissed', dismissed_at = NOW()
        WHERE id = ${alertId}
        RETURNING *
      `;
    }

    // @ts-ignore
    return result.rows[0] as AlertHistory;
  } catch (error) {
    console.error('Error updating alert status:', error);
    return null;
  }
}

/**
 * Dismiss alert
 */
export async function dismissAlert(alertId: string): Promise<boolean> {
  try {
    await sql`
      UPDATE alert_history 
      SET status = 'dismissed', dismissed_at = NOW()
      WHERE id = ${alertId}
    `;
    return true;
  } catch (error) {
    console.error('Error dismissing alert:', error);
    return false;
  }
}

/**
 * Detect large loss alert
 */
export function detectLargeLoss(
  trade: Trade,
  preference: AlertPreference | null
): AlertDetectionResult | null {
  if (!trade.pnl || !trade.pnl_percentage) return null;

  const thresholdPercentage = preference?.threshold_percentage ?? DEFAULT_THRESHOLDS.large_loss.percentage;
  const thresholdAbsolute = preference?.threshold_value ?? DEFAULT_THRESHOLDS.large_loss.absolute;

  const percentageTriggered = trade.pnl_percentage < thresholdPercentage;
  const absoluteTriggered = trade.pnl < thresholdAbsolute;

  if (percentageTriggered || absoluteTriggered) {
    const severity: AlertSeverity = 
      trade.pnl_percentage < thresholdPercentage * 2 ? 'critical' : 'warning';

    return {
      shouldAlert: true,
      alertType: 'large_loss',
      severity,
      title: 'Large Loss Detected',
      message: `Trade ${trade.symbol} resulted in a loss of ${trade.pnl_percentage.toFixed(2)}% ($${trade.pnl.toFixed(2)})`,
      thresholdValue: thresholdAbsolute,
      actualValue: trade.pnl,
      details: {
        symbol: trade.symbol,
        direction: trade.direction,
        entry_price: trade.entry_price,
        exit_price: trade.exit_price,
        pnl: trade.pnl,
        pnl_percentage: trade.pnl_percentage,
      },
    };
  }

  return null;
}

/**
 * Detect low confidence alert
 */
export function detectLowConfidence(
  trade: Trade,
  preference: AlertPreference | null
): AlertDetectionResult | null {
  if (!trade.signal_confidence) return null;

  const threshold = preference?.threshold_percentage ?? DEFAULT_THRESHOLDS.low_confidence.percentage;

  if (trade.signal_confidence < threshold) {
    return {
      shouldAlert: true,
      alertType: 'low_confidence',
      severity: trade.signal_confidence < threshold / 2 ? 'critical' : 'warning',
      title: 'Low Confidence Trade',
      message: `Trade ${trade.symbol} executed with only ${trade.signal_confidence.toFixed(1)}% confidence`,
      thresholdValue: threshold,
      actualValue: trade.signal_confidence,
      details: {
        symbol: trade.symbol,
        direction: trade.direction,
        signal_confidence: trade.signal_confidence,
      },
    };
  }

  return null;
}

/**
 * Detect high drawdown alert
 */
export function detectHighDrawdown(
  metrics: PerformanceMetric,
  preference: AlertPreference | null
): AlertDetectionResult | null {
  const threshold = preference?.threshold_percentage ?? DEFAULT_THRESHOLDS.high_drawdown.percentage;

  if (metrics.max_drawdown_percentage < threshold) {
    const severity: AlertSeverity = 
      metrics.max_drawdown_percentage < threshold * 1.5 ? 'critical' : 'warning';

    return {
      shouldAlert: true,
      alertType: 'high_drawdown',
      severity,
      title: 'High Drawdown Alert',
      message: `Maximum drawdown reached ${metrics.max_drawdown_percentage.toFixed(2)}%`,
      thresholdValue: threshold,
      actualValue: metrics.max_drawdown_percentage,
      details: {
        model_id: metrics.model_id,
        max_drawdown: metrics.max_drawdown,
        max_drawdown_percentage: metrics.max_drawdown_percentage,
        period_start: metrics.period_start,
        period_end: metrics.period_end,
      },
    };
  }

  return null;
}

/**
 * Detect consecutive losses
 */
export async function detectConsecutiveLosses(
  modelId: string,
  userId: string,
  preference: AlertPreference | null
): Promise<AlertDetectionResult | null> {
  const threshold = preference?.consecutive_count ?? DEFAULT_THRESHOLDS.consecutive_losses.count;

  try {
    // Fetch last N trades to check for consecutiveness
    const result = await sql`
      SELECT pnl
      FROM trades
      WHERE model_id = ${modelId} AND status = 'closed'
      ORDER BY entry_time DESC
      LIMIT ${threshold}
    `;

    const trades = result.rows;
    
    // Check if we have enough trades
    if (trades.length < threshold) return null;

    // Check if all of them are losses (pnl < 0)
    const isConsecutiveLoss = trades.every((t) => Number(t.pnl) < 0);

    if (isConsecutiveLoss) {
      return {
        shouldAlert: true,
        alertType: 'consecutive_losses',
        severity: threshold >= 5 ? 'critical' : 'warning',
        title: 'Consecutive Losses Detected',
        message: `${threshold} consecutive losing trades detected`,
        thresholdValue: threshold,
        actualValue: threshold,
        details: {
          model_id: modelId,
          consecutive_losses: threshold,
          threshold,
        },
      };
    }
  } catch (error) {
    console.error('Error detecting consecutive losses:', error);
  }

  return null;
}

/**
 * Detect risk limit breach
 */
export async function detectRiskLimitBreach(
  trade: Trade,
  preference: AlertPreference | null
): Promise<AlertDetectionResult | null> {
  const dailyLossLimit = preference?.threshold_percentage ?? DEFAULT_THRESHOLDS.risk_limit_breach.dailyLossLimit;
  
  try {
    // Calculate today's total PnL
    const result = await sql`
      SELECT SUM(pnl_percentage) as daily_pnl_pct
      FROM trades
      WHERE model_id = ${trade.model_id}
      AND status = 'closed'
      AND entry_time > CURRENT_DATE
    `;

    const dailyPnlPct = parseFloat(result.rows[0]?.daily_pnl_pct || '0');
    
    // Check if daily loss limit breached (note: limit is usually negative, e.g. -5%)
    // If dailyPnlPct is -6%, and limit is -5%, it's breached.
    const limitBreached = dailyPnlPct <= dailyLossLimit;

    if (limitBreached) {
      return {
        shouldAlert: true,
        alertType: 'risk_limit_breach',
        severity: 'critical',
        title: 'Risk Limit Breached',
        message: `Daily loss limit reached. Total daily PnL: ${dailyPnlPct.toFixed(2)}% (Limit: ${dailyLossLimit}%)`,
        thresholdValue: dailyLossLimit,
        actualValue: dailyPnlPct,
        details: {
          model_id: trade.model_id,
          daily_pnl_percentage: dailyPnlPct,
          limit: dailyLossLimit,
        },
      };
    }
  } catch (error) {
    console.error('Error detecting risk limit breach:', error);
  }

  return null;
}

/**
 * Detect model degradation
 */
export async function detectModelDegradation(
  modelId: string,
  currentMetrics: PerformanceMetric,
  preference: AlertPreference | null
): Promise<AlertDetectionResult | null> {
  const winRateThreshold = preference?.threshold_percentage ?? 
    DEFAULT_THRESHOLDS.model_degradation.winRateDropPercentage;

  try {
    // Get historical average metrics
    const result = await sql`
      SELECT AVG(win_rate) as avg_win_rate, AVG(sharpe_ratio) as avg_sharpe
      FROM performance_metrics
      WHERE model_id = ${modelId}
      AND created_at < ${currentMetrics.created_at.toISOString()}
      AND created_at > NOW() - INTERVAL '30 days'
    `;

    const historicalAvg = result.rows[0];
    if (!historicalAvg?.avg_win_rate) return null;

    const winRateDrop = (historicalAvg.avg_win_rate - currentMetrics.win_rate) * 100;
    const sharpeDropped = historicalAvg.avg_sharpe && currentMetrics.sharpe_ratio &&
      (historicalAvg.avg_sharpe - currentMetrics.sharpe_ratio) > DEFAULT_THRESHOLDS.model_degradation.sharpeRatioDrop;

    if (winRateDrop > winRateThreshold || sharpeDropped) {
      return {
        shouldAlert: true,
        alertType: 'model_degradation',
        severity: winRateDrop > winRateThreshold * 1.5 ? 'critical' : 'warning',
        title: 'Model Performance Degradation',
        message: `Win rate dropped by ${winRateDrop.toFixed(1)}% from historical average`,
        thresholdValue: winRateThreshold,
        actualValue: winRateDrop,
        details: {
          model_id: modelId,
          current_win_rate: currentMetrics.win_rate,
          historical_win_rate: historicalAvg.avg_win_rate,
          win_rate_drop: winRateDrop,
          current_sharpe: currentMetrics.sharpe_ratio,
          historical_sharpe: historicalAvg.avg_sharpe,
        },
      };
    }
  } catch (error) {
    console.error('Error detecting model degradation:', error);
  }

  return null;
}

/**
 * Process trade for alerts
 */
export async function processTradeAlerts(
  trade: Trade,
  userId: string
): Promise<AlertDetectionResult[]> {
  const alerts: AlertDetectionResult[] = [];
  const preferences = await getAlertPreferences(userId, trade.model_id);

  const prefMap = new Map(preferences.map(p => [p.alert_type, p]));

  // Check for large loss
  const largeLossAlert = detectLargeLoss(trade, prefMap.get('large_loss') || null);
  if (largeLossAlert) alerts.push(largeLossAlert);

  // Check for low confidence
  const lowConfidenceAlert = detectLowConfidence(trade, prefMap.get('low_confidence') || null);
  if (lowConfidenceAlert) alerts.push(lowConfidenceAlert);

  // Check for consecutive losses
  const consecutiveLossAlert = await detectConsecutiveLosses(
    trade.model_id,
    userId,
    prefMap.get('consecutive_losses') || null
  );
  if (consecutiveLossAlert) alerts.push(consecutiveLossAlert);

  // Check for risk limit breach
  const riskLimitAlert = await detectRiskLimitBreach(
    trade, 
    prefMap.get('risk_limit_breach') || null
  );
  if (riskLimitAlert) alerts.push(riskLimitAlert);

  return alerts;
}

/**
 * Process performance metrics for alerts
 */
export async function processMetricsAlerts(
  metrics: PerformanceMetric,
  userId: string
): Promise<AlertDetectionResult[]> {
  const alerts: AlertDetectionResult[] = [];
  const preferences = await getAlertPreferences(userId, metrics.model_id);

  const prefMap = new Map(preferences.map(p => [p.alert_type, p]));

  // Check for high drawdown
  const drawdownAlert = detectHighDrawdown(metrics, prefMap.get('high_drawdown') || null);
  if (drawdownAlert) alerts.push(drawdownAlert);

  // Check for model degradation
  const degradationAlert = await detectModelDegradation(
    metrics.model_id,
    metrics,
    prefMap.get('model_degradation') || null
  );
  if (degradationAlert) alerts.push(degradationAlert);

  return alerts;
}

/**
 * Get active alerts count for user
 */
export async function getActiveAlertsCount(userId: string): Promise<number> {
  try {
    const result = await sql`
      SELECT COUNT(*) as count
      FROM alert_history
      WHERE user_id = ${userId} AND status = 'active'
    `;
    return parseInt(result.rows[0]?.count || '0', 10);
  } catch (error) {
    console.error('Error getting active alerts count:', error);
    return 0;
  }
}
