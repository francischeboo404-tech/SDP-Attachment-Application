import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import PageGuideHeader from '../components/PageGuideHeader';

const PLACEHOLDER_TOKENS = [
    { token: '{{full_name}}', label: 'Attachee Full Name', sample: 'Grace Muthoni Mwangi' },
    { token: '{{department}}', label: 'Assigned Department', sample: 'Department of Petroleum Exploration' },
    { token: '{{role_or_position}}', label: 'Position / Role', sample: 'Industrial Attachee - Geophysics' },
    { token: '{{start_date}}', label: 'Start Date', sample: 'May 05, 2026' },
    { token: '{{end_date}}', label: 'Completion Date', sample: 'August 07, 2026' },
    { token: '{{issue_date}}', label: 'Issue Date', sample: 'August 08, 2026' },
    { token: '{{hr_name}}', label: 'HR Approver Name', sample: 'Dr. Evans Kiprop, HSC' },
    { token: '{{institution_name}}', label: 'University / Institution', sample: 'University of Nairobi' },
];

export default function LetterTemplates() {
    const userRole = useAuthStore(state => state.user?.role);
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);

    // Generated Letters State
    const [generatedLetters, setGeneratedLetters] = useState([]);
    const [lettersLoading, setLettersLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('templates'); // 'templates' | 'letters'

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        body: '',
        is_default: false,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [notification, setNotification] = useState('');
    const [downloadingId, setDownloadingId] = useState(null);

    // Letter Preview Modal
    const [previewLetter, setPreviewLetter] = useState(null);

    const textareaRef = useRef(null);

    useEffect(() => {
        if (['ADMIN', 'HR'].includes(userRole)) {
            fetchTemplates();
            fetchGeneratedLetters();
        } else {
            setLoading(false);
        }
    }, [userRole]);

    const fetchTemplates = async () => {
        try {
            setLoading(true);
            const res = await api.get('jobs/recommendations/templates/');
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setTemplates(data);
        } catch (err) {
            console.error('Failed to load letter templates:', err);
            setTemplates([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchGeneratedLetters = async () => {
        try {
            setLettersLoading(true);
            const res = await api.get('jobs/recommendations/');
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setGeneratedLetters(data);
        } catch (err) {
            console.error('Failed to load generated letters:', err);
            setGeneratedLetters([]);
        } finally {
            setLettersLoading(false);
        }
    };

    const openCreateModal = () => {
        setEditingTemplate(null);
        setFormData({
            name: '',
            body: (
                "STATE DEPARTMENT FOR PETROLEUM\n" +
                "MINISTRY OF ENERGY AND PETROLEUM\n\n" +
                "Date: {{issue_date}}\n\n" +
                "TO WHOM IT MAY CONCERN\n\n" +
                "RE: RECOMMENDATION FOR {{full_name}}\n\n" +
                "This is to certify that {{full_name}} from {{institution_name}} successfully completed an Industrial Attachment programme in the {{department}} as {{role_or_position}} from {{start_date}} to {{end_date}}.\n\n" +
                "During their attachment, {{full_name}} displayed high professionalism, integrity, and diligence. All institutional obligations and departmental requirements were fulfilled in accordance with public service standards.\n\n" +
                "We recommend {{full_name}} for future opportunities.\n\n" +
                "Sincerely,\n\n" +
                "{{hr_name}}\n" +
                "Department of Human Resource Management\n" +
                "State Department for Petroleum"
            ),
            is_default: false,
        });
        setIsModalOpen(true);
    };

    const openEditModal = (template) => {
        setEditingTemplate(template);
        setFormData({
            name: template.name,
            body: template.body,
            is_default: template.is_default,
        });
        setIsModalOpen(true);
    };

    const insertToken = (token) => {
        if (!textareaRef.current) {
            setFormData(prev => ({ ...prev, body: prev.body + token }));
            return;
        }

        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = formData.body;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);

        setFormData(prev => ({
            ...prev,
            body: before + token + after
        }));

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + token.length, start + token.length);
        }, 0);
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!formData.name?.trim()) {
            setNotification('');
            alert('Template name is required.');
            return;
        }
        if (!formData.body?.trim()) {
            setNotification('');
            alert('Template body is required.');
            return;
        }
        setIsSubmitting(true);
        try {
            const payload = {
                name: formData.name.trim(),
                body: formData.body,
                is_default: formData.is_default,
            };
            if (editingTemplate) {
                await api.patch(`jobs/recommendations/templates/${editingTemplate.id}/`, payload);
                setNotification('Template updated successfully!');
            } else {
                await api.post('jobs/recommendations/templates/', payload);
                setNotification('New recommendation template created!');
            }
            setIsModalOpen(false);
            fetchTemplates();
            setTimeout(() => setNotification(''), 4000);
        } catch (err) {
            console.error('Failed to save template:', err);
            const errMsg = err.response?.data
                ? (typeof err.response.data === 'object'
                    ? Object.entries(err.response.data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('; ')
                    : String(err.response.data))
                : 'Failed to save template. Please try again.';
            alert(errMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (templateId) => {
        if (!window.confirm('Are you sure you want to delete this template?')) return;
        try {
            await api.delete(`jobs/recommendations/templates/${templateId}/`);
            setNotification('Template deleted successfully.');
            fetchTemplates();
            setTimeout(() => setNotification(''), 4000);
        } catch (err) {
            console.error('Failed to delete template:', err);
            alert('Failed to delete template.');
        }
    };

    // Download DOCX
    const handleDownloadDocx = async (letterId) => {
        setDownloadingId(letterId);
        try {
            const res = await api.get(`jobs/recommendations/${letterId}/download/`, {
                responseType: 'blob',
            });
            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const disposition = res.headers['content-disposition'];
            const filenameMatch = disposition?.match(/filename="?(.+?)"?$/);
            a.download = filenameMatch ? filenameMatch[1] : `Recommendation_Letter_${letterId}.docx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            setNotification('DOCX downloaded successfully!');
            setTimeout(() => setNotification(''), 3000);
        } catch (err) {
            console.error('Failed to download DOCX:', err);
            alert('Failed to download the recommendation letter. Please try again.');
        } finally {
            setDownloadingId(null);
        }
    };

    // Print Letter
    const handlePrintLetter = (letter) => {
        const printWindow = window.open('', '_blank', 'width=800,height=1000');
        if (!printWindow) {
            alert('Pop-up blocked. Please allow pop-ups to print.');
            return;
        }
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Recommendation Letter — ${letter.applicant_name || 'Attachee'}</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Inter', 'Segoe UI', sans-serif;
                        color: #1e293b;
                        padding: 40px 50px;
                        line-height: 1.7;
                        font-size: 12pt;
                    }
                    .header {
                        text-align: center;
                        border-bottom: 3px double #003366;
                        padding-bottom: 16px;
                        margin-bottom: 24px;
                    }
                    .header h1 {
                        font-size: 16pt;
                        font-weight: 900;
                        color: #003366;
                        letter-spacing: 2px;
                        margin-bottom: 4px;
                    }
                    .header h2 {
                        font-size: 13pt;
                        font-weight: 700;
                        color: #003366;
                        margin-bottom: 3px;
                    }
                    .header h3 {
                        font-size: 11pt;
                        font-weight: 600;
                        color: #505050;
                        margin-bottom: 2px;
                    }
                    .header .subtitle {
                        font-size: 9pt;
                        font-style: italic;
                        color: #888;
                    }
                    .body-content {
                        white-space: pre-wrap;
                        text-align: justify;
                        font-size: 11pt;
                        line-height: 1.8;
                    }
                    .footer {
                        margin-top: 32px;
                        border-top: 2px solid #e2e8f0;
                        padding-top: 12px;
                        text-align: center;
                        font-size: 8pt;
                        color: #94a3b8;
                        font-style: italic;
                    }
                    .ref-no {
                        font-weight: 700;
                        color: #003366;
                        font-style: normal;
                    }
                    @media print {
                        body { padding: 20px 30px; }
                        .no-print { display: none !important; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>REPUBLIC OF KENYA</h1>
                    <h2>STATE DEPARTMENT FOR PETROLEUM</h2>
                    <h3>MINISTRY OF ENERGY AND PETROLEUM</h3>
                    <div class="subtitle">Industrial Attachment System</div>
                </div>
                <div class="body-content">${(letter.rendered_content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                <div class="footer">
                    <p>Generated on ${letter.generated_at ? new Date(letter.generated_at).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'} | Industrial Attachment System — State Department for Petroleum</p>
                    <p class="ref-no">Reference No: IAS/REC/${String(letter.id).padStart(5, '0')}/${new Date(letter.generated_at || Date.now()).getFullYear()}</p>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 400);
    };

    // Helper to render live sample preview
    const renderPreview = (body) => {
        let sample = body;
        PLACEHOLDER_TOKENS.forEach(t => {
            sample = sample.replaceAll(t.token, t.sample);
        });
        return sample;
    };

    if (!['ADMIN', 'HR'].includes(userRole)) {
        return (
            <div className="text-center p-10 font-bold text-red-500 text-xl border border-red-200 bg-red-50 rounded-2xl mx-10">
                Access Denied. HR or Admin Privileges Required.
            </div>
        );
    }

    return (
        <div className="animation-fade-in w-full max-w-7xl mx-auto space-y-6 pb-16 text-slate-900">
            {notification && (
                <div className="fixed top-20 right-4 md:right-8 z-50 bg-green-50 border-l-4 border-green-500 p-4 rounded-xl shadow-lg flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-green-800 text-sm font-bold">{notification}</p>
                </div>
            )}

            <PageGuideHeader
                title="Recommendation Letter Studio"
                subtitle="Design, configure, and manage institutional recommendation letter templates and generated letters."
                badge="Template Studio"
                workflowKey="hr-workflow"
                currentStep={5}
                roleTips={{
                    HR: "Configure official letter templates. Placeholders like {{full_name}}, {{department}}, and {{start_date}} are automatically filled when issuing recommendation letters."
                }}
                actions={
                    <button
                        onClick={openCreateModal}
                        className="bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] px-5 py-2.5 rounded-xl font-bold transition-all text-xs shadow-md flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Create New Template</span>
                    </button>
                }
            />

            {/* Tab Navigation */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit">
                <button
                    onClick={() => setActiveTab('templates')}
                    className={`px-5 py-2.5 rounded-lg text-xs font-extrabold transition-all ${
                        activeTab === 'templates'
                            ? 'bg-white text-primary-700 shadow-sm border border-primary-200'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                >
                    <span className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Letter Templates ({templates.length})
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('letters')}
                    className={`px-5 py-2.5 rounded-lg text-xs font-extrabold transition-all ${
                        activeTab === 'letters'
                            ? 'bg-white text-primary-700 shadow-sm border border-primary-200'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                >
                    <span className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                        </svg>
                        Generated Letters ({generatedLetters.length})
                    </span>
                </button>
            </div>

            {/* ═══ TEMPLATES TAB ═══ */}
            {activeTab === 'templates' && (
                <>
                    {loading ? (
                        <div className="p-20 text-center flex justify-center items-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                        </div>
                    ) : templates.length === 0 ? (
                        <div className="bg-white rounded-2xl p-16 text-center border-2 border-dashed border-slate-300">
                            <h3 className="text-xl font-black text-slate-900 mb-1.5">No Templates Configured</h3>
                            <p className="text-sm font-semibold text-slate-600 mb-6">Create your first recommendation letter template to start generating letters for cleared attachees.</p>
                            <button
                                onClick={openCreateModal}
                                className="px-6 py-3 bg-gradient-to-r from-primary-700 to-primary-600 hover:from-primary-800 hover:to-primary-700 text-white font-extrabold rounded-xl text-sm shadow-md transition-all"
                            >
                                Create Template
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {templates.map(t => (
                                <div
                                    key={t.id}
                                    className={`bg-white rounded-2xl p-7 border shadow-sm flex flex-col justify-between transition-all hover:shadow-md ${
                                        t.is_default ? 'border-primary-400 ring-2 ring-primary-200' : 'border-slate-200 hover:border-primary-300'
                                    }`}
                                >
                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-3">
                                            <h3 className="text-lg font-black text-slate-900">{t.name}</h3>
                                            {t.is_default && (
                                                <span className="text-2xs font-black uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-300 px-3 py-1 rounded-md">
                                                    Default Template
                                                </span>
                                            )}
                                        </div>

                                        <div className="bg-primary-50 p-4 rounded-xl border border-primary-100 text-xs font-mono text-slate-800 whitespace-pre-wrap line-clamp-6 leading-relaxed mb-4">
                                            {t.body}
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-xs">
                                        <span className="text-slate-600 font-bold">
                                            Updated: {new Date(t.updated_at).toLocaleDateString()}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => openEditModal(t)}
                                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold rounded-xl transition-colors border border-slate-200"
                                            >
                                                Edit
                                            </button>
                                            {!t.is_default && (
                                                <button
                                                    onClick={() => handleDelete(t.id)}
                                                    className="px-4 py-2 bg-red-50 hover:bg-red-600 hover:text-white text-red-700 font-extrabold rounded-xl transition-colors border border-red-200"
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ═══ GENERATED LETTERS TAB ═══ */}
            {activeTab === 'letters' && (
                <>
                    {lettersLoading ? (
                        <div className="p-20 text-center flex justify-center items-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                        </div>
                    ) : generatedLetters.length === 0 ? (
                        <div className="bg-white rounded-2xl p-16 text-center border-2 border-dashed border-slate-300">
                            <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <h3 className="text-xl font-black text-slate-900 mb-1.5">No Letters Generated Yet</h3>
                            <p className="text-sm font-semibold text-slate-600">Generated recommendation letters for cleared attachees will appear here with download and print options.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 flex items-center justify-between">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                                    Issued Recommendation Letters
                                </h3>
                                <span className="text-xs font-bold text-slate-500">
                                    {generatedLetters.length} letter(s) on record
                                </span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="text-left py-3 px-4 font-black text-slate-700 uppercase tracking-wider">#</th>
                                            <th className="text-left py-3 px-4 font-black text-slate-700 uppercase tracking-wider">Attachee Name</th>
                                            <th className="text-left py-3 px-4 font-black text-slate-700 uppercase tracking-wider">Department</th>
                                            <th className="text-left py-3 px-4 font-black text-slate-700 uppercase tracking-wider">Position</th>
                                            <th className="text-left py-3 px-4 font-black text-slate-700 uppercase tracking-wider">Template Used</th>
                                            <th className="text-left py-3 px-4 font-black text-slate-700 uppercase tracking-wider">Generated By</th>
                                            <th className="text-left py-3 px-4 font-black text-slate-700 uppercase tracking-wider">Date</th>
                                            <th className="text-center py-3 px-4 font-black text-slate-700 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {generatedLetters.map((letter, idx) => (
                                            <tr key={letter.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="py-3 px-4 font-bold text-slate-500">{idx + 1}</td>
                                                <td className="py-3 px-4 font-bold text-slate-900">{letter.applicant_name || 'N/A'}</td>
                                                <td className="py-3 px-4 text-slate-700 font-semibold">{letter.department_name || 'N/A'}</td>
                                                <td className="py-3 px-4 text-slate-700 font-semibold">{letter.job_title || 'N/A'}</td>
                                                <td className="py-3 px-4">
                                                    <span className="px-2 py-0.5 bg-primary-50 text-primary-800 rounded-md font-bold border border-primary-200">
                                                        {letter.template_name || 'Standard'}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-slate-600 font-semibold">{letter.generated_by_name || 'System'}</td>
                                                <td className="py-3 px-4 text-slate-600 font-semibold">
                                                    {letter.generated_at ? new Date(letter.generated_at).toLocaleDateString('en-KE', {
                                                        year: 'numeric', month: 'short', day: 'numeric'
                                                    }) : 'N/A'}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        {/* Preview */}
                                                        <button
                                                            onClick={() => setPreviewLetter(letter)}
                                                            title="Preview Letter"
                                                            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border border-slate-200"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                            </svg>
                                                        </button>
                                                        {/* Download DOCX */}
                                                        <button
                                                            onClick={() => handleDownloadDocx(letter.id)}
                                                            disabled={downloadingId === letter.id}
                                                            title="Download as DOCX"
                                                            className="p-2 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 rounded-lg transition-colors border border-blue-200 disabled:opacity-50"
                                                        >
                                                            {downloadingId === letter.id ? (
                                                                <div className="w-4 h-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                                                            ) : (
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                        {/* Print */}
                                                        <button
                                                            onClick={() => handlePrintLetter(letter)}
                                                            title="Print Letter"
                                                            className="p-2 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 rounded-lg transition-colors border border-emerald-200"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ═══ TEMPLATE EDITOR MODAL ═══ */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animation-fade-in overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8 border-t-8 border-t-primary-600 overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-200 shrink-0 bg-primary-50">
                            <div>
                                <h3 className="text-xl font-black text-slate-900">
                                    {editingTemplate ? 'Edit Recommendation Template' : 'Create Recommendation Template'}
                                </h3>
                                <p className="text-xs font-semibold text-slate-600">Insert placeholder tokens to automate dynamic letter rendering.</p>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-500 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                            <div className="p-6 overflow-y-auto space-y-5 flex-1">
                                <div>
                                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                                        Template Name *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. Official Ministry Recommendation Letter"
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-600"
                                    />
                                </div>

                                {/* Clickable Token Chips */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                                        Available Dynamic Tokens (Click to insert):
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {PLACEHOLDER_TOKENS.map(t => (
                                            <button
                                                key={t.token}
                                                type="button"
                                                onClick={() => insertToken(t.token)}
                                                className="px-3 py-1.5 bg-primary-50 hover:bg-primary-800 text-primary-900 hover:text-white border border-primary-300 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 group shadow-sm"
                                                title={`Sample value: ${t.sample}`}
                                            >
                                                <span className="font-mono">{t.token}</span>
                                                <span className="text-2xs opacity-80 font-medium">({t.label})</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {/* Textarea Editor */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                                            Template Body (Raw with tokens) *
                                        </label>
                                        <textarea
                                            ref={textareaRef}
                                            rows="12"
                                            required
                                            value={formData.body}
                                            onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-mono font-medium text-slate-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-600 leading-relaxed"
                                        />
                                    </div>

                                    {/* Live Preview */}
                                    <div>
                                        <label className="block text-xs font-black text-emerald-800 uppercase tracking-wider mb-1.5">
                                            Live Sample Preview (Simulated):
                                        </label>
                                        <div className="w-full bg-slate-900 text-slate-100 rounded-xl p-4 text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-[290px] overflow-y-auto border border-slate-800">
                                            {renderPreview(formData.body)}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2.5 pt-2">
                                    <input
                                        type="checkbox"
                                        id="is_default_tmpl"
                                        checked={formData.is_default}
                                        onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                                        className="w-4 h-4 text-primary-600 rounded border-slate-300 focus:ring-primary-500 cursor-pointer"
                                    />
                                    <label htmlFor="is_default_tmpl" className="text-sm font-extrabold text-slate-800 cursor-pointer">
                                        Set as default recommendation letter template
                                    </label>
                                </div>
                            </div>

                            <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-5 py-2.5 bg-slate-200 text-slate-800 rounded-xl font-extrabold text-sm hover:bg-slate-300 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-6 py-2.5 bg-gradient-to-r from-primary-700 to-primary-600 hover:from-primary-800 hover:to-primary-700 text-white rounded-xl font-extrabold text-sm shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isSubmitting && (
                                        <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                    )}
                                    {isSubmitting ? 'Saving...' : 'Save Template'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ═══ LETTER PREVIEW MODAL ═══ */}
            {previewLetter && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animation-fade-in overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8 border-t-8 border-t-primary-600 overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 shrink-0 bg-primary-50">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Letter Preview</h3>
                                <p className="text-xs font-semibold text-slate-600">
                                    {previewLetter.applicant_name} — {previewLetter.department_name}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleDownloadDocx(previewLetter.id)}
                                    disabled={downloadingId === previewLetter.id}
                                    className="px-4 py-2 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 font-extrabold rounded-xl transition-colors border border-blue-200 text-xs flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Download DOCX
                                </button>
                                <button
                                    onClick={() => handlePrintLetter(previewLetter)}
                                    className="px-4 py-2 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 font-extrabold rounded-xl transition-colors border border-emerald-200 text-xs flex items-center gap-1.5"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                    </svg>
                                    Print
                                </button>
                                <button
                                    onClick={() => setPreviewLetter(null)}
                                    className="text-slate-500 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="border border-slate-200 rounded-xl p-8 bg-[#FFFDF8] shadow-inner">
                                {/* Letter Header */}
                                <div className="text-center border-b-2 border-primary-600 pb-4 mb-6">
                                    <h2 className="text-base font-black text-primary-900 tracking-widest">REPUBLIC OF KENYA</h2>
                                    <h3 className="text-sm font-bold text-primary-800">STATE DEPARTMENT FOR PETROLEUM</h3>
                                    <p className="text-xs font-semibold text-slate-600">MINISTRY OF ENERGY AND PETROLEUM</p>
                                    <p className="text-2xs italic text-slate-500 mt-1">Industrial Attachment System</p>
                                </div>
                                {/* Letter Body */}
                                <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-medium">
                                    {previewLetter.rendered_content}
                                </div>
                                {/* Letter Footer */}
                                <div className="mt-8 pt-4 border-t border-slate-300 text-center">
                                    <p className="text-2xs text-slate-400 italic">
                                        Generated on {new Date(previewLetter.generated_at).toLocaleDateString('en-KE', {
                                            year: 'numeric', month: 'long', day: 'numeric'
                                        })} | Industrial Attachment System — State Department for Petroleum
                                    </p>
                                    <p className="text-2xs font-bold text-primary-700 mt-1">
                                        Reference No: IAS/REC/{String(previewLetter.id).padStart(5, '0')}/{new Date(previewLetter.generated_at || Date.now()).getFullYear()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
