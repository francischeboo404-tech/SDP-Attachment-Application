import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from './Landing';
import useAuthStore from '../store/authStore';
import api from '../services/api';

vi.mock('../services/api', () => ({
    default: { get: vi.fn() },
}));

const RICH_HTML = '<h3>Who can apply</h3><p>Enrolled <strong>undergraduates</strong>.</p><ul><li>Accredited</li></ul>';

function mockPublic({ eligibilityHtml = RICH_HTML } = {}) {
    api.get.mockImplementation((url) => {
        if (url === 'jobs/vacancies/public/') return Promise.resolve({ data: { results: [] } });
        if (url === 'jobs/departments/') return Promise.resolve({ data: { results: [] } });
        if (url === 'jobs/eligibility-settings/') {
            return Promise.resolve({ data: { general_statement_html: eligibilityHtml } });
        }
        return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
}

function renderLanding() {
    return render(
        <MemoryRouter>
            <Landing />
        </MemoryRouter>
    );
}

describe('Landing page eligibility content is read-only', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAuthStore.getState().logout();
    });

    it('renders the Admin-authored rich text as HTML, preserving formatting', async () => {
        mockPublic();
        renderLanding();

        await waitFor(() => {
            expect(screen.getByText('Who can apply')).toBeInTheDocument();
        });
        const prose = document.querySelector('.eligibility-prose');
        expect(prose).not.toBeNull();
        expect(prose.innerHTML).toContain('<h3>');
        expect(prose.innerHTML).toContain('<strong>');
        expect(prose.innerHTML).toContain('<ul>');
        expect(prose.innerHTML).toContain('<li>Accredited</li>');
    });

    it('exposes no edit affordance even to an Admin', async () => {
        useAuthStore.getState().setAuth(
            { id: 1, username: 'root', role: 'ADMIN', first_name: 'Root', last_name: 'Admin' },
            'token',
            'refresh'
        );
        mockPublic();
        renderLanding();

        await waitFor(() => {
            expect(screen.getByText('Who can apply')).toBeInTheDocument();
        });

        expect(screen.queryByText(/Edit Eligibility/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Edit General Eligibility/i)).not.toBeInTheDocument();
        // The old page PATCHed the endpoint from here; it must now only read.
        expect(api.patch).toBeUndefined();
    });

    it('never issues a write request for eligibility content', async () => {
        mockPublic();
        renderLanding();
        await waitFor(() => {
            expect(screen.getByText('Who can apply')).toBeInTheDocument();
        });
        expect(api.get).toHaveBeenCalledWith('jobs/eligibility-settings/');
        expect(api.get).toHaveBeenCalledTimes(3);
    });
});
