import { getLandingConfig } from '../config/landing-config';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from '@mui/material';
import { useState, type SyntheticEvent } from 'react';
import { landingTokens } from '../theme/landing-theme';
import { LandingSectionIntro } from './primitives/LandingSectionIntro';
import { LandingContainer } from './primitives/LandingContainer';

const landingContent = getLandingConfig();

export function LandingFaq() {
  const [expanded, setExpanded] = useState<string | false>('panel-0');
  const headingId = 'landing-faq-heading';

  const handleChange = (panel: string) => (_: SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };

  return (
    <Box
      id="faq"
      component="section"
      aria-labelledby={headingId}
      sx={{ py: landingTokens.spacing.sectionY, bgcolor: landingTokens.colors.light.background }}
    >
      <LandingContainer>
        <LandingSectionIntro
          headingId={headingId}
          title={landingContent.faq.title}
          subtitle={landingContent.faq.subtitle}
          align="center"
          dark={false}
        />

        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {landingContent.faq.items.map((item, index) => {
            const panelId = `panel-${index}`;
            return (
              <Accordion
                key={index}
                expanded={expanded === panelId}
                onChange={handleChange(panelId)}
                elevation={0}
                sx={{
                  border: 'none',
                  borderBottom: landingTokens.borders.hairlineLight,
                  borderRadius: '0 !important',
                  '&:before': { display: 'none' },
                  bgcolor: 'transparent',
                  margin: '0 !important'
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon sx={{ color: landingTokens.colors.light.text }} />}
                  aria-controls={`${panelId}-content`}
                  id={`${panelId}-header`}
                  sx={{ px: 0, py: 2 }}
                >
                  <Typography
                    variant="h4"
                    component="h3"
                    sx={{
                      ...landingTokens.typography.headline,
                      fontSize: '1.15rem',
                      color: landingTokens.colors.light.text
                    }}
                  >
                    {item.question}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 0, pb: 4, pt: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{ ...landingTokens.typography.body, color: landingTokens.colors.light.textMuted }}
                  >
                    {item.answer}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>
      </LandingContainer>
    </Box>
  );
}
