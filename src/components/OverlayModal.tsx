import { ReactNode } from 'react';

type OverlayModalProps = {
  title: string;
  description: string;
  actions: ReactNode;
};

export function OverlayModal({ title, description, actions }: OverlayModalProps) {
  return (
    <div className="overlay-backdrop">
      <div className="overlay-card">
        <div className="overlay-card__badge">MoveSense alert</div>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="overlay-card__actions">{actions}</div>
      </div>
    </div>
  );
}
