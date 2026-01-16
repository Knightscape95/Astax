"""
Data Fetchers Module
====================

Provides data fetching capabilities from multiple market data sources:
- Yahoo Finance (free, most reliable)
- Alpha Vantage (free tier with API key)
- NSE/BSE APIs (Indian markets)

Features:
- Rate limiting with exponential backoff
- Automatic retry logic
- Beginner-friendly error messages
- Data caching to minimize API calls

Example Usage:
    from trading_ml_utils.data import DataFetcher
    
    # Create fetcher for Yahoo Finance
    fetcher = DataFetcher(source='yahoo')
    
    # Fetch historical data
    data = fetcher.fetch(
        symbols=['AAPL', 'GOOGL'],
        start_date='2020-01-01',
        end_date='2023-12-31'
    )
    
    # For Alpha Vantage (requires API key)
    fetcher = DataFetcher(source='alpha_vantage', api_key='YOUR_KEY')
"""

import time
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import List, Optional, Union, Dict, Any
from dataclasses import dataclass

import pandas as pd
import numpy as np

from ..utils.errors import DataFetchError, RateLimitError

# Configure logging
logger = logging.getLogger(__name__)


@dataclass
class FetchResult:
    """
    Container for fetch operation results.
    
    Attributes:
        data: The fetched DataFrame
        symbols_fetched: List of successfully fetched symbols
        symbols_failed: List of symbols that failed to fetch
        metadata: Additional information about the fetch operation
    """
    data: pd.DataFrame
    symbols_fetched: List[str]
    symbols_failed: List[str]
    metadata: Dict[str, Any]


class RateLimiter:
    """
    Rate limiter with exponential backoff.
    
    This helps you stay within API rate limits automatically.
    When rate limits are hit, it will wait and retry.
    
    Args:
        calls_per_minute: Maximum number of API calls per minute
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay in seconds for backoff
        max_delay: Maximum delay in seconds
        
    Example:
        limiter = RateLimiter(calls_per_minute=5)
        limiter.wait()  # Call before each API request
    """
    
    def __init__(
        self,
        calls_per_minute: int = 5,
        max_retries: int = 5,
        base_delay: float = 1.0,
        max_delay: float = 60.0
    ):
        self.calls_per_minute = calls_per_minute
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.call_timestamps: List[float] = []
        self.retry_count = 0
        
    def wait(self) -> None:
        """
        Wait if necessary to respect rate limits.
        
        Call this before each API request. It will automatically
        pause execution if you're making requests too quickly.
        """
        now = time.time()
        
        # Remove timestamps older than 1 minute
        self.call_timestamps = [
            ts for ts in self.call_timestamps 
            if now - ts < 60
        ]
        
        # If at rate limit, wait
        if len(self.call_timestamps) >= self.calls_per_minute:
            oldest = min(self.call_timestamps)
            wait_time = 60 - (now - oldest) + 1
            if wait_time > 0:
                logger.info(f"Rate limit reached. Waiting {wait_time:.1f} seconds...")
                print(f"⏳ Rate limit reached. Waiting {wait_time:.1f} seconds...")
                time.sleep(wait_time)
                
        self.call_timestamps.append(time.time())
        
    def handle_rate_limit(self, retry_after: Optional[float] = None) -> None:
        """
        Handle a rate limit response from the API.
        
        This implements exponential backoff: each retry waits longer
        than the previous one, up to max_delay seconds.
        
        Args:
            retry_after: Seconds to wait (from API response), or None for auto-backoff
            
        Raises:
            RateLimitError: If max retries exceeded
        """
        self.retry_count += 1
        
        if self.retry_count > self.max_retries:
            raise RateLimitError(
                f"Max retries ({self.max_retries}) exceeded. "
                "Try again later or use a different data source.\n\n"
                "💡 Tip: Yahoo Finance has generous rate limits, "
                "while Alpha Vantage free tier is limited to 5 calls/minute."
            )
            
        if retry_after:
            delay = retry_after
        else:
            # Exponential backoff: 1s, 2s, 4s, 8s, ...
            delay = min(
                self.base_delay * (2 ** (self.retry_count - 1)),
                self.max_delay
            )
            
        logger.info(f"Rate limit hit. Retrying in {delay:.1f} seconds (attempt {self.retry_count}/{self.max_retries})")
        print(f"⏳ Rate limit hit. Retrying in {delay:.1f}s (attempt {self.retry_count}/{self.max_retries})...")
        time.sleep(delay)
        
    def reset_retries(self) -> None:
        """Reset the retry counter after a successful request."""
        self.retry_count = 0


