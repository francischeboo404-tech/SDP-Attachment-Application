import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import PageGuideHeader from '../components/PageGuideHeader';
import RichTextEditor from '../components/RichTextEditor';

const THRESHOLD_FIELDS = [
    { name: 'exceptional_min', tier: 'Tier 1', label: 'Exceptional', hint: 'Minimum score for the top tier.' },
    { name: 'highly_qualified_min', tier: 'Tier 2', label: 'Highly Qualified', hint: 'Minimum score for Tier 2.' },
    { name: 'qualified_min', tier: 'Tier 3', label: 'Qualified', hint: 'Minimum score for Tier 3.' },
    { name: 'average_min', tier: 'Tier 4', label: 'Average', hint: 'Anything below this falls into Tier 5.' },
];

const EMPTY_ATS_CONFIG = {
    exceptional_min: '90.00',
    highly_qualified_min: '75.00',
    qualified_min: '60.00',
    average_min: '50.00',
    qualification_benchmark: '70.00',
    tier_definitions: [],
    updated_at: null,
    updated_by_name: 'System Default',
};

export default function SystemSettings() {
    const [settings, setSettings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState(null);

    // Eligibility Requirements (public landing page content)
    const [eligibility, setEligibility] = useState('');
    const [eligibilityMeta, setEligibilityMeta] = useState({ updated_at: null, updated_by_name: 'System Default' });
    const [savingEligibility, setSavingEligibility] = useState(false);
    const [eligibilityError, setEligibilityError] = useState(null);

    // ATS Scoring Configuration (dashboard quality tier boundaries)
    const [atsConfig, setAtsConfig] = useState(EMPTY_ATS_CONFIG);
    const [savingAts, setSavingAts] = useState(false);
    const [atsErrors, setAtsErrors] = useState({});

    // Modal state for Add/Edit
    const [modal, setModal] = useState({
        open: false,
        isEdit: false,
        id: null,
        key: '',
        category: 'CREDENTIALS',
        description: '',
        is_secret: true,
        raw_value: '',
    });

    const fetchSettings = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('accounts/settings/');
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setSettings(data);
        } catch (err) {
            console.error('Failed to load system settings:', err);
            setFeedback({ type: 'error', text: 'Failed to load system security settings.' });
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchEligibility = useCallback(async () => {
        try {
            const res = await api.get('jobs/eligibility-settings/');
            setEligibility(res.data?.general_statement ?? '');
            setEligibilityMeta({
                updated_at: res.data?.updated_at ?? null,
                updated_by_name: res.data?.updated_by_name || 'System Default',
            });
        } catch (err) {
            console.error('Failed to load eligibility settings:', err);
            setEligibilityError(describeLoadFailure(err, 'eligibility content'));
        }
    }, []);

    const fetchAtsConfig = useCallback(async () => {
        try {
            const res = await api.get('jobs/ats-scoring-configuration/');
            setAtsConfig({ ...EMPTY_ATS_CONFIG, ...res.data });
        } catch (err) {
            console.error('Failed to load ATS scoring configuration:', err);
            setAtsErrors({ _load: describeLoadFailure(err, 'ATS scoring configuration') });
        }
    }, []);

    useEffect(() => {
        fetchSettings();
        fetchEligibility();
        fetchAtsConfig();
    }, [fetchSettings, fetchEligibility, fetchAtsConfig]);

    const extractFieldErrors = (data) => {
        if (!data || typeof data !== 'object') return {};
        const flat = {};
        Object.entries(data).forEach(([key, value]) => {
            flat[key] = Array.isArray(value) ? value.join(' ') : String(value);
        });
        return flat;
    };

    /**
     * Turns a failed request into a message that tells the Admin what to do.
     * A bare "failed to load" was especially unhelpful when the real cause was an
     * unapplied database migration on the server.
     */
    const describeLoadFailure = (err, featureLabel) => {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
            return `You are not permitted to read the ${featureLabel}. Reload the page and confirm you are signed in as an Administrator.`;
        }
        if (status === 404) {
            return `The ${featureLabel} endpoint was not found. The server may be running an older version of the code — pull the latest changes and restart it.`;
        }
        if (status >= 500) {
            return `The server returned an error (HTTP ${status}) while loading the ${featureLabel}. If this feature was recently added, the database migrations have probably not been applied yet — run "python manage.py migrate" in the backend folder, then reload.`;
        }
        if (!err?.response) {
            return `Could not reach the server while loading the ${featureLabel}. Check that the backend is running and reload the page.`;
        }
        return `Failed to load the ${featureLabel} (HTTP ${status}).`;
    };

    const handleSaveEligibility = async (e) => {
        e.preventDefault();
        setSavingEligibility(true);
        setEligibilityError(null);
        setFeedback(null);
        try {
            const res = await api.patch('jobs/eligibility-settings/', {
                general_statement: eligibility,
            });
            // The server returns the sanitized markup, so mirror it back rather
            // than showing the Admin what they typed before stripping.
            setEligibility(res.data?.general_statement ?? eligibility);
            setEligibilityMeta({
                updated_at: res.data?.updated_at ?? null,
                updated_by_name: res.data?.updated_by_name || 'System Default',
            });
            setFeedback({ type: 'success', text: 'Eligibility requirements published to the landing page.' });
        } catch (err) {
            console.error(err);
            setEligibilityError(extractFieldErrors(err.response?.data).general_statement || 'Failed to save eligibility content.');
        } finally {
            setSavingEligibility(false);
        }
    };

    const handleSaveAtsConfig = async (e) => {
        e.preventDefault();
        setSavingAts(true);
        setAtsErrors({});
        setFeedback(null);
        try {
            const payload = {
                exceptional_min: atsConfig.exceptional_min,
                highly_qualified_min: atsConfig.highly_qualified_min,
                qualified_min: atsConfig.qualified_min,
                average_min: atsConfig.average_min,
                qualification_benchmark: atsConfig.qualification_benchmark,
            };
            const res = await api.patch('jobs/ats-scoring-configuration/', payload);
            setAtsConfig({ ...EMPTY_ATS_CONFIG, ...res.data });
            setFeedback({ type: 'success', text: 'ATS scoring thresholds updated. Dashboard tiering reflects the new boundaries on next load.' });
        } catch (err) {
            console.error(err);
            setAtsErrors(extractFieldErrors(err.response?.data));
        } finally {
            setSavingAts(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFeedback(null);
        try {
            const payload = {
                key: modal.key.trim(),
                category: modal.category,
                description: modal.description.trim(),
                is_secret: modal.is_secret,
            };
            if (modal.raw_value.trim()) {
                payload.raw_value = modal.raw_value.trim();
            }

            if (modal.isEdit) {
                await api.patch(`accounts/settings/${modal.id}/`, payload);
                setFeedback({ type: 'success', text: `Setting '${modal.key}' updated successfully.` });
            } else {
                await api.post('accounts/settings/', payload);
                setFeedback({ type: 'success', text: `New credential '${modal.key}' configured successfully.` });
            }
            setModal({ open: false, isEdit: false, id: null, key: '', category: 'CREDENTIALS', description: '', is_secret: true, raw_value: '' });
            fetchSettings();
        } catch (err) {
            console.error(err);
            const errText = err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to save setting.';
            setFeedback({ type: 'error', text: errText });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (setting) => {
        if (!window.confirm(`Are you sure you want to delete credential key '${setting.key}'?`)) return;
        try {
            await api.delete(`accounts/settings/${setting.id}/`);
            setFeedback({ type: 'success', text: `Credential '${setting.key}' removed.` });
            fetchSettings();
        } catch (err) {
            console.error(err);
            setFeedback({ type: 'error', text: 'Failed to delete setting.' });
        }
    };

    return (
        <div className="animation-fade-in w-full max-w-7xl mx-auto space-y-6 pb-16 text-slate-900">
            <PageGuideHeader
                title="System Settings & Keys"
                subtitle="Admin-configured institutional content, ATS scoring thresholds, API keys, and service credentials. All secrets are symmetrically encrypted at rest and never rendered in plaintext."
                badge="Security & Compliance"
                workflowKey="admin-workflow"
                currentStep={4}
                roleTips={{
                    ADMIN: "All credentials stored here are encrypted using AES/Fernet encryption. Eligibility content is published publicly to every visitor, and ATS thresholds immediately re-tier the Admin dashboard. Views and modifications are permanently recorded in the System Audit Trail."
                }}
                actions={
                    <button
                        onClick={() => setModal({ open: true, isEdit: false, id: null, key: '', category: 'CREDENTIALS', description: '', is_secret: true, raw_value: '' })}
                        className="bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] px-5 py-2.5 rounded-xl font-bold transition-all text-xs flex items-center gap-2 shadow-sm"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Add Secure Credential</span>
                    </button>
                }
            />

            {feedback && (
                <div className={`p-4 mb-6 rounded-2xl text-sm font-bold flex items-center justify-between ${
                    feedback.type === 'success' ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'
                }`}>
                    <span>{feedback.text}</span>
                    <button onClick={() => setFeedback(null)} className="text-lg leading-none hover:opacity-75">&times;</button>
                </div>
            )}

            {/* Security Notice Card */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-3xl p-6 mb-8 flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                </div>
                <div>
                    <h4 className="text-sm font-black text-emerald-950">Zero-Plaintext Architecture</h4>
                    <p className="text-xs text-emerald-800 font-medium mt-0.5 leading-relaxed">
                        Values are masked on the frontend (<code>••••••••1234</code>) and encrypted at rest in the database. Updating a secret replaces the stored ciphertext.
                    </p>
                </div>
            </div>

            {/* ── Eligibility Requirements (public landing page content) ────── */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="font-extrabold text-slate-900 text-base">Eligibility Requirements</h3>
                        <p className="text-2xs text-slate-500 font-medium mt-0.5 max-w-xl">
                            Rich content published to the top of the public landing page. This is the
                            only place it can be edited. Content is sanitized server-side against a
                            strict HTML allowlist, and saving invalidates the public cache immediately.
                        </p>
                    </div>
                    {eligibilityMeta.updated_at && (
                        <div className="text-2xs text-slate-500 font-bold whitespace-nowrap text-right">
                            <div>Last published {new Date(eligibilityMeta.updated_at).toLocaleDateString()}</div>
                            <div className="text-2xs text-slate-400">By: {eligibilityMeta.updated_by_name}</div>
                        </div>
                    )}
                </div>

                <form onSubmit={handleSaveEligibility} className="p-6 space-y-4">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                        <div>
                            <span className="block text-2xs font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                Content Editor
                            </span>
                            <RichTextEditor
                                value={eligibility}
                                onChange={setEligibility}
                                disabled={savingEligibility}
                                minHeight={260}
                                aria-label="Eligibility requirements content"
                            />
                        </div>

                        {/* Live preview: renders through the same .eligibility-prose
                            rules and the same banner styling as the public landing
                            page, so what the Admin sees here is exactly what a
                            visitor sees. */}
                        <div>
                            <span className="block text-2xs font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                Live Preview — as visitors see it on the landing page
                            </span>
                            <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-amber-50 via-primary-50 to-emerald-50/50 p-5 min-h-[260px]">
                                <span className="inline-block text-2xs font-black uppercase tracking-wider text-primary-800 bg-amber-100/90 px-2.5 py-1 rounded-md border border-primary-300">
                                    Institutional Attachment Eligibility
                                </span>
                                <h3 className="text-lg font-black text-slate-900 tracking-tight mt-2 mb-2">
                                    Mandatory Industrial Attachment Requirements
                                </h3>
                                {eligibility?.trim() ? (
                                    <div
                                        className="eligibility-prose text-slate-800 text-sm font-semibold"
                                        dangerouslySetInnerHTML={{ __html: eligibility }}
                                        data-testid="eligibility-preview"
                                    />
                                ) : (
                                    <p className="text-xs text-slate-500 italic font-medium">
                                        Nothing to preview yet — start typing in the editor.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {eligibilityError && (
                        <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                            {eligibilityError}
                        </p>
                    )}
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={savingEligibility}
                            className="px-5 py-2 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] rounded-xl text-xs font-black transition-all shadow-sm disabled:opacity-50"
                        >
                            {savingEligibility ? 'Publishing...' : 'Publish to Landing Page'}
                        </button>
                    </div>
                </form>
            </div>

            {/* ── ATS Scoring Configuration (dashboard tier boundaries) ───────── */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="font-extrabold text-slate-900 text-base">ATS Scoring Configuration</h3>
                        <p className="text-2xs text-slate-500 font-medium mt-0.5 max-w-xl">
                            Score boundaries that separate the five quality tiers on the Admin
                            dashboard&apos;s <em>Applicant Quality Distribution &amp; Statistical
                            Dispersion Profile</em> card. Tier assignment is recomputed live from
                            existing applicant scores, so no re-scoring or redeploy is needed.
                        </p>
                    </div>
                    {atsConfig.updated_at && (
                        <div className="text-2xs text-slate-500 font-bold whitespace-nowrap text-right">
                            <div>Last updated {new Date(atsConfig.updated_at).toLocaleDateString()}</div>
                            <div className="text-2xs text-slate-400">By: {atsConfig.updated_by_name}</div>
                        </div>
                    )}
                </div>

                <form onSubmit={handleSaveAtsConfig} className="p-6 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {THRESHOLD_FIELDS.map((field) => (
                            <div key={field.name}>
                                <label
                                    htmlFor={`ats-${field.name}`}
                                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                                >
                                    {field.tier}: {field.label} — Minimum Score
                                </label>
                                <input
                                    id={`ats-${field.name}`}
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    value={atsConfig[field.name]}
                                    onChange={(e) => setAtsConfig(prev => ({ ...prev, [field.name]: e.target.value }))}
                                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                                />
                                <p className="text-2xs text-slate-500 font-medium mt-1">{field.hint}</p>
                                {atsErrors[field.name] && (
                                    <p className="text-2xs font-bold text-rose-700 mt-1">{atsErrors[field.name]}</p>
                                )}
                            </div>
                        ))}

                        <div>
                            <label
                                htmlFor="ats-qualification_benchmark"
                                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                            >
                                Qualification Benchmark
                            </label>
                            <input
                                id="ats-qualification_benchmark"
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={atsConfig.qualification_benchmark}
                                onChange={(e) => setAtsConfig(prev => ({ ...prev, qualification_benchmark: e.target.value }))}
                                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                            />
                            <p className="text-2xs text-slate-500 font-medium mt-1">
                                Share of applicants counted as qualified on the same card.
                            </p>
                            {atsErrors.qualification_benchmark && (
                                <p className="text-2xs font-bold text-rose-700 mt-1">{atsErrors.qualification_benchmark}</p>
                            )}
                        </div>
                    </div>

                    {Array.isArray(atsConfig.tier_definitions) && atsConfig.tier_definitions.length > 0 && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <span className="text-2xs font-black uppercase tracking-wider text-slate-500">
                                Resulting Tier Boundaries
                            </span>
                            <ul className="mt-2 space-y-1">
                                {atsConfig.tier_definitions.map((tier) => (
                                    <li key={tier.tier} className="text-2xs font-bold text-slate-700 font-mono">
                                        {tier.label}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {atsErrors._load && (
                        <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                            {atsErrors._load}
                        </p>
                    )}

                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={savingAts}
                            className="px-5 py-2 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] rounded-xl text-xs font-black transition-all shadow-sm disabled:opacity-50"
                        >
                            {savingAts ? 'Applying...' : 'Apply Thresholds'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Settings Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-extrabold text-slate-900 text-base">Configured Credentials & Keys</h3>
                    <span className="text-xs text-slate-500 font-bold">{settings.length} key(s) configured</span>
                </div>

                {loading ? (
                    <div className="p-16 flex justify-center items-center">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                    </div>
                ) : settings.length === 0 ? (
                    <div className="p-16 text-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <h4 className="text-base font-black text-slate-900 mb-1">No In-App Credentials Configured</h4>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                            Primary environment variables are loaded from system environment. You can configure in-app credentials above.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-black tracking-wider">
                                <tr>
                                    <th className="px-6 py-3.5">Setting Key</th>
                                    <th className="px-6 py-3.5">Category</th>
                                    <th className="px-6 py-3.5">Encrypted / Masked Value</th>
                                    <th className="px-6 py-3.5">Description</th>
                                    <th className="px-6 py-3.5">Last Updated</th>
                                    <th className="px-6 py-3.5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                                {settings.map((s) => (
                                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap font-mono font-bold text-slate-900">
                                            {s.key}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="px-2.5 py-1 rounded-full text-2xs font-black uppercase tracking-wider bg-slate-100 text-slate-700">
                                                {s.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap font-mono text-slate-600">
                                            <span className="bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-2xs font-bold">
                                                {s.masked_value || 'None'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {s.description || '—'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-slate-500 text-2xs">
                                            <div>{new Date(s.updated_at).toLocaleDateString()}</div>
                                            {s.updated_by_username && <div className="text-2xs text-slate-400">By: {s.updated_by_username}</div>}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                                            <button
                                                onClick={() => setModal({
                                                    open: true,
                                                    isEdit: true,
                                                    id: s.id,
                                                    key: s.key,
                                                    category: s.category,
                                                    description: s.description,
                                                    is_secret: s.is_secret,
                                                    raw_value: '',
                                                })}
                                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all"
                                            >
                                                Edit / Rotate
                                            </button>
                                            <button
                                                onClick={() => handleDelete(s)}
                                                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg text-xs font-bold transition-all"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal for Add / Edit */}
            {modal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animation-fade-in">
                    <form onSubmit={handleSave} className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 sm:p-8 animate-scale-up space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-base font-black text-slate-900">
                                {modal.isEdit ? `Update Credential: ${modal.key}` : 'Configure New Credential'}
                            </h3>
                            <button type="button" onClick={() => setModal(prev => ({ ...prev, open: false }))} className="text-slate-400 hover:text-slate-700 text-lg">&times;</button>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Setting Key *</label>
                            <input
                                type="text"
                                value={modal.key}
                                onChange={(e) => setModal(prev => ({ ...prev, key: e.target.value }))}
                                placeholder="e.g. SMTP_PASSWORD, RECAPTCHA_SECRET_KEY"
                                disabled={modal.isEdit}
                                required
                                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none disabled:opacity-60"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Category *</label>
                            <select
                                value={modal.category}
                                onChange={(e) => setModal(prev => ({ ...prev, category: e.target.value }))}
                                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                            >
                                <option value="CREDENTIALS">API Keys & Service Credentials</option>
                                <option value="EMAIL">SMTP & Email Configuration</option>
                                <option value="SECURITY">Security & Authentication</option>
                                <option value="GENERAL">General Settings</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                                {modal.isEdit ? 'New Secret Value (Leave blank to keep existing)' : 'Secret Value *'}
                            </label>
                            <input
                                type="password"
                                value={modal.raw_value}
                                onChange={(e) => setModal(prev => ({ ...prev, raw_value: e.target.value }))}
                                placeholder={modal.isEdit ? '••••••••••••' : 'Enter secret value to encrypt'}
                                required={!modal.isEdit}
                                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Description (Optional)</label>
                            <input
                                type="text"
                                value={modal.description}
                                onChange={(e) => setModal(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="e.g. Production email relay secret"
                                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                            />
                        </div>

                        <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setModal(prev => ({ ...prev, open: false }))}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="px-5 py-2 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] rounded-xl text-xs font-black transition-all shadow-sm disabled:opacity-50"
                            >
                                {saving ? 'Encrypting & Saving...' : 'Save Encrypted Setting'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
