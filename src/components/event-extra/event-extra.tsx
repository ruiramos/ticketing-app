import { EventExtras } from '~/generated/prisma/client';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';

type EventExtraProps = EventExtras & {
  value: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  description?: string | null; // Added from EventExtras type
};

export default function EventExtra({
  title,
  price,
  currency,
  id,
  onChange,
  value,
  disabled,
  description, // Destructure description
}: EventExtraProps) {
  const labelId = `extra-label-${id}`;
  const descId = description ? `extra-desc-${id}` : undefined;

  return (
    <div className="flex items-start gap-2 my-2">
      <Checkbox
        id={`extra-${id}`}
        checked={value}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={descId} // Link to description if it exists
        className="mt-0.5" // Adjust checkbox position slightly if label/desc is taller
      />
      <div className="grid gap-0.5">
        <Label
          htmlFor={`extra-${id}`}
          id={labelId}
          className={`font-normal text-sm ${disabled ? 'text-gray-400' : ''}`}
        >
          {title}{' '}
          {price && price > 0 ? (
            <span className="text-gray-400">
              (+{currency} {price.toFixed(2)})
            </span>
          ) : null}
        </Label>
        {description && (
          <p
            id={descId}
            className={`text-xs text-muted-foreground ${disabled ? 'text-gray-400' : ''}`}
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
