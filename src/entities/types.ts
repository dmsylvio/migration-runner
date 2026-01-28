export type Migrator = {
  entity: string;
  seed: (runId: number) => Promise<void>;
  sync: (runId: number) => Promise<void>;
};
