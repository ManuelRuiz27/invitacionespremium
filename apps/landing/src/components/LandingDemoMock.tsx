import { Box, Tab, Tabs, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { getLandingConfig } from '../config/landing-config';
import { LandingContainer } from './primitives';
import { landingTokens } from '../theme/landing-theme';

import demoInvitation from '../assets/landing/demo-invitation-stage.svg';
import demoConfirmation from '../assets/landing/demo-confirmation-stage.svg';
import demoAccess from '../assets/landing/demo-access-stage.svg';
import demoTables from '../assets/landing/demo-tables-stage.svg';

const landingContent = getLandingConfig();

const assetMap: Record<string, string> = {
  INVITATION: demoInvitation,
  CONFIRMATION: demoConfirmation,
  ACCESS: demoAccess,
  TABLES: demoTables
};

const altMap: Record<string, string> = {
  INVITATION: 'Visual de Invitación Premium',
  CONFIRMATION: 'Pantalla de confirmación RSVP',
  ACCESS: 'Registro QR y control de acceso',
  TABLES: 'Distribución y asignación de mesas'
};

function DemoPanel({
  active,
  index,
  children,
  id
}: {
  active: boolean;
  index: number;
  children: ReactNode;
  id: string;
}) {
  return (
    <Box
      role="tabpanel"
      id={id}
      aria-labelledby={`demo-tab-${index}`}
      tabIndex={0}
      hidden={!active}
      sx={{
        display: active ? 'block' : 'none',
        outline: 'none',
        '&:focus-visible': {
          outline: `2px solid ${landingTokens.colors.dark.text}`
        },
        '@media (prefers-reduced-motion: no-preference)': {
          animation: 'fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
          '@keyframes fadeIn': {
            from: { opacity: 0, transform: 'translateY(20px)' },
            to: { opacity: 1, transform: 'translateY(0)' }
          }
        }
      }}
    >
      {children}
    </Box>
  );
}

export function LandingDemoMock() {
  const [activeTab, setActiveTab] = useState(0);
  const headingId = 'landing-demo-heading';

  return (
    <Box
      id="demo"
      component="section"
      aria-labelledby={headingId}
      sx={{ py: landingTokens.spacing.sectionY, bgcolor: landingTokens.colors.dark.background }}
    >
      <LandingContainer>
        <Box sx={{ mb: { xs: 8, md: 12 }, textAlign: 'center' }}>
          <Typography
            id={headingId}
            variant="h2"
            sx={{
              ...landingTokens.typography.headline,
              color: landingTokens.colors.dark.text,
              fontSize: { xs: '2rem', md: '3rem' },
              mb: 3
            }}
          >
            {landingContent.demo.title}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              ...landingTokens.typography.body,
              color: landingTokens.colors.dark.textMuted,
              fontSize: '1.15rem',
              maxWidth: 600,
              mx: 'auto'
            }}
          >
            {landingContent.demo.subtitle}
          </Typography>
        </Box>

        {/* Editorial Index */}
        <Box
          sx={{
            borderTop: landingTokens.borders.hairlineDark,
            borderBottom: landingTokens.borders.hairlineDark,
            mb: { xs: 6, md: 10 }
          }}
        >
          <Tabs
            role="tablist"
            value={activeTab}
            onChange={(_, val) => setActiveTab(val)}
            variant="scrollable"
            scrollButtons="auto"
            selectionFollowsFocus
            aria-label={landingContent.demo.label}
            slotProps={{ indicator: { style: { display: 'none' } } }}
            sx={{
              minHeight: 80,
              '& .MuiTabs-flexContainer': {
                gap: { xs: 2, md: 6 }
              },
              '& .MuiTab-root': {
                ...landingTokens.typography.headline,
                fontSize: { xs: '1.25rem', md: '1.5rem' },
                fontWeight: 400,
                textTransform: 'none',
                color: landingTokens.colors.dark.textMuted,
                opacity: 0.5,
                p: 0,
                minHeight: 80,
                transition: landingTokens.transitions.duration,
                '&.Mui-selected': {
                  color: landingTokens.colors.dark.text,
                  opacity: 1,
                  fontWeight: 500
                },
                '&:focus-visible': {
                  outline: `2px solid ${landingTokens.colors.dark.text}`,
                  outlineOffset: '4px'
                }
              }
            }}
          >
            {landingContent.demo.scenes.map((scene, index) => (
              <Tab
                key={scene.code}
                role="tab"
                id={`demo-tab-${index}`}
                aria-controls={`demo-panel-${scene.code}`}
                aria-selected={activeTab === index}
                label={
                  <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box component="span" sx={{ fontSize: '0.9rem', opacity: 0.5 }}>
                      0{index + 1}
                    </Box>
                    {scene.label}
                  </Box>
                }
              />
            ))}
          </Tabs>
        </Box>

        {/* Cinematic Presentation (No Paper, No Boxes) */}
        <Box>
          {landingContent.demo.scenes.map((scene, index) => (
            <DemoPanel key={scene.code} active={activeTab === index} index={index} id={`demo-panel-${scene.code}`}>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', lg: 'row' },
                  alignItems: 'center',
                  gap: { xs: 6, lg: 12 }
                }}
              >
                <Box sx={{ flex: 1, maxWidth: { xs: '100%', lg: 480 } }}>
                  <Typography
                    variant="h3"
                    sx={{
                      ...landingTokens.typography.display,
                      mb: 3,
                      color: landingTokens.colors.dark.text,
                      fontSize: { xs: '2rem', md: '2.5rem' }
                    }}
                  >
                    {scene.title}
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{
                      ...landingTokens.typography.body,
                      color: landingTokens.colors.dark.textMuted,
                      fontSize: '1.15rem'
                    }}
                  >
                    {scene.description}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    flex: 1.5,
                    width: '100%',
                    position: 'relative',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  <img
                    src={assetMap[scene.code]}
                    alt={altMap[scene.code] || scene.title}
                    style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }}
                  />
                </Box>
              </Box>
            </DemoPanel>
          ))}
        </Box>
      </LandingContainer>
    </Box>
  );
}
