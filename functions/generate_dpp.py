import json
import logging
import os
import random

from dotenv import load_dotenv
from firebase_functions import https_fn
from firebase_functions.options import MemoryOption, CorsOptions
from firebase_admin import firestore
from _logging import get_logger

load_dotenv()

logger = get_logger(__name__)

DPP_MODEL_FALLBACK = "models/gemini-2.0-flash"
TOP_K = 30


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


def _fetch_subject_chunks(db, subject: str) -> list[str]:
    col = db.collection("study_material_chunks")
    if subject:
        col = col.where("subject", "==", subject)
    chunks: list[str] = []
    seen: set[str] = set()
    try:
        docs = col.limit(TOP_K).stream()
        for doc in docs:
            data = doc.to_dict() or {}
            text = data.get("text", "")
            if text and text not in seen:
                seen.add(text)
                chunks.append(text)
        logger.info("_fetch_subject_chunks: fetched %d chunks for subject=%r", len(chunks), subject)
    except Exception as exc:
        logger.error("_fetch_subject_chunks: failed to fetch chunks for subject=%r: %s", subject, exc, exc_info=True)
    return chunks


def _fetch_syllabus_topics(db, subject: str) -> tuple[list[dict], str]:
    """Return (topics_list, class_value) from the syllabus collection for the given subject."""
    try:
        docs = (
            db.collection("syllabus")
            .where("subject", "==", subject)
            .limit(1)
            .stream()
        )
        for doc in docs:
            data = doc.to_dict() or {}
            topics = data.get("topics") or []
            class_val = str(data.get("class") or "")
            logger.info(
                "_fetch_syllabus_topics: found %d topics for subject=%r class=%r",
                len(topics),
                subject,
                class_val,
            )
            return topics, class_val
    except Exception as exc:
        logger.warning("_fetch_syllabus_topics: failed for subject=%r: %s", subject, exc)
    return [], ""


def _fetch_incorrect_question_ids(db, uid: str, subject: str, class_val: str) -> list[str]:
    """Return practice_question doc IDs the user previously got wrong for this subject+class."""
    try:
        col = db.collection("solved_practice_questions")
        q = (
            col.where("uid", "==", uid)
            .where("subject", "==", subject)
            .where("isCorrect", "==", False)
        )
        if class_val:
            q = q.where("class", "==", class_val)
        ids = []
        for snap in q.limit(5).stream():
            qid = snap.get("questionId")
            if qid:
                ids.append(qid)
        logger.info("_fetch_incorrect_question_ids: found %d retry questions for uid=%s subject=%r", len(ids), uid, subject)
        return ids
    except Exception as exc:
        logger.warning("_fetch_incorrect_question_ids failed: %s", exc)
        return []


def _compute_user_difficulty(db, uid: str, subject: str, class_val: str) -> str:
    """
    Analyse the user's past solved_practice_questions for this subject+class and
    return one of: "Beginner", "Intermediate", "Advanced".

    Accuracy thresholds (last 30 attempts):
      < 40%   → Beginner
      40–70%  → Intermediate
      ≥ 70%   → Advanced
    Falls back to "Intermediate" if there are no past attempts.
    """
    try:
        col = db.collection("solved_practice_questions")
        q = col.where("uid", "==", uid).where("subject", "==", subject)
        if class_val:
            q = q.where("class", "==", class_val)
        total = 0
        correct = 0
        for snap in q.limit(30).stream():
            total += 1
            if snap.get("isCorrect"):
                correct += 1
        if total == 0:
            logger.info(
                "_compute_user_difficulty: no past attempts for uid=%s subject=%r — defaulting to Intermediate",
                uid, subject,
            )
            return "Intermediate"
        accuracy = correct / total
        if accuracy < 0.40:
            level = "Beginner"
        elif accuracy < 0.70:
            level = "Intermediate"
        else:
            level = "Advanced"
        logger.info(
            "_compute_user_difficulty: uid=%s subject=%r total=%d correct=%d accuracy=%.1f%% → %s",
            uid, subject, total, correct, accuracy * 100, level,
        )
        return level
    except Exception as exc:
        logger.warning("_compute_user_difficulty failed: %s", exc)
        return "Intermediate"


def _fetch_questions_by_ids(db, ids: list[str]) -> list[dict]:
    """Fetch full MCQ question dicts from practice_questions by document IDs."""
    result = []
    for qid in ids:
        try:
            snap = db.collection("practice_questions").document(qid).get()
            if snap.exists:
                d = snap.to_dict() or {}
                result.append(
                    {
                        "id": qid,
                        "question": d.get("question", ""),
                        "options": d.get("options", []),
                        "correctIndex": d.get("correctIndex", 0),
                        "topic": d.get("topic", ""),
                        "explanation": d.get("explanation", ""),
                        "isRetry": True,
                    }
                )
        except Exception as exc:
            logger.warning("_fetch_questions_by_ids: failed for id=%s: %s", qid, exc)
    return result


