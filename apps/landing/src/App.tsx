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
import { initialPriceSelection, type CommercialIntent, type PriceSelection } from './commercial-selection';
import { LandingIntents } from './components/LandingIntents';
import { scrollToLandingSection } from './navigation';
import type { CommercialOpportunityType } from '@invitaciones/api-client';
import { Box } from '@mui/material';
import { lazy, Suspense, useState } from 'react';

const CommercialLeadModal = lazy(() =>
  import('./components/CommercialLeadModal').then((module) => ({ default: module.CommercialLeadModal }))
);

export function App() {
  const [intent, setIntent] = useState<CommercialIntent | null>(null);
  const [selection, setSelection] = useState<PriceSelection>(initialPriceSelection);
  const [commercialRequest, setCommercialRequest] = useState<{
    opportunityType: CommercialOpportunityType;
    initialNotes?: string;
  }>();
  const pricing = usePublicPricing();
  const chooseIntent = () => {
    scrollToLandingSection('#como-contratar');
    (
      document.querySelector<HTMLInputElement>('#como-contratar input:checked') ??
      document.querySelector<HTMLInputElement>('#intent-INDIVIDUAL')
    )?.focus({ preventScroll: true });
  };
  const openPlanner = () => setCommercialRequest({ opportunityType: 'PLANNER_AGENCY' });
  const openVenue = () => setCommercialRequest({ opportunityType: 'VENUE' });
  const openPersonalization = () =>
    setCommercialRequest({
      opportunityType: 'VENUE',
      initialNotes: getLandingConfig().venue.personalization.inquiry
    });

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <LandingHeader onOpenCommercial={chooseIntent} />
      <Box component="main" id="main-content" tabIndex={-1} sx={{ flexGrow: 1, outline: 'none' }}>
        <LandingHero />
        <LandingIntents value={intent} onChange={setIntent} />
        <LandingProductProof />

        <LandingServices />
        <LandingPricing
          state={pricing.state}
          onRetry={pricing.retry}
          intent={intent}
          selection={selection}
          onSelectionChange={setSelection}
          onChooseIntent={chooseIntent}
          onOpenCommercial={() => {
            if (intent === 'VENUE') openVenue();
            else if (intent === 'PLANNER_AGENCY') openPlanner();
          }}
        />
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
            initialSelection={selection}
            onClose={() => setCommercialRequest(undefined)}
          />
        </Suspense>
      )}
    </Box>
  );
}
