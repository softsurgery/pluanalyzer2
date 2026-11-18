import { MapPin } from "lucide-react";
import type { AIModelRecord } from "@/api/ai-models";
import { fetchAddressSuggestions, type AddressSuggestion } from "@/api/parcels";
import {
  MarkerPicker,
  type MarkerCoordinates,
} from "@/components/MarkerPicker";
import {
  CustomFieldProps,
  Field,
  FieldVariant,
  FormStructure,
  SelectFieldProps,
  TextareaFieldProps,
  TextFieldProps,
} from "@/components/shared/form-builder";
import { InteractiveSelect } from "@/components/ui/interactive-select";
import type { LocationInputMode } from "@/components/workspace/AnalysisTab";
import { AnalysisStore } from "@/hooks/stores/useAnalysisStore";
import { cn } from "@/lib/utils";
import type { ParcelRecord } from "@/types/parcels";

const AUTO_PARCEL_VALUE = "__auto__";
const SYSTEM_DEFAULT_MODEL_VALUE = "__default__";

const LOCATION_MODES: Array<{
  value: LocationInputMode;
  label: string;
  description: string;
}> = [
  {
    value: "address",
    label: "Adresse française",
    description: "Recherche via BAN / Géoplateforme",
  },
  {
    value: "parcel",
    label: "IDU Cadastral ou Parcelle enregistrée",
    description: "Saisie d'IDU ou sélection en base",
  },
  {
    value: "map",
    label: "Point sur la carte",
    description: "Sélection directe via MarkerPicker",
  },
];

interface AnalysisFormStructureProps {
  analysisStore: AnalysisStore;
  parcels: ParcelRecord[];
  aiModels: AIModelRecord[];
  onAddressSelect?: (suggestion: AddressSuggestion) => void;
  onParcelSelect?: (parcelId: string, parcel?: ParcelRecord) => void;
  onPickedLocationChange?: (coords: MarkerCoordinates) => void;
}

