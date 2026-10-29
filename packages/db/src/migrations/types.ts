/** A reversible schema migration. `up`/`down` are plain SQL run in one transaction. */
export interface Migration {
  /** Contiguous from 1. Never renumber or edit an applied migration; add a new one. */
  readonly version: number;
  /** snake_case description. */
  readonly name: string;
  readonly up: string;
  /** Exact inverse of `up`. Destructive: drops the objects `up` created. */
  readonly down: string;
}
