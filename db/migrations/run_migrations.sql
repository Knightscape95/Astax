-- Migration Runner Script
-- Run migrations in order to set up the database schema

-- How to run:
-- 1. Connect to your Vercel Postgres database
-- 2. Execute each migration file in order (001, 002, 003, 004, 005)

-- Alternatively, run this combined script:

\echo 'Running migration 001: Create models table...'
\i 001_create_models_table.sql

\echo 'Running migration 002: Create trades table...'
\i 002_create_trades_table.sql

\echo 'Running migration 003: Create performance_metrics table...'
\i 003_create_performance_metrics_table.sql

\echo 'Running migration 004: Create model_updates table...'
\i 004_create_model_updates_table.sql

\echo 'Running migration 005: Create indexes and views...'
\i 005_create_indexes_and_views.sql

\echo 'Running migration 006: Create alert tables...'
\i 006_create_alert_tables.sql

\echo 'Running migration 007: Create paper trading tables...'
\i 007_create_paper_trading_tables.sql

\echo 'Running migration 008: Create experiments tables...'
\i 008_create_experiments_tables.sql

\echo 'All migrations completed successfully!'
