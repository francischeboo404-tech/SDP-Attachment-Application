import { useState, useEffect } from 'react';
import useAuthStore from '../store/authStore';
import api from '../services/api';
import { useNavigate, Link } from 'react-router-dom';
import ReCAPTCHA from 'react-google-recaptcha';
import { GoogleLogin } from '@react-oauth/google';

export default function Login() {
    const [credentials, setCredentials] = useState({ username: '', password: '' });
    const [recaptchaToken, setRecaptchaToken] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState('Signing In...');
    const setAuth = useAuthStore(state => state.setAuth);
    const navigate = useNavigate();
    // Only enable Google Sign-In when VITE_GOOGLE_CLIENT_ID is explicitly set in .env.
    // The fallback demo ID is NOT authorized for localhost, causing a 403 error from Google.
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const isGoogleEnabled = !!(googleClientId && googleClientId.trim() !== '');

    // ── Reset form state on every mount so no stale / browser-injected
    // credentials bleed in from a previous session or a different site.
    useEffect(() => {
        setCredentials({ username: '', password: '' });
        setError('');
    }, []);

    // Loading message cycling
    useEffect(() => {
        let interval;
        if (loading) {
            const messages = [
                'Signing In...',
                'Waking up secure server...',
                'Verifying credentials...',
                'Almost there...',
            ];
            let i = 0;
            interval = setInterval(() => {
                i = (i + 1) % messages.length;
                setLoadingMsg(messages[i]);
            }, 4000);
        } else {
            setLoadingMsg('Signing In...');
        }
        return () => clearInterval(interval);
    }, [loading]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!recaptchaToken) {
            setError('Please complete the reCAPTCHA validation.');
            return;
        }

        setLoading(true);
        try {
            const { data } = await api.post('accounts/login/', {
                username: credentials.username.trim(),
                password: credentials.password,
                recaptcha: recaptchaToken
            });
            const userData = data.user || { username: credentials.username };
            // Pass the refresh token as the third argument so the interceptor
            // can silently renew the session when the access token expires.
            setAuth(userData, data.access, data.refresh);
            
            if (['ADMIN', 'HR'].includes(userData.role)) {
                navigate('/manage-jobs');
            } else if (['DEPARTMENT_DIRECTOR', 'DEPARTMENT'].includes(userData.role)) {
                navigate('/director-portal');
            } else {
                navigate('/profile');
            }
        } catch (err) {
            console.error('Login failed', err);
            if (err.response?.data) {
                const errorData = err.response.data;
                // Check for detail (standard DRF) or specific field errors
                if (errorData.detail) {
                    setError(errorData.detail);
                } else if (typeof errorData === 'object') {
                    const messages = Object.values(errorData).flat();
                    setError(messages.join(', '));
                } else {
                    setError('Invalid email or password. Please try again.');
                }
            } else {
                setError('Invalid email or password. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen">
            {/* ─── Left Hero Panel ─────────────────────────────────────────── */}
            <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden">
                {/* Rich gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary-950 via-primary-800 to-primary-600" />

                {/* Decorative geometric overlay */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-white/[0.07] to-transparent rounded-full translate-x-1/3 -translate-y-1/4" />
                    <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-white/[0.05] to-transparent rounded-full -translate-x-1/4 translate-y-1/4" />
                    <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] border border-white/[0.06] rounded-full -translate-x-1/2 -translate-y-1/2" />
                    <div className="absolute top-1/2 left-1/2 w-[500px] h-[500px] border border-white/[0.04] rounded-full -translate-x-1/2 -translate-y-1/2" />
                    {/* Subtle grid pattern */}
                    <div className="absolute inset-0" style={{
                        backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                        backgroundSize: '60px 60px'
                    }} />
                </div>

                {/* Content */}
                <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
                    <div>
                        {/* Logo badge */}
                        <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-4 py-2.5 mb-12">
                            <img src="/logo.png" alt="Ministry Logo" className="h-10 object-contain" />
                            <div className="h-8 w-px bg-white/20" />
                            <span className="text-2xs font-bold text-white/80 uppercase tracking-wider leading-tight">
                                State Department<br/>for Petroleum
                            </span>
                        </div>

                        {/* Headline */}
                        <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] tracking-tight mb-6">
                            Empowering Youth<br/>
                            <span className="text-gold-400">Through Excellence</span>
                        </h1>
                        <p className="text-base xl:text-lg text-white/70 leading-relaxed max-w-md mb-12 font-medium">
                            A transparent, merit-based industrial attachment platform built for the next generation of Kenya's workforce.
                        </p>

                        {/* Feature cards */}
                        <div className="space-y-4">
                            {[
                                {
                                    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
                                    title: 'Automated Verification',
                                    desc: 'AI-powered criteria matching for fair, unbiased candidate vetting'
                                },
                                {
                                    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
                                    title: 'Enterprise Security',
                                    desc: 'Multi-stage document validation with end-to-end encryption'
                                },
                                {
                                    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
                                    title: 'Real-time Tracking',
                                    desc: 'Live status updates from application to deployment completion'
                                },
                            ].map((feat) => (
                                <div key={feat.title} className="flex items-start gap-4 bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] rounded-2xl px-5 py-4 transition-all hover:bg-white/[0.1]">
                                    <div className="shrink-0 w-10 h-10 rounded-xl bg-gold-400/20 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d={feat.icon} />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-white">{feat.title}</h3>
                                        <p className="text-xs text-white/50 mt-0.5 leading-relaxed">{feat.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-12 flex items-center justify-between">
                        <p className="text-xs text-white/40 font-medium">
                            &copy; {new Date().getFullYear()} State Department for Petroleum. All rights reserved.
                        </p>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-2xs text-white/40 font-medium">System Online</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Right Form Panel ────────────────────────────────────────── */}
            <div className="w-full lg:w-[48%] flex flex-col min-h-screen bg-slate-50">
                {/* Mobile header bar */}
                <div className="lg:hidden bg-gradient-to-r from-primary-950 to-primary-800 px-5 py-4 flex items-center gap-3">
                    <img src="/logo.png" alt="Ministry Logo" className="h-9 object-contain" />
                    <div className="h-6 w-px bg-white/20" />
                    <span className="text-xs font-bold text-white/90 uppercase tracking-wider">SDP Industrial Attachment</span>
                </div>

                {/* Centered form container */}
                <div className="flex-1 flex items-center justify-center px-5 py-8 sm:px-8">
                    <div className="w-full max-w-[420px]">
                        {/* Welcome badge */}
                        <div className="mb-8">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-100 border border-gold-400/30 rounded-full mb-5">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
                                <span className="text-2xs font-bold text-primary-800 uppercase tracking-wider">Secure Portal</span>
                            </div>
                            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Welcome back</h2>
                            <p className="text-sm text-slate-500 mt-1.5 font-medium">Sign in to your industrial attachment account</p>
                        </div>

                        <form
                            id="login-form"
                            onSubmit={handleSubmit}
                            autoComplete="off"
                        >
                            {/* Error alert */}
                            {error && (
                                <div className="mb-5 flex items-start gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 font-medium">
                                    <svg className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>{error}</span>
                                </div>
                            )}
                            
                            <div className="space-y-5">
                                {/* Email */}
                                <div className="group">
                                    <label htmlFor="login-username" className="text-2xs font-bold text-slate-500 uppercase tracking-wider mb-2 block group-focus-within:text-primary-800 transition-colors">
                                        Email Address
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                            <svg className="h-[18px] w-[18px] text-slate-400 group-focus-within:text-primary-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                        <input
                                            id="login-username"
                                            name="username"
                                            type="email"
                                            autoComplete="username"
                                            placeholder="you@example.com"
                                            className="w-full pl-10.5 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:bg-white focus:ring-[3px] focus:ring-primary-600/10 focus:border-primary-600 focus:outline-none transition-all placeholder-slate-400 text-sm font-medium text-slate-900"
                                            style={{ paddingLeft: '2.75rem' }}
                                            value={credentials.username}
                                            onChange={e => setCredentials({ ...credentials, username: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Password */}
                                <div className="group">
                                    <label htmlFor="login-password" className="text-2xs font-bold text-slate-500 uppercase tracking-wider mb-2 block group-focus-within:text-primary-800 transition-colors">
                                        Password
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                            <svg className="h-[18px] w-[18px] text-slate-400 group-focus-within:text-primary-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                            </svg>
                                        </div>
                                        <input
                                            id="login-password"
                                            name="password"
                                            type={showPassword ? 'text' : 'password'}
                                            autoComplete="current-password"
                                            placeholder="Enter your password"
                                            className="w-full pr-10 py-3 bg-white border border-slate-200 rounded-xl focus:bg-white focus:ring-[3px] focus:ring-primary-600/10 focus:border-primary-600 focus:outline-none transition-all placeholder-slate-400 text-sm font-medium text-slate-900"
                                            style={{ paddingLeft: '2.75rem' }}
                                            value={credentials.password}
                                            onChange={e => setCredentials({ ...credentials, password: e.target.value })}
                                        />
                                        <button type="button" className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-primary-800 transition-colors focus:outline-none" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                            {showPassword ? (
                                                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.478 0-8.268-2.943-9.542-7z" /></svg>
                                            ) : (
                                                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                                
                                {/* reCAPTCHA */}
                                <div className="flex justify-center pt-1">
                                    <ReCAPTCHA
                                        sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"}
                                        onChange={(token) => setRecaptchaToken(token)}
                                        theme="light"
                                    />
                                </div>

                                {/* Submit */}
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className={`w-full bg-gradient-to-r from-primary-800 to-primary-600 hover:from-primary-900 hover:to-primary-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-primary-600/20 hover:shadow-xl hover:shadow-primary-600/30 hover:-translate-y-[1px] active:translate-y-0 transition-all duration-200 flex justify-center items-center gap-2.5 text-sm ${loading ? 'opacity-70 cursor-wait hover:translate-y-0' : ''}`}
                                >
                                    {loading && (
                                        <svg className="animate-spin h-4.5 w-4.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    )}
                                    {loading ? loadingMsg : 'Sign In to Portal'}
                                    {!loading && (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                            
                            {/* Google login divider */}
                            {isGoogleEnabled && (
                                <div className="mt-7">
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="flex-1 h-px bg-slate-200" />
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Or continue with</span>
                                        <div className="flex-1 h-px bg-slate-200" />
                                    </div>
                                    <div className="flex justify-center">
                                        <GoogleLogin 
                                            onSuccess={async (credentialResponse) => {
                                                try {
                                                    const { data } = await api.post('accounts/google-login/', { 
                                                        tokenId: credentialResponse.credential 
                                                    });
                                                    const userData = data.user;
                                                    setAuth(userData, data.access);
                                                    
                                                    if (userData.role === 'ADMIN') {
                                                        navigate('/manage-jobs');
                                                    } else {
                                                        navigate('/dashboard');
                                                    }
                                                } catch (err) {
                                                    console.error('Google login failed', err);
                                                    setError('Google authentication failed. Please try again.');
                                                }
                                            }}
                                            onError={() => {
                                                console.log('Login Failed');
                                                setError('Google login was cancelled or failed.');
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Register link */}
                            <div className="mt-8 text-center">
                                <p className="text-sm text-slate-500 font-medium">
                                    Don't have an account?{' '}
                                    <Link to="/register" className="font-bold text-primary-800 hover:text-primary-900 hover:underline transition-colors decoration-2 underline-offset-4">
                                        Create one here
                                    </Link>
                                </p>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Mobile footer */}
                <div className="lg:hidden text-center py-4 border-t border-slate-200 bg-white">
                    <p className="text-2xs text-slate-400 font-medium">
                        &copy; {new Date().getFullYear()} State Department for Petroleum
                    </p>
                </div>
            </div>
        </div>
    );
}
