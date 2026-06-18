// src/router.tsx
import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';

const AdminLogin = lazy(() => import('./components/admin/AdminLogin'));
const AdminProtectedRoute = lazy(() => import('./components/admin/AdminProtectedRoute'));
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'));
const AdminQuestionnaires = lazy(() => import('./components/admin/AdminQuestionnaires'));
const AdminSessionList = lazy(() => import('./components/admin/AdminSessionList'));
const AdminSessionMonitor = lazy(() => import('./components/admin/AdminSessionMonitor'));
const AdminPositioning = lazy(() => import('./components/admin/AdminPositioning'));
const UserEntry = lazy(() => import('./components/user/UserEntry'));
const UserChat = lazy(() => import('./components/user/UserChat'));

const router = createBrowserRouter([
  { path: '/admin', element: <AdminLogin /> },
  {
    element: <AdminProtectedRoute />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/admin/dashboard', element: <AdminDashboard /> },
          { path: '/admin/questionnaires', element: <AdminQuestionnaires /> },
          { path: '/admin/sessions', element: <AdminSessionList /> },
          { path: '/admin/sessions/:sessionId', element: <AdminSessionMonitor /> },
          { path: '/admin/positioning', element: <AdminPositioning /> },
          { path: '/admin/positioning/:sessionId', element: <AdminSessionMonitor /> },
        ],
      },
    ],
  },
  { path: '/s/:sessionId', element: <UserChat /> },
  { path: '/q/:questionnaireId', element: <UserEntry /> },
  { path: '/', element: <Navigate to="/admin" replace /> },
]);

export default function Router() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center text-slate-400 text-sm">
        Chargement...
      </div>
    }>
      <RouterProvider router={router} />
    </Suspense>
  );
}
