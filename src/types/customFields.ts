export type CustomFieldType = 'text' | 'email' | 'phone' | 'number' | 'select' | 'checkbox' | 'textarea';

export interface CustomFieldOption {
  value: string;
  label: string;
}

export interface CustomField {
  id: string;
  name: string; // Internal field name (e.g., "dietary_requirements")
  label: string; // Display label (e.g., "Dietary Requirements")
  type: CustomFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: CustomFieldOption[]; // For select fields
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string; // Regex pattern
  };
  displayOrder: number;
}

export interface CustomFieldResponse {
  fieldId: string;
  fieldName: string;
  fieldLabel: string;
  value: string | number | boolean | string[];
}

export type CustomFieldResponses = Record<string, CustomFieldResponse>;

// Helper function to validate a field response
export function validateCustomFieldResponse(
  field: CustomField,
  value: any
): { isValid: boolean; error?: string } {
  // Required field validation
  if (field.required && (value === undefined || value === null || value === '')) {
    return { isValid: false, error: `${field.label} is required` };
  }

  // Skip validation if field is not required and empty
  if (!field.required && (value === undefined || value === null || value === '')) {
    return { isValid: true };
  }

  // Type-specific validation
  switch (field.type) {
    case 'email':
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return { isValid: false, error: `Please enter a valid email address` };
      }
      break;

    case 'phone':
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      if (!phoneRegex.test(value.replace(/\s/g, ''))) {
        return { isValid: false, error: `Please enter a valid phone number` };
      }
      break;

    case 'number':
      const numValue = Number(value);
      if (isNaN(numValue)) {
        return { isValid: false, error: `Please enter a valid number` };
      }
      if (field.validation?.min !== undefined && numValue < field.validation.min) {
        return { isValid: false, error: `Value must be at least ${field.validation.min}` };
      }
      if (field.validation?.max !== undefined && numValue > field.validation.max) {
        return { isValid: false, error: `Value must be at most ${field.validation.max}` };
      }
      break;

    case 'text':
    case 'textarea':
      const strValue = String(value);
      if (field.validation?.minLength && strValue.length < field.validation.minLength) {
        return { isValid: false, error: `Must be at least ${field.validation.minLength} characters` };
      }
      if (field.validation?.maxLength && strValue.length > field.validation.maxLength) {
        return { isValid: false, error: `Must be at most ${field.validation.maxLength} characters` };
      }
      if (field.validation?.pattern) {
        const regex = new RegExp(field.validation.pattern);
        if (!regex.test(strValue)) {
          return { isValid: false, error: `Please enter a valid ${field.label.toLowerCase()}` };
        }
      }
      break;

    case 'select':
      if (field.options && !field.options.some(option => option.value === value)) {
        return { isValid: false, error: `Please select a valid option` };
      }
      break;
  }

  return { isValid: true };
}

// Helper function to get default value for a field type
export function getDefaultFieldValue(field: CustomField): any {
  switch (field.type) {
    case 'checkbox':
      return false;
    case 'number':
      return '';
    case 'select':
      return field.options?.[0]?.value || '';
    default:
      return '';
  }
}
