import { useState } from 'react';
import useAuthStore from '../store/authStore';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function Login() {
    const [credentials, setCredentials] = useState({ username: '', password: '' });
    const setAuth = useAuthStore(state => state.setAuth);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const { data } = await api.post('accounts/login/', credentials);
            const userData = data.user || { username: credentials.username };
            setAuth(userData, data.access);
            
            if (userData.role === 'ADMIN') {
                navigate('/manage-jobs');
            } else {
                navigate('/dashboard');
            }
        } catch (error) {
            console.error('Login failed', error);
        }
    };

    return (
        <div className="flex flex-col lg:flex-row min-h-screen bg-white">
            {/* Left Informational Side */}
            <div className="w-full lg:w-1/2 bg-primary text-slate-900 relative overflow-hidden flex flex-col justify-center lg:justify-between p-8 md:p-12">
                {/* Abstract Background Design */}
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-30 pointer-events-none">
                    <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-white blur-3xl"></div>
                    <div className="absolute top-1/2 -left-20 w-72 h-72 rounded-full bg-white blur-3xl"></div>
                </div>

                <div className="relative z-10">
                    <div className="bg-white/40 backdrop-blur-sm inline-flex p-3 rounded-2xl mb-8 border border-white/50">
                        <img src="/logo.png" alt="Ministry Logo" className="h-[50px] md:h-[60px] object-contain drop-shadow-md" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black mb-6 leading-tight tracking-tight text-slate-900">
                        Empowering Youth<br/>
                        <span className="text-slate-800 opacity-90">Through Excellence</span>
                    </h1>
                    <p className="text-base md:text-lg text-slate-800 leading-relaxed max-w-lg mb-8 font-medium">
                        Welcome to the State Department for Petroleum's E-Recruitment Portal. This platform is purposefully built to ensure transparent, merit-based, and seamless processing of internship and industrial attachment opportunities.
                    </p>
                    
                    <div className="space-y-6">
                        <div className="flex items-start space-x-4">
                            <div className="w-10 h-10 rounded-full bg-white/40 flex items-center justify-center shrink-0 border border-white/50">
                                <svg className="w-5 h-5 text-slate-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900">Automated Verification</h3>
                                <p className="text-sm text-slate-800/80">Intelligent criteria matching ensures fair vetting</p>
                            </div>
                        </div>
                        <div className="flex items-start space-x-4">
                            <div className="w-10 h-10 rounded-full bg-white/40 flex items-center justify-center shrink-0 border border-white/50">
                                <svg className="w-5 h-5 text-slate-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900">Secure Processing</h3>
                                <p className="text-sm text-slate-800/80">Multi-stage document validations and security compliance</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="relative z-10 pt-12 text-sm text-slate-800/80 font-bold">
                    &copy; {new Date().getFullYear()} State Department for Petroleum. All rights reserved.
                </div>
            </div>

            {/* Right Login Form Side */}
            <div className="w-full lg:w-1/2 flex items-center justify-center bg-gray-50/50 p-6 md:p-12 relative">
                <div className="w-full max-w-md">
                    <form onSubmit={handleSubmit} className="bg-white p-8 md:p-10 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 transition-all">
                        <div className="text-center mb-10">
                            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Sign In</h2>
                            <p className="text-sm text-gray-500 mt-2 font-medium">Access your portal applicant dashboard</p>
                        </div>
                        <div className="space-y-6">
                            <div className="relative group">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block group-focus-within:text-primary-600 transition-colors">Username</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <svg className="h-5 w-5 text-gray-400 group-focus-within:text-primary-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    </div>
                                    <input
                                        type="text" placeholder="Enter your username"
                                        className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-primary-100 focus:border-primary-400 focus:outline-none transition-all placeholder-gray-400 font-medium text-gray-900"
                                        value={credentials.username}
                                        onChange={e => setCredentials({...credentials, username: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="relative group">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block group-focus-within:text-primary-600 transition-colors">Password</label>
                                <div className="relative">
                                     <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <svg className="h-5 w-5 text-gray-400 group-focus-within:text-primary-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                    </div>
                                    <input
                                        type="password" placeholder="ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó"
                                        className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-primary-100 focus:border-primary-400 focus:outline-none transition-all placeholder-gray-400 font-medium text-gray-900"
                                        value={credentials.password}
                                        onChange={e => setCredentials({...credentials, password: e.target.value})}
                                    />
                                </div>
                            </div>
                            <button type="submit" className="w-full bg-primary hover:bg-primary-600 text-white font-bold py-4 rounded-xl shadow-[0_4px_14px_0_rgba(227,188,117,0.39)] hover:shadow-[0_6px_20px_rgba(227,188,117,0.23)] hover:-translate-y-0.5 transition-all duration-300 mt-4 flex justify-center items-center gap-2">
                                Sign In to Portal
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                            </button>
                        </div>
                        <div className="mt-8 text-center border-t border-gray-100 pt-6">
                            <p className="text-gray-600 text-sm font-medium">
                                Don't have an account?{' '}
                                <a href="/register" className="font-bold text-primary-600 hover:text-primary-800 hover:underline transition-colors decoration-2 underline-offset-4">
                                    Create one here
                                </a>
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