@https_fn.on_call(region="asia-south1", memory=MemoryOption.MB_512, cors=CorsOptions(cors_origins="*"))
def generate_dpp(req: https_fn.CallableRequest) -> dict:
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="You must be signed in.",
        )

    data = req.data or {}
    subject = (data.get("subject") or "").strip()

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
    model_name = _get_model_config(db, "dpp_generator", DPP_MODEL_FALLBACK)

    # Fetch syllabus topics and class
    syllabus_topics, class_val = _fetch_syllabus_topics(db, subject)
    # Allow client to override class (e.g. passed explicitly from the frontend)
    client_class = (data.get("class") or "").strip()
    if client_class:
        class_val = client_class

    topic_names: list[str] = [t.get("name", "") for t in syllabus_topics if t.get("name")]
    # Pick up to 10 diverse topics to ask questions from; sample randomly if more
    selected_topics = topic_names[:10] if len(topic_names) <= 10 else random.sample(topic_names, 10)

    uid = req.auth.uid

    # Fetch questions the user previously got wrong so we can include them as retries
    incorrect_ids = _fetch_incorrect_question_ids(db, uid, subject, class_val)
    retry_questions = _fetch_questions_by_ids(db, incorrect_ids)

    # Derive difficulty from the user's historical performance
    user_difficulty = _compute_user_difficulty(db, uid, subject, class_val)

    # Calculate how many new questions to generate (fill up to 10 total)
    new_count = max(0, 10 - len(retry_questions))

    logger.info(
        "generate_dpp: uid=%s subject=%s class=%s model=%s topics=%d retries=%d new=%d",
        uid,
        subject,
        class_val,
        model_name,
        len(selected_topics),
        len(retry_questions),
        new_count,
    )

    chunks = _fetch_subject_chunks(db, subject)
    if not chunks and not selected_topics and new_count > 0:
        # No material at all — return only retry questions if any, else empty
        if retry_questions:
            return {
                "questions": retry_questions,
                "level": "Unknown",
                "explanation": "No new study material found; showing previously incorrect questions only.",
                "chunksUsed": 0,
            }
        return {
            "questions": [],
            "level": "No material",
            "explanation": "No study material or syllabus found for this subject. Upload study material and parse the syllabus first.",
            "chunksUsed": 0,
        }

    context_text = "\n\n---\n\n".join(chunks) if chunks else "(No uploaded chunks available; rely on syllabus topics.)"
    topics_text = ", ".join(selected_topics) if selected_topics else "(no syllabus topics found; derive topics from material)"

    # Topics already covered by retry questions — prefer fresh topics for new questions
    retry_topics = {q["topic"] for q in retry_questions}
    fresh_topics = [t for t in selected_topics if t not in retry_topics] or selected_topics

    difficulty_guidance = {
        "Beginner": (
            "The student is at BEGINNER level (past accuracy below 40%). "
            "Generate straightforward, foundational questions that test core definitions, "
            "basic facts, and simple single-step concepts. Avoid tricky distractors."
        ),
        "Intermediate": (
            "The student is at INTERMEDIATE level (past accuracy 40–70%). "
            "Generate questions that require understanding and application of concepts, "
            "with plausible distractors that test common misconceptions."
        ),
        "Advanced": (
            "The student is at ADVANCED level (past accuracy 70% or above). "
            "Generate challenging questions that require analysis, synthesis, or multi-step "
            "reasoning. Use subtle distractors and higher-order thinking."
        ),
    }[user_difficulty]

    system_prompt = (
        "You are an expert MCQ exam question generator for students. "
        "You will receive a subject name, a list of syllabus topics, and study material excerpts. "
        f"Generate exactly {new_count} multiple-choice questions (MCQs), each with exactly 4 options (A, B, C, D). "
        "Spread the questions across the different syllabus topics — ideally one question per topic. "
        "Each question must have exactly one correct answer. "
        "Do not hallucinate content; base questions on the study material excerpts and syllabus topics. "
        "IMPORTANT: Do NOT reference any figures, diagrams, tables, graphs, sections, chapters, or page numbers in any question or option. "
        "Every question must be self-contained and answerable without access to any external material, image, or document. "
        f"DIFFICULTY REQUIREMENT: {difficulty_guidance} "
        "Return ONLY valid JSON with this exact structure — no markdown fences:\n"
        "{\n"
        '  "questions": [\n'
        "    {\n"
        '      "question": "Question text",\n'
        '      "options": ["Option A text", "Option B text", "Option C text", "Option D text"],\n'
        '      "correctIndex": 0,\n'
        '      "topic": "Topic name from syllabus",\n'
        '      "explanation": "Brief explanation of the correct answer"\n'
        "    }\n"
        "  ],\n"
        f'  "level": "{user_difficulty}",\n'
        '  "levelExplanation": "Why this level was chosen"\n'
        "}"
    )

    user_message = (
        f"SUBJECT: {subject}\n"
        f"CLASS: {class_val or 'Not specified'}\n"
        f"DIFFICULTY: {user_difficulty}\n"
        f"SYLLABUS TOPICS: {topics_text}\n"
        f"PREFERRED FRESH TOPICS (avoid repeating these if possible): {', '.join(fresh_topics)}\n\n"
        f"STUDY MATERIAL EXCERPTS:\n{context_text}\n\n"
        f"Generate {new_count} MCQ questions with 4 options each at {user_difficulty} difficulty, spread across the syllabus topics. "
        "Assign each question to the most relevant topic. "
        "Each question must be fully self-contained — do not reference figures, diagrams, tables, sections, or page numbers. "
        "Return only valid JSON as specified."
    )

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    # If no new questions are needed (all 10 slots filled by retries), skip AI call
    if new_count == 0:
        return {
            "questions": retry_questions,
            "level": "Unknown",
            "explanation": "This set contains your previously incorrect questions for review.",
            "chunksUsed": len(chunks),
        }

    try:
        response = client.models.generate_content(
            model=model_name,
            contents=[
                {"role": "user", "parts": [{"text": user_message}]},
            ],
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
            ),
        )
        raw = (response.text or "").strip()
        logger.info("generate_dpp: received response (%d chars)", len(raw))
        parsed = json.loads(raw)
        raw_questions = parsed.get("questions") or []
        level = str(parsed.get("level") or "Unknown")
        level_explanation = str(parsed.get("levelExplanation") or "")

        if not isinstance(raw_questions, list):
            raw_questions = []

        # Validate and normalise each MCQ entry
        questions: list[dict] = []
        for q in raw_questions:
            if not isinstance(q, dict):
                continue
            question_text = str(q.get("question") or "").strip()
            options = q.get("options") or []
            correct_index = q.get("correctIndex")
            topic = str(q.get("topic") or "General").strip()
            explanation = str(q.get("explanation") or "").strip()

            if not question_text:
                continue
            if not isinstance(options, list) or len(options) != 4:
                continue
            options = [str(o).strip() for o in options]
            if not all(options):
                continue
            if not isinstance(correct_index, int) or correct_index not in range(4):
                correct_index = 0

            questions.append(
                {
                    "question": question_text,
                    "options": options,
                    "correctIndex": correct_index,
                    "topic": topic,
                    "explanation": explanation,
                }
            )

        questions = questions[:new_count]

        # Persist each NEW question to "practice_questions" and capture auto-generated IDs
        refs_and_questions: list[tuple] = []
        batch = db.batch()
        for q in questions:
            ref = db.collection("practice_questions").document()
            refs_and_questions.append((ref, q))
            batch.set(
                ref,
                {
                    "generatedByUid": uid,
                    "subject": subject,
                    "class": class_val,
                    "topic": q["topic"],
                    "question": q["question"],
                    "options": q["options"],
                    "correctIndex": q["correctIndex"],
                    "explanation": q["explanation"],
                    "level": level,
                    "generatedAt": firestore.SERVER_TIMESTAMP,
                },
            )
        batch.commit()
        logger.info(
            "generate_dpp: saved %d new MCQ questions to practice_questions for subject=%s class=%s",
            len(questions),
            subject,
            class_val,
        )

        # Build final question list: retry questions first, then new ones (with their Firestore IDs)
        new_questions_with_ids = [
            {**q, "id": ref.id, "isRetry": False}
            for ref, q in refs_and_questions
        ]
        final_questions = retry_questions + new_questions_with_ids

        return {
            "questions": final_questions,
            "level": level,
            "explanation": level_explanation,
            "chunksUsed": len(chunks),
        }
    except json.JSONDecodeError:
        logger.warning("generate_dpp: model returned non-JSON response")
        # Still return any retry questions even if AI generation failed
        return {
            "questions": retry_questions,
            "level": "Unknown",
            "explanation": response.text or "",
            "chunksUsed": len(chunks),
        }
    except Exception as exc:
        logger.error("generate_dpp: failed to generate content: %s", exc, exc_info=True)
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Failed to generate DPP: {exc}",
        )
