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

function toPath(path: string | (string | number)[]): (string | number)[] {
  if (Array.isArray(path)) return path;
  if (typeof path !== "string") return [];
  return path
    .replace(/\[(\w+)\]/g, ".$1")
    .replace(/^\./, "")
    .split(".");
}

export function getDeepValue<T = unknown>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: any,
  path: string | (string | number)[],
  defaultValue?: T,
): T | undefined {
  if (obj === null || obj === undefined) {
    return defaultValue;
  }

  const keys = toPath(path);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return defaultValue;
    }
    current = current[key];
  }

  return current === undefined ? defaultValue : (current as T);
}
