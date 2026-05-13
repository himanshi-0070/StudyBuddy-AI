import json
import logging
import os

from dotenv import load_dotenv
from firebase_functions import https_fn
from firebase_functions.options import MemoryOption
from firebase_admin import firestore
from _logging import get_logger

load_dotenv()

logger = get_logger(__name__)

EMBEDDING_MODEL_FALLBACK = "models/gemini-embedding-001"
SOLVER_MODEL_FALLBACK = "models/gemini-2.0-flash"
EMBEDDING_DIMENSIONS = 1536
TOP_K = 20


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
def solve_doubt(req: https_fn.CallableRequest) -> dict:
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="You must be signed in.",
        )

    data = req.data or {}
    question = (data.get("question") or "").strip()
    subject = (data.get("subject") or "").strip()
    class_val = (data.get("class") or "").strip()
    history = data.get("history") or []

    if not question:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="question is required.",
        )

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message="GEMINI_API_KEY is not configured on the server.",
        )

    db = firestore.client()
    embedding_model = _get_model_config(db, "embedding_model", EMBEDDING_MODEL_FALLBACK)
    solver_model = _get_model_config(db, "doubt_solver_model", SOLVER_MODEL_FALLBACK)

    logger.info(
        "solve_doubt: question=%r subject=%r class=%r embedding_model=%s solver_model=%s",
        question[:80],
        subject,
        class_val,
        embedding_model,
        solver_model,
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
            logger.error("Firestore Vector/DistanceMeasure could not be imported — vector search disabled")
            Vector = None  # type: ignore[assignment]
            DistanceMeasure = None  # type: ignore[assignment]

    client = genai.Client(api_key=api_key)

    # 1. Embed the question
    try:
        embed_response = client.models.embed_content(
            model=embedding_model,
            contents=question,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY",
                output_dimensionality=EMBEDDING_DIMENSIONS,
            ),
        )
        query_vector = embed_response.embeddings[0].values
        logger.info("Question embedded successfully (%d dims)", len(query_vector))
    except Exception as exc:
        logger.error("Failed to embed question: %s", exc, exc_info=True)
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Failed to embed question: {exc}",
        )

    # 2. Vector search in study_material_chunks
    chunks: list[str] = []
    debug_chunks: list[dict] = []
    vector_search_error: str | None = None
    if Vector is not None:
        try:
            col = db.collection("study_material_chunks")
            if subject:
                col = col.where("subject", "==", subject)
            results = col.find_nearest(
                vector_field="embedding",
                query_vector=Vector(query_vector),
                distance_measure=DistanceMeasure.COSINE,
                limit=TOP_K,
            ).get()
            seen_texts: set[str] = set()
            for r in results:
                d = r.to_dict()
                text = d.get("text", "")
                if not text or text in seen_texts:
                    continue
                seen_texts.add(text)
                debug_chunks.append({
                    "docId": r.id,
                    "text": text,
                    "subject": d.get("subject", ""),
                    "chunkIndex": d.get("chunk_index", d.get("chunkIndex", None)),
                    "fileName": d.get("file_name", d.get("fileName", "")),
                })
            chunks = [c["text"] for c in debug_chunks]
            logger.info("Vector search returned %d chunks (subject=%r)", len(chunks), subject or "all")
        except Exception as exc:
            vector_search_error = str(exc)
            logger.error("Vector search failed: %s", exc, exc_info=True)

    # 3. Build prompt
    context_text = "\n\n---\n\n".join(chunks)
    if not context_text:
        logger.info("No context chunks found; relying on model knowledge + Google Search")

    system_prompt = (
        "You are an expert tutor helping a student understand a concept. "
        "You have access to Google Search and can use it to find up-to-date, accurate information. "
        "Use the student's uploaded study material excerpts (if provided) as primary context, "
        "but freely supplement with your own knowledge and internet search results to give the "
        "clearest, most complete explanation possible. "
        "Adapt your language to be student-friendly — use examples, analogies, and step-by-step "
        "breakdowns wherever helpful. "
        "Return ONLY a JSON object with two keys: "
        '"answer" (a thorough markdown-formatted string explanation) and '
        '"steps" (array of strings — key steps or bullet points summarising the solution, '
        'empty array if not applicable).'
    )

    if context_text:
        user_message = (
            f"STUDY MATERIAL EXCERPTS (use as primary reference):\n{context_text}\n\n"
            f"QUESTION: {question}\n\n"
            "Use the excerpts above as context, and supplement with internet knowledge or search "
            "results as needed to give a complete, accurate explanation."
        )
    else:
        user_message = (
            f"QUESTION: {question}\n\n"
            "No study material excerpts are available for this question. "
            "Use your knowledge and Google Search to provide a thorough explanation."
        )
        logger.info("No context chunks found; relying on model knowledge + Google Search")

    # 4. Build conversation history (last 6 messages = 3 turns)
    conversation: list[dict] = []
    for h in history[-6:]:
        role = "user" if h.get("from") == "user" else "model"
        text = (h.get("text") or "").strip()
        if text:
            conversation.append({"role": role, "parts": [{"text": text}]})
    conversation.append({"role": "user", "parts": [{"text": user_message}]})

    # 5. Generate answer (Google Search grounding enabled)
    try:
        response = client.models.generate_content(
            model=solver_model,
            contents=conversation,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                tools=[types.Tool(google_search=types.GoogleSearch())],
                # response_mime_type is intentionally omitted: JSON mode is
                # incompatible with function/search tools in the Gemini API.
            ),
        )
        raw = (response.text or "").strip()
        logger.info("LLM response received (%d chars)", len(raw))

        # Extract JSON block from the response (model may wrap it in markdown fences)
        json_str = raw
        if "```" in raw:
            import re
            match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
            if match:
                json_str = match.group(1).strip()

        try:
            result = json.loads(json_str)
            answer = result.get("answer", raw)
            steps = result.get("steps", [])
        except json.JSONDecodeError:
            logger.warning("LLM returned non-JSON; using raw text as answer")
            answer = raw
            steps = []

        return {
            "answer": answer,
            "steps": steps,
            "chunksUsed": len(chunks),
            "debugChunks": debug_chunks,
            "vectorSearchError": vector_search_error,
        }
    except Exception as exc:
        logger.error("Failed to generate answer: %s", exc, exc_info=True)
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Failed to generate answer: {exc}",
        )
