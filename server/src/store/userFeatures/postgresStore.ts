import { requireSql } from '../../db/client.js';
import { migrate } from '../../db/migrate.js';
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

export class PostgresUserFeaturesStore implements UserFeaturesStore {
  private ready = false;

  async ensureSeeded() {
    if (this.ready) return;
    await migrate();
    this.ready = true;
  }

  async getCart(userId: string) {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = (await db`
      SELECT product_id, quantity FROM gridstore_cart_items WHERE user_id = ${userId}
    `) as { product_id: string; quantity: number }[];
    return Object.fromEntries(rows.map((row) => [row.product_id, row.quantity]));
  }

  async saveCart(userId: string, cart: Record<string, number>) {
    await this.ensureSeeded();
    const db = requireSql();
    const cleaned = Object.fromEntries(
      Object.entries(cart).filter(([, qty]) => qty > 0)
    );

    await db`DELETE FROM gridstore_cart_items WHERE user_id = ${userId}`;
    for (const [productId, quantity] of Object.entries(cleaned)) {
      await db`
        INSERT INTO gridstore_cart_items (user_id, product_id, quantity)
        VALUES (${userId}, ${productId}, ${quantity})
      `;
    }
    return cleaned;
  }

  async getWishlist(userId: string) {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = (await db`
      SELECT product_id FROM gridstore_wishlist_items WHERE user_id = ${userId}
    `) as { product_id: string }[];
    return rows.map((row) => row.product_id);
  }

  async saveWishlist(userId: string, productIds: string[]) {
    await this.ensureSeeded();
    const db = requireSql();
    const next = [...new Set(productIds)];

    await db`DELETE FROM gridstore_wishlist_items WHERE user_id = ${userId}`;
    for (const productId of next) {
      await db`
        INSERT INTO gridstore_wishlist_items (user_id, product_id)
        VALUES (${userId}, ${productId})
      `;
    }
    return next;
  }

