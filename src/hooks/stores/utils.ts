export function setNestedValue<T extends object>(
  state: T,
  path: string,
  value: unknown,
): T {
  const keys = path.split(".");
  const newState = { ...state };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = newState;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    } else {
      current[key] = { ...current[key] };
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
  return newState;
}
