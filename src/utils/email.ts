import { Order } from '@paypal/paypal-server-sdk/dist/types/models/order';
import sgMail from '@sendgrid/mail';
import { env } from '~/server/env';
sgMail.setApiKey(env.SENDGRID_API_KEY);

const FROM_EMAIL_ADDRESS = 'ticketing@ruiramos.com';

interface SendMailProps {
  to: string | string[];
  subject: string;
  content: string;
  replyTo?: string;
}

export function sendEmail({ to, subject, content, replyTo }: SendMailProps) {
  try {
    return sgMail.send({
      to,
      subject,
      html: content,
      from: FROM_EMAIL_ADDRESS,
      replyTo: replyTo,
    });
  } catch (e) {
    console.error(e);
  }
}

export function generateMailContent(order: Order) {
  return `
<p>Dear ${order?.payer?.name?.givenName},</p>

<p>Hello from Friends of Harris Primary East Dulwich!</p>

<p>We're thrilled to confirm your order for the Summer Fair 2025 Animal Grotto.<br/>
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

<p>Of course, we're here to help. If you have any questions or concerns, simply drop us a line at info@friendsofhped.com. <br/><br/>
Thank you and see you at the Summer Fair!</p>`;
}
