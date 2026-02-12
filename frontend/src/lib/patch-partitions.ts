export type PatchPartitionOption = {
  label: string;
  value: number;
};

export type PatchPartitionSource = {
  id: number;
  name: string;
};

export function getPatchPartitionOptions(
  source: PatchPartitionSource[] = [],
): PatchPartitionOption[] {
  return [...source]
    .sort((a, b) => a.id - b.id)
    .map((patch) => ({
      label: patch.name,
      value: patch.id,
    }));
}
