import { createTheme } from '@mui/material/styles';

export const appTheme = createTheme({
  typography: {
    fontFamily: '"Inter", "Segoe UI", sans-serif'
  },
  shape: {
    borderRadius: 16
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true
      }
    }
  }
});
