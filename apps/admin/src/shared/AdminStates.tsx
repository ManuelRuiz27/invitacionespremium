import { EmptyState, ErrorState, LoadingState } from '@invitaciones/ui';

export const AdminLoadingState = ({ label = 'Cargando informacion administrativa...' }: { label?: string }) => (
  <LoadingState label={label} />
);
export const AdminErrorState = ({ onRetry }: { onRetry: () => void }) => (
  <ErrorState title="No pudimos cargar esta vista" message="La informacion no se modifico." onRetry={onRetry} />
);
export const AdminEmptyState = ({ title, description }: { title: string; description?: string }) => (
  <EmptyState title={title} {...(description ? { description } : {})} />
);
