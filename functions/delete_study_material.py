import logging
from firebase_functions import https_fn
from firebase_admin import firestore, storage
from _logging import get_logger

logger = get_logger(__name__)

STORAGE_BUCKET = "appnova-212c4.firebasestorage.app"


@https_fn.on_call()
def delete_study_material(req: https_fn.CallableRequest) -> dict:
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="You must be signed in to delete study material.",
        )

    doc_id: str = req.data.get("docId", "").strip()

    logger.info("delete_study_material called by uid=%s docId=%s", req.auth.uid, doc_id)

    if not doc_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="docId is required.",
        )

    # Fetch the document to get the storage path server-side
    db = firestore.client()
    doc_ref = db.collection("study_material").document(doc_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.NOT_FOUND,
            message=f"study_material/{doc_id} does not exist.",
        )

    storage_path: str = doc.get("storagePath") or ""
    logger.info("Fetched document storagePath=%s", storage_path)

    # Delete file from Firebase Storage using the path stored in Firestore
    if storage_path:
        try:
            bucket = storage.bucket(STORAGE_BUCKET)
            blob = bucket.blob(storage_path)
            exists = blob.exists()
            logger.info("Storage blob exists=%s for path=%s", exists, storage_path)
            if exists:
                blob.delete()
                logger.info("Storage blob deleted: %s", storage_path)
            else:
                logger.warning("Storage blob not found, skipping delete: %s", storage_path)
        except Exception as e:
            logger.error("Failed to delete storage object '%s': %s", storage_path, e, exc_info=True)
    else:
        logger.warning("No storagePath on document study_material/%s, skipping storage delete", doc_id)

    # Delete Firestore document
    doc_ref.delete()
    logger.info("Firestore document deleted: study_material/%s", doc_id)

    # Delete all chunks associated with this storage path
    if storage_path:
        try:
            chunks_query = (
                db.collection("study_material_chunks")
                .where("storagePath", "==", storage_path)
                .stream(timeout=300)
            )
            batch = db.batch()
            chunk_count = 0
            for chunk_doc in chunks_query:
                batch.delete(chunk_doc.reference)
                chunk_count += 1
                if chunk_count % 490 == 0:
                    batch.commit()
                    batch = db.batch()
            if chunk_count % 490 != 0:
                batch.commit()
            logger.info("Deleted %d chunks for storagePath=%s", chunk_count, storage_path)
        except Exception as e:
            logger.error("Failed to delete chunks for '%s': %s", storage_path, e, exc_info=True)

        # Delete processing sentinel documents for this storage path
        try:
            sentinels_query = (
                db.collection("study_material_processing")
                .where("storagePath", "==", storage_path)
                .stream(timeout=300)
            )
            batch = db.batch()
            sentinel_count = 0
            for sentinel_doc in sentinels_query:
                batch.delete(sentinel_doc.reference)
                sentinel_count += 1
                if sentinel_count % 490 == 0:
                    batch.commit()
                    batch = db.batch()
            if sentinel_count % 490 != 0:
                batch.commit()
            if sentinel_count:
                logger.info("Deleted %d processing sentinels for storagePath=%s", sentinel_count, storage_path)
        except Exception as e:
            logger.error("Failed to delete processing sentinels for '%s': %s", storage_path, e, exc_info=True)

    return {"success": True, "docId": doc_id}

