import { landingContent } from '../landing-content';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Accordion, AccordionDetails, AccordionSummary, Box, Container, Typography } from '@mui/material';
import { useState, type SyntheticEvent } from 'react';

export function LandingFaq() {
  const [expanded, setExpanded] = useState<string | false>('panel-0');

  const handleChange = (panel: string) => (_: SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };

  return (
    <Box id="faq" component="section" sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.paper' }}>
      <Container maxWidth="md">
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h2" component="h2" sx={{ fontWeight: 800, mb: 1.5 }}>
            {landingContent.faq.title}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.1rem', maxWidth: 640, mx: 'auto' }}>
            {landingContent.faq.subtitle}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {landingContent.faq.items.map((item, index) => {
            const panelId = `panel-${index}`;
            return (
              <Accordion
                key={index}
                expanded={expanded === panelId}
                onChange={handleChange(panelId)}
                elevation={0}
                sx={{
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  borderRadius: '12px !important',
                  '&:before': { display: 'none' },
                  bgcolor: 'background.default'
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon color="primary" />}
                  aria-controls={`${panelId}-content`}
                  id={`${panelId}-header`}
                  sx={{ px: 3, py: 1 }}
                >
                  <Typography variant="h4" component="h3" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
                    {item.question}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 3, pb: 3, pt: 0 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, fontSize: '0.95rem' }}>
                    {item.answer}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>
      </Container>
    </Box>
  );
}
