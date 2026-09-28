import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Vacancies from './Vacancies';
import useAuthStore from '../store/authStore';
import api from '../services/api';

vi.mock('../services/api', () => ({
    default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

function job(id) {
    return {
        id,
        title: `Geologist Attachee ${id}`,
        department: 10,
        department_name: 'Geology Directorate',
        description: '<p>Field mapping.</p>',
        requirements: 'BSc Geology',
        job_type: 'ATTACHMENT',
        location: 'Nairobi',
        slots_required: 2,
        duration_weeks: 12,
        slots_filled: 0,
        is_full: false,
        is_active: true,
        is_archived: false,
        deadline: '2099-01-01',
    };
}

function mockApi({ jobs = [job(1), job(2)] } = {}) {
    api.get.mockImplementation((url) => {
        if (url.startsWith('jobs/vacancies')) {
            return Promise.resolve({ data: { results: jobs, next: null } });
        }
        if (url.startsWith('jobs/departments')) {
            return Promise.resolve({ data: { results: [{ id: 10, name: 'Geology Directorate' }] } });
        }
        return Promise.resolve({ data: { results: [], next: null } });
    });
}

function renderAs(role) {
    useAuthStore.getState().setAuth({ id: 1, username: 'u', role }, 'token', 'refresh');
    return render(<MemoryRouter><Vacancies /></MemoryRouter>);
}

describe('admin vacancy deletion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockApi();
        api.delete.mockResolvedValue({ status: 204, data: {} });
    });

    it('shows the Delete control to an admin', async () => {
        renderAs('ADMIN');
        await waitFor(() => expect(screen.getByText('Geologist Attachee 1')).toBeInTheDocument());
        expect(screen.getAllByRole('button', { name: /^Delete$/i }).length).toBeGreaterThan(0);
    });

    // A Director cannot delete, so the control must not be offered to one.
    it('does not show the Delete control to a director', async () => {
        renderAs('DEPARTMENT_DIRECTOR');
        await waitFor(() => expect(screen.getByText('Geologist Attachee 1')).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: /^Delete$/i })).toBeNull();
    });

    it('does not delete anything when the row button is clicked', async () => {
        renderAs('ADMIN');
        await waitFor(() => expect(screen.getByText('Geologist Attachee 1')).toBeInTheDocument());

        fireEvent.click(screen.getAllByRole('button', { name: /^Delete$/i })[0]);

        // The dialog opens, but nothing has been sent.
        await waitFor(() => expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument());
        expect(api.delete).not.toHaveBeenCalled();
    });

    it('names the vacancy and asks for approval before deleting', async () => {
        renderAs('ADMIN');
        await waitFor(() => expect(screen.getByText('Geologist Attachee 1')).toBeInTheDocument());

        fireEvent.click(screen.getAllByRole('button', { name: /^Delete$/i })[0]);

        const dialog = await screen.findByTestId('confirm-dialog');
        expect(dialog).toHaveTextContent('Geologist Attachee 1');
        expect(dialog).toHaveTextContent(/System Archives/i);
    });

    it('deletes only after the admin confirms', async () => {
        renderAs('ADMIN');
        await waitFor(() => expect(screen.getByText('Geologist Attachee 1')).toBeInTheDocument());

        fireEvent.click(screen.getAllByRole('button', { name: /^Delete$/i })[0]);
        await screen.findByTestId('confirm-dialog');
        fireEvent.click(screen.getByRole('button', { name: /Yes, delete vacancy/i }));

        await waitFor(() => expect(api.delete).toHaveBeenCalledWith('jobs/vacancies/1/'));
    });

    it('deletes nothing when the admin cancels', async () => {
        renderAs('ADMIN');
        await waitFor(() => expect(screen.getByText('Geologist Attachee 1')).toBeInTheDocument());

        fireEvent.click(screen.getAllByRole('button', { name: /^Delete$/i })[0]);
        await screen.findByTestId('confirm-dialog');
        fireEvent.click(screen.getByRole('button', { name: /Keep vacancy/i }));

        await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).toBeNull());
        expect(api.delete).not.toHaveBeenCalled();
        expect(screen.getByText('Geologist Attachee 1')).toBeInTheDocument();
    });

    it('confirms the deletion with a toast naming the vacancy', async () => {
        renderAs('ADMIN');
        await waitFor(() => expect(screen.getByText('Geologist Attachee 1')).toBeInTheDocument());

        fireEvent.click(screen.getAllByRole('button', { name: /^Delete$/i })[0]);
        await screen.findByTestId('confirm-dialog');
        fireEvent.click(screen.getByRole('button', { name: /Yes, delete vacancy/i }));

        await waitFor(() => expect(screen.getByTestId('status-toast')).toBeInTheDocument());
        expect(screen.getByTestId('status-toast')).toHaveTextContent('Geologist Attachee 1');
    });

    it('reports a failure instead of implying the vacancy was deleted', async () => {
        api.delete.mockRejectedValue({ response: { status: 403, data: { detail: 'Permission denied.' } } });
        renderAs('ADMIN');
        await waitFor(() => expect(screen.getByText('Geologist Attachee 1')).toBeInTheDocument());

        fireEvent.click(screen.getAllByRole('button', { name: /^Delete$/i })[0]);
        await screen.findByTestId('confirm-dialog');
        fireEvent.click(screen.getByRole('button', { name: /Yes, delete vacancy/i }));

        await waitFor(() => expect(screen.getByTestId('status-toast')).toBeInTheDocument());
        const toast = screen.getByTestId('status-toast');
        expect(toast).toHaveTextContent('Permission denied.');
        expect(toast).not.toHaveTextContent(/moved to System Archives/i);
    });

    it('closes the dialog even when the deletion fails', async () => {
        api.delete.mockRejectedValue({ response: { status: 500, data: {} } });
        renderAs('ADMIN');
        await waitFor(() => expect(screen.getByText('Geologist Attachee 1')).toBeInTheDocument());

        fireEvent.click(screen.getAllByRole('button', { name: /^Delete$/i })[0]);
        await screen.findByTestId('confirm-dialog');
        fireEvent.click(screen.getByRole('button', { name: /Yes, delete vacancy/i }));

        await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).toBeNull());
    });
});
