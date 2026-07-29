import { queueTransactionalEmail } from './email.js';
import { platformStore } from '../store/index.js';
import { userFeaturesStore } from '../store/userFeatures/index.js';

/** In-app notification + optional email for commerce lifecycle events. */
export async function notifyUser(input: {
  userId: string;
  title: string;
  description: string;
  emailSubject?: string;
  emailBody?: string;
}) {
  try {
    await userFeaturesStore.pushNotification(input.userId, {
      title: input.title,
      description: input.description,
    });
  } catch {
    // Notifications must not break commerce flows.
  }

  const subject = input.emailSubject ?? input.title;
  const body = input.emailBody ?? input.description;
  const user = platformStore.getUserById(input.userId);
  if (!user?.email) return;
  try {
    await queueTransactionalEmail({
      to: user.email,
      subject,
      body,
    });
  } catch {
    // Email failures are retried via outbox/worker.
  }
}
