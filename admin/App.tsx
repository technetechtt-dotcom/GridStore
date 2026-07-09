import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider } from '../src/components/theme/ThemeProvider';
import { AppProvider } from '../src/context/AppContext';
import { PlatformConnectionBanner } from '../src/components/common/PlatformConnectionBanner';
import { PlatformConnectionProvider } from '../src/providers/PlatformConnectionProvider';
import { AdminLayout } from '../src/pages/admin/AdminLayout';
import {
  AdminAuctions,
  AdminJobs,
  AdminMarketplace,
  AdminRentals,
  AdminServices,
} from '../src/pages/admin/AdminMarketplacePages';
import {
  AdminAiMonitoring,
  AdminAnalytics,
  AdminDashboard,
  AdminDisputes,
  AdminListings,
  AdminModeration,
  AdminOrders,
  AdminPayments,
  AdminSettings,
  AdminStores,
  AdminUsers,
} from '../src/pages/admin/AdminPages';
import { AdminLogin } from './AdminLogin';
import { AdminProtectedRoute } from './AdminProtectedRoute';

export function AdminApp() {
  return (
    <ThemeProvider>
      <AppProvider skipPlatformSync>
        <PlatformConnectionProvider monitorIntervalMs={60000}>
        <PlatformConnectionBanner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<AdminLogin />} />
            <Route element={<AdminProtectedRoute />}>
              <Route element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="stores" element={<AdminStores />} />
                <Route path="marketplace" element={<AdminMarketplace />} />
                <Route path="auctions" element={<AdminAuctions />} />
                <Route path="services" element={<AdminServices />} />
                <Route path="rentals" element={<AdminRentals />} />
                <Route path="jobs" element={<AdminJobs />} />
                <Route path="listings" element={<AdminListings />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="payments" element={<AdminPayments />} />
                <Route path="disputes" element={<AdminDisputes />} />
                <Route path="moderation" element={<AdminModeration />} />
                <Route path="analytics" element={<AdminAnalytics />} />
                <Route path="ai" element={<AdminAiMonitoring />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </PlatformConnectionProvider>
        <Toaster position="top-right" richColors closeButton />
      </AppProvider>
    </ThemeProvider>
  );
}
