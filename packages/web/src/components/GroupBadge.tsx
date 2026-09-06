export function GroupBadge({ group }: { group: string }) {
  return <span className={`group-badge group-${group.toLowerCase()}`}>{group}</span>;
}
