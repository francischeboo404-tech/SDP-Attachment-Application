import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SystemSettings from './SystemSettings';
import RichTextEditor from '../components/RichTextEditor';
import useAuthStore from '../store/authStore';
import api from '../services/api';

vi.mock('../services/api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}));

const ADMIN = { id: 1, username: 'root', role: 'ADMIN', first_name: 'Root', last_name: 'Admin' };

const ELIGIBILITY_PAYLOAD = {
    id: 1,
    general_statement: '<h3>Who can apply</h3><p>Enrolled <strong>undergraduates</strong>.</p><ul><li>Accredited</li></ul>',
    general_statement_html: '<h3>Who can apply</h3><p>Enrolled <strong>undergraduates</strong>.</p><ul><li>Accredited</li></ul>',
    updated_at: '2026-09-20T08:00:00Z',
    updated_by_name: 'Root Admin',
};

const ATS_PAYLOAD = {
    id: 1,
    exceptional_min: '90.00',
    highly_qualified_min: '75.00',
    qualified_min: '60.00',
    average_min: '50.00',
    qualification_benchmark: '70.00',
    tier_definitions: [
        { tier: 1, name: 'Exceptional', label: 'Tier 1: Exceptional (≥90%)', min_score: 90, max_score: 100 },
        { tier: 2, name: 'Highly Qualified', label: 'Tier 2: Highly Qualified (75-89%)', min_score: 75, max_score: 89 },
    ],
    updated_at: '2026-09-21T08:00:00Z',
    updated_by_name: 'Root Admin',
};

function mockAll({ eligibility = ELIGIBILITY_PAYLOAD, ats = ATS_PAYLOAD } = {}) {
    api.get.mockImplementation((url) => {
        if (url === 'accounts/settings/') return Promise.resolve({ data: { count: 0, results: [] } });
        if (url === 'jobs/eligibility-settings/') return Promise.resolve({ data: eligibility });
        if (url === 'jobs/ats-scoring-configuration/') return Promise.resolve({ data: ats });
        return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
}

describe('SystemSettings — Eligibility & ATS sections', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAuthStore.getState().logout();
        useAuthStore.getState().setAuth(ADMIN, 'token', 'refresh');
    });

    it('renders both new sections and loads their data', async () => {
        mockAll();
        render(<SystemSettings />);

        await waitFor(() => {
            expect(screen.getByText('Eligibility Requirements')).toBeInTheDocument();
        });
        expect(screen.getByText('ATS Scoring Configuration')).toBeInTheDocument();

        expect(api.get).toHaveBeenCalledWith('jobs/eligibility-settings/');
        expect(api.get).toHaveBeenCalledWith('jobs/ats-scoring-configuration/');
    });

    it('publishes eligibility content through the rich text editor, not a textarea', async () => {
        mockAll();
        render(<SystemSettings />);

        const editor = await screen.findByTestId('rich-text-editor');
        // The landing page's old plain <textarea> is gone from this module.
        expect(document.querySelector('textarea')).toBeNull();
        // The fetched content is pushed into the editable surface once loaded.
        await waitFor(() => {
            expect(editor.innerHTML).toContain('Who can apply');
        });

        fireEvent.input(editor, { target: { innerHTML: '<p>New published policy</p>' } });
        fireEvent.click(screen.getByText('Publish to Landing Page'));

        await waitFor(() => {
            expect(api.patch).toHaveBeenCalledWith('jobs/eligibility-settings/', {
                general_statement: '<p>New published policy</p>',
            });
        });
    });

    it('surfaces a server-side sanitization error without losing the draft', async () => {
        mockAll();
        api.patch.mockRejectedValue({ response: { data: { general_statement: 'Content was rejected.' } } });
        render(<SystemSettings />);

        const editor = await screen.findByTestId('rich-text-editor');
        await waitFor(() => {
            expect(editor.innerHTML).toContain('Who can apply');
        });
        fireEvent.input(editor, { target: { innerHTML: '<p>rejected draft</p>' } });
        fireEvent.click(screen.getByText('Publish to Landing Page'));

        await waitFor(() => {
            expect(screen.getByText('Content was rejected.')).toBeInTheDocument();
        });
        expect(editor.innerHTML).toBe('<p>rejected draft</p>');
    });

    it('renders every configurable ATS threshold as a numeric input bound to its field', async () => {
        mockAll();
        render(<SystemSettings />);

        await waitFor(() => expect(screen.getByLabelText(/Tier 1: Exceptional/)).toBeInTheDocument());
        ['exceptional_min', 'highly_qualified_min', 'qualified_min', 'average_min', 'qualification_benchmark']
            .forEach((name) => {
                const input = document.getElementById(`ats-${name}`);
                expect(input).not.toBeNull();
                expect(input.type).toBe('number');
                expect(input.min).toBe('0');
                expect(input.max).toBe('100');
            });
    });

    it('submits the ATS thresholds to the config endpoint', async () => {
        mockAll();
        api.patch.mockResolvedValue({ data: { ...ATS_PAYLOAD, exceptional_min: '95.00' } });
        render(<SystemSettings />);

        const topTier = await screen.findByLabelText(/Tier 1: Exceptional/);
        fireEvent.change(topTier, { target: { value: '95' } });
        fireEvent.click(screen.getByText('Apply Thresholds'));

        await waitFor(() => {
            expect(api.patch).toHaveBeenCalledWith('jobs/ats-scoring-configuration/', expect.objectContaining({
                exceptional_min: '95',
                highly_qualified_min: '75.00',
                qualified_min: '60.00',
                average_min: '50.00',
                qualification_benchmark: '70.00',
            }));
        });
    });

    it('binds threshold validation errors to the offending field', async () => {
        mockAll();
        api.patch.mockRejectedValue({
            response: { data: { highly_qualified_min: 'Tier 1 (Exceptional) must be strictly greater than Tier 2 (Highly Qualified).' } },
        });
        render(<SystemSettings />);

        const secondTier = await screen.findByLabelText(/Tier 2: Highly Qualified/);
        fireEvent.change(secondTier, { target: { value: '99' } });
        fireEvent.click(screen.getByText('Apply Thresholds'));

        await waitFor(() => {
            expect(screen.getByText(/must be strictly greater than/)).toBeInTheDocument();
        });
    });

    it('shows the resulting tier boundaries returned by the shared tiering logic', async () => {
        mockAll();
        render(<SystemSettings />);

        await waitFor(() => {
            expect(screen.getByText('Tier 1: Exceptional (≥90%)')).toBeInTheDocument();
        });
        expect(screen.getByText('Tier 2: Highly Qualified (75-89%)')).toBeInTheDocument();
    });

    it('previews the eligibility content exactly as the landing page will render it', async () => {
        mockAll();
        render(<SystemSettings />);

        const preview = await screen.findByTestId('eligibility-preview');
        await waitFor(() => {
            expect(preview.innerHTML).toContain('Who can apply');
        });
        // The preview reuses the same prose rules as the public banner.
        expect(preview.className).toContain('eligibility-prose');
        expect(preview.innerHTML).toContain('<h3>');
        expect(preview.innerHTML).toContain('<strong>');
    });

    it('explains an unapplied-migration server error instead of showing a bare message', async () => {
        api.get.mockImplementation((url) => {
            if (url === 'accounts/settings/') return Promise.resolve({ data: { count: 0, results: [] } });
            if (url === 'jobs/eligibility-settings/') return Promise.resolve({ data: ELIGIBILITY_PAYLOAD });
            if (url === 'jobs/ats-scoring-configuration/') {
                const err = new Error('Server Error');
                err.response = { status: 500, data: {} };
                return Promise.reject(err);
            }
            return Promise.reject(new Error(`Unexpected GET ${url}`));
        });

        render(<SystemSettings />);

        await waitFor(() => {
            expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
        });
        expect(screen.getByText(/python manage\.py migrate/)).toBeInTheDocument();
    });

    it('explains a permissions failure distinctly', async () => {
        api.get.mockImplementation((url) => {
            if (url === 'accounts/settings/') return Promise.resolve({ data: { count: 0, results: [] } });
            if (url === 'jobs/eligibility-settings/') return Promise.resolve({ data: ELIGIBILITY_PAYLOAD });
            if (url === 'jobs/ats-scoring-configuration/') {
                const err = new Error('Forbidden');
                err.response = { status: 403, data: {} };
                return Promise.reject(err);
            }
            return Promise.reject(new Error(`Unexpected GET ${url}`));
        });

        render(<SystemSettings />);

        await waitFor(() => {
            expect(screen.getByText(/not permitted to read the ATS scoring configuration/i)).toBeInTheDocument();
        });
    });
});

