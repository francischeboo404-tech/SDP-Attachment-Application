import { useState } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function Register() {
    const [formData, setFormData] = useState({ 
        username: '', email: '', password: '', 
        first_name: '', last_name: '' 
    });
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg(null);
        try {
            await api.post('accounts/register/', formData);
            alert('Registration Successful! Please login.');
            navigate('/login');
        } catch (error) {
            console.error('Registration failed', error);
            if (error.response?.data) {
                // Formatting dictionary response errors into a string
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

    return (
        <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-gray-50 to-primary-100 py-10">
            <div className="w-full max-w-lg mx-4">
                <form onSubmit={handleSubmit} className="glass p-10 rounded-2xl relative">
                    <div className="text-center mb-8">
                        <div className="mx-auto w-full flex items-center justify-center mb-6">
                            <img src="/logo.png" alt="Ministry Logo" className="h-[75px] object-contain drop-shadow-sm" />
                        </div>
                        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Create Account</h2>
                        <p className="text-sm text-gray-600 mt-2 font-medium">Join the GoK Career Portal</p>
                    </div>
                    
                    {errorMsg && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium animate-pulse">
                            {errorMsg}
                        </div>
                    )}
                    
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="relative">
                                <label className="text-sm font-semibold text-gray-700 mb-1 block">First Name</label>
                                <input type="text" name="first_name" placeholder="John" className="w-full px-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary-200 focus:border-primary-400 focus:outline-none transition-all placeholder-gray-400" onChange={handleChange} required />
                            </div>
                            <div className="relative">
                                <label className="text-sm font-semibold text-gray-700 mb-1 block">Last Name</label>
                                <input type="text" name="last_name" placeholder="Doe" className="w-full px-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary-200 focus:border-primary-400 focus:outline-none transition-all placeholder-gray-400" onChange={handleChange} required />
                            </div>
                        </div>
                        
                        {/* Role selection has been securely restricted to backend-only default APPLICANT hooks */}
                        
                        <div className="relative">
                            <label className="text-sm font-semibold text-gray-700 mb-1 block">Username (ID Number)</label>
                            <input type="text" name="username" placeholder="e.g. 12345678" className="w-full px-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary-200 focus:border-primary-400 focus:outline-none transition-all placeholder-gray-400" onChange={handleChange} required />
                        </div>
                        
                        <div className="relative">
                            <label className="text-sm font-semibold text-gray-700 mb-1 block">Email Address</label>
                            <input type="email" name="email" placeholder="john.doe@example.com" className="w-full px-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary-200 focus:border-primary-400 focus:outline-none transition-all placeholder-gray-400" onChange={handleChange} required />
                        </div>
                        
                        <div className="relative">
                            <label className="text-sm font-semibold text-gray-700 mb-1 block">Password</label>
                            <input type="password" name="password" placeholder="ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó" className="w-full px-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary-200 focus:border-primary-400 focus:outline-none transition-all placeholder-gray-400" onChange={handleChange} required />
                        </div>
                        
                        <button type="submit" disabled={loading} className={`w-full bg-primary hover:bg-primary-600 text-white font-bold py-3.5 rounded-xl shadow-[0_4px_14px_0_rgba(227,188,117,0.39)] hover:shadow-[0_6px_20px_rgba(227,188,117,0.23)] hover:-translate-y-0.5 transition-all duration-200 mt-2 ${loading ? 'opacity-70 cursor-wait' : ''}`}>
                            {loading ? 'Processing...' : 'Register Account'}
                        </button>
                    </div>
                    
                    <div className="mt-8 text-center border-t border-gray-200 pt-6">
                        <p className="text-gray-600 text-sm">
                            Already have an account?{' '}
                            <a href="/login" className="font-semibold text-primary-600 hover:text-primary-700 hover:underline transition-colors">
                                Sign in
                            </a>
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
}
