# Stage 1: Build React frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --silent
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend + built frontend
FROM python:3.12-slim
WORKDIR /app

ENV STATIC_DIR=/app/static \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Create unprivileged runtime user and writable data directory
RUN groupadd --system app && useradd --system --gid app --create-home app \
    && mkdir -p /data /app \
    && chown -R app:app /data /app

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/app.py ./

# Copy built frontend from stage 1
COPY --from=frontend-build /app/frontend/dist ./static

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import sys, urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3); sys.exit(0)"

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
