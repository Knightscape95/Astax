"""
Data Validators Module
======================

Provides data quality validation and verification utilities.

Features:
- Missing value checks
- Date range validation
- Data completeness verification
- Outlier detection
- Statistical checks

Example Usage:
    from trading_ml_utils.data import DataValidator
    
    validator = DataValidator()
    result = validator.validate(df)
    
    if result.is_valid:
        print("Data passed all checks!")
    else:
        print(f"Issues found: {result.issues}")
"""

import logging
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


@dataclass
class ValidationIssue:
    """
    Represents a single validation issue.
    
    Attributes:
        severity: 'error', 'warning', or 'info'
        category: Type of issue (e.g., 'missing_values', 'outliers')
        message: Human-readable description
        suggestion: How to fix the issue
    """
    severity: str
    category: str
    message: str
    suggestion: str


@dataclass
class ValidationResult:
    """
    Container for validation results.
    
    Attributes:
        is_valid: True if no errors found (warnings allowed)
        issues: List of validation issues
        statistics: Summary statistics of the data
        metadata: Additional validation information
    """
    is_valid: bool
    issues: List[ValidationIssue] = field(default_factory=list)
    statistics: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def summary(self) -> str:
        """Get a human-readable summary of validation results."""
        errors = [i for i in self.issues if i.severity == 'error']
        warnings = [i for i in self.issues if i.severity == 'warning']
        
        lines = []
        lines.append("=" * 50)
        lines.append("📋 VALIDATION RESULTS")
        lines.append("=" * 50)
        
        if self.is_valid:
            lines.append("✅ Data passed validation!")
        else:
            lines.append("❌ Data has issues that need attention")
            
        lines.append(f"\n   Errors: {len(errors)}")
        lines.append(f"   Warnings: {len(warnings)}")
        
        if errors:
            lines.append("\n🔴 ERRORS:")
            for issue in errors:
                lines.append(f"   • {issue.message}")
                lines.append(f"     💡 {issue.suggestion}")
                
        if warnings:
            lines.append("\n🟡 WARNINGS:")
            for issue in warnings:
                lines.append(f"   • {issue.message}")
                lines.append(f"     💡 {issue.suggestion}")
                
        lines.append("=" * 50)
        return "\n".join(lines)


