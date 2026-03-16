# Stage 1: Build frontend
FROM node:24-slim AS frontend-builder
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Backend
FROM python:3.14-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir poetry==2.3.2 && \
    poetry config virtualenvs.create false
COPY backend/pyproject.toml backend/poetry.lock ./
RUN poetry install --no-root --only main
COPY backend/ .
COPY --from=frontend-builder /frontend/dist ./static
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
