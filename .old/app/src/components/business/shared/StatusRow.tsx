export function StatusRow({
  label,
  value,
  highlight,
  mono,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground text-sm flex-shrink-0">{label}</span>
      <span
          className={[
            'text-sm text-right',
            mono ? 'font-mono text-xs' : '',
            highlight === true ? 'text-success' : highlight === false ? 'text-destructive' : 'text-foreground',
          ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}
