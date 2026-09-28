import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExpandableRichText from './ExpandableRichText';

/**
 * Drives several ExpandableRichText instances through a parent that owns the
 * expanded set, which is how a department grid uses it. jsdom does no layout, so
 * clipping is stubbed to make the control appear.
 */
function DepartmentList({ departments, expanded, onToggle }) {
    return (
        <div>
            {departments.map((d) => (
                <div key={d.id}>
                    <h2>{d.name}</h2>
                    <ExpandableRichText
                        html={d.description}
                        id={`dept-${d.id}`}
                        expanded={expanded.has(d.id)}
                        onToggle={() => onToggle(d.id)}
                        lines={3}
                    />
                </div>
            ))}
        </div>
    );
}

function stubClipping() {
    const proto = window.HTMLElement.prototype;
    const originalScrollHeight = Object.getOwnPropertyDescriptor(proto, 'scrollHeight');
    const originalClientHeight = Object.getOwnPropertyDescriptor(proto, 'clientHeight');
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get() { return 200; } });
    Object.defineProperty(proto, 'clientHeight', { configurable: true, get() { return 40; } });
    return () => {
        if (originalScrollHeight) Object.defineProperty(proto, 'scrollHeight', originalScrollHeight);
        else delete proto.scrollHeight;
        if (originalClientHeight) Object.defineProperty(proto, 'clientHeight', originalClientHeight);
        else delete proto.clientHeight;
    };
}

const departments = [
    { id: 1, name: 'Geology Directorate', description: '<p>Mandate one, quite long.</p>' },
    { id: 2, name: 'Petroleum Engineering Directorate', description: '<p>Mandate two, quite long.</p>' },
    { id: 3, name: 'Downstream Directorate', description: '<p>Mandate three, quite long.</p>' },
];

function Harness() {
    const [expanded, setExpanded] = React.useState(() => new Set());
    const toggle = (id) => setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
    return <DepartmentList departments={departments} expanded={expanded} onToggle={toggle} />;
}

describe('per-department description expansion', () => {
    let restore = null;

    beforeEach(() => {
        vi.clearAllMocks();
        restore = stubClipping();
    });

    afterEach(() => {
        restore();
    });

    it('gives every department its own Read more control', async () => {
        render(<Harness />);
        await waitFor(() => {
            expect(screen.getAllByRole('button', { name: /read more/i })).toHaveLength(departments.length);
        });
    });

    // The requirement is that opening one department's mandate leaves the others
    // alone, and that the one opened can be closed again.
    it('expands only the department that was clicked', async () => {
        render(<Harness />);
        await waitFor(() => expect(screen.getAllByRole('button', { name: /read more/i })).toHaveLength(3));

        fireEvent.click(screen.getAllByRole('button', { name: /read more/i })[1]);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /read less/i })).toHaveAttribute(
                'aria-controls',
                'expandable-body-dept-2',
            );
        });
        // The other two stay collapsed and still offer Read more.
        expect(screen.getAllByRole('button', { name: /read more/i })).toHaveLength(2);
    });

    it('collapses that same department again on Read less', async () => {
        render(<Harness />);
        await waitFor(() => expect(screen.getAllByRole('button', { name: /read more/i })).toHaveLength(3));

        fireEvent.click(screen.getAllByRole('button', { name: /read more/i })[1]);
        await waitFor(() => expect(screen.getByRole('button', { name: /read less/i })).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /read less/i }));

        // The clamp is re-measured on the next animation frame (measuring layout
        // synchronously inside the effect would cascade a render on every
        // mount), so "Read more" returns a frame later than the collapse.
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /read less/i })).not.toBeInTheDocument();
            expect(screen.getAllByRole('button', { name: /read more/i })).toHaveLength(3);
        });
    });

    it('keeps several departments open independently at the same time', async () => {
        render(<Harness />);
        await waitFor(() => expect(screen.getAllByRole('button', { name: /read more/i })).toHaveLength(3));

        fireEvent.click(screen.getAllByRole('button', { name: /read more/i })[0]);
        await waitFor(() => expect(screen.getAllByRole('button', { name: /read more/i })).toHaveLength(2));

        fireEvent.click(screen.getAllByRole('button', { name: /read more/i })[0]);
        await waitFor(() => expect(screen.getAllByRole('button', { name: /read less/i })).toHaveLength(2));
    });
});
