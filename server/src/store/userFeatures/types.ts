import type {
  BookingRequest,
  JobApplication,
  MessageThread,
  NotificationItem,
  RentalReservation,
  TrustReport,
} from '../../types.js';

export interface UserFeaturesStore {
  ensureSeeded(): Promise<void>;
  getCart(userId: string): Promise<Record<string, number>>;
  saveCart(userId: string, cart: Record<string, number>): Promise<Record<string, number>>;
  getWishlist(userId: string): Promise<string[]>;
  saveWishlist(userId: string, productIds: string[]): Promise<string[]>;
  listNotifications(userId: string): Promise<NotificationItem[]>;
  markNotificationRead(userId: string, notificationId: string): Promise<NotificationItem[]>;
  clearAllNotifications(userId: string): Promise<NotificationItem[]>;
  listMessageThreads(userId: string): Promise<MessageThread[]>;
  sendMessage(
    userId: string,
    threadId: string,
    text: string,
    author: 'buyer' | 'seller',
    meta?: { title?: string; participant?: string }
  ): Promise<MessageThread[]>;
  listBookings(userId: string): Promise<BookingRequest[]>;
  createBooking(
    userId: string,
    input: Omit<BookingRequest, 'id' | 'userId' | 'createdAt' | 'status'>
  ): Promise<BookingRequest>;
  listReservations(userId: string): Promise<RentalReservation[]>;
  createReservation(
    userId: string,
    input: Omit<RentalReservation, 'id' | 'userId' | 'createdAt' | 'status'> & {
      status?: RentalReservation['status'];
    }
  ): Promise<RentalReservation>;
  listApplications(userId: string): Promise<JobApplication[]>;
  createApplication(
    userId: string,
    input: Omit<JobApplication, 'id' | 'userId' | 'createdAt' | 'status'>
  ): Promise<JobApplication>;
  listReports(userId: string): Promise<TrustReport[]>;
  createReport(
    userId: string,
    input: Omit<TrustReport, 'id' | 'userId' | 'createdAt' | 'status'>
  ): Promise<TrustReport>;
  updateReportStatus(reportId: string, status: TrustReport['status']): Promise<TrustReport>;
  listAllReports(): Promise<TrustReport[]>;
}

export function defaultNotifications(): NotificationItem[] {
  return [
    {
      id: 'notif-welcome',
      title: 'Welcome to GridMarket AI',
      description: 'Your account is ready. Browse listings or start selling today.',
      createdAt: 'Just now',
      unread: true,
    },
  ];
}
