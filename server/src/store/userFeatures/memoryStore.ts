import { createId, nowLabel } from '../../lib/ids.js';
import type {
  BookingRequest,
  JobApplication,
  MessageItem,
  MessageThread,
  NotificationItem,
  RentalReservation,
  TrustReport,
} from '../../types.js';
import { defaultNotifications, type UserFeaturesStore } from './types.js';

export class MemoryUserFeaturesStore implements UserFeaturesStore {
  private carts = new Map<string, Record<string, number>>();
  private wishlists = new Map<string, string[]>();
  private notifications = new Map<string, NotificationItem[]>();
  private threads = new Map<string, MessageThread[]>();
  private bookings = new Map<string, BookingRequest[]>();
  private reservations = new Map<string, RentalReservation[]>();
  private applications = new Map<string, JobApplication[]>();
  private reports = new Map<string, TrustReport[]>();
  private allReports: TrustReport[] = [];
  private seeded = false;

  async ensureSeeded() {
    this.seeded = true;
  }

  async getCart(userId: string) {
    return { ...(this.carts.get(userId) ?? {}) };
  }

  async saveCart(userId: string, cart: Record<string, number>) {
    const cleaned = Object.fromEntries(
      Object.entries(cart).filter(([, qty]) => qty > 0)
    );
    this.carts.set(userId, cleaned);
    return cleaned;
  }

  async getWishlist(userId: string) {
    return [...(this.wishlists.get(userId) ?? [])];
  }

  async saveWishlist(userId: string, productIds: string[]) {
    const next = [...new Set(productIds)];
    this.wishlists.set(userId, next);
    return next;
  }

  async listNotifications(userId: string) {
    if (!this.notifications.has(userId)) {
      this.notifications.set(userId, defaultNotifications(userId));
    }
    return [...(this.notifications.get(userId) ?? [])];
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const next = (await this.listNotifications(userId)).map((item) =>
      item.id === notificationId ? { ...item, unread: false } : item
    );
    this.notifications.set(userId, next);
    return next;
  }

  async clearAllNotifications(userId: string) {
    const next = (await this.listNotifications(userId)).map((item) => ({
      ...item,
      unread: false,
    }));
    this.notifications.set(userId, next);
    return next;
  }

  async listMessageThreads(userId: string) {
    return [...(this.threads.get(userId) ?? [])];
  }

  async sendMessage(
    userId: string,
    threadId: string,
    text: string,
    author: 'buyer' | 'seller',
    meta?: { title?: string; participant?: string }
  ) {
    const cleanText = text.trim();
    if (!cleanText) {
      return this.listMessageThreads(userId);
    }

    const message: MessageItem = {
      id: createId('msg'),
      author,
      text: cleanText,
      createdAt: nowLabel(),
    };

    const existing = (this.threads.get(userId) ?? []).find((thread) => thread.id === threadId);
    const nextThreads = existing
      ? (this.threads.get(userId) ?? []).map((thread) =>
          thread.id === threadId
            ? { ...thread, messages: [...thread.messages, message] }
            : thread
        )
      : [
          ...(this.threads.get(userId) ?? []),
          {
            id: threadId,
            title: meta?.title ?? 'New conversation',
            participant: meta?.participant ?? 'Support',
            messages: [message],
          },
        ];

    this.threads.set(userId, nextThreads);
    return nextThreads;
  }

  async listBookings(userId: string) {
    return [...(this.bookings.get(userId) ?? [])];
  }

  async createBooking(
    userId: string,
    input: Omit<BookingRequest, 'id' | 'userId' | 'createdAt' | 'status'>
  ) {
    const booking: BookingRequest = {
      id: createId('booking'),
      userId,
      status: 'requested',
      createdAt: nowLabel(),
      ...input,
    };
    const next = [booking, ...(this.bookings.get(userId) ?? [])];
    this.bookings.set(userId, next);
    return booking;
  }

  async listReservations(userId: string) {
    return [...(this.reservations.get(userId) ?? [])];
  }

  async createReservation(
    userId: string,
    input: Omit<RentalReservation, 'id' | 'userId' | 'createdAt' | 'status'> & {
      status?: RentalReservation['status'];
    }
  ) {
    const reservation: RentalReservation = {
      id: createId('rental'),
      userId,
      status: input.status ?? (input.startDate && input.endDate ? 'requested' : 'unavailable'),
      createdAt: nowLabel(),
      rentalId: input.rentalId,
      rentalTitle: input.rentalTitle,
      startDate: input.startDate,
      endDate: input.endDate,
    };
    const next = [reservation, ...(this.reservations.get(userId) ?? [])];
    this.reservations.set(userId, next);
    return reservation;
  }

  async listApplications(userId: string) {
    return [...(this.applications.get(userId) ?? [])];
  }

  async createApplication(
    userId: string,
    input: Omit<JobApplication, 'id' | 'userId' | 'createdAt' | 'status'>
  ) {
    const application: JobApplication = {
      id: createId('application'),
      userId,
      status: 'submitted',
      createdAt: nowLabel(),
      ...input,
    };
    const next = [application, ...(this.applications.get(userId) ?? [])];
    this.applications.set(userId, next);
    return application;
  }

  async listReports(userId: string) {
    return [...(this.reports.get(userId) ?? [])];
  }

  async createReport(
    userId: string,
    input: Omit<TrustReport, 'id' | 'userId' | 'createdAt' | 'status'>
  ) {
    const report: TrustReport = {
      id: createId('report'),
      userId,
      status: 'open',
      createdAt: nowLabel(),
      ...input,
    };
    const next = [report, ...(this.reports.get(userId) ?? [])];
    this.reports.set(userId, next);
    this.allReports.unshift(report);
    return report;
  }

  async listAllReports() {
    return [...this.allReports];
  }

  async updateReportStatus(reportId: string, status: TrustReport['status']) {
    const report = this.allReports.find((item) => item.id === reportId);
    if (!report) {
      throw new Error('Report not found');
    }
    report.status = status;
    for (const [userId, reports] of this.reports.entries()) {
      this.reports.set(
        userId,
        reports.map((item) => (item.id === reportId ? { ...item, status } : item))
      );
    }
    return report;
  }
}
