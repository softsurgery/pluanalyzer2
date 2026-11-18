import {
  CustomFieldProps,
  EmailFieldProps,
  Field,
  FieldVariant,
  FormStructure,
  TextFieldProps,
} from "@/components/shared/form-builder";
import { ProfileStore } from "@/hooks/stores/useProfileStore";

interface ProfileInfoFormStructureProps {
  profileStore: ProfileStore;
  roleLabel: string;
  onFieldChange?: () => void;
}

export const useProfileInfoFormStructure = ({
  profileStore,
  roleLabel,
  onFieldChange,
}: ProfileInfoFormStructureProps) => {
  const fullNameField: Field<TextFieldProps> = {
    id: "profile-fullname",
    label: "Nom complet",
    variant: FieldVariant.TEXT,
    required: true,
    placeholder: "Jean Dupont",
    description: "Votre prénom et nom affichés sur la plateforme.",
    error: profileStore.updateDtoErrors?.fullName?.[0],
    props: {
      value: profileStore.updateDto.fullName,
      onChange: (value) => {
        profileStore.setNested("updateDto.fullName", value);
        profileStore.setNested("updateDtoErrors.fullName", []);
        onFieldChange?.();
      },
    },
  };

  const emailField: Field<EmailFieldProps> = {
    id: "profile-email",
    label: "Adresse email",
    variant: FieldVariant.EMAIL,
    required: true,
    placeholder: "nom@organisation.fr",
    description: "Adresse email utilisée pour la connexion.",
    error: profileStore.updateDtoErrors?.email?.[0],
    props: {
      value: profileStore.updateDto.email,
      onChange: (value) => {
        profileStore.setNested("updateDto.email", value);
        profileStore.setNested("updateDtoErrors.email", []);
        onFieldChange?.();
      },
    },
  };

  const organizationField: Field<TextFieldProps> = {
    id: "profile-org",
    label: "Organisation",
    variant: FieldVariant.TEXT,
    placeholder: "Métropole Aix-Marseille-Provence",
    description: "Collectivité, agence ou bureau d'études.",
    error: profileStore.updateDtoErrors?.organization?.[0],
    props: {
      value: profileStore.updateDto.organization,
      onChange: (value) => {
        profileStore.setNested("updateDto.organization", value);
        profileStore.setNested("updateDtoErrors.organization", []);
        onFieldChange?.();
      },
    },
  };

  const territoryField: Field<TextFieldProps> = {
    id: "profile-territory",
    label: "Territoire de référence",
    variant: FieldVariant.TEXT,
    placeholder: "Aix-Marseille-Provence",
    description: "Territoire principal de vos études PLU.",
    error: profileStore.updateDtoErrors?.territoryFocus?.[0],
    props: {
      value: profileStore.updateDto.territoryFocus,
      onChange: (value) => {
        profileStore.setNested("updateDto.territoryFocus", value);
        profileStore.setNested("updateDtoErrors.territoryFocus", []);
        onFieldChange?.();
      },
    },
  };

  const roleField: Field<CustomFieldProps> = {
    id: "profile-role",
    label: "Rôle",
    variant: FieldVariant.CUSTOM,
    description: "Niveau d'autorisation attribué à votre compte.",
    props: {
      children: (
        <div className="flex h-9 items-center rounded-lg border bg-muted/50 px-3 text-sm text-muted-foreground">
          {roleLabel}
        </div>
      ),
    },
  };

  const profileInfoFormStructure: FormStructure = {
    title: "",
    description: "",
    fieldsets: [
      {
        gap: 16,
        rows: [
          { fields: [fullNameField] },
          { fields: [emailField] },
          { fields: [organizationField] },
          { fields: [territoryField] },
          { fields: [roleField] },
        ],
      },
    ],
  };

  return {
    profileInfoFormStructure,
  };
};
