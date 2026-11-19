import { generateMailContent, sendEmail } from '~/utils/email';
import { logger } from './logger';
import { prisma } from './prisma';

/**
 * Emails the buyer their tickets and records the outcome on the order
 * (confirmationEmailSentAt / confirmationEmailError), so organisers can see
 * who didn't get one and resend it. Never throws for a failed send.
 */
export async function sendConfirmationEmail(orderId: string, to?: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { event: { include: { organization: true } } },
  });

  const recipient =
    to ?? (order.customer as { emailAddress?: string } | null)?.emailAddress;

  const result = recipient
    ? await sendEmail({
        to: recipient,
        replyTo: order.event.organization?.email || undefined,
        subject: 'Order Confirmation - ' + order.event.title,
        content: generateMailContent(order),
      })
    : ({ ok: false, error: 'No email address for this order' } as const);

  await prisma.order.update({
    where: { id: order.id },
    data: result.ok
      ? { confirmationEmailSentAt: new Date(), confirmationEmailError: null }
      : { confirmationEmailError: result.error },
  });

  if (!result.ok) {
    logger.warn(
      { orderId: order.id, eventId: order.eventId, error: result.error },
      'confirmation email not sent',
    );
  }
  return result;
}
