import { create } from 'zustand';

// ── Safe localStorage helpers ─────────────────────────────────────────────────
const getPersistedUser = () => {
    try {
        const item = localStorage.getItem('user');
        return item ? JSON.parse(item) : null;
    } catch {
        return null;
    }
};

const useAuthStore = create((set, get) => ({
    user:          getPersistedUser(),
    token:         localStorage.getItem('token')        || null,
    refreshToken:  localStorage.getItem('refreshToken') || null,
    isAuthenticated: !!localStorage.getItem('token'),

    // ── Called on successful login ────────────────────────────────────────────
    // Accepts user object, access token, AND refresh token.
    // All three are persisted to localStorage so they survive hard refreshes.
    setAuth: (user, accessToken, refreshToken) => {
        if (accessToken)  localStorage.setItem('token',        accessToken);
        if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
        if (user)         localStorage.setItem('user',         JSON.stringify(user));
        set({ user, token: accessToken, refreshToken, isAuthenticated: true });
    },

    // ── Called silently by the Axios response interceptor ────────────────────
    // Updates the stored access token without touching the refresh token or user.
    setAccessToken: (accessToken) => {
        localStorage.setItem('token', accessToken);
        set({ token: accessToken });
    },

    // ── Update current user profile without changing tokens ──────────────────
    setUser: (user) => {
        if (user) localStorage.setItem('user', JSON.stringify(user));
        else localStorage.removeItem('user');
        set({ user });
    },

    // ── Full logout ───────────────────────────────────────────────────────────
    logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false });
    },
}));

export default useAuthStore;
