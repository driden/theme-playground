#!/usr/bin/env bash
set -euo pipefail

PIDS=()

kill_tree() {
    local pid="$1"
    local sig="$2"
    local children
    children=$(pgrep -P "$pid" 2>/dev/null || true)
    for child in $children; do
        kill_tree "$child" "$sig"
    done
    kill "-$sig" "$pid" 2>/dev/null || true
}

cleanup() {
    echo "Shutting down..."

    # Send SIGTERM to each process group (catches child processes too)
    for pid in "${PIDS[@]}"; do
        kill_tree "$pid" TERM
    done

    sleep 1

    for pid in "${PIDS[@]}"; do
        children=$(pgrep -P "$pid" 2>/dev/null || true)
        if kill -0 "$pid" 2>/dev/null || [ -n "$children" ]; then
            echo "Force killing remnants of PID $pid"
            kill_tree "$pid" KILL
        fi
    done

    exit 0
}

trap cleanup SIGINT SIGTERM

echo "Starting server..."
bun run --filter @playground/server dev &
PIDS+=($!)

echo "Starting ui..."
bun run --filter @playground/ui dev &
PIDS+=($!)

echo "PIDs: ${PIDS[*]}"

# Wait for either process to exit; if one dies unexpectedly, clean up the rest.
wait -n "${PIDS[@]}"
cleanup
