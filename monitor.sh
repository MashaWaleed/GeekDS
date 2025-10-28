#!/bin/bash

# GeekDS System Monitor
# Monitors system resources during load testing

echo "🔍 GeekDS System Resource Monitor"
echo "=================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to get container stats
get_container_stats() {
    local container=$1
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" $container 2>/dev/null
}

# Function to get PostgreSQL stats
get_pg_stats() {
    echo "📊 PostgreSQL Stats:"
    docker exec geekds-db-1 psql -U postgres -d cms -c "
        SELECT 
            count(*) as connections,
            count(*) FILTER (WHERE state = 'active') as active,
            count(*) FILTER (WHERE state = 'idle') as idle,
            count(*) FILTER (WHERE wait_event IS NOT NULL) as waiting
        FROM pg_stat_activity 
        WHERE datname = 'cms';
    " 2>/dev/null
    
    echo ""
    echo "Recent queries (last 5):"
    docker exec geekds-db-1 psql -U postgres -d cms -c "
        SELECT 
            LEFT(query, 80) as query,
            state,
            ROUND(EXTRACT(EPOCH FROM (NOW() - query_start))::numeric, 2) as duration_sec
        FROM pg_stat_activity 
        WHERE datname = 'cms' AND query NOT LIKE '%pg_stat_activity%'
        ORDER BY query_start DESC 
        LIMIT 5;
    " 2>/dev/null
}

# Function to get Redis stats
get_redis_stats() {
    echo ""
    echo "📦 Redis Stats:"
    docker exec geekds-redis-1 redis-cli INFO memory | grep -E "used_memory_human|used_memory_peak_human|maxmemory_human" 2>/dev/null
    echo ""
    docker exec geekds-redis-1 redis-cli INFO stats | grep -E "total_commands_processed|keyspace_hits|keyspace_misses" 2>/dev/null
    
    # Calculate cache hit rate
    local hits=$(docker exec geekds-redis-1 redis-cli INFO stats | grep keyspace_hits | cut -d: -f2 | tr -d '\r')
    local misses=$(docker exec geekds-redis-1 redis-cli INFO stats | grep keyspace_misses | cut -d: -f2 | tr -d '\r')
    
    if [ ! -z "$hits" ] && [ ! -z "$misses" ] && [ $((hits + misses)) -gt 0 ]; then
        local total=$((hits + misses))
        local hit_rate=$(echo "scale=2; ($hits * 100) / $total" | bc)
        echo "cache_hit_rate: ${hit_rate}%"
    fi
    
    echo ""
    echo "Redis Keys:"
    docker exec geekds-redis-1 redis-cli DBSIZE 2>/dev/null
}

# Function to get backend logs (errors only)
get_backend_errors() {
    echo ""
    echo "⚠️  Recent Backend Errors (last 10):"
    docker logs geekds-backend-1 --tail 100 2>&1 | grep -i "error\|warn\|failed" | tail -10
}

# Function to monitor continuously
monitor_loop() {
    local interval=${1:-10}
    
    while true; do
        clear
        echo "🔍 GeekDS System Monitor - $(date '+%Y-%m-%d %H:%M:%S')"
        echo "========================================================================"
        echo ""
        
        echo "🐳 Docker Container Stats:"
        docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}" geekds-backend-1 geekds-db-1 geekds-redis-1 2>/dev/null
        echo ""
        
        get_pg_stats
        get_redis_stats
        
        # Check for backend errors
        error_count=$(docker logs geekds-backend-1 --tail 50 2>&1 | grep -i "error" | wc -l)
        if [ $error_count -gt 0 ]; then
            echo -e "${RED}⚠️  Found $error_count errors in backend logs!${NC}"
            get_backend_errors
        else
            echo -e "${GREEN}✅ No recent errors in backend logs${NC}"
        fi
        
        echo ""
        echo "========================================================================"
        echo "Press Ctrl+C to stop monitoring | Refreshing every ${interval}s"
        
        sleep $interval
    done
}

# Main
case "${1:-monitor}" in
    monitor)
        monitor_loop ${2:-10}
        ;;
    once)
        echo "🔍 One-time System Check"
        echo ""
        
        echo "🐳 Docker Container Stats:"
        docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" geekds-backend-1 geekds-db-1 geekds-redis-1
        echo ""
        
        get_pg_stats
        get_redis_stats
        get_backend_errors
        ;;
    pg)
        get_pg_stats
        ;;
    redis)
        get_redis_stats
        ;;
    errors)
        get_backend_errors
        ;;
    *)
        echo "Usage: $0 [monitor|once|pg|redis|errors] [interval]"
        echo ""
        echo "Commands:"
        echo "  monitor [interval]  - Continuous monitoring (default interval: 10s)"
        echo "  once               - One-time snapshot"
        echo "  pg                 - PostgreSQL stats only"
        echo "  redis              - Redis stats only"
        echo "  errors             - Backend errors only"
        exit 1
        ;;
esac
