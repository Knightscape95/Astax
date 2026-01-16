"""
Data Preprocessors Module
=========================

Provides data preprocessing and feature engineering utilities
for preparing market data for ML models.

Features:
- Normalization/Standardization
- Technical indicators (RSI, MACD, Moving Averages)
- Feature creation (lag features, rolling statistics)
- Train/test splitting
- Missing value handling

Example Usage:
    from trading_ml_utils.data import DataPreprocessor
    
    preprocessor = DataPreprocessor()
    
    # Add technical indicators
    data = preprocessor.add_technical_indicators(df, indicators=['rsi', 'macd', 'sma'])
    
    # Normalize features
    data_scaled, scaler = preprocessor.normalize(data, method='minmax')
    
    # Create sequences for LSTM
    X, y = preprocessor.create_sequences(data_scaled, lookback=60)
"""

import logging
from typing import List, Optional, Tuple, Union, Dict, Any
from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..utils.errors import PreprocessingError

logger = logging.getLogger(__name__)


@dataclass
class PreprocessResult:
    """
    Container for preprocessing results.
    
    Attributes:
        data: Preprocessed DataFrame
        scaler: Fitted scaler object (if normalization applied)
        feature_names: List of feature column names
        metadata: Additional preprocessing information
    """
    data: pd.DataFrame
    scaler: Optional[Any]
    feature_names: List[str]
    metadata: Dict[str, Any]


