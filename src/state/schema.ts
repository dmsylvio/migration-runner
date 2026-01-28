export type RunMode = "seed" | "sync";
export type RunStatus = "running" | "success" | "failed";

export type CheckpointType = "updated_at" | "id" | "changelog";

export type Checkpoint = {
  entity: string;
  checkpoint_type: CheckpointType;
  checkpoint_value: string;
};
