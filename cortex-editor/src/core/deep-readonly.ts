/**
 * DeepReadonly<T> — recursively marks every property (and array element) of T
 * as `readonly`.
 *
 * Used by AnnotationStore to encode the snapshot-immutability invariant at the
 * type level: the store hands out structuredClone snapshots that callers must
 * never mutate (ZF0-1844 fixed the runtime side; this is the compile-time
 * side). A caller that tries to mutate a returned snapshot now gets a tsc
 * error instead of a silently-ignored write to a throwaway copy.
 *
 * Functions are passed through unchanged (a deep-readonly function is
 * meaningless); arrays become ReadonlyArray; all other objects get
 * `readonly` keys applied recursively. Primitives are returned as-is.
 */
export type DeepReadonly<T> =
  T extends (...args: never[]) => unknown
    ? T
    : T extends ReadonlyArray<infer E>
      ? ReadonlyArray<DeepReadonly<E>>
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T
