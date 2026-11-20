import {
  Field,
  FieldVariant,
  FormStructure,
  SelectFieldProps,
  TextFieldProps,
} from "@/components/shared/form-builder";
import { ProjectStore } from "@/hooks/stores/useProjectStore";

interface CreateProjectFormStructureProps {
  projectStore: ProjectStore;
}

export const useCreateProjectFormStructure = ({
  projectStore,
}: CreateProjectFormStructureProps) => {
  const nameField: Field<TextFieldProps> = {
    id: "proj-name",
    label: "Nom du projet",
    variant: FieldVariant.TEXT,
    required: true,
    placeholder: "Ex: Îlot Joliette — Bureaux & Logements",
    description: "Intitulé de l'étude de faisabilité.",
    error: projectStore.createDtoErrors?.name?.[0],
    props: {
      value: projectStore.createDto.name,
      onChange: (value) => {
        projectStore.setNested("createDto.name", value);
        projectStore.setNested("createDtoErrors.name", []);
      },
    },
  };

  const communeField: Field<TextFieldProps> = {
    id: "proj-commune",
    label: "Commune",
    variant: FieldVariant.TEXT,
    required: true,
    description: "Nom de la commune concernée.",
    error: projectStore.createDtoErrors?.commune?.[0],
    props: {
      value: projectStore.createDto.commune,
      onChange: (value) => {
        projectStore.setNested("createDto.commune", value);
        projectStore.setNested("createDtoErrors.commune", []);
      },
    },
  };

  const codeInseeField: Field<TextFieldProps> = {
    id: "proj-insee",
    label: "Code INSEE",
    variant: FieldVariant.TEXT,
    required: true,
    description: "Code INSEE à 5 chiffres de la commune.",
    error: projectStore.createDtoErrors?.codeInsee?.[0],
    props: {
      value: projectStore.createDto.codeInsee,
      onChange: (value) => {
        projectStore.setNested("createDto.codeInsee", value);
        projectStore.setNested("createDtoErrors.codeInsee", []);
      },
    },
  };

  const territoryField: Field<SelectFieldProps> = {
    id: "proj-territory",
    label: "Territoire",
    variant: FieldVariant.SELECT,
    description: "Référentiel géographique applicable au projet.",
    error: projectStore.createDtoErrors?.territory?.[0],
    props: {
      value: projectStore.createDto.territory,
      onValueChange: (value) => {
        projectStore.setNested(
          "createDto.territory",
          (value || "amp") as "amp" | "gpu",
        );
        projectStore.setNested("createDtoErrors.territory", []);
      },
      options: [
        { label: "Métropole Aix-Marseille-Provence", value: "amp" },
        { label: "National GPU", value: "gpu" },
      ],
    },
  };

  const createProjectFormStructure: FormStructure = {
    title: "",
    description: "",
    fieldsets: [
      {
        gap: 16,
        rows: [
          { fields: [nameField, communeField, codeInseeField] },
          { fields: [territoryField] },
        ],
      },
    ],
  };

  return {
    createProjectFormStructure,
  };
};
