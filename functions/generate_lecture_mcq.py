import json
import os

from dotenv import load_dotenv
from firebase_functions import https_fn
from firebase_functions.options import MemoryOption
from firebase_admin import firestore
from _logging import get_logger

load_dotenv()

logger = get_logger(__name__)

MCQ_MODEL_FALLBACK = "models/gemini-2.0-flash"
NUM_QUESTIONS = 10


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
def generate_lecture_mcq(req: https_fn.CallableRequest) -> dict:
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="You must be signed in.",
        )

    data = req.data or {}
    lecture_id: str = (data.get("lectureId") or "").strip()
    subject: str = (data.get("subject") or "").strip()
    topic: str = (data.get("topic") or "").strip()

    if not lecture_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="lectureId is required.",
        )
    if not subject:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="subject is required.",
        )

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message="GEMINI_API_KEY is not configured on the server.",
        )

    db = firestore.client()
    model_name = _get_model_config(db, "lecture_mcq_model", MCQ_MODEL_FALLBACK)

    logger.info(
        "generate_lecture_mcq: uid=%s lectureId=%s subject=%r topic=%r model=%s",
        req.auth.uid, lecture_id, subject, topic, model_name,
    )

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    topic_clause = f" specifically about '{topic}'" if topic else ""
    prompt = (
        f"You are an expert educator creating a quiz for students studying {subject}{topic_clause}.\n"
        f"Generate exactly {NUM_QUESTIONS} multiple-choice questions (MCQs).\n\n"
        "REQUIREMENTS:\n"
        "- Each question must have exactly 4 options labelled A, B, C, D.\n"
        "- Exactly one option must be correct.\n"
        "- Questions should test conceptual understanding, not just memory.\n"
        "- Vary the difficulty: mix easy, medium, and hard questions.\n\n"
        "Return ONLY a valid JSON array with no extra text. Each element must have:\n"
        '  "question": string\n'
        '  "options": {"A": string, "B": string, "C": string, "D": string}\n'
        '  "answer": one of "A"|"B"|"C"|"D"\n'
        '  "explanation": brief explanation of why the answer is correct\n'
    )

    try:
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        raw = (response.text or "").strip()
        logger.info("MCQ response received (%d chars)", len(raw))

        questions = json.loads(raw)
        if not isinstance(questions, list):
            raise ValueError("Model did not return a JSON array")

        # Sanitise — keep only expected fields and enforce NUM_QUESTIONS cap
        sanitised = []
        for i, q in enumerate(questions[:NUM_QUESTIONS]):
            sanitised.append({
                "question": str(q.get("question", "")),
                "options": {
                    "A": str(q.get("options", {}).get("A", "")),
                    "B": str(q.get("options", {}).get("B", "")),
                    "C": str(q.get("options", {}).get("C", "")),
                    "D": str(q.get("options", {}).get("D", "")),
                },
                "answer": str(q.get("answer", "A")),
                "explanation": str(q.get("explanation", "")),
            })

        logger.info("Returning %d MCQ questions for lectureId=%s", len(sanitised), lecture_id)
        return {"questions": sanitised, "lectureId": lecture_id}

    except json.JSONDecodeError as exc:
        logger.error("Failed to parse MCQ JSON: %s | raw=%s", exc, raw[:300])
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message="Failed to parse generated questions. Please try again.",
        )
    except Exception as exc:
        logger.error("generate_lecture_mcq failed: %s", exc, exc_info=True)
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Failed to generate questions: {exc}",
        )
