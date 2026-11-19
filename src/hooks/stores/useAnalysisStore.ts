import { create } from "zustand";
import type { MarkerCoordinates } from "@/components/MarkerPicker";
import type { LocationInputMode } from "@/components/workspace/RegulationsTab";
import { setNestedValue } from "@/lib/object";

export interface CreateAnalysisDto {
  projectId: string;
  locationMode: LocationInputMode;
  address: string;
  idu: string;
  cadastreNumbers: string;
  selectedParcelId: string;
  pickedLocation: MarkerCoordinates | null;
  aiModel: string;
  prompt: string;
}

interface AnalysisStoreData {
  createDto: CreateAnalysisDto;
  createDtoErrors: Record<string, string[]>;
}

export interface AnalysisStore extends AnalysisStoreData {
  set: <T>(name: keyof AnalysisStoreData, value: T) => void;
  setNested: <T>(path: string, value: T) => void;
  reset: () => void;
}

const initialState: AnalysisStoreData = {
  createDto: {
    projectId: "",
    locationMode: "address",
    address: "12 Avenue Sextius, Aix-en-Provence",
    idu: "",
    cadastreNumbers: "",
    selectedParcelId: "",
    pickedLocation: null,
    aiModel: "",
    prompt:
      "Analyser la constructibilité maximale (emprise, hauteur, SDP, stationnement) pour un bâtiment mixte R+3.",
  },
  createDtoErrors: {},
};

export const useAnalysisStore = create<AnalysisStore>((set) => ({
  ...initialState,
  set: (name, value) => set((state) => ({ ...state, [name]: value })),
  setNested: (path, value) =>
    set((state) => setNestedValue(state, path, value)),
  reset: () => set({ ...initialState }),
}));
