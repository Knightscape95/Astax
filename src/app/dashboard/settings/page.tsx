'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';

interface SettingsSection {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const sections: SettingsSection[] = [
  {
    id: 'account',
    title: 'Account',
    description: 'Manage your account settings and preferences',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Configure how you receive notifications',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    id: 'trading',
    title: 'Trading',
    description: 'Configure trading parameters and risk settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
  {
    id: 'appearance',
    title: 'Appearance',
    description: 'Customize the look and feel',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
  },
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const [activeSection, setActiveSection] = useState('account');
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [riskLimit, setRiskLimit] = useState('10');
  const [maxPositions, setMaxPositions] = useState('5');

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 text-sm mt-1">
          Manage your account and application preferences
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <nav className="bg-gray-800 rounded-xl p-2 space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === section.id
                    ? 'bg-emerald-600/20 text-emerald-400'
                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
                }`}
              >
                {section.icon}
                {section.title}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          <div className="bg-gray-800 rounded-xl p-6">
            {activeSection === 'account' && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Account Settings</h2>
                <p className="text-gray-400 text-sm mb-6">Manage your account information</p>

                <div className="space-y-6">
                  {/* User Info */}
                  <div className="flex items-center gap-4 pb-6 border-b border-gray-700">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <span className="text-2xl font-bold text-white">
                        {session?.user?.name?.charAt(0) || 'A'}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-white">
                        {session?.user?.name || 'Admin'}
                      </h3>
                      <p className="text-gray-400">
                        {session?.user?.email || 'admin@money.app'}
                      </p>
                      <span className="inline-flex items-center px-2 py-0.5 mt-1 text-xs font-medium text-emerald-400 bg-emerald-500/20 rounded">
                        Administrator
                      </span>
                    </div>
                  </div>

                  {/* Session Info */}
                  <div>
                    <h3 className="text-sm font-medium text-white mb-3">Session Information</h3>
                    <div className="bg-gray-700/50 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">Status</span>
                        <span className="flex items-center gap-2 text-green-400 text-sm">
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                          Active
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">Role</span>
                        <span className="text-white text-sm">Admin</span>
                      </div>
                    </div>
                  </div>

                  {/* Sign Out */}
                  <div className="pt-4">
                    <button
                      onClick={() => signOut({ callbackUrl: '/login' })}
                      className="flex items-center gap-2 px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'notifications' && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Notification Preferences</h2>
                <p className="text-gray-400 text-sm mb-6">Configure how you want to be notified</p>

                <div className="space-y-4">
                  {/* Push Notifications */}
                  <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                    <div>
                      <h3 className="text-white font-medium">Push Notifications</h3>
                      <p className="text-gray-400 text-sm">Receive browser push notifications</p>
                    </div>
                    <button
                      onClick={() => setPushEnabled(!pushEnabled)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        pushEnabled ? 'bg-emerald-600' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                          pushEnabled ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Email Notifications */}
                  <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                    <div>
                      <h3 className="text-white font-medium">Email Notifications</h3>
                      <p className="text-gray-400 text-sm">Receive alerts via email</p>
                    </div>
                    <button
                      onClick={() => setEmailEnabled(!emailEnabled)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        emailEnabled ? 'bg-emerald-600' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                          emailEnabled ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Alert Types */}
                  <div className="mt-6">
                    <h3 className="text-white font-medium mb-4">Alert Types</h3>
                    <div className="space-y-3">
                      {[
                        { name: 'Large Loss Alerts', enabled: true },
                        { name: 'High Drawdown Alerts', enabled: true },
                        { name: 'Model Degradation', enabled: true },
                        { name: 'Trade Signals', enabled: false },
                        { name: 'Performance Milestones', enabled: false },
                      ].map((alert, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0"
                        >
                          <span className="text-gray-300">{alert.name}</span>
                          <input
                            type="checkbox"
                            defaultChecked={alert.enabled}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-emerald-600 focus:ring-emerald-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'trading' && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Trading Settings</h2>
                <p className="text-gray-400 text-sm mb-6">Configure trading parameters and risk limits</p>

                <div className="space-y-6">
                  {/* Risk Limit */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Max Risk Per Trade (%)
                    </label>
                    <input
                      type="number"
                      value={riskLimit}
                      onChange={(e) => setRiskLimit(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-gray-400 text-xs mt-1">Maximum percentage of portfolio to risk on a single trade</p>
                  </div>

                  {/* Max Positions */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Maximum Open Positions
                    </label>
                    <input
                      type="number"
                      value={maxPositions}
                      onChange={(e) => setMaxPositions(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-gray-400 text-xs mt-1">Maximum number of simultaneous open positions</p>
                  </div>

                  {/* Auto Trading */}
                  <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                    <div>
                      <h3 className="text-white font-medium">Auto Trading</h3>
                      <p className="text-gray-400 text-sm">Automatically execute model signals</p>
                    </div>
                    <span className="px-3 py-1 text-xs font-medium text-yellow-400 bg-yellow-500/20 rounded">
                      Coming Soon
                    </span>
                  </div>

                  {/* Paper Trading */}
                  <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                    <div>
                      <h3 className="text-white font-medium">Paper Trading Mode</h3>
                      <p className="text-gray-400 text-sm">Simulate trades without real money</p>
                    </div>
                    <span className="px-3 py-1 text-xs font-medium text-emerald-400 bg-emerald-500/20 rounded">
                      Active
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'appearance' && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Appearance</h2>
                <p className="text-gray-400 text-sm mb-6">Customize the look and feel of the application</p>

                <div className="space-y-6">
                  {/* Theme */}
                  <div>
                    <h3 className="text-sm font-medium text-white mb-3">Theme</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <button className="p-4 bg-gray-900 border-2 border-emerald-500 rounded-lg text-center">
                        <div className="w-full h-8 bg-gray-800 rounded mb-2"></div>
                        <span className="text-sm text-white">Dark</span>
                      </button>
                      <button className="p-4 bg-white border-2 border-gray-200 rounded-lg text-center opacity-50 cursor-not-allowed">
                        <div className="w-full h-8 bg-gray-100 rounded mb-2"></div>
                        <span className="text-sm text-gray-600">Light</span>
                      </button>
                      <button className="p-4 bg-gray-700 border-2 border-gray-600 rounded-lg text-center opacity-50 cursor-not-allowed">
                        <div className="w-full h-8 bg-gradient-to-r from-gray-800 to-gray-200 rounded mb-2"></div>
                        <span className="text-sm text-gray-400">System</span>
                      </button>
                    </div>
                  </div>

                  {/* Accent Color */}
                  <div>
                    <h3 className="text-sm font-medium text-white mb-3">Accent Color</h3>
                    <div className="flex gap-3">
                      {[
                        { name: 'Emerald', color: 'bg-emerald-500', active: true },
                        { name: 'Blue', color: 'bg-blue-500', active: false },
                        { name: 'Purple', color: 'bg-purple-500', active: false },
                        { name: 'Orange', color: 'bg-orange-500', active: false },
                      ].map((accent) => (
                        <button
                          key={accent.name}
                          className={`w-10 h-10 rounded-lg ${accent.color} ${
                            accent.active ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-800' : ''
                          }`}
                          title={accent.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Chart Style */}
                  <div>
                    <h3 className="text-sm font-medium text-white mb-3">Chart Style</h3>
                    <select className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500">
                      <option value="area">Area Charts</option>
                      <option value="line">Line Charts</option>
                      <option value="bar">Bar Charts</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
