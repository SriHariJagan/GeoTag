# GeoTech backend — FastAPI + uvicorn (production).
#
# Build from the REPOSITORY ROOT so ml_data/ is available:
#   docker build -f geotech_backend/Dockerfile .
# (docker-compose.yml already does this.)
#
# Runtime layout inside the image:
#   /app/app/...          backend package (WORKDIR /app)
#   /ml_data/models/...   ML model files (analytics service resolves them
#                         relative to the repo root -> /ml_data in Docker)
#   /data/geotech.db      SQLite database (persistent named volume)
#   /app/storage/...      uploaded logos + signed work-order documents (volume)
#   /app/generated_pdfs/  generated work-order PDFs (volume)

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # Safe default; docker-compose overrides this with the .env value
    # pointing at the persistent volume.
    DATABASE_URL="sqlite:////data/geotech.db"

WORKDIR /app

# curl is used by the compose healthcheck (and for on-server debugging).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better layer caching).
COPY geotech_backend/requirements.txt /tmp/requirements.txt
RUN pip install --upgrade pip \
    && pip install -r /tmp/requirements.txt

# Application code.
COPY geotech_backend/app /app/app

# ML data: templates/scripts + (optionally) trained models.
# The analytics service looks for <repo-root>/ml_data/models/*.pkl, which
# resolves to /ml_data/models here. If the volume is empty the service falls
# back to explainable scoring logic, so a missing model never breaks the API.
COPY ml_data /ml_data
RUN ln -sfn /ml_data /app/ml_data \
    && mkdir -p /data /app/storage/company /app/storage/work_order_docs \
                 /app/generated_pdfs /ml_data/models

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
    CMD curl -f http://localhost:8000/ || exit 1

# Bind to 0.0.0.0 so the container is reachable from the Docker network.
# Tables + default superadmin are created on startup (app/main.py).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