describe('RichTextEditor', () => {
    it('renders the incoming value into the editable surface', () => {
        render(<RichTextEditor value="<p>seeded</p>" onChange={vi.fn()} />);
        expect(screen.getByTestId('rich-text-editor').innerHTML).toBe('<p>seeded</p>');
    });

    it('reports edits upward as HTML', () => {
        const onChange = vi.fn();
        render(<RichTextEditor value="<p>seeded</p>" onChange={onChange} />);
        const editor = screen.getByTestId('rich-text-editor');
        fireEvent.input(editor, { target: { innerHTML: '<p>edited</p>' } });
        expect(onChange).toHaveBeenCalledWith('<p>edited</p>');
    });

    it('exposes the required formatting controls', () => {
        render(<RichTextEditor value="" onChange={vi.fn()} />);
        // Asserted on the accessible name rather than the tooltip, because the
        // name is what a screen reader actually announces. The tooltips carry
        // extra guidance after the action word, so match the leading word.
        ['Bold', 'Italic', 'Heading', 'Paragraph', 'Bulleted list', 'Numbered list']
            .forEach((label) => {
                expect(
                    screen.getByRole('button', { name: new RegExp(`^${label}`) })
                ).toBeInTheDocument();
            });
    });

    it('does not throw when execCommand is unavailable', () => {
        const original = document.execCommand;
        // jsdom does not implement execCommand; the component must degrade quietly.
        delete document.execCommand;
        try {
            render(<RichTextEditor value="<p>x</p>" onChange={vi.fn()} />);
            fireEvent.click(screen.getByTitle('Bold'));
        } finally {
            document.execCommand = original;
        }
    });

    it('forces plain text on paste', () => {
        const onChange = vi.fn();
        render(<RichTextEditor value="" onChange={onChange} />);
        const editor = screen.getByTestId('rich-text-editor');
        fireEvent.paste(editor, {
            clipboardData: { getData: () => 'pasted words' },
        });
        expect(onChange).toHaveBeenCalled();
    });
});
