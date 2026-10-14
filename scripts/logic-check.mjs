/**
 * Dependency-free checks for the trip maths that used to be wrong:
 *  - duration derived from timestamps (survives phone sleep / suspension)
 *  - paused time excluded from the duration
 *  - GPS noise, slow travel and teleports handled correctly by the odometer
 *  - route sampling keeps the shape of the route
 *
 * Run with: npm run test:logic
 */
import assert from 'node:assert/strict';
import {
  computeActiveMs,
  computeAverageSpeedKmh,
  evaluateGpsFix,
  formatDuration,
  getMinMoveMeters,
  calculateHaversineDistance,
  sampleRoute,
  compactRouteCoordinates,
} from '../src/utils/geoUtils.js';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

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

console.log('\nGPS odometer');

check('scales the noise threshold with reported accuracy', () => {
  assert.equal(getMinMoveMeters(5), 4); // max(3, 4)
  assert.ok(Math.abs(getMinMoveMeters(12) - 9.6) < 1e-9);
  assert.equal(getMinMoveMeters(40), 15); // capped
  assert.equal(getMinMoveMeters(null), 3);
});

check('rejects sub-threshold jitter while stationary', () => {
  const prev = { lat: 11.0, lon: 77.0, timestamp: 1000 };
  const next = { lat: 11.0 + 0.00003, lon: 77.0, timestamp: 2000 }; // ~3.3 m
  const verdict = evaluateGpsFix({
    prev,
    next,
    accuracyMeters: 10,
    reportedSpeedMs: null,
  });
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'noise');
  assert.equal(verdict.deltaKm, 0);
});

check('accepts genuine slow movement and reports its speed', () => {
  const prev = { lat: 11.0, lon: 77.0, timestamp: 0 };
  const next = { lat: 11.0 + 0.000225, lon: 77.0, timestamp: 10_000 }; // ~25 m in 10 s
  const verdict = evaluateGpsFix({
    prev,
    next,
    accuracyMeters: 6,
    reportedSpeedMs: null,
  });
  assert.equal(verdict.accepted, true);
  assert.ok(Math.abs(verdict.deltaKm - 0.025) < 0.002, `delta ${verdict.deltaKm}`);
  assert.ok(verdict.speedKmh >= 8 && verdict.speedKmh <= 10, `speed ${verdict.speedKmh}`);
});

check('rejects an impossible GPS jump without billing it', () => {
  const prev = { lat: 11.0, lon: 77.0, timestamp: 0 };
  const next = { lat: 11.005, lon: 77.0, timestamp: 2000 }; // ~0.55 km in 2 s
  const verdict = evaluateGpsFix({
    prev,
    next,
    accuracyMeters: 8,
    reportedSpeedMs: null,
  });
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, 'implausible');
  assert.equal(verdict.deltaKm, 0);
});

check('accumulates ~1 km for a 1 km straight run', () => {
  const stepMeters = 10;
  const stepDegLat = stepMeters / 111_320;
  let lat = 11.0;
  let timestamp = 0;
  let prev = { lat, lon: 77.0, timestamp };
  let totalKm = 0;
  let accepted = 0;

  for (let i = 1; i <= 100; i += 1) {
    lat += stepDegLat;
    timestamp += 1000;
    const next = { lat, lon: 77.0, timestamp };
    const verdict = evaluateGpsFix({
      prev,
      next,
      accuracyMeters: 8,
      reportedSpeedMs: null,
    });
    if (verdict.accepted) {
      totalKm += verdict.deltaKm;
      accepted += 1;
      prev = next;
    }
  }

  assert.ok(Math.abs(totalKm - 1.0) < 0.03, `accumulated ${totalKm.toFixed(3)} km`);
  assert.equal(accepted, 100);
});

check('does not manufacture distance from a stationary jittering fix', () => {
  // Fixed ±5 m zig-zag around one point at ±8 m accuracy: naive summing would
  // report ~0.6 km of phantom travel.
  const originLat = 11.0;
  const originLon = 77.0;
  const stepDeg = 5 / 111_320; // 5 m
  let timestamp = 0;
  let prev = { lat: originLat, lon: originLon, timestamp };
  let totalKm = 0;
  let naiveKm = 0;
  const directions = [1, -1, 1, 1, -1, -1];

  for (let i = 0; i < 120; i += 1) {
    timestamp += 1000;
    const next = {
      lat: originLat + (directions[i % directions.length] * stepDeg * (i % 2 === 0 ? 1 : 0.6)),
      lon: originLon,
      timestamp,
    };
    const verdict = evaluateGpsFix({
      prev,
      next,
      accuracyMeters: 8,
      reportedSpeedMs: null,
    });
    naiveKm += verdict.rawDeltaKm;
    if (verdict.accepted) {
      totalKm += verdict.deltaKm;
      prev = next;
    }
  }

  assert.ok(naiveKm > 0.4, `sanity: naive sum ${naiveKm.toFixed(3)} km`);
  assert.ok(totalKm < 0.1, `phantom distance stayed at ${totalKm.toFixed(3)} km`);
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
