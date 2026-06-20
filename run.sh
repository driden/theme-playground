#!/usr/bin/env bash
set -euo pipefail

PIDS=()

cleanup() {
    echo "Shutting down..."

    # Send SIGTERM to each process group (catches child processes too)
    for pid in "${PIDS[@]}"; do
        kill -TERM "-$pid" 2>/dev/null
    done

    sleep 1

    # Force kill anything still alive
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "Force killing PID $pid"
            kill -KILL "-$pid" 2>/dev/null
        fi
    done

    echo "Done."
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
