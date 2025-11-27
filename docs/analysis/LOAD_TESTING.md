# Load Testing Guide

## 🧪 Realistic Load Test

This load test simulates **199 real devices** (LT Device 1-200, excluding 116) in production-like conditions.

### Test Configuration

- **Devices:** 199 devices
- **Heartbeat Interval:** 10 seconds per device
- **Schedule Fetch:** Every 10 minutes per device (staggered)
- **Expected Load:** ~20 heartbeats/second + periodic schedule fetches
- **Test Duration:** 1 hour (configurable)

### Expected Database Operations

**Without Optimizations (hypothetical):**
- 199 devices × 6 heartbeats/min = **1,194 heartbeats/min**
- 1,194 × 4 DB queries each = **4,776 DB ops/min**

**With Optimizations (Redis cache + batch updates):**
- 199 heartbeats/min → **~40 DB ops/min** (99% cache hit)
- Schedule fetches: 199 / 10 = **~20 fetches/min**
- **Total: ~60 DB ops/min** (99% reduction!)

---

## 🚀 Running the Load Test

### Prerequisites

1. **Ensure backend is running:**
   ```bash
   docker ps | grep geekds-backend
   # Should show: Up X minutes (healthy)
   ```

2. **Verify test data exists:**
   ```bash
   docker exec geekds-db-1 psql -U postgres -d cms -c \
     "SELECT COUNT(*) FROM devices WHERE name LIKE 'LT Device%';"
   # Should show: 199
   ```

3. **Install Node.js** (if running test locally):
   ```bash
   node --version  # Should be v14+ or v18+
   ```

---

### Step 1: Start System Monitoring

In **Terminal 1**, start the system monitor:

```bash
cd /home/masha/projects/GeekDS
chmod +x monitor.sh
./monitor.sh monitor 10
```

This will show:
- Docker container CPU/Memory usage
- PostgreSQL connection pool stats
- Redis memory and cache hit rate
- Backend error logs

**Leave this running during the test!**

---

### Step 2: Start Load Test

In **Terminal 2**, start the load test:

```bash
cd /home/masha/projects/GeekDS
node load-test.js
```

**Expected Output:**
```
🚀 GeekDS Realistic Load Test Starting...

Configuration:
  API URL:                http://localhost:5000
  Devices:                199
  Excluded:               116
  Heartbeat Interval:     10s
  Schedule Fetch:         600s
  Stagger Delay:          50ms
  Test Duration:          3600s

Starting devices (staggered start)...

Started 20/199 devices...
Started 40/199 devices...
...
✅ All 199 devices started!

================================================================================
📊 Load Test Statistics (Runtime: 30s)
================================================================================

💓 Heartbeats:
  Sent:     597
  Success:  597 (100.0%)
  Failed:   0
  Avg Time: 5.2ms
  Min Time: 2ms
  Max Time: 45ms
  Rate:     19.9 req/s

📅 Schedule Fetches:
  Sent:        199
  Success:     199 (100.0%)
  Failed:      0
  Cache Hits:  195
  Cache Miss:  4
  Avg Time:    3.1ms
  Min Time:    1ms
  Max Time:    28ms
  Cache Rate:  98.0%

⚡ Load:
  Active Devices:    199
  Total Requests:    796
  Requests/Second:   26.5
  Expected Rate:     19.9 heartbeats/s + periodic schedules
...
```

---

### Step 3: Watch for Issues

**Monitor Terminal 1** for:

✅ **Good Signs:**
- CPU < 30%
- Memory stable (not growing)
- PostgreSQL connections < 15
- Redis cache hit rate > 95%
- No errors in backend logs

🚨 **Warning Signs:**
- CPU > 50% sustained
- Memory growing continuously
- PostgreSQL connections > 20
- Redis cache hit rate < 90%
- Errors appearing in logs
- Slow query warnings

---

## 📊 Understanding the Results

### Heartbeat Stats

```
💓 Heartbeats:
  Sent:     11,940       # 199 devices × 6 heartbeats/min × 10 min
  Success:  11,935       # Should be ~100%
  Failed:   5            # Should be < 1%
  Avg Time: 4.8ms        # Should be < 10ms
  Rate:     19.9 req/s   # Expected: 199/10 ≈ 20 req/s
```

**What to look for:**
- ✅ Success rate > 99%
- ✅ Average time < 10ms (with optimizations)
- ✅ Rate matches expected (~20 req/s)

---

### Schedule Fetch Stats

```
📅 Schedule Fetches:
  Success:     199       # All devices fetched once
  Cache Hits:  195       # ~98% should be cached
  Cache Miss:  4         # First fetch or invalidation
  Avg Time:    3.2ms     # Should be < 5ms with cache
  Cache Rate:  98.0%     # Should be > 95%
```

**What to look for:**
- ✅ Cache hit rate > 95%
- ✅ Cached fetches < 5ms
- ✅ DB fetches < 30ms

---

### System Resources

**PostgreSQL:**
```
📊 PostgreSQL Stats:
 connections | active | idle | waiting 
-------------+--------+------+---------
          12 |      2 |   10 |       0
```

