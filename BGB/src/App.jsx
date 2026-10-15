import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './context/AppContext';
import Layout from './components/layout/Layout';
import Spinner from './components/ui/Spinner';
import Login from './pages/Login';

// Route-level code splitting keeps charts/maps out of the initial bundle
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Incidents = lazy(() => import('./pages/Incidents'));
const IncidentForm = lazy(() => import('./pages/IncidentForm'));
const IncidentDetail = lazy(() => import('./pages/IncidentDetail'));
const MapView = lazy(() => import('./pages/MapView'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Reports = lazy(() => import('./pages/Reports'));
const AuditTrail = lazy(() => import('./pages/AuditTrail'));
const Admin = lazy(() => import('./pages/admin/Admin'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const Profile = lazy(() => import('./pages/Profile'));
const Messages = lazy(() => import('./pages/Messages'));
const CallLog = lazy(() => import('./pages/CallLog'));
const Alerts = lazy(() => import('./pages/Alerts'));
const AlertForm = lazy(() => import('./pages/AlertForm'));
const AlertDetail = lazy(() => import('./pages/AlertDetail'));

function RequireAuth({ children }) {
  const { currentUser } = useApp();
  const location = useLocation();
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location }} />;
  // Spec #29 — after an admin reset (or for a new account) the server allows nothing else
  if (currentUser.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return children;
}

function RequirePermission({ pageId, children }) {
  const { currentUser, hasPermission } = useApp();
  if (!hasPermission(currentUser, pageId)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  const { currentUser, booting } = useApp();

  // Restoring the session from the refresh cookie; avoid flashing the login page on reload
  if (booting) return <Spinner fullScreen />;

  return (
    <Suspense fallback={<Spinner fullScreen />}>
      <Routes>
        <Route path="/login" element={currentUser ? <Navigate to="/" replace /> : <Login />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route
            index
            element={
              <RequirePermission pageId="dashboard">
                <Dashboard />
              </RequirePermission>
            }
          />
          <Route
            path="incidents"
            element={
              <RequirePermission pageId="incidents">
                <Incidents />
              </RequirePermission>
            }
          />
          <Route
            path="incidents/new"
            element={
              <RequirePermission pageId="create">
                <IncidentForm />
              </RequirePermission>
            }
          />
          <Route
            path="incidents/:id"
            element={
              <RequirePermission pageId="incidents">
                <IncidentDetail />
              </RequirePermission>
            }
          />
          <Route path="change-password" element={<ChangePassword />} />
          {/* Own account: any signed-in user (specs #24, #28) */}
          <Route path="profile" element={<Profile />} />
          <Route
            path="incidents/:id/edit"
            element={
              // The filer (create) edits; a reviewer (incidents) modifies before approval — the server decides
              <RequirePermission pageId="incidents">
                <IncidentForm />
              </RequirePermission>
            }
          />
          <Route
            path="map"
            element={
              <RequirePermission pageId="map">
                <MapView />
              </RequirePermission>
            }
          />
          <Route
            path="analytics"
            element={
              <RequirePermission pageId="analytics">
                <Analytics />
              </RequirePermission>
            }
          />
          <Route
            path="reports"
            element={
              <RequirePermission pageId="reports">
                <Reports />
              </RequirePermission>
            }
          />
          <Route
            path="audit"
            element={
              <RequirePermission pageId="audit">
                <AuditTrail />
              </RequirePermission>
            }
          />
          {/* Flash Alerts (spec #23/#58 extension): every user receives them; raising needs raise_alert */}
          <Route path="alerts" element={<Alerts />} />
          <Route
            path="alerts/new"
            element={
              <RequirePermission pageId="raise_alert">
                <AlertForm />
              </RequirePermission>
            }
          />
          <Route path="alerts/:id" element={<AlertDetail />} />
          {/* Messaging and audio calls (spec #58 extension) */}
          <Route
            path="messages"
            element={
              <RequirePermission pageId="messages">
                <Messages />
              </RequirePermission>
            }
          />
          <Route
            path="messages/:id"
            element={
              <RequirePermission pageId="messages">
                <Messages />
              </RequirePermission>
            }
          />
          <Route
            path="calls"
            element={
              <RequirePermission pageId="messages">
                <CallLog />
              </RequirePermission>
            }
          />
          <Route
            path="admin"
            element={
              <RequirePermission pageId="admin">
                <Admin />
              </RequirePermission>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