export const useAnalysisFormStructure = ({
  analysisStore,
  parcels,
  aiModels,
  onAddressSelect,
  onParcelSelect,
  onPickedLocationChange,
}: AnalysisFormStructureProps) => {
  const { locationMode, pickedLocation } = analysisStore.createDto;
  const isAddressMode = locationMode === "address";
  const isParcelMode = locationMode === "parcel";
  const isMapMode = locationMode === "map";

  const locationModeField: Field<CustomFieldProps> = {
    id: "ws-location-mode",
    label: "Mode de localisation de la parcelle",
    variant: FieldVariant.CUSTOM,
    description: "Sélectionnez la méthode d'identification de la parcelle.",
    props: {
      children: (
        <div className="grid gap-3 sm:grid-cols-3">
          {LOCATION_MODES.map((mode) => {
            const checked = locationMode === mode.value;
            return (
              <label
                key={mode.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                  checked
                    ? "border-primary bg-primary/5"
                    : "border-input hover:bg-muted/50",
                )}
              >
                <input
                  type="radio"
                  name="location-mode"
                  value={mode.value}
                  checked={checked}
                  onChange={() =>
                    analysisStore.setNested(
                      "createDto.locationMode",
                      mode.value,
                    )
                  }
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold leading-tight">
                    {mode.label}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {mode.description}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      ),
    },
  };

  const addressField: Field<CustomFieldProps> = {
    id: "ws-address",
    label: "Adresse française (BAN / Géoplateforme)",
    variant: FieldVariant.CUSTOM,
    description: "Autocomplétion via la Base Adresse Nationale.",
    wrapperClassName: cn(!isAddressMode && "opacity-60"),
    error: analysisStore.createDtoErrors?.address?.[0],
    props: {
      children: (
        <InteractiveSelect<AddressSuggestion>
          id="ws-address"
          value={analysisStore.createDto.address}
          onChange={(value) => {
            analysisStore.setNested("createDto.address", value);
            analysisStore.setNested("createDtoErrors.address", []);
          }}
          onSelect={onAddressSelect}
          fetchSuggestions={fetchAddressSuggestions}
          getItemKey={(item, idx) =>
            `${item.label}-${item.coordinates.lat}-${idx}`
          }
          getItemLabel={(item) => item.label}
          renderItem={(item) => (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="truncate font-medium">{item.label}</div>
                {item.context && (
                  <div className="truncate text-xs text-muted-foreground">
                    {item.context}
                  </div>
                )}
              </div>
            </div>
          )}
          placeholder="Ex: 12 Avenue Sextius, Aix-en-Provence"
          emptyText="Aucune adresse trouvée"
          disabled={!isAddressMode}
        />
      ),
    },
  };

  const iduField: Field<TextFieldProps> = {
    id: "ws-idu",
    label: "IDU Cadastral",
    variant: FieldVariant.TEXT,
    placeholder: "IDU (ex: 13001000AB0123)",
    description: "Identifiant unique de parcelle cadastrale IGN.",
    className: "font-mono",
    wrapperClassName: cn(!isParcelMode && "opacity-60"),
    error: analysisStore.createDtoErrors?.idu?.[0],
    props: {
      disabled: !isParcelMode,
      value: analysisStore.createDto.idu,
      onChange: (value) => {
        analysisStore.setNested("createDto.idu", value);
        analysisStore.setNested("createDtoErrors.idu", []);
      },
    },
  };

  const parcelField: Field<SelectFieldProps> = {
    id: "ws-parcel",
    label: "Ou parcelle enregistrée en base",
    variant: FieldVariant.SELECT,
    description: "Choisir une parcelle déjà importée dans Payload.",
    className: "font-mono",
    wrapperClassName: cn(!isParcelMode && "opacity-60"),
    error: analysisStore.createDtoErrors?.selectedParcelId?.[0],
    props: {
      disabled: !isParcelMode,
      value: analysisStore.createDto.selectedParcelId || AUTO_PARCEL_VALUE,
      onValueChange: (value) => {
        const nextId = !value || value === AUTO_PARCEL_VALUE ? "" : value;
        const found = parcels.find((p) => String(p.id) === nextId);
        analysisStore.setNested("createDto.selectedParcelId", nextId);
        analysisStore.setNested("createDtoErrors.selectedParcelId", []);
        onParcelSelect?.(nextId, found);
      },
      options: [
        { label: "— Auto via recherche —", value: AUTO_PARCEL_VALUE },
        ...parcels.map((p) => ({
          label: `${p.idu} (${p.surfaceM2 ?? "?"} m²)`,
          value: String(p.id),
        })),
      ],
    },
  };

  const mapField: Field<CustomFieldProps> = {
    id: "ws-map",
    label: "Sélection directe sur la carte",
    variant: FieldVariant.CUSTOM,
    description: "Cliquez sur la carte pour positionner le marqueur.",
    wrapperClassName: cn(!isMapMode && "opacity-60"),
    error: analysisStore.createDtoErrors?.pickedLocation?.[0],
    props: {
      children: (
        <MarkerPicker
          value={pickedLocation}
          onChange={(coords) => {
            analysisStore.setNested("createDto.pickedLocation", coords);
            analysisStore.setNested("createDtoErrors.pickedLocation", []);
            onPickedLocationChange?.(coords);
          }}
          disabled={!isMapMode}
        />
      ),
    },
  };

  const defaultModel = aiModels.find((m) => m.isDefault);
  const defaultOptionLabel = defaultModel
    ? `Par défaut du système (${defaultModel.label || defaultModel.model})`
    : "Par défaut du système";

  const aiModelField: Field<SelectFieldProps> = {
    id: "ws-ai-model",
    label: "Modèle IA",
    variant: FieldVariant.SELECT,
    description: "Modèle utilisé pour l'interprétation réglementaire",
    wrapperClassName: "max-w-md",
    error: analysisStore.createDtoErrors?.aiModel?.[0],
    props: {
      value: analysisStore.createDto.aiModel || SYSTEM_DEFAULT_MODEL_VALUE,
      onValueChange: (value) => {
        const nextModel =
          !value || value === SYSTEM_DEFAULT_MODEL_VALUE ? "" : value;
        analysisStore.setNested("createDto.aiModel", nextModel);
        analysisStore.setNested("createDtoErrors.aiModel", []);
      },
      options: [
        { label: defaultOptionLabel, value: SYSTEM_DEFAULT_MODEL_VALUE },
        ...aiModels.map((m) => ({
          label: `${m.label ? `${m.label} — ` : ""}${m.model}${m.isDefault ? " (Par défaut)" : ""}`,
          value: m.model,
        })),
      ],
    },
  };

  const promptField: Field<TextareaFieldProps> = {
    id: "ws-prompt",
    label: "Prompt d'analyse de faisabilité",
    variant: FieldVariant.TEXTAREA,
    required: true,
    description:
      "Chaque envoi crée une nouvelle version immuable dans l'historique.",
    error: analysisStore.createDtoErrors?.prompt?.[0],
    className: "h-60",
    props: {
      value: analysisStore.createDto.prompt,
      onChange: (value) => {
        analysisStore.setNested("createDto.prompt", value);
        analysisStore.setNested("createDtoErrors.prompt", []);
      },
    },
  };

  const analysisFormStructure: FormStructure = {
    title: "",
    description: "",
    fieldsets: [
      {
        gap: 20,
        rows: [
          { fields: [locationModeField] },
          { fields: [addressField, iduField, parcelField] },
          { fields: [mapField] },
          { fields: [aiModelField] },
          { fields: [promptField] },
        ],
      },
    ],
  };

  return {
    analysisFormStructure,
  };
};
