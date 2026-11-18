import { create } from "zustand";
import { setNestedValue } from "@/lib/object";

export interface CreateDocumentDto {
  title: string;
  zoneCode: string;
  codeInsee: string;
  projectId: string;
  file: File | null;
}

interface DocumentStoreData {
  createDto: CreateDocumentDto;
  createDtoErrors: Record<string, string[]>;
}

export interface DocumentStore extends DocumentStoreData {
  set: <T>(name: keyof DocumentStoreData, value: T) => void;
  setNested: <T>(path: string, value: T) => void;
  reset: () => void;
}

const initialState: DocumentStoreData = {
  createDto: {
    title: "",
    zoneCode: "UA",
    codeInsee: "13001",
    projectId: "",
    file: null,
  },
  createDtoErrors: {},
};

export const useDocumentStore = create<DocumentStore>((set) => ({
  ...initialState,
  set: (name, value) => set((state) => ({ ...state, [name]: value })),
  setNested: (path, value) =>
    set((state) => setNestedValue(state, path, value)),
  reset: () => set({ ...initialState }),
}));
