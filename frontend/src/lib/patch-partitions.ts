export type PatchPartitionOption = {
  label: string;
  value: number;
};

type PatchPartitionSource = {
  version: string;
  partition: number;
};

const PATCH_PARTITIONS: PatchPartitionSource[] = [
  { version: "11.2", partition: 1 },
  { version: "11.2.5", partition: 2 },
];

export function getPatchPartitionOptions(
  source: PatchPartitionSource[] = PATCH_PARTITIONS,
): PatchPartitionOption[] {
  return source.map((patch) => ({
    label: patch.version,
    value: patch.partition,
  }));
}
