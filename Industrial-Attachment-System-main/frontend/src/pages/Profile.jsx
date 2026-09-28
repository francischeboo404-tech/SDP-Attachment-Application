import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import useDashboardStore from '../store/dashboardStore';
import PageGuideHeader from '../components/PageGuideHeader';
import { minStartDate, startDateError } from '../utils/dateGuards';

// The ten mandatory verification documents. TRANSCRIPT and GOOD_CONDUCT
// replaced KRA_PIN. This mirrors REQUIRED_DOCUMENTS in backend/jobs/views.py,
// which is also what the ATS document score is computed against; the backend
// performs an authoritative check on submission regardless of this list.
const ALL_REQUIRED_DOC_TYPES = [
    'NATIONAL_ID',
    'RESUME',
    'COVER_LETTER',
    'INSTITUTION_INTRO',
    'STUDENT_INSURANCE',
    'STUDENT_ID',
    'TRANSCRIPT',
    'GOOD_CONDUCT',
    'PASSPORT_PHOTOS',
    'NEXT_OF_KIN_ID',
];

const STANDARD_DOCUMENTS = [
    { type: 'NATIONAL_ID', label: 'Copy of National ID Card', desc: 'Scanned copy of both sides of your National Identity Card (PDF)' },
    { type: 'RESUME', label: 'Curriculum Vitae (CV)', desc: 'Updated professional CV highlighting skills, coursework & projects (PDF)' },
    { type: 'COVER_LETTER', label: 'Application Letter', desc: 'Formal application letter addressed to the Principal Secretary (PDF)' },
    { type: 'INSTITUTION_INTRO', label: 'Introductory Letter from the Institution', desc: 'Official letter from your university/college requesting attachment (PDF)' },
    { type: 'STUDENT_INSURANCE', label: 'Student Insurance Cover', desc: 'Valid personal accident insurance cover policy or certificate (PDF)' },
    { type: 'STUDENT_ID', label: 'Copy of Student ID Card', desc: 'Valid student ID card from your registered tertiary institution (PDF)' },
    { type: 'TRANSCRIPT', label: 'Transcripts', desc: 'Official academic transcript(s) issued by your tertiary institution (PDF)' },
    { type: 'GOOD_CONDUCT', label: 'Certificate of Good Conduct', desc: 'Police-issued certificate of good conduct, dated within the last 12 months (PDF)' },
    { type: 'PASSPORT_PHOTOS', label: 'Passport Photo (PDF)', desc: 'Recent colour passport-sized photographs compiled in PDF' },
];

const DOC_LABELS = {
    NATIONAL_ID: 'National ID Card (PDF)',
    RESUME: 'Curriculum Vitae (CV) / Resume (PDF)',
    COVER_LETTER: 'Cover Letter / Statement of Purpose (PDF)',
    INSTITUTION_INTRO: 'Institutional Recommendation Letter (PDF)',
    STUDENT_INSURANCE: 'Student Insurance Cover (PDF)',
    STUDENT_ID: 'Student Identity Card (PDF)',
    TRANSCRIPT: 'Transcripts (PDF)',
    GOOD_CONDUCT: 'Certificate of Good Conduct (PDF)',
    PASSPORT_PHOTOS: 'Two Colour Passport Photos (PDF)',
    NEXT_OF_KIN_ID: 'Copy of Next of Kin National ID (PDF)',
};

// Validation helpers
const isEmailValid = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email?.trim() || '');
const isPhoneValid = (phone) => {
    if (!phone) return false;
    const clean = phone.replace(/[\s\-()]/g, '');
    return /^(?:\+?254|0)?[17]\d{8}$/.test(clean) || (clean.length >= 9 && clean.length <= 15);
};
const isIdValid = (id) => !!id && id.trim().length >= 4;
const isDateValid = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return !isNaN(d.getTime());
};
const isDobValid = (dobStr) => {
    if (!dobStr) return false;
    const d = new Date(dobStr);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    const age = (now - d) / (1000 * 60 * 60 * 24 * 365.25);
    return age >= 15 && age <= 100;
};

