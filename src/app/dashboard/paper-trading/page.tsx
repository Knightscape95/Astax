'use client';

import { useState } from 'react';
import PaperTrading from '@/components/PaperTrading';
import SIPManager from '@/components/SIPManager';
import AdvancedModelSelector from '@/components/AdvancedModelSelector';

type TabType = 'portfolio' | 'sip' | 'models';

export default function PaperTradingPage() {
  const [activeTab, setActiveTab] = useState<TabType>('portfolio');
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);

  const tabs = [
    { id: 'portfolio' as TabType, label: 'Portfolio & Trading', icon: '📊' },
    { id: 'sip' as TabType, label: 'SIP Manager', icon: '📈' },
    { id: 'models' as TabType, label: 'Model Selection', icon: '🤖' },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Page Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <span className="text-3xl">🇮🇳</span>
                Indian Market Paper Trading
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Practice trading on NSE/BSE with virtual money
              </p>
            </div>
            <div className="flex items-center gap-4">
              <MarketStatus />
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 mt-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'portfolio' && (
          <PaperTrading onPortfolioSelect={setSelectedPortfolioId} />
        )}
        
        {activeTab === 'sip' && (
          <SIPManager portfolioId={selectedPortfolioId || undefined} />
        )}
        
        {activeTab === 'models' && (
          <>
            {selectedPortfolioId ? (
              <AdvancedModelSelector portfolioId={selectedPortfolioId} />
            ) : (
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center">
                <div className="text-6xl mb-4">🤖</div>
                <h3 className="text-xl font-semibold text-white mb-2">Select a Portfolio First</h3>
                <p className="text-gray-400 mb-6">
                  Go to the Portfolio & Trading tab and select or create a portfolio to configure model selection.
                </p>
                <button
                  onClick={() => setActiveTab('portfolio')}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                >
                  Go to Portfolio
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Quick Stats Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-800/90 backdrop-blur border-t border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <QuickStat label="NIFTY 50" value="22,147.50" change={0.35} />
            <QuickStat label="SENSEX" value="72,831.94" change={0.28} />
            <QuickStat label="BANK NIFTY" value="47,125.30" change={-0.15} />
          </div>
          <div className="text-gray-400">
            Paper Trading Mode • No real money involved
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function MarketStatus() {
  const [status, setStatus] = useState({ isOpen: false, session: 'closed' });

  // In real app, fetch from API
  const getStatusColor = () => {
    switch (status.session) {
      case 'pre_open':
        return 'bg-yellow-500';
      case 'open':
        return 'bg-green-500';
      case 'closed':
      default:
        return 'bg-red-500';
    }
  };

  const getStatusText = () => {
    switch (status.session) {
      case 'pre_open':
        return 'Pre-Market';
      case 'open':
        return 'Market Open';
      case 'closed':
      default:
        return 'Market Closed';
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg">
      <span className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse`} />
      <span className="text-sm text-gray-300">{getStatusText()}</span>
    </div>
  );
}

function QuickStat({ label, value, change }: { label: string; value: string; change: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-medium">{value}</span>
      <span className={`text-sm ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {change >= 0 ? '+' : ''}{change.toFixed(2)}%
      </span>
    </div>
  );
}