  async listNotifications(userId: string) {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = (await db`
      SELECT id, title, description, created_at, unread
      FROM gridstore_notifications
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `) as {
      id: string;
      title: string;
      description: string;
      created_at: string;
      unread: boolean;
    }[];

    if (!rows.length) {
      const defaults = defaultNotifications();
      for (const item of defaults) {
        await db`
          INSERT INTO gridstore_notifications (id, user_id, title, description, created_at, unread)
          VALUES (${item.id}, ${userId}, ${item.title}, ${item.description}, ${item.createdAt}, ${item.unread})
        `;
      }
      return defaults;
    }

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      createdAt: row.created_at,
      unread: row.unread,
    }));
  }

  async markNotificationRead(userId: string, notificationId: string) {
    await this.ensureSeeded();
    const db = requireSql();
    await db`
      UPDATE gridstore_notifications
      SET unread = false
      WHERE user_id = ${userId} AND id = ${notificationId}
    `;
    return this.listNotifications(userId);
  }

  async clearAllNotifications(userId: string) {
    await this.ensureSeeded();
    const db = requireSql();
    await db`
      UPDATE gridstore_notifications SET unread = false WHERE user_id = ${userId}
    `;
    return this.listNotifications(userId);
  }

  async listMessageThreads(userId: string) {
    await this.ensureSeeded();
    const db = requireSql();
    const threadRows = (await db`
      SELECT id, title, participant FROM gridstore_message_threads WHERE user_id = ${userId}
    `) as { id: string; title: string; participant: string }[];

    const threads: MessageThread[] = [];
    for (const thread of threadRows) {
      const messageRows = (await db`
        SELECT id, author, text, created_at
        FROM gridstore_messages
        WHERE thread_id = ${thread.id}
        ORDER BY created_at ASC
      `) as { id: string; author: 'buyer' | 'seller'; text: string; created_at: string }[];

      threads.push({
        id: thread.id,
        title: thread.title,
        participant: thread.participant,
        messages: messageRows.map((row) => ({
          id: row.id,
          author: row.author,
          text: row.text,
          createdAt: row.created_at,
        })),
      });
    }
    return threads;
  }

  async sendMessage(
    userId: string,
    threadId: string,
    text: string,
    author: 'buyer' | 'seller',
    meta?: { title?: string; participant?: string }
  ) {
    await this.ensureSeeded();
    const cleanText = text.trim();
    if (!cleanText) return this.listMessageThreads(userId);

    const db = requireSql();
    const existing = (await db`
      SELECT id FROM gridstore_message_threads WHERE id = ${threadId} AND user_id = ${userId}
    `) as { id: string }[];

    if (!existing.length) {
      await db`
        INSERT INTO gridstore_message_threads (id, user_id, title, participant)
        VALUES (${threadId}, ${userId}, ${meta?.title ?? 'New conversation'}, ${meta?.participant ?? 'Support'})
      `;
    }

    const messageId = createId('msg');
    await db`
      INSERT INTO gridstore_messages (id, thread_id, author, text, created_at)
      VALUES (${messageId}, ${threadId}, ${author}, ${cleanText}, ${nowLabel()})
    `;

    return this.listMessageThreads(userId);
  }

  async listBookings(userId: string) {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_bookings WHERE user_id = ${userId} ORDER BY created_at DESC
    `) as Record<string, string>[];
    return rows.map(mapBooking);
  }

  async createBooking(
    userId: string,
    input: Omit<BookingRequest, 'id' | 'userId' | 'createdAt' | 'status'>
  ) {
    await this.ensureSeeded();
    const db = requireSql();
    const booking: BookingRequest = {
      id: createId('booking'),
      userId,
      status: 'requested',
      createdAt: nowLabel(),
      ...input,
    };

    await db`
      INSERT INTO gridstore_bookings (
        id, user_id, service_id, service_title, provider, requested_date, note, status, created_at
      ) VALUES (
        ${booking.id}, ${booking.userId}, ${booking.serviceId}, ${booking.serviceTitle},
        ${booking.provider}, ${booking.requestedDate}, ${booking.note}, ${booking.status}, ${booking.createdAt}
      )
    `;
    return booking;
  }

  async listReservations(userId: string) {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_rental_reservations WHERE user_id = ${userId} ORDER BY created_at DESC
    `) as Record<string, string>[];
    return rows.map(mapReservation);
  }

  async createReservation(
    userId: string,
    input: Omit<RentalReservation, 'id' | 'userId' | 'createdAt' | 'status'> & {
      status?: RentalReservation['status'];
    }
  ) {
    await this.ensureSeeded();
    const db = requireSql();
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

    await db`
      INSERT INTO gridstore_rental_reservations (
        id, user_id, rental_id, rental_title, start_date, end_date, status, created_at
      ) VALUES (
        ${reservation.id}, ${reservation.userId}, ${reservation.rentalId}, ${reservation.rentalTitle},
        ${reservation.startDate}, ${reservation.endDate}, ${reservation.status}, ${reservation.createdAt}
      )
    `;
    return reservation;
  }

  async listApplications(userId: string) {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_job_applications WHERE user_id = ${userId} ORDER BY created_at DESC
    `) as Record<string, string>[];
    return rows.map(mapApplication);
  }

  async createApplication(
    userId: string,
    input: Omit<JobApplication, 'id' | 'userId' | 'createdAt' | 'status'>
  ) {
    await this.ensureSeeded();
    const db = requireSql();
    const application: JobApplication = {
      id: createId('application'),
      userId,
      status: 'submitted',
      createdAt: nowLabel(),
      ...input,
    };

    await db`
      INSERT INTO gridstore_job_applications (
        id, user_id, job_id, job_title, applicant_name, cv_file_name, status, created_at
      ) VALUES (
        ${application.id}, ${application.userId}, ${application.jobId}, ${application.jobTitle},
        ${application.applicantName}, ${application.cvFileName}, ${application.status}, ${application.createdAt}
      )
    `;
    return application;
  }

  async listReports(userId: string) {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_trust_reports WHERE user_id = ${userId} ORDER BY created_at DESC
    `) as Record<string, string>[];
    return rows.map(mapReport);
  }

  async createReport(
    userId: string,
    input: Omit<TrustReport, 'id' | 'userId' | 'createdAt' | 'status'>
  ) {
    await this.ensureSeeded();
    const db = requireSql();
    const report: TrustReport = {
      id: createId('report'),
      userId,
      status: 'open',
      createdAt: nowLabel(),
      ...input,
    };

    await db`
      INSERT INTO gridstore_trust_reports (
        id, user_id, target_type, target_id, reason, status, created_at
      ) VALUES (
        ${report.id}, ${report.userId}, ${report.targetType}, ${report.targetId},
        ${report.reason}, ${report.status}, ${report.createdAt}
      )
    `;
    return report;
  }

  async listAllReports() {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_trust_reports ORDER BY created_at DESC
    `) as Record<string, string>[];
    return rows.map(mapReport);
  }

  async updateReportStatus(reportId: string, status: TrustReport['status']) {
    await this.ensureSeeded();
    const db = requireSql();
    await db`
      UPDATE gridstore_trust_reports SET status = ${status} WHERE id = ${reportId}
    `;
    const rows = (await db`
      SELECT * FROM gridstore_trust_reports WHERE id = ${reportId}
    `) as Record<string, string>[];
    if (!rows.length) {
      throw new Error('Report not found');
    }
    return mapReport(rows[0]!);
  }
}

function mapBooking(row: Record<string, string>): BookingRequest {
  return {
    id: row.id,
    userId: row.user_id,
    serviceId: row.service_id,
    serviceTitle: row.service_title,
    provider: row.provider,
    requestedDate: row.requested_date,
    note: row.note,
    status: row.status as BookingRequest['status'],
    createdAt: row.created_at,
  };
}

function mapReservation(row: Record<string, string>): RentalReservation {
  return {
    id: row.id,
    userId: row.user_id,
    rentalId: row.rental_id,
    rentalTitle: row.rental_title,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status as RentalReservation['status'],
    createdAt: row.created_at,
  };
}

function mapApplication(row: Record<string, string>): JobApplication {
  return {
    id: row.id,
    userId: row.user_id,
    jobId: row.job_id,
    jobTitle: row.job_title,
    applicantName: row.applicant_name,
    cvFileName: row.cv_file_name,
    status: row.status as JobApplication['status'],
    createdAt: row.created_at,
  };
}

function mapReport(row: Record<string, string>): TrustReport {
  return {
    id: row.id,
    userId: row.user_id,
    targetType: row.target_type as TrustReport['targetType'],
    targetId: row.target_id,
    reason: row.reason,
    status: row.status as TrustReport['status'],
    createdAt: row.created_at,
  };
}
