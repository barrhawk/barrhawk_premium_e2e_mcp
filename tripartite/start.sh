#!/bin/bash
# Tripartite Stack Startup Script
# Starts Bridge, Doctor, Igor, and Frankenstein

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BUN="${BUN:-/home/raptor/.bun/bin/bun}"
LOG_DIR="${LOG_DIR:-/tmp}"

# Kill existing processes
echo "Stopping existing tripartite processes..."
pkill -f "bun run bridge/index.ts" 2>/dev/null || true
pkill -f "bun run doctor/index.ts" 2>/dev/null || true
pkill -f "bun run igor/index.ts" 2>/dev/null || true
pkill -f "bun run frankenstein/index.ts" 2>/dev/null || true
sleep 2

# Environment variables for stability
export MEMORY_CRITICAL_THRESHOLD=0.99  # Bun's heap usage can spike
export MEMORY_PRESSURE_THRESHOLD=0.95

echo "Starting Bridge on port 7000..."
$BUN run bridge/index.ts > "$LOG_DIR/bridge.log" 2>&1 &
BRIDGE_PID=$!
sleep 2

echo "Starting Igor on port 7002..."
$BUN run igor/index.ts > "$LOG_DIR/igor.log" 2>&1 &
IGOR_PID=$!
sleep 1

echo "Starting Frankenstein on port 7003..."
$BUN run frankenstein/index.ts > "$LOG_DIR/frank.log" 2>&1 &
FRANK_PID=$!
sleep 1

echo "Starting Doctor on port 7001..."
$BUN run doctor/index.ts > "$LOG_DIR/doctor.log" 2>&1 &
DOCTOR_PID=$!
sleep 2

# Optional: Start Dashboard-Min
DASHBOARD_PID=""
if [[ "$1" == "--with-dashboard" || "$1" == "-d" ]]; then
  echo "Starting Dashboard-Min on port 3333..."
  $BUN run ../packages/dashboard-min/server.ts > "$LOG_DIR/dashboard.log" 2>&1 &
  DASHBOARD_PID=$!
  sleep 1
fi

# Check health
echo ""
echo "Checking component health..."
echo "================================"

BRIDGE_HEALTH=$(curl -s http://localhost:7000/health 2>/dev/null | jq -r '.status // "error"')
DOCTOR_HEALTH=$(curl -s http://localhost:7001/health 2>/dev/null | jq -r '.status // "error"')
IGOR_HEALTH=$(curl -s http://localhost:7002/health 2>/dev/null | jq -r '.status // "error"')
FRANK_HEALTH=$(curl -s http://localhost:7003/health 2>/dev/null | jq -r '.status // "error"')

echo "Bridge (7000):      $BRIDGE_HEALTH (PID: $BRIDGE_PID)"
echo "Doctor (7001):      $DOCTOR_HEALTH (PID: $DOCTOR_PID)"
echo "Igor (7002):        $IGOR_HEALTH (PID: $IGOR_PID)"
echo "Frankenstein (7003): $FRANK_HEALTH (PID: $FRANK_PID)"
if [[ -n "$DASHBOARD_PID" ]]; then
  DASH_HEALTH=$(curl -s http://localhost:3333/health 2>/dev/null | jq -r '.status // "error"')
  echo "Dashboard (3333):   $DASH_HEALTH (PID: $DASHBOARD_PID)"
fi
echo ""

# Check all components connected to Bridge
CONNECTED=$(curl -s http://localhost:7000/health 2>/dev/null | jq -r '.connectedComponents | to_entries | map(select(.value == true) | .key) | join(", ")')
echo "Connected to Bridge: $CONNECTED"
echo ""

echo "Logs at:"
echo "  $LOG_DIR/bridge.log"
echo "  $LOG_DIR/doctor.log"
echo "  $LOG_DIR/igor.log"
echo "  $LOG_DIR/frank.log"
if [[ -n "$DASHBOARD_PID" ]]; then
  echo "  $LOG_DIR/dashboard.log"
fi
echo ""
echo "To stop: pkill -f 'bun run (bridge|doctor|igor|frankenstein)'"
echo ""
echo "Tripartite stack started!"
if [[ -n "$DASHBOARD_PID" ]]; then
  echo ""
  echo "Dashboard available at: http://localhost:3333"
else
  echo ""
  echo "Tip: Run with --with-dashboard or -d to start the observability dashboard"
fi