export default function Profile() {
    const navigate = useNavigate();
    // 4-Step Stepper:
    // Step 1: Personal Details
    // Step 2: Academic Details
    // Step 3: Emergency Contact Details (Next of Kin)
    // Step 4: Verification Documents (10 PDFs)
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingType, setUploadingType] = useState(null);
    const [message, setMessage] = useState(null);

    // Validation & Submission Pop-up Alert State
    const [validationModal, setValidationModal] = useState({
        isOpen: false,
        status: 'idle', // 'incomplete' | 'success'
        missingStep1: [],
        missingStep2: [],
        missingStep3: [],
        missingDocs: [],
        message: ''
    });

    const [profile, setProfile] = useState({
        first_name: '',
        middle_name: '',
        last_name: '',
        email: '',
        dob: '',
        gender: '',
        marital_status: '',
        id_number: '',
        phone_number: '',
        postal_address: '',
        nationality: 'Kenyan',
        county_of_residence: '',
        kra_pin: '',
        institution_name: '',
        qualification: '',
        field_of_study: '',
        joining_date: '',
        next_of_kin_name: '',
        next_of_kin_relationship: '',
        next_of_kin_phone: '',
        next_of_kin_address: '',
    });
    const [documents, setDocuments] = useState([]);

    const fetchData = useCallback(async () => {
        try {
            const [profRes, docRes] = await Promise.all([
                api.get('accounts/profile/').catch(() => ({ data: {} })),
                api.get('accounts/documents/').catch(() => ({ data: [] }))
            ]);
            if (profRes.data) {
                setProfile(prev => ({ ...prev, ...profRes.data }));
            }
            const docsData = Array.isArray(docRes.data) ? docRes.data : (docRes.data?.results || []);
            setDocuments(docsData);
        } catch (err) {
            console.error('Failed to load profile data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleProfileChange = (e) => {
        const { name, value } = e.target;
        setProfile(prev => ({ ...prev, [name]: value }));
    };

    // Step 1 Validation: Personal Details
    const getMissingStep1 = useCallback(() => {
        const missing = [];
        if (!profile.first_name?.trim() || profile.first_name.trim().length < 2) missing.push('First Name (at least 2 letters)');
        if (!profile.last_name?.trim() || profile.last_name.trim().length < 2) missing.push('Last Name (at least 2 letters)');
        if (!isEmailValid(profile.email)) missing.push('Valid Email Address');
        if (!isPhoneValid(profile.phone_number)) missing.push('Valid Mobile Phone Number (e.g. 0712345678)');
        if (!isIdValid(profile.id_number)) missing.push('National ID / Passport Number');
        if (!isDobValid(profile.dob)) missing.push('Valid Date of Birth (must be at least 15 years ago)');
        if (!profile.gender) missing.push('Gender Selection');
        if (!profile.nationality?.trim()) missing.push('Nationality');
        if (!profile.postal_address?.trim()) missing.push('Postal Address');
        return missing;
    }, [profile]);

    // Step 2 Validation: Academic Details
    // A backdated start date is reported as a specific, actionable problem
    // rather than lumped in with "missing", because the field is filled in and
    // the user needs to be told what is wrong with the value, not that it is
    // absent.
    const joiningDateError = useMemo(
        () => startDateError(profile.joining_date, 'Intended attachment start date'),
        [profile.joining_date]
    );

    const getMissingStep2 = useCallback(() => {
        const missing = [];
        if (!profile.institution_name?.trim()) missing.push('Institution / University Name');
        if (!profile.qualification?.trim()) missing.push('Pursued Qualification');
        if (!profile.field_of_study?.trim()) missing.push('Field of Study / Course');
        if (!isDateValid(profile.joining_date)) missing.push('Intended Attachment Start Date');
        else if (joiningDateError) missing.push(joiningDateError);
        return missing;
    }, [profile, joiningDateError]);

    // Step 3 Validation: Emergency Contact Details (Next of Kin)
    const getMissingStep3 = useCallback(() => {
        const missing = [];
        if (!profile.next_of_kin_name?.trim()) missing.push('Next of Kin Full Name');
        if (!profile.next_of_kin_relationship?.trim()) missing.push('Relationship to Next of Kin');
        if (!isPhoneValid(profile.next_of_kin_phone)) missing.push('Valid Next of Kin Mobile Phone');
        if (!profile.next_of_kin_address?.trim()) missing.push('Next of Kin Postal / Physical Address');
        return missing;
    }, [profile]);

    // Step 4 Validation: 10 Required Documents
    const uploadedTypes = new Set(documents.map(d => d.document_type));
    const missingDocs = ALL_REQUIRED_DOC_TYPES
        .filter(type => !uploadedTypes.has(type))
        .map(type => DOC_LABELS[type] || type);

    const missingStep1 = getMissingStep1();
    const isStep1Valid = missingStep1.length === 0;

    const missingStep2 = getMissingStep2();
    const isStep2Valid = missingStep2.length === 0;

    const missingStep3 = getMissingStep3();
    const isStep3Valid = missingStep3.length === 0;

    const isStep4Valid = missingDocs.length === 0;
    const isEntireProfileValid = isStep1Valid && isStep2Valid && isStep3Valid && isStep4Valid;

    // Save Draft: Saves entire in-progress application across all steps
    const saveDraft = async (silent = false) => {
        setSaving(true);
        if (!silent) setMessage(null);
        try {
            const res = await api.patch('accounts/profile/', profile);
            setProfile(prev => ({ ...prev, ...res.data }));
            if (!silent) {
                setMessage({ type: 'success', text: "Draft progress saved across all steps successfully." });
                setTimeout(() => setMessage(null), 3500);
            }
            await useDashboardStore.getState().fetchStats?.();
            return true;
        } catch (error) {
            console.error('Failed to save profile draft:', error);
            const errDetail = error.response?.data ? (typeof error.response.data === 'object' ? Object.values(error.response.data).flat().join(', ') : JSON.stringify(error.response.data)) : 'Failed to save draft.';
            if (!silent) {
                setMessage({ type: 'error', text: errDetail });
            }
            return false;
        } finally {
            setSaving(false);
        }
    };

    // Step Navigation Handlers
    const handleNextFromStep1 = async (e) => {
        if (e) e.preventDefault();
        if (!isStep1Valid) {
            setValidationModal({
                isOpen: true,
                status: 'incomplete',
                missingStep1,
                missingStep2: [],
                missingStep3: [],
                missingDocs: [],
                message: `Please complete and correct the following ${missingStep1.length} required Personal Details field(s) before proceeding to Academic Details:`
            });
            return;
        }
        const saved = await saveDraft(true);
        if (saved) {
            setCurrentStep(2);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleNextFromStep2 = async (e) => {
        if (e) e.preventDefault();
        if (!isStep2Valid) {
            setValidationModal({
                isOpen: true,
                status: 'incomplete',
                missingStep1: [],
                missingStep2,
                missingStep3: [],
                missingDocs: [],
                message: `Please complete and correct the following ${missingStep2.length} required Academic Details field(s) before proceeding to Emergency Contact Particulars:`
            });
            return;
        }
        const saved = await saveDraft(true);
        if (saved) {
            setCurrentStep(3);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleNextFromStep3 = async (e) => {
        if (e) e.preventDefault();
        if (!isStep3Valid) {
            setValidationModal({
                isOpen: true,
                status: 'incomplete',
                missingStep1: [],
                missingStep2: [],
                missingStep3,
                missingDocs: [],
                message: `Please complete and correct the following ${missingStep3.length} required Emergency Contact field(s) before proceeding to Verification Documents:`
            });
            return;
        }
        const saved = await saveDraft(true);
        if (saved) {
            setCurrentStep(4);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleStepTabClick = async (targetStep) => {
        if (targetStep === currentStep) return;
        // Allow moving backward without gating
        if (targetStep < currentStep) {
            await saveDraft(true);
            setCurrentStep(targetStep);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        // Gating for forward jumps:
        if (targetStep >= 2 && !isStep1Valid) {
            setValidationModal({
                isOpen: true,
                status: 'incomplete',
                missingStep1,
                missingStep2: [],
                missingStep3: [],
                missingDocs: [],
                message: 'Please complete Step 1 (Personal Details) before proceeding.'
            });
            return;
        }
        if (targetStep >= 3 && !isStep2Valid) {
            setValidationModal({
                isOpen: true,
                status: 'incomplete',
                missingStep1: [],
                missingStep2,
                missingStep3: [],
                missingDocs: [],
                message: 'Please complete Step 2 (Academic Details) before proceeding.'
            });
            return;
        }
        if (targetStep >= 4 && !isStep3Valid) {
            setValidationModal({
                isOpen: true,
                status: 'incomplete',
                missingStep1: [],
                missingStep2: [],
                missingStep3,
                missingDocs: [],
                message: 'Please complete Step 3 (Emergency Contact Details) before proceeding.'
            });
            return;
        }

        await saveDraft(true);
        setCurrentStep(targetStep);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Step 4 Final Submission (The single official submit button)
    const handleFinalSubmit = async (e) => {
        if (e) e.preventDefault();
        setSaving(true);
        setMessage(null);

        const curMissingStep1 = getMissingStep1();
        const curMissingStep2 = getMissingStep2();
        const curMissingStep3 = getMissingStep3();
        const curUploadedTypes = new Set(documents.map(d => d.document_type));
        const curMissingDocs = ALL_REQUIRED_DOC_TYPES
            .filter(type => !curUploadedTypes.has(type))
            .map(type => DOC_LABELS[type] || type);

        const totalMissing = curMissingStep1.length + curMissingStep2.length + curMissingStep3.length + curMissingDocs.length;

        if (totalMissing > 0) {
            try {
                await api.patch('accounts/profile/', profile);
                await useDashboardStore.getState().fetchStats?.();
            } catch (err) {
                console.error('Failed to auto-save partial profile:', err);
            }
            setSaving(false);
            setValidationModal({
                isOpen: true,
                status: 'incomplete',
                missingStep1: curMissingStep1,
                missingStep2: curMissingStep2,
                missingStep3: curMissingStep3,
                missingDocs: curMissingDocs,
                message: `You have ${totalMissing} outstanding requirement(s). Please complete all fields and upload all 10 documents to finalize submission.`
            });
            return;
        }

        // All 4 steps valid and complete
        try {
            const res = await api.patch('accounts/profile/', profile);
            setProfile(prev => ({ ...prev, ...res.data }));
            await useDashboardStore.getState().fetchStats?.();
            setValidationModal({
                isOpen: true,
                status: 'success',
                missingStep1: [],
                missingStep2: [],
                missingStep3: [],
                missingDocs: [],
                message: 'All 4 sections (Personal Details, Academic Details, Emergency Contact Particulars, and 10 Verification Documents) are completely verified and saved. Your profile is now eligible for open Industrial Attachment vacancies.'
            });
        } catch (error) {
            console.error('Failed to finalize profile submission:', error);
            const errDetail = error.response?.data ? (typeof error.response.data === 'object' ? Object.values(error.response.data).flat().join(', ') : JSON.stringify(error.response.data)) : 'Failed to finalize profile submission.';
            setMessage({ type: 'error', text: errDetail });
        } finally {
            setSaving(false);
        }
    };

    // Document Upload & Delete Handlers
    // Per-document-type max file sizes are owned by the backend
    // (accounts/document_limits.py) and fetched from
    // /api/accounts/document-limits/. The fallback below only covers the
    // render before that request resolves, and mirrors the server's
    // DEFAULT_MAX_BYTES (2 MB) rather than a previously divergent 10 MB, so
    // the browser can never be more permissive than the API.
    const [docLimits, setDocLimits] = useState({});

    useEffect(() => {
        let cancelled = false;
        api.get('accounts/document-limits/')
            .then(res => {
                if (!cancelled) setDocLimits(res?.data?.limits || {});
            })
            .catch(() => {
                // Non-fatal: the fallback limits keep the form usable and the
                // server still enforces the real per-type cap on upload.
                if (!cancelled) setDocLimits({});
            });
        return () => { cancelled = true; };
    }, []);

    const MAX_FILE_SIZES = docLimits;

    const maxSizeFor = (document_type) =>
        MAX_FILE_SIZES[document_type]?.max_bytes ?? 2 * 1024 * 1024;

    const maxSizeLabelFor = (document_type) =>
        MAX_FILE_SIZES[document_type]?.label ?? 'Max 2MB';

    const formatFileSize = (bytes) => {
        // A GB tier is required: without it a 2 GB document displayed as
        // "2048.0 MB", which reads as a mistake rather than as a large file.
        if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };

    const handleFileUpload = async (document_type, file) => {
        if (!file) return;

        // PDF-only validation
        if (file.type !== 'application/pdf') {
            setMessage({
                type: 'error',
                text: `Invalid file format for ${(DOC_LABELS[document_type] || document_type).replace(/ \(PDF\)$/i, '')}. Only PDF documents (.pdf) are accepted.`
            });
            setTimeout(() => setMessage(null), 5000);
            return;
        }

        // Per-document-type size validation, using the server-enforced limit.
        const maxSize = maxSizeFor(document_type);
        const maxSizeLabel = maxSizeLabelFor(document_type);
        if (file.size > maxSize) {
            setMessage({
                type: 'error',
                text: `File "${file.name}" (${formatFileSize(file.size)}) exceeds the maximum allowed size of ${maxSizeLabel} for ${(DOC_LABELS[document_type] || document_type).replace(/ \(PDF\)$/i, '')}. Please compress or reduce the file size and try again.`
            });
            setTimeout(() => setMessage(null), 6000);
            return;
        }

        // Minimum size check (reject empty/corrupt PDFs)
        if (file.size < 1024) {
            setMessage({
                type: 'error',
                text: `File "${file.name}" appears to be empty or corrupted (${formatFileSize(file.size)}). Please upload a valid PDF document.`
            });
            setTimeout(() => setMessage(null), 5000);
            return;
        }

        setUploadingType(document_type);
        const formData = new FormData();
        formData.append('document_type', document_type);
        formData.append('file', file);

        try {
            const existing = documents.find(d => d.document_type === document_type);
            if (existing) {
                await api.delete(`accounts/documents/${existing.id}/`);
            }
            const res = await api.post('accounts/documents/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setDocuments(prev => [...prev.filter(d => d.document_type !== document_type), res.data]);
            setMessage({ type: 'success', text: `${(DOC_LABELS[document_type] || document_type).replace(/ \(PDF\)$/i, '')} uploaded and verified successfully (${formatFileSize(file.size)}).` });
            await useDashboardStore.getState().fetchStats?.();
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error(error);
            const errDetail = error.response?.data
                ? (typeof error.response.data === 'object'
                    ? Object.values(error.response.data).flat().join(', ')
                    : String(error.response.data))
                : `Document upload failed. Please verify that "${file.name}" is a valid PDF under ${maxSizeLabel}.`;
            setMessage({ type: 'error', text: errDetail });
            setTimeout(() => setMessage(null), 5000);
        } finally {
            setUploadingType(null);
        }
    };

    const handleDeleteDoc = async (docId, docType) => {
        if (!window.confirm(`Are you sure you want to remove this ${docType.replace(/_/g, ' ')}?`)) return;
        try {
            await api.delete(`accounts/documents/${docId}/`);
            setDocuments(prev => prev.filter(d => d.id !== docId));
            await useDashboardStore.getState().fetchStats?.();
        } catch (error) {
            console.error(error);
            alert('Failed to remove document.');
        }
    };

    // Computed Attachment End Date helper (approx 3 months / 90 days after joining_date)
    const getComputedEndDate = () => {
        if (!profile.joining_date) return 'Calculated upon start date selection (3 Months)';
        const d = new Date(profile.joining_date);
        if (isNaN(d.getTime())) return 'Invalid start date';
        const end = new Date(d);
        end.setMonth(end.getMonth() + 3);
        return end.toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    const nextOfKinDoc = documents.find(d => d.document_type === 'NEXT_OF_KIN_ID');

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-7xl mx-auto space-y-6 pb-20 animation-fade-in text-slate-900">
            {/* Hero Header Block */}
            <div className="space-y-4">
                <PageGuideHeader
                    title="Student's Biodata & Verification Documents"
                    subtitle="Complete your personal student identification, university academic enrollment, emergency contact particulars, and required verification documents."
                    badge="Multi-Step Dossier"
                    workflowKey="attachee-journey"
                    currentStep={currentStep}
                    className="mb-3"
                    roleTips={{
                        APPLICANT: "Step 1: Personal Details • Step 2: Academic Details • Step 3: Emergency Contact • Step 4: Verification Documents (10 mandatory PDFs). Gating ensures authoritative ATS verification."
                    }}
                />

                {/* 4-Step Stepper Navigation Card */}
                <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm p-2 sm:p-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {/* Step 1 Tab */}
                        <button
                            type="button"
                            onClick={() => handleStepTabClick(1)}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-3.5 rounded-xl md:rounded-2xl transition-all text-left ${
                                currentStep === 1
                                    ? 'bg-gradient-to-r from-primary-700 to-primary-600 text-white shadow-md ring-2 ring-primary-400/40'
                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                        >
                            <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                                    currentStep === 1 ? 'bg-white text-primary-800' : (isStep1Valid ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700')
                                }`}>
                                    {isStep1Valid ? '✓' : '1'}
                                </div>
                                <div className="truncate">
                                    <div className="text-2xs font-black uppercase tracking-wider opacity-80">Step 1</div>
                                    <div className="text-xs sm:text-sm font-extrabold truncate">Personal Details</div>
                                </div>
                            </div>
                            <span className={`mt-1.5 sm:mt-0 self-start sm:self-center text-2xs font-black px-2 py-1 rounded-full ${
                                currentStep === 1
                                    ? 'bg-white/20 text-white'
                                    : (isStep1Valid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900')
                            }`}>
                                {isStep1Valid ? 'Done' : `${missingStep1.length} Left`}
                            </span>
                        </button>

                        {/* Step 2 Tab */}
                        <button
                            type="button"
                            onClick={() => handleStepTabClick(2)}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-3.5 rounded-xl md:rounded-2xl transition-all text-left ${
                                currentStep === 2
                                    ? 'bg-gradient-to-r from-primary-700 to-primary-600 text-white shadow-md ring-2 ring-primary-400/40'
                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                        >
                            <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                                    currentStep === 2 ? 'bg-white text-primary-800' : (isStep2Valid ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700')
                                }`}>
                                    {isStep2Valid ? '✓' : '2'}
                                </div>
                                <div className="truncate">
                                    <div className="text-2xs font-black uppercase tracking-wider opacity-80">Step 2</div>
                                    <div className="text-xs sm:text-sm font-extrabold truncate">Academic Details</div>
                                </div>
                            </div>
                            <span className={`mt-1.5 sm:mt-0 self-start sm:self-center text-2xs font-black px-2 py-1 rounded-full ${
                                currentStep === 2
                                    ? 'bg-white/20 text-white'
                                    : (isStep2Valid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900')
                            }`}>
                                {isStep2Valid ? 'Done' : `${missingStep2.length} Left`}
                            </span>
                        </button>

                        {/* Step 3 Tab */}
                        <button
                            type="button"
                            onClick={() => handleStepTabClick(3)}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-3.5 rounded-xl md:rounded-2xl transition-all text-left ${
                                currentStep === 3
                                    ? 'bg-gradient-to-r from-primary-700 to-primary-600 text-white shadow-md ring-2 ring-primary-400/40'
                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                        >
                            <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                                    currentStep === 3 ? 'bg-white text-primary-800' : (isStep3Valid ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700')
                                }`}>
                                    {isStep3Valid ? '✓' : '3'}
                                </div>
                                <div className="truncate">
                                    <div className="text-2xs font-black uppercase tracking-wider opacity-80">Step 3</div>
                                    <div className="text-xs sm:text-sm font-extrabold truncate">Emergency Contact</div>
                                </div>
                            </div>
                            <span className={`mt-1.5 sm:mt-0 self-start sm:self-center text-2xs font-black px-2 py-1 rounded-full ${
                                currentStep === 3
                                    ? 'bg-white/20 text-white'
                                    : (isStep3Valid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900')
                            }`}>
                                {isStep3Valid ? 'Done' : `${missingStep3.length} Left`}
                            </span>
                        </button>

                        {/* Step 4 Tab */}
                        <button
                            type="button"
                            onClick={() => handleStepTabClick(4)}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-3.5 rounded-xl md:rounded-2xl transition-all text-left ${
                                currentStep === 4
                                    ? 'bg-gradient-to-r from-primary-700 to-primary-600 text-white shadow-md ring-2 ring-primary-400/40'
                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                        >
                            <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                                    currentStep === 4 ? 'bg-white text-primary-800' : (isStep4Valid ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700')
                                }`}>
                                    {isStep4Valid ? '✓' : '4'}
                                </div>
                                <div className="truncate">
                                    <div className="text-2xs font-black uppercase tracking-wider opacity-80">Step 4</div>
                                    <div className="text-xs sm:text-sm font-extrabold truncate">Documents (10)</div>
                                </div>
                            </div>
                            <span className={`mt-1.5 sm:mt-0 self-start sm:self-center text-2xs font-black px-2 py-1 rounded-full ${
                                currentStep === 4
                                    ? 'bg-white/20 text-white'
                                    : (isStep4Valid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900')
                            }`}>
                                {uploadedTypes.size}/{ALL_REQUIRED_DOC_TYPES.length} Uploaded
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Notification Toast */}
            {message && (
                <div className={`p-4 rounded-2xl flex items-center gap-3 border shadow-sm ${
                    message.type === 'success' ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'
                }`}>
                    {message.type === 'success' ? (
                        <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5 text-rose-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    )}
                    <span className="text-xs font-bold">{message.text}</span>
                </div>
            )}

            {/* STEP 1: Personal Details */}
            {currentStep === 1 && (
                <form className="space-y-6" onSubmit={handleNextFromStep1}>
                    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="border-b border-slate-100 pb-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <h3 className="text-xl font-black text-slate-900">Step 1: Personal Identification & Contact Particulars</h3>
                                <p className="text-slate-500 text-xs font-medium mt-0.5">Applicant legal names, national identification, contact address and vital demographics</p>
                            </div>
                            <span className="self-start sm:self-auto text-xs font-bold bg-primary-100 text-primary-900 px-3 py-1 rounded-full border border-primary-300">
                                Step 1 of 4
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">First Name <span className="text-rose-600">*</span></label>
                                <input
                                    type="text"
                                    name="first_name"
                                    value={profile.first_name || ''}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. John"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Middle Name</label>
                                <input
                                    type="text"
                                    name="middle_name"
                                    value={profile.middle_name || ''}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. Kiprop (Optional)"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Last Name <span className="text-rose-600">*</span></label>
                                <input
                                    type="text"
                                    name="last_name"
                                    value={profile.last_name || ''}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. Mwangi"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Email Address <span className="text-rose-600">*</span></label>
                                <input
                                    type="email"
                                    name="email"
                                    value={profile.email || ''}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. john.doe@university.ac.ke"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Mobile Phone Number <span className="text-rose-600">*</span></label>
                                <input
                                    type="tel"
                                    name="phone_number"
                                    value={profile.phone_number || ''}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. 0712345678"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">National ID / Passport Number <span className="text-rose-600">*</span></label>
                                <input
                                    type="text"
                                    name="id_number"
                                    value={profile.id_number || ''}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. 12345678"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Date of Birth <span className="text-rose-600">*</span></label>
                                <input
                                    type="date"
                                    name="dob"
                                    value={profile.dob || ''}
                                    onChange={handleProfileChange}
                                    max={new Date().toISOString().split('T')[0]}
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Gender <span className="text-rose-600">*</span></label>
                                <select
                                    name="gender"
                                    value={profile.gender || ''}
                                    onChange={handleProfileChange}
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                    required
                                >
                                    <option value="">Select Gender</option>
                                    <option value="M">Male</option>
                                    <option value="F">Female</option>
                                    <option value="O">Other</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Nationality <span className="text-rose-600">*</span></label>
                                <input
                                    type="text"
                                    name="nationality"
                                    value={profile.nationality || 'Kenyan'}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. Kenyan"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Marital Status</label>
                                <select
                                    name="marital_status"
                                    value={profile.marital_status || ''}
                                    onChange={handleProfileChange}
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                >
                                    <option value="">Select Marital Status (Optional)</option>
                                    <option value="SINGLE">Single</option>
                                    <option value="MARRIED">Married</option>
                                    <option value="DIVORCED">Divorced</option>
                                    <option value="WIDOWED">Widowed</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Postal Address <span className="text-rose-600">*</span></label>
                                <input
                                    type="text"
                                    name="postal_address"
                                    value={profile.postal_address || ''}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. P.O. Box 30197 - 00100 Nairobi"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">County of Residence</label>
                                <input
                                    type="text"
                                    name="county_of_residence"
                                    value={profile.county_of_residence || ''}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. Nairobi / Kiambu / Nakuru"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">KRA PIN Number</label>
                                <input
                                    type="text"
                                    name="kra_pin"
                                    value={profile.kra_pin || ''}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. A012345678Z"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                />
                            </div>
                        </div>

                        {/* Step 1 Action Bar */}
                        <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50 p-5 sm:p-6 rounded-2xl">
                            <button
                                type="button"
                                onClick={() => saveDraft(false)}
                                disabled={saving}
                                className="w-full sm:w-auto px-6 py-3.5 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-sm border border-slate-300 shadow-sm transition-all flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                </svg>
                                <span>{saving ? 'Saving...' : 'Save Draft'}</span>
                            </button>

                            <button
                                type="submit"
                                disabled={!isStep1Valid || saving}
                                className="w-full sm:w-auto bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-[var(--color-primary-on)] px-8 py-3.5 rounded-xl font-black text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                                title={!isStep1Valid ? `Please complete all required fields (${missingStep1.length} remaining)` : 'Proceed to Step 2'}
                            >
                                <span>Next: Academic Details</span>
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {/* STEP 2: Academic & Attachment Details */}
            {currentStep === 2 && (
                <form className="space-y-6" onSubmit={handleNextFromStep2}>
                    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="border-b border-slate-100 pb-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <h3 className="text-xl font-black text-slate-900">Step 2: Tertiary Institution & Attachment Period</h3>
                                <p className="text-slate-500 text-xs font-medium mt-0.5">University enrollment particulars, pursued course of study, and intended industrial attachment timeline</p>
                            </div>
                            <span className="self-start sm:self-auto text-xs font-bold bg-primary-100 text-primary-900 px-3 py-1 rounded-full border border-primary-300">
                                Step 2 of 4
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Institution / University / College Name <span className="text-rose-600">*</span></label>
                                <input
                                    type="text"
                                    name="institution_name"
                                    value={profile.institution_name || ''}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. University of Nairobi / Strathmore University / Technical University of Kenya"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Pursued Qualification <span className="text-rose-600">*</span></label>
                                <select
                                    name="qualification"
                                    value={profile.qualification || ''}
                                    onChange={handleProfileChange}
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                    required
                                >
                                    <option value="">Select Qualification</option>
                                    <option value="Degree">Degree / Bachelor's Degree</option>
                                    <option value="Diploma">Diploma</option>
                                    <option value="Higher Diploma">Higher National Diploma</option>
                                    <option value="Certificate">Certificate</option>
                                    <option value="Postgraduate">Postgraduate Diploma</option>
                                </select>
                            </div>

                            <div className="sm:col-span-2">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Field of Study / Course Major <span className="text-rose-600">*</span></label>
                                <input
                                    type="text"
                                    name="field_of_study"
                                    value={profile.field_of_study || ''}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. BSc Computer Science / Electrical & Electronics Engineering / Petroleum Geoscience"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Intended Attachment Start Date <span className="text-rose-600">*</span></label>
                                {/* min blocks the picker from offering a past date,
                                    and the inline error catches a value typed
                                    directly or restored from a saved draft. */}
                                <input
                                    type="date"
                                    name="joining_date"
                                    min={minStartDate()}
                                    value={profile.joining_date || ''}
                                    onChange={handleProfileChange}
                                    aria-invalid={Boolean(joiningDateError)}
                                    aria-describedby={joiningDateError ? 'joining-date-error' : undefined}
                                    className={`w-full p-3.5 bg-slate-50 border rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm ${
                                        joiningDateError
                                            ? 'border-rose-400 ring-1 ring-rose-200'
                                            : 'border-slate-300'
                                    }`}
                                    required
                                />
                                {joiningDateError && (
                                    <p
                                        id="joining-date-error"
                                        role="alert"
                                        className="flex items-start gap-1.5 mt-2 text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2"
                                    >
                                        <svg className="w-3.5 h-3.5 shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span>{joiningDateError}</span>
                                    </p>
                                )}
                            </div>

                            {/* Computed Duration & End Date Card */}
                            <div className="sm:col-span-2 bg-primary-50/60 p-4 rounded-2xl border border-primary-200 flex items-center justify-between gap-4">
                                <div>
                                    <div className="text-xs font-black uppercase tracking-wider text-primary-950">Standard Attachment Timeline (3 Months)</div>
                                    <div className="text-xs text-slate-700 font-medium mt-0.5">
                                        Expected Completion Date: <strong className="text-primary-950 font-extrabold">{getComputedEndDate()}</strong>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300 shrink-0">
                                    3 Months (Full-Time)
                                </span>
                            </div>
                        </div>

                        {/* Step 2 Action Bar */}
                        <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50 p-5 sm:p-6 rounded-2xl">
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                                <button
                                    type="button"
                                    onClick={() => handleStepTabClick(1)}
                                    className="w-full sm:w-auto px-5 py-3.5 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-sm border border-slate-300 shadow-sm transition-all flex items-center justify-center gap-1.5"
                                >
                                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                                    </svg>
                                    <span>Back: Personal Details</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => saveDraft(false)}
                                    disabled={saving}
                                    className="w-full sm:w-auto px-5 py-3.5 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-sm border border-slate-300 shadow-sm transition-all flex items-center justify-center gap-1.5"
                                >
                                    <span>{saving ? 'Saving...' : 'Save Draft'}</span>
                                </button>
                            </div>

                            <button
                                type="submit"
                                disabled={!isStep2Valid || saving}
                                className="w-full sm:w-auto bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-[var(--color-primary-on)] px-8 py-3.5 rounded-xl font-black text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                                title={!isStep2Valid ? `Please complete all required fields (${missingStep2.length} remaining)` : 'Proceed to Step 3'}
                            >
                                <span>Next: Emergency Contact</span>
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {/* STEP 3: Emergency Contact Details (Next of Kin) */}
            {currentStep === 3 && (
                <form className="space-y-6" onSubmit={handleNextFromStep3}>
                    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="border-b border-slate-100 pb-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <h3 className="text-xl font-black text-slate-900">Step 3: Emergency Contact Details (Next of Kin)</h3>
                                <p className="text-slate-500 text-xs font-medium mt-0.5">Primary emergency contact, next-of-kin legal relationship, phone contact, and verified physical address</p>
                            </div>
                            <span className="self-start sm:self-auto text-xs font-bold bg-primary-100 text-primary-900 px-3 py-1 rounded-full border border-primary-300">
                                Step 3 of 4
                            </span>
                        </div>

                        {/* Informational Guidance Alert */}
                        <div className="bg-amber-50/80 p-4 sm:p-5 rounded-2xl border border-amber-200 text-xs text-amber-950 font-medium mb-6 leading-relaxed flex items-start gap-3">
                            <div className="w-7 h-7 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center shrink-0 font-bold">!</div>
                            <div>
                                <strong className="font-extrabold text-amber-950">Statutory Attachment Requirement:</strong> For student insurance coverage, on-site health protocols, and official institutional records at the State Department for Petroleum, complete Next of Kin particulars and emergency contact details are mandatory.
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Next of Kin Full Legal Name <span className="text-rose-600">*</span></label>
                                <input
                                    type="text"
                                    name="next_of_kin_name"
                                    value={profile.next_of_kin_name || ''}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. Mary Wanjiku Mwangi"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Relationship to Attachee <span className="text-rose-600">*</span></label>
                                <select
                                    name="next_of_kin_relationship"
                                    value={profile.next_of_kin_relationship || ''}
                                    onChange={handleProfileChange}
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                    required
                                >
                                    <option value="">Select Relationship</option>
                                    <option value="Parent / Mother">Mother</option>
                                    <option value="Parent / Father">Father</option>
                                    <option value="Legal Guardian">Legal Guardian</option>
                                    <option value="Spouse">Spouse</option>
                                    <option value="Sibling">Brother / Sister</option>
                                    <option value="Relative">Uncle / Aunt / Relative</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Next of Kin Mobile Phone Number <span className="text-rose-600">*</span></label>
                                <input
                                    type="tel"
                                    name="next_of_kin_phone"
                                    value={profile.next_of_kin_phone || ''}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. 0722000000"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Next of Kin Postal / Physical Address <span className="text-rose-600">*</span></label>
                                <input
                                    type="text"
                                    name="next_of_kin_address"
                                    value={profile.next_of_kin_address || ''}
                                    onChange={handleProfileChange}
                                    placeholder="e.g. P.O. Box 1234 - 00100 Nairobi / Estate & Town"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-600 outline-none transition-all text-sm"
                                    required
                                />
                            </div>
                        </div>

                        {/* Step 3 Action Bar */}
                        <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50 p-5 sm:p-6 rounded-2xl">
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                                <button
                                    type="button"
                                    onClick={() => handleStepTabClick(2)}
                                    className="w-full sm:w-auto px-5 py-3.5 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-sm border border-slate-300 shadow-sm transition-all flex items-center justify-center gap-1.5"
                                >
                                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                                    </svg>
                                    <span>Back: Academic Details</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => saveDraft(false)}
                                    disabled={saving}
                                    className="w-full sm:w-auto px-5 py-3.5 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-sm border border-slate-300 shadow-sm transition-all flex items-center justify-center gap-1.5"
                                >
                                    <span>{saving ? 'Saving...' : 'Save Draft'}</span>
                                </button>
                            </div>

                            <button
                                type="submit"
                                disabled={!isStep3Valid || saving}
                                className="w-full sm:w-auto bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-[var(--color-primary-on)] px-8 py-3.5 rounded-xl font-black text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                                title={!isStep3Valid ? `Please complete all required fields (${missingStep3.length} remaining)` : 'Proceed to Step 4'}
                            >
                                <span>Next: Upload Documents</span>
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {/* STEP 4: Verification Documents (10 PDFs) */}
            {currentStep === 4 && (
                <div className="space-y-6">
                    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="border-b border-slate-100 pb-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-xl font-black text-slate-900">Step 4: Mandatory Verification Documents (10 Documents)</h3>
                                <p className="text-slate-500 text-xs font-medium mt-0.5">Upload certified PDF copies of all 10 institutional verification documents. ID/Photo documents: max 5 MB · CV/Letters: max 10 MB.</p>
                            </div>
                            <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
                                <span className={`text-xs font-black px-3.5 py-1.5 rounded-full border ${
                                    isStep4Valid
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                        : 'bg-amber-50 text-amber-900 border-amber-300'
                                }`}>
                                    {uploadedTypes.size} of {ALL_REQUIRED_DOC_TYPES.length} Uploaded
                                </span>
                            </div>
                        </div>

                        {/* Documents Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {STANDARD_DOCUMENTS.map((docItem, index) => {
                                const uploadedDoc = documents.find(d => d.document_type === docItem.type);
                                const isUploading = uploadingType === docItem.type;

                                return (
                                    <div
                                        key={docItem.type}
                                        className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                                            uploadedDoc
                                                ? 'bg-emerald-50/40 border-emerald-200 shadow-xs'
                                                : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        <div>
                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                <div className="flex items-center gap-2.5">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                                                        uploadedDoc ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                                                    }`}>
                                                        {index + 1}
                                                    </div>
                                                    <h4 className="text-sm font-extrabold text-slate-900 leading-snug">
                                                        {docItem.label}
                                                        {/* Size limit comes from the API so the
                                                            label always matches what is enforced. */}
                                                        <span className="ml-1.5 font-bold text-slate-500 whitespace-nowrap">
                                                            ({maxSizeLabelFor(docItem.type)})
                                                        </span>
                                                    </h4>
                                                </div>
                                                <span className={`text-2xs font-black uppercase px-2 py-1 rounded-md shrink-0 ${
                                                    uploadedDoc ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800 border border-rose-200'
                                                }`}>
                                                    {uploadedDoc ? '✓ Uploaded' : 'Required'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-600 font-medium mb-4 pl-9">
                                                {docItem.desc}
                                            </p>
                                        </div>

                                        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200/60 pl-9">
                                            {uploadedDoc ? (
                                                <span className="text-2xs text-emerald-800 font-bold truncate">
                                                    Verified on {new Date(uploadedDoc.uploaded_at).toLocaleDateString()}
                                                </span>
                                            ) : (
                                                <span className="text-2xs text-slate-400 italic">
                                                    PDF document pending
                                                </span>
                                            )}

                                            <div className="flex items-center gap-2 shrink-0">
                                                {uploadedDoc && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteDoc(uploadedDoc.id, docItem.type)}
                                                        className="px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-200 rounded-lg transition-colors"
                                                    >
                                                        Remove
                                                    </button>
                                                )}

                                                <label className={`cursor-pointer px-3.5 py-1.5 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 shadow-xs ${
                                                    uploadedDoc ? 'bg-slate-800 hover:bg-slate-900 text-white' : 'bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)]'
                                                }`}>
                                                    {isUploading ? (
                                                        <span>Uploading...</span>
                                                    ) : (
                                                        <>
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                                            </svg>
                                                            <span>{uploadedDoc ? 'Replace PDF' : 'Upload PDF'}</span>
                                                        </>
                                                    )}
                                                    <input
                                                        type="file"
                                                        accept="application/pdf"
                                                        disabled={isUploading}
                                                        className="hidden"
                                                        onChange={(e) => handleFileUpload(docItem.type, e.target.files[0])}
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Item 10: Next of Kin National ID (Document 10 of 10) */}
                            <div className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                                nextOfKinDoc
                                    ? 'bg-emerald-50/40 border-emerald-200 shadow-xs'
                                    : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                            }`}>
                                <div>
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <div className="flex items-center gap-2.5">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                                                nextOfKinDoc ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                                            }`}>
                                                {ALL_REQUIRED_DOC_TYPES.length}
                                            </div>
                                            <h4 className="text-sm font-extrabold text-slate-900 leading-snug">
                                                Next of Kin National ID &amp; Contact Copy
                                                <span className="ml-1.5 font-bold text-slate-500 whitespace-nowrap">
                                                    ({maxSizeLabelFor('NEXT_OF_KIN_ID')})
                                                </span>
                                            </h4>
                                        </div>
                                        <span className={`text-2xs font-black uppercase px-2 py-1 rounded-md shrink-0 ${
                                            nextOfKinDoc ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800 border border-rose-200'
                                        }`}>
                                            {nextOfKinDoc ? '✓ Uploaded' : 'Required'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-600 font-medium mb-4 pl-9">
                                        Verified copy of emergency contact's National ID for {profile.next_of_kin_name || 'declared kin'} (PDF)
                                    </p>
                                </div>

                                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200/60 pl-9">
                                    {nextOfKinDoc ? (
                                        <span className="text-2xs text-emerald-800 font-bold truncate">
                                            Verified on {new Date(nextOfKinDoc.uploaded_at).toLocaleDateString()}
                                        </span>
                                    ) : (
                                        <span className="text-2xs text-slate-400 italic">
                                            PDF document pending
                                        </span>
                                    )}

                                    <div className="flex items-center gap-2 shrink-0">
                                        {nextOfKinDoc && (
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteDoc(nextOfKinDoc.id, 'NEXT_OF_KIN_ID')}
                                                className="px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-200 rounded-lg transition-colors"
                                            >
                                                Remove
                                            </button>
                                        )}

                                        <label className={`cursor-pointer px-3.5 py-1.5 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 shadow-xs ${
                                            nextOfKinDoc ? 'bg-slate-800 hover:bg-slate-900 text-white' : 'bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)]'
                                        }`}>
                                            {uploadingType === 'NEXT_OF_KIN_ID' ? (
                                                <span>Uploading...</span>
                                            ) : (
                                                <>
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                                    </svg>
                                                    <span>{nextOfKinDoc ? 'Replace PDF' : 'Upload PDF'}</span>
                                                </>
                                            )}
                                            <input
                                                type="file"
                                                accept="application/pdf"
                                                disabled={uploadingType === 'NEXT_OF_KIN_ID'}
                                                className="hidden"
                                                onChange={(e) => handleFileUpload('NEXT_OF_KIN_ID', e.target.files[0])}
                                            />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Step 4 Bottom Action Bar: THE SINGLE AUTHORITATIVE SUBMIT BUTTON */}
                        <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50 p-5 sm:p-6 rounded-2xl">
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                                <button
                                    type="button"
                                    onClick={() => handleStepTabClick(3)}
                                    className="w-full sm:w-auto px-5 py-3.5 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-sm border border-slate-300 shadow-sm transition-all flex items-center justify-center gap-1.5"
                                >
                                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                                    </svg>
                                    <span>Back: Emergency Contact</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => saveDraft(false)}
                                    disabled={saving}
                                    className="w-full sm:w-auto px-5 py-3.5 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-sm border border-slate-300 shadow-sm transition-all flex items-center justify-center gap-1.5"
                                >
                                    <span>{saving ? 'Saving...' : 'Save Draft'}</span>
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={handleFinalSubmit}
                                disabled={!isEntireProfileValid || saving}
                                className="w-full sm:w-auto bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-[var(--color-primary-on)] px-8 py-3.5 rounded-xl font-black text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                                title={!isStep4Valid ? `Upload all ${ALL_REQUIRED_DOC_TYPES.length} verification documents to submit (${missingDocs.length} remaining)` : 'Submit completed profile'}
                            >
                                <svg className="w-5 h-5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>{saving ? 'Validating Application...' : 'Submit Profile & Complete Verification'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Validation & Missing Requirements Modal */}
            {validationModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animation-fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 sm:p-8 overflow-hidden max-h-[90vh] flex flex-col justify-between transform transition-all">
                        {validationModal.status === 'incomplete' ? (
                            <div>
                                <div className="flex items-center gap-3.5 mb-4">
                                    <div className="w-12 h-12 bg-rose-100 text-rose-700 rounded-2xl flex items-center justify-center shrink-0 border border-rose-200">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-slate-900">Incomplete Requirements</h3>
                                        <p className="text-xs text-slate-500 font-semibold mt-0.5">Please address all missing items to proceed</p>
                                    </div>
                                </div>

                                <p className="text-xs text-slate-700 mb-4 leading-relaxed font-semibold">
                                    {validationModal.message}
                                </p>

                                <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1 my-4">
                                    {validationModal.missingStep1.length > 0 && (
                                        <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200">
                                            <div className="text-xs font-black text-amber-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-amber-600 inline-block"></span>
                                                Step 1: Missing Personal Details ({validationModal.missingStep1.length})
                                            </div>
                                            <ul className="list-disc list-inside text-xs text-amber-900 font-bold space-y-1">
                                                {validationModal.missingStep1.map((item, idx) => (
                                                    <li key={idx}>{item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {validationModal.missingStep2.length > 0 && (
                                        <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200">
                                            <div className="text-xs font-black text-amber-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-amber-600 inline-block"></span>
                                                Step 2: Missing Academic Details ({validationModal.missingStep2.length})
                                            </div>
                                            <ul className="list-disc list-inside text-xs text-amber-900 font-bold space-y-1">
                                                {validationModal.missingStep2.map((item, idx) => (
                                                    <li key={idx}>{item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {validationModal.missingStep3.length > 0 && (
                                        <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200">
                                            <div className="text-xs font-black text-amber-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-amber-600 inline-block"></span>
                                                Step 3: Missing Emergency Contact Particulars ({validationModal.missingStep3.length})
                                            </div>
                                            <ul className="list-disc list-inside text-xs text-amber-900 font-bold space-y-1">
                                                {validationModal.missingStep3.map((item, idx) => (
                                                    <li key={idx}>{item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {validationModal.missingDocs.length > 0 && (
                                        <div className="bg-rose-50/70 p-4 rounded-2xl border border-rose-200">
                                            <div className="text-xs font-black text-rose-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-rose-600 inline-block"></span>
                                                Step 4: Missing Verification Documents ({validationModal.missingDocs.length})
                                            </div>
                                            <ul className="list-disc list-inside text-xs text-rose-900 font-bold space-y-1">
                                                {validationModal.missingDocs.map((item, idx) => (
                                                    <li key={idx}>{item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setValidationModal({ isOpen: false, status: 'idle', missingStep1: [], missingStep2: [], missingStep3: [], missingDocs: [], message: '' });
                                            if (validationModal.missingStep1.length > 0) setCurrentStep(1);
                                            else if (validationModal.missingStep2.length > 0) setCurrentStep(2);
                                            else if (validationModal.missingStep3.length > 0) setCurrentStep(3);
                                            else if (validationModal.missingDocs.length > 0) setCurrentStep(4);
                                        }}
                                        className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors shadow-sm"
                                    >
                                        Review & Complete Required Items
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="flex items-center gap-3.5 mb-4">
                                    <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-200">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-slate-900">Profile Submission Complete!</h3>
                                        <p className="text-xs text-emerald-800 font-semibold mt-0.5">All 4 sections verified and unlocked</p>
                                    </div>
                                </div>

                                <p className="text-xs text-slate-700 leading-relaxed font-semibold mb-6">
                                    {validationModal.message}
                                </p>

                                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 text-xs text-emerald-900 font-bold space-y-1.5 mb-6">
                                    <div className="flex items-center gap-2">✓ Step 1: Personal Identification & Contact Details Complete</div>
                                    <div className="flex items-center gap-2">✓ Step 2: Tertiary Institution & Attachment Timeline Complete</div>
                                    <div className="flex items-center gap-2">✓ Step 3: Emergency Contact & Next of Kin Particulars Complete</div>
                                    <div className="flex items-center gap-2">✓ Step 4: All {ALL_REQUIRED_DOC_TYPES.length} Verification Documents Uploaded & Verified</div>
                                </div>

                                <div className="flex flex-col sm:flex-row justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setValidationModal({ isOpen: false, status: 'idle', missingStep1: [], missingStep2: [], missingStep3: [], missingDocs: [], message: '' })}
                                        className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                                    >
                                        Stay on Profile
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setValidationModal({ isOpen: false, status: 'idle', missingStep1: [], missingStep2: [], missingStep3: [], missingDocs: [], message: '' });
                                            navigate('/vacancies');
                                        }}
                                        className="py-2.5 px-5 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5"
                                    >
                                        <span>View Open Vacancies</span>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
