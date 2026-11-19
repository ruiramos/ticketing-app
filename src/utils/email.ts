import Mailjet from 'node-mailjet';
import { env } from '~/server/env';
import { logger } from '~/server/logger';
import { metrics } from '~/server/metrics';
import type {
  Event,
  Order as OurOrder,
  Organization,
} from '~/generated/prisma/client';

const mailjet = new Mailjet({
  apiKey: env.MAILJET_API_KEY,
  apiSecret: env.MAILJET_API_SECRET,
});

const FROM_EMAIL_ADDRESS = 'ticketing@ruiramos.com';

interface SendMailProps {
  to: string | string[];
  subject: string;
  content: string;
  replyTo?: string;
}

type SendResult = { ok: true } | { ok: false; error: string };

/** Sends one email. Never throws: the outcome is returned (and counted). */
export async function sendEmail({
  to,
  subject,
  content,
  replyTo,
}: SendMailProps): Promise<SendResult> {
  try {
    const recipients = (Array.isArray(to) ? to : [to]).map((email) => ({
      Email: email,
    }));
    const result = await mailjet.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: { Email: FROM_EMAIL_ADDRESS },
          To: recipients,
          Subject: subject,
          HTMLPart: content,
          ...(replyTo ? { ReplyTo: { Email: replyTo } } : {}),
        },
      ],
    });
    // Mailjet answers 200 even when it rejects a message, with the
    // message's own status in the body
    const status = (result.body as { Messages?: { Status?: string }[] })
      ?.Messages?.[0]?.Status;
    if (status && status !== 'success') {
      throw new Error(`Mailjet message status: ${status}`);
    }
    metrics.emailsSent.inc({ outcome: 'sent' });
    return { ok: true };
  } catch (e) {
    metrics.emailsSent.inc({ outcome: 'failed' });
    // recipient address deliberately not logged
    logger.error({ err: e, subject }, 'failed to send email');
    const error = (e as { statusCode?: number; message?: string }) ?? {};
    return {
      ok: false,
      error: [error.statusCode, error.message ?? String(e)]
        .filter(Boolean)
        .join(' ')
        .slice(0, 500),
    };
  }
}

type OrderWithEvent = OurOrder & {
  event: Event & { organization: Organization | null };
};

/** The buyer's order page, which is their ticket (null if the site URL isn't set). */
export function ticketUrl(order: { id: string; eventId: string }) {
  return env.DEPLOYED_URL
    ? new URL(
        `/events/${order.eventId}/orders/${order.id}`,
        env.DEPLOYED_URL,
      ).toString()
    : null;
}

/** "Your tickets": built from the stored order, so it can be resent later. */
export function generateMailContent(ourOrder: OrderWithEvent) {
  const { event } = ourOrder;
  const org = event.organization;
  const customer = (ourOrder.customer ?? {}) as {
    name?: { givenName?: string };
  };
  const items = (Array.isArray(ourOrder.items) ? ourOrder.items : []) as {
    name?: string;
    quantity?: string;
  }[];
  const ticketLink = ticketUrl(ourOrder);

  return `
<p>Dear ${escapeHtml(customer.name?.givenName ?? '')},</p>

<p>Hello from ${escapeHtml(org?.name ?? '')}!</p>

<p>We're thrilled to confirm your order for the ${escapeHtml(event.title)}.${
    org?.emailMessage ? `<br/>\n${escapeHtml(org.emailMessage)}` : ''
  }</p>
${
  ticketLink
    ? `
<p><strong><a href="${ticketLink}">View your tickets</a></strong><br/>
Show this email or that page at the event. Keep the link: it's your ticket.</p>
`
    : ''
}
<p>Here are the details of your order:</p>

<strong>Booking reference:</strong> ${escapeHtml(ourOrder.id)}<br/>
${items
  .map((item, i) =>
    i === 0
      ? `${escapeHtml(item.quantity ?? String(ourOrder.quantity))} ticket(s) for: ${escapeHtml(item.name ?? '')}`
      : escapeHtml(item.name ?? ''),
  )
  .join('<br/>')}<br/>
<strong>Total:</strong> ${escapeHtml(formatMoney(ourOrder.amount, ourOrder.currency))}
${customFieldDetails(ourOrder)}
${eventDetails(event)}
${
  event.emailNotes?.trim()
    ? `<p>Some more details about the event:</p>\n\n${formatNotes(event.emailNotes)}\n`
    : ''
}
<p>Of course, we're here to help.${
    org?.email
      ? ` If you have any questions or concerns, simply drop us a line at ${escapeHtml(org.email)}.`
      : ''
  } <br/><br/>
Thank you and see you at the ${escapeHtml(event.title)}!</p>`;
}

