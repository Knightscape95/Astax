// Alert detection thresholds (defaults)
export const DEFAULT_THRESHOLDS = {
  large_loss: {
    percentage: -5, // -5% loss
    absolute: -1000, // $1000 loss
  },
  low_confidence: {
    percentage: 50, // Below 50% confidence
  },
  high_drawdown: {
    percentage: -10, // -10% drawdown
  },
  consecutive_losses: {
    count: 3, // 3 consecutive losses
  },
  model_degradation: {
    winRateDropPercentage: 15, // 15% drop in win rate
    sharpeRatioDrop: 0.5, // 0.5 drop in Sharpe ratio
  },
  risk_limit_breach: {
    dailyLossLimit: -5, // -5% daily loss limit
    positionSizeLimit: 10, // 10% max position size
  },
};
