import React from 'react';
import { Link } from 'react-router-dom';

export default function PetroleumFooter() {
    return (
        <footer className="w-full font-sans text-sm">
            {/* Upper Footer - Rich Matte Black / Charcoal with Petroleum Golden Accents */}
            <div className="bg-[#151515] text-white py-14 px-4 sm:px-6 lg:px-12">
                <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-10 sm:gap-12">
                    {/* Column 1: Portal Overview */}
                    <div>
                        <h3 className="text-lg sm:text-xl font-extrabold text-white tracking-wide uppercase pb-2">
                            Industrial Attachment Portal
                        </h3>
                        <div className="w-20 h-0.5 bg-primary-600 mb-5"></div>
                        <p className="text-slate-300 text-sm leading-relaxed mb-4">
                            The official online application and dual-stage clearance platform for university and college students undertaking industrial attachment at the State Department for Petroleum.
                        </p>
                        <span className="inline-block bg-primary-800/60 text-amber-200 border border-primary-600/40 px-3 py-1 rounded-md text-xs font-bold">
                            Ministry of Energy &amp; Petroleum
                        </span>
                    </div>

                    {/* Column 2: Quick Links */}
                    <div>
                        <h3 className="text-lg sm:text-xl font-extrabold text-white tracking-wide uppercase pb-2">
                            Quick Links
                        </h3>
                        <div className="w-20 h-0.5 bg-primary-600 mb-5"></div>
                        <ul className="space-y-3 font-semibold text-slate-200 text-sm">
                            <li>
                                <a href="#vacancies" className="hover:text-gold-500 transition-colors">
                                    Browse Open Vacancies
                                </a>
                            </li>
                            <li>
                                <Link to="/register" className="hover:text-gold-500 transition-colors">
                                    Create Student Account
                                </Link>
                            </li>
                            <li>
                                <Link to="/login" className="hover:text-gold-500 transition-colors">
                                    Sign In to Portal
                                </Link>
                            </li>
                            <li>
                                <Link to="/vacancies" className="hover:text-gold-500 transition-colors">
                                    Apply &amp; Track Status
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Column 3: Contact info */}
                    <div>
                        <h3 className="text-lg sm:text-xl font-extrabold text-white tracking-wide uppercase pb-2">
                            Contact Info
                        </h3>
                        <div className="w-20 h-0.5 bg-primary-600 mb-5"></div>
                        <p className="font-extrabold text-white text-base mb-3">
                            State Department for Petroleum
                        </p>
                        <ul className="space-y-3 font-semibold text-slate-200 text-sm">
                            <li className="flex items-start gap-3">
                                <svg className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                </svg>
                                <span>Kasneb Towers II, Off Hospital Road, Upper Hill, Nairobi</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <svg className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                </svg>
                                <span>P.O. Box 51614 – 00100, Nairobi, Kenya</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                <a href="mailto:info@petroleum.go.ke" className="hover:underline text-slate-100 font-bold">
                                    info@petroleum.go.ke
                                </a>
                            </li>
                            <li className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                </svg>
                                <a href="https://www.petroleum.go.ke/" className="hover:underline text-slate-100 font-bold">
                                    www.petroleum.go.ke
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Lower Footer - Midnight Dark Blue / Black with Gold Copyright & Socials */}
            <div className="bg-[#071922] py-5 px-4 sm:px-6 lg:px-12 border-t border-[#122b3b]">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-gold-500 font-extrabold text-xs sm:text-sm tracking-wide text-center sm:text-left">
                        &copy; 2026 | <a href="https://www.petroleum.go.ke/" className="hover:underline text-slate-100 font-bold">State Department for Petroleum</a> | All Rights Reserved.
                    </p>

                    {/* Social Buttons */}
                    <div className="flex items-center gap-3">
                        <a
                            href="https://x.com/SDP_KE"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-8 h-8 rounded-full bg-[#1DA1F2] text-white flex items-center justify-center hover:opacity-90 transition-opacity shadow-xs"
                            title="Twitter"
                        >
                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z" />
                            </svg>
                        </a>
                        <a
                            href="https://www.facebook.com/people/Petroleum-Department/61573779914378/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-8 h-8 rounded-full bg-[#1877F2] text-white flex items-center justify-center hover:opacity-90 transition-opacity shadow-xs"
                            title="Facebook"
                        >
                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M9 8H6v4h3v12h5V12h3.642L18 8h-4V6.333C14 5.374 14.5 5 15.667 5H18V0h-3.808C10.595 0 9 1.582 9 4.615V8z" />
                            </svg>
                        </a>
                        <a
                            href="https://www.youtube.com/@sdpetroleumke"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-8 h-8 rounded-full bg-[#FF0000] text-white flex items-center justify-center hover:opacity-90 transition-opacity shadow-xs"
                            title="YouTube"
                        >
                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                            </svg>
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
