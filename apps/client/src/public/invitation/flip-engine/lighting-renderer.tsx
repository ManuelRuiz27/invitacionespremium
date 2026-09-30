interface LightingRendererProps {
  active: boolean;
}

export function LightingRenderer({ active }: LightingRendererProps) {
  if (!active) return null;

  return (
    <div className="flip-engine-lighting" aria-hidden="true">
      <span className="flip-engine-projection-shadow" />
      <span className="flip-engine-fold-light" />
    </div>
  );
}
