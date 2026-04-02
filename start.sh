#!/bin/bash
set -e

echo "=== StarlinkDash ==="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is required"
    exit 1
fi

# Check Node
if ! command -v node &> /dev/null; then
    echo "Error: node is required"
    exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"

# Install backend dependencies
echo "[1/3] Installing Python dependencies..."
cd "$DIR/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt

# Install frontend dependencies
echo "[2/3] Installing frontend dependencies..."
cd "$DIR/frontend"
if [ ! -d "node_modules" ]; then
    npm install --silent
fi

# Start both servers
echo "[3/3] Starting servers..."
echo ""
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Open http://localhost:5173 in your browser"
echo "Press Ctrl+C to stop"
echo ""

# Start backend in background
cd "$DIR/backend"
source venv/bin/activate
uvicorn app:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Start frontend
cd "$DIR/frontend"
npx vite --host &
FRONTEND_PID=$!

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

wait
