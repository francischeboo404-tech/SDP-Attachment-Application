import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Vacancies from './pages/Vacancies';
import Applications from './pages/Applications';
import ManageJobs from './pages/ManageJobs';
import ManageUsers from './pages/ManageUsers';
import Departments from './pages/Departments';
import DepartmentsHub from './pages/DepartmentsHub';
import DeploymentExitHub from './pages/DeploymentExitHub';
import Deployments from './pages/Deployments';
import DirectorPortal from './pages/DirectorPortal';
import DepartmentReports from './pages/DepartmentReports';
import DepartmentArchives from './pages/DepartmentArchives';
import RequisitionQueue from './pages/RequisitionQueue';
import DepartmentClearance from './pages/DepartmentClearance';
import ClearanceQueue from './pages/ClearanceQueue';
import LetterTemplates from './pages/LetterTemplates';
import MyClearance from './pages/MyClearance';
import Reports from './pages/Reports';
import Archives from './pages/Archives';
import AuditLogs from './pages/AuditLogs';
import SystemSettings from './pages/SystemSettings';
import ForcedPasswordChangeModal from './components/ForcedPasswordChangeModal';
import useAuthStore from './store/authStore';

const PrivateRoute = ({ children }) => {
    const isAuthenticated = useAuthStore(state => state.isAuthenticated);
    if (!isAuthenticated) return <Navigate to="/login" />;
    return children;
};

const DashboardRoute = () => {
    const isAuthenticated = useAuthStore(state => state.isAuthenticated);
    const userRole = useAuthStore(state => state.user?.role);
    if (!isAuthenticated) return <Navigate to="/login" />;
    if (['ADMIN', 'HR', 'DEPARTMENT_DIRECTOR', 'DEPARTMENT'].includes(userRole)) return <Dashboard />;
    return <Navigate to="/profile" />;
};

const ApplicantRoute = ({ children }) => {
    const isAuthenticated = useAuthStore(state => state.isAuthenticated);
    const userRole = useAuthStore(state => state.user?.role);
    if (!isAuthenticated) return <Navigate to="/login" />;
    return ['ADMIN', 'HR'].includes(userRole) ? <Navigate to="/manage-jobs" /> : children;
};

const ManagementRoute = ({ children }) => {
    const isAuthenticated = useAuthStore(state => state.isAuthenticated);
    const userRole = useAuthStore(state => state.user?.role);
    if (!isAuthenticated) return <Navigate to="/login" />;
    return ['ADMIN', 'HR', 'DEPARTMENT_DIRECTOR', 'DEPARTMENT'].includes(userRole) ? children : <Navigate to="/profile" />;
};

// Admin + HR only route guard
const AdminHRRoute = ({ children }) => {
    const isAuthenticated = useAuthStore(state => state.isAuthenticated);
    const userRole = useAuthStore(state => state.user?.role);
    if (!isAuthenticated) return <Navigate to="/login" />;
    return ['ADMIN', 'HR'].includes(userRole) ? children : <Navigate to="/dashboard" />;
};

