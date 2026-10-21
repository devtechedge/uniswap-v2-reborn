/** A revert in the model. `reason` mirrors the original revert string ("" for a bare revert). */
export class Revert extends Error {
  constructor(public readonly reason: string) {
    super(reason === "" ? "revert" : reason);
    this.name = "Revert";
  }
}

export function require(cond: boolean, reason: string): asserts cond {
  if (!cond) throw new Revert(reason);
}
