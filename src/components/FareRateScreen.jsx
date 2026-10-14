import React from 'react';
import { IndianRupee, Gauge, Check, Info } from 'lucide-react';
import { formatCurrency } from '../utils/geoUtils';

export default function FareRateScreen({
  rate,
  inputRate,
  onRateChange,
  onRateBlur,
  onSelectPresetRate,
  distance,
  totalFare,
}) {
  const presetRates = [10, 15, 18, 20, 22, 25, 30];

  return (
    <div className="fare-rate-screen" aria-label="Fare Rate Settings">
      <div className="section-title-bar">
        <h1 className="screen-title">Fare Rate</h1>
        <p className="screen-subtitle">Configure per-kilometer tariff and live calculation</p>
      </div>

      <div className="dashboard-card fare-settings-card">
        <div className="card-header">
          <div className="card-header-icon bg-accent">
            <IndianRupee size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="card-title">Tariff Settings</h2>
            <p className="card-description">Set price or tariff rate per kilometer</p>
          </div>
        </div>

        {/* Prominent Current Rate Display */}
        <div className="rate-display-box">
          <div className="rate-readout">
            <span className="rate-currency">₹</span>
            <span className="rate-value">{rate.toFixed(2)}</span>
            <span className="rate-unit">/ km</span>
          </div>
          <div className="rate-subtext">Applied live to distance travelled</div>
        </div>

        {/* Editable Fare per KM Input */}
        <div className="form-group">
          <label htmlFor="rate-input" className="form-label">
            <span>Price Per Kilometer (₹)</span>
            <span className="helper-badge">Editable</span>
          </label>

          <div className="input-wrapper">
            <span className="input-prefix">₹</span>
            <input
              id="rate-input"
              type="number"
              min="0"
              step="0.5"
              value={inputRate}
              onChange={onRateChange}
              onBlur={onRateBlur}
              placeholder="20"
              className="number-input with-prefix"
              aria-describedby="rate-helper"
            />
            <span className="input-suffix">/ KM</span>
          </div>
          <p id="rate-helper" className="helper-text">
            Standard rate: ₹20/km. Custom rates and decimal values supported.
          </p>

          {/* Quick Preset Buttons */}
          <div className="quick-presets-section">
            <span className="quick-presets-title">Quick Rate Shortcuts:</span>
            <div className="quick-presets-row" aria-label="Quick rate shortcuts">
              {presetRates.map((presetRate) => {
                const isSelected = rate === presetRate;
                return (
                  <button
                    key={presetRate}
                    type="button"
                    className={`btn-rate-preset ${isSelected ? 'is-active' : ''}`}
                    onClick={() => onSelectPresetRate(presetRate)}
                  >
                    <span>₹{presetRate}</span>
                    {isSelected && <Check size={11} className="preset-check-icon" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live Calculation Breakdown Box */}
        <div className="calculation-breakdown-card">
          <div className="breakdown-title">
            <Gauge size={16} />
            <span>Live Calculation Breakdown</span>
          </div>
          <div className="breakdown-formula">
            <div className="formula-part">
              <span className="formula-num">{distance.toFixed(2)} km</span>
              <span className="formula-label">Distance</span>
            </div>
            <div className="formula-op">×</div>
            <div className="formula-part">
              <span className="formula-num">₹{rate.toFixed(2)}</span>
              <span className="formula-label">Rate / km</span>
            </div>
            <div className="formula-op">=</div>
            <div className="formula-part formula-result">
              <span className="formula-num">₹{formatCurrency(totalFare)}</span>
              <span className="formula-label">Total Fare</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tariff Guidance Note */}
      <div className="gps-notice-box">
        <Info size={16} className="notice-icon" />
        <span>
          Changing the rate updates the fare calculation in real time without resetting your distance or interrupting an active trip.
        </span>
      </div>
    </div>
  );
}
