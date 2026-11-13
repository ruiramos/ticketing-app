import { Order } from '@paypal/paypal-server-sdk/dist/types/models/order';
import Mailjet from 'node-mailjet';
import { env } from '~/server/env';
import { Event, Organization } from '~/generated/prisma/client';

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

export function generateMailContent(
  order: Order,
  event: Event,
  org: Organization,
) {
  return `
<p>Dear ${order?.payer?.name?.givenName},</p>

<p>Hello from ${org.name}!</p>

<p>We're thrilled to confirm your order for the ${event.title}.<br/>
Your contribution helps fund the PTA projects and community events.</p>

<p>Here are the details of your order:</p>

<strong>Order Id:</strong> ${order.id}<br/>
${order?.purchaseUnits?.[0].items
  ?.map((item, i) => {
    return i === 0
      ? `${item.quantity} ticket(s) for: ${item.name}`
      : `${item.name}`;
  })
  .join('<br/>')}<br/>
<strong>Total:</strong> £${order?.purchaseUnits?.[0].amount?.value}

${eventDetails(event)}
<p>Of course, we're here to help. If you have any questions or concerns, simply drop us a line at info@friendsofhped.com. <br/><br/>
Thank you and see you at the ${event.title}!</p>`;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Uses the "- " bullet lines from the event description as the details list
function eventDetails(event: Event) {
  const details = event.text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);

  if (details.length === 0) return '';

  return `<p>Some more details about the event:</p>

<ul>
${details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join('\n')}
</ul>
`;
}