class BaseDataFetcher(ABC):
    """
    Abstract base class for data fetchers.
    
    Inherit from this class to implement custom data sources.
    """
    
    @abstractmethod
    def fetch(
        self,
        symbols: Union[str, List[str]],
        start_date: str,
        end_date: str,
        **kwargs
    ) -> FetchResult:
        """Fetch historical data for given symbols."""
        pass
    
    @abstractmethod
    def validate_connection(self) -> bool:
        """Test if the data source is accessible."""
        pass


class YahooFinanceFetcher(BaseDataFetcher):
    """
    Data fetcher for Yahoo Finance.
    
    Yahoo Finance is free and doesn't require an API key.
    It's the most reliable option for US stocks and major indices.
    
    Note: Yahoo Finance may have occasional outages and rate limits.
    This fetcher handles them automatically with retries.
    
    Example:
        fetcher = YahooFinanceFetcher()
        result = fetcher.fetch(['AAPL', 'MSFT'], '2020-01-01', '2023-12-31')
        print(result.data.head())
    """
    
    def __init__(self, rate_limiter: Optional[RateLimiter] = None):
        """
        Initialize Yahoo Finance fetcher.
        
        Args:
            rate_limiter: Custom rate limiter, or None for default settings
        """
        self.rate_limiter = rate_limiter or RateLimiter(calls_per_minute=30)
        self._yf = None
        
    def _get_yfinance(self):
        """Lazy import yfinance to avoid import errors if not installed."""
        if self._yf is None:
            try:
                import yfinance as yf
                self._yf = yf
            except ImportError:
                raise DataFetchError(
                    "yfinance is not installed!\n\n"
                    "💡 Fix: Run this command in a code cell:\n"
                    "   !pip install yfinance\n\n"
                    "Then restart the runtime if needed."
                )
        return self._yf
        
    def fetch(
        self,
        symbols: Union[str, List[str]],
        start_date: str,
        end_date: str,
        interval: str = "1d",
        progress: bool = True
    ) -> FetchResult:
        """
        Fetch historical stock data from Yahoo Finance.
        
        Args:
            symbols: Stock ticker(s) to fetch (e.g., 'AAPL' or ['AAPL', 'GOOGL'])
            start_date: Start date in 'YYYY-MM-DD' format
            end_date: End date in 'YYYY-MM-DD' format
            interval: Data interval ('1d', '1h', '1wk', '1mo')
            progress: Show download progress bar
            
        Returns:
            FetchResult containing the data and metadata
            
        Example:
            result = fetcher.fetch('AAPL', '2020-01-01', '2023-12-31')
            print(f"Fetched {len(result.data)} rows")
        """
        yf = self._get_yfinance()
        
        # Normalize symbols to list
        if isinstance(symbols, str):
            symbols = [symbols]
            
        all_data = []
        symbols_fetched = []
        symbols_failed = []
        
        for symbol in symbols:
            self.rate_limiter.wait()
            
            try:
                print(f"📊 Fetching {symbol}...", end=" ")
                
                ticker = yf.Ticker(symbol)
                data = ticker.history(
                    start=start_date,
                    end=end_date,
                    interval=interval
                )
                
                if data.empty:
                    print("❌ No data found")
                    symbols_failed.append(symbol)
                    continue
                    
                # Add symbol column and standardize columns
                data['Symbol'] = symbol
                data = data.reset_index()
                
                # Rename columns to standard names
                data = data.rename(columns={
                    'Date': 'date',
                    'Datetime': 'date',
                    'Open': 'open',
                    'High': 'high',
                    'Low': 'low',
                    'Close': 'close',
                    'Volume': 'volume',
                    'Dividends': 'dividends',
                    'Stock Splits': 'stock_splits'
                })
                
                all_data.append(data)
                symbols_fetched.append(symbol)
                print(f"✅ {len(data)} rows")
                
                self.rate_limiter.reset_retries()
                
            except Exception as e:
                error_str = str(e).lower()
                
                if 'rate limit' in error_str or '429' in error_str:
                    self.rate_limiter.handle_rate_limit()
                    # Retry this symbol
                    symbols.append(symbol)
                else:
                    print(f"❌ Error: {e}")
                    symbols_failed.append(symbol)
                    logger.error(f"Failed to fetch {symbol}: {e}")
                    
        if not all_data:
            raise DataFetchError(
                f"Could not fetch data for any symbols: {symbols_failed}\n\n"
                "💡 Common fixes:\n"
                "   1. Check if the ticker symbol is correct\n"
                "   2. Try a shorter date range\n"
                "   3. Check your internet connection\n"
                "   4. The symbol might not be available on Yahoo Finance"
            )
            
        # Combine all data
        combined_data = pd.concat(all_data, ignore_index=True)
        
        return FetchResult(
            data=combined_data,
            symbols_fetched=symbols_fetched,
            symbols_failed=symbols_failed,
            metadata={
                'source': 'yahoo_finance',
                'start_date': start_date,
                'end_date': end_date,
                'interval': interval,
                'fetch_time': datetime.now().isoformat()
            }
        )
        
    def validate_connection(self) -> bool:
        """
        Test if Yahoo Finance is accessible.
        
        Returns:
            True if connection is working, False otherwise
        """
        try:
            yf = self._get_yfinance()
            ticker = yf.Ticker('AAPL')
            info = ticker.info
            return 'symbol' in info or 'shortName' in info
        except Exception:
            return False


