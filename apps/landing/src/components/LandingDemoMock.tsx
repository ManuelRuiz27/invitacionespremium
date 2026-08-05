import { Box, Paper, Tab, Tabs, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { getLandingConfig } from '../config/landing-config';
import { LandingContainer, LandingSectionIntro } from './primitives';
import { landingTokens } from '../theme/landing-theme';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import TableBarIcon from '@mui/icons-material/TableBar';

const landingContent = getLandingConfig();

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
          boxShadow: (theme) => `0 0 0 3px ${theme.palette.primary.main}`
        },
        '@media (prefers-reduced-motion: no-preference)': {
          animation: 'fadeIn 0.3s ease-out',
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

  const icons = [
    <AutoAwesomeIcon key="inv" />,
    <CheckCircleIcon key="conf" />,
    <QrCode2Icon key="acc" />,
    <TableBarIcon key="tab" />
  ];

  return (
    <Box component="section" aria-labelledby={headingId} sx={{ py: { xs: 8, md: 12 }, bgcolor: 'background.paper' }}>
      <LandingContainer>
        <LandingSectionIntro
          headingId={headingId}
          title={landingContent.demo.title}
          subtitle={landingContent.demo.subtitle}
          align="center"
        />

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ textAlign: 'center', mb: 4, maxWidth: 600, mx: 'auto' }}
        >
          {landingContent.demo.disclaimer}
        </Typography>

        <Paper
          elevation={0}
          sx={{
            borderRadius: 4,
            border: (theme) => `1px solid ${theme.palette.divider}`,
            overflow: 'hidden',
            bgcolor: 'background.default'
          }}
        >
          <Tabs
            role="tablist"
            value={activeTab}
            onChange={(_, val) => setActiveTab(val)}
            variant="scrollable"
            scrollButtons="auto"
            aria-label={landingContent.demo.label}
            sx={{
              bgcolor: 'background.paper',
              borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
              px: 2,
              '& .MuiTab-root': {
                fontWeight: 700,
                minHeight: 60,
                textTransform: 'none',
                '&:focus-visible': {
                  outline: (theme) => `3px solid ${theme.palette.primary.main}`,
                  outlineOffset: '-3px'
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
                icon={icons[index]}
                iconPosition="start"
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
                      sx={{ fontWeight: 800, mb: 2, color: 'text.primary', fontSize: '1.75rem' }}
                    >
                      {scene.title}
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.6, fontSize: '1.1rem' }}>
                      {scene.description}
                    </Typography>
                  </Box>

                  <Box
                    aria-hidden="true"
                    sx={{
                      width: '100%',
                      aspectRatio: '4/3',
                      bgcolor: landingTokens.colors.darkSurface.background,
                      borderRadius: 4,
                      border: `1px solid ${landingTokens.colors.darkSurface.divider}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: landingTokens.shadows.elevated
                    }}
                  >
                    {/* Abstract Visual Representation Based on Scene */}
                    {index === 0 && (
                      <Box
                        sx={{
                          width: '60%',
                          height: '70%',
                          bgcolor: '#FFF',
                          borderRadius: 2,
                          p: 3,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                        }}
                      >
                        <Box sx={{ width: '40%', height: 12, bgcolor: 'primary.main', borderRadius: 1 }} />
                        <Box sx={{ width: '80%', height: 32, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 1 }} />
                        <Box sx={{ flexGrow: 1 }} />
                        <Box sx={{ width: '100%', height: 40, bgcolor: 'primary.main', borderRadius: 1 }} />
                      </Box>
                    )}
                    {index === 1 && (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '70%' }}>
                        {[1, 2, 3].map((i) => (
                          <Box
                            key={i}
                            sx={{
                              width: '100%',
                              p: 2,
                              bgcolor: '#FFF',
                              borderRadius: 2,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between'
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Box
                                sx={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: '50%',
                                  bgcolor: 'primary.main',
                                  opacity: 0.1
                                }}
                              />
                              <Box sx={{ width: 100, height: 12, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 1 }} />
                            </Box>
                            <CheckCircleIcon color="success" sx={{ opacity: 0.8 }} />
                          </Box>
                        ))}
                      </Box>
                    )}
                    {index === 2 && (
                      <Box sx={{ textAlign: 'center' }}>
                        <QrCode2Icon sx={{ fontSize: 120, color: '#FFF', opacity: 0.9 }} />
                        <Box
                          sx={{
                            mt: 3,
                            width: 160,
                            height: 8,
                            bgcolor: 'rgba(255,255,255,0.1)',
                            borderRadius: 1,
                            mx: 'auto'
                          }}
                        />
                      </Box>
                    )}
                    {index === 3 && (
                      <Box
                        sx={{
                          position: 'relative',
                          width: 200,
                          height: 200,
                          borderRadius: '50%',
                          border: '2px dashed rgba(255,255,255,0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <TableBarIcon sx={{ fontSize: 64, color: '#FFF', opacity: 0.5 }} />
                        {[0, 60, 120, 180, 240, 300].map((deg) => (
                          <Box
                            key={deg}
                            sx={{
                              position: 'absolute',
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              bgcolor: 'primary.main',
                              transform: `rotate(${deg}deg) translateY(-120px)`
                            }}
                          />
                        ))}
                      </Box>
                    )}
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
