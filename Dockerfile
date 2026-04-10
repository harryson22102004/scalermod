FROM python:3.11-slim

LABEL maintainer="SRE Team"
LABEL description="Linux System Reliability Engineer Training Environment"

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for runtime.
RUN useradd --create-home --uid 10001 appuser

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .
RUN chown -R appuser:appuser /app

# Expose port for API
EXPOSE 7860

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:7860/health || exit 1

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV APP_ENV=production

# Drop root privileges for runtime.
USER appuser

# Default command: run server
CMD ["python", "-m", "uvicorn", "src.server:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1", "--proxy-headers"]

# Alternative commands:
# For development: docker run -it -p 8000:8000 linux-sre-env python demo.py
# For interactive: docker run -it -p 8000:8000 linux-sre-env /bin/bash
