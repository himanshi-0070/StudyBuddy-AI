"""
Voice coaching backend functions:
  - get_voice_coaching_config : returns the Gemini API key + voice model name
                                to an authenticated client so the browser can
                                open a Gemini Live session directly.
  - search_chunks             : vector-searches study_material_chunks and returns
                                raw text passages; called by the voice agent as a
                                tool during a Live session.
"""

import os

from dotenv import load_dotenv
from firebase_functions import https_fn
from firebase_functions.options import MemoryOption
from firebase_admin import firestore
from _logging import get_logger

load_dotenv()

logger = get_logger(__name__)

EMBEDDING_MODEL_FALLBACK = "models/gemini-embedding-001"
VOICE_MODEL_FALLBACK = "gemini-2.0-flash-live-001"
EMBEDDING_DIMENSIONS = 1536
TOP_K = 15


def _get_model_config(db, use_case: str, fallback: str) -> str:
    try:
        snap = db.collection("models").document(use_case).get()
        if snap.exists:
            model = (snap.get("model") or "").strip()
            if model:
                return model
    except Exception as exc:
        logger.warning("Could not read model config for '%s': %s", use_case, exc)
    return fallback


# ---------------------------------------------------------------------------
# get_voice_coaching_config
# ---------------------------------------------------------------------------

@https_fn.on_call(region="asia-south1")
def get_voice_coaching_config(req: https_fn.CallableRequest) -> dict:
    """
    Returns { apiKey, model } to authenticated users so the browser can
    open a Gemini Live (real-time voice) session directly.
    The model name is read from models/voice_coaching_model in Firestore.
    """
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="You must be signed in.",
        )

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message="GEMINI_API_KEY is not configured on the server.",
        )

    db = firestore.client()
    model = _get_model_config(db, "voice_coaching_model", VOICE_MODEL_FALLBACK)

    logger.info(
        "get_voice_coaching_config: uid=%s model=%s",
        req.auth.uid,
        model,
    )

    return {"apiKey": api_key, "model": model}


# ---------------------------------------------------------------------------
# search_chunks
# ---------------------------------------------------------------------------

@https_fn.on_call(region="asia-south1", memory=MemoryOption.MB_512)
def search_chunks(req: https_fn.CallableRequest) -> dict:
    """
    Vector-searches the study_material_chunks collection for passages relevant
    to the given query (and optionally filtered by subject).
    Returns { chunks: list[str] }.
    Called by the browser-side voice agent when the Gemini model issues a
    search_knowledge_base tool call.
    """
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="You must be signed in.",
        )

    data = req.data or {}
    query_text = (data.get("query") or "").strip()
    subject = (data.get("subject") or "").strip()
    class_val = (data.get("class") or "").strip()

    if not query_text:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="query is required.",
        )

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message="GEMINI_API_KEY is not configured.",
        )

    db = firestore.client()
    embedding_model = _get_model_config(db, "embedding_model", EMBEDDING_MODEL_FALLBACK)

    logger.info(
        "search_chunks: query=%r subject=%r class=%r embedding_model=%s",
        query_text[:80],
        subject,
        class_val,
        embedding_model,
    )

    from google import genai
    from google.genai import types

    try:
        from google.cloud.firestore import Vector, DistanceMeasure
    except ImportError:
        try:
            from google.cloud.firestore_v1.vector import Vector  # type: ignore[assignment]
            from google.cloud.firestore_v1.base_vector_query import DistanceMeasure  # type: ignore[assignment]
        except ImportError:
            logger.error("Firestore Vector/DistanceMeasure could not be imported")
            Vector = None  # type: ignore[assignment]
            DistanceMeasure = None  # type: ignore[assignment]

    client = genai.Client(api_key=api_key)

    # 1. Embed the query
    try:
        embed_resp = client.models.embed_content(
            model=embedding_model,
            contents=query_text,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY",
                output_dimensionality=EMBEDDING_DIMENSIONS,
            ),
        )
        query_vector = embed_resp.embeddings[0].values
        logger.info("Query embedded successfully (%d dims)", len(query_vector))
    except Exception as exc:
        logger.error("Failed to embed query: %s", exc, exc_info=True)
        return {"chunks": [], "error": str(exc)}

    # 2. Vector search
    chunks: list[str] = []
    if Vector is not None:
        try:
            col = db.collection("study_material_chunks")
            if subject:
                col = col.where("subject", "==", subject)
            if class_val:
                col = col.where("class", "==", class_val)
            results = col.find_nearest(
                vector_field="embedding",
                query_vector=Vector(query_vector),
                distance_measure=DistanceMeasure.COSINE,
                limit=TOP_K,
            ).get()
            seen: set[str] = set()
            for r in results:
                d = r.to_dict()
                text = d.get("text", "")
                if text and text not in seen:
                    seen.add(text)
                    chunks.append(text)
            logger.info(
                "search_chunks: returned %d chunks (subject=%r)",
                len(chunks),
                subject or "all",
            )
        except Exception as exc:
            logger.error("Vector search failed: %s", exc, exc_info=True)
    else:
        logger.warning("Vector search skipped — Firestore Vector import failed")

    return {"chunks": chunks}
