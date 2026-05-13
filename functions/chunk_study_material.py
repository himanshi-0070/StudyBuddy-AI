import io
import logging
from firebase_functions import storage_fn
from firebase_admin import firestore, storage
from _logging import get_logger

logger = get_logger(__name__)

STORAGE_BUCKET = "appnova-212c4.firebasestorage.app"
CHUNK_SIZE = 500
OVERLAP_PCT = 0.20  # 20% overlap → 100 chars


def _chunk_text(text: str, size: int = CHUNK_SIZE, overlap: float = OVERLAP_PCT) -> list[str]:
    """Split text into fixed-size chunks with percentage-based overlap."""
    step = max(1, int(size * (1 - overlap)))
    chunks: list[str] = []
    start = 0
    while start < len(text):
        chunks.append(text[start : start + size])
        start += step
    return chunks


def _delete_existing_chunks(db: firestore.Client, storage_path: str) -> None:
    """Remove stale chunks for a storage path before writing new ones."""
    existing = db.collection("study_material_chunks").where(
        "storagePath", "==", storage_path
    ).stream()
    batch = db.batch()
    count = 0
    for doc in existing:
        batch.delete(doc.reference)
        count += 1
        if count % 490 == 0:
            batch.commit()
            batch = db.batch()
    if count % 490 != 0:
        batch.commit()
    if count:
        logger.info("Deleted %d stale chunks for %s", count, storage_path)


def _write_chunks_in_batches(
    db: firestore.Client,
    chunks: list[str],
    storage_path: str,
    subject: str,
    study_material_ref,
    generation: str,
    class_val: str = "",
) -> None:
    """Write chunk documents to Firestore in batches of ≤500 writes."""
    total = len(chunks)
    col = db.collection("study_material_chunks")
    batch = db.batch()
    ops = 0

    logger.info(
        "Writing %d chunks: subject=%r, class=%r, storagePath=%r",
        total,
        subject,
        class_val,
        storage_path,
    )

    for i, chunk_text in enumerate(chunks):
        doc_ref = col.document()
        data = {
            "storagePath": storage_path,
            "generation": generation,
            "subject": subject,
            "class": class_val,
            "chunkIndex": i,
            "totalChunks": total,
            "text": chunk_text,
            "chunkSize": CHUNK_SIZE,
            "overlapPct": OVERLAP_PCT,
        }
        if study_material_ref is not None:
            data["studyMaterialRef"] = study_material_ref

        batch.set(doc_ref, data)
        ops += 1

        if ops == 490:
            batch.commit()
            batch = db.batch()
            ops = 0

    if ops:
        batch.commit()


@storage_fn.on_object_finalized(bucket=STORAGE_BUCKET, region="asia-south1")
def chunk_study_material(
    event: storage_fn.CloudEvent[storage_fn.StorageObjectData | None],
) -> None:
    """
    Triggered when a file is uploaded to Firebase Storage.
    Extracts text from PDFs in study_material_bucket/, splits it into
    CHUNK_SIZE-character chunks with OVERLAP_PCT overlap, and saves the
    chunks to the 'study_material_chunks' Firestore collection.
    """
    obj = event.data
    if obj is None:
        return

    object_name: str = obj.name or ""
    content_type: str = obj.content_type or ""

    # Only process PDFs uploaded to the study material bucket
    if not object_name.startswith("study_material_bucket/"):
        logger.debug("Skipping non-study-material path: %s", object_name)
        return

    if content_type != "application/pdf":
        logger.debug("Skipping non-PDF content type '%s' for %s", content_type, object_name)
        return

    logger.info("Processing PDF for chunking: %s", object_name)

    generation: str = str(obj.generation or "")

    db = firestore.client()

    # Idempotency guard: atomically claim this (storagePath, generation) pair.
    # Using Firestore document create() which raises AlreadyExists if another
    # invocation already claimed it, preventing the TOCTOU race condition.
    if generation:
        from google.api_core.exceptions import AlreadyExists

        sentinel_id = generation  # generation is unique per object version
        sentinel_ref = (
            db.collection("study_material_processing")
            .document(object_name.replace("/", "_") + "_" + sentinel_id)
        )
        try:
            sentinel_ref.create({"storagePath": object_name, "generation": generation})
        except AlreadyExists:
            logger.info("Already processing generation %s for %s — skipping", generation, object_name)
            return

    # Derive subject from path: study_material_bucket/{subject}/{fileName}
    path_parts = object_name.split("/")
    subject_raw = path_parts[1] if len(path_parts) >= 3 else ""
    subject = subject_raw.replace("_", " ")  # reverse the space→underscore substitution done on upload

    # Download the PDF from Storage
    try:
        bucket = storage.bucket(STORAGE_BUCKET)
        blob = bucket.blob(object_name)
        pdf_bytes = blob.download_as_bytes()
    except Exception as exc:
        logger.error("Failed to download %s: %s", object_name, exc, exc_info=True)
        return

    # Extract text with pypdf
    try:
        from pypdf import PdfReader  # imported here to keep module-level imports fast

        reader = PdfReader(io.BytesIO(pdf_bytes))
        full_text = "\n".join(
            (page.extract_text() or "") for page in reader.pages
        ).strip()
    except Exception as exc:
        logger.error("Failed to parse PDF %s: %s", object_name, exc, exc_info=True)
        return

    if not full_text:
        logger.warning("No extractable text in %s — skipping chunking", object_name)
        return

    logger.info("Extracted %d characters from %s", len(full_text), object_name)

    # Build chunks
    chunks = _chunk_text(full_text)
    logger.info("Created %d chunks (size=%d, overlap=%.0f%%)", len(chunks), CHUNK_SIZE, OVERLAP_PCT * 100)

    # Find the linked study_material Firestore document (if it exists)
    study_material_ref = None
    class_val = ""
    try:
        docs = (
            db.collection("study_material")
            .where("storagePath", "==", object_name)
            .limit(1)
            .stream()
        )
        for d in docs:
            study_material_ref = d.reference
            # Prefer the subject stored in Firestore over the path-derived value
            subject = d.data().get("subject", subject) or subject
            class_val = d.data().get("class", "") or ""
            break
    except Exception as exc:
        logger.warning("Could not look up study_material doc for %s: %s", object_name, exc)

    # Remove any previously saved chunks for this file (handles re-uploads of different generations)
    _delete_existing_chunks(db, object_name)

    # Persist chunks
    _write_chunks_in_batches(db, chunks, object_name, subject, study_material_ref, generation, class_val)
    logger.info("Saved %d chunks to study_material_chunks for %s (generation=%s)", len(chunks), object_name, generation)
