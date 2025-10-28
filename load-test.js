#!/usr/bin/env node

/**
 * GeekDS Realistic Load Test
 * 
 * Simulates 199 devices sending heartbeats every 10 seconds
 * with schedule fetches every 10 minutes (staggered start)
 * 
 * Test Data:
 * - 199 devices (LT Device 1-200, excluding 116)
 * - 199 schedules (LT Schedule 1-200, excluding 116)
 * - 50 playlists (LT Playlist 1-50)
 */

const http = require('http');

// Configuration
const API_URL = process.env.API_URL || 'http://192.168.1.13:5000';
const DEVICE_START = 1;
const DEVICE_END = 200;
const EXCLUDED_DEVICES = [116]; // Deleted device
const HEARTBEAT_INTERVAL = 10000; // 10 seconds
const SCHEDULE_FETCH_INTERVAL = 600000; // 10 minutes
const STAGGER_DELAY = 50; // 50ms between starting each device
const TEST_DURATION = 0; // 1 hour (0 = infinite)

// Statistics
const stats = {
  startTime: Date.now(),
  heartbeats: {
    sent: 0,
    success: 0,
    failed: 0,
    totalTime: 0,
    minTime: Infinity,
    maxTime: 0,
  },
  scheduleFetches: {
    sent: 0,
    success: 0,
    failed: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalTime: 0,
    minTime: Infinity,
    maxTime: 0,
  },
  errors: {},
  deviceStates: {}, // Track each device's state
};

// Store device UUIDs (fetched from API)
const deviceUUIDs = new Map();

