import React from 'react';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { Checkbox } from '~/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { CustomField } from '~/types/customFields';
import { cn } from '~/lib/utils';

interface CustomFieldRendererProps {
  field: CustomField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  disabled?: boolean;
}

export const CustomFieldRenderer: React.FC<CustomFieldRendererProps> = ({
  field,
  value,
  onChange,
  error,
  disabled = false,
}) => {
  const fieldId = `custom-field-${field.id}`;
  const helpId = field.helpText ? `${fieldId}-help` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;

  const renderField = () => {
    switch (field.type) {
      case 'text':
      case 'email':
      case 'phone':
        return (
          <Input
            id={fieldId}
            type={
              field.type === 'email'
                ? 'email'
                : field.type === 'phone'
                  ? 'tel'
                  : 'text'
            }
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            className={cn(error && 'border-red-500')}
            aria-describedby={cn(helpId, errorId).trim() || undefined}
            required={field.required}
          />
        );

      case 'number':
        return (
          <Input
            id={fieldId}
            type="number"
            value={value || ''}
            onChange={(e) =>
              onChange(e.target.value ? Number(e.target.value) : '')
            }
            placeholder={field.placeholder}
            disabled={disabled}
            className={cn(error && 'border-red-500')}
            aria-describedby={cn(helpId, errorId).trim() || undefined}
            min={field.validation?.min}
            max={field.validation?.max}
            required={field.required}
          />
        );

      case 'textarea':
        return (
          <Textarea
            id={fieldId}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            className={cn(error && 'border-red-500')}
            aria-describedby={cn(helpId, errorId).trim() || undefined}
            rows={3}
            minLength={field.validation?.minLength}
            maxLength={field.validation?.maxLength}
            required={field.required}
          />
        );

      case 'select':
        return (
          <Select
            value={value || ''}
            onValueChange={onChange}
            disabled={disabled}
            required={field.required}
          >
            <SelectTrigger
              id={fieldId}
              className={cn(error && 'border-red-500')}
              aria-describedby={cn(helpId, errorId).trim() || undefined}
            >
              <SelectValue
                placeholder={
                  field.placeholder || `Select ${field.label.toLowerCase()}`
                }
              />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={fieldId}
              checked={value || false}
              onCheckedChange={onChange}
              disabled={disabled}
              aria-describedby={cn(helpId, errorId).trim() || undefined}
            />
            <Label
              htmlFor={fieldId}
              className={cn(
                'text-sm font-normal',
                disabled && 'text-gray-400',
                error && 'text-red-600',
              )}
            >
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
          </div>
        );

      default:
        return null;
    }
  };

  // For checkbox, we don't need a separate label since it's integrated
  if (field.type === 'checkbox') {
    return (
      <div className="space-y-1">
        {renderField()}
        {field.helpText && (
          <p id={helpId} className="text-xs text-muted-foreground">
            {field.helpText}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId} className="text-sm font-medium">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      {renderField()}
      {field.helpText && (
        <p id={helpId} className="text-xs text-muted-foreground">
          {field.helpText}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
};

export default CustomFieldRenderer;
