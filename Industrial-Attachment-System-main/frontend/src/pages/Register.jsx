import { useState, useEffect } from 'react';
import api from '../services/api';
import { useNavigate, Link } from 'react-router-dom';
import ReCAPTCHA from 'react-google-recaptcha';
import { GoogleLogin } from '@react-oauth/google';
import useAuthStore from '../store/authStore';

export default function Register() {
    const [formData, setFormData] = useState({ 
        username: '', email: '', password: '', confirm_password: '',
        first_name: '', last_name: '' 
    });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState('Processing...');
    const [errorMsg, setErrorMsg] = useState(null);
    const [recaptchaToken, setRecaptchaToken] = useState(null);
    const navigate = useNavigate();
    // Only enable Google Sign-In when VITE_GOOGLE_CLIENT_ID is explicitly set in .env.
    // The fallback demo ID is NOT authorized for localhost — mounting the widget fires a 403.
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const isGoogleEnabled = !!(googleClientId && googleClientId.trim() !== '');

    useEffect(() => {
        let interval;
        if (loading) {
            const messages = [
                "Processing...", 
                "Waking up secure server...", 
                "Creating account...", 
                "Almost there..."
            ];
            let i = 0;
            interval = setInterval(() => {
                i = (i + 1) % messages.length;
                setLoadingMsg(messages[i]);
            }, 4000);
        } else {
            setLoadingMsg('Processing...');
        }
        return () => clearInterval(interval);
    }, [loading]);
    const setAuth = useAuthStore(state => state.setAuth);

    const checkStrength = (pass) => {
        let score = 0;
        if (!pass) return { score: 0, label: '', color: 'bg-gray-200', textColor: 'text-slate-400', width: '0%' };
        if (pass.length >= 8) score += 1;
        if (/[A-Z]/.test(pass)) score += 1;
        if (/[0-9]/.test(pass)) score += 1;
        if (/[^A-Za-z0-9]/.test(pass)) score += 1;
        
        if (pass.length > 16) return { score: 0, label: 'Too Long (>16)', color: 'bg-rose-500', textColor: 'text-rose-600', width: '100%' };
        if (pass.length < 8) return { score: 1, label: 'Too Short (<8)', color: 'bg-rose-500', textColor: 'text-rose-600', width: '25%' };
        
        switch(score) {
            case 1: return { score, label: 'Weak', color: 'bg-rose-500', textColor: 'text-rose-600', width: '25%' };
            case 2: return { score, label: 'Fair', color: 'bg-amber-500', textColor: 'text-amber-600', width: '50%' };
            case 3: return { score, label: 'Good', color: 'bg-yellow-500', textColor: 'text-yellow-600', width: '75%' };
            case 4: return { score, label: 'Strong', color: 'bg-emerald-500', textColor: 'text-emerald-600', width: '100%' };
            default: return { score: 0, label: '', color: 'bg-gray-200', textColor: 'text-slate-400', width: '0%' };
        }
    };
    
    const strength = checkStrength(formData.password);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg(null);

        if (formData.password !== formData.confirm_password) {
            setErrorMsg('Passwords do not match.');
            setLoading(false);
            return;
        }

        if (formData.password.length < 8 || formData.password.length > 16) {
            setErrorMsg('Password must be between 8 and 16 characters.');
            setLoading(false);
            return;
        }

        if (strength.score < 4) {
            setErrorMsg('Password is not strong enough. Ensure it has an uppercase letter, lowercase letter, number, and special character.');
            setLoading(false);
            return;
        }
        
        if (!recaptchaToken) {
            setErrorMsg('Please complete the reCAPTCHA validation.');
            setLoading(false);
            return;
        }

        try {
            await api.post('accounts/register/', {
                ...formData,
                recaptcha: recaptchaToken
            });
            alert('Registration Successful! Please login.');
            navigate('/login');
        } catch (error) {
            console.error('Registration failed', error);
            if (error.response?.data) {
                const errors = Object.values(error.response.data).flat();
                setErrorMsg(errors.join(', '));
            } else {
                setErrorMsg('Network error or server down. Please try again later.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => setFormData({...formData, [e.target.name]: e.target.value});

    // Shared input class
    const inputCls = "w-full py-3 bg-white border border-slate-200 rounded-xl focus:ring-[3px] focus:ring-primary-600/10 focus:border-primary-600 focus:outline-none transition-all placeholder-slate-400 text-sm font-medium text-slate-900";

    return (
        <div className="flex min-h-screen">
            {/* ─── Left Hero Panel ─────────────────────────────────────────── */}
            <div className="hidden lg:flex lg:w-[48%] relative overflow-hidden">
                {/* Rich gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary-950 via-primary-800 to-primary-600" />

                {/* Decorative geometric overlay */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-white/[0.07] to-transparent rounded-full translate-x-1/3 -translate-y-1/4" />
                    <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-white/[0.05] to-transparent rounded-full -translate-x-1/4 translate-y-1/4" />
                    <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] border border-white/[0.06] rounded-full -translate-x-1/2 -translate-y-1/2" />
                    <div className="absolute top-1/2 left-1/2 w-[500px] h-[500px] border border-white/[0.04] rounded-full -translate-x-1/2 -translate-y-1/2" />
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
                            Begin Your<br/>
                            <span className="text-gold-400">Career Journey</span>
                        </h1>
                        <p className="text-base xl:text-lg text-white/70 leading-relaxed max-w-md mb-12 font-medium">
                            Join Kenya's premier government attachment portal. Create your profile, apply for opportunities, and track your progress.
                        </p>

                        {/* Steps */}
                        <div className="space-y-4">
                            {[
                                { num: '01', title: 'Create Account', desc: 'Register with your email and personal details' },
                                { num: '02', title: 'Complete Profile', desc: 'Upload your documents, academic transcripts & ID' },
                                { num: '03', title: 'Apply & Track', desc: 'Browse vacancies, apply, and track real-time progress' },
                            ].map((step, idx) => (
                                <div key={step.num} className="flex items-start gap-4 bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] rounded-2xl px-5 py-4 transition-all hover:bg-white/[0.1]">
                                    <div className="shrink-0 w-10 h-10 rounded-xl bg-gold-400/20 flex items-center justify-center">
                                        <span className="text-sm font-black text-gold-400">{step.num}</span>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-white">{step.title}</h3>
                                        <p className="text-xs text-white/50 mt-0.5 leading-relaxed">{step.desc}</p>
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
            <div className="w-full lg:w-[52%] flex flex-col min-h-screen bg-slate-50">
                {/* Mobile header */}
                <div className="lg:hidden bg-gradient-to-r from-primary-950 to-primary-800 px-5 py-4 flex items-center gap-3">
                    <img src="/logo.png" alt="Ministry Logo" className="h-9 object-contain" />
                    <div className="h-6 w-px bg-white/20" />
                    <span className="text-xs font-bold text-white/90 uppercase tracking-wider">SDP Industrial Attachment</span>
                </div>

                {/* Scrollable form container */}
                <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
                    <div className="w-full max-w-[480px] mx-auto">
                        {/* Header badge */}
                        <div className="mb-6">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-100 border border-gold-400/30 rounded-full mb-4">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
                                <span className="text-2xs font-bold text-primary-800 uppercase tracking-wider">New Account</span>
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Create your account</h2>
                            <p className="text-sm text-slate-500 mt-1.5 font-medium">Fill in your details to register for the GoK Attachment Portal</p>
                        </div>

                        <form onSubmit={handleSubmit}>
                            {/* Error */}
                            {errorMsg && (
                                <div className="mb-5 flex items-start gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 font-medium">
                                    <svg className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>{errorMsg}</span>
                                </div>
                            )}
                            
                            <div className="space-y-4">
                                {/* Name row */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">First Name</label>
                                        <input type="text" name="first_name" placeholder="Jane" className={`${inputCls} px-4`} onChange={handleChange} required />
                                    </div>
                                    <div>
                                        <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Last Name</label>
                                        <input type="text" name="last_name" placeholder="Wanjiku" className={`${inputCls} px-4`} onChange={handleChange} required />
                                    </div>
                                </div>
                                
                                {/* Username */}
                                <div>
                                    <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Username</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                            <svg className="h-[18px] w-[18px] text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                        </div>
                                        <input type="text" name="username" placeholder="janewanjiku" className={inputCls} style={{ paddingLeft: '2.75rem', paddingRight: '1rem' }} onChange={handleChange} required />
                                    </div>
                                </div>
                                
                                {/* Email */}
                                <div>
                                    <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Email Address</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                            <svg className="h-[18px] w-[18px] text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                        </div>
                                        <input type="email" name="email" placeholder="jane@example.com" className={inputCls} style={{ paddingLeft: '2.75rem', paddingRight: '1rem' }} onChange={handleChange} required />
                                    </div>
                                </div>
                                
                                {/* Password */}
                                <div>
                                    <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                        <span>Password</span>
                                        {formData.password && (
                                            <span className={`text-2xs font-black ${strength.textColor}`}>{strength.label}</span>
                                        )}
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                            <svg className="h-[18px] w-[18px] text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                        </div>
                                        <input type={showPassword ? "text" : "password"} name="password" maxLength={16} placeholder="Create a strong password" className={inputCls} style={{ paddingLeft: '2.75rem', paddingRight: '2.75rem' }} onChange={handleChange} required />
                                        <button type="button" className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-primary-800 transition-colors focus:outline-none" onClick={() => setShowPassword(!showPassword)}>
                                            {showPassword ? (
                                                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.478 0-8.268-2.943-9.542-7z" /></svg>
                                            ) : (
                                                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                            )}
                                        </button>
                                    </div>
                                    {/* Strength meter */}
                                    <div className="h-1 w-full bg-slate-200 rounded-full mt-2 overflow-hidden">
                                        <div className={`h-full ${strength.color} transition-all duration-500 ease-out rounded-full`} style={{ width: strength.width }} />
                                    </div>
                                    <p className="text-2xs text-slate-400 mt-1 font-medium">8–16 chars with upper, lower, number & special character</p>
                                </div>

                                {/* Confirm Password */}
                                <div>
                                    <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Confirm Password</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                            <svg className="h-[18px] w-[18px] text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                        </div>
                                        <input type={showConfirmPassword ? "text" : "password"} name="confirm_password" maxLength={16} placeholder="Re-enter your password" className={inputCls} style={{ paddingLeft: '2.75rem', paddingRight: '2.75rem' }} onChange={handleChange} required />
                                        <button type="button" className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-primary-800 transition-colors focus:outline-none" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                                            {showConfirmPassword ? (
                                                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.478 0-8.268-2.943-9.542-7z" /></svg>
                                            ) : (
                                                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                            )}
                                        </button>
                                    </div>
                                    {/* Match indicator */}
                                    {formData.confirm_password && (
                                        <div className={`flex items-center gap-1.5 mt-1.5 text-2xs font-bold ${formData.password === formData.confirm_password ? 'text-emerald-600' : 'text-rose-500'}`}>
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={formData.password === formData.confirm_password ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"} />
                                            </svg>
                                            {formData.password === formData.confirm_password ? 'Passwords match' : 'Passwords do not match'}
                                        </div>
                                    )}
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
                                    disabled={loading || (formData.password && strength.score < 4)} 
                                    className={`w-full bg-gradient-to-r from-primary-800 to-primary-600 hover:from-primary-900 hover:to-primary-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-primary-600/20 hover:shadow-xl hover:shadow-primary-600/30 hover:-translate-y-[1px] active:translate-y-0 transition-all duration-200 flex justify-center items-center gap-2.5 text-sm ${(loading || (formData.password && strength.score < 4)) ? 'opacity-60 cursor-not-allowed hover:translate-y-0 hover:shadow-lg' : ''}`}
                                >
                                    {loading && (
                                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    )}
                                    {loading ? loadingMsg : 'Create Account'}
                                    {!loading && (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                    )}
                                </button>
                            </div>

                            {/* Google Sign-Up */}
                            {isGoogleEnabled && (
                                <div className="mt-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="flex-1 h-px bg-slate-200" />
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Or register with</span>
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
                                                    setErrorMsg('Google authentication failed. Please try again.');
                                                }
                                            }}
                                            onError={() => {
                                                console.log('Login Failed');
                                                setErrorMsg('Google login was cancelled or failed.');
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                            
                            {/* Sign in link */}
                            <div className="mt-6 text-center pb-4">
                                <p className="text-sm text-slate-500 font-medium">
                                    Already have an account?{' '}
                                    <Link to="/login" className="font-bold text-primary-800 hover:text-primary-900 hover:underline transition-colors decoration-2 underline-offset-4">
                                        Sign in
                                    </Link>
                                </p>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Mobile footer */}
                <div className="lg:hidden text-center py-4 border-t border-slate-200 bg-white shrink-0">
                    <p className="text-2xs text-slate-400 font-medium">
                        &copy; {new Date().getFullYear()} State Department for Petroleum
                    </p>
                </div>
            </div>
        </div>
    );
}
