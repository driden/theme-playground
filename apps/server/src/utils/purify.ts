import { EitherAsync } from "purify-ts";

export function fromPromise<ErrorType, Value>(
  promise: () => Promise<Value>,
  mapError: (error: unknown) => ErrorType,
): EitherAsync<ErrorType, Value> {
  return EitherAsync<unknown, Value>(promise).mapLeft(mapError);
}
