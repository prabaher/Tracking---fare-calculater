# 🚖 KiloFare — Kilometer & Fare Calculator

A clean, responsive React web application that calculates travel distance and fare using either **live browser GPS tracking** or **manual kilometer entry**.

---

## 🌟 Core Features

### 1. Kilometer Calculator
- **Default distance**: Starts at `1.00 km`.
- **Editable numeric input**: Allows decimal values (e.g. `1.25 km`, `5.75 km`).
- **Input Validation**: Prevents negative values; ensures graceful fallbacks.
- **GPS Safety Lock**: Automatically disables and locks manual input during active GPS tracking to prevent accidental alterations.
- **Trip Editing**: Once GPS trip is stopped, users can manually adjust the distance as needed.

### 2. Editable Fare Per Kilometer
- **Default rate**: `₹20` per kilometer.
- **Custom Rates**: Editable numeric input allowing custom rupee tariffs and decimals (e.g. ₹18.50, ₹22.00).
- **Instant Recalculation**: Any rate or distance change instantly recalculates the total fare in real time.

### 3. Automatic Fare Calculation
- **Formula**:
  $$\text{Total Fare} = \text{Distance in Kilometers} \times \text{Price Per Kilometer}$$
- **Currency formatting**: Displayed in Indian Rupees (`₹`), rounded and formatted to two decimal places (e.g. `₹20.00`, `₹100.00`).
- **Live Breakdown**: Formula breakdown displaying `Distance × Rate = Total Fare`.

### 4. Real-Time GPS Trip Tracking
- Uses browser's native `navigator.geolocation.watchPosition()`.
- **Haversine Formula**: Calculates great-circle distance between successive geographical coordinates.
- **High Accuracy Mode**: Configured with `enableHighAccuracy: true`, `timeout: 15000`, and `maximumAge: 0`.
- **Jitter & Noise Filtering**:
  - Discards inaccurate satellite fixes (`accuracy > 50m`).
  - Ignores stationary micro-jitter (`< 4m`) to prevent phantom distance creep when standing still.
  - Filters out unrealistic speed jumps (`> 220 km/h`).
- **Initial Trip Distance**: Starts at `0.00 km` for newly initiated GPS trips.
- **Live Trip Timer**: Displays elapsed duration in `HH:MM:SS` format.
- **Clear GPS Telemetry**: Shows status indicators (*Ready to Track*, *Finding Location*, *GPS Connected*, *Trip Stopped*, *GPS Unavailable*, *Permission Denied*).
- **Graceful Error Handling**: Fallbacks and notifications if user denies location permissions or GPS is unavailable.

### 5. Trip Summary & Google Sheets Integration
- Displays **Total Distance**, **Price Per KM**, **Trip Duration**, and **Total Fare**.
- **Save to Google Sheets**:
  - Automatically captures or lets you enter **Starting Location** and **Ending Location (Destination)**.
  - Sends Timestamp, Date, Time, Starting Location, Ending Location, Distance (km), Rate (₹/km), Total Fare (₹), Duration, and Tracking Mode to Google Sheets via Google Apps Script.
  - Pre-packaged ready-to-deploy script available in [google-sheets-apps-script.js](file:///p:/weekly%20project/Tracking%20&%20fare%20calculater/google-sheets-apps-script.js).
  - Also records recent trip entries into a local offline log with export/clear options.
- **Reset Calculator**: Restores manual defaults (`1.00 km` and `₹20/km`), terminates active GPS watch, and resets the timer to `00:00:00`.
- **Copy Summary**: One-click copy of the trip receipt to clipboard.

---

## 🚀 Running the Project Locally

### 1. Start Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 2. Testing GPS on Mobile Phone (Local Network)
```bash
npm run dev -- --host
```

### 3. Production Build
```bash
npm run build
npm run preview
```
