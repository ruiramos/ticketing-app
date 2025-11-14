import { useState } from 'react';
import { useRouter } from 'next/router';
import { AdminLayout } from '~/components/AdminLayout';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { Switch } from '~/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { trpc } from '~/utils/trpc';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { CustomField, CustomFieldType } from '~/types/customFields';

interface Variant {
  title: string;
  price: number;
  stock: number;
  displayOrder: number;
}

interface EventExtra {
  title: string;
  price: number;
}

const NewEventPage = () => {
  const router = useRouter();
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
  const [variants, setVariants] = useState<Variant[]>([
    { title: '', price: 0, stock: 0, displayOrder: 0 },
  ]);
  const [extras, setExtras] = useState<EventExtra[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  const createEventMutation = trpc.event.create.useMutation({
    onSuccess: (event) => {
      router.push(`/admin/events/${event.id}`);
    },
  });

  const addVariant = () => {
    setVariants([
      ...variants,
      { title: '', price: 0, stock: 0, displayOrder: variants.length },
    ]);
  };

  const removeVariant = (index: number) => {
    if (variants.length > 1) {
      setVariants(variants.filter((_, i) => i !== index));
    }
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

  const addExtra = () => {
    setExtras([...extras, { title: '', price: 0 }]);
  };

  const removeExtra = (index: number) => {
    setExtras(extras.filter((_, i) => i !== index));
  };

  const updateExtra = (
    index: number,
    field: keyof EventExtra,
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
      await createEventMutation.mutateAsync({
        title,
        text,
        location,
        link,
        image,
        startsAt: new Date(startsAt),
        endsAt: endsAt ? new Date(endsAt) : null,
        enabled,
        variants: variants.filter((v) => v.title && v.price > 0),
        extras: extras.filter((e) => e.title && e.price >= 0),
        customFields: customFields.filter((f) => f.name && f.label),
      });
    } catch (error) {
      console.error('Failed to create event:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addCustomField = () => {
    const newField: CustomField = {
      id: `field_${Date.now()}`,
      name: '',
      label: '',
      type: 'text',
      required: false,
      displayOrder: customFields.length,
    };
    setCustomFields([...customFields, newField]);
  };

  const removeCustomField = (index: number) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  const updateCustomField = (index: number, updates: Partial<CustomField>) => {
    const updated = [...customFields];
    updated[index] = { ...updated[index], ...updates };
    setCustomFields(updated);
  };

  return (
    <div className="mx-auto">
      <div className="flex flex-col gap-2 mb-8">
        <Link href="/admin" className="text-xs flex items-center">
          <ArrowLeft className="w-3 h-3 mr-1 inline" />
          Back to Events
        </Link>
        <h1 className="text-3xl font-semibold">Create New Event</h1>
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
            {variants.map((variant, index) => (
              <div
                key={index}
                className="flex items-end gap-4 p-4 border rounded"
              >
                <div className="flex-1">
                  <Label htmlFor={`variant-title-${index}`}>Title</Label>
                  <Input
                    id={`variant-title-${index}`}
                    value={variant.title}
                    onChange={(e) =>
                      updateVariant(index, 'title', e.target.value)
                    }
                    placeholder="e.g., Standard Ticket"
                  />
                </div>
                <div className="w-24">
                  <Label htmlFor={`variant-price-${index}`}>Price (£)</Label>
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
                  />
                </div>
                <div className="w-24">
                  <Label htmlFor={`variant-stock-${index}`}>Stock</Label>
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
                  />
                </div>
                {variants.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeVariant(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
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
                  className="flex items-end gap-4 p-4 border rounded"
                >
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
                    <Label htmlFor={`extra-price-${index}`}>Price (£)</Label>
                    <Input
                      id={`extra-price-${index}`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={extra.price}
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
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Custom Order Fields</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCustomField}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Field
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {customFields.length === 0 ? (
              <p className="text-muted-foreground">
                No custom fields configured. Add fields to collect additional
                information during ticket purchase.
              </p>
            ) : (
              customFields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex flex-col gap-4 p-4 border rounded"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor={`field-name-${index}`}>
                        Field Name *
                      </Label>
                      <Input
                        id={`field-name-${index}`}
                        value={field.name}
                        onChange={(e) =>
                          updateCustomField(index, { name: e.target.value })
                        }
                        placeholder="e.g., dietary_requirements"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`field-label-${index}`}>
                        Display Label *
                      </Label>
                      <Input
                        id={`field-label-${index}`}
                        value={field.label}
                        onChange={(e) =>
                          updateCustomField(index, { label: e.target.value })
                        }
                        placeholder="e.g., Dietary Requirements"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`field-type-${index}`}>Field Type</Label>
                      <Select
                        value={field.type}
                        onValueChange={(value: CustomFieldType) =>
                          updateCustomField(index, { type: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="phone">Phone</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="textarea">Long Text</SelectItem>
                          <SelectItem value="select">Dropdown</SelectItem>
                          <SelectItem value="checkbox">Checkbox</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`field-placeholder-${index}`}>
                        Placeholder
                      </Label>
                      <Input
                        id={`field-placeholder-${index}`}
                        value={field.placeholder || ''}
                        onChange={(e) =>
                          updateCustomField(index, {
                            placeholder: e.target.value,
                          })
                        }
                        placeholder="Hint text for the field"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`field-help-${index}`}>Help Text</Label>
                      <Input
                        id={`field-help-${index}`}
                        value={field.helpText || ''}
                        onChange={(e) =>
                          updateCustomField(index, { helpText: e.target.value })
                        }
                        placeholder="Additional guidance"
                      />
                    </div>
                  </div>

                  {field.type === 'select' && (
                    <div>
                      <Label>Options (one per line)</Label>
                      <Textarea
                        value={
                          field.options
                            ?.map((opt) => `${opt.value}:${opt.label}`)
                            .join('\n') || ''
                        }
                        onChange={(e) => {
                          const lines = e.target.value
                            .split('\n')
                            .filter((line) => line.trim());
                          const options = lines.map((line) => {
                            const [value, ...labelParts] = line.split(':');
                            return {
                              value: value.trim(),
                              label:
                                labelParts.join(':').trim() || value.trim(),
                            };
                          });
                          updateCustomField(index, { options });
                        }}
                        placeholder="value1:Label 1&#10;value2:Label 2"
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Format: value:label (e.g., "vegan:Vegan" or just
                        "vegan")
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`field-required-${index}`}
                        checked={field.required}
                        onCheckedChange={(checked) =>
                          updateCustomField(index, { required: checked })
                        }
                      />
                      <Label htmlFor={`field-required-${index}`}>
                        Required field
                      </Label>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeCustomField(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/admin">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Event'}
          </Button>
        </div>
      </form>
    </div>
  );
};

NewEventPage.getLayout = (page: any) => <AdminLayout>{page}</AdminLayout>;
export default NewEventPage;