class AlphaVantageFetcher(BaseDataFetcher):
    """
    Data fetcher for Alpha Vantage API.
    
    Alpha Vantage provides high-quality market data but requires
    an API key. Free tier allows 5 API calls per minute.
    
    Get your free API key at: https://www.alphavantage.co/support/#api-key
    
    Example:
        fetcher = AlphaVantageFetcher(api_key='YOUR_API_KEY')
        result = fetcher.fetch(['AAPL'], '2020-01-01', '2023-12-31')
    """
    
    def __init__(self, api_key: str, rate_limiter: Optional[RateLimiter] = None):
        """
        Initialize Alpha Vantage fetcher.
        
        Args:
            api_key: Your Alpha Vantage API key
            rate_limiter: Custom rate limiter (default: 5 calls/minute)
        """
        if not api_key:
            raise DataFetchError(
                "Alpha Vantage requires an API key!\n\n"
                "💡 Get your free API key at:\n"
                "   https://www.alphavantage.co/support/#api-key\n\n"
                "Then store it in Colab Secrets:\n"
                "   1. Click the 🔑 icon in the left sidebar\n"
                "   2. Add a secret named 'ALPHA_VANTAGE_KEY'\n"
                "   3. Paste your API key as the value"
            )
            
        self.api_key = api_key
        self.rate_limiter = rate_limiter or RateLimiter(calls_per_minute=5)
        self.base_url = "https://www.alphavantage.co/query"
        
    def fetch(
        self,
        symbols: Union[str, List[str]],
        start_date: str,
        end_date: str,
        output_size: str = "full"
    ) -> FetchResult:
        """
        Fetch historical stock data from Alpha Vantage.
        
        Args:
            symbols: Stock ticker(s) to fetch
            start_date: Start date in 'YYYY-MM-DD' format
            end_date: End date in 'YYYY-MM-DD' format
            output_size: 'compact' (100 days) or 'full' (20+ years)
            
        Returns:
            FetchResult containing the data and metadata
        """
        import requests
        
        if isinstance(symbols, str):
            symbols = [symbols]
            
        all_data = []
        symbols_fetched = []
        symbols_failed = []
        
        start_dt = pd.to_datetime(start_date)
        end_dt = pd.to_datetime(end_date)
        
        for symbol in symbols:
            self.rate_limiter.wait()
            
            try:
                print(f"📊 Fetching {symbol}...", end=" ")
                
                params = {
                    'function': 'TIME_SERIES_DAILY',
                    'symbol': symbol,
                    'outputsize': output_size,
                    'apikey': self.api_key
                }
                
                response = requests.get(self.base_url, params=params)
                data_json = response.json()
                
                # Check for API errors
                if 'Error Message' in data_json:
                    print(f"❌ Invalid symbol")
                    symbols_failed.append(symbol)
                    continue
                    
                if 'Note' in data_json:
                    # Rate limit message
                    self.rate_limiter.handle_rate_limit(retry_after=60)
                    symbols.append(symbol)  # Retry
                    continue
                    
                # Parse data
                time_series = data_json.get('Time Series (Daily)', {})
                
                if not time_series:
                    print("❌ No data found")
                    symbols_failed.append(symbol)
                    continue
                    
                # Convert to DataFrame
                df = pd.DataFrame.from_dict(time_series, orient='index')
                df.index = pd.to_datetime(df.index)
                df = df.sort_index()
                
                # Filter date range
                df = df[(df.index >= start_dt) & (df.index <= end_dt)]
                
                # Rename columns
                df = df.rename(columns={
                    '1. open': 'open',
                    '2. high': 'high',
                    '3. low': 'low',
                    '4. close': 'close',
                    '5. volume': 'volume'
                })
                
                # Convert to numeric
                for col in ['open', 'high', 'low', 'close', 'volume']:
                    if col in df.columns:
                        df[col] = pd.to_numeric(df[col])
                        
                df['Symbol'] = symbol
                df = df.reset_index().rename(columns={'index': 'date'})
                
                all_data.append(df)
                symbols_fetched.append(symbol)
                print(f"✅ {len(df)} rows")
                
                self.rate_limiter.reset_retries()
                
            except Exception as e:
                print(f"❌ Error: {e}")
                symbols_failed.append(symbol)
                logger.error(f"Failed to fetch {symbol}: {e}")
                
        if not all_data:
            raise DataFetchError(
                f"Could not fetch data for any symbols: {symbols_failed}\n\n"
                "💡 Common fixes:\n"
                "   1. Check your API key is valid\n"
                "   2. You may have hit rate limits - wait a minute\n"
                "   3. Verify the ticker symbol is correct"
            )
            
        combined_data = pd.concat(all_data, ignore_index=True)
        
        return FetchResult(
            data=combined_data,
            symbols_fetched=symbols_fetched,
            symbols_failed=symbols_failed,
            metadata={
                'source': 'alpha_vantage',
                'start_date': start_date,
                'end_date': end_date,
                'fetch_time': datetime.now().isoformat()
            }
        )
        
    def validate_connection(self) -> bool:
        """Test if Alpha Vantage API is accessible."""
        import requests
        
        try:
            params = {
                'function': 'TIME_SERIES_DAILY',
                'symbol': 'IBM',
                'outputsize': 'compact',
                'apikey': self.api_key
            }
            response = requests.get(self.base_url, params=params, timeout=10)
            data = response.json()
            return 'Time Series (Daily)' in data
        except Exception:
            return False