// Helper to make HTTP request
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      const bodyStr = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const startTime = Date.now();
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed, elapsed });
        } catch (err) {
          resolve({ status: res.statusCode, data, elapsed, parseError: true });
        }
      });
    });

    req.on('error', (err) => {
      const elapsed = Date.now() - startTime;
      reject({ error: err.message, elapsed });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Send heartbeat for a device
async function sendHeartbeat(deviceId, deviceState) {
  stats.heartbeats.sent++;
  
  const body = {
    playback_state: deviceState.playback_state || 'playing',
    versions: deviceState.versions,
  };

  try {
    const result = await makeRequest('PATCH', `/api/devices/${deviceId}/heartbeat`, body);
    
    stats.heartbeats.totalTime += result.elapsed;
    stats.heartbeats.minTime = Math.min(stats.heartbeats.minTime, result.elapsed);
    stats.heartbeats.maxTime = Math.max(stats.heartbeats.maxTime, result.elapsed);
    
    if (result.status === 200) {
      stats.heartbeats.success++;
      
      // Update device state with new versions if provided
      if (result.data.new_versions) {
        deviceState.versions = result.data.new_versions;
      }
      
      // Track cache performance (if we got cached response, latency should be < 5ms)
      if (result.elapsed < 5) {
        stats.scheduleFetches.cacheHits++;
      } else {
        stats.scheduleFetches.cacheMisses++;
      }
      
      return result.data;
    } else {
      stats.heartbeats.failed++;
      trackError(`Heartbeat ${result.status}`, result.data);
    }
  } catch (err) {
    stats.heartbeats.failed++;
    trackError('Heartbeat network error', err.error || err.message);
  }
}

// Fetch schedule for a device (every 10 minutes)
async function fetchSchedule(deviceId) {
  stats.scheduleFetches.sent++;
  
  try {
    const result = await makeRequest('GET', `/api/devices/${deviceId}/schedules/all`);
    
    stats.scheduleFetches.totalTime += result.elapsed;
    stats.scheduleFetches.minTime = Math.min(stats.scheduleFetches.minTime, result.elapsed);
    stats.scheduleFetches.maxTime = Math.max(stats.scheduleFetches.maxTime, result.elapsed);
    
    if (result.status === 200) {
      stats.scheduleFetches.success++;
      return result.data;
    } else {
      stats.scheduleFetches.failed++;
      trackError(`Schedule fetch ${result.status}`, result.data);
    }
  } catch (err) {
    stats.scheduleFetches.failed++;
    trackError('Schedule fetch network error', err.error || err.message);
  }
}

// Track errors
function trackError(type, message) {
  const key = `${type}: ${message}`;
  stats.errors[key] = (stats.errors[key] || 0) + 1;
}

// Print statistics
function printStats() {
  const elapsed = Date.now() - stats.startTime;
  const elapsedSec = Math.floor(elapsed / 1000);
  const heartbeatsPerSec = (stats.heartbeats.sent / (elapsed / 1000)).toFixed(2);
  
  console.log('\n========================================');
  console.log(`Load Test Statistics (${elapsedSec}s elapsed)`);
  console.log('========================================');
  
  // Heartbeats
  const hbSuccessRate = stats.heartbeats.sent > 0 
    ? ((stats.heartbeats.success / stats.heartbeats.sent) * 100).toFixed(2) 
    : 0;
  const hbAvgTime = stats.heartbeats.success > 0 
    ? (stats.heartbeats.totalTime / stats.heartbeats.success).toFixed(2) 
    : 0;
  
  console.log('\nHeartbeats:');
  console.log(`  Sent: ${stats.heartbeats.sent}`);
  console.log(`  Success: ${stats.heartbeats.success} (${hbSuccessRate}%)`);
  console.log(`  Failed: ${stats.heartbeats.failed}`);
  console.log(`  Rate: ${heartbeatsPerSec} req/s`);
  console.log(`  Latency: min=${stats.heartbeats.minTime}ms, avg=${hbAvgTime}ms, max=${stats.heartbeats.maxTime}ms`);
  
  // Cache Performance (estimated from heartbeat latency)
  const totalHeartbeats = stats.heartbeats.success;
  const cacheHits = stats.scheduleFetches.cacheHits;
  const cacheMisses = stats.scheduleFetches.cacheMisses;
  const cacheTotal = cacheHits + cacheMisses;
  const cacheHitRate = cacheTotal > 0 ? ((cacheHits / cacheTotal) * 100).toFixed(2) : 0;
  
  console.log('\nCache Performance (estimated):');
  console.log(`  Cache Hits: ${cacheHits}`);
  console.log(`  Cache Misses: ${cacheMisses}`);
  console.log(`  Hit Rate: ${cacheHitRate}%`);
  
  // Schedule Fetches
  if (stats.scheduleFetches.sent > 0) {
    const sfSuccessRate = ((stats.scheduleFetches.success / stats.scheduleFetches.sent) * 100).toFixed(2);
    const sfAvgTime = stats.scheduleFetches.success > 0 
      ? (stats.scheduleFetches.totalTime / stats.scheduleFetches.success).toFixed(2) 
      : 0;
    
    console.log('\nSchedule Fetches:');
    console.log(`  Sent: ${stats.scheduleFetches.sent}`);
    console.log(`  Success: ${stats.scheduleFetches.success} (${sfSuccessRate}%)`);
    console.log(`  Failed: ${stats.scheduleFetches.failed}`);
    console.log(`  Latency: min=${stats.scheduleFetches.minTime}ms, avg=${sfAvgTime}ms, max=${stats.scheduleFetches.maxTime}ms`);
  }
  
  // Errors
  if (Object.keys(stats.errors).length > 0) {
    console.log('\nErrors (top 5):');
    const sortedErrors = Object.entries(stats.errors)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    sortedErrors.forEach(([err, count]) => {
      console.log(`  [${count}x] ${err}`);
    });
  }
  
  console.log('\n========================================\n');
}

// Simulate one device
function simulateDevice(deviceNum) {
  // Calculate device ID (LT Device 1 = ID 21, etc.)
  let deviceId = 20 + deviceNum;
  if (deviceNum >= 116) {
    deviceId++; // Skip ID 136 (deleted device 116)
  }
  
  // Initialize device state
  const deviceState = {
    id: deviceId,
    num: deviceNum,
    versions: {
      schedule: 0,
      playlist: 0,
      all_schedules: 0,
    },
    playback_state: 'playing',
  };
  
  stats.deviceStates[deviceId] = deviceState;
  
  // Send heartbeat every 10 seconds
  const heartbeatTimer = setInterval(() => {
    sendHeartbeat(deviceId, deviceState);
  }, HEARTBEAT_INTERVAL);
  
  // Fetch schedules every 10 minutes (with random offset to stagger)
  const scheduleOffset = Math.random() * 60000; // Random 0-60s offset
  setTimeout(() => {
    fetchSchedule(deviceId); // Initial fetch
    
    const scheduleTimer = setInterval(() => {
      fetchSchedule(deviceId);
    }, SCHEDULE_FETCH_INTERVAL);
    
    // Store timers for cleanup
    deviceState.scheduleTimer = scheduleTimer;
  }, scheduleOffset);
  
  // Store timer for cleanup
  deviceState.heartbeatTimer = heartbeatTimer;
  
  // Send initial heartbeat immediately
  sendHeartbeat(deviceId, deviceState);
}

// Fetch device information from API
async function fetchDevices() {
  console.log('Fetching device information from API...');
  
  try {
    const result = await makeRequest('GET', '/api/devices');
    
    if (result.status === 200 && Array.isArray(result.data)) {
      result.data.forEach(device => {
        if (device.name && device.name.startsWith('LT Device')) {
          deviceUUIDs.set(device.id, device.uuid);
        }
      });
      
      console.log(`Loaded ${deviceUUIDs.size} test devices\n`);
      return true;
    } else {
      console.error('Failed to fetch devices:', result.status, result.data);
      return false;
    }
  } catch (err) {
    console.error('Error fetching devices:', err);
    return false;
  }
}

// Main function
async function main() {
  console.log('='.repeat(50));
  console.log('GeekDS Load Test');
  console.log('='.repeat(50));
  console.log(`API URL: ${API_URL}`);
  console.log(`Devices: ${DEVICE_START}-${DEVICE_END} (excluding ${EXCLUDED_DEVICES.join(', ')})`);
  console.log(`Heartbeat interval: ${HEARTBEAT_INTERVAL / 1000}s`);
  console.log(`Schedule fetch interval: ${SCHEDULE_FETCH_INTERVAL / 1000 / 60} minutes`);
  console.log(`Test duration: ${TEST_DURATION ? (TEST_DURATION / 1000 / 60) + ' minutes' : 'infinite'}`);
  console.log('='.repeat(50));
  console.log('');
  
  // Fetch device data
  const devicesLoaded = await fetchDevices();
  if (!devicesLoaded || deviceUUIDs.size === 0) {
    console.error('Failed to load devices. Exiting.');
    process.exit(1);
  }
  
  // Start all devices with staggered timing
  console.log('Starting device simulations...\n');
  
  let deviceCount = 0;
  for (let i = DEVICE_START; i <= DEVICE_END; i++) {
    if (EXCLUDED_DEVICES.includes(i)) continue;
    
    setTimeout(() => {
      simulateDevice(i);
    }, deviceCount * STAGGER_DELAY);
    
    deviceCount++;
  }
  
  console.log(`Started ${deviceCount} device simulations\n`);
  
  // Print stats every 30 seconds
  const statsInterval = setInterval(printStats, 30000);
  
  // Handle graceful shutdown
  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) {
      console.log('\nForce exiting...');
      process.exit(1);
    }
    
    shuttingDown = true;
    console.log('\nGracefully stopping...');
    clearInterval(statsInterval);
    
    // Stop all device simulations
    Object.values(stats.deviceStates).forEach(device => {
      if (device.heartbeatTimer) clearInterval(device.heartbeatTimer);
      if (device.scheduleTimer) clearInterval(device.scheduleTimer);
    });
    
    // Print final stats
    console.log('\nFinal Statistics:');
    printStats();
    
    console.log('Load test stopped.');
    process.exit(0);
  }
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  // Stop after test duration (if set)
  if (TEST_DURATION > 0) {
    setTimeout(() => {
      console.log('\nTest duration reached.');
      shutdown();
    }, TEST_DURATION);
  } else {
    console.log('Test running indefinitely. Press Ctrl+C to stop.\n');
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
