import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { trpc } from '~/utils/trpc';

type TicketOrder = {
  id: string;
  eventId: string;
  customer: unknown;
};

/**
 * Re-sends a confirmed order's "your tickets" email, to the buyer's address
 * or another one, and offers the ticket link to share by hand.
 */
export function ResendTicketsDialog({
  order,
  onClose,
  onSent,
}: {
  order: TicketOrder | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const buyerEmail =
    (order?.customer as { emailAddress?: string } | null)?.emailAddress ?? '';
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const resend = trpc.order.resendConfirmation.useMutation();

  // reset whenever a different order is opened
  useEffect(() => {
    if (!order) return;
    setEmail(buyerEmail);
    setCopied(false);
    resend.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  const link =
    order && typeof window !== 'undefined'
      ? `${window.location.origin}/events/${order.eventId}/orders/${order.id}`
      : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // clipboard blocked: the link is selectable in the field
    }
  };

  const handleSend = async () => {
    if (!order) return;
    try {
      const trimmed = email.trim();
      await resend.mutateAsync({
        orderId: order.id,
        email: trimmed && trimmed !== buyerEmail ? trimmed : undefined,
      });
      onSent();
    } catch {
      // shown below from resend.error
    }
  };

  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resend tickets</DialogTitle>
          <DialogDescription>
            Sends the order confirmation, with the link to the tickets, again.
          </DialogDescription>
        </DialogHeader>

        {resend.isSuccess ? (
          <p className="text-sm text-green-700">Sent to {email.trim()}.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="resend-email">Send to</Label>
              <Input
                id="resend-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="buyer@example.com"
              />
              {buyerEmail && email.trim() !== buyerEmail && (
                <p className="text-xs text-gray-500">
                  The buyer&apos;s address is {buyerEmail}.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="ticket-link">Or share the ticket link</Label>
              <div className="flex gap-2">
                <Input
                  id="ticket-link"
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyLink}
                  aria-label="Copy ticket link"
                >
                  {copied ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {resend.error && (
              <p className="text-sm text-red-600">{resend.error.message}</p>
            )}
          </div>
        )}

        <DialogFooter>
          {resend.isSuccess ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button
                onClick={handleSend}
                disabled={resend.isPending || !email.trim()}
              >
                {resend.isPending ? 'Sending…' : 'Send email'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
