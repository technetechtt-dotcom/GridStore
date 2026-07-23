import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { AppProvider } from './context/AppContext';
import { PlatformConnectionProvider } from './providers/PlatformConnectionProvider';
import { AppLayout } from './components/layout/AppLayout';
import { Home } from './pages/Home';
import {
  Marketplace,
  ProductDetail,
  Auctions,
  Services,
  Rentals,
  Jobs,
  SellerDashboard,
  BuyerDashboard,
  Messages } from
    './pages/Placeholders';
import { StoresDirectory, StoreDetail } from './pages/StorePages';
import { NotFound } from './pages/NotFound';
import { Login, Signup } from './pages/Auth';
import { EmailVerifyPage, PasswordResetPage } from './pages/AuthRecovery';
import { Cart, Checkout, OrderHistory, Wishlist, Notifications } from './pages/UserPages';
import { Privacy, Terms } from './pages/Legal';
import { useScreenInit } from './useScreenInit';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
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
} from './pages/admin/AdminPages';
import { AdminLayout } from './pages/admin/AdminLayout';
import {
  AdminAuctions,
  AdminJobs,
  AdminMarketplace,
  AdminRentals,
  AdminServices,
} from './pages/admin/AdminMarketplacePages';
import { DeliveryTrackingPage } from './pages/delivery/DeliveryPages';
import { PaymentMethodsPage, WalletPage } from './pages/payments/PaymentPages';
import {
  Advertising,
  BookingDetail,
  CvUpload,
  EmployerDashboard,
  FlashSales,
  HelpCenter,
  JobDetail,
  LocaleSettings,
  PricingToolsPage,
  ProfileSettings,
  RentalDetail,
  SellerToolsPage,
  ServiceDetail,
  StoreCreate,
  TrustSafety,
} from './pages/PlatformPages';
export function App() {
  useScreenInit();
  return (
    <ThemeProvider>
      <AppProvider>
        <PlatformConnectionProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/marketplace" element={<Marketplace />} />
              <Route path="/auctions" element={<Auctions />} />
              <Route path="/flash-sales" element={<FlashSales />} />
              <Route path="/product/:id" element={<ProductDetail />} />
              <Route path="/services" element={<Services />} />
              <Route path="/services/:id" element={<ServiceDetail />} />
              <Route path="/rentals" element={<Rentals />} />
              <Route path="/rentals/:id" element={<RentalDetail />} />
              <Route path="/jobs" element={<Jobs />} />
              <Route path="/jobs/cv-upload" element={<CvUpload />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route path="/employers" element={<EmployerDashboard />} />
              <Route
                path="/seller"
                element={
                  <ProtectedRoute roles={['seller', 'admin']}>
                    <SellerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/seller/ai-listing"
                element={
                  <ProtectedRoute roles={['seller', 'admin']}>
                    <SellerToolsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/seller/pricing"
                element={
                  <ProtectedRoute roles={['seller', 'admin']}>
                    <PricingToolsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <BuyerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route path="/store" element={<StoresDirectory />} />
              <Route path="/stores" element={<StoresDirectory />} />
              <Route
                path="/store/create"
                element={
                  <ProtectedRoute roles={['seller', 'admin']}>
                    <StoreCreate />
                  </ProtectedRoute>
                }
              />
              <Route path="/store/:id" element={<StoreDetail />} />
              <Route
                path="/messages"
                element={
                  <ProtectedRoute>
                    <Messages />
                  </ProtectedRoute>
                }
              />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/password-reset" element={<PasswordResetPage />} />
              <Route path="/verify-email" element={<EmailVerifyPage />} />
              <Route path="/cart" element={<Cart />} />
              <Route
                path="/checkout"
                element={
                  <ProtectedRoute>
                    <Checkout />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/orders"
                element={
                  <ProtectedRoute>
                    <OrderHistory />
                  </ProtectedRoute>
                }
              />
              <Route path="/wishlist" element={<Wishlist />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/profile/settings" element={<ProfileSettings />} />
              <Route path="/bookings/:id" element={<BookingDetail />} />
              <Route path="/help" element={<HelpCenter />} />
              <Route path="/trust-safety" element={<TrustSafety />} />
              <Route path="/payments/wallet" element={<WalletPage />} />
              <Route path="/payments/methods" element={<PaymentMethodsPage />} />
              <Route path="/delivery/tracking" element={<DeliveryTrackingPage />} />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute roles={['admin', 'moderator']}>
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
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
              <Route path="/advertising" element={<Advertising />} />
              <Route path="/settings/region" element={<LocaleSettings />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
        </PlatformConnectionProvider>
        <Toaster position="top-right" richColors closeButton />
      </AppProvider>
    </ThemeProvider>
  );

}
