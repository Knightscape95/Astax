"""
Market data fetcher for daily retraining.
Fetches latest OHLCV data from Yahoo Finance or configured API.
"""

import argparse
import os
import sys
from datetime import datetime, timedelta
from typing import Optional

import pandas as pd
import yfinance as yf


def fetch_yahoo_data(
    symbols: list[str],
    lookback_days: int = 365,
    interval: str = "1d",
) -> pd.DataFrame:
    """
    Fetch historical data from Yahoo Finance.
    
    Args:
        symbols: List of ticker symbols
        lookback_days: Days of history to fetch
        interval: Data interval (1d, 1h, 15m, etc.)
    
    Returns:
        DataFrame with OHLCV data
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=lookback_days)
    
    print(f"Fetching data for {symbols} from {start_date.date()} to {end_date.date()}")
    
    all_data = []
    for symbol in symbols:
        try:
            print(f"  Downloading {symbol}...")
            df = yf.download(
                symbol,
                start=start_date.date(),
                end=end_date.date(),
                interval=interval,
                progress=False,
            )
            
            if df.empty:
                print(f"  ⚠️  No data for {symbol}")
                continue
            
            df["Symbol"] = symbol
            all_data.append(df)
            print(f"  ✓ {symbol}: {len(df)} rows")
            
        except Exception as e:
            print(f"  ❌ Error fetching {symbol}: {e}")
            continue
    
    if not all_data:
        raise ValueError("No data fetched from any symbol")
    
    combined = pd.concat(all_data, ignore_index=False)
    combined = combined.reset_index()
    
    # Standardize column names
    combined.columns = [col.lower().replace(" ", "_") for col in combined.columns]
    
    return combined


def validate_data(df: pd.DataFrame) -> bool:
    """Validate fetched data quality."""
    print("Validating data...")
    
    # Check for required columns
    required = ["open", "high", "low", "close", "volume", "symbol"]
    missing = [col for col in required if col not in df.columns]
    if missing:
        print(f"  ❌ Missing columns: {missing}")
        return False
    
    # Check for null values
    null_count = df.isnull().sum().sum()
    if null_count > 0:
        print(f"  ⚠️  Found {null_count} null values (may be filled via ffill)")
        df = df.fillna(method="ffill").fillna(method="bfill")
    
    # Check for sufficient data
    if len(df) < 30:
        print(f"  ❌ Insufficient data: {len(df)} rows (need >= 30)")
        return False
    
    print(f"  ✓ Data valid ({len(df)} rows, {df['symbol'].nunique()} symbols)")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Fetch latest market data for model training"
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output CSV file path",
    )
    parser.add_argument(
        "--symbols",
        default="AAPL,BTC-USD,ETH-USD",
        help="Comma-separated list of symbols",
    )
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=365,
        help="Days of history to fetch",
    )
    parser.add_argument(
        "--interval",
        default="1d",
        help="Data interval (1d, 1h, etc.)",
    )
    
    args = parser.parse_args()
    
    try:
        # Parse symbols
        symbols = [s.strip() for s in args.symbols.split(",")]
        
        # Fetch data
        df = fetch_yahoo_data(
            symbols=symbols,
            lookback_days=args.lookback_days,
            interval=args.interval,
        )
        
        # Validate
        if not validate_data(df):
            sys.exit(1)
        
        # Save
        os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
        df.to_csv(args.output, index=False)
        print(f"\n✅ Data saved to {args.output}")
        
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
