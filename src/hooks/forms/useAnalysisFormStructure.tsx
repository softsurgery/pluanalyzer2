import { MapPin } from "lucide-react";
import { fetchAddressSuggestions, type AddressSuggestion } from "@/api/parcels";
import {
  CustomFieldProps,
  Field,
  FieldVariant,
  FormStructure,
  TextFieldProps,
} from "@/components/shared/form-builder";
import { InteractiveSelect } from "@/components/ui/interactive-select";
import type { LocationInputMode } from "@/components/workspace/RegulationsTab";
import { AnalysisStore } from "@/hooks/stores/useAnalysisStore";
import { cn } from "@/lib/utils";

interface AnalysisFormStructureProps {
  analysisStore: AnalysisStore;
  onAddressSelect?: (suggestion: AddressSuggestion) => void;
  onLocationInputChange?: () => void;
}

export const useAnalysisFormStructure = ({
  analysisStore,
  onAddressSelect,
  onLocationInputChange,
}: AnalysisFormStructureProps) => {
  const { locationMode } = analysisStore.createDto;
  const isAddressMode = locationMode === "address";
  const isParcelMode = locationMode === "parcel";

  const handleModeChange = (mode: LocationInputMode) => {
    analysisStore.setNested("createDto.locationMode", mode);
    onLocationInputChange?.();
  };

  const renderModeCard = (
    mode: LocationInputMode,
    label: string,
    description: string,
  ) => {
    const checked = locationMode === mode;
    return (
      <label
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
          value={mode}
          checked={checked}
          onChange={() => handleModeChange(mode)}
          className="mt-1 h-4 w-4 accent-primary"
        />
        <div className="space-y-0.5">
          <div className="text-sm font-semibold leading-tight">{label}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
      </label>
    );
  };

  const addressModeField: Field<CustomFieldProps> = {
    id: "ws-location-mode-address",
    label: "Mode de localisation de la parcelle",
    variant: FieldVariant.CUSTOM,
    props: {
      children: renderModeCard(
        "address",
        "Adresse française",
        "Recherche via BAN / Géoplateforme",
      ),
    },
  };

  const parcelModeField: Field<CustomFieldProps> = {
    id: "ws-location-mode-parcel",
    label: "",
    variant: FieldVariant.CUSTOM,
    description: "Sélectionnez la méthode d'identification de la parcelle.",
    props: {
      children: renderModeCard(
        "parcel",
        "IDU Cadastral",
        "Saisie de l'identifiant cadastral IGN",
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
            onLocationInputChange?.();
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
        onLocationInputChange?.();
      },
    },
  };

  const locationFormStructure: FormStructure = {
    title: "",
    description: "",
    orientation: "vertical",
    fieldsets: [
      {
        gap: 20,
        rows: [{ fields: [addressModeField] }, { fields: [parcelModeField] }],
      },
      {
        gap: 20,
        rows: [{ fields: [addressField] }, { fields: [iduField] }],
      },
    ],
  };

  return {
    locationFormStructure,
  };
};
