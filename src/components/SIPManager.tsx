'use client';

import { useState, useEffect } from 'react';
import type { 
  SIPPlan, 
  SIPFrequency,
  Exchange 
} from '@/types/indian-market';

// ============================================================================
// Types
// ============================================================================

interface SIPManagerProps {
  portfolioId: string;
}

interface CreateSIPForm {
  name: string;
  symbol: string;
  exchange: Exchange;
  amount: number;
  frequency: SIPFrequency;
  startDate: string;
  endDate?: string;
  stepUpPercentage?: number;
  stepUpFrequency?: 'yearly' | 'half_yearly';
}

interface SIPWithLiveData extends SIPPlan {
  current_nav: number;
  live_current_value: number;
  live_absolute_returns: number;
  live_percentage_returns: number;
}

// ============================================================================
// Component
// ============================================================================

export default function SIPManager({ portfolioId }: SIPManagerProps) {
  const [sips, setSips] = useState<SIPWithLiveData[]>([]);
  const [summary, setSummary] = useState({
    totalSIPs: 0,
    activeSIPs: 0,
    totalInvested: 0,
    currentValue: 0,
    totalReturns: 0,
    monthlyCommitment: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string }[]>([]);
  const [form, setForm] = useState<CreateSIPForm>({
    name: '',
    symbol: '',
    exchange: 'NSE',
    amount: 1000,
    frequency: 'monthly',
    startDate: new Date().toISOString().split('T')[0],
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSIPs();
  }, [portfolioId]);

  useEffect(() => {
    if (searchQuery.length >= 2) {
      searchStocks(searchQuery);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const fetchSIPs = async () => {
    try {
      const res = await fetch(`/api/paper-trading/sip?portfolio_id=${portfolioId}`);
      const data = await res.json();
      setSips(data.sips || []);
      setSummary(data.summary || {});
    } catch (error) {
      console.error('Failed to fetch SIPs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const searchStocks = async (query: string) => {
    try {
      const res = await fetch(`/api/market?action=search&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error('Failed to search stocks:', error);
    }
  };

  const createSIP = async () => {
    if (!form.name || !form.symbol || !form.amount || !form.startDate) {
      setError('Please fill all required fields');
      return;
    }

    try {
      const res = await fetch('/api/paper-trading/sip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          portfolio_id: portfolioId,
          name: form.name,
          symbol: form.symbol,
          exchange: form.exchange,
          amount: form.amount,
          frequency: form.frequency,
          start_date: form.startDate,
          end_date: form.endDate,
          step_up_percentage: form.stepUpPercentage,
          step_up_frequency: form.stepUpFrequency,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setShowCreateModal(false);
        setForm({
          name: '',
          symbol: '',
          exchange: 'NSE',
          amount: 1000,
          frequency: 'monthly',
          startDate: new Date().toISOString().split('T')[0],
        });
        fetchSIPs();
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError('Failed to create SIP');
    }
  };

  const executeSIPInstallment = async (sipId: string) => {
    try {
      const res = await fetch('/api/paper-trading/sip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute_installment',
          sip_id: sipId,
        }),
      });

      if (res.ok) {
        fetchSIPs();
      }
    } catch (error) {
      console.error('Failed to execute SIP installment:', error);
    }
  };

  const toggleSIPStatus = async (sipId: string, isActive: boolean) => {
    try {
      await fetch('/api/paper-trading/sip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isActive ? 'pause' : 'resume',
          sip_id: sipId,
        }),
      });
      fetchSIPs();
    } catch (error) {
      console.error('Failed to toggle SIP status:', error);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const getFrequencyLabel = (freq: SIPFrequency) => {
    switch (freq) {
      case 'daily': return 'Daily';
      case 'weekly': return 'Weekly';
      case 'monthly': return 'Monthly';
      case 'quarterly': return 'Quarterly';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">SIP Manager</h2>
          <p className="text-gray-400 text-sm">Systematic Investment Plans for rupee cost averaging</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          New SIP
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-xs">Active SIPs</p>
          <p className="text-xl font-bold text-white">{summary.activeSIPs}/{summary.totalSIPs}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-xs">Total Invested</p>
          <p className="text-xl font-bold text-white">{formatCurrency(summary.totalInvested)}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-xs">Current Value</p>
          <p className="text-xl font-bold text-white">{formatCurrency(summary.currentValue)}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-xs">Total Returns</p>
          <p className={`text-xl font-bold ${summary.totalReturns >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(summary.totalReturns)}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-xs">Return %</p>
          <p className={`text-xl font-bold ${summary.totalReturns >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {summary.totalInvested > 0 ? formatPercent((summary.totalReturns / summary.totalInvested) * 100) : '0%'}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-xs">Monthly Commitment</p>
          <p className="text-xl font-bold text-blue-400">{formatCurrency(summary.monthlyCommitment)}</p>
        </div>
      </div>

      {/* SIP List */}
      {sips.length === 0 ? (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-white">No SIPs Yet</h3>
          <p className="mt-2 text-gray-400">Start a SIP to invest regularly and benefit from rupee cost averaging.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {sips.map((sip) => (
            <div key={sip.id} className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-white">{sip.name}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      sip.is_active 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {sip.is_active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm mt-1">
                    {sip.symbol} • {sip.exchange} • {getFrequencyLabel(sip.frequency)} • {formatCurrency(Number(sip.amount))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => executeSIPInstallment(sip.id)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors"
                    disabled={!sip.is_active}
                  >
                    Execute Now
                  </button>
                  <button
                    onClick={() => toggleSIPStatus(sip.id, sip.is_active)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
                  >
                    {sip.is_active ? 'Pause' : 'Resume'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-4 pt-4 border-t border-gray-700">
                <div>
                  <p className="text-gray-500 text-xs">Invested</p>
                  <p className="text-white font-medium">{formatCurrency(Number(sip.total_invested))}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Current Value</p>
                  <p className="text-white font-medium">{formatCurrency(sip.live_current_value)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Returns</p>
                  <p className={`font-medium ${sip.live_absolute_returns >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(sip.live_absolute_returns)} ({formatPercent(sip.live_percentage_returns)})
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Units</p>
                  <p className="text-white font-medium">{Number(sip.units_accumulated).toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Avg NAV</p>
                  <p className="text-white font-medium">₹{Number(sip.average_nav).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Installments</p>
                  <p className="text-white font-medium">{sip.completed_installments}/{sip.total_installments || '∞'}</p>
                </div>
              </div>

              {sip.step_up_percentage && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <p className="text-sm text-blue-400">
                    📈 Step-up: {sip.step_up_percentage}% {sip.step_up_frequency}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create SIP Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Create New SIP</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">SIP Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Monthly NIFTY Investment"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Symbol</label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery || form.symbol}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setForm({ ...form, symbol: e.target.value.toUpperCase() });
                    }}
                    placeholder="Search stocks or ETFs"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                  {searchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {searchResults.map((result, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setForm({ ...form, symbol: result.symbol });
                            setSearchQuery('');
                            setSearchResults([]);
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-gray-600 text-white"
                        >
                          <span className="font-medium">{result.symbol}</span>
                          <span className="text-gray-400 text-sm ml-2">{result.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Exchange</label>
                  <select
                    value={form.exchange}
                    onChange={(e) => setForm({ ...form, exchange: e.target.value as Exchange })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="NSE">NSE</option>
                    <option value="BSE">BSE</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Frequency</label>
                  <select
                    value={form.frequency}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value as SIPFrequency })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Amount (₹)</label>
                <input
                  type="number"
                  min="100"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">End Date (Optional)</label>
                  <input
                    type="date"
                    value={form.endDate || ''}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value || undefined })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Step-up Section */}
              <div className="border-t border-gray-700 pt-4">
                <p className="text-sm font-medium text-gray-300 mb-3">Step-up (Optional)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Increase %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={form.stepUpPercentage || ''}
                      onChange={(e) => setForm({ ...form, stepUpPercentage: parseFloat(e.target.value) || undefined })}
                      placeholder="e.g., 10"
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Frequency</label>
                    <select
                      value={form.stepUpFrequency || ''}
                      onChange={(e) => setForm({ ...form, stepUpFrequency: e.target.value as 'yearly' | 'half_yearly' || undefined })}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">No step-up</option>
                      <option value="yearly">Yearly</option>
                      <option value="half_yearly">Half-yearly</option>
                    </select>
                  </div>
                </div>
              </div>

              <button
                onClick={createSIP}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors mt-4"
              >
                Create SIP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