// Admin-only route guard
const AdminRoute = ({ children }) => {
    const isAuthenticated = useAuthStore(state => state.isAuthenticated);
    const userRole = useAuthStore(state => state.user?.role);
    if (!isAuthenticated) return <Navigate to="/login" />;
    return userRole === 'ADMIN' ? children : <Navigate to="/dashboard" />;
};

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
        <ForcedPasswordChangeModal />
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Dashboard */}
          <Route path="/dashboard" element={<DashboardRoute />} />

          {/* Applicant routes */}
          <Route path="/profile" element={<ApplicantRoute><Dashboard><Profile /></Dashboard></ApplicantRoute>} />
          <Route path="/applications" element={<ApplicantRoute><Dashboard><Applications /></Dashboard></ApplicantRoute>} />
          <Route path="/clearance" element={<ApplicantRoute><Dashboard><MyClearance /></Dashboard></ApplicantRoute>} />
          <Route path="/my-clearance" element={<ApplicantRoute><Dashboard><MyClearance /></Dashboard></ApplicantRoute>} />

          {/* ── NEW HUB ROUTES ─────────────────────────────────────────────── */}
          {/* Departments Hub — Admin sees 3 tabs; HR sees 1 tab */}
          <Route path="/departments-hub" element={
            <AdminHRRoute>
              <Dashboard><DepartmentsHub /></Dashboard>
            </AdminHRRoute>
          } />

          {/* Deployment & Exit Hub — Admin sees 3 tabs; HR sees 2 tabs */}
          <Route path="/deployment-exit" element={
            <AdminHRRoute>
              <Dashboard><DeploymentExitHub /></Dashboard>
            </AdminHRRoute>
          } />

          {/* ── VACANCIES — all authenticated users ──────────────────────── */}
          <Route path="/vacancies" element={<PrivateRoute><Dashboard><Vacancies /></Dashboard></PrivateRoute>} />

          {/* ── MANAGE APPLICANTS — Admin & HR ──────────────────────────── */}
          <Route path="/manage-jobs" element={
            <AdminHRRoute><Dashboard><ManageJobs /></Dashboard></AdminHRRoute>
          } />

          {/* ── DIRECTOR PORTAL ───────────────────────────────────────────── */}
          <Route path="/director-portal" element={
            <ManagementRoute><Dashboard><DirectorPortal /></Dashboard></ManagementRoute>
          } />
          <Route path="/requisitions" element={
            <ManagementRoute><Dashboard><DirectorPortal /></Dashboard></ManagementRoute>
          } />

          {/* ── DEPARTMENT-SCOPED REPORTS & ARCHIVES — Directors ──────────────
              Both views read the same server-side report/archive endpoints the
              Admin/HR modules use, but the backend hard-scopes them to the
              signed-in Director's own department.
          */}
          <Route path="/department-reports" element={
            <ManagementRoute><Dashboard><DepartmentReports /></Dashboard></ManagementRoute>
          } />
          <Route path="/department-archives" element={
            <ManagementRoute><Dashboard><DepartmentArchives /></Dashboard></ManagementRoute>
          } />

          {/* ── LETTER TEMPLATES — Admin & HR ─────────────────────────────── */}
          <Route path="/letter-templates" element={
            <AdminHRRoute><Dashboard><LetterTemplates /></Dashboard></AdminHRRoute>
          } />

          {/* ── USER ACCESS CONTROL — Admin only ──────────────────────────── */}
          <Route path="/manage-users" element={
            <AdminRoute><Dashboard><ManageUsers /></Dashboard></AdminRoute>
          } />

          {/* ── SYSTEM ARCHIVES — Admin & HR ──────────────────────────────── */}
          <Route path="/archives" element={
            <AdminHRRoute><Dashboard><Archives /></Dashboard></AdminHRRoute>
          } />

          {/* ── SYSTEM AUDIT TRAIL — Admin only ───────────────────────────── */}
          <Route path="/audit-logs" element={
            <AdminRoute><Dashboard><AuditLogs /></Dashboard></AdminRoute>
          } />

          {/* ── SYSTEM SETTINGS — Admin only ──────────────────────────────── */}
          <Route path="/settings" element={
            <AdminRoute><Dashboard><SystemSettings /></Dashboard></AdminRoute>
          } />

          {/* ── REPORTS (standalone fallback; modal is primary entry point) ─ */}
          <Route path="/reports" element={
            <AdminHRRoute><Dashboard><Reports /></Dashboard></AdminHRRoute>
          } />

          {/* ── BACKWARD-COMPAT REDIRECTS ──────────────────────────────────
              Old routes that now live inside hub pages redirect to the
              appropriate hub with the right tab param so bookmarks work.
          */}
          <Route path="/departments" element={
            <AdminHRRoute>
              <Navigate to="/departments-hub?tab=governance" replace />
            </AdminHRRoute>
          } />
          <Route path="/requisition-queue" element={
            <AdminHRRoute>
              <Navigate to="/departments-hub?tab=requisitions" replace />
            </AdminHRRoute>
          } />
          <Route path="/deployments" element={
            <ManagementRoute>
              {/* Directors go to /deployments directly; Admin/HR redirect to hub */}
              <DeploymentsRedirect />
            </ManagementRoute>
          } />
          <Route path="/department-clearance" element={
            <ManagementRoute>
              <DeptClearanceRedirect />
            </ManagementRoute>
          } />
          <Route path="/clearance-queue" element={
            <AdminHRRoute>
              <Navigate to="/deployment-exit?tab=hr-clearance" replace />
            </AdminHRRoute>
          } />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
}

/**
 * DeploymentsRedirect
 * Admin/HR → hub; Directors/Department → original Deployments page
 */
function DeploymentsRedirect() {
    const userRole = useAuthStore(state => state.user?.role);
    if (['ADMIN', 'HR'].includes(userRole)) {
        return <Navigate to="/deployment-exit?tab=deployments" replace />;
    }
    // Directors see the raw page (not the hub)
    return <Dashboard><Deployments /></Dashboard>;
}

/**
 * DeptClearanceRedirect
 * Admin → hub oversight tab; Directors/Dept → original DepartmentClearance page
 */
function DeptClearanceRedirect() {
    const userRole = useAuthStore(state => state.user?.role);
    if (userRole === 'ADMIN') {
        return <Navigate to="/deployment-exit?tab=dept-clearance" replace />;
    }
    return <Dashboard><DepartmentClearance /></Dashboard>;
}

export default App;
