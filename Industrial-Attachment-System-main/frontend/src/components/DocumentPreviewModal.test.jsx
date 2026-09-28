import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DocumentPreviewModal from './DocumentPreviewModal';

describe('DocumentPreviewModal Component', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('renders nothing when isOpen is false', () => {
        const { container } = render(
            <DocumentPreviewModal
                isOpen={false}
                onClose={vi.fn()}
                title="Sample Doc"
                rawText="Sample text content"
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders modal dialog with correct title, subtitle, and content when isOpen is true', () => {
        render(
            <DocumentPreviewModal
                isOpen={true}
                onClose={vi.fn()}
                title="Official Recommendation Letter"
                subtitle="Issued to John Doe"
                rawText="This is the verified recommendation body text."
            />
        );

        expect(screen.getAllByText('Official Recommendation Letter').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Issued to John Doe')).toBeInTheDocument();
        expect(screen.getByText('This is the verified recommendation body text.')).toBeInTheDocument();
        expect(screen.getByText('Republic of Kenya')).toBeInTheDocument();
    });

    it('triggers onClose callback when close button is clicked', () => {
        const onCloseMock = vi.fn();
        render(
            <DocumentPreviewModal
                isOpen={true}
                onClose={onCloseMock}
                title="Test Modal"
                rawText="Some text"
            />
        );

        const closeBtn = screen.getByTitle('Close preview');
        fireEvent.click(closeBtn);
        expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('triggers onDownloadPdf callback when download button is provided and clicked', () => {
        const onDownloadMock = vi.fn();
        render(
            <DocumentPreviewModal
                isOpen={true}
                onClose={vi.fn()}
                title="Letter"
                rawText="Content"
                onDownloadPdf={onDownloadMock}
            />
        );

        const downloadBtn = screen.getByText('Download');
        fireEvent.click(downloadBtn);
        expect(onDownloadMock).toHaveBeenCalledTimes(1);
    });

    it('triggers handlePrint and opens print window when Print / PDF button is clicked', () => {
        const mockPrint = vi.fn();
        const mockWrite = vi.fn();
        const mockClose = vi.fn();
        const mockFocus = vi.fn();

        vi.spyOn(window, 'open').mockReturnValue({
            document: {
                write: mockWrite,
                close: mockClose,
            },
            focus: mockFocus,
            print: mockPrint,
        });

        render(
            <DocumentPreviewModal
                isOpen={true}
                onClose={vi.fn()}
                title="Printable Letter"
                rawText="Printable content body"
            />
        );

        const printBtn = screen.getByText('Print / PDF');
        fireEvent.click(printBtn);

        expect(window.open).toHaveBeenCalledWith('', '_blank');
        expect(mockWrite).toHaveBeenCalled();
        expect(mockClose).toHaveBeenCalled();
    });
});
