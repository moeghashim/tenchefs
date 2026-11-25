interface Base {
  readonly a: string;
  readonly b: number;
}

export type Picked = Pick<Base, "a"> & { readonly c: boolean };
