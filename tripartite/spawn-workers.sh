#!/bin/bash
# Spawn multiple Frankenstein and Igor instances for parallel testing
# Usage: ./spawn-workers.sh [num_franks] [num_igors]
#
# Each instance gets:
# - Unique component ID (frankenstein-2, igor-2, etc.)
# - Unique HTTP port (auto-finds if requested port is busy)
# - Unique PID file
# - Unique log file

NUM_FRANKS=${1:-1}
NUM_IGORS=${2:-1}
BASE_FRANK_PORT=7003
BASE_IGOR_PORT=7002

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUN_PATH="${BUN_PATH:-$HOME/.bun/bin/bun}"

# Check if a port is available
check_port() {
    local port=$1
    if lsof -i :$port >/dev/null 2>&1; then
        return 1  # Port in use
    fi
    return 0  # Port available
}

# Find next available port
find_port() {
    local start_port=$1
    local port=$start_port
    while ! check_port $port; do
        echo "  Port $port in use, trying $((port + 1))..." >&2
        port=$((port + 1))
        if [ $port -gt $((start_port + 20)) ]; then
            echo "ERROR: No available port found in range $start_port-$port" >&2
            return 1
        fi
    done
    echo $port
}

echo "=== Spawning $NUM_FRANKS Franks and $NUM_IGORS Igors ==="
echo ""

# Spawn Frankensteins
for i in $(seq 1 $NUM_FRANKS); do
    if [ $i -eq 1 ]; then
        INSTANCE_ID=""
        REQUESTED_PORT=$BASE_FRANK_PORT
        LOG_FILE="/tmp/frank-main.log"
    else
        INSTANCE_ID="$i"
        REQUESTED_PORT=$((BASE_FRANK_PORT + i - 1))
        LOG_FILE="/tmp/frank-$i.log"
    fi

    echo "Starting Frankenstein ${INSTANCE_ID:-main}..."

    # Find available port
    PORT=$(find_port $REQUESTED_PORT)
    if [ $? -ne 0 ]; then
        echo "  FAILED: Could not find available port"
        continue
    fi

    cd "$SCRIPT_DIR/frankenstein"
    FRANK_INSTANCE_ID="$INSTANCE_ID" FRANKENSTEIN_PORT=$PORT \
        nohup "$BUN_PATH" run index.ts > "$LOG_FILE" 2>&1 &

    PID=$!
    echo "  PID: $PID"
    echo "  Port: $PORT"
    echo "  Component: frankenstein${INSTANCE_ID:+-$INSTANCE_ID}"
    echo "  Log: $LOG_FILE"
    echo ""
done

# Spawn Igors
for i in $(seq 1 $NUM_IGORS); do
    if [ $i -eq 1 ]; then
        INSTANCE_ID=""
        IGOR_ID_VAR="igor"
        REQUESTED_PORT=$BASE_IGOR_PORT
        LOG_FILE="/tmp/igor-main.log"
    else
        INSTANCE_ID="$i"
        IGOR_ID_VAR="igor-$i"
        REQUESTED_PORT=$((BASE_IGOR_PORT + (i - 1) * 10))
        LOG_FILE="/tmp/igor-$i.log"
    fi

    echo "Starting Igor ${INSTANCE_ID:-main}..."

    # Find available port
    PORT=$(find_port $REQUESTED_PORT)
    if [ $? -ne 0 ]; then
        echo "  FAILED: Could not find available port"
        continue
    fi

    cd "$SCRIPT_DIR/igor"
    IGOR_ID="$IGOR_ID_VAR" IGOR_PORT=$PORT \
        nohup "$BUN_PATH" run index.ts > "$LOG_FILE" 2>&1 &

    PID=$!
    echo "  PID: $PID"
    echo "  Port: $PORT"
    echo "  Component: $IGOR_ID_VAR"
    echo "  Log: $LOG_FILE"
    echo ""
done

echo "=== Waiting for startup ==="
sleep 4

echo ""
echo "=== Health Check ==="

# Check Franks
for i in $(seq 1 $NUM_FRANKS); do
    if [ $i -eq 1 ]; then
        PORT=$BASE_FRANK_PORT
        NAME="frankenstein"
    else
        PORT=$((BASE_FRANK_PORT + i - 1))
        NAME="frankenstein-$i"
    fi

    # Try a few ports in case it auto-assigned
    for try_port in $(seq $PORT $((PORT + 5))); do
        HEALTH=$(curl -s "http://localhost:$try_port/health" 2>/dev/null)
        if [ -n "$HEALTH" ]; then
            VERSION=$(echo "$HEALTH" | jq -r '.version' 2>/dev/null)
            BRIDGE=$(echo "$HEALTH" | jq -r '.bridgeConnected' 2>/dev/null)
            echo "$NAME (port $try_port): version=$VERSION bridge=$BRIDGE"
            break
        fi
    done
done

# Check Igors
for i in $(seq 1 $NUM_IGORS); do
    if [ $i -eq 1 ]; then
        PORT=$BASE_IGOR_PORT
        NAME="igor"
    else
        PORT=$((BASE_IGOR_PORT + (i - 1) * 10))
        NAME="igor-$i"
    fi

    for try_port in $(seq $PORT $((PORT + 5))); do
        HEALTH=$(curl -s "http://localhost:$try_port/health" 2>/dev/null)
        if [ -n "$HEALTH" ]; then
            VERSION=$(echo "$HEALTH" | jq -r '.version' 2>/dev/null)
            BRIDGE=$(echo "$HEALTH" | jq -r '.bridgeConnected' 2>/dev/null)
            echo "$NAME (port $try_port): version=$VERSION bridge=$BRIDGE"
            break
        fi
    done
done

echo ""
echo "=== Done ==="
