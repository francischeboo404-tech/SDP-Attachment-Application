import { describe, it, expect, beforeEach } from 'vitest';
import useAuthStore from './authStore';

describe('authStore Zustand Store', () => {
    beforeEach(() => {
        localStorage.clear();
        useAuthStore.getState().logout();
    });

    it('initializes with null state when localStorage is empty', () => {
        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.token).toBeNull();
        expect(state.refreshToken).toBeNull();
        expect(state.isAuthenticated).toBe(false);
    });

    it('sets authentication credentials and persists to localStorage via setAuth', () => {
        const mockUser = { id: 1, email: 'user@example.com', role: 'APPLICANT' };
        const mockAccess = 'access-token-123';
        const mockRefresh = 'refresh-token-456';

        useAuthStore.getState().setAuth(mockUser, mockAccess, mockRefresh);

        const state = useAuthStore.getState();
        expect(state.user).toEqual(mockUser);
        expect(state.token).toBe(mockAccess);
        expect(state.refreshToken).toBe(mockRefresh);
        expect(state.isAuthenticated).toBe(true);

        expect(localStorage.getItem('token')).toBe(mockAccess);
        expect(localStorage.getItem('refreshToken')).toBe(mockRefresh);
        expect(JSON.parse(localStorage.getItem('user'))).toEqual(mockUser);
    });

    it('updates access token without modifying other state via setAccessToken', () => {
        const mockUser = { id: 2, email: 'hr@example.com', role: 'HR' };
        useAuthStore.getState().setAuth(mockUser, 'old-token', 'refresh-token');

        useAuthStore.getState().setAccessToken('new-access-token');

        const state = useAuthStore.getState();
        expect(state.token).toBe('new-access-token');
        expect(state.refreshToken).toBe('refresh-token');
        expect(state.user).toEqual(mockUser);
        expect(localStorage.getItem('token')).toBe('new-access-token');
    });

    it('updates user profile via setUser', () => {
        const initialUser = { id: 3, email: 'director@example.com', role: 'DEPARTMENT_DIRECTOR' };
        useAuthStore.getState().setAuth(initialUser, 'token-1', 'refresh-1');

        const updatedUser = { ...initialUser, first_name: 'Jane', last_name: 'Director' };
        useAuthStore.getState().setUser(updatedUser);

        const state = useAuthStore.getState();
        expect(state.user).toEqual(updatedUser);
        expect(JSON.parse(localStorage.getItem('user'))).toEqual(updatedUser);

        // Setting user to null removes from localStorage
        useAuthStore.getState().setUser(null);
        expect(useAuthStore.getState().user).toBeNull();
        expect(localStorage.getItem('user')).toBeNull();
    });

    it('clears all credentials and localStorage on logout', () => {
        const mockUser = { id: 4, email: 'admin@example.com', role: 'ADMIN' };
        useAuthStore.getState().setAuth(mockUser, 'tok-a', 'tok-r');

        useAuthStore.getState().logout();

        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.token).toBeNull();
        expect(state.refreshToken).toBeNull();
        expect(state.isAuthenticated).toBe(false);

        expect(localStorage.getItem('token')).toBeNull();
        expect(localStorage.getItem('refreshToken')).toBeNull();
        expect(localStorage.getItem('user')).toBeNull();
    });
});
