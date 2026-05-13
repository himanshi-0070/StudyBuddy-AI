import logging
import os

from dotenv import load_dotenv
from firebase_functions import firestore_fn
from firebase_functions.options import MemoryOption
from firebase_admin import firestore
from _logging import get_logger

load_dotenv()

logger = get_logger(__name__)

try:
    from google.cloud.firestore import Vector
except ImportError:
    try:
        from google.cloud.firestore_v1.vector import Vector  # type: ignore[no-redef]
    except ImportError:
        Vector = None  # type: ignore[assignment]

EMBEDDING_MODEL_FALLBACK = "models/gemini-embedding-001"
EMBEDDING_MODEL_USE_CASE = "embedding_model"
EMBEDDING_DIMENSIONS = 1536


def _resolve_embedding_model(db: firestore.Client) -> str:
    """Read the active embedding model from models/{EMBEDDING_MODEL_USE_CASE} in Firestore.
    Falls back to EMBEDDING_MODEL_FALLBACK if the document or field is missing."""
    try:
        snap = db.collection("models").document(EMBEDDING_MODEL_USE_CASE).get()
        if snap.exists:
            model = (snap.get("model") or "").strip()
            if model:
                logger.info("Using embedding model from Firestore config: %s", model)
                return model
        logger.warning(
            "models/%s not found or has no model field — using fallback %s",
            EMBEDDING_MODEL_USE_CASE,
            EMBEDDING_MODEL_FALLBACK,
        )
    except Exception as exc:
        logger.error("Failed to read models config: %s", exc, exc_info=True)
    return EMBEDDING_MODEL_FALLBACK


@firestore_fn.on_document_created(
    document="study_material_chunks/{chunkId}",
    region="asia-south1",
    memory=MemoryOption.MB_512,
)
def embed_study_material_chunk(
    event: firestore_fn.Event[firestore_fn.DocumentSnapshot | None],
) -> None:
    """
    Triggered when a new chunk document is created in 'study_material_chunks'.
    Calls the Gemini embedding API to generate a 1536-dimension vector for the
    chunk's text, then updates the document with the resulting embedding.
    """
    snap = event.data
    if snap is None:
        logger.error("Event data is None")
        return

    chunk_data = snap.to_dict() or {}
    text: str = chunk_data.get("text", "").strip()
    chunk_id: str = snap.id

    if not text:
        logger.warning("Chunk %s has no text — skipping embedding", chunk_id)
        return

    logger.info(
        "Generating embedding for chunk %s (%d chars), subject=%r", 
        chunk_id, 
        len(text),
        chunk_data.get("subject", "unknown")
    )

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        logger.error("GEMINI_API_KEY is not set — cannot generate embedding for chunk %s", chunk_id)
        return

    db = firestore.client()
    embedding_model = _resolve_embedding_model(db)

    # Generate embedding via Gemini
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        response = client.models.embed_content(
            model=embedding_model,
            contents=text,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                output_dimensionality=EMBEDDING_DIMENSIONS,
            ),
        )
        embedding: list[float] = response.embeddings[0].values
        logger.info(
            "Embedding generated: %d dimensions for chunk %s", len(embedding), chunk_id
        )
    except Exception as exc:
        logger.error(
            "Failed to generate embedding for chunk %s: %s", chunk_id, exc, exc_info=True
        )
        return

    # Persist embedding back to the same chunk document
    try:
        db.collection("study_material_chunks").document(chunk_id).update(
            {
                "embedding": Vector(embedding) if Vector is not None else embedding,
                "embeddingModel": embedding_model,
                "embeddingDimensions": EMBEDDING_DIMENSIONS,
                "status": "processed",
                "updated_at": firestore.SERVER_TIMESTAMP,
            }
        )
        logger.info("Chunk %s updated with embedding", chunk_id)
    except Exception as exc:
        logger.error(
            "Failed to update chunk %s with embedding: %s", chunk_id, exc, exc_info=True
        )
