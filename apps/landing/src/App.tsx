import { LandingCta } from './components/LandingCta';
import { LandingDemoMock } from './components/LandingDemoMock';
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
import { RegisterPlannerModal } from './components/RegisterPlannerModal';
import { Box } from '@mui/material';
import { useState } from 'react';

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
      <Box component="main" sx={{ flexGrow: 1 }}>
        <LandingHero onOpenRegister={handleOpenRegister} />
        <LandingProblem />
        <LandingSolution />
        <LandingServices />
        <LandingDemoMock />
        <LandingPricing />
        <LandingPlanners onOpenRegister={handleOpenRegister} />
        <LandingOrganizations />
        <LandingFaq />
        <LandingCta onOpenRegister={handleOpenRegister} />
      </Box>
      <LandingFooter />

      {/* Modal de Registro para Planner Independiente */}
      <RegisterPlannerModal open={registerModalOpen} onClose={handleCloseRegister} />
    </Box>
  );
}
