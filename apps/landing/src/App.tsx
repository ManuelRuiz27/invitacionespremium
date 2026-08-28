import { LandingCta } from './components/LandingCta';
import { LandingFaq } from './components/LandingFaq';
import { LandingFooter } from './components/LandingFooter';
import { LandingHeader } from './components/LandingHeader';
import { LandingHero } from './components/LandingHero';
import { LandingPlanners } from './components/LandingPlanners';
import { LandingPricing } from './components/LandingPricing';
import { LandingProblem } from './components/LandingProblem';
import { LandingServices } from './components/LandingServices';
import { LandingSolution } from './components/LandingSolution';
import { LandingVenue } from './components/LandingVenue';
import { usePublicPricing } from './use-public-pricing';
import { Box, CircularProgress } from '@mui/material';
import { lazy, Suspense, useState } from 'react';
import type { CommercialOpportunityType } from '@invitaciones/api-client';

const LandingDemoMock = lazy(() =>
  import('./components/LandingDemoMock').then((module) => ({ default: module.LandingDemoMock }))
);
const RegisterPlannerModal = lazy(() =>
  import('./components/RegisterPlannerModal').then((module) => ({ default: module.RegisterPlannerModal }))
);
const CommercialLeadModal = lazy(() =>
  import('./components/CommercialLeadModal').then((module) => ({ default: module.CommercialLeadModal }))
);

export function App() {
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [commercialOpportunity, setCommercialOpportunity] = useState<CommercialOpportunityType | null>(null);
  const { state: pricingState, retry: retryPricing } = usePublicPricing();

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
        <LandingHero />
        <LandingProblem />
        <LandingSolution />
        <LandingServices />
        <LandingPricing state={pricingState} onRetry={retryPricing} />
        <LandingPlanners
          onOpenRegister={handleOpenRegister}
          onOpenCommercial={() => setCommercialOpportunity('PLANNER_AGENCY')}
        />
        <LandingVenue onOpenCommercial={() => setCommercialOpportunity('VENUE')} />
        <Suspense
          fallback={
            <Box component="section" id="demo" sx={{ minHeight: 700, display: 'grid', placeItems: 'center' }}>
              <CircularProgress aria-label="Cargando demo visual" />
            </Box>
          }
        >
          <LandingDemoMock />
        </Suspense>
        <LandingFaq />
        <LandingCta />
      </Box>
      <LandingFooter />

      {registerModalOpen && (
        <Suspense fallback={null}>
          <RegisterPlannerModal open onClose={handleCloseRegister} />
        </Suspense>
      )}
      {commercialOpportunity && (
        <Suspense fallback={null}>
          <CommercialLeadModal
            open
            opportunityType={commercialOpportunity}
            onClose={() => setCommercialOpportunity(null)}
          />
        </Suspense>
      )}
    </Box>
  );
}
