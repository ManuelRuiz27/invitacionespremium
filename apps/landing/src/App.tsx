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
import { lazy, memo, Suspense, useCallback, useState } from 'react';

// Price and intent changes only affect their controls. Preserve the existing
// presentations instead of rebuilding every section for each selection.
const Sections = {
  header: memo(LandingHeader),
  hero: memo(LandingHero),
  proof: memo(LandingProductProof),
  services: memo(LandingServices),
  howItWorks: memo(LandingHowItWorks),
  planners: memo(LandingPlanners),
  venue: memo(LandingVenue),
  faq: memo(LandingFaq),
  cta: memo(LandingCta),
  footer: memo(LandingFooter)
};

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
  const chooseIntent = useCallback(() => {
    scrollToLandingSection('#como-contratar');
    (
      document.querySelector<HTMLInputElement>('#como-contratar input:checked') ??
      document.querySelector<HTMLInputElement>('#intent-INDIVIDUAL')
    )?.focus({ preventScroll: true });
  }, []);
  const openPlanner = useCallback(() => setCommercialRequest({ opportunityType: 'PLANNER_AGENCY' }), []);
  const openVenue = useCallback(() => setCommercialRequest({ opportunityType: 'VENUE' }), []);
  const openPersonalization = useCallback(
    () =>
      setCommercialRequest({
        opportunityType: 'VENUE',
        initialNotes: getLandingConfig().venue.personalization.inquiry
      }),
    []
  );

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Sections.header onOpenCommercial={chooseIntent} />
      <Box component="main" id="main-content" tabIndex={-1} sx={{ flexGrow: 1, outline: 'none' }}>
        <Sections.hero />
        <LandingIntents value={intent} onChange={setIntent} />
        <Sections.proof />

        <Sections.services />
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
        <Sections.howItWorks />
        <Sections.planners onOpenCommercial={openPlanner} />
        <Sections.venue onOpenCommercial={openVenue} onOpenPersonalization={openPersonalization} />
        <Sections.faq />
        <Sections.cta onOpenCommercial={openPlanner} onOpenVenue={openVenue} />
      </Box>
      <Sections.footer />

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
