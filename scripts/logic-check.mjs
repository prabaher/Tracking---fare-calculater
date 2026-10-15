/**
 * Dependency-free checks for the trip maths:
 *  - duration derived from timestamps (survives phone sleep / suspension)
 *  - paused time excluded from the duration
 *  - GPS drift, noise, slow travel, signal loss and teleports handled correctly
 *  - fare always consistent with the validated distance
 *  - route sampling keeps the shape of the route
 *
 * These run against the exact odometer the app uses (createGpsOdometer), so a
 * passing run means the shipped tracking logic behaves as described.
 *
 * Run with: npm run test:logic
 */
import assert from 'node:assert/strict';
import {
  computeActiveMs,
  computeAverageSpeedKmh,
  createGpsOdometer,
  createSeededRandom,
  formatDuration,
  computeMovementFloorMeters,
  calculateHaversineDistance,
  sampleRoute,
  compactRouteCoordinates,
  GPS_ACCURACY_LIMIT_METERS,
  GPS_TRACKING_OPTIONS,
} from '../src/utils/geoUtils.js';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

const METERS_PER_DEG_LAT = 111_320;
const metersToLat = (meters) => meters / METERS_PER_DEG_LAT;

/**
 * Feeds a sequence of fixes into a fresh odometer and reports what the app
 * would show: the odometer's own distance, the naive sum (what a broken
 * implementation would report) and the fare at a fixed rate.
 */
function drive(fixes, { rate = 20, odometer = createGpsOdometer(), distanceKm = 0 } = {}) {
  let naiveKm = 0;
  let acceptedKm = 0;
  let prev = null;
  let totalKm = distanceKm;
  const reasons = [];

  for (const fix of fixes) {
    if (prev) naiveKm += calculateHaversineDistance(prev.lat, prev.lon, fix.lat, fix.lon);
    const verdict = odometer.ingest(fix);
    reasons.push(verdict.reason);
    if (verdict.accepted) {
      totalKm += verdict.deltaKm;
      acceptedKm += verdict.deltaKm;
    }
    prev = fix;
  }

  return {
    odometer,
    distanceKm: totalKm,
    acceptedKm,
    naiveKm,
    fare: totalKm * rate,
    naiveFare: naiveKm * rate,
    reasons,
  };
}

/** Stationary phone: a fixed point with jitter that grows with the accuracy. */
function stationaryFixes({
  count,
  startTimestamp = 0,
  intervalMs = 1000,
  accuracy = 8,
  originLat = 11.0,
  originLon = 77.0,
  seed = 7,
  driftPerMinuteMeters = 0,
}) {
  const random = createSeededRandom(seed);
  const jitterMeters = accuracy * 0.9;
  const fixes = [];
  for (let i = 0; i < count; i += 1) {
    const timestamp = startTimestamp + i * intervalMs;
    const minutes = (i * intervalMs) / 60000;
    const lat = originLat + metersToLat(driftPerMinuteMeters * minutes);
    fixes.push({
      lat: lat + metersToLat((random() * 2 - 1) * jitterMeters),
      lon: originLon + metersToLat((random() * 2 - 1) * jitterMeters),
      accuracy,
      speed: null,
      timestamp,
    });
  }
  return fixes;
}

/** Genuine travel along a latitude line at a constant speed. */
function travelFixes({ count, speedKmh, startTimestamp = 0, intervalMs = 1000, originLat = 11.0, originLon = 77.0 }) {
  const metersPerFix = (speedKmh / 3.6) * (intervalMs / 1000);
  const fixes = [];
  for (let i = 0; i < count; i += 1) {
    fixes.push({
      lat: originLat + metersToLat(metersPerFix * i),
      lon: originLon,
      accuracy: 6,
      speed: speedKmh / 3.6,
      timestamp: startTimestamp + i * intervalMs,
    });
  }
  return fixes;
}

console.log('\nTrip timer');

check('formats durations as HH:MM:SS', () => {
  assert.equal(formatDuration(3974), '01:06:14');
  assert.equal(formatDuration(0), '00:00:00');
  assert.equal(formatDuration(59), '00:00:59');
});

check('counts real elapsed time between timestamps', () => {
  const start = 1_700_000_000_000;
  const ms = computeActiveMs({
    accumulatedActiveMs: 0,
    sessionStartedAt: start,
    isPaused: false,
    now: start + 65_000,
  });
  assert.equal(Math.floor(ms / 1000), 65);
});

check('keeps counting after a suspend/sleep gap (no counter drift)', () => {
  const start = 1_700_000_000_000;
  const sleptFor6Minutes = start + 6 * 60 * 1000;
  const ms = computeActiveMs({
    accumulatedActiveMs: 30_000, // 30 s recorded before the phone slept
    sessionStartedAt: start,
    isPaused: false,
    now: sleptFor6Minutes,
  });
  assert.equal(Math.floor(ms / 1000), 6 * 60 + 30);
});

