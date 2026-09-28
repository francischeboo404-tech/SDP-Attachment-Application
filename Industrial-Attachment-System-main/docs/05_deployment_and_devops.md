# Deployment & DevOps Blueprint

The infrastructure is tailored entirely to adhere to The Twelve-Factor App methodology. Codebases are symmetric, and environments map to strict Docker constraints natively.

## Local Environment (Docker Compose)

Simulating the environment locally ensures zero discrepancies when transitioned to cloud-native platforms like AWS, Vercel, or Render.

```bash
# Initialize Local Network
docker compose up --build -d
```

### Composition
*   **`frontend`**: Exposes `localhost:3000`. Hot-reloading dynamically overrides the container bindings.
*   **`backend`**: Binds to `localhost:8000` executing `gunicorn` locally spanning 4 workers mimicking high-availability threads.
*   **`db`**: Pulls the official Postgres Alpine image bridging data exclusively to docker volumes to ensure restart persistence.
*   **`nginx`**: The primary inverse load balancer locking external traffic directly to core gateways natively.

### Applying Migrations
Following image composition, initialization hooks map to executing standard Django pipelines natively interacting with the container namespace:

```bash
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py create_admin # Optional Seed scripts
```

---

## Production Deployment Tactics

The structure permits decoupled cloud staging deployments heavily depending on the respective domain configurations.

### 1. Frontend (Vercel)
Vercel seamlessly interfaces with Vite utilizing automatic Vercel Edge caching architectures.
*   **Command**: `npm run build`
*   **Directory**: `frontend`
*   **Routing Issues (404 on Refresh)**: Controlled via `vercel.json` overriding URL pathing forcing the `index.html` cache hierarchy.
*   **Env Variables**: `VITE_API_BASE_URL` mapped dynamically within the SaaS UI towards the actual Backend staging URL.

### 2. Backend (Render / Heroku)
Render executes natively via the `render.yaml` infrastructure-as-code schema ensuring isolated and scalable virtual servers.
*   **Execution Strategy**: The Python application parses `requirements.txt`.
*   **Start Command**: `gunicorn core.wsgi:application`
*   **Pre-Release Hooks**: `render.yaml` designates a build script simulating `python manage.py collectstatic --noinput && python manage.py migrate` right before server startup routing.
*   **Variables**: Strict binding to `DATABASE_URL` forcing PostgreSQL drivers.

### CORS Security Matrix

For decentralized operations across the web, `CORS_ALLOWED_ORIGINS` mapped natively within Django's `settings.py` whitelists specific endpoints (e.g. `https://my-app.vercel.app`), shutting out completely malformed requests lacking authorized domain tracing origins intrinsically.
