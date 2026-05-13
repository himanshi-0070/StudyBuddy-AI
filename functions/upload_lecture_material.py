import uuid
import urllib.parse

from firebase_functions import https_fn
from firebase_functions.options import MemoryOption
from firebase_admin import firestore, storage
from _logging import get_logger

logger = get_logger(__name__)

STORAGE_BUCKET = "appnova-212c4.firebasestorage.app"


@https_fn.on_call(region="asia-south1", memory=MemoryOption.MB_512)
def upload_lecture_material(req: https_fn.CallableRequest) -> dict:
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="You must be signed in.",
        )

    data = req.data or {}
    storage_path: str = (data.get("storagePath") or "").strip()
    title: str = (data.get("title") or "").strip()
    subject: str = (data.get("subject") or "").strip()
    topic: str = (data.get("topic") or "General").strip()
    file_name: str = (data.get("fileName") or "").strip()

    if not storage_path:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="storagePath is required.",
        )
    if not title:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="title is required.",
        )
    if not subject:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="subject is required.",
        )

    logger.info(
        "upload_lecture_material: uid=%s storagePath=%s title=%r subject=%r",
        req.auth.uid, storage_path, title, subject,
    )

    bucket = storage.bucket(STORAGE_BUCKET)
    blob = bucket.blob(storage_path)

    if not blob.exists():
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.NOT_FOUND,
            message=f"File not found at storage path: {storage_path}",
        )

    # Attach a Firebase download token so the URL is permanent and in the
    # same format as what the Firebase JS SDK produces via getDownloadURL().
    download_token = str(uuid.uuid4())
    blob.reload()
    existing_metadata = blob.metadata or {}
    blob.metadata = {**existing_metadata, "firebaseStorageDownloadTokens": download_token}
    blob.patch()

    encoded_path = urllib.parse.quote(storage_path, safe="")
    url = (
        f"https://firebasestorage.googleapis.com/v0/b/{STORAGE_BUCKET}"
        f"/o/{encoded_path}?alt=media&token={download_token}"
    )

    db = firestore.client()

    # Ensure the subject document exists
    safe_subject = subject.replace(" ", "_")
    db.collection("subjects").document(safe_subject).set({"name": subject}, merge=True)

    # Create the Firestore document
    doc_ref = db.collection("lecture_materials").document()
    doc_ref.set({
        "title": title,
        "subject": subject,
        "topic": topic or "General",
        "url": url,
        "fileName": file_name,
        "storagePath": storage_path,
        "uploadedBy": req.auth.uid,
        "uploadedAt": firestore.SERVER_TIMESTAMP,
    })

    logger.info("lecture_materials/%s created url=%s", doc_ref.id, url[:80])

    return {"docId": doc_ref.id, "url": url}
