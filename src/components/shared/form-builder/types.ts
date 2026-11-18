import type React from "react";

export type FormHeaderText =
  | string
  | {
      value: string;
      className?: string;
    };

export interface FormStructure {
  title?: FormHeaderText;
  description?: FormHeaderText;
  orientation?: "vertical" | "horizontal";
  includeHeader?: boolean;
  fieldsets: Fieldset[];
  toggleableFieldsets?: boolean;
  gap?: number;
}

export interface Fieldset {
  title?: FormHeaderText;
  description?: FormHeaderText;
  component?: React.ReactNode;
  includeHeader?: boolean;
  rows: FieldsetRow[];
  gap?: number;
}

export interface FieldsetRow {
  className?: string;
  fields: Field[];
  gap?: number;
}

export interface SelectOption {
  label: string;
  value: string;
  [key: string]: any;
}

type CheckedState = boolean | "indeterminate";

export enum FieldVariant {
  TEXT = "text",
  EMAIL = "email",
  URL = "url",
  NUMBER = "number",
  SELECT = "select",
  CHECKBOX = "checkbox",
  RADIO = "radio",
  PASSWORD = "password",
  SWITCH = "switch",
  TEXTAREA = "textarea",
  CUSTOM = "custom",
  EMPTY = "empty",
}

export type FieldErrors = Record<string, string[] | undefined>;

export interface Field<T = any> {
  id: string;
  label?: string;
  className?: string;
  wrapperClassName?: string;
  variant: FieldVariant;
  required?: boolean;
  description?: string;
  placeholder?: string;
  hidden?: boolean;
  pending?: boolean;
  error?: string;
  props?: T;
}

export interface BaseFieldProps {
  disabled?: boolean;
}

export interface TextFieldProps extends BaseFieldProps {
  value?: string | null;
  onChange?: (e: string) => void;
  maxLength?: number;
}

export interface EmailFieldProps extends BaseFieldProps {
  value?: string | null;
  onChange?: (e: string) => void;
}

export interface UrlFieldProps extends BaseFieldProps {
  value?: string | null;
  onChange?: (e: string) => void;
}

export interface NumberFieldProps extends BaseFieldProps {
  value?: number | null;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
}

export interface SelectFieldProps extends BaseFieldProps {
  value?: string | null;
  onValueChange?: (value: string) => void;
  options?: SelectOption[];
  nullable?: boolean;
}

export interface CheckboxFieldProps extends BaseFieldProps {
  checked?: boolean;
  value?: CheckedState;
  defaultChecked?: boolean;
  selectOptions?: SelectOption[];
  onCheckedChange?: (e: CheckedState) => void;
}

export interface RadioFieldProps extends BaseFieldProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options?: SelectOption[];
  spread?: "horizontal" | "vertical";
}

export interface PasswordFieldProps extends BaseFieldProps {
  value?: string;
  onChange?: (e: string) => void;
}

export interface TextareaFieldProps extends BaseFieldProps {
  value?: string;
  onChange?: (e: string) => void;
  resizable?: boolean;
}

export interface CustomFieldProps extends BaseFieldProps {
  className?: string;
  children: React.ReactNode;
  includeLabel?: boolean;
}

export interface EmptyFieldProps {}
