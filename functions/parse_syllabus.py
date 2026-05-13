import json
import os

from dotenv import load_dotenv
from firebase_functions import https_fn
from firebase_functions.options import MemoryOption
from firebase_admin import firestore, storage
from _logging import get_logger

load_dotenv()

logger = get_logger(__name__)

SYLLABUS_MODEL_FALLBACK = "models/gemini-2.0-flash"


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


@https_fn.on_call(region="asia-south1", memory=MemoryOption.MB_512)
def parse_syllabus(req: https_fn.CallableRequest) -> dict:
    """
    Admin-only callable that:
      1. Downloads a syllabus PDF from Firebase Storage.
      2. Sends it to Gemini (model configured under models/syllabus_parser).
      3. Extracts a structured list of topics + subtopics.
      4. Persists the result to the "syllabus" Firestore collection.
    """
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="You must be signed in.",
        )

    db = firestore.client()

    # Admin check
    user_doc = db.collection("user_profile").document(req.auth.uid).get()
    if not user_doc.exists or user_doc.get("type") != "admin":
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.PERMISSION_DENIED,
            message="Admin access required.",
        )

    data = req.data or {}
    storage_path = (data.get("storagePath") or "").strip()
    subject = (data.get("subject") or "").strip()
    class_val = (data.get("class") or "").strip()
    file_name = (data.get("fileName") or "").strip()

    if not storage_path or not subject or not class_val:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="storagePath, subject, and class are required.",
        )

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message="GEMINI_API_KEY is not configured on the server.",
        )

    model_name = _get_model_config(db, "syllabus_parser", SYLLABUS_MODEL_FALLBACK)
    logger.info(
        "parse_syllabus: uid=%s subject=%s class=%s model=%s path=%s",
        req.auth.uid,
        subject,
        class_val,
        model_name,
        storage_path,
    )

    # Download PDF from Firebase Storage
    try:
        bucket = storage.bucket()
        blob = bucket.blob(storage_path)
        pdf_bytes = blob.download_as_bytes()
        logger.info("Downloaded %d bytes from %s", len(pdf_bytes), storage_path)
    except Exception as exc:
        logger.error("Failed to download PDF: %s", exc, exc_info=True)
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Failed to download PDF from storage: {exc}",
        )

    # Build the extraction prompt
    extraction_prompt = (
        "You are an expert curriculum analyst. "
        "Carefully read the provided syllabus document and extract every topic and subtopic mentioned. "
        "Return ONLY a valid JSON object with this exact structure — no markdown fences, no extra text:\n"
        "{\n"
        '  "topics": [\n'
        "    {\n"
        '      "name": "Main topic name",\n'
        '      "subtopics": ["subtopic 1", "subtopic 2"]\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "Be thorough and include every topic mentioned. "
        "If a topic has no explicit subtopics, use an empty array for subtopics. "
        "This list will be used to generate assessments and personalised study plans."
    )

    # Call Gemini with the PDF inline
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=model_name,
            contents=[
                types.Part(
                    inline_data=types.Blob(
                        mime_type="application/pdf",
                        data=pdf_bytes,
                    )
                ),
                types.Part(text=extraction_prompt),
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        raw = (response.text or "").strip()
        logger.info("Gemini response length: %d chars", len(raw))
    except Exception as exc:
        logger.error("Gemini call failed: %s", exc, exc_info=True)
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"AI call failed: {exc}",
        )

    # Parse JSON response
    try:
        # Strip markdown fences if the model included them despite instructions
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        parsed = json.loads(raw)
        topics = parsed.get("topics", [])
    except json.JSONDecodeError as exc:
        logger.error("JSON parse error: %s\nRaw output: %s", exc, raw[:500])
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message="AI returned invalid JSON. Please try again.",
        )

    if not topics:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message="No topics could be extracted from the document.",
        )

    # Save to Firestore "syllabus" collection
    # Document ID: {subject}_{class}  e.g. "Physics_12"
    safe_subject = subject.replace(" ", "_")
    doc_id = f"{safe_subject}_{class_val}"

    db.collection("syllabus").document(doc_id).set(
        {
            "subject": subject,
            "class": class_val,
            "topics": topics,
            "parsedFrom": file_name or storage_path.split("/")[-1],
            "storagePath": storage_path,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
    )

    logger.info(
        "Saved syllabus doc '%s' with %d topics for %s class %s",
        doc_id,
        len(topics),
        subject,
        class_val,
    )

    return {
        "success": True,
        "docId": doc_id,
        "topicCount": len(topics),
        "topics": topics,
    }
