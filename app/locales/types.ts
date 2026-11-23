/** The shape of a German namespace. `satisfies Translation<typeof de>` fails on missing or extra keys. */
export type Translation<T> = {
  [K in keyof T]: T[K] extends string ? string : Translation<T[K]>;
};
