import { Order } from '@paypal/paypal-server-sdk/dist/types/models/order';
import Mailjet from 'node-mailjet';
import { env } from '~/server/env';

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

export async function sendEmail({ to, subject, content, replyTo }: SendMailProps) {
  try {
    const recipients = (Array.isArray(to) ? to : [to]).map((email) => ({ Email: email }));
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

export function generateMailContent(order: Order) {
  return `
<p>Dear ${order?.payer?.name?.givenName},</p>

<p>Hello from Friends of Harris Primary East Dulwich!</p>

<p>We're thrilled to confirm your order for the Winter Fair 2025 Santa's Grotto.<br/>
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

<p>Some more details about the event:</p>

<ul>
<li>The Grotto will be in a room behind Chestnut Classroom (Reception)</li>
<li>Please gather down the path where the bike storage is</li>
<li>Please arrive 2 minutes before your start time</li>
<li>No food allowed in The Grotto</li>
</ul>

<p>Of course, we're here to help. If you have any questions or concerns, simply drop us a line at info@friendsofhped.com. <br/><br/>
Thank you and see you at the Winter Fair!</p>`;
}
