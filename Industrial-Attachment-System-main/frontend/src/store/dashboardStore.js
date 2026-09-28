import { create } from 'zustand';
import api from '../services/api';

const useDashboardStore = create((set) => ({
    stats: {
        profile_completion: 0,
        is_profile_complete: false,
        can_apply: false,
        missing_sections: [],
        applications_count: 0,
        latest_action: 'None',
        latest_status: null,
        latest_job_title: null,
        latest_applied_at: null,
    },
    loading: false,
    fetchStats: async () => {
        set({ loading: true });
        try {
            const res = await api.get('accounts/dashboard-stats/');
            set({ stats: res.data, loading: false });
        } catch (err) {
            console.error('Failed to fetch dashboard stats', err);
            set({ loading: false });
        }
    }
}));

export default useDashboardStore;
