#!/bin/bash
set -e

echo "Running Baseline Test..."
docker run --rm -i \
  -e API_URL=http://host.docker.internal:3000/api \
  -v $(pwd)/performance:/performance \
  grafana/k6 run /performance/k6/baseline.js
