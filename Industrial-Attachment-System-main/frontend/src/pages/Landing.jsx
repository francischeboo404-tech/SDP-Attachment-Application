import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import PetroleumFooter from '../components/PetroleumFooter';
import { richTextToPlainText } from '../utils/richText';
import VacancyMarquee from '../components/VacancyMarquee';

export default function Landing() {
    const navigate = useNavigate();
    const isAuthenticated = useAuthStore(state => state.isAuthenticated);
    const user = useAuthStore(state => state.user);

    const [vacancies, setVacancies] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [eligibilityStatement, setEligibilityStatement] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectedDept, setSelectedDept] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchPublicData();
    }, []);

    const fetchPublicData = async () => {
        try {
            setLoading(true);
            const [vacRes, deptRes, eligRes] = await Promise.all([
                api.get('jobs/vacancies/public/'),
                api.get('jobs/departments/'),
                api.get('jobs/eligibility-settings/'),
            ]);

            const vacList = Array.isArray(vacRes.data?.results) ? vacRes.data.results : (Array.isArray(vacRes.data) ? vacRes.data : []);
            const deptList = Array.isArray(deptRes.data?.results) ? deptRes.data.results : (Array.isArray(deptRes.data) ? deptRes.data : []);

            setVacancies(vacList);
            setDepartments(deptList);
            // `general_statement_html` is sanitized server-side on save AND on
            // render, so it is safe to inject as HTML here. This page is a
            // pure read-only display: editing lives in Admin -> System Settings
            // & Keys.
            setEligibilityStatement(
                eligRes.data?.general_statement_html
                || eligRes.data?.general_statement
                || '<p>Applicants must be currently enrolled undergraduate or diploma students at an accredited tertiary institution seeking mandatory industrial attachment.</p>'
            );
        } catch (err) {
            console.error('Failed to load public data:', err);
            setVacancies([]);
            setDepartments([]);
        } finally {
            setLoading(false);
        }
    };

    const filteredVacancies = vacancies.filter(v => {
        const matchesDept = selectedDept === 'ALL' || v.department_name === selectedDept;
        // The description is rich text, so it is searched as plain words.
        // Matching against the raw markup would let an applicant find a vacancy
        // by typing "strong" or "href" and would never match a word that the
        // markup split across tags.
        const matchesSearch = !searchTerm || (
            (v.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            richTextToPlainText(v.description).toLowerCase().includes(searchTerm.toLowerCase()) ||
            (v.requirements && v.requirements.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (v.department_name || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
        return matchesDept && matchesSearch;
    });

    const handleApplyClick = (jobId) => {
        if (isAuthenticated) {
            navigate('/vacancies');
        } else {
            navigate('/login');
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-primary-600 selection:text-white">
            {/* Main Header / Logo Bar */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-50 backdrop-blur-md bg-white/98 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/logo.png" alt="State Department for Petroleum" className="h-12 w-auto object-contain filter drop-shadow-sm" />
                        <div>
                            <span className="text-xs uppercase tracking-widest text-primary-700 font-extrabold block">Kenya</span>
                            <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight block leading-none">State Department for Petroleum</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {isAuthenticated ? (
                            <Link
                                to="/dashboard"
                                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] font-bold rounded-xl text-sm shadow-md transition-all flex items-center gap-2 hover:-translate-y-0.5"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                                Go to Dashboard ({user?.username})
                            </Link>
                        ) : (
                            <>
                                <Link
                                    to="/login"
                                    className="px-4 py-2 text-slate-800 hover:text-primary-700 font-bold text-sm transition-colors"
                                >
                                    Sign In
                                </Link>
                                <Link
                                    to="/register"
                                    className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] font-bold rounded-xl text-sm shadow-md transition-all hover:-translate-y-0.5"
                                >
                                    Register as Applicant
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800 text-white py-20 px-4 sm:px-6 lg:px-8 shadow-inner">
                <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:28px_28px] opacity-10 pointer-events-none"></div>
                <div className="max-w-5xl mx-auto text-center relative z-10">
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 text-amber-100 text-xs font-black uppercase tracking-wider border border-white/20 mb-6 backdrop-blur-md shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse"></span>
                        Official Industrial Attachment Portal
                    </span>
                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight mb-6 text-white drop-shadow-sm">
                        Launch Your Career in Kenya's <span className="text-amber-200">Petroleum &amp; Energy Sector</span>
                    </h1>
                    <p className="text-lg sm:text-xl text-amber-50 font-semibold max-w-3xl mx-auto mb-10 leading-relaxed drop-shadow-xs">
                        Join specialized departments across Upstream Geo-exploration, Midstream &amp; Downstream Infrastructure, Energy Transition, and Policy. Apply online with automated ATS qualification and digital clearance.
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-4">
                        <a
                            href="#vacancies"
                            className="px-8 py-4 bg-[#1DA1F2] hover:bg-[#0284C7] text-white font-black rounded-2xl shadow-xl transition-all hover:-translate-y-1 text-base flex items-center gap-2 border border-white/20"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            Browse Open Vacancies
                        </a>
                        {!isAuthenticated && (
                            <Link
                                to="/register"
                                className="px-8 py-4 bg-white/15 hover:bg-white/25 text-white font-black rounded-2xl border border-white/30 backdrop-blur-md transition-all hover:-translate-y-1 text-base shadow-md"
                            >
                                Create Free Student Account
                            </Link>
                        )}
                    </div>
                </div>

                {/* Key Metrics Strip */}
                <div className="max-w-6xl mx-auto mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white/10 border border-white/20 p-5 rounded-2xl backdrop-blur-md text-center shadow-sm">
                        <div className="text-3xl font-black text-amber-200">9+</div>
                        <div className="text-xs font-bold text-white uppercase tracking-wider mt-1">Core Departments</div>
                    </div>
                    <div className="bg-white/10 border border-white/20 p-5 rounded-2xl backdrop-blur-md text-center shadow-sm">
                        <div className="text-3xl font-black text-amber-200">100%</div>
                        <div className="text-xs font-bold text-white uppercase tracking-wider mt-1">Online Dual Clearance</div>
                    </div>
                    <div className="bg-white/10 border border-white/20 p-5 rounded-2xl backdrop-blur-md text-center shadow-sm">
                        <div className="text-3xl font-black text-amber-200">Instant</div>
                        <div className="text-xs font-bold text-white uppercase tracking-wider mt-1">ATS Document Audit</div>
                    </div>
                    <div className="bg-white/10 border border-white/20 p-5 rounded-2xl backdrop-blur-md text-center shadow-sm">
                        <div className="text-3xl font-black text-amber-200">Official</div>
                        <div className="text-xs font-bold text-white uppercase tracking-wider mt-1">Recommendation Letters</div>
                    </div>
                </div>
            </section>

            {/* Public Vacancies Section */}
            <section id="vacancies" className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex-1 w-full">
                {/* 1. General Eligibility Requirements Banner */}
                <div className="mb-10 bg-gradient-to-r from-amber-50 via-primary-50 to-emerald-50/50 rounded-3xl p-6 sm:p-8 border-2 border-primary-200 shadow-sm relative overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="p-1.5 bg-primary-600 text-[var(--color-primary-on)] rounded-lg">
                                    <svg className="w-5 h-5 text-primary-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                </span>
                                <span className="text-xs font-black uppercase tracking-wider text-primary-800 bg-amber-100/90 px-2.5 py-0.5 rounded-md border border-primary-300">
                                    Institutional Attachment Eligibility
                                </span>
                            </div>
                            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                                Mandatory Industrial Attachment Requirements
                            </h3>
                            {/* Sanitized rich text authored in Admin -> System Settings & Keys.
                                Styled via .eligibility-prose so headings, lists and paragraphs get
                                real spacing instead of rendering as an unstyled HTML blob. */}
                            <div
                                className="eligibility-prose max-w-4xl text-slate-800 text-sm sm:text-base font-semibold"
                                dangerouslySetInnerHTML={{ __html: eligibilityStatement }}
                            />
                        </div>

                    </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
                    <div>
                        <span className="text-xs font-black uppercase tracking-wider text-[var(--color-primary-on)] bg-primary-600 px-3 py-1 rounded-md border border-primary-200 inline-block mb-2">
                            Active Attachment Opportunities
                        </span>
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Available Attachment Positions</h2>
                        <p className="text-slate-700 font-semibold text-sm mt-1">Explore live industrial attachment openings currently accepting applications.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/*<div className="relative">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search roles or skills..."
                                className="pl-9 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600 shadow-sm"
                            />
                            <svg className="w-4 h-4 text-slate-500 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>*/}

                        <select
                            value={selectedDept}
                            onChange={(e) => setSelectedDept(e.target.value)}
                            className="bg-white border border-slate-300 text-slate-900 text-xs font-bold rounded-xl px-3 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
                        >
                            <option value="ALL">All Departments</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.name}>{d.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="p-20 text-center flex justify-center items-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                    </div>
                ) : filteredVacancies.length === 0 ? (
                    <div className="bg-white rounded-3xl p-16 text-center border-2 border-dashed border-slate-300">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-500">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        </div>
                        <h3 className="text-xl font-black text-slate-900 mb-1">No Openings Matching Your Search</h3>
                        <p className="text-slate-600 font-semibold text-sm">Please adjust your department filter or check back soon as new vacancies are published regularly.</p>
                    </div>
                ) : (
                    /* Advertised vacancies scroll right-to-left and loop seamlessly.
                       Below three vacancies, or for a reader who prefers reduced
                       motion, VacancyMarquee falls back to a static grid. */
                    <VacancyMarquee jobs={filteredVacancies} onApply={handleApplyClick} />
                )}
            </section>

            {/* Official Petroleum Footer from Screenshot */}
            <PetroleumFooter />
        </div>
    );
}
