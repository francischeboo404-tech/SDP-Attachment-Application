import React from 'react';

export default function DocumentPreviewModal({ isOpen, onClose, title, subtitle, documentHtml, rawText, onDownloadPdf }) {
    if (!isOpen) return null;

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>${title || 'Official Document'}</title>
                    <style>
                        body {
                            font-family: 'Times New Roman', Times, serif;
                            padding: 40px;
                            color: #111827;
                            line-height: 1.6;
                            font-size: 15pt;
                        }
                        .header {
                            text-align: center;
                            border-bottom: 2px solid #000;
                            padding-bottom: 15px;
                            margin-bottom: 25px;
                        }
                        .header h1 {
                            margin: 0;
                            font-size: 18pt;
                            text-transform: uppercase;
                            letter-spacing: 1px;
                        }
                        .header h2 {
                            margin: 5px 0 0 0;
                            font-size: 14pt;
                            font-weight: normal;
                        }
                        .content {
                            white-space: pre-wrap;
                            font-size: 13pt;
                            line-height: 1.8;
                        }
                        @media print {
                            body { padding: 0; }
                            @page { margin: 2cm; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>Republic of Kenya</h1>
                        <h2>State Department for Petroleum &bull; Ministry of Energy and Petroleum</h2>
                    </div>
                    <div class="content">${rawText || documentHtml || ''}</div>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 500);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-900/80 backdrop-blur-sm animation-fade-in overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl border-2 border-slate-300 flex flex-col max-h-[92vh] overflow-hidden my-auto">
                {/* Top Action Header */}
                <div className="flex flex-wrap items-center justify-between px-6 py-4 bg-slate-100 border-b-2 border-slate-300 gap-3">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 leading-tight">
                            {title || 'Document Preview'}
                        </h3>
                        {subtitle && <p className="text-sm font-semibold text-slate-600">{subtitle}</p>}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrint}
                            className="bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] font-bold py-2 px-4 rounded-xl text-sm transition-all flex items-center gap-2 shadow-sm focus:ring-2 focus:ring-primary-600"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            <span>Print / PDF</span>
                        </button>

                        {onDownloadPdf && (
                            <button
                                onClick={onDownloadPdf}
                                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2 px-4 rounded-xl text-sm transition-all flex items-center gap-2 shadow-sm focus:ring-2 focus:ring-emerald-600"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                <span>Download</span>
                            </button>
                        )}

                        <button
                            onClick={onClose}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2 px-3.5 rounded-xl text-sm transition-colors"
                            title="Close preview"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Preview Document Viewport (A4 Proportional on Desktop, Reflows on Mobile) */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-8 md:p-12 bg-slate-200 flex justify-center">
                    <div className="w-full max-w-[800px] bg-white border-2 border-slate-300 shadow-xl p-6 sm:p-12 rounded-lg text-slate-900 font-serif leading-relaxed">
                        {/* Official Header */}
                        <div className="text-center border-b-2 border-slate-900 pb-6 mb-8">
                            <div className="inline-block mb-2 bg-white">
                                <img src="/logo.png" alt="State Department Logo" className="h-14 mx-auto object-contain" />
                            </div>
                            <h4 className="text-sm sm:text-base font-black uppercase tracking-widest text-slate-900">
                                Republic of Kenya
                            </h4>
                            <h3 className="text-lg sm:text-xl font-bold uppercase tracking-wider text-slate-800 mt-1">
                                Ministry of Energy and Petroleum
                            </h3>
                            <h2 className="text-base sm:text-lg font-bold text-primary-900 mt-0.5">
                                State Department for Petroleum
                            </h2>
                        </div>

                        {/* Letter Content Body */}
                        <div className="whitespace-pre-wrap text-base sm:text-lg text-slate-900 leading-relaxed font-serif min-h-[350px]">
                            {rawText || documentHtml}
                        </div>

                        {/* Official Seal / Footer Block */}
                        <div className="mt-12 pt-6 border-t border-slate-300 text-xs sm:text-sm text-slate-600 font-sans flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                            <div>
                                <p className="font-bold text-slate-800">State Department for Petroleum</p>
                                <p>Nyayo House, Kenyatta Avenue, Nairobi, Kenya</p>
                            </div>
                            <div className="text-right sm:text-right">
                                <p className="font-semibold text-slate-700">Official Recommendation Letter</p>
                                <p className="text-2xs text-slate-500">Security Encrypted &bull; Digitally Issued</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