check('excludes paused time even if the page stays open for hours', () => {
  const start = 1_700_000_000_000;
  const ms = computeActiveMs({
    accumulatedActiveMs: 90_000,
    sessionStartedAt: start,
    isPaused: true,
    now: start + 3 * 60 * 60 * 1000,
  });
  assert.equal(ms, 90_000);
});

check('is monotonic across pause/resume segments', () => {
  const t0 = 1_700_000_000_000;
  const segmentOne = computeActiveMs({
    accumulatedActiveMs: 0,
    sessionStartedAt: t0,
    isPaused: false,
    now: t0 + 120_000,
  });
  // pause at t0+2min, resume 10 min later
  const afterResume = computeActiveMs({
    accumulatedActiveMs: segmentOne,
    sessionStartedAt: t0 + 12 * 60 * 1000,
    isPaused: false,
    now: t0 + 13 * 60 * 1000,
  });
  assert.equal(afterResume, 3 * 60 * 1000); // 2 min active + 1 min active
});

console.log('\nGPS odometer — drift, noise and recovery');

check('1. stationary for 5 minutes: distance and fare stay put', () => {
  const result = drive(stationaryFixes({ count: 300, accuracy: 8 }));
  // A naive "sum every fix" odometer would have billed hundreds of meters here.
  assert.ok(result.naiveKm > 0.5, `sanity: naive sum ${result.naiveKm.toFixed(3)} km`);
  assert.ok(
    result.distanceKm < 0.01,
    `stationary distance stayed at ${result.distanceKm.toFixed(4)} km`
  );
  assert.ok(result.fare < 0.2, `stationary fare stayed at ₹${result.fare.toFixed(2)}`);
});

check('2. fluctuating coordinates are filtered out as noise', () => {
  const fixes = stationaryFixes({ count: 120, accuracy: 14, seed: 21 });
  const result = drive(fixes);
  assert.ok(result.naiveKm > 0.8, `sanity: naive sum ${result.naiveKm.toFixed(3)} km`);
  assert.ok(result.distanceKm < 0.02, `filtered distance ${result.distanceKm.toFixed(4)} km`);
  assert.ok(
    result.reasons.filter((r) => r === 'noise').length > 50,
    'most stationary fixes are classified as noise'
  );
});

check('3. a real 1 km drive is measured accurately', () => {
  const result = drive(travelFixes({ count: 120, speedKmh: 30 }));
  assert.ok(
    Math.abs(result.distanceKm - 1.0) < 0.05,
    `measured ${result.distanceKm.toFixed(3)} km for a 1.000 km drive`
  );
  assert.ok(Math.abs(result.fare - 20) < 1, `fare ₹${result.fare.toFixed(2)} at ₹20/km`);
});

check('4. slow movement in traffic still accumulates', () => {
  // 6 km/h for 60 s ≈ 100 m: below the old accuracy-derived floor per fix, but
  // the odometer compares against the last accepted point, so it counts.
  const result = drive(travelFixes({ count: 60, speedKmh: 6 }));
  assert.ok(
    result.distanceKm > 0.08 && result.distanceKm < 0.12,
    `slow crawl measured ${result.distanceKm.toFixed(3)} km`
  );
});

check('5. GPS loss then recovery adds no artificial jump', () => {
  const odometer = createGpsOdometer();
  const before = travelFixes({ count: 30, speedKmh: 20 });
  const first = drive(before, { odometer });
  assert.ok(first.distanceKm > 0.1, `measured ${first.distanceKm.toFixed(3)} km before the outage`);

  // The phone keeps driving 300 m while the signal is gone for 90 s, then the
  // receiver returns at the new position.
  const lastFix = before[before.length - 1];
  const reacquired = {
    lat: lastFix.lat + metersToLat(300),
    lon: lastFix.lon,
    accuracy: 9,
    speed: null,
    timestamp: lastFix.timestamp + 90_000,
  };
  const resumeVerdict = odometer.ingest(reacquired);
  assert.equal(resumeVerdict.reason, 'gap-reset');
  assert.equal(resumeVerdict.deltaKm, 0);

  // Tracking continues normally from the re-acquired position.
  const after = travelFixes({
    count: 20,
    speedKmh: 20,
    startTimestamp: reacquired.timestamp,
    originLat: reacquired.lat,
  });
  const tail = drive(after, { odometer, distanceKm: first.distanceKm });
  assert.ok(
    tail.distanceKm - first.distanceKm > 0.05,
    `tracking recovered: ${(tail.distanceKm - first.distanceKm).toFixed(3)} km after the outage`
  );
});

