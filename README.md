# E-Commerce Microservices

A robust, horizontally scalable E-Commerce microservices architecture built with Fastify, TypeScript, and MongoDB.

## Services
- **Gateway**: `http://localhost:3000` (API Gateway & Rate Limiter)
- **User Service**: `http://localhost:3001`
- **Product Service**: `http://localhost:3002`
- **Order Service**: `http://localhost:3003`
- **Inventory Service**: `http://localhost:3004`

---

## 🚀 How to Run the System

1. **Start Infrastructure (Databases, Kafka, Redis)**
   ```bash
   docker-compose up -d
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   ```

3. **Start the Microservices (Development Mode)**
   ```bash
   pnpm run dev
   ```

---

## 📈 Performance & Load Testing Guide

This project includes a fully isolated, production-grade load testing and observability suite using **k6**, **Prometheus**, and **Grafana**. 

You do **not** need to install `k6` locally; the execution scripts automatically run it via ephemeral Docker containers!

### 1. Boot up the Observability Stack
In a new terminal window, start the performance monitoring stack (this runs in the background):
```bash
./performance/scripts/start.sh
```
*This starts Prometheus, Grafana, cAdvisor, and the MongoDB Exporter.*

### 2. View Live Metrics in Grafana
- Open [http://localhost:3005](http://localhost:3005) in your browser.
- **Login**: `admin` / **Password**: `admin` (skip password reset if prompted).
- Click on **Dashboards -> Performance Dashboard**. 
- You will see live panels for RPS, p95 Latency, Node.js Memory, and CPU usage.

### 3. Generate Test Data (Optional)
To run a realistic test, the database needs data. You can seed `10,000` products instantly by running:
```bash
pnpm dlx tsx performance/scripts/seed.ts
```
*(Run this from within the `services/product-service` directory if dependencies are unlinked).*

### 4. Execute a Load Test
Keep your Grafana dashboard open, and run one of the following tests. The load test traffic will be captured and graphed in real-time.

**Run Smoke Test (Sanity Check)**
*Runs 10 Virtual Users (VUs) for 30 seconds to verify environment health.*
```bash
./performance/scripts/run-smoke.sh
```

**Run Baseline Test**
*Runs 50 VUs for 2 minutes to establish a baseline performance metric.*
```bash
./performance/scripts/run-baseline.sh
```

**Run Stress / Load Test**
*Slowly ramps up from 50 to 1,000 Requests Per Second (RPS) to mathematically pinpoint when your SLAs (e.g., p95 < 800ms) break.*
```bash
./performance/scripts/run-load.sh
```

> **Note on Rate Limiting**: The API Gateway is currently configured to rate-limit at `100 requests per minute`. If you run the Baseline or Load test, you will quickly hit `HTTP 429 Too Many Requests`. To test absolute absolute capacity, temporarily increase the `max` value in `gateway/src/server.ts` before running the load tests!
