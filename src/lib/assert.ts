// Narrows `value` to `T` and throws with a useful label if null/undefined.
// Use instead of `!` non-null assertions: invariants you trust become a
// runtime error message instead of "Cannot read properties of undefined" at
// the next access.
export function assertNonNull<T>(value: T | null | undefined, label = "value"): asserts value is T {
  if (value == null) {
    throw new Error(`expected ${label}, got ${value === null ? "null" : "undefined"}`);
  }
}
