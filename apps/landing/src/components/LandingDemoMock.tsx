import { Box, Paper, Tab, Tabs, Typography, useTheme } from '@mui/material';
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
  INVITATION: "Visual de Invitación Premium",
  CONFIRMATION: "Pantalla de confirmación RSVP",
  ACCESS: "Registro QR y control de acceso",
  TABLES: "Distribución y asignación de mesas"
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
          animation: 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          '@keyframes fadeIn': {
            from: { opacity: 0, transform: 'translateY(10px)' },
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
    <Box id="demo" component="section" aria-labelledby={headingId} sx={{ py: landingTokens.spacing.sectionY, bgcolor: landingTokens.colors.dark.background }}>
      <LandingContainer>
        <Box sx={{ mb: { xs: 6, md: 8 }, textAlign: 'center' }}>
          <Typography
            id={headingId}
            variant="h2"
            sx={{
              ...landingTokens.typography.headline,
              color: landingTokens.colors.dark.text,
              fontSize: { xs: '2rem', md: '2.5rem' },
              mb: 2
            }}
          >
            {landingContent.demo.title}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              ...landingTokens.typography.body,
              color: landingTokens.colors.dark.textMuted,
              maxWidth: 600,
              mx: 'auto'
            }}
          >
            {landingContent.demo.subtitle}
          </Typography>
        </Box>

        <Paper
          elevation={0}
          sx={{
            borderRadius: 0,
            border: landingTokens.borders.hairlineDark,
            overflow: 'hidden',
            bgcolor: landingTokens.colors.dark.surface
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
            sx={{
              bgcolor: landingTokens.colors.dark.surface,
              borderBottom: landingTokens.borders.hairlineDark,
              px: 2,
              '& .MuiTabs-indicator': {
                backgroundColor: landingTokens.colors.dark.text
              },
              '& .MuiTab-root': {
                fontWeight: 600,
                minHeight: 60,
                textTransform: 'none',
                color: landingTokens.colors.dark.textMuted,
                '&.Mui-selected': {
                  color: landingTokens.colors.dark.text
                },
                '&:focus-visible': {
                  outline: `2px solid ${landingTokens.colors.dark.text}`,
                  outlineOffset: '-2px'
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
                label={scene.label}
              />
            ))}
          </Tabs>

          <Box sx={{ p: { xs: 3, md: 6 } }}>
            {landingContent.demo.scenes.map((scene, index) => (
              <DemoPanel key={scene.code} active={activeTab === index} index={index} id={`demo-panel-${scene.code}`}>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: { xs: 4, md: 8 },
                    alignItems: 'center'
                  }}
                >
                  <Box>
                    <Typography
                      variant="h3"
                      sx={{ ...landingTokens.typography.headline, mb: 2, color: landingTokens.colors.dark.text, fontSize: '1.75rem' }}
                    >
                      {scene.title}
                    </Typography>
                    <Typography variant="body1" sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted, fontSize: '1.1rem' }}>
                      {scene.description}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      width: '100%',
                      bgcolor: landingTokens.colors.dark.background,
                      border: landingTokens.borders.hairlineDark,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      overflow: 'hidden',
                      p: { xs: 2, md: 4 }
                    }}
                  >
                    <img 
                      src={assetMap[scene.code]} 
                      alt={altMap[scene.code] || scene.title}
                      style={{ maxWidth: '100%', height: 'auto', display: 'block' }} 
                    />
                  </Box>
                </Box>
              </DemoPanel>
            ))}
          </Box>
        </Paper>
      </LandingContainer>
    </Box>
  );
}
