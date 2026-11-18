import { create } from "zustand";
import { setNestedValue } from "@/lib/object";

export interface UpdateProfileDto {
  fullName: string;
  email: string;
  organization: string;
  territoryFocus: string;
}

export interface UpdatePasswordDto {
  password: string;
  confirmPassword: string;
}

interface ProfileStoreData {
  updateDto: UpdateProfileDto;
  passwordDto: UpdatePasswordDto;
  updateDtoErrors: Record<string, string[]>;
  passwordDtoErrors: Record<string, string[]>;
}

export interface ProfileStore extends ProfileStoreData {
  set: <T>(name: keyof ProfileStoreData, value: T) => void;
  setNested: <T>(path: string, value: T) => void;
  reset: () => void;
}

const initialState: ProfileStoreData = {
  updateDto: {
    fullName: "",
    email: "",
    organization: "",
    territoryFocus: "",
  },
  passwordDto: {
    password: "",
    confirmPassword: "",
  },
  updateDtoErrors: {},
  passwordDtoErrors: {},
};

export const useProfileStore = create<ProfileStore>((set) => ({
  ...initialState,
  set: (name, value) => set((state) => ({ ...state, [name]: value })),
  setNested: (path, value) =>
    set((state) => setNestedValue(state, path, value)),
  reset: () => set({ ...initialState }),
}));
