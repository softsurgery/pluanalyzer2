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
import { AnalysisStore } from "@/hooks/stores/useAnalysisStore";

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
  const addressField: Field<CustomFieldProps> = {
    id: "ws-address",
    label: "Adresse (BAN / Géoplateforme)",
    variant: FieldVariant.CUSTOM,
    description: "Autocomplétion via la Base Adresse Nationale.",
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
        />
      ),
    },
  };

  const cadastreNumbersField: Field<TextFieldProps> = {
    id: "ws-cadastre-numbers",
    label: "Numéros cadastraux",
    variant: FieldVariant.TEXT,
    placeholder: "ex: 49, 50, 51, 256 (ou 844 K 39, 49, 50, 51)",
    description:
      "Optionnel : séparez les numéros de parcelles par des virgules (ex: 49, 50, 51, 256).",
    className: "font-mono",
    error: analysisStore.createDtoErrors?.cadastreNumbers?.[0],
    props: {
      value: analysisStore.createDto.cadastreNumbers,
      onChange: (value) => {
        analysisStore.setNested("createDto.cadastreNumbers", value);
        analysisStore.setNested("createDtoErrors.cadastreNumbers", []);
        onLocationInputChange?.();
      },
    },
  };

  const locationFormStructure: FormStructure = {
    title: "",
    description: "",
    orientation: "horizontal",
    fieldsets: [
      {
        gap: 20,
        rows: [{ fields: [addressField] }, { fields: [cadastreNumbersField] }],
      },
    ],
  };

  return {
    locationFormStructure,
  };
};
