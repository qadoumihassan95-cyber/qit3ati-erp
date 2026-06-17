interface Props {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="text-center py-12 px-4">
      {icon && <div className="mx-auto w-14 h-14 rounded-2xl bg-bg grid place-items-center text-muted mb-3">{icon}</div>}
      <h3 className="font-extrabold text-lg text-ink">{title}</h3>
      {description && <p className="text-muted text-sm mt-1.5 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
