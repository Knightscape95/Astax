"""
Unit Tests for Rate Limiting
============================

Tests for rate limiting and exponential backoff functionality.
"""

import pytest
import time
from unittest.mock import Mock, patch

# Import the module to test
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data.fetchers import RateLimiter


class TestRateLimiter:
    """Tests for RateLimiter class."""
    
    def test_basic_rate_limiting(self):
        """Test that rate limiter enforces call limits."""
        limiter = RateLimiter(calls_per_minute=60)  # 1 per second max
        
        # First call should be immediate
        start = time.time()
        limiter.wait()
        first_duration = time.time() - start
        
        # Should be nearly instant
        assert first_duration < 0.1
        
    def test_rate_limit_delay(self):
        """Test that rapid calls are delayed."""
        limiter = RateLimiter(calls_per_minute=30)  # 2 seconds between calls
        
        # First call - immediate
        limiter.wait()
        
        # Second call should wait ~2 seconds
        start = time.time()
        limiter.wait()
        duration = time.time() - start
        
        # Should have waited approximately 2 seconds
        # Allow some tolerance
        assert duration >= 1.5
        
    def test_exponential_backoff(self):
        """Test exponential backoff after errors."""
        limiter = RateLimiter(calls_per_minute=60)
        
        # Record initial backoff
        initial_delay = limiter._current_backoff
        
        # Simulate errors
        limiter.record_error()
        
        # Backoff should increase
        assert limiter._current_backoff > initial_delay
        
    def test_backoff_reset_on_success(self):
        """Test that backoff resets after successful call."""
        limiter = RateLimiter(calls_per_minute=60)
        
        # Simulate some errors to increase backoff
        limiter.record_error()
        limiter.record_error()
        
        # Record success
        limiter.record_success()
        
        # Backoff should be reset to initial value
        assert limiter._current_backoff == limiter._initial_backoff
        
    def test_max_backoff_cap(self):
        """Test that backoff doesn't exceed maximum."""
        limiter = RateLimiter(
            calls_per_minute=60,
            max_backoff=60  # Max 60 seconds
        )
        
        # Simulate many errors
        for _ in range(20):
            limiter.record_error()
            
        # Should not exceed max
        assert limiter._current_backoff <= 60
        
    def test_custom_rate_limit(self):
        """Test with custom rate limit."""
        limiter = RateLimiter(calls_per_minute=120)  # 2 per second
        
        # Expected interval is 0.5 seconds
        assert limiter._min_interval == 0.5


class TestRateLimiterRetry:
    """Tests for retry logic with rate limiting."""
    
    def test_retry_with_backoff(self):
        """Test that retries use exponential backoff."""
        limiter = RateLimiter(calls_per_minute=60)
        
        # Track backoff increases
        backoffs = []
        
        for i in range(5):
            backoffs.append(limiter._current_backoff)
            limiter.record_error()
            
        # Each backoff should be larger than the previous
        for i in range(1, len(backoffs)):
            assert backoffs[i] >= backoffs[i-1]
            
    def test_backoff_multiplier(self):
        """Test that backoff uses correct multiplier."""
        limiter = RateLimiter(
            calls_per_minute=60,
            backoff_multiplier=2.0
        )
        
        initial = limiter._current_backoff
        limiter.record_error()
        
        # Should be doubled
        assert limiter._current_backoff == initial * 2.0


class TestRateLimiterTimestamps:
    """Tests for timestamp tracking in rate limiter."""
    
    def test_tracks_call_times(self):
        """Test that rate limiter tracks call timestamps."""
        limiter = RateLimiter(calls_per_minute=60)
        
        limiter.wait()
        limiter.wait()
        limiter.wait()
        
        # Should have recorded call times
        assert len(limiter._call_times) == 3
        
    def test_clears_old_timestamps(self):
        """Test that old timestamps are cleared."""
        limiter = RateLimiter(calls_per_minute=60)
        
        # Make some calls
        limiter.wait()
        limiter.wait()
        
        # Manually add old timestamp (more than 1 minute ago)
        old_time = time.time() - 120  # 2 minutes ago
        limiter._call_times.insert(0, old_time)
        
        # Next wait should clear old timestamps
        limiter.wait()
        
        # Old timestamp should be removed
        assert all(t > time.time() - 70 for t in limiter._call_times)


class TestRateLimiterEdgeCases:
    """Tests for edge cases."""
    
    def test_zero_rate_raises_error(self):
        """Test that zero rate limit raises error."""
        with pytest.raises(ValueError):
            RateLimiter(calls_per_minute=0)
            
    def test_negative_rate_raises_error(self):
        """Test that negative rate limit raises error."""
        with pytest.raises(ValueError):
            RateLimiter(calls_per_minute=-10)
            
    def test_very_high_rate(self):
        """Test with very high rate limit (essentially no limiting)."""
        limiter = RateLimiter(calls_per_minute=10000)
        
        # Should be very fast
        start = time.time()
        for _ in range(10):
            limiter.wait()
        duration = time.time() - start
        
        # All calls should complete quickly
        assert duration < 1.0


class TestRateLimiterThreadSafety:
    """Tests for thread safety (basic)."""
    
    def test_concurrent_calls(self):
        """Test that rate limiter handles concurrent calls."""
        import threading
        
        limiter = RateLimiter(calls_per_minute=60)
        call_count = 0
        lock = threading.Lock()
        
        def make_call():
            nonlocal call_count
            limiter.wait()
            with lock:
                call_count += 1
                
        # Start multiple threads
        threads = [threading.Thread(target=make_call) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
            
        # All calls should complete
        assert call_count == 5