**What to look for:**
- ✅ Total connections < 20 (with optimizations)
- ✅ Waiting = 0 (no connection queue)
- ✅ Active typically 1-3 (low due to batching)

**Redis:**
```
📦 Redis Stats:
used_memory_human:55.12M
cache_hit_rate: 98.50%
```

**What to look for:**
- ✅ Memory < 100MB for 199 devices
- ✅ Cache hit rate > 95%
- ✅ Memory not growing

---

## 🎯 Performance Targets

### Baseline (Without Optimizations)
| Metric | Target |
|--------|--------|
| Heartbeat Avg Time | < 50ms |
| DB Operations/min | ~5,000 |
| PostgreSQL Connections | 50-100 |
| Success Rate | > 95% |

### Optimized (With Redis Cache + Batching)
| Metric | Target |
|--------|--------|
| Heartbeat Avg Time | **< 10ms** |
| DB Operations/min | **< 100** |
| PostgreSQL Connections | **< 20** |
| Success Rate | **> 99%** |
| Cache Hit Rate | **> 95%** |

---

## 🐛 Troubleshooting

### Issue: High Latency (>50ms)

**Symptoms:**
- Heartbeat avg time > 50ms
- Slow queries in PostgreSQL

**Solutions:**
1. Check PostgreSQL connection pool:
   ```bash
   ./monitor.sh pg
   ```
2. Check for slow queries
3. Verify Redis is running
4. Check CPU usage

---

### Issue: Low Cache Hit Rate (<90%)

**Symptoms:**
- Cache hit rate < 90%
- Schedule fetch time > 20ms avg

**Solutions:**
1. Check Redis memory:
   ```bash
   ./monitor.sh redis
   ```
2. Verify cache TTL is 30s
3. Check if schedules are changing frequently
4. Look for cache invalidation errors

---

### Issue: Connection Pool Exhaustion

**Symptoms:**
- Waiting connections > 5
- Errors: "Connection pool exhausted"
- Requests timing out

**Solutions:**
1. Check pool configuration in `models.ts`
2. Verify max connections = 20
3. Check for connection leaks
4. Monitor active connections

---

### Issue: Memory Growth

**Symptoms:**
- Backend memory growing over time
- Eventually OOM or restart

**Solutions:**
1. Check for memory leaks in in-memory maps
2. Verify LRU cache is configured
3. Monitor Redis memory
4. Check for uncleared intervals/timers

---

## 📈 Stress Testing Variations

### Test 1: Short Burst (5 minutes)
```bash
# Edit load-test.js: TEST_DURATION = 300000 (5 min)
node load-test.js
```
**Use Case:** Quick smoke test

---

### Test 2: Long Soak (4 hours)
```bash
# Edit load-test.js: TEST_DURATION = 14400000 (4 hours)
node load-test.js
```
**Use Case:** Memory leak detection

---

### Test 3: Aggressive (5 second heartbeat)
```bash
# Edit load-test.js: HEARTBEAT_INTERVAL = 5000
node load-test.js
```
**Use Case:** Maximum load testing (40 req/s)

---

### Test 4: Schedule Churn
Manually edit schedules during the test to trigger cache invalidations:

```bash
# In another terminal
docker exec geekds-db-1 psql -U postgres -d cms -c \
  "UPDATE schedules SET time_slot_start = '12:00' WHERE name LIKE 'LT Schedule%';"
```

**Expected:** Devices should detect change within 10s

---

## 🧹 Cleanup

### Stop Load Test
```bash
# In load test terminal (Terminal 2)
Ctrl+C
```

### Stop Monitoring
```bash
# In monitor terminal (Terminal 1)
Ctrl+C
```

### Check Final Stats
```bash
./monitor.sh once
```

---

## 📝 Reporting Results

After the test, document:

1. **Performance Metrics:**
   - Average heartbeat time
   - Cache hit rate
   - Success rate
   - DB operations/min

2. **System Resources:**
   - Peak CPU usage
   - Peak memory usage
   - Max PostgreSQL connections
   - Redis memory usage

3. **Issues Found:**
   - Any errors
   - Performance bottlenecks
   - Resource exhaustion
   - Unexpected behavior

4. **Improvements Needed:**
   - Configuration changes
   - Code optimizations
   - Infrastructure scaling

---

## 🎓 What Good Results Look Like

```
✅ Test Duration: 60 minutes
✅ Total Devices: 199
✅ Total Heartbeats: 71,640 (199 × 360)
✅ Success Rate: 99.8%
✅ Avg Heartbeat Time: 4.2ms
✅ Cache Hit Rate: 98.5%
✅ DB Operations: 3,600 total (60/min avg)
✅ Peak CPU: 18%
✅ Peak Memory: 450MB backend
✅ Peak Connections: 12
✅ Errors: 0
✅ Memory Leaks: None detected
```

**Conclusion:** System is production-ready! ✨

---

## 🚀 Next Steps

After successful load testing:

1. ✅ Deploy optimizations to production
2. ✅ Set up monitoring/alerting
3. ✅ Document baseline performance
4. ✅ Plan for scaling (500+ devices)
5. ✅ Schedule periodic load tests

---

**Good luck with your load testing!** 🎉
