import { Order } from '@paypal/paypal-server-sdk/dist/types/models/order';
import Mailjet from 'node-mailjet';
import { env } from '~/server/env';
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

export async function sendEmail({
  to,
  subject,
  content,
  replyTo,
}: SendMailProps) {
  try {
    const recipients = (Array.isArray(to) ? to : [to]).map((email) => ({
      Email: email,
    }));
    return await mailjet.post('send', { version: 'v3.1' }).request({
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
  } catch (e) {
    console.error(e);
  }
}

type OrderWithEvent = OurOrder & {
  event: Event & { organization: Organization | null };
};

export function generateMailContent(order: Order, ourOrder: OrderWithEvent) {
  const { event } = ourOrder;
  const org = event.organization;

  return `
<p>Dear ${escapeHtml(order?.payer?.name?.givenName ?? '')},</p>

<p>Hello from ${escapeHtml(org?.name ?? '')}!</p>

<p>We're thrilled to confirm your order for the ${escapeHtml(event.title)}.${
    org?.emailMessage ? `<br/>\n${escapeHtml(org.emailMessage)}` : ''
  }</p>

<p>Here are the details of your order:</p>

<strong>Order Id:</strong> ${order.id}<br/>
${order?.purchaseUnits?.[0].items
  ?.map((item, i) => {
    return i === 0
      ? `${item.quantity} ticket(s) for: ${escapeHtml(item.name)}`
      : `${escapeHtml(item.name)}`;
  })
  .join('<br/>')}<br/>
<strong>Total:</strong> £${order?.purchaseUnits?.[0].amount?.value}
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
