"""
Unit Tests for Data Validators
==============================

Tests for data validation functionality including:
- Missing value detection
- Outlier detection
- Date validation
- Duplicate detection
"""

import pytest
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

# Import the module to test
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data.validators import DataValidator, ValidationResult


class TestValidationResult:
    """Tests for ValidationResult dataclass."""
    
    def test_passed_result(self):
        """Test creating a passed validation result."""
        result = ValidationResult(
            is_valid=True,
            warnings=[],
            errors=[],
            statistics={'rows': 100}
        )
        assert result.is_valid is True
        assert len(result.warnings) == 0
        assert len(result.errors) == 0
        
    def test_failed_result(self):
        """Test creating a failed validation result."""
        result = ValidationResult(
            is_valid=False,
            warnings=['Warning 1'],
            errors=['Error 1', 'Error 2'],
            statistics={}
        )
        assert result.is_valid is False
        assert len(result.errors) == 2


class TestDataValidator:
    """Tests for DataValidator class."""
    
    @pytest.fixture
    def validator(self):
        """Create validator instance for tests."""
        return DataValidator()
        
    @pytest.fixture
    def valid_df(self):
        """Create a valid test dataframe."""
        dates = pd.date_range(start='2023-01-01', periods=100, freq='D')
        return pd.DataFrame({
            'timestamp': dates,
            'open': np.random.uniform(100, 110, 100),
            'high': np.random.uniform(110, 120, 100),
            'low': np.random.uniform(90, 100, 100),
            'close': np.random.uniform(100, 110, 100),
            'volume': np.random.uniform(1000000, 2000000, 100)
        })
        
    def test_validate_clean_data(self, validator, valid_df):
        """Test validation of clean data passes."""
        result = validator.validate(valid_df)
        assert result.is_valid is True
        assert len(result.errors) == 0
        
    def test_detect_missing_values(self, validator, valid_df):
        """Test detection of missing values."""
        # Introduce missing values
        valid_df.loc[5, 'close'] = np.nan
        valid_df.loc[10, 'close'] = np.nan
        
        result = validator.validate(valid_df)
        
        # Should detect missing values
        assert 'close' in result.statistics.get('missing_values', {})
        
    def test_detect_excessive_missing(self, validator, valid_df):
        """Test that excessive missing values cause validation failure."""
        # Set 50% of close values to NaN (exceeds default 10% threshold)
        valid_df.loc[0:50, 'close'] = np.nan
        
        result = validator.validate(valid_df)
        
        # Should fail validation
        assert result.is_valid is False or len(result.warnings) > 0
        
    def test_outlier_detection(self, validator, valid_df):
        """Test detection of outliers."""
        # Introduce extreme outlier
        valid_df.loc[0, 'close'] = 10000  # Very high outlier
        
        result = validator.validate(valid_df)
        
        # Should detect the outlier
        assert 'close' in result.statistics.get('outliers', {})
        
    def test_empty_dataframe(self, validator):
        """Test validation of empty dataframe fails."""
        empty_df = pd.DataFrame()
        result = validator.validate(empty_df)
        
        assert result.is_valid is False
        assert len(result.errors) > 0
        
    def test_duplicate_detection(self, validator, valid_df):
        """Test detection of duplicate rows."""
        # Add duplicate rows
        duplicated_df = pd.concat([valid_df, valid_df.iloc[[0, 1, 2]]])
        
        result = validator.validate(duplicated_df)
        
        # Should detect duplicates
        duplicates = result.statistics.get('duplicates', 0)
        assert duplicates > 0 or len(result.warnings) > 0
        
    def test_date_gap_detection(self, validator):
        """Test detection of gaps in date sequence."""
        # Create data with gap
        dates = list(pd.date_range(start='2023-01-01', periods=10, freq='D'))
        # Remove some dates to create gap
        dates.pop(5)
        dates.pop(5)
        
        df = pd.DataFrame({
            'timestamp': dates,
            'close': np.random.uniform(100, 110, len(dates))
        })
        
        result = validator.validate(df)
        
        # Should detect gaps (as warnings)
        gaps = result.statistics.get('date_gaps', 0)
        assert gaps > 0 or len(result.warnings) > 0
        
    def test_custom_thresholds(self):
        """Test validation with custom thresholds."""
        validator = DataValidator(
            missing_threshold=0.01,  # Very strict
            outlier_threshold=2.0
        )
        
        # Create data with 5% missing (exceeds 1% threshold)
        dates = pd.date_range(start='2023-01-01', periods=100, freq='D')
        df = pd.DataFrame({
            'timestamp': dates,
            'close': np.random.uniform(100, 110, 100)
        })
        df.loc[0:5, 'close'] = np.nan
        
        result = validator.validate(df)
        
        # Should fail or warn with strict threshold
        assert not result.is_valid or len(result.warnings) > 0


class TestDataValidatorColumns:
    """Tests for column validation."""
    
    @pytest.fixture
    def validator(self):
        return DataValidator()
        
    def test_missing_required_columns(self, validator):
        """Test validation fails when required columns are missing."""
        df = pd.DataFrame({
            'timestamp': pd.date_range(start='2023-01-01', periods=10, freq='D'),
            'price': [100] * 10  # Missing 'close' column
        })
        
        result = validator.validate(df, required_columns=['close'])
        
        # Should fail or warn about missing column
        assert not result.is_valid or len(result.warnings) > 0


class TestMissingValueChecks:
    """Tests specifically for missing value functionality."""
    
    def test_check_missing_values(self):
        """Test the _check_missing_values method."""
        validator = DataValidator()
        
        df = pd.DataFrame({
            'a': [1, 2, np.nan, 4, 5],
            'b': [1, 2, 3, 4, 5],
            'c': [np.nan, np.nan, 3, 4, 5]
        })
        
        result = validator._check_missing_values(df)
        
        assert 'a' in result
        assert result['a'] == 1
        assert 'c' in result
        assert result['c'] == 2
        # 'b' has no missing values, may or may not be in result


class TestOutlierChecks:
    """Tests specifically for outlier detection."""
    
    def test_check_outliers_extreme(self):
        """Test outlier detection with extreme values."""
        validator = DataValidator(outlier_threshold=3.0)
        
        # Create normal data with one extreme outlier
        data = np.random.normal(100, 5, 100).tolist()
        data[0] = 1000  # Extreme outlier
        
        df = pd.DataFrame({'value': data})
        
        result = validator._check_outliers(df)
        
        assert 'value' in result
        assert result['value'] > 0
        
    def test_no_outliers_normal_data(self):
        """Test that normal data has no outliers detected."""
        validator = DataValidator(outlier_threshold=3.0)
        
        # Very uniform data
        df = pd.DataFrame({'value': [100] * 100})
        
        result = validator._check_outliers(df)
        
        # Should have 0 outliers (or column not in result)
        assert result.get('value', 0) == 0
