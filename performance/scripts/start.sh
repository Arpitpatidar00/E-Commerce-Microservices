#!/bin/bash
set -e

echo "Starting Performance Environment..."
docker-compose -f performance/docker-compose.performance.yml up -d

echo "Infrastructure is up at:"
echo "Prometheus: http://localhost:9090"
echo "Grafana: http://localhost:3005"
