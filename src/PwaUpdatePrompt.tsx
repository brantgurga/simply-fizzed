import CloseIcon from "@mui/icons-material/Close";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import { useRegisterSW } from "virtual:pwa-register/react";

function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  return (
    <Snackbar open={needRefresh} anchorOrigin={{ horizontal: "center", vertical: "bottom" }}>
      <Alert
        severity="info"
        action={
          <>
            <Button color="inherit" size="small" onClick={() => void updateServiceWorker(true)}>
              Reload
            </Button>
            <IconButton
              aria-label="Dismiss update"
              color="inherit"
              size="small"
              onClick={() => setNeedRefresh(false)}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </>
        }
      >
        A new version is available.
      </Alert>
    </Snackbar>
  );
}

export default PwaUpdatePrompt;
