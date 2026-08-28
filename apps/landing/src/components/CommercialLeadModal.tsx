import { createLandingCommercialLeadsClient, type LandingCommercialLeadsClient } from '../commercial-leads-client';
import { ApiError, type CommercialLeadInput, type CommercialOpportunityType } from '@invitaciones/api-client';
import CloseIcon from '@mui/icons-material/Close';
import SendOutlined from '@mui/icons-material/SendOutlined';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

type FormStatus = 'idle' | 'submitting' | 'success' | 'error' | 'rate-limited';

interface FormValues {
  contactName: string;
  businessName: string;
  email: string;
  phone: string;
  estimatedEventsPerMonth: string;
  notes: string;
  privacyAccepted: boolean;
  website: string;
}

type FieldErrors = Partial<
  Record<'contactName' | 'businessName' | 'email' | 'estimatedEventsPerMonth' | 'privacy', string>
>;

const emptyValues: FormValues = {
  contactName: '',
  businessName: '',
  email: '',
  phone: '',
  estimatedEventsPerMonth: '',
  notes: '',
  privacyAccepted: false,
  website: ''
};

export interface CommercialLeadModalProps {
  open: boolean;
  opportunityType: CommercialOpportunityType;
  onClose: () => void;
  client?: LandingCommercialLeadsClient;
}

