
import os
import requests

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

load_dotenv()

# --------------------------------------------------
# MCP SERVER
# --------------------------------------------------

mcp = FastMCP(
    "StudyBuddy MCP",
    host="0.0.0.0",
    port=int(os.getenv("PORT", "8000")),
    stateless_http=True,
    json_response=True,
)

FIREBASE_GENERATE_DPP_URL = os.getenv(
    "FIREBASE_GENERATE_DPP_URL",
    "https://asia-south1-appnova-212c4.cloudfunctions.net/generate_dpp",
)


# --------------------------------------------------
# TOOL 1: GENERATE QUIZ
# Uses the EXISTING Firebase backend
# --------------------------------------------------

@mcp.tool()
def generate_quiz(
    subject: str,
    class_name: str = "",
) -> dict:
    """
    Generate a personalized StudyBuddy quiz/DPP using the
    existing Firebase generate_dpp function.

    Args:
        subject: Academic subject requested by the student.
        class_name: Optional class or grade.
    """

    subject = subject.strip()
    class_name = class_name.strip()

    if not subject:
        return {
            "success": False,
            "error": "Subject is required to generate a quiz.",
        }

    token = os.getenv("STUDYBUDDY_FIREBASE_ID_TOKEN")

    if not token:
        return {
            "success": False,
            "error": (
                "STUDYBUDDY_FIREBASE_ID_TOKEN is missing. "
                "Provide a valid Firebase user ID token."
            ),
        }

    payload = {
        "data": {
            "subject": subject,
            "class": class_name,
        }
    }

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(
            FIREBASE_GENERATE_DPP_URL,
            json=payload,
            headers=headers,
            timeout=90,
        )

        response.raise_for_status()

        firebase_result = response.json()

        # Firebase callable functions commonly wrap responses in "result".
        quiz_data = firebase_result.get(
            "result",
            firebase_result,
        )

        return {
            "success": True,
            "subject": subject,
            "class_name": class_name,
            "data": quiz_data,
        }

    except requests.Timeout:
        return {
            "success": False,
            "error": "Firebase quiz generation timed out.",
        }

    except requests.HTTPError:
        return {
            "success": False,
            "error": (
                f"Firebase returned HTTP {response.status_code}: "
                f"{response.text[:500]}"
            ),
        }

    except requests.RequestException as exc:
        return {
            "success": False,
            "error": f"Firebase connection failed: {str(exc)}",
        }

    except ValueError:
        return {
            "success": False,
            "error": "Firebase returned an invalid JSON response.",
        }


# --------------------------------------------------
# TOOL 2: NAVIGATE TO STUDYBUDDY FEATURE
# Used by the Alexa-inspired navigation agent
# --------------------------------------------------

@mcp.tool()
def navigate_to_feature(
    feature: str,
    query: str,
) -> dict:
    """
    Resolve a student's requested learning feature to its
    corresponding StudyBuddy frontend route.

    Supported features:
    - practice
    - doubt_solver
    - interview
    - talk_with_buddy

    This tool returns navigation instructions.
    The React frontend performs the actual navigation.
    """

    routes = {
        "practice": "/practice",
        "doubt_solver": "/doubtsolver",
        "interview": "/interview",
        "talk_with_buddy": "/talk-with-buddy",
    }

    feature = feature.strip().lower()
    query = query.strip()

    if feature not in routes:
        return {
            "success": False,
            "error": f"Unsupported StudyBuddy feature: {feature}",
            "supported_features": list(routes.keys()),
        }

    return {
        "success": True,
        "action": feature,
        "route": routes[feature],
        "query": query,
    }


# ==================================================
# TOOL 3: SOLVE STUDENT DOUBT
# ==================================================


# --------------------------------------------------
# TOOL 4: TALK WITH BUDDY (INTERACTIVE VOICE)
# --------------------------------------------------

@mcp.tool()
def call_talk_with_buddy(doubt: str) -> dict:
    """
    ROUTING RULES:

talk_with_buddy:
Select when the student wants to clarify academic doubts
interactively, through voice or conversational discussion.

Examples:
- I want to clear my Maths doubts interactively.
- Let's discuss integration through voice.
- I want Buddy to explain DBMS while talking with me.

interview:
Select ONLY when the student explicitly requests a mock
interview, viva, or interview-style questioning.

IMPORTANT:
Interactive doubt clarification is talk_with_buddy,
NOT interview.
    """

    doubt = doubt.strip()

    if not doubt:
        return {
            "success": False,
            "error": "A learning request is required.",
        }

    return {
        "success": True,
        "action": "talk_with_buddy",
        "route": "/interview",
        "query": doubt,
        "reply": "Opening Talk with Buddy for an interactive session.",
    }


# --------------------------------------------------
# START MCP SERVER
# --------------------------------------------------

if __name__ == "__main__":
    print("Starting StudyBuddy MCP Server...", flush=True)
    mcp.run(transport="streamable-http")
