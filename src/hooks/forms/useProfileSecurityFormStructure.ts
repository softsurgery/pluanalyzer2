import {
  Field,
  FieldVariant,
  FormStructure,
  PasswordFieldProps,
} from "@/components/shared/form-builder";
import { ProfileStore } from "@/hooks/stores/useProfileStore";

interface ProfileSecurityFormStructureProps {
  profileStore: ProfileStore;
  onFieldChange?: () => void;
}

export const useProfileSecurityFormStructure = ({
  profileStore,
  onFieldChange,
}: ProfileSecurityFormStructureProps) => {
  const passwordField: Field<PasswordFieldProps> = {
    id: "profile-password",
    label: "Nouveau mot de passe",
    variant: FieldVariant.PASSWORD,
    required: true,
    placeholder: "Minimum 8 caractères",
    description: "Doit contenir au moins 8 caractères.",
    error: profileStore.passwordDtoErrors?.password?.[0],
    props: {
      value: profileStore.passwordDto.password,
      onChange: (value) => {
        profileStore.setNested("passwordDto.password", value);
        profileStore.setNested("passwordDtoErrors.password", []);
        onFieldChange?.();
      },
    },
  };

  const confirmPasswordField: Field<PasswordFieldProps> = {
    id: "profile-confirm-password",
    label: "Confirmer le mot de passe",
    variant: FieldVariant.PASSWORD,
    required: true,
    placeholder: "Répétez le mot de passe",
    description: "Saisissez à nouveau le nouveau mot de passe.",
    error: profileStore.passwordDtoErrors?.confirmPassword?.[0],
    props: {
      value: profileStore.passwordDto.confirmPassword,
      onChange: (value) => {
        profileStore.setNested("passwordDto.confirmPassword", value);
        profileStore.setNested("passwordDtoErrors.confirmPassword", []);
        onFieldChange?.();
      },
    },
  };

  const profileSecurityFormStructure: FormStructure = {
    title: "",
    description: "",
    fieldsets: [
      {
        gap: 16,
        rows: [
          { fields: [passwordField] },
          { fields: [confirmPasswordField] },
        ],
      },
    ],
  };

  return {
    profileSecurityFormStructure,
  };
};