class DataPreprocessor:
    """
    Data preprocessing and feature engineering for trading ML.
    
    This class provides all the preprocessing steps needed to prepare
    market data for machine learning models.
    
    Example:
        preprocessor = DataPreprocessor()
        
        # Full preprocessing pipeline
        result = preprocessor.preprocess_pipeline(
            df,
            add_indicators=True,
            normalize=True,
            create_target=True,
            lookback=60
        )
    """
    
    def __init__(self):
        """Initialize the preprocessor."""
        self.scaler = None
        self.feature_names = []
        
    def add_technical_indicators(
        self,
        df: pd.DataFrame,
        indicators: List[str] = None,
        price_column: str = 'close'
    ) -> pd.DataFrame:
        """
        Add technical indicators to the dataframe.
        
        Available indicators:
        - 'sma_20', 'sma_50', 'sma_200': Simple Moving Averages
        - 'ema_12', 'ema_26': Exponential Moving Averages
        - 'rsi': Relative Strength Index (14-period)
        - 'macd': Moving Average Convergence Divergence
        - 'bb': Bollinger Bands
        - 'atr': Average True Range
        - 'obv': On-Balance Volume
        - 'returns': Daily returns
        - 'volatility': Rolling volatility
        
        Args:
            df: DataFrame with OHLCV data
            indicators: List of indicators to add (default: common set)
            price_column: Name of the price column to use
            
        Returns:
            DataFrame with added indicator columns
            
        Example:
            df = preprocessor.add_technical_indicators(
                df, 
                indicators=['rsi', 'macd', 'sma_20', 'sma_50']
            )
        """
        df = df.copy()
        
        if indicators is None:
            indicators = ['sma_20', 'sma_50', 'rsi', 'macd', 'returns', 'volatility']
            
        # Ensure we have the required columns
        if price_column not in df.columns:
            raise PreprocessingError(
                f"Column '{price_column}' not found in DataFrame.\n\n"
                f"💡 Available columns: {list(df.columns)}"
            )
            
        price = df[price_column]
        
        for indicator in indicators:
            try:
                indicator = indicator.lower()
                
                # Simple Moving Averages
                if indicator.startswith('sma_'):
                    period = int(indicator.split('_')[1])
                    df[indicator] = price.rolling(window=period).mean()
                    
                # Exponential Moving Averages
                elif indicator.startswith('ema_'):
                    period = int(indicator.split('_')[1])
                    df[indicator] = price.ewm(span=period, adjust=False).mean()
                    
                # RSI (Relative Strength Index)
                elif indicator == 'rsi':
                    df['rsi'] = self._calculate_rsi(price, period=14)
                    
                # MACD
                elif indicator == 'macd':
                    ema12 = price.ewm(span=12, adjust=False).mean()
                    ema26 = price.ewm(span=26, adjust=False).mean()
                    df['macd'] = ema12 - ema26
                    df['macd_signal'] = df['macd'].ewm(span=9, adjust=False).mean()
                    df['macd_hist'] = df['macd'] - df['macd_signal']
                    
                # Bollinger Bands
                elif indicator == 'bb':
                    sma20 = price.rolling(window=20).mean()
                    std20 = price.rolling(window=20).std()
                    df['bb_upper'] = sma20 + (std20 * 2)
                    df['bb_lower'] = sma20 - (std20 * 2)
                    df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / sma20
                    
                # Average True Range
                elif indicator == 'atr':
                    if all(col in df.columns for col in ['high', 'low', 'close']):
                        df['atr'] = self._calculate_atr(df, period=14)
                    else:
                        logger.warning("ATR requires high, low, close columns")
                        
                # On-Balance Volume
                elif indicator == 'obv':
                    if 'volume' in df.columns:
                        df['obv'] = self._calculate_obv(df)
                    else:
                        logger.warning("OBV requires volume column")
                        
                # Daily returns
                elif indicator == 'returns':
                    df['returns'] = price.pct_change()
                    
                # Rolling volatility
                elif indicator == 'volatility':
                    df['volatility'] = price.pct_change().rolling(window=20).std()
                    
                else:
                    logger.warning(f"Unknown indicator: {indicator}")
                    
            except Exception as e:
                logger.warning(f"Failed to calculate {indicator}: {e}")
                
        return df
        
    def _calculate_rsi(self, prices: pd.Series, period: int = 14) -> pd.Series:
        """
        Calculate Relative Strength Index.
        
        RSI ranges from 0-100:
        - Above 70: Overbought (consider selling)
        - Below 30: Oversold (consider buying)
        """
        delta = prices.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return rsi
        
    def _calculate_atr(self, df: pd.DataFrame, period: int = 14) -> pd.Series:
        """
        Calculate Average True Range.
        
        ATR measures market volatility by decomposing the entire
        range of an asset price for that period.
        """
        high = df['high']
        low = df['low']
        close = df['close']
        
        tr1 = high - low
        tr2 = abs(high - close.shift())
        tr3 = abs(low - close.shift())
        
        true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        atr = true_range.rolling(window=period).mean()
        return atr
        
    def _calculate_obv(self, df: pd.DataFrame) -> pd.Series:
        """
        Calculate On-Balance Volume.
        
        OBV is a momentum indicator that uses volume flow to
        predict changes in stock price.
        """
        price_change = df['close'].diff()
        volume = df['volume']
        
        obv = (np.sign(price_change) * volume).fillna(0).cumsum()
        return obv
        
    def normalize(
        self,
        df: pd.DataFrame,
        method: str = 'minmax',
        columns: Optional[List[str]] = None,
        fit: bool = True
    ) -> Tuple[pd.DataFrame, Any]:
        """
        Normalize/standardize features.
        
        Methods:
        - 'minmax': Scale to [0, 1] range (best for neural networks)
        - 'standard': Zero mean, unit variance (best for tree models)
        - 'robust': Robust to outliers
        
        Args:
            df: Input DataFrame
            method: Normalization method
            columns: Columns to normalize (default: all numeric)
            fit: Whether to fit the scaler (False for test data)
            
        Returns:
            Tuple of (normalized DataFrame, scaler object)
            
        Example:
            # Normalize training data
            train_scaled, scaler = preprocessor.normalize(train_df, fit=True)
            
            # Use same scaler for test data
            test_scaled, _ = preprocessor.normalize(test_df, fit=False)
        """
        from sklearn.preprocessing import MinMaxScaler, StandardScaler, RobustScaler
        
        df = df.copy()
        
        if columns is None:
            columns = df.select_dtypes(include=[np.number]).columns.tolist()
            
        # Select scaler
        if fit:
            if method == 'minmax':
                self.scaler = MinMaxScaler(feature_range=(0, 1))
            elif method == 'standard':
                self.scaler = StandardScaler()
            elif method == 'robust':
                self.scaler = RobustScaler()
            else:
                raise PreprocessingError(
                    f"Unknown normalization method: '{method}'\n\n"
                    "💡 Available methods:\n"
                    "   - 'minmax': Scale to [0, 1]\n"
                    "   - 'standard': Zero mean, unit variance\n"
                    "   - 'robust': Robust to outliers"
                )
                
            df[columns] = self.scaler.fit_transform(df[columns])
        else:
            if self.scaler is None:
                raise PreprocessingError(
                    "No scaler fitted! Call normalize with fit=True first.\n\n"
                    "💡 Example:\n"
                    "   train_scaled, _ = preprocessor.normalize(train, fit=True)\n"
                    "   test_scaled, _ = preprocessor.normalize(test, fit=False)"
                )
            df[columns] = self.scaler.transform(df[columns])
            
        return df, self.scaler
        
    def inverse_normalize(
        self,
        data: np.ndarray,
        columns: Optional[List[str]] = None
    ) -> np.ndarray:
        """
        Inverse transform normalized data back to original scale.
        
        Args:
            data: Normalized data array
            columns: Column names (for multi-column scaler)
            
        Returns:
            Data in original scale
        """
        if self.scaler is None:
            raise PreprocessingError(
                "No scaler fitted! Cannot inverse transform."
            )
        return self.scaler.inverse_transform(data)
        
    def create_sequences(
        self,
        data: Union[pd.DataFrame, np.ndarray],
        lookback: int = 60,
        prediction_horizon: int = 1,
        target_column: Optional[str] = None
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Create sequences for time series models (LSTM, Transformer).
        
        This creates sliding window sequences where each sample contains
        'lookback' historical values to predict 'prediction_horizon' steps ahead.
        
        Args:
            data: Input data (DataFrame or array)
            lookback: Number of historical time steps to use
            prediction_horizon: Number of steps ahead to predict
            target_column: Column to use as target (for DataFrame)
            
        Returns:
            Tuple of (X, y) arrays ready for model training
            
        Example:
            X, y = preprocessor.create_sequences(
                data, 
                lookback=60,  # Use 60 days of history
                prediction_horizon=1  # Predict next day
            )
            # X shape: (samples, lookback, features)
            # y shape: (samples,)
        """
        if isinstance(data, pd.DataFrame):
            if target_column:
                values = data[target_column].values
            else:
                values = data.values
        else:
            values = data
            
        # Ensure 2D array
        if values.ndim == 1:
            values = values.reshape(-1, 1)
            
        X, y = [], []
        
        for i in range(lookback, len(values) - prediction_horizon + 1):
            X.append(values[i - lookback:i])
            # Target is the first column by default
            y.append(values[i + prediction_horizon - 1, 0])
            
        X = np.array(X)
        y = np.array(y)
        
        print(f"📊 Created {len(X)} sequences")
        print(f"   X shape: {X.shape} (samples, lookback, features)")
        print(f"   y shape: {y.shape}")
        
        return X, y
        
    def train_test_split(
        self,
        X: np.ndarray,
        y: np.ndarray,
        train_ratio: float = 0.8,
        shuffle: bool = False
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """
        Split data into training and testing sets.
        
        For time series data, we typically don't shuffle to maintain
        temporal order and avoid look-ahead bias.
        
        Args:
            X: Features array
            y: Target array
            train_ratio: Fraction of data for training (default: 0.8)
            shuffle: Whether to shuffle data (default: False for time series)
            
        Returns:
            Tuple of (X_train, X_test, y_train, y_test)
            
        Example:
            X_train, X_test, y_train, y_test = preprocessor.train_test_split(
                X, y, train_ratio=0.8
            )
        """
        if shuffle:
            # Shuffle while keeping X and y aligned
            indices = np.random.permutation(len(X))
            X = X[indices]
            y = y[indices]
            
        split_idx = int(len(X) * train_ratio)
        
        X_train = X[:split_idx]
        X_test = X[split_idx:]
        y_train = y[:split_idx]
        y_test = y[split_idx:]
        
        print(f"📊 Train/Test split:")
        print(f"   Training: {len(X_train)} samples")
        print(f"   Testing: {len(X_test)} samples")
        
        return X_train, X_test, y_train, y_test
        
    def handle_missing_values(
        self,
        df: pd.DataFrame,
        method: str = 'forward_fill',
        drop_threshold: float = 0.5
    ) -> pd.DataFrame:
        """
        Handle missing values in the data.
        
        Methods:
        - 'forward_fill': Fill with previous value (best for time series)
        - 'backward_fill': Fill with next value
        - 'interpolate': Linear interpolation
        - 'mean': Fill with column mean
        - 'drop': Drop rows with missing values
        
        Args:
            df: Input DataFrame
            method: Method to handle missing values
            drop_threshold: Drop columns with more than this fraction missing
            
        Returns:
            DataFrame with missing values handled
        """
        df = df.copy()
        
        # Report missing values
        missing = df.isnull().sum()
        missing_pct = (missing / len(df)) * 100
        
        if missing.sum() > 0:
            print("📊 Missing values detected:")
            for col in missing[missing > 0].index:
                print(f"   {col}: {missing[col]} ({missing_pct[col]:.1f}%)")
                
        # Drop columns with too many missing values
        cols_to_drop = missing_pct[missing_pct > drop_threshold * 100].index.tolist()
        if cols_to_drop:
            print(f"⚠️ Dropping columns with >{drop_threshold*100}% missing: {cols_to_drop}")
            df = df.drop(columns=cols_to_drop)
            
        # Handle remaining missing values
        if method == 'forward_fill':
            df = df.fillna(method='ffill')
            df = df.fillna(method='bfill')  # Handle initial missing
        elif method == 'backward_fill':
            df = df.fillna(method='bfill')
        elif method == 'interpolate':
            df = df.interpolate(method='linear')
        elif method == 'mean':
            df = df.fillna(df.mean())
        elif method == 'drop':
            df = df.dropna()
        else:
            raise PreprocessingError(
                f"Unknown missing value method: '{method}'\n\n"
                "💡 Available methods:\n"
                "   - 'forward_fill': Use previous value\n"
                "   - 'interpolate': Linear interpolation\n"
                "   - 'mean': Column mean\n"
                "   - 'drop': Remove rows"
            )
            
        remaining_missing = df.isnull().sum().sum()
        if remaining_missing > 0:
            print(f"⚠️ {remaining_missing} missing values remain - dropping rows")
            df = df.dropna()
            
        print(f"✅ Missing values handled. Final shape: {df.shape}")
        
        return df
        
    def preprocess_pipeline(
        self,
        df: pd.DataFrame,
        add_indicators: bool = True,
        indicators: Optional[List[str]] = None,
        normalize: bool = True,
        normalize_method: str = 'minmax',
        handle_missing: bool = True,
        missing_method: str = 'forward_fill',
        lookback: int = 60,
        prediction_horizon: int = 1,
        train_ratio: float = 0.8,
        target_column: str = 'close'
    ) -> Dict[str, Any]:
        """
        Complete preprocessing pipeline.
        
        This is a convenience method that runs all preprocessing steps
        in the correct order.
        
        Args:
            df: Raw market data DataFrame
            add_indicators: Whether to add technical indicators
            indicators: List of indicators to add
            normalize: Whether to normalize features
            normalize_method: Normalization method
            handle_missing: Whether to handle missing values
            missing_method: Missing value handling method
            lookback: Sequence length for time series models
            prediction_horizon: Steps ahead to predict
            train_ratio: Fraction of data for training
            target_column: Column to predict
            
        Returns:
            Dictionary containing:
            - 'X_train', 'X_test': Feature arrays
            - 'y_train', 'y_test': Target arrays
            - 'scaler': Fitted scaler (if normalized)
            - 'feature_names': List of feature names
            - 'metadata': Preprocessing parameters
            
        Example:
            result = preprocessor.preprocess_pipeline(
                df,
                add_indicators=True,
                lookback=60,
                train_ratio=0.8
            )
            X_train = result['X_train']
            y_train = result['y_train']
        """
        print("🔄 Starting preprocessing pipeline...")
        print("=" * 50)
        
        # Step 1: Handle missing values
        if handle_missing:
            print("\n📋 Step 1: Handling missing values")
            df = self.handle_missing_values(df, method=missing_method)
            
        # Step 2: Add technical indicators
        if add_indicators:
            print("\n📋 Step 2: Adding technical indicators")
            df = self.add_technical_indicators(df, indicators=indicators)
            
        # Step 3: Handle any new missing values from indicators
        if add_indicators:
            print("\n📋 Step 3: Cleaning indicator NaN values")
            df = self.handle_missing_values(df, method=missing_method)
            
        # Get feature columns (excluding date and symbol)
        exclude_cols = ['date', 'Date', 'datetime', 'Datetime', 'Symbol', 'symbol']
        feature_cols = [c for c in df.columns if c not in exclude_cols]
        self.feature_names = feature_cols
        
        # Extract feature data
        data = df[feature_cols].values
        
        # Step 4: Normalize
        scaler = None
        if normalize:
            print(f"\n📋 Step 4: Normalizing with {normalize_method}")
            from sklearn.preprocessing import MinMaxScaler, StandardScaler
            
            if normalize_method == 'minmax':
                scaler = MinMaxScaler(feature_range=(0, 1))
            else:
                scaler = StandardScaler()
                
            data = scaler.fit_transform(data)
            self.scaler = scaler
            
        # Step 5: Create sequences
        print(f"\n📋 Step 5: Creating sequences (lookback={lookback})")
        X, y = self.create_sequences(
            data,
            lookback=lookback,
            prediction_horizon=prediction_horizon
        )
        
        # Step 6: Train/test split
        print(f"\n📋 Step 6: Train/test split ({train_ratio:.0%} train)")
        X_train, X_test, y_train, y_test = self.train_test_split(
            X, y, train_ratio=train_ratio
        )
        
        print("\n" + "=" * 50)
        print("✅ Preprocessing complete!")
        print(f"   Features: {len(self.feature_names)}")
        print(f"   Training samples: {len(X_train)}")
        print(f"   Testing samples: {len(X_test)}")
        
        return {
            'X_train': X_train,
            'X_test': X_test,
            'y_train': y_train,
            'y_test': y_test,
            'scaler': scaler,
            'feature_names': self.feature_names,
            'metadata': {
                'lookback': lookback,
                'prediction_horizon': prediction_horizon,
                'train_ratio': train_ratio,
                'normalize_method': normalize_method if normalize else None,
                'indicators': indicators or ['default'],
                'n_features': len(self.feature_names)
            }
        }
