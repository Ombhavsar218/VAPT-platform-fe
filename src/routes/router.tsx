import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { AdminJobsPage } from '@/pages/admin/AdminJobsPage'
import { AdminLayout } from '@/pages/admin/AdminLayout'
import { AdminModulesPage } from '@/pages/admin/AdminModulesPage'
import { AdminOverviewPage } from '@/pages/admin/AdminOverviewPage'
import { AdminAuditLogsPage } from '@/pages/admin/AdminAuditLogsPage'
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { CoveragePage } from '@/pages/coverage/CoveragePage'
import { FindingDetailPage } from '@/pages/findings/FindingDetailPage'
import { FindingsPage } from '@/pages/findings/FindingsPage'
import { ProjectDetailPage } from '@/pages/projects/ProjectDetailPage'
import { ProjectsPage } from '@/pages/projects/ProjectsPage'
import { ReportPreviewPage } from '@/pages/reports/ReportPreviewPage'
import { ReportsPage } from '@/pages/reports/ReportsPage'
import { ScanComparePage } from '@/pages/scans/ScanComparePage'
import { ScanDetailPage } from '@/pages/scans/ScanDetailPage'
import { ScanNewPage } from '@/pages/scans/ScanNewPage'
import { ScansPage } from '@/pages/scans/ScansPage'
import { ModulesPage } from '@/pages/modules/ModulesPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { TargetDetailPage } from '@/pages/targets/TargetDetailPage'
import { TargetsPage } from '@/pages/targets/TargetsPage'
import { VerificationDetailPage } from '@/pages/verification/VerificationDetailPage'
import { VerificationQueuePage } from '@/pages/verification/VerificationQueuePage'
import { ProtectedRoute } from './ProtectedRoute'
import { RequireRole } from './RequireRole'
import { RouteError } from './RouteError'
import { ADMIN_ROLES } from '@/utils/roles'

/**
 * Application route table.
 *
 * Ordering matters in two places:
 *  - `/scans/compare` must be declared before `/scans/:id`, otherwise
 *    "compare" is captured as a scan id.
 *  - `/admin/users` etc. must precede the `/admin` layout's own index route.
 *
 * Each branch carries an `errorElement` so a failure stays contained.
 */
export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
    errorElement: <RouteError />,
  },

  {
    element: <ProtectedRoute />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppLayout />,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },

          { path: 'dashboard', element: <DashboardPage /> },

          { path: 'projects', element: <ProjectsPage /> },
          { path: 'projects/:projectId', element: <ProjectDetailPage /> },

          { path: 'targets', element: <TargetsPage /> },
          { path: 'targets/:targetId', element: <TargetDetailPage /> },

          // `compare` before the `:scanId` param route.
          { path: 'scans/compare', element: <ScanComparePage /> },
          { path: 'scans/new', element: <ScanNewPage /> },
          { path: 'scans', element: <ScansPage /> },
          { path: 'scans/:scanId', element: <ScanDetailPage /> },

          { path: 'findings', element: <FindingsPage /> },
          { path: 'findings/:findingId', element: <FindingDetailPage /> },

          { path: 'verification', element: <VerificationQueuePage /> },
          { path: 'verification/:taskId', element: <VerificationDetailPage /> },

          { path: 'reports', element: <ReportsPage /> },
          { path: 'reports/:reportId', element: <ReportPreviewPage /> },

          { path: 'coverage', element: <CoveragePage /> },
          { path: 'modules', element: <ModulesPage /> },
          { path: 'settings', element: <SettingsPage /> },

          // Administration is additionally role-gated; see `RequireRole`.
          {
            element: <RequireRole roles={ADMIN_ROLES} />,
            children: [
              {
                path: 'admin',
                element: <AdminLayout />,
                errorElement: <RouteError />,
                children: [
                  { index: true, element: <AdminOverviewPage /> },
                  { path: 'users', element: <AdminUsersPage /> },
                  { path: 'modules', element: <AdminModulesPage /> },
                  { path: 'jobs', element: <AdminJobsPage /> },
                  { path: 'audit-logs', element: <AdminAuditLogsPage /> },
                ],
              },
            ],
          },

          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