/**
 * Email to the buyer when an organiser cancels their order, saying whether
 * (and how much) was refunded.
 */
export function generateCancellationMailContent({
  givenName,
  eventTitle,
  organizationName,
  organizationEmail,
  reason,
  refund,
}: {
  givenName?: string;
  eventTitle: string;
  organizationName?: string | null;
  organizationEmail?: string | null;
  // the organiser's note to the buyer, with or without a refund
  reason?: string | null;
  // undefined: no refund made through the app
  refund?: {
    amount: number;
    currency: string;
    pending: boolean;
  };
}) {
  const refundText = refund
    ? `<p>A refund of ${escapeHtml(formatMoney(refund.amount, refund.currency))} ${
        refund.pending
          ? 'has been requested and should reach your PayPal account shortly'
          : 'has been issued to your PayPal account; it can take a few days to show'
      }.</p>`
    : '';
  const reasonText = reason
    ? `<p>Note from the organiser: ${escapeHtml(reason)}</p>`
    : '';

  return `<p>Dear ${escapeHtml(givenName ?? '')},</p>

<p>Your order for the ${escapeHtml(eventTitle)} has been cancelled${
    organizationName ? ` by ${escapeHtml(organizationName)}` : ''
  }.</p>
${refundText}
${reasonText}
<p>${
    organizationEmail
      ? `If you have any questions, simply reply to this email or write to ${escapeHtml(organizationEmail)}.`
      : 'If you have any questions, simply reply to this email.'
  }</p>`;
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatEventDate(event: Event) {
  // All events are currently UK based
  const timeZone = 'Europe/London';
  const date = event.startsAt.toLocaleDateString('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = (d: Date) =>
    d.toLocaleTimeString('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
    });

  return event.endsAt
    ? `${date}, ${time(event.startsAt)} - ${time(event.endsAt)}`
    : `${date}, ${time(event.startsAt)}`;
}

function eventDetails(event: Event) {
  const eventUrl = env.DEPLOYED_URL
    ? new URL(`/events/${event.id}`, env.DEPLOYED_URL).toString()
    : null;

  return `
<p><strong>When:</strong> ${formatEventDate(event)}<br/>${
    event.location
      ? `\n<strong>Where:</strong> ${escapeHtml(event.location)}<br/>`
      : ''
  }${
    eventUrl
      ? `\n<strong>Event page:</strong> <a href="${eventUrl}">${eventUrl}</a><br/>`
      : ''
  }</p>
`;
}

function customFieldDetails(ourOrder: OurOrder) {
  const responses = Object.values(
    (ourOrder.customFieldResponses ?? {}) as Record<
      string,
      { fieldLabel?: string; fieldName?: string; value: unknown }
    >,
  );

  if (responses.length === 0) return '';

  const formatValue = (value: unknown) =>
    typeof value === 'boolean'
      ? value
        ? 'Yes'
        : 'No'
      : typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : JSON.stringify(value);

  return `<br/>${responses
    .map(
      (response) =>
        `<strong>${escapeHtml(response.fieldLabel || response.fieldName || '')}:</strong> ${escapeHtml(formatValue(response.value))}`,
    )
    .join('<br/>')}`;
}

// Plain text to HTML: blank lines separate paragraphs and "- " lines become a
// bulleted list
export function formatNotes(notes: string) {
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) html.push(`<p>${paragraph.join('<br/>')}</p>`);
    if (list.length > 0) html.push(`<ul>\n${list.join('\n')}\n</ul>`);
    paragraph = [];
    list = [];
  };

  for (const rawLine of notes.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flush();
    } else if (line.startsWith('- ')) {
      if (paragraph.length > 0) flush();
      list.push(`<li>${escapeHtml(line.slice(2).trim())}</li>`);
    } else {
      if (list.length > 0) flush();
      paragraph.push(escapeHtml(line));
    }
  }
  flush();

  return html.join('\n');
}
