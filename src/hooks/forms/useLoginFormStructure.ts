import {
  EmailFieldProps,
  Field,
  FieldVariant,
  FormStructure,
  PasswordFieldProps,
} from "@/components/shared/form-builder";
import { AuthStore } from "@/hooks/stores/useAuthStore";

interface LoginFormStructureProps {
  authStore: AuthStore;
}

export const useLoginFormStructure = ({
  authStore,
}: LoginFormStructureProps) => {
  const emailField: Field<EmailFieldProps> = {
    id: "login-email",
    label: "Email",
    variant: FieldVariant.EMAIL,
    required: true,
    placeholder: "planner@pluanalyzer.fr",
    description: "Adresse email de votre compte Payload CMS.",
    error: authStore.loginDtoErrors?.email?.[0],
    props: {
      value: authStore.loginDto.email,
      onChange: (value) => {
        authStore.setNested("loginDto.email", value);
        authStore.setNested("loginDtoErrors.email", []);
      },
    },
  };

  const passwordField: Field<PasswordFieldProps> = {
    id: "login-password",
    label: "Mot de passe",
    variant: FieldVariant.PASSWORD,
    required: true,
    description: "Mot de passe associé à votre compte.",
    error: authStore.loginDtoErrors?.password?.[0],
    props: {
      value: authStore.loginDto.password,
      onChange: (value) => {
        authStore.setNested("loginDto.password", value);
        authStore.setNested("loginDtoErrors.password", []);
      },
    },
  };

  const loginFormStructure: FormStructure = {
    title: "",
    description: "",
    fieldsets: [
      {
        gap: 16,
        rows: [
          { fields: [emailField] },
          { fields: [passwordField] },
        ],
      },
    ],
  };

  return {
    loginFormStructure,
  };
};
