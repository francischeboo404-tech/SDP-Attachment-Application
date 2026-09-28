# Frontend Architecture Overview

The web client is built on React 19, aggressively leveraging Vite for fast Module Replacement (HMR) and optimized build bundling. The stack focuses on complete decoupling, relying entirely on Axios configurations to proxy authenticated API requests.

## Tech Stack Summary

1.  **Framework**: React (using Hooks exclusively).
2.  **Build Tool**: Vite.
3.  **State Management**: Zustand (Minimalist, unbounded by Redux boilerplate).
4.  **Styling**: Tailwind CSS v4.
5.  **Routing**: React Router v6.

## Structural Strategy (`src/`)

```
src/
├── assets/             # Static UI assets, logos, and global CSS overrides.
├── components/         # Reusable presentation atoms & UI primitives (Cards, Inputs, Modals).
├── pages/              # Stateful Parent Routes (Login, Dashboard, Vacancies, Profile).
├── services/           # Configuration files abstracting side-effects (Axios interceptors).
├── store/              # Zustand global hooks (`useAuthStore()`, `useProfileStore()`).
├── App.jsx             # High-level Router and Guard definitions.
├── main.jsx            # DOM entrypoint.
```

## State Management (Zustand)

Instead of using prop-drilling or overly-verbose context API patterns, Zustand abstracts global state:

*   **`authStore.js`**: Manages the JWT tokens, hydration states mapping to `localStorage` (or cookies), and tracks whether the current user is an `ADMIN` or an `APPLICANT`.
*   **`profileStore.js`**: Synchronizes the user’s bio, educational data, and documents so that switching between pages feels instantaneous without generating redundant API queries.

## Authentication & Axios Interceptors

Located within `services/api.js`, the Axios instance is centrally configured. 

*   **Interceptors:** Before a request fires off toward backend domains (e.g. `http://localhost:8000/api/`), the interceptor automatically reads `useAuthStore().getState().token`.
*   **Bearer Injection:** It dynamically attaches `Authorization: Bearer <token>` to the request payload.
*   **401 Handlers:** If the backend responds with a 401 Unauthorized (expired token), a fallback logic attempts a refresh utilizing the stored Refresh Token, intercepting the failure gracefully and silently re-firing the core request.

## Styling (Tailwind CSS v4)

Using utility-first CSS via Tailwind. 
*   Configuration lies in `tailwind.config.js`.
*   Components use dynamic interpolations to swap styles (e.g. conditional rendering for `status` labels indicating green for "ACCEPTED" and red for "REJECTED").

## Route Guarding

`App.jsx` handles Route definitions mapping strictly to RBAC:

*   **Public Interfaces:** `/login`, `/register`, `/jobs`.
*   **Candidate Guard:** Only validated Applicants can access `/profile` and `/applications`.
*   **Admin Guard:** Specific routing boundaries `AdminRouteWrapper` prevents non-admin execution on paths matching `/admin/dashboard` or `/manage-applications`. If triggered, malicious interceptors bounce securely back to `/`.