class NSEBSEFetcher(BaseDataFetcher):
    """
    Data fetcher for Indian markets (NSE/BSE).
    
    This fetcher supports Indian stock exchanges using
    publicly available data sources.
    
    Note: For NSE symbols, append '.NS' (e.g., 'RELIANCE.NS')
    For BSE symbols, append '.BO' (e.g., 'RELIANCE.BO')
    
    Example:
        fetcher = NSEBSEFetcher()
        result = fetcher.fetch(['RELIANCE.NS', 'TCS.NS'], '2020-01-01', '2023-12-31')
    """
    
    def __init__(self, rate_limiter: Optional[RateLimiter] = None):
        """
        Initialize NSE/BSE fetcher.
        
        Uses Yahoo Finance backend for Indian market data.
        """
        # Use Yahoo Finance backend for reliability
        self.yahoo_fetcher = YahooFinanceFetcher(rate_limiter)
        
    def _normalize_symbol(self, symbol: str) -> str:
        """
        Add exchange suffix if not present.
        
        Args:
            symbol: Stock symbol (e.g., 'RELIANCE' or 'RELIANCE.NS')
            
        Returns:
            Symbol with exchange suffix
        """
        symbol = symbol.upper()
        if not (symbol.endswith('.NS') or symbol.endswith('.BO')):
            # Default to NSE
            return f"{symbol}.NS"
        return symbol
        
    def fetch(
        self,
        symbols: Union[str, List[str]],
        start_date: str,
        end_date: str,
        **kwargs
    ) -> FetchResult:
        """
        Fetch historical data for Indian stocks.
        
        Args:
            symbols: Stock ticker(s) - NSE (.NS) or BSE (.BO)
            start_date: Start date in 'YYYY-MM-DD' format
            end_date: End date in 'YYYY-MM-DD' format
            
        Returns:
            FetchResult containing the data and metadata
            
        Example:
            # NSE stocks
            result = fetcher.fetch(['RELIANCE', 'TCS'], '2020-01-01', '2023-12-31')
            
            # Specify exchange explicitly
            result = fetcher.fetch(['RELIANCE.NS', 'TATASTEEL.BO'], ...)
        """
        if isinstance(symbols, str):
            symbols = [symbols]
            
        # Normalize symbols to include exchange suffix
        normalized_symbols = [self._normalize_symbol(s) for s in symbols]
        
        print("🇮🇳 Fetching Indian market data...")
        
        result = self.yahoo_fetcher.fetch(
            normalized_symbols,
            start_date,
            end_date,
            **kwargs
        )
        
        # Update metadata
        result.metadata['source'] = 'nse_bse'
        
        return result
        
    def validate_connection(self) -> bool:
        """Test if Indian market data is accessible."""
        return self.yahoo_fetcher.validate_connection()
        
    @staticmethod
    def get_popular_indices() -> Dict[str, str]:
        """
        Get symbols for popular Indian market indices.
        
        Returns:
            Dictionary mapping index names to their symbols
        """
        return {
            'NIFTY 50': '^NSEI',
            'SENSEX': '^BSESN',
            'NIFTY Bank': '^NSEBANK',
            'NIFTY IT': '^CNXIT',
            'NIFTY Next 50': '^NSMIDCP'
        }


