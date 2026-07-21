import { AppFrame } from '@invitaciones/ui';
import { appMetadata } from './app-metadata';

export function App() {
  return (
    <AppFrame
      appName={appMetadata.appName}
      title={appMetadata.title}
      description={appMetadata.description}
    />
  );
}
