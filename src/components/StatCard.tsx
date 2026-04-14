import { ReactNode } from 'react';

type StatCardProps = {
  eyebrow: string;
  value: string;
  detail: string;
  accent?: 'blue' | 'teal' | 'amber' | 'coral';
  icon: ReactNode;
};

export function StatCard({
  eyebrow,
  value,
  detail,
  accent = 'blue',
  icon
}: StatCardProps) {
  return (
    <article className={`stat-card accent-${accent}`}>
      <div className="stat-card__header">
        <span className="stat-card__eyebrow">{eyebrow}</span>
        <span className="stat-card__icon">{icon}</span>
      </div>
      <div className="stat-card__value">{value}</div>
      <p className="stat-card__detail">{detail}</p>
    </article>
  );
}