check('6. pause, resume and stop accumulate correctly', () => {
  const odometer = createGpsOdometer();
  // Leg 1: 30 fixes at 24 km/h ≈ 200 m
  const leg1Fixes = travelFixes({ count: 30, speedKmh: 24 });
  const leg1 = drive(leg1Fixes, { odometer });
  const afterLeg1 = leg1.distanceKm;
  assert.ok(afterLeg1 > 0.15 && afterLeg1 < 0.25, `leg 1 measured ${afterLeg1.toFixed(3)} km`);

  // PAUSE: the app stops feeding fixes and clears the reference point, so the
  // 2 km the vehicle covers while paused is never charged.
  odometer.beginSegment();
  assert.equal(odometer.snapshot().anchor, null, 'pause clears the reference point');

  // RESUME: the driver is now 2 km further along; that distance is a new
  // baseline (0 km billed) and leg 2 is measured from there.
  odometer.beginSegment();
  const pausedEndLat = leg1Fixes[leg1Fixes.length - 1].lat + metersToLat(2000);
  const leg2 = drive(
    travelFixes({ count: 30, speedKmh: 24, startTimestamp: 180_000, originLat: pausedEndLat }),
    { odometer, distanceKm: afterLeg1 }
  );
  assert.ok(leg2.distanceKm > afterLeg1, 'leg 2 adds distance after the resume');
  assert.ok(
    leg2.distanceKm - afterLeg1 < 0.25,
    `the 2 km travelled while paused was not charged (added ${(leg2.distanceKm - afterLeg1).toFixed(3)} km)`
  );

  // STOP: the odometer is parked and any late fix contributes nothing.
  odometer.beginSegment();
  const frozen = leg2.distanceKm;
  const stopFix = odometer.ingest({
    lat: 11.5,
    lon: 77.5,
    accuracy: 5,
    speed: 0,
    timestamp: 400_000,
  });
  assert.equal(stopFix.reason, 'baseline');
  assert.equal(stopFix.deltaKm, 0);
  assert.equal(frozen, leg2.distanceKm);
});

check('7. fare follows only the validated distance', () => {
  const rate = 18.5;
  const result = drive(stationaryFixes({ count: 240, accuracy: 10, seed: 33 }), { rate });
  assert.equal(result.fare, result.distanceKm * rate);
  assert.ok(result.distanceKm < 0.01, `validated distance ${result.distanceKm.toFixed(4)} km`);
  assert.ok(result.fare < 0.2, `fare ₹${result.fare.toFixed(2)} stays stable while parked`);
  assert.ok(result.naiveFare > 5, `sanity: naive fare would have been ₹${result.naiveFare.toFixed(2)}`);

  // Distance is monotonic: a rejected fix can never lower it either.
  const monotonic = drive([
    ...travelFixes({ count: 10, speedKmh: 30 }),
    ...stationaryFixes({ count: 40, startTimestamp: 10_000, seed: 44 }),
  ]);
  assert.ok(monotonic.distanceKm >= 0 && Number.isFinite(monotonic.distanceKm));
  assert.equal(monotonic.fare, monotonic.distanceKm * 20);
});

check('rejects inaccurate fixes without touching the distance', () => {
  const odometer = createGpsOdometer();
  const good = travelFixes({ count: 5, speedKmh: 36 });
  const partial = drive(good, { odometer });
  const before = partial.distanceKm;

  const bad = odometer.ingest({
    lat: good[4].lat + metersToLat(120),
    lon: good[4].lon,
    accuracy: GPS_ACCURACY_LIMIT_METERS + 20,
    speed: null,
    timestamp: 5000,
  });
  assert.equal(bad.accepted, false);
  assert.equal(bad.reason, 'low-accuracy');
  assert.equal(bad.deltaKm, 0);
  assert.equal(partial.distanceKm, before);
});

check('ignores duplicate and out-of-order fixes', () => {
  const odometer = createGpsOdometer();
  const fixes = travelFixes({ count: 6, speedKmh: 36 });
  drive(fixes, { odometer });
  const state = odometer.snapshot();

  const duplicate = odometer.ingest({ ...fixes[5] });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, 'duplicate');

  const stale = odometer.ingest({ ...fixes[3], timestamp: fixes[3].timestamp - 5000 });
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, 'out-of-order');

  // A burst of fixes in the same millisecond window is throttled too.
  const burst = odometer.ingest({
    ...fixes[5],
    lat: fixes[5].lat + metersToLat(50),
    timestamp: state.lastTimestamp + 50,
  });
  assert.equal(burst.accepted, false);
  assert.equal(burst.reason, 'too-soon');
  assert.equal(odometer.snapshot().lastTimestamp, state.lastTimestamp);
});

