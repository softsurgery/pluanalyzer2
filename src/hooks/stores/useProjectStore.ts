import { create } from "zustand";
import { setNestedValue } from "./utils";

export interface CreateProjectDto {
  name: string;
  commune: string;
  codeInsee: string;
  territory: "amp" | "gpu";
  description: string;
}

interface ProjectStoreData {
  createDto: CreateProjectDto;
  createDtoErrors: Record<string, string[]>;
}

export interface ProjectStore extends ProjectStoreData {
  set: <T>(name: keyof ProjectStoreData, value: T) => void;
  setNested: <T>(path: string, value: T) => void;
  reset: () => void;
}

const initialState: ProjectStoreData = {
  createDto: {
    name: "",
    commune: "Aix-en-Provence",
    codeInsee: "13001",
    territory: "amp",
    description: "",
  },
  createDtoErrors: {},
};

export const useProjectStore = create<ProjectStore>((set) => ({
  ...initialState,
  set: (name, value) => set((state) => ({ ...state, [name]: value })),
  setNested: (path, value) => set((state) => setNestedValue(state, path, value)),
  reset: () => set({ ...initialState }),
}));
