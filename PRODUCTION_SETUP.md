# GeekDS Enhanced Production Setup

This setup includes Redis caching, Nginx optimization, and basic monitoring for production deployment supporting 300+ devices.

## Quick Start

```bash
# Install dependencies and start enhanced stack
docker-compose down
docker-compose up --build
```

## Services Overview

### Core Services
- **Backend**: Node.js API with Redis caching (internal access only)
- **Frontend**: React dashboard (http://localhost:3000)
- **Database**: PostgreSQL with optimized connection pool
- **Nginx**: Reverse proxy and media server (http://localhost:5000)

### Performance Services
- **Redis**: Caching layer for API responses (Port 6379)
- **Prometheus**: Metrics collection (http://localhost:9090)
- **Grafana**: Monitoring dashboard (http://localhost:3001)
  - Username: admin
  - Password: admin123

## Architecture Changes

### 1. Redis Caching
- Device lists cached for 1 minute
- Individual devices cached for 1 minute  
- Playlists/schedules cached for 5 minutes
- Media list cached for 10 minutes
- Screenshots cached for 30 seconds
- Automatic cache invalidation on updates

### 2. Nginx Optimizations
- Static media file serving with 7-day cache
- Gzip compression for API responses
- Connection reuse and pooling
- Large file upload support (100MB)
- Optimized timeouts for 300-device load

### 3. Basic Monitoring
- HTTP request metrics
- Redis performance monitoring
- Database connection tracking
- Response time measurements

## Performance Targets
- **Sustained Load**: 22 RPS (300 devices, 14-second intervals)
- **Peak Load**: 60 RPS (burst scenarios)
- **Cache Hit Rate**: >80% for device/playlist data
- **Media Serving**: Direct Nginx (no backend overhead)

## Android App Compatibility
- **No code changes required** - all optimizations are server-side
- Screenshot uploads work through Nginx proxy
- API endpoints remain the same
- Media URLs unchanged (Nginx handles internally)

## Configuration Files

### docker-compose.yml
Enhanced with Redis, Nginx, monitoring services, health checks, and resource limits.

### nginx.conf  
Optimized for media serving, API proxying, and caching headers.

### prometheus.yml
Basic metrics collection for all services.

## Production Checklist
- [x] Redis caching implemented
- [x] Nginx reverse proxy configured  
- [x] Basic monitoring setup
- [x] Health checks enabled
- [x] Resource limits defined
- [ ] SSL/TLS certificates (add for production)
- [ ] Log aggregation (add ELK stack if needed)
- [ ] Backup strategy for PostgreSQL
- [ ] Redis persistence tuning

## Load Testing
Use the optimized polling intervals:
- Status updates: every 14 seconds
- Screenshot requests: every 28 seconds  
- Command polling: every 21 seconds

This reduces load from 60 RPS to 22 RPS sustainable load.

## Troubleshooting
- Check service health: `docker-compose ps`
- View logs: `docker-compose logs [service_name]`
- Redis status: `docker-compose exec redis redis-cli ping`
- Database status: `docker-compose exec db pg_isready -U postgres -d cms`