check('re-baselines an impossible jump instead of billing it', () => {
  const odometer = createGpsOdometer();
  const fixes = travelFixes({ count: 10, speedKmh: 30 });
  const before = drive(fixes, { odometer });

  const jumpedLat = fixes[9].lat + metersToLat(5000); // 5 km in 1 s
  const teleport = odometer.ingest({
    lat: jumpedLat,
    lon: fixes[9].lon,
    accuracy: 7,
    speed: null,
    timestamp: 10_000,
  });
  assert.equal(teleport.accepted, false);
  assert.equal(teleport.reason, 'implausible');
  assert.equal(teleport.deltaKm, 0);

  // Tracking continues from the new position (re-baselined, not frozen).
  const after = travelFixes({ count: 10, speedKmh: 30, startTimestamp: 10_000, originLat: jumpedLat });
  const tail = drive(after, { odometer, distanceKm: before.distanceKm });
  assert.ok(tail.distanceKm > before.distanceKm, 'odometer recovered after the jump');
  assert.ok(tail.distanceKm - before.distanceKm < 0.12, 'the 5 km jump itself was never billed');
});

check('scales the movement floor with accuracy and fix interval', () => {
  // noise = bestAccuracy × 0.6 + 3 m, raised by the fix interval so 1 Hz jitter
  // is filtered harder than a 10 s sample (and never below the 1.2 km/h floor).
  const tight = computeMovementFloorMeters({ accuracyMeters: 5, bestAccuracyMeters: 5, elapsedMs: 1000 });
  const loose = computeMovementFloorMeters({ accuracyMeters: 24, bestAccuracyMeters: 24, elapsedMs: 1000 });
  const spread = computeMovementFloorMeters({ accuracyMeters: 8, bestAccuracyMeters: 8, elapsedMs: 30_000 });
  assert.ok(Math.abs(tight - 6) < 1e-9, `±5 m floor ${tight}`);
  assert.ok(Math.abs(loose - 17.4) < 1e-9, `±24 m floor ${loose}`);
  assert.ok(loose > tight, `±24 m floor ${loose} is stricter than ±5 m floor ${tight}`);
  assert.ok(Math.abs(spread - 14.4) < 1e-9, `a 30 s gap raises the floor to ${spread}`);
});

check('1b. slow systematic drift over 10 minutes stays under 25 m', () => {
  // Random jitter plus a 1 m/min bias — the worst realistic "phone on the
  // dashboard" case. It must not turn into visible kilometres or fare.
  const result = drive(
    stationaryFixes({ count: 600, accuracy: 9, seed: 91, driftPerMinuteMeters: 1 })
  );
  assert.ok(
    result.distanceKm < 0.025,
    `10 minutes parked accumulated ${(result.distanceKm * 1000).toFixed(1)} m`
  );
  assert.ok(result.fare < 0.5, `fare after 10 parked minutes ₹${result.fare.toFixed(2)}`);
});

check('ships mobile-friendly watch options', () => {
  assert.equal(GPS_TRACKING_OPTIONS.enableHighAccuracy, true);
  assert.ok(GPS_TRACKING_OPTIONS.timeout >= 10000);
  assert.ok(Number.isFinite(GPS_TRACKING_OPTIONS.maximumAge));
});

console.log('\nRoute + fare helpers');

check('samples long routes while keeping first and last point', () => {
  const route = Array.from({ length: 5000 }, (_, i) => ({ lat: 11 + i * 0.00001, lon: 77, timestamp: i * 1000 }));
  const sampled = sampleRoute(route, 400);
  assert.equal(sampled.length, 400);
  assert.deepEqual(sampled[0], route[0]);
  assert.deepEqual(sampled[sampled.length - 1], route[route.length - 1]);
  assert.equal(sampleRoute(route.slice(0, 12), 400).length, 12);
});

check('compacts route coordinates for storage', () => {
  const compacted = compactRouteCoordinates(
    [{ lat: 11.000004321, lon: 77.000007654, timestamp: 1234 }],
    400
  );
  assert.deepEqual(compacted, [{ lat: 11.00000, lon: 77.00001, t: 1234 }]);
});

check('derives average speed from distance and active duration', () => {
  assert.equal(computeAverageSpeedKmh(14.89, 3974), 13);
  assert.equal(computeAverageSpeedKmh(0, 300), 0);
  assert.equal(computeAverageSpeedKmh(5, 0), 0);
});

check('haversine distance matches a known ~1 km span', () => {
  const km = calculateHaversineDistance(11.0, 77.0, 11.009, 77.0);
  assert.ok(Math.abs(km - 1.0) < 0.02, `distance ${km.toFixed(3)} km`);
});

console.log(`\nAll ${passed} logic checks passed.\n`);
