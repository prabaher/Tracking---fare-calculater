import React from 'react';
import { Home, Navigation, IndianRupee, History } from 'lucide-react';

export default function BottomNav({ activeTab, onSelectTab, isTracking }) {
  const navItems = [
    {
      id: 'home',
      label: 'Home',
      icon: Home,
    },
    {
      id: 'distance',
      label: 'Distance & GPS',
      icon: Navigation,
      badge: isTracking ? 'LIVE' : null,
    },
    {
      id: 'fare',
      label: 'Fare Rate',
      icon: IndianRupee,
    },
    {
      id: 'history',
      label: 'History',
      icon: History,
    },
  ];

  return (
    <nav className="bottom-nav-bar" aria-label="Bottom Navigation">
      <div className="bottom-nav-inner">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              id={`nav-item-${item.id}`}
              className={`bottom-nav-btn ${isActive ? 'is-active' : ''}`}
              onClick={() => onSelectTab(item.id)}
              aria-selected={isActive}
              aria-label={item.label}
            >
              <div className="bottom-nav-icon-wrapper">
                <Icon size={20} className="bottom-nav-icon" />
                {item.badge && <span className="bottom-nav-live-dot" />}
              </div>
              <span className="bottom-nav-label">{item.label}</span>
              {isActive && <span className="bottom-nav-indicator" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
