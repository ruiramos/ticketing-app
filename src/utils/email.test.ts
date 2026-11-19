import { formatNotes, generateMailContent } from './email';

vi.mock('~/server/env', async (importOriginal) => ({
  env: {
    ...(await importOriginal<typeof import('~/server/env')>()).env,
    DEPLOYED_URL: 'https://tickets.test',
  },
}));

describe('formatNotes', () => {
  test('turns "- " lines into a list and blank lines into paragraphs', () => {
    expect(
      formatNotes(
        'Welcome!\nSee you soon.\n\n- Arrive early\n- No food <inside>\n\nThanks',
      ),
    ).toBe(
      [
        '<p>Welcome!<br/>See you soon.</p>',
        '<ul>\n<li>Arrive early</li>\n<li>No food &lt;inside&gt;</li>\n</ul>',
        '<p>Thanks</p>',
      ].join('\n'),
    );
  });

  test('splits a list directly followed by text', () => {
    expect(formatNotes('- One\nAfter')).toBe(
      '<ul>\n<li>One</li>\n</ul>\n<p>After</p>',
    );
  });
});

describe('generateMailContent', () => {
  const organization = {
    id: 'org',
    name: 'Friends of School',
    email: 'info@school.test',
    emailMessage: 'Your contribution helps fund the PTA.',
  };

  const event = {
    id: 'event-id',
    title: "Santa's Grotto",
    location: 'School Hall',
    startsAt: new Date('2026-12-05T12:00:00Z'),
    endsAt: new Date('2026-12-05T14:00:00Z'),
    emailNotes: '- Arrive 2 minutes early\n- No food',
    organization,
  };

  const ourOrder = {
    id: 'order-id',
    eventId: 'event-id',
    externalId: 'PAYPAL123',
    quantity: 1,
    amount: 20,
    currency: 'GBP',
    customer: { name: { givenName: 'Alex' }, emailAddress: 'alex@test' },
    items: [{ quantity: '1', name: '12:00 - 12:10pm' }, { name: 'Gift' }],
    customFieldResponses: {
      f1: { fieldLabel: 'Child(ren) Name(s)', value: 'Sam' },
    },
    event,
  };

  test('includes organization, event, order and notes details', () => {
    const html = generateMailContent(ourOrder as any);

    expect(html).toContain('Dear Alex,');
    expect(html).toContain('Hello from Friends of School!');
    expect(html).toContain(
      '<a href="https://tickets.test/events/event-id/orders/order-id">View your tickets</a>',
    );
    expect(html).toContain('<strong>Order Id:</strong> PAYPAL123');
    expect(html).toContain('<strong>Total:</strong> £20.00');
    expect(html).toContain('Your contribution helps fund the PTA.');
    expect(html).toContain('1 ticket(s) for: 12:00 - 12:10pm<br/>Gift');
    expect(html).toContain('<strong>Child(ren) Name(s):</strong> Sam');
    expect(html).toContain(
      '<strong>When:</strong> Saturday, 5 December 2026, 12:00 - 14:00',
    );
    expect(html).toContain('<strong>Where:</strong> School Hall');
    expect(html).toContain('<li>Arrive 2 minutes early</li>');
    expect(html).toContain('drop us a line at info@school.test');
  });

  test('leaves out optional sections when not set', () => {
    const html = generateMailContent({
      ...ourOrder,
      customFieldResponses: null,
      event: {
        ...event,
        location: '',
        emailNotes: null,
        organization: { ...organization, emailMessage: null },
      },
    } as any);

    expect(html).not.toContain('Some more details');
    expect(html).not.toContain('Where:');
    expect(html).not.toContain('PTA');
  });

  test("shows the order's own currency", () => {
    const html = generateMailContent({
      ...ourOrder,
      amount: 12.5,
      currency: 'EUR',
    } as any);
    expect(html).toContain('<strong>Total:</strong> €12.50');
  });
});
