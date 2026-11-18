import {
  CustomFieldProps,
  Field,
  FieldVariant,
  FormStructure,
  SelectFieldProps,
  TextFieldProps,
} from "@/components/shared/form-builder";
import { Input } from "@/components/ui/input";
import { DocumentStore } from "@/hooks/stores/useDocumentStore";
import type { ProjectItem } from "@/types/projects";

interface UploadDocumentFormStructureProps {
  documentStore: DocumentStore;
  projects: ProjectItem[];
}

export const useUploadDocumentFormStructure = ({
  documentStore,
  projects,
}: UploadDocumentFormStructureProps) => {
  const titleField: Field<TextFieldProps> = {
    id: "doc-title",
    label: "Titre",
    variant: FieldVariant.TEXT,
    placeholder: "Ex: Règlement Zone UA Aix-en-Provence",
    description: "Nom affiché pour identifier le document PLU.",
    error: documentStore.createDtoErrors?.title?.[0],
    props: {
      value: documentStore.createDto.title,
      onChange: (value) => {
        documentStore.setNested("createDto.title", value);
        documentStore.setNested("createDtoErrors.title", []);
      },
    },
  };

  const zoneCodeField: Field<TextFieldProps> = {
    id: "doc-zone",
    label: "Zone",
    variant: FieldVariant.TEXT,
    description: "Code de la zone réglementaire (ex: UA, UB, AU).",
    error: documentStore.createDtoErrors?.zoneCode?.[0],
    props: {
      value: documentStore.createDto.zoneCode,
      onChange: (value) => {
        documentStore.setNested("createDto.zoneCode", value);
        documentStore.setNested("createDtoErrors.zoneCode", []);
      },
    },
  };

  const codeInseeField: Field<TextFieldProps> = {
    id: "doc-insee",
    label: "Code INSEE",
    variant: FieldVariant.TEXT,
    description: "Code INSEE à 5 chiffres de la commune.",
    error: documentStore.createDtoErrors?.codeInsee?.[0],
    props: {
      value: documentStore.createDto.codeInsee,
      onChange: (value) => {
        documentStore.setNested("createDto.codeInsee", value);
        documentStore.setNested("createDtoErrors.codeInsee", []);
      },
    },
  };

  const projectField: Field<SelectFieldProps> = {
    id: "doc-project",
    label: "Projet",
    variant: FieldVariant.SELECT,
    placeholder: "Sélectionner un projet",
    description: "Projet auquel rattacher ce document.",
    error: documentStore.createDtoErrors?.projectId?.[0],
    props: {
      value: documentStore.createDto.projectId,
      onValueChange: (value) => {
        documentStore.setNested("createDto.projectId", value || "");
        documentStore.setNested("createDtoErrors.projectId", []);
      },
      options: projects.map((p) => ({
        label: p.name,
        value: String(p.id),
      })),
    },
  };

  const fileField: Field<CustomFieldProps> = {
    id: "doc-file",
    label: "Fichier (PDF ou TXT)",
    variant: FieldVariant.CUSTOM,
    required: true,
    description: "Document réglementaire au format .pdf ou .txt.",
    error: documentStore.createDtoErrors?.file?.[0],
    props: {
      children: (
        <Input
          id="doc-file"
          type="file"
          accept=".pdf,.txt"
          required
          onChange={(e) => {
            documentStore.setNested(
              "createDto.file",
              e.target.files?.[0] || null,
            );
            documentStore.setNested("createDtoErrors.file", []);
          }}
          className="max-w-sm cursor-pointer text-xs file:mr-3 file:rounded-md file:bg-secondary file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-secondary-foreground"
        />
      ),
    },
  };

  const uploadDocumentFormStructure: FormStructure = {
    title: "",
    description: "",
    fieldsets: [
      {
        gap: 16,
        rows: [
          { fields: [titleField, zoneCodeField, codeInseeField, projectField] },
          { fields: [fileField] },
        ],
      },
    ],
  };

  return {
    uploadDocumentFormStructure,
  };
};