class DataValidator:
    """
    Validate market data quality and completeness.
    
    This validator checks for common data issues that could
    affect model training quality.
    
    Example:
        validator = DataValidator()
        
        # Quick validation
        result = validator.validate(df)
        print(result.summary())
        
        # Custom checks
        result = validator.validate(
            df,
            check_missing=True,
            check_outliers=True,
            date_column='date',
            expected_frequency='daily'
        )
    """
    
    def __init__(
        self,
        missing_threshold: float = 0.1,
        outlier_std: float = 3.0
    ):
        """
        Initialize the validator.
        
        Args:
            missing_threshold: Max fraction of missing values allowed
            outlier_std: Number of standard deviations for outlier detection
        """
        self.missing_threshold = missing_threshold
        self.outlier_std = outlier_std
        
    def validate(
        self,
        df: pd.DataFrame,
        check_missing: bool = True,
        check_outliers: bool = True,
        check_dates: bool = True,
        check_duplicates: bool = True,
        date_column: Optional[str] = None,
        expected_frequency: str = 'daily',
        required_columns: Optional[List[str]] = None
    ) -> ValidationResult:
        """
        Run all validation checks on the data.
        
        Args:
            df: DataFrame to validate
            check_missing: Check for missing values
            check_outliers: Check for outlier values
            check_dates: Check date column and frequency
            check_duplicates: Check for duplicate rows
            date_column: Name of date column (auto-detected if None)
            expected_frequency: Expected data frequency ('daily', 'hourly', etc.)
            required_columns: List of columns that must be present
            
        Returns:
            ValidationResult with issues and statistics
            
        Example:
            result = validator.validate(df)
            if not result.is_valid:
                print(result.summary())
        """
        issues = []
        statistics = {}
        
        print("🔍 Validating data...")
        
        # Basic info
        statistics['rows'] = len(df)
        statistics['columns'] = len(df.columns)
        statistics['dtypes'] = df.dtypes.to_dict()
        
        # Check required columns
        if required_columns:
            issues.extend(self._check_required_columns(df, required_columns))
            
        # Check for empty data
        if len(df) == 0:
            issues.append(ValidationIssue(
                severity='error',
                category='empty_data',
                message="DataFrame is empty!",
                suggestion="Check your data source and date range."
            ))
            return ValidationResult(
                is_valid=False,
                issues=issues,
                statistics=statistics
            )
            
        # Auto-detect date column
        if date_column is None:
            date_column = self._detect_date_column(df)
            
        # Run checks
        if check_missing:
            missing_issues, missing_stats = self._check_missing(df)
            issues.extend(missing_issues)
            statistics['missing'] = missing_stats
            
        if check_outliers:
            outlier_issues, outlier_stats = self._check_outliers(df)
            issues.extend(outlier_issues)
            statistics['outliers'] = outlier_stats
            
        if check_dates and date_column:
            date_issues, date_stats = self._check_dates(
                df, date_column, expected_frequency
            )
            issues.extend(date_issues)
            statistics['dates'] = date_stats
            
        if check_duplicates:
            dup_issues, dup_stats = self._check_duplicates(df)
            issues.extend(dup_issues)
            statistics['duplicates'] = dup_stats
            
        # Determine if valid (no errors, warnings OK)
        has_errors = any(i.severity == 'error' for i in issues)
        
        result = ValidationResult(
            is_valid=not has_errors,
            issues=issues,
            statistics=statistics,
            metadata={
                'date_column': date_column,
                'expected_frequency': expected_frequency
            }
        )
        
        # Print summary
        print(result.summary())
        
        return result
        
    def _detect_date_column(self, df: pd.DataFrame) -> Optional[str]:
        """Auto-detect the date column."""
        date_names = ['date', 'Date', 'datetime', 'Datetime', 'timestamp', 'Timestamp']
        
        for col in date_names:
            if col in df.columns:
                return col
                
        # Check for datetime dtype
        for col in df.columns:
            if pd.api.types.is_datetime64_any_dtype(df[col]):
                return col
                
        return None
        
    def _check_required_columns(
        self,
        df: pd.DataFrame,
        required: List[str]
    ) -> List[ValidationIssue]:
        """Check that required columns exist."""
        issues = []
        missing_cols = [c for c in required if c not in df.columns]
        
        if missing_cols:
            issues.append(ValidationIssue(
                severity='error',
                category='missing_columns',
                message=f"Missing required columns: {missing_cols}",
                suggestion=f"Ensure your data has these columns: {required}"
            ))
            
        return issues
        
    def _check_missing(
        self,
        df: pd.DataFrame
    ) -> tuple:
        """Check for missing values."""
        issues = []
        stats = {}
        
        missing_counts = df.isnull().sum()
        missing_pct = (missing_counts / len(df)) * 100
        
        stats['total_missing'] = int(missing_counts.sum())
        stats['by_column'] = missing_counts[missing_counts > 0].to_dict()
        
        for col in missing_counts[missing_counts > 0].index:
            pct = missing_pct[col]
            stats[f'{col}_pct'] = pct
            
            if pct > self.missing_threshold * 100:
                severity = 'error' if pct > 50 else 'warning'
                issues.append(ValidationIssue(
                    severity=severity,
                    category='missing_values',
                    message=f"Column '{col}' has {pct:.1f}% missing values",
                    suggestion="Use forward fill, interpolation, or consider removing this column"
                ))
                
        if stats['total_missing'] == 0:
            print("   ✅ No missing values")
        else:
            print(f"   ⚠️ Found {stats['total_missing']} missing values")
            
        return issues, stats
        
    def _check_outliers(
        self,
        df: pd.DataFrame
    ) -> tuple:
        """Check for outlier values."""
        issues = []
        stats = {}
        
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        
        for col in numeric_cols:
            mean = df[col].mean()
            std = df[col].std()
            
            if std == 0:
                continue
                
            lower = mean - self.outlier_std * std
            upper = mean + self.outlier_std * std
            
            outliers = ((df[col] < lower) | (df[col] > upper)).sum()
            outlier_pct = (outliers / len(df)) * 100
            
            if outliers > 0:
                stats[col] = {
                    'count': int(outliers),
                    'percentage': outlier_pct,
                    'lower_bound': lower,
                    'upper_bound': upper
                }
                
                if outlier_pct > 5:
                    issues.append(ValidationIssue(
                        severity='warning',
                        category='outliers',
                        message=f"Column '{col}' has {outlier_pct:.1f}% outliers ({outliers} values)",
                        suggestion="Consider using robust scaling or clipping extreme values"
                    ))
                    
        if not stats:
            print("   ✅ No significant outliers detected")
        else:
            total_outlier_cols = len(stats)
            print(f"   ⚠️ Found outliers in {total_outlier_cols} columns")
            
        return issues, stats
        
    def _check_dates(
        self,
        df: pd.DataFrame,
        date_column: str,
        expected_frequency: str
    ) -> tuple:
        """Check date column quality."""
        issues = []
        stats = {}
        
        if date_column not in df.columns:
            issues.append(ValidationIssue(
                severity='warning',
                category='date_column',
                message=f"Date column '{date_column}' not found",
                suggestion="Specify the correct date column name"
            ))
            return issues, stats
            
        try:
            dates = pd.to_datetime(df[date_column])
            
            stats['min_date'] = dates.min().isoformat()
            stats['max_date'] = dates.max().isoformat()
            stats['date_range_days'] = (dates.max() - dates.min()).days
            
            # Check for gaps
            if expected_frequency == 'daily':
                expected_delta = pd.Timedelta(days=1)
                max_gap_days = 7  # Allow weekends/holidays
            elif expected_frequency == 'hourly':
                expected_delta = pd.Timedelta(hours=1)
                max_gap_days = 1
            else:
                expected_delta = None
                max_gap_days = None
                
            if expected_delta:
                date_diffs = dates.sort_values().diff()
                large_gaps = date_diffs[date_diffs > pd.Timedelta(days=max_gap_days)]
                
                if len(large_gaps) > 0:
                    stats['large_gaps'] = len(large_gaps)
                    issues.append(ValidationIssue(
                        severity='warning',
                        category='date_gaps',
                        message=f"Found {len(large_gaps)} large gaps in dates",
                        suggestion="This may be normal for weekends/holidays, or indicate missing data"
                    ))
                    
            print(f"   📅 Date range: {stats['min_date'][:10]} to {stats['max_date'][:10]}")
            
        except Exception as e:
            issues.append(ValidationIssue(
                severity='error',
                category='date_parsing',
                message=f"Could not parse date column: {e}",
                suggestion="Ensure dates are in a standard format (YYYY-MM-DD)"
            ))
            
        return issues, stats
        
    def _check_duplicates(
        self,
        df: pd.DataFrame
    ) -> tuple:
        """Check for duplicate rows."""
        issues = []
        stats = {}
        
        duplicates = df.duplicated().sum()
        stats['duplicate_rows'] = int(duplicates)
        stats['duplicate_pct'] = (duplicates / len(df)) * 100
        
        if duplicates > 0:
            issues.append(ValidationIssue(
                severity='warning',
                category='duplicates',
                message=f"Found {duplicates} duplicate rows ({stats['duplicate_pct']:.1f}%)",
                suggestion="Remove duplicates with df.drop_duplicates()"
            ))
            print(f"   ⚠️ Found {duplicates} duplicate rows")
        else:
            print("   ✅ No duplicate rows")
            
        return issues, stats
        
    def quick_check(self, df: pd.DataFrame) -> bool:
        """
        Quick validation check - returns True/False.
        
        Use this for a simple pass/fail check without detailed output.
        
        Args:
            df: DataFrame to validate
            
        Returns:
            True if data is valid, False otherwise
        """
        # Basic checks
        if df is None or len(df) == 0:
            return False
            
        # Check for excessive missing values
        missing_pct = df.isnull().sum().sum() / (len(df) * len(df.columns))
        if missing_pct > self.missing_threshold:
            return False
            
        return True
        
    def get_data_summary(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Get a summary of the data without full validation.
        
        Args:
            df: DataFrame to summarize
            
        Returns:
            Dictionary with data statistics
        """
        summary = {
            'shape': df.shape,
            'columns': list(df.columns),
            'dtypes': df.dtypes.to_dict(),
            'missing_values': df.isnull().sum().to_dict(),
            'numeric_columns': df.select_dtypes(include=[np.number]).columns.tolist(),
        }
        
        # Add basic stats for numeric columns
        numeric_df = df.select_dtypes(include=[np.number])
        if not numeric_df.empty:
            summary['statistics'] = {
                'mean': numeric_df.mean().to_dict(),
                'std': numeric_df.std().to_dict(),
                'min': numeric_df.min().to_dict(),
                'max': numeric_df.max().to_dict()
            }
            
        return summary
