import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { format, parse } from 'date-fns';
import { AdminLayout } from '~/components/AdminLayout';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { Switch } from '~/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { trpc } from '~/utils/trpc';
import {
  ArrowLeft,
  Plus,
  Trash2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertTitle } from '~/components/ui/alert';
import { cn } from '~/lib/utils';
import { EventExtras, Variant } from '~/generated/prisma/client';

const EditEventPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const eventId = id as string;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [location, setLocation] = useState('');
  const [link, setLink] = useState('');
  const [image, setImage] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [variants, setVariants] = useState<Partial<Variant>[]>([]);
  const [extras, setExtras] = useState<Partial<EventExtras>[]>([]);

  const { data: event, isLoading } = trpc.event.byId.useQuery(
    { id: eventId },
    { enabled: !!eventId, refetchOnWindowFocus: false },
  );

  const { data: eventWithOrders } = trpc.user.getUserEvent.useQuery(
    { eventId: eventId },
    { enabled: !!eventId },
  );

  const updateEventMutation = trpc.event.update.useMutation({
    onSuccess: () => {
      router.push(`/admin/events/${eventId}`);
    },
  });

  // Populate form when event data loads
  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setText(event.text);
      setLocation(event.location || '');
      setLink(event.link || '');
      setImage(event.image || '');
      setEnabled(event.enabled);

      // Format dates for datetime-local input using date-fns
      if (event.startsAt) {
        setStartsAt(format(event.startsAt, "yyyy-MM-dd'T'HH:mm"));
      }
      if (event.endsAt) {
        setEndsAt(format(event.endsAt, "yyyy-MM-dd'T'HH:mm"));
      }

      // Set variants
      if (event.variants) {
        const sortedVariants = event.variants
          .map((variant, index) => ({
            id: variant.id,
            title: variant.title,
            price: variant.price,
            stock: variant.stock,
            displayOrder: variant.displayOrder, // Keep original displayOrder or undefined
            originalIndex: index, // Preserve original index for stable sort if displayOrder is missing
          }))
          .sort((a, b) => {
            const orderA = a.displayOrder ?? Infinity;
            const orderB = b.displayOrder ?? Infinity;
            if (orderA === orderB) {
              // If displayOrder is the same or both are null/undefined, sort by original position
              return a.originalIndex - b.originalIndex;
            }
            return orderA - orderB;
          })
          .map((variant) => ({
            // Map back to the structure expected by setVariants
            id: variant.id,
            title: variant.title,
            price: variant.price,
            stock: variant.stock,
            // Ensure displayOrder is a number; fall back to originalIndex if it was initially undefined/null
            displayOrder: variant.displayOrder ?? variant.originalIndex,
          }));
        setVariants(sortedVariants);
      }

      // Set extras
      if (event.eventExtras) {
        setExtras(
          event.eventExtras.map((extra) => ({
            id: extra.id,
            title: extra.title,
            price: extra.price || 0,
            description: extra.description || '',
          })),
        );
      }
    }
  }, [event]);

  const addVariant = () => {
    setVariants([
      ...variants,
      { title: '', price: 0, stock: 0, displayOrder: variants.length },
    ]);
  };

  const removeVariant = (index: number) => {
    if (variants.length <= 1) {
      alert('You must have at least one ticket variant.');
      return;
    }

    const variant = variants[index];
    const hasOrders =
      variant.id &&
      eventWithOrders?.variants.find(
        (v) => v.id === variant.id && v.orders && v.orders.length > 0,
      );

    if (hasOrders) {
      alert(
        'Cannot delete this variant as it has existing orders. You can only edit its details.',
      );
      return;
    }

    // Filter out the variant and then re-assign displayOrder
    const updatedVariants = variants
      .filter((_, i) => i !== index)
      .map((v, i) => ({
        ...v,
        displayOrder: i,
      }));
    setVariants(updatedVariants);
  };

  const updateVariant = (
    index: number,
    field: keyof Variant,
    value: string | number,
  ) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    setVariants(updated);
  };

  const moveVariant = (index: number, direction: 'up' | 'down') => {
    const newVariants = [...variants];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newVariants.length) {
      return; // Invalid move
    }

    // Swap elements
    const temp = newVariants[index];
    newVariants[index] = newVariants[targetIndex];
    newVariants[targetIndex] = temp;

    // Update displayOrder for all variants
    const updatedVariantsWithOrder = newVariants.map((variant, i) => ({
      ...variant,
      displayOrder: i,
    }));

    setVariants(updatedVariantsWithOrder);
  };

  const addExtra = () => {
    setExtras([...extras, { title: '', price: 0 }]);
  };

  const removeExtra = (index: number) => {
    setExtras(extras.filter((_, i) => i !== index));
  };

  const updateExtra = (
    index: number,
    field: keyof EventExtras,
    value: string | number,
  ) => {
    const updated = [...extras];
    updated[index] = { ...updated[index], [field]: value };
    setExtras(updated);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/upload-event-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      setImage(data.url);
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Convert local datetime-local string to JS Date using date-fns
      function toDateFromLocal(dt: string) {
        // dt: "yyyy-MM-dd'T'HH:mm" (browser local)
        return parse(dt, "yyyy-MM-dd'T'HH:mm", new Date());
      }

      await updateEventMutation.mutateAsync({
        id: eventId,
        title,
        text,
        location,
        link,
        image,
        startsAt: toDateFromLocal(startsAt),
        endsAt: endsAt ? toDateFromLocal(endsAt) : null,
        enabled,
        variants: variants
          .filter(
            (v) =>
              v.title &&
              v.price !== undefined &&
              v.price >= 0 &&
              v.stock !== undefined &&
              v.displayOrder !== undefined,
          )
          .map((v) => ({
            id: v.id,
            title: v.title!,
            price: v.price!,
            stock: v.stock!,
            displayOrder: v.displayOrder!,
          })),
        extras: extras
          .filter((e) => e.title && e.price! >= 0)
          .map((e) => ({
            id: e.id,
            title: e.title!,
            price: e.price!,
            description: e.description || '',
          })),
      });
    } catch (error) {
      console.error('Failed to update event:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-300 rounded mb-4"></div>
            <div className="h-64 bg-gray-300 rounded"></div>
          </div>
        </div>
      </>
    );
  }

  if (!event) {
    return (
      <>
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <h1 className="text-2xl font-semibold text-gray-900 mb-4">
              Event not found
            </h1>
            <Button asChild>
              <Link href="/admin">Back to Events</Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="">
        <div className="flex flex-col gap-2 mb-8">
          <Link
            href={`/admin/events/${eventId}`}
            className="text-xs flex items-center"
          >
            <ArrowLeft className="w-3 h-3 mr-1 inline" />
            Back to events
          </Link>
          <h1 className="text-3xl font-semibold">Edit Event</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Event Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Event Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter event title"
                  required
                />
              </div>

              <div>
                <Label htmlFor="text">Description *</Label>
                <Textarea
                  id="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Enter event description"
                  rows={4}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Event location"
                  />
                </div>

                <div>
                  <Label htmlFor="link">Event Link</Label>
                  <Input
                    id="link"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="image">Event Image</Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    disabled={isUploadingImage}
                  />
                  {isUploadingImage && (
                    <span className="text-sm text-muted-foreground">
                      Uploading...
                    </span>
                  )}
                </div>
                {image && (
                  <div className="mt-2">
                    <img
                      src={image}
                      alt="Event preview"
                      className="h-32 w-auto object-cover rounded border"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startsAt">Start Date & Time *</Label>
                  <Input
                    id="startsAt"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="endsAt">End Date & Time</Label>
                  <Input
                    id="endsAt"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
                <Label htmlFor="enabled">Event is live</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Ticket Variants</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addVariant}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Variant
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {variants.map((variant, index) => {
                const hasOrders =
                  variant.id &&
                  eventWithOrders?.variants.find(
                    (v) =>
                      v.id === variant.id && v.orders && v.orders.length > 0,
                  );

                return (
                  <div key={index} className="relative p-4 border rounded">
                    {hasOrders && (
                      <div className="">
                        <Alert
                          className="border-orange-200 bg-orange-50 mb-2"
                          variant={'thin'}
                        >
                          <AlertTriangle className="stroke-orange-800" />
                          <AlertTitle className="text-orange-800">
                            This variant has existing orders and cannot be
                            deleted
                          </AlertTitle>
                        </Alert>
                      </div>
                    )}
                    <div className="flex  gap-2 items-start">
                      <div className="flex flex-col gap-1 self-stretch justify-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => moveVariant(index, 'up')}
                          disabled={index === 0}
                          className="h-8 w-8"
                          title="Move variant up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => moveVariant(index, 'down')}
                          disabled={index === variants.length - 1}
                          className="h-8 w-8"
                          title="Move variant down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex-1">
                        <Label htmlFor={`variant-title-${index}`}>
                          Title *
                        </Label>
                        <Input
                          id={`variant-title-${index}`}
                          value={variant.title}
                          onChange={(e) =>
                            updateVariant(index, 'title', e.target.value)
                          }
                          placeholder="e.g., Standard Ticket"
                          required
                        />
                      </div>
                      <div className="w-24">
                        <Label htmlFor={`variant-price-${index}`}>
                          Price (£) *
                        </Label>
                        <Input
                          id={`variant-price-${index}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={variant.price}
                          onChange={(e) =>
                            updateVariant(
                              index,
                              'price',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          required
                        />
                      </div>
                      <div className="w-24">
                        <Label htmlFor={`variant-stock-${index}`}>
                          Stock *
                        </Label>
                        <Input
                          id={`variant-stock-${index}`}
                          type="number"
                          min="0"
                          value={variant.stock}
                          onChange={(e) =>
                            updateVariant(
                              index,
                              'stock',
                              parseInt(e.target.value) || 0,
                            )
                          }
                          required
                        />
                      </div>
                      <div>
                        <Label>&nbsp;</Label>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          onClick={() => removeVariant(index)}
                          disabled={!!hasOrders || variants.length <= 1}
                          title={
                            hasOrders
                              ? 'Cannot delete - variant has existing orders'
                              : variants.length <= 1
                                ? 'Cannot delete last variant'
                                : 'Delete variant'
                          }
                          className={cn(
                            'h-9 w-9 flex',
                            (hasOrders || variants.length <= 1) &&
                              'cursor-not-allowed',
                          )}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Add-ons (Optional)</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addExtra}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Extra
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {extras.length === 0 ? (
                <p className="text-muted-foreground">No add-ons configured</p>
              ) : (
                extras.map((extra, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-4 p-4 border rounded"
                  >
                    <div className="flex items-end gap-4">
                      <div className="flex-1">
                        <Label htmlFor={`extra-title-${index}`}>Title</Label>
                        <Input
                          id={`extra-title-${index}`}
                          value={extra.title}
                          onChange={(e) =>
                            updateExtra(index, 'title', e.target.value)
                          }
                          placeholder="e.g., T-shirt, Meal voucher"
                        />
                      </div>
                      <div className="w-32">
                        <Label htmlFor={`extra-price-${index}`}>
                          Price (£)
                        </Label>
                        <Input
                          id={`extra-price-${index}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={extra.price || ''}
                          onChange={(e) =>
                            updateExtra(
                              index,
                              'price',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeExtra(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div>
                      <Label>Description:</Label>
                      <Input
                        value={extra.description || ''}
                        onChange={(e) =>
                          updateExtra(index, 'description', e.target.value)
                        }
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href={`/admin/events/${eventId}`}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Update Event'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
};

EditEventPage.getLayout = (page: any) => <AdminLayout>{page}</AdminLayout>;
export default EditEventPage;
