import React, { useCallback, useEffect, useRef } from 'react';

/**
 * RichTextEditor
 *
 * Dependency-free WYSIWYG editor for the Admin-authored eligibility content.
 * The project ships no rich-text library, so this is a small contentEditable
 * surface rather than a new heavyweight dependency.
 *
 * The HTML string in React state is the source of truth: every DOM mutation is
 * mirrored back through `onChange`, and incoming values are only pushed into the
 * DOM when they genuinely differ from what is already rendered. That last part
 * is what stops the caret from jumping to the end on every keystroke, which is
 * the usual failure mode of a naively controlled contentEditable.
 *
 * Security: the markup produced here is untrusted until the server sanitizes it.
 * `jobs/sanitizers.py` strips anything outside its allowlist on save and again on
 * render, so this component deliberately does not attempt its own sanitizing.
 */
/**
 * Toolbar entries.
 *
 * Each control carries a visible word as well as a glyph. The previous toolbar
 * showed bare "B", "I", "H3", "P", a bullet dot and "1.", which meant a user
 * had to already know which of those was a heading versus a paragraph, and
 * guess what the lone dot and number did. Spelling the action out removes the
 * guess entirely; `text` is what is drawn and `short` is the only place a
 * compact glyph is kept (as the aria-label on a text-bearing control, which is
 * never announced in place of the visible word).
 */
const TOOLBAR_ACTIONS = [
    { command: 'bold', text: 'Bold', short: 'B', title: 'Bold', className: 'font-black' },
    { command: 'italic', text: 'Italic', short: 'I', title: 'Italic', className: 'italic font-serif' },
    { command: 'formatBlock', argument: 'h3', text: 'Heading', title: 'Heading (larger section title)' },
    { command: 'formatBlock', argument: 'p', text: 'Paragraph', title: 'Paragraph (normal body text)' },
    { command: 'insertUnorderedList', text: 'Bulleted list', title: 'Bulleted list (unordered points)' },
    { command: 'insertOrderedList', text: 'Numbered list', title: 'Numbered list (ordered steps)' },
    { command: 'removeFormat', text: 'Remove format', title: 'Remove all formatting', className: 'text-2xs' },
];

function execCommand(command, argument) {
    // execCommand is deprecated but remains the only dependency-free way to
    // apply inline formatting while preserving the browser's native undo stack.
    // Guarded because it is absent in some non-browser DOM implementations.
    if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
        return false;
    }
    document.execCommand(command, false, argument);
    return true;
}

export default function RichTextEditor({ value, onChange, disabled = false, minHeight = 180, 'aria-label': ariaLabel = 'Rich text editor' }) {
    const editorRef = useRef(null);
    // Tracks whether the last DOM write came from us (true) or from the user
    // typing (false), so we can tell an external value change from an echo.
    const internalEditRef = useRef(false);

    // Push external value changes into the DOM only when they differ from the
    // currently rendered markup, preserving the caret while typing.
    useEffect(() => {
        const node = editorRef.current;
        if (!node) return;
        const incoming = value || '';
        if (node.innerHTML !== incoming) {
            internalEditRef.current = true;
            node.innerHTML = incoming;
        }
    }, [value]);

    const handleInput = useCallback(() => {
        const node = editorRef.current;
        if (!node) return;
        internalEditRef.current = false;
        onChange(node.innerHTML);
    }, [onChange]);

    const handleKeyDown = useCallback((event) => {
        // Enter naturally creates a paragraph break in contentEditable; formatting
        // shortcuts mirror what the toolbar already offers.
        if (!(event.ctrlKey || event.metaKey)) return;
        const key = event.key.toLowerCase();
        const shortcuts = { b: 'bold', i: 'italic' };
        const command = shortcuts[key];
        if (command) {
            event.preventDefault();
            execCommand(command);
            handleInput();
        }
    }, [handleInput]);

    const runCommand = useCallback((command, argument) => {
        const node = editorRef.current;
        if (!node || disabled) return;
        node.focus();
        if (execCommand(command, argument)) {
            handleInput();
        }
    }, [disabled, handleInput]);

    const handlePaste = useCallback((event) => {
        // Force plain text on paste so pasted word-processor markup cannot inject
        // styles or scripts ahead of the server-side sanitizer.
        event.preventDefault();
        const text = (event.clipboardData || window.clipboardData)?.getData('text/plain') || '';
        if (!execCommand('insertText', text)) {
            // execCommand is the caret-preserving path, but it is absent in some
            // non-browser DOM implementations. Fall back to a plain append rather
            // than silently discarding the pasted content.
            const node = editorRef.current;
            if (node) node.textContent = `${node.textContent || ''}${text}`;
        }
        handleInput();
    }, [handleInput]);

    return (
        <div className="rounded-xl border border-slate-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500 transition-all">
            <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-50 border-b border-slate-200">
                {TOOLBAR_ACTIONS.map((action, index) => (
                    <React.Fragment key={action.command + (action.argument || '')}>
                        {(action.command === 'formatBlock' || action.command === 'removeFormat') && index > 0 && (
                            <span className="w-px h-5 bg-slate-300 mx-1" />
                        )}
                        <button
                            type="button"
                            title={action.title}
                            aria-label={action.title}
                            disabled={disabled}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => runCommand(action.command, action.argument)}
                            data-testid={`rte-${action.command}${action.argument ? '-' + action.argument : ''}`}
                            className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-sm transition-all disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none ${action.className || 'font-semibold'}`}
                        >
                            {/* A glyph alongside the word reinforces the action
                                without being the only clue. Decorative only. */}
                            {action.short && (
                                <span aria-hidden="true" className="inline-block w-3 text-center opacity-70">
                                    {action.short}
                                </span>
                            )}
                            <span>{action.text}</span>
                        </button>
                    </React.Fragment>
                ))}
                <span className="ml-auto text-2xs font-bold uppercase tracking-wider text-slate-400">
                    Rich Text
                </span>
            </div>
            <div
                ref={editorRef}
                contentEditable={!disabled}
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label={ariaLabel}
                data-testid="rich-text-editor"
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                style={{ minHeight }}
                className="rich-prose px-3.5 py-3 text-sm font-semibold text-slate-900 focus:outline-none"
            />
        </div>
    );
}
