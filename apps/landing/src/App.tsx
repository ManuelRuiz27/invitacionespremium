import { LandingCta } from './components/LandingCta';
import { LandingFaq } from './components/LandingFaq';
import { LandingFooter } from './components/LandingFooter';
import { LandingHeader } from './components/LandingHeader';
import { LandingHero } from './components/LandingHero';
import { LandingHowItWorks } from './components/LandingHowItWorks';
import { LandingPlanners } from './components/LandingPlanners';
import { LandingProductProof } from './components/LandingProductProof';
import { LandingServices } from './components/LandingServices';
import { Box } from '@mui/material';
import { lazy, Suspense, useState } from 'react';

const CommercialLeadModal = lazy(() =>
  import('./components/CommercialLeadModal').then((module) => ({ default: module.CommercialLeadModal }))
);

export function App() {
  const [commercialModalOpen, setCommercialModalOpen] = useState(false);
  const openCommercial = () => setCommercialModalOpen(true);

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <LandingHeader onOpenCommercial={openCommercial} />
      <Box component="main" id="main-content" tabIndex={-1} sx={{ flexGrow: 1, outline: 'none' }}>
        <LandingHero />
        <LandingProductProof />

        <LandingHowItWorks />
        <LandingServices />
        <LandingPlanners onOpenCommercial={openCommercial} />
        <LandingFaq />
        <LandingCta onOpenCommercial={openCommercial} />
      </Box>
      <LandingFooter />

      {commercialModalOpen && (
        <Suspense fallback={null}>
          <CommercialLeadModal open opportunityType="PLANNER_AGENCY" onClose={() => setCommercialModalOpen(false)} />
        </Suspense>
      )}
    </Box>
  );
}
