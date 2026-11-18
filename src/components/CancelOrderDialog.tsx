import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
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
import { Textarea } from '~/components/ui/textarea';
import { trpc } from '~/utils/trpc';

type CancellableOrder = {
  id: string;
  amount: number;
  currency: string;
  externalTransactionId: string | null;
};

/**
 * Cancels a confirmed order (releasing its tickets) and, optionally, refunds
 * the buyer's PayPal payment, in full or in part.
 */
export function CancelOrderDialog({
  order,
  onClose,
  onCancelled,
}: {
  order: CancellableOrder | null;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const canRefund = !!order?.externalTransactionId && (order?.amount ?? 0) > 0;
  const [refund, setRefund] = useState(true);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [notifyBuyer, setNotifyBuyer] = useState(true);
  const [refundFailed, setRefundFailed] = useState(false);

  const cancelOrder = trpc.order.cancelOrder.useMutation();

  // reset whenever a different order is opened
  useEffect(() => {
    if (!order) return;
    setRefund(canRefund);
    setAmount(order.amount.toFixed(2));
    setReason('');
    setNotifyBuyer(true);
    setRefundFailed(false);
    cancelOrder.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  const amountNumber = Number(amount);
  const amountValid =
    !refund ||
    (amountNumber > 0 && order !== null && amountNumber <= order.amount);

  const handleSubmit = async () => {
    if (!order) return;
    try {
      const result = await cancelOrder.mutateAsync({
        orderId: order.id,
        refund,
        amount: refund ? amountNumber : undefined,
        reason: reason.trim() || undefined,
        notifyBuyer,
      });
      onCancelled();
      if (result.refundStatus === 'FAILED') {
        // the order is cancelled; keep the dialog open to say so
        setRefundFailed(true);
      } else {
        onClose();
      }
    } catch {
      // shown below from cancelOrder.error
    }
  };

  const money = (value: number) =>
    order ? `${value.toFixed(2)} ${order.currency}` : '';

  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel order</DialogTitle>
          <DialogDescription>
            The tickets go back on sale. This can't be undone.
          </DialogDescription>
        </DialogHeader>

        {refundFailed ? (
          <p className="text-sm text-red-600">
            The order is cancelled, but PayPal didn't accept the refund. Retry
            it from the orders table, or refund the buyer in PayPal.
          </p>
        ) : (
          <div className="space-y-4">
            {canRefund ? (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="refund"
                  checked={refund}
                  onCheckedChange={(checked) => setRefund(!!checked)}
                />
                <Label htmlFor="refund">
                  Refund the buyer through PayPal (paid{' '}
                  {money(order?.amount ?? 0)})
                </Label>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                No PayPal payment is recorded for this order, so it can't be
                refunded from here.
              </p>
            )}

            {canRefund && refund && (
              <div className="space-y-1">
                <Label htmlFor="refund-amount">Amount to refund</Label>
                <Input
                  id="refund-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={order?.amount}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                {!amountValid && (
                  <p className="text-sm text-red-600">
                    Between 0.01 and {money(order?.amount ?? 0)}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="cancel-reason">
                Note to the buyer (optional)
              </Label>
              <Textarea
                id="cancel-reason"
                maxLength={255}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Sorry, this slot was double booked"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="notify-buyer"
                checked={notifyBuyer}
                onCheckedChange={(checked) => setNotifyBuyer(!!checked)}
              />
              <Label htmlFor="notify-buyer">Email the buyer</Label>
            </div>

            {cancelOrder.error && (
              <p className="text-sm text-red-600">
                {cancelOrder.error.message}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {refundFailed ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Keep order
              </Button>
              <Button
                variant="destructive"
                onClick={handleSubmit}
                disabled={cancelOrder.isPending || !amountValid}
              >
                {cancelOrder.isPending
                  ? 'Cancelling…'
                  : canRefund && refund
                    ? `Cancel and refund ${money(amountNumber || 0)}`
                    : 'Cancel order'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
