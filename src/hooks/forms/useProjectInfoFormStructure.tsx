import {
  CustomFieldProps,
  Field,
  FieldVariant,
  FormStructure,
  TextFieldProps,
} from "@/components/shared/form-builder";

interface ProjectInfoFormStructureProps {
  commune: string;
  codeInsee: string;
  territoryLabel: string;
}

export const useProjectInfoFormStructure = ({
  commune,
  codeInsee,
  territoryLabel,
}: ProjectInfoFormStructureProps) => {

  const communeField: Field<TextFieldProps> = {
    id: "project-commune",
    label: "Commune",
    variant: FieldVariant.TEXT,
    props: {
      value: commune,
      disabled: true,
    },
  };

  const codeInseeField: Field<TextFieldProps> = {
    id: "project-insee",
    label: "Code INSEE",
    variant: FieldVariant.TEXT,
    props: {
      value: codeInsee,
      disabled: true,
    },
  };

  const territoryField: Field<TextFieldProps> = {
    id: "project-territory",
    label: "Territoire",
    variant: FieldVariant.TEXT,
    props: {
      value: territoryLabel,
      disabled: true,
    },
  };

  const locationHintField: Field<CustomFieldProps> = {
    id: "project-location-hint",
    variant: FieldVariant.CUSTOM,
    props: {
      children: (
        <p className="text-xs text-muted-foreground">
          La commune, le code INSEE et le territoire doivent être mis à jour
          depuis l&apos;analyse elle-même.
        </p>
      ),
    },
  };

  const projectInfoFormStructure: FormStructure = {
    includeHeader: false,
    fieldsets: [
      {
        gap: 16,
        rows: [
          { fields: [communeField, codeInseeField, territoryField] },
          { fields: [locationHintField] },
        ],
      },
    ],
  };

  return {
    projectInfoFormStructure,
  };
};
