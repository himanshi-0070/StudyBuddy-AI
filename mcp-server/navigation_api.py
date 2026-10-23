
import os
import json

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google import genai
from google.genai import types, errors

load_dotenv()

app = FastAPI(title="StudyBuddy Navigation Agent")

# Allow local Vite development servers
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[dict[str, str]] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    action: str
    query: str



SYSTEM_PROMPT = """
You are Buddy, an Alexa-inspired agentic learning assistant
inside StudyBuddy.

Your primary responsibility is to understand the student's intent
and route them to the correct StudyBuddy feature.

Available actions:

1. doubt_solver:
   The student wants to understand, learn, clarify or get an
   explanation of an academic concept.

   IMPORTANT:
   Requests like "I want to clear my concepts of integration"
   are COMPLETE requests. Do not ask which subtopic they want.
   Navigate to Doubt Solver immediately.

2. interview:
   The student explicitly wants an interactive session,
   back-and-forth questioning, mock viva, oral practice,
   or conversational doubt clarification.

3. practice:
   The student wants a quiz, DPP, test or practice questions.

4. talk_with_buddy:
   The student explicitly requests the Talk with Buddy feature
   or conversational revision.

5. none:
   Only for greetings, completely unrelated requests,
   or genuinely incomprehensible messages.

CRITICAL ROUTING RULES:

- Prefer taking action over asking unnecessary follow-up questions.
- A broad academic topic is sufficient to navigate.
- Do not ask the student to specify a subtopic before navigating.
- Preserve the student's original academic request in query.
- Do not silently replace their question with a different question.
- Use conversation history to understand follow-up messages.
- Never claim an answer or quiz has already been generated.
- The destination page executes the actual learning task.

EXAMPLES:

User: "Hey, I want to get cleared with concepts of integration"
Output:
{
  "reply": "Sure! Opening Doubt Solver to explain integration.",
  "action": "doubt_solver",
  "query": "I want to get cleared with concepts of integration"
}

User: "I need to clarify my doubts regarding maths"
Output:
{
  "reply": "Opening your interactive Maths learning session.",
  "action": "interview",
  "query": "I need to clarify my doubts regarding maths"
}

User: "Explain integration by parts"
Output:
{
  "reply": "Opening Doubt Solver.",
  "action": "doubt_solver",
  "query": "Explain integration by parts"
}

User: "I want to get my doubts clarified interactively"
Output:
{
  "reply": "Opening your interactive learning session.",
  "action": "interview",
  "query": "I want to get my doubts clarified interactively"
}

User: "Generate a DBMS quiz"
Output:
{
  "reply": "Opening Practice.",
  "action": "practice",
  "query": "Generate a DBMS quiz"
}

Return ONLY valid JSON with exactly these fields:
reply, action, query.

Allowed actions:
practice, doubt_solver, interview, talk_with_buddy, none.
"""



@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "StudyBuddy Navigation Agent",
        "gemini_key_configured": bool(os.getenv("GEMINI_API_KEY")),
    }


@app.post("/agent/chat", response_model=ChatResponse)
def chat(request: ChatRequest):

    key = os.getenv("GEMINI_API_KEY")

    if not key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is missing from the agent environment",
        )

    # Gemini client with automatic retry for temporary 503 errors
    client = genai.Client(
        api_key=key,
        http_options=types.HttpOptions(
            retry_options=types.HttpRetryOptions(
                attempts=3,
                initial_delay=1.0,
                max_delay=4.0,
                http_status_codes=[503],
            ),
        ),
    )

    # Preserve recent conversation context
    conversation = request.history[-8:].copy()

    conversation.append({
        "role": "user",
        "content": request.message,
    })

    try:

        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=json.dumps(conversation),
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
            ),
        )

        # Parse Gemini response
        result = json.loads(response.text or "{}")

        if not isinstance(result, dict):
            raise ValueError("Gemini returned an invalid response structure")

        action = result.get("action", "none")
        print("[Buddy Agent] Gemini decision:", result)

        allowed_actions = {
            "practice",
            "doubt_solver",
            "interview",
            "talk_with_buddy",
            "none",
        }

        if action not in allowed_actions:
            action = "none"

        reply = str(
            result.get("reply")
            or "How can I help you?"
        )

        query = (
            str(result.get("query") or "")
            if action != "none"
            else ""
        )

        return ChatResponse(
            reply=reply,
            action=action,
            query=query,
        )

    # Gemini server temporarily unavailable
    except errors.ServerError as exc:

        print("Gemini server error:", repr(exc))

        if exc.code == 503:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Gemini is temporarily experiencing high demand. "
                    "Please try again shortly."
                ),
            ) from exc

        raise HTTPException(
            status_code=502,
            detail="Gemini service is temporarily unavailable.",
        ) from exc

    # Gemini API errors such as invalid key, model access, or quota
    except errors.ClientError as exc:

        print("Gemini client error:", repr(exc))

        raise HTTPException(
            status_code=502,
            detail=(
                f"Gemini API request failed (HTTP {exc.code}). "
                "Check model availability, API access, and quota."
            ),
        ) from exc

    # Invalid JSON or unexpected application errors
    except (json.JSONDecodeError, ValueError) as exc:

        print("Invalid Gemini response:", repr(exc))

        raise HTTPException(
            status_code=502,
            detail="Gemini returned an invalid navigation response.",
        ) from exc

    except Exception as exc:

        print("Navigation agent error:", repr(exc))

        raise HTTPException(
            status_code=502,
            detail="The StudyBuddy agent could not process this request.",
        ) from exc

    finally:
        client.close()
