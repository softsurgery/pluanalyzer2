import {
  CustomFieldProps,
  Field,
  FieldVariant,
  FormStructure,
  TextareaFieldProps,
  TextFieldProps,
} from "@/components/shared/form-builder";
import { ProjectStore } from "@/hooks/stores/useProjectStore";

interface ProjectInfoFormStructureProps {
  projectStore: ProjectStore;
  commune: string;
  codeInsee: string;
  territoryLabel: string;
}

export const useProjectInfoFormStructure = ({
  projectStore,
  commune,
  codeInsee,
  territoryLabel,
}: ProjectInfoFormStructureProps) => {
  const nameField: Field<TextFieldProps> = {
    id: "project-title",
    label: "Titre du projet",
    variant: FieldVariant.TEXT,
    required: true,
    placeholder: "Nom du projet",
    description: "Intitulé de l'étude de faisabilité.",
    error: projectStore.updateDtoErrors?.name?.[0],
    props: {
      value: projectStore.updateDto.name,
      onChange: (value) => {
        projectStore.setNested("updateDto.name", value);
        projectStore.setNested("updateDtoErrors.name", []);
      },
    },
  };

  const descriptionField: Field<TextareaFieldProps> = {
    id: "project-description",
    label: "Description",
    variant: FieldVariant.TEXTAREA,
    placeholder: "Description du projet (optionnelle)",
    description: "Notes complémentaires sur le programme ou le site.",
    error: projectStore.updateDtoErrors?.description?.[0],
    props: {
      value: projectStore.updateDto.description,
      onChange: (value) => {
        projectStore.setNested("updateDto.description", value);
        projectStore.setNested("updateDtoErrors.description", []);
      },
    },
  };

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
          { fields: [nameField] },
          { fields: [descriptionField] },
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
