from firebase_functions import https_fn
from firebase_functions.options import MemoryOption
from firebase_admin import firestore, storage
from _logging import get_logger

logger = get_logger(__name__)

STORAGE_BUCKET = "appnova-212c4.firebasestorage.app"


@https_fn.on_call(region="asia-south1", memory=MemoryOption.MB_512)
def delete_lecture_material(req: https_fn.CallableRequest) -> dict:
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="You must be signed in to delete lecture material.",
        )

    doc_id: str = (req.data.get("docId") or "").strip()

    if not doc_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="docId is required.",
        )

    logger.info("delete_lecture_material: uid=%s docId=%s", req.auth.uid, doc_id)

    db = firestore.client()
    doc_ref = db.collection("lecture_materials").document(doc_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.NOT_FOUND,
            message=f"lecture_materials/{doc_id} does not exist.",
        )

    storage_path: str = doc.get("storagePath") or ""

    if storage_path:
        try:
            blob = storage.bucket(STORAGE_BUCKET).blob(storage_path)
            if blob.exists():
                blob.delete()
                logger.info("Storage blob deleted: %s", storage_path)
            else:
                logger.warning("Storage blob not found, skipping: %s", storage_path)
        except Exception as exc:
            logger.error(
                "Failed to delete storage object '%s': %s", storage_path, exc, exc_info=True
            )
    else:
        logger.warning("No storagePath on document lecture_materials/%s, skipping storage delete", doc_id)

    doc_ref.delete()
    logger.info("Firestore document deleted: lecture_materials/%s", doc_id)

    return {"success": True}
