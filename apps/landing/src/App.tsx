import { LandingCta } from './components/LandingCta';
import { LandingFaq } from './components/LandingFaq';
import { LandingFooter } from './components/LandingFooter';
import { LandingHeader } from './components/LandingHeader';
import { LandingHero } from './components/LandingHero';
import { LandingHowItWorks } from './components/LandingHowItWorks';
import { LandingPlanners } from './components/LandingPlanners';
import { LandingPricing } from './components/LandingPricing';
import { LandingProductProof } from './components/LandingProductProof';
import { LandingServices } from './components/LandingServices';
import { LandingVenue } from './components/LandingVenue';
import { getLandingConfig } from './config/landing-config';
import { usePublicPricing } from './use-public-pricing';
import type { CommercialOpportunityType } from '@invitaciones/api-client';
import { Box } from '@mui/material';
import { lazy, Suspense, useState } from 'react';

const CommercialLeadModal = lazy(() =>
  import('./components/CommercialLeadModal').then((module) => ({ default: module.CommercialLeadModal }))
);

export function App() {
  const [commercialRequest, setCommercialRequest] = useState<{
    opportunityType: CommercialOpportunityType;
    initialNotes?: string;
  }>();
  const pricing = usePublicPricing();
  const openPlanner = () => setCommercialRequest({ opportunityType: 'PLANNER_AGENCY' });
  const openVenue = () => setCommercialRequest({ opportunityType: 'VENUE' });
  const openPersonalization = () =>
    setCommercialRequest({
      opportunityType: 'VENUE',
      initialNotes: getLandingConfig().venue.personalization.inquiry
    });

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <LandingHeader onOpenCommercial={openPlanner} />
      <Box component="main" id="main-content" tabIndex={-1} sx={{ flexGrow: 1, outline: 'none' }}>
        <LandingHero />
        <LandingProductProof />

        <LandingServices />
        <LandingPricing state={pricing.state} onRetry={pricing.retry} />
        <LandingHowItWorks />
        <LandingPlanners onOpenCommercial={openPlanner} />
        <LandingVenue onOpenCommercial={openVenue} onOpenPersonalization={openPersonalization} />
        <LandingFaq />
        <LandingCta onOpenCommercial={openPlanner} onOpenVenue={openVenue} />
      </Box>
      <LandingFooter />

      {commercialRequest && (
        <Suspense fallback={null}>
          <CommercialLeadModal
            open
            opportunityType={commercialRequest.opportunityType}
            initialNotes={commercialRequest.initialNotes ?? ''}
            onClose={() => setCommercialRequest(undefined)}
          />
        </Suspense>
      )}
    </Box>
  );
}