export function CommercialLeadModal({ open, opportunityType, onClose, client: clientProp }: CommercialLeadModalProps) {
  const client = useMemo(() => clientProp ?? createLandingCommercialLeadsClient(), [clientProp]);
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<FormStatus>('idle');
  const [requestMessage, setRequestMessage] = useState<string>();
  const submissionIdRef = useRef<string | undefined>(undefined);
  const submittingRef = useRef(false);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const openRef = useRef(open);
  openRef.current = open;

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = undefined;
    submissionIdRef.current = undefined;
    submittingRef.current = false;
    setValues(emptyValues);
    setErrors({});
    setStatus('idle');
    setRequestMessage(undefined);
  }, []);

  useEffect(() => {
    if (!open) reset();
    return () => controllerRef.current?.abort();
  }, [open, reset]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const parsed = parseCommercialLeadForm(values, opportunityType, submissionIdRef.current ?? crypto.randomUUID());
    setErrors(parsed.errors);
    setRequestMessage(undefined);
    if (!parsed.input) return;
    if (!client) {
      setStatus('error');
      setRequestMessage('El formulario comercial no está disponible temporalmente. Inténtalo más tarde.');
      return;
    }

    submissionIdRef.current = parsed.input.submissionId;
    submittingRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('submitting');

    try {
      await client.submit(parsed.input, controller.signal);
      if (!openRef.current || controller.signal.aborted || controllerRef.current !== controller) return;
      setStatus('success');
      setValues(emptyValues);
      submissionIdRef.current = undefined;
    } catch (error) {
      if (
        !openRef.current ||
        controller.signal.aborted ||
        controllerRef.current !== controller ||
        isAbortError(error)
      ) {
        return;
      }
      const translated = translateCommercialLeadError(error);
      setStatus(translated.status);
      setRequestMessage(translated.message);
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = undefined;
        submittingRef.current = false;
      }
    }
  };

  const update = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const title = opportunityType === 'VENUE' ? 'Propuesta para tu venue' : 'Condiciones para Planners y agencias';

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm" aria-labelledby="commercial-lead-title">
      <DialogTitle id="commercial-lead-title" sx={{ pr: 7 }}>
        {title}
        <IconButton
          aria-label="Cerrar solicitud comercial"
          onClick={handleClose}
          sx={{ position: 'absolute', right: 16, top: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {status === 'success' ? (
          <Alert severity="success" aria-live="polite">
            Recibimos tu solicitud. La revisaremos para continuar el proceso comercial.
          </Alert>
        ) : (
          <Box component="form" id="commercial-lead-form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2.25}>
              <Typography color="text.secondary">
                Comparte los datos necesarios para dar seguimiento a tu solicitud comercial.
              </Typography>
              {requestMessage ? (
                <Alert severity="error" aria-live="polite">
                  {requestMessage}
                </Alert>
              ) : null}
              <TextField
                required
                autoFocus
                autoComplete="name"
                label="Nombre de contacto"
                value={values.contactName}
                onChange={(event) => update('contactName', event.target.value)}
                disabled={status === 'submitting'}
                error={Boolean(errors.contactName)}
                helperText={errors.contactName}
                slotProps={{ htmlInput: { minLength: 2, maxLength: 160 } }}
              />
              <TextField
                required
                autoComplete="organization"
                label="Empresa / venue / agencia"
                value={values.businessName}
                onChange={(event) => update('businessName', event.target.value)}
                disabled={status === 'submitting'}
                error={Boolean(errors.businessName)}
                helperText={errors.businessName}
                slotProps={{ htmlInput: { minLength: 2, maxLength: 160 } }}
              />
              <TextField
                required
                autoComplete="email"
                type="email"
                label="Correo electrónico"
                value={values.email}
                onChange={(event) => update('email', event.target.value)}
                disabled={status === 'submitting'}
                error={Boolean(errors.email)}
                helperText={errors.email}
                slotProps={{ htmlInput: { maxLength: 320 } }}
              />
              <TextField
                autoComplete="tel"
                type="tel"
                label="Teléfono / WhatsApp (opcional)"
                value={values.phone}
                onChange={(event) => update('phone', event.target.value)}
                disabled={status === 'submitting'}
              />
              <TextField
                type="number"
                label="Eventos estimados por mes (opcional)"
                value={values.estimatedEventsPerMonth}
                onChange={(event) => update('estimatedEventsPerMonth', event.target.value)}
                disabled={status === 'submitting'}
                error={Boolean(errors.estimatedEventsPerMonth)}
                helperText={errors.estimatedEventsPerMonth}
                slotProps={{ htmlInput: { min: 1, max: 10000, step: 1 } }}
              />
              <TextField
                multiline
                minRows={3}
                label="Mensaje (opcional)"
                value={values.notes}
                onChange={(event) => update('notes', event.target.value)}
                disabled={status === 'submitting'}
                slotProps={{ htmlInput: { maxLength: 1000 } }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={values.privacyAccepted}
                    onChange={(event) => update('privacyAccepted', event.target.checked)}
                    disabled={status === 'submitting'}
                  />
                }
                label="Acepto el uso de estos datos para dar seguimiento a mi solicitud comercial."
              />
              {errors.privacy ? (
                <Typography color="error" variant="caption">
                  {errors.privacy}
                </Typography>
              ) : null}
              <Box aria-hidden sx={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  name="website"
                  value={values.website}
                  onChange={(event) => update('website', event.target.value)}
                />
              </Box>
            </Stack>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        {status === 'success' ? (
          <Button variant="contained" onClick={handleClose}>
            Cerrar
          </Button>
        ) : (
          <Button
            type="submit"
            form="commercial-lead-form"
            variant="contained"
            size="large"
            startIcon={status === 'submitting' ? <CircularProgress size={20} color="inherit" /> : <SendOutlined />}
            disabled={status === 'submitting'}
          >
            {status === 'submitting'
              ? 'Enviando…'
              : status === 'error' || status === 'rate-limited'
                ? 'Reintentar envío'
                : 'Enviar solicitud'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export function parseCommercialLeadForm(
  values: FormValues,
  opportunityType: CommercialOpportunityType,
  submissionId: string
): { input?: CommercialLeadInput; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const contactName = values.contactName.trim();
  const businessName = values.businessName.trim();
  const email = values.email.trim().toLowerCase();
  const estimated = values.estimatedEventsPerMonth.trim();
  if (contactName.length < 2 || contactName.length > 160)
    errors.contactName = 'Ingresa un nombre de 2 a 160 caracteres.';
  if (businessName.length < 2 || businessName.length > 160)
    errors.businessName = 'Ingresa una empresa de 2 a 160 caracteres.';
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = 'Ingresa un correo electrónico válido.';
  const estimatedNumber = estimated === '' ? undefined : Number(estimated);
  if (
    estimatedNumber !== undefined &&
    (!Number.isInteger(estimatedNumber) || estimatedNumber < 1 || estimatedNumber > 10000)
  )
    errors.estimatedEventsPerMonth = 'Ingresa un número entero entre 1 y 10,000.';
  if (!values.privacyAccepted) errors.privacy = 'Debes aceptar el uso de datos para seguimiento comercial.';
  if (Object.keys(errors).length > 0) return { errors };
  return {
    input: {
      submissionId,
      opportunityType,
      contactName,
      businessName,
      email,
      phone: values.phone.trim() || null,
      estimatedEventsPerMonth: estimatedNumber ?? null,
      notes: values.notes.trim() || null,
      privacyAccepted: true,
      website: values.website.trim()
    },
    errors
  };
}

export function translateCommercialLeadError(error: unknown): { status: 'error' | 'rate-limited'; message: string } {
  if (error instanceof ApiError && (error.status === 429 || error.code === 'COMMERCIAL_LEAD_RATE_LIMITED')) {
    return {
      status: 'rate-limited',
      message: 'Ya recibimos varias solicitudes asociadas a este correo. Inténtalo más tarde.'
    };
  }
  if (error instanceof ApiError && (error.status === 400 || error.status === 422))
    return { status: 'error', message: 'Revisa los datos e inténtalo nuevamente.' };
  if (error instanceof ApiError && error.status === 409)
    return {
      status: 'error',
      message: 'Esta solicitud cambió durante el reintento. Cierra el formulario y vuelve a comenzar.'
    };
  return { status: 'error', message: 'No pudimos enviar la solicitud. Revisa tu conexión e inténtalo nuevamente.' };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
