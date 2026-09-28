import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Header from './Header';
import useAuthStore from '../store/authStore';
import api from '../services/api';

vi.mock('../services/api', () => ({
    default: {
        get: vi.fn(),
        patch: vi.fn(),
        post: vi.fn(),
    },
}));

describe('Header Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAuthStore.getState().logout();
    });

    it('renders header with guest user fallback when unauthenticated', () => {
        api.get.mockResolvedValue({ data: [] });
        render(<Header onMenuClick={vi.fn()} />);

        expect(screen.getByText('State Department for Petroleum')).toBeInTheDocument();
        expect(screen.getByText('Guest')).toBeInTheDocument();
        expect(screen.getByText('Applicant')).toBeInTheDocument();
    });

    it('renders authenticated user information and role', async () => {
        useAuthStore.getState().setAuth({ username: 'jane_doe', role: 'HR' }, 'token', 'refresh');
        api.get.mockResolvedValue({ data: [] });

        render(<Header onMenuClick={vi.fn()} />);

        expect(screen.getByText('jane_doe')).toBeInTheDocument();
        // Roles are shown through roleLabel(), which maps codes to readable names.
        expect(screen.getByText('Human Resources')).toBeInTheDocument();
        expect(screen.getByText('J')).toBeInTheDocument();
    });

    it('fetches notifications and displays unread count badge', async () => {
        useAuthStore.getState().setAuth({ username: 'john_doe', role: 'APPLICANT' }, 'token', 'refresh');
        api.get.mockResolvedValue({
            data: [
                { id: 1, title: 'Offer Ready', message: 'Congratulations!', is_read: false, created_at: new Date().toISOString() },
                { id: 2, title: 'Profile Tip', message: 'Update biodata', is_read: true, created_at: new Date().toISOString() },
            ],
        });

        render(<Header onMenuClick={vi.fn()} />);

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('jobs/notifications/');
            expect(screen.getByText('1')).toBeInTheDocument(); // 1 unread notification
        });
    });

    it('toggles notification popover on bell click and marks single notification as read', async () => {
        useAuthStore.getState().setAuth({ username: 'john_doe', role: 'APPLICANT' }, 'token', 'refresh');
        api.get.mockResolvedValue({
            data: [
                { id: 101, title: 'Interview Call', message: 'Interview scheduled tomorrow', is_read: false, created_at: new Date().toISOString() },
            ],
        });
        api.patch.mockResolvedValue({ data: { success: true } });

        render(<Header onMenuClick={vi.fn()} />);

        // Wait for notifications to load first
        await waitFor(() => {
            expect(screen.getByText('1')).toBeInTheDocument();
        });

        const bellButton = screen.getByTitle('Notifications');
        fireEvent.click(bellButton);

        expect(screen.getByText('Notifications')).toBeInTheDocument();
        expect(screen.getByText('Interview Call')).toBeInTheDocument();

        // Click notification to mark read
        const notifItem = screen.getByText('Interview Call');
        fireEvent.click(notifItem);

        await waitFor(() => {
            expect(api.patch).toHaveBeenCalledWith('jobs/notifications/101/read/');
        });
    });
});
