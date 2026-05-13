import logging
import os

from dotenv import load_dotenv
from firebase_functions import https_fn
from firebase_admin import firestore
from _logging import get_logger

load_dotenv()

logger = get_logger(__name__)


@https_fn.on_call(region="asia-south1")
def list_gemini_models(req: https_fn.CallableRequest) -> dict:
    """
    Callable function that returns:
      - available_models: list of Gemini model names from the API
      - configured_models: current model assignments from the 'models' Firestore collection
    Restricted to admin users.
    """
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="You must be signed in.",
        )

    db = firestore.client()

    # Verify admin
    user_doc = db.collection("user_profile").document(req.auth.uid).get()
    if not user_doc.exists or user_doc.get("type") != "admin":
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.PERMISSION_DENIED,
            message="Admin access required.",
        )

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message="GEMINI_API_KEY is not configured on the server.",
        )

    # Fetch available models from Gemini API
    available_models: list[dict] = []
    try:
        from google import genai

        client = genai.Client(api_key=api_key)
        for m in client.models.list():
            # Only include models that support embedContent or generateContent
            supported = list(getattr(m, "supported_actions", []) or [])
            display_name = getattr(m, "display_name", None) or m.name or ""
            name = m.name or ""
            if not any(a in (name + display_name).lower() for a in ("embed", "gemini")):
                continue
            available_models.append(
                {
                    "name": name,
                    "displayName": display_name,
                    "supportedMethods": supported,
                }
            )
        logger.info("Listed %d Gemini models", len(available_models))
    except Exception as exc:
        logger.error("Failed to list Gemini models: %s", exc, exc_info=True)
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Failed to fetch models from Gemini API: {exc}",
        )

    # Fetch current model assignments from Firestore "models" collection
    configured_models: list[dict] = []
    try:
        for d in db.collection("models").stream():
            data = d.to_dict() or {}
            configured_models.append(
                {
                    "useCase": d.id,
                    "model": data.get("model", ""),
                    "description": data.get("description", ""),
                    "updatedAt": data.get("updatedAt").isoformat()
                    if data.get("updatedAt")
                    else None,
                }
            )
        logger.info("Fetched %d configured model assignments", len(configured_models))
    except Exception as exc:
        logger.error("Failed to read models collection: %s", exc, exc_info=True)

    return {"availableModels": available_models, "configuredModels": configured_models}
