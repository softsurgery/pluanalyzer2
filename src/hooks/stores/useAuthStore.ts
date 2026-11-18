import { create } from "zustand";
import { setNestedValue } from "@/lib/object";

export interface LoginDto {
  email: string;
  password: string;
}

interface AuthStoreData {
  loginDto: LoginDto;
  loginDtoErrors: Record<string, string[]>;
}

export interface AuthStore extends AuthStoreData {
  set: <T>(name: keyof AuthStoreData, value: T) => void;
  setNested: <T>(path: string, value: T) => void;
  reset: () => void;
}

const initialState: AuthStoreData = {
  loginDto: {
    email: "planner@pluanalyzer.fr",
    password: "PluPlanner2026!",
  },
  loginDtoErrors: {},
};

export const useAuthStore = create<AuthStore>((set) => ({
  ...initialState,
  set: (name, value) => set((state) => ({ ...state, [name]: value })),
  setNested: (path, value) =>
    set((state) => setNestedValue(state, path, value)),
  reset: () => set({ ...initialState }),
}));
