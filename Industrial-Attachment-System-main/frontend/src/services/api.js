import axios from 'axios';
import useAuthStore from '../store/authStore';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/';

const api = axios.create({ baseURL: BASE_URL });

// ── REQUEST INTERCEPTOR ───────────────────────────────────────────────────────
// Attaches the current access token to every outgoing request.
api.interceptors.request.use(
    (config) => {
        const token = useAuthStore.getState().token;
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// ── RESPONSE INTERCEPTOR — silent token refresh ───────────────────────────────
// When a 401 is received:
//   1. Attempt a silent refresh using the stored refresh token.
//   2. If successful → update the access token and replay the failed request.
//   3. If the refresh itself fails → force logout and redirect to login.
// Concurrent 401s are queued and resolved together once refresh completes,
// preventing multiple simultaneous refresh calls (race-condition safe).

let isRefreshing = false;
let failedQueue  = [];   // { resolve, reject } entries waiting on the refresh

const processQueue = (error, token = null) => {
    failedQueue.forEach(({ resolve, reject }) => {
        if (error) reject(error);
        else       resolve(token);
    });
    failedQueue = [];
};

api.interceptors.response.use(
    // Any 2xx — pass through untouched.
    (response) => response,

    async (error) => {
        const original = error.config;

        // ── Only intercept 401 errors that have not already been retried,
        //    and never intercept the refresh or login endpoints themselves
        //    (that would create an infinite retry loop).
        const is401        = error.response?.status === 401;
        const alreadyRetried = original?._retry;
        const isAuthEndpoint = original?.url?.includes('refresh/') ||
                               original?.url?.includes('login/');

        if (!is401 || alreadyRetried || isAuthEndpoint) {
            return Promise.reject(error);
        }

        // ── A concurrent refresh is already in flight — queue this request ──
        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            }).then((newToken) => {
                original.headers['Authorization'] = `Bearer ${newToken}`;
                return api(original);
            }).catch((err) => Promise.reject(err));
        }

        // ── This is the first 401 — start a refresh ──────────────────────────
        original._retry  = true;
        isRefreshing     = true;

        const refreshToken = useAuthStore.getState().refreshToken;

        if (!refreshToken) {
            // No refresh token stored — session is unrecoverable, force logout.
            isRefreshing = false;
            processQueue(error, null);
            useAuthStore.getState().logout();
            window.location.href = '/';
            return Promise.reject(error);
        }

        try {
            // Call the Django SimpleJWT refresh endpoint directly with plain
            // axios (not the api instance) to avoid triggering this interceptor.
            const { data } = await axios.post(
                `${BASE_URL}accounts/refresh/`,
                { refresh: refreshToken }
            );

            const newAccessToken = data.access;

            // Persist the new access token silently.
            useAuthStore.getState().setAccessToken(newAccessToken);

            // Replay all queued requests with the fresh token.
            processQueue(null, newAccessToken);
            isRefreshing = false;

            // Replay the original request that triggered the 401.
            original.headers['Authorization'] = `Bearer ${newAccessToken}`;
            return api(original);

        } catch (refreshError) {
            // Refresh token itself is expired or invalid — force logout.
            processQueue(refreshError, null);
            isRefreshing = false;
            useAuthStore.getState().logout();
            window.location.href = '/';
            return Promise.reject(refreshError);
        }
    }
);

export default api;