class DataFetcher:
    """
    Main data fetcher with multiple source support.
    
    This is the primary class for fetching market data. It automatically
    handles rate limiting, retries, and error recovery.
    
    Supported data sources:
    - 'yahoo' (default): Yahoo Finance - free, no API key required
    - 'alpha_vantage': Alpha Vantage - requires free API key
    - 'nse_bse': Indian markets (NSE/BSE)
    
    Example:
        # Basic usage with Yahoo Finance
        fetcher = DataFetcher()
        result = fetcher.fetch(['AAPL', 'GOOGL'], '2020-01-01', '2023-12-31')
        
        # With Alpha Vantage
        fetcher = DataFetcher(source='alpha_vantage', api_key='YOUR_KEY')
        
        # For Indian markets
        fetcher = DataFetcher(source='nse_bse')
        result = fetcher.fetch(['RELIANCE', 'TCS'], '2020-01-01', '2023-12-31')
    """
    
    def __init__(
        self,
        source: str = 'yahoo',
        api_key: Optional[str] = None,
        rate_limiter: Optional[RateLimiter] = None
    ):
        """
        Initialize the data fetcher.
        
        Args:
            source: Data source - 'yahoo', 'alpha_vantage', or 'nse_bse'
            api_key: API key (required for Alpha Vantage)
            rate_limiter: Custom rate limiter configuration
            
        Raises:
            DataFetchError: If source is invalid or API key is missing
        """
        self.source = source.lower()
        
        if self.source == 'yahoo':
            self._fetcher = YahooFinanceFetcher(rate_limiter)
        elif self.source == 'alpha_vantage':
            self._fetcher = AlphaVantageFetcher(api_key, rate_limiter)
        elif self.source in ['nse_bse', 'nse', 'bse', 'indian']:
            self._fetcher = NSEBSEFetcher(rate_limiter)
        else:
            raise DataFetchError(
                f"Unknown data source: '{source}'\n\n"
                "💡 Available sources:\n"
                "   - 'yahoo' (default, free, no API key)\n"
                "   - 'alpha_vantage' (requires API key)\n"
                "   - 'nse_bse' (Indian markets)"
            )
            
    def fetch(
        self,
        symbols: Union[str, List[str]],
        start_date: str,
        end_date: str,
        **kwargs
    ) -> FetchResult:
        """
        Fetch historical market data.
        
        Args:
            symbols: Stock ticker(s) to fetch
            start_date: Start date ('YYYY-MM-DD')
            end_date: End date ('YYYY-MM-DD')
            **kwargs: Additional arguments passed to the fetcher
            
        Returns:
            FetchResult with data and metadata
            
        Example:
            result = fetcher.fetch('AAPL', '2020-01-01', '2023-12-31')
            df = result.data
            print(f"Fetched: {result.symbols_fetched}")
            if result.symbols_failed:
                print(f"Failed: {result.symbols_failed}")
        """
        return self._fetcher.fetch(symbols, start_date, end_date, **kwargs)
        
    def validate_connection(self) -> bool:
        """
        Test if the data source is accessible.
        
        Returns:
            True if connection is working
        """
        return self._fetcher.validate_connection()
        
    def handle_rate_limit(self, retry_after: Optional[float] = None) -> None:
        """
        Handle rate limit by waiting.
        
        Args:
            retry_after: Seconds to wait, or None for auto-backoff
        """
        if hasattr(self._fetcher, 'rate_limiter'):
            self._fetcher.rate_limiter.handle_rate_limit(retry_after)
