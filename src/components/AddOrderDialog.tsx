import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { CustomFieldRenderer } from '~/components/CustomFieldRenderer';
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
import { SelectNative } from '~/components/ui/select-native';
import { Textarea } from '~/components/ui/textarea';
import { CustomField, validateCustomFieldResponse } from '~/types/customFields';
import {
  MANUAL_PAYMENT_METHODS,
  ManualPaymentMethod,
  PAYMENT_METHOD_LABELS,
} from '~/utils/paymentMethods';
import { trpc } from '~/utils/trpc';

type OrderableEvent = {
  variants: {
    id: string;
    title: string;
    stock: number;
    price: number;
    currency: string;
  }[];
  eventExtras: { id: string; title: string; price: number | null }[];
  customFields: unknown;
};

/**
 * Adds an order by hand: tickets sold at the door, paid by bank transfer,
 * comps. The tickets come out of stock and the order is confirmed at once.
 */
export function AddOrderDialog({
  eventId,
  event,
  open,
  onClose,
  onAdded,
}: {
  eventId: string;
  event: OrderableEvent;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [extras, setExtras] = useState<string[]>([]);
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<ManualPaymentMethod>('CASH');
  const [amount, setAmount] = useState('');
  // once the organiser types an amount, stop replacing it with the price
  const [amountEdited, setAmountEdited] = useState(false);
  const [note, setNote] = useState('');
  const [emailTickets, setEmailTickets] = useState(true);
  const [customFieldValues, setCustomFieldValues] = useState<
    Record<string, any>
  >({});
  const [customFieldErrors, setCustomFieldErrors] = useState<
    Record<string, string>
  >({});
  // set when the order was added but its email didn't go out
  const [emailError, setEmailError] = useState<string | null>(null);

  const createManualOrder = trpc.order.createManualOrder.useMutation();

  // answers are optional here: the organiser may not have them
  const customFields = ((event.customFields as CustomField[] | null) ?? [])
    .map((field) => ({ ...field, required: false }))
    .sort((a, b) => a.displayOrder - b.displayOrder);

  // start afresh every time the dialog opens
  useEffect(() => {
    if (!open) return;
    setVariantId(event.variants.find((v) => v.stock > 0)?.id ?? '');
    setQuantity('1');
    setExtras([]);
    setBuyerName('');
    setBuyerEmail('');
    setPaymentMethod('CASH');
    setAmountEdited(false);
    setNote('');
    setEmailTickets(true);
    setCustomFieldValues({});
    setCustomFieldErrors({});
    setEmailError(null);
    createManualOrder.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const variant = event.variants.find((v) => v.id === variantId);
  const quantityNumber = Number(quantity);
  const quantityValid =
    Number.isInteger(quantityNumber) &&
    quantityNumber >= 1 &&
    (!variant || quantityNumber <= variant.stock);

  const price =
    (variant?.price ?? 0) * (quantityValid ? quantityNumber : 0) +
    event.eventExtras
      .filter((extra) => extras.includes(extra.id))
      .reduce((sum, extra) => sum + (extra.price ?? 0), 0);

  // the amount follows the price until it's edited
  useEffect(() => {
    if (!amountEdited) setAmount(price.toFixed(2));
  }, [price, amountEdited]);

  const isComp = paymentMethod === 'COMP';
  const amountNumber = Number(amount);
  const amountValid = isComp || (amount !== '' && amountNumber >= 0);
  const email = buyerEmail.trim();
  const emailValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const canSubmit =
    !!variant &&
    quantityValid &&
    amountValid &&
    emailValid &&
    !!buyerName.trim() &&
    !createManualOrder.isPending;

  const handleSubmit = async () => {
    if (!variant) return;

    const errors: Record<string, string> = {};
    customFields.forEach((field) => {
      const result = validateCustomFieldResponse(
        field,
        customFieldValues[field.id],
      );
      if (!result.isValid && result.error) errors[field.id] = result.error;
    });
    setCustomFieldErrors(errors);
    if (Object.keys(errors).length) return;

    try {
      const result = await createManualOrder.mutateAsync({
        eventId,
        variantId: variant.id,
        quantity: quantityNumber,
        extras,
        buyerName: buyerName.trim(),
        buyerEmail: email || undefined,
        customFields: customFieldValues,
        paymentMethod,
        amount: isComp ? 0 : amountNumber,
        note: note.trim() || undefined,
        sendEmail: !!email && emailTickets,
      });
      onAdded();
      if (result.emailError) {
        // the order is in; keep the dialog open to say the email failed
        setEmailError(result.emailError);
      } else {
        onClose();
      }
    } catch {
      // shown below from createManualOrder.error
    }
  };

  const currency = variant?.currency ?? event.variants[0]?.currency ?? '';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add order</DialogTitle>
          <DialogDescription>
            For tickets sold outside PayPal, or given away. The tickets come out
            of stock and the order is confirmed straight away.
          </DialogDescription>
        </DialogHeader>

        {emailError ? (
          <p className="text-sm text-red-600">
            The order was added, but the tickets email couldn&apos;t be sent (
            {emailError}). Resend it from the orders table.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="add-order-variant">Ticket type</Label>
                <SelectNative
                  id="add-order-variant"
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                >
                  <option value="" disabled>
                    Choose a ticket type
                  </option>
                  {event.variants.map((v) => (
                    <option key={v.id} value={v.id} disabled={v.stock <= 0}>
                      {v.title} ({v.price.toFixed(2)} {v.currency},{' '}
                      {v.stock > 0 ? `${v.stock} left` : 'sold out'})
                    </option>
                  ))}
                </SelectNative>
              </div>
              <div className="space-y-1">
                <Label htmlFor="add-order-quantity">Quantity</Label>
                <Input
                  id="add-order-quantity"
                  type="number"
                  min="1"
                  step="1"
                  max={variant?.stock}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            </div>
            {!quantityValid && (
              <p className="text-sm text-red-600">
                {variant && quantityNumber > variant.stock
                  ? `Only ${variant.stock} left of this ticket type`
                  : 'At least 1 ticket'}
              </p>
            )}

            {event.eventExtras.length > 0 && (
              <div className="space-y-2">
                <Label>Extras</Label>
                {event.eventExtras.map((extra) => (
                  <div key={extra.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`add-order-extra-${extra.id}`}
                      checked={extras.includes(extra.id)}
                      onCheckedChange={(checked) =>
                        setExtras((prev) =>
                          checked
                            ? [...prev, extra.id]
                            : prev.filter((id) => id !== extra.id),
                        )
                      }
                    />
                    <Label
                      htmlFor={`add-order-extra-${extra.id}`}
                      className="font-normal"
                    >
                      {extra.title}
                      {extra.price
                        ? ` (${extra.price.toFixed(2)} ${currency})`
                        : ''}
                    </Label>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="add-order-name">Buyer name</Label>
                <Input
                  id="add-order-name"
                  maxLength={200}
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="add-order-email">Email (optional)</Label>
                <Input
                  id="add-order-email"
                  type="email"
                  maxLength={254}
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder="jane@example.com"
                />
                {!emailValid && (
                  <p className="text-sm text-red-600">Not a valid email</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="add-order-payment">Payment</Label>
                <SelectNative
                  id="add-order-payment"
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as ManualPaymentMethod)
                  }
                >
                  {MANUAL_PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method === 'COMP'
                        ? 'Comp (free)'
                        : PAYMENT_METHOD_LABELS[method]}
                    </option>
                  ))}
                </SelectNative>
              </div>
              <div className="space-y-1">
                <Label htmlFor="add-order-amount">
                  Amount paid ({currency})
                </Label>
                <Input
                  id="add-order-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={isComp}
                  value={isComp ? '0.00' : amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setAmountEdited(true);
                  }}
                />
                {!amountValid && (
                  <p className="text-sm text-red-600">0 or more</p>
                )}
              </div>
            </div>

            {customFields.length > 0 && (
              <div className="space-y-4">
                {customFields.map((field) => (
                  <CustomFieldRenderer
                    key={field.id}
                    field={field}
                    value={customFieldValues[field.id]}
                    error={customFieldErrors[field.id]}
                    onChange={(value) =>
                      setCustomFieldValues((prev) => ({
                        ...prev,
                        [field.id]: value,
                      }))
                    }
                  />
                ))}
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="add-order-note">Note (optional)</Label>
              <Textarea
                id="add-order-note"
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Paid at the door, receipt 0042"
              />
              <p className="text-xs text-gray-500">Only organisers see this.</p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="add-order-send-email"
                disabled={!email || !emailValid}
                checked={!!email && emailValid && emailTickets}
                onCheckedChange={(checked) => setEmailTickets(!!checked)}
              />
              <Label htmlFor="add-order-send-email" className="font-normal">
                Email the tickets to the buyer
              </Label>
            </div>

            {createManualOrder.error && (
              <p className="text-sm text-red-600">
                {createManualOrder.error.message}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {emailError ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {createManualOrder.isPending
                  ? 'Adding…'
                  : `Add order (${(isComp ? 0 : amountNumber || 0).toFixed(2)} ${currency})`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
