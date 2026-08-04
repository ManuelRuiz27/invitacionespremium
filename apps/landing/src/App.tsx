import { LandingCta } from './components/LandingCta';
import { LandingFaq } from './components/LandingFaq';
import { LandingFooter } from './components/LandingFooter';
import { LandingHeader } from './components/LandingHeader';
import { LandingHero } from './components/LandingHero';
import { LandingOrganizations } from './components/LandingOrganizations';
import { LandingPlanners } from './components/LandingPlanners';
import { LandingPricing } from './components/LandingPricing';
import { LandingProblem } from './components/LandingProblem';
import { LandingServices } from './components/LandingServices';
import { LandingSolution } from './components/LandingSolution';
import { Box, CircularProgress } from '@mui/material';
import { lazy, Suspense, useState } from 'react';

const LandingDemoMock = lazy(() =>
  import('./components/LandingDemoMock').then((module) => ({ default: module.LandingDemoMock }))
);
const RegisterPlannerModal = lazy(() =>
  import('./components/RegisterPlannerModal').then((module) => ({ default: module.RegisterPlannerModal }))
);

export function App() {
  const [registerModalOpen, setRegisterModalOpen] = useState(false);

  const handleOpenRegister = () => {
    setRegisterModalOpen(true);
  };

  const handleCloseRegister = () => {
    setRegisterModalOpen(false);
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <LandingHeader onOpenRegister={handleOpenRegister} />
      <Box component="main" id="main-content" tabIndex={-1} sx={{ flexGrow: 1, outline: 'none' }}>
        <LandingHero onOpenRegister={handleOpenRegister} />
        <LandingProblem />
        <LandingSolution />
        <LandingServices />
        <Suspense
          fallback={
            <Box component="section" id="demo" sx={{ minHeight: 320, display: 'grid', placeItems: 'center' }}>
              <CircularProgress aria-label="Cargando demo visual" />
            </Box>
          }
        >
          <LandingDemoMock />
        </Suspense>
        <LandingPricing />
        <LandingPlanners onOpenRegister={handleOpenRegister} />
        <LandingOrganizations />
        <LandingFaq />
        <LandingCta onOpenRegister={handleOpenRegister} />
      </Box>
      <LandingFooter />

      {registerModalOpen && (
        <Suspense fallback={null}>
          <RegisterPlannerModal open onClose={handleCloseRegister} />
        </Suspense>
      )}
    </Box>
  );
}
