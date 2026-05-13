"""
Shared logging setup for Cloud Functions.

In Cloud Run / Cloud Functions 2nd gen the runtime already owns the root
logger.  google-cloud-logging.setup_logging() replaces all root handlers with
a single structured Cloud Logging handler, so every logger in every module
automatically writes JSON-structured logs visible in Cloud Logging / GCP console.

Calling setup_logging() more than once is a no-op after the first call because
we guard with a module-level flag.
"""
import logging

_configured = False


def get_logger(name: str) -> logging.Logger:
    global _configured
    if not _configured:
        try:
            import google.cloud.logging as cloud_logging

            cloud_logging.Client().setup_logging(log_level=logging.INFO)
        except Exception:
            # Fallback for local dev where ADC may not be configured
            logging.basicConfig(
                level=logging.INFO,
                format="%(levelname)s %(name)s: %(message)s",
            )
        _configured = True
    return logging.getLogger(name)
