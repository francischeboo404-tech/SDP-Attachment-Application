"""
Gunicorn production server configuration for Industrial Attachment System (Render Deployed).
Optimized for horizontal scaling, high concurrency, and non-blocking I/O.
"""

import multiprocessing
import os

# Worker Concurrency: (2 * CPU cores) + 1 or explicit WEB_CONCURRENCY environment variable
default_workers = (multiprocessing.cpu_count() * 2) + 1
workers = int(os.environ.get("WEB_CONCURRENCY", default_workers))

# Worker class & threading for I/O concurrency
worker_class = "gthread"
threads = int(os.environ.get("GUNICORN_THREADS", 4))

# Timeouts & Keep-alive
timeout = int(os.environ.get("GUNICORN_TIMEOUT", 120))
keepalive = 5

# Memory management & recycling to prevent memory leaks across long worker lifespans
max_requests = 1000
max_requests_jitter = 50

# Logging
accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("LOG_LEVEL", "info")

# Bind address
bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"
