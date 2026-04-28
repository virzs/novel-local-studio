export function PlaceholderView({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-primary text-xs tracking-[0.16em] uppercase mb-2">
        即将推出
      </p>
      <h2 className="text-3xl text-foreground mb-3 leading-tight">
        {title}
      </h2>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
