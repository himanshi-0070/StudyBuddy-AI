import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

load_dotenv()

mcp = FastMCP("StudyBuddy MCP")


def _function_url() -> str:
	return os.getenv(
		"STUDYBUDDY_GENERATE_DPP_URL",
		"https://asia-south1-appnova-212c4.cloudfunctions.net/generate_dpp",
	)


def _call_generate_dpp(subject: str, class_name: str) -> dict:
	token = os.getenv("STUDYBUDDY_FIREBASE_ID_TOKEN", "").strip()
	if not token:
		raise RuntimeError(
			"STUDYBUDDY_FIREBASE_ID_TOKEN is not configured. "
			"Sign in to StudyBuddy and set the resulting Firebase ID token before running the MCP server."
		)

	payload = {"data": {"subject": subject}}
	if class_name:
		payload["data"]["class"] = class_name

	request = Request(
		_function_url(),
		data=json.dumps(payload).encode("utf-8"),
		headers={
			"Authorization": f"Bearer {token}",
			"Content-Type": "application/json",
		},
		method="POST",
	)

	try:
		with urlopen(request, timeout=60) as response:
			result = json.loads(response.read().decode("utf-8"))
	except HTTPError as exc:
		body = exc.read().decode("utf-8", errors="replace")
		raise RuntimeError(f"StudyBuddy generate_dpp returned HTTP {exc.code}: {body[:500]}") from exc
	except URLError as exc:
		raise RuntimeError(f"Could not reach StudyBuddy generate_dpp: {exc.reason}") from exc
	except json.JSONDecodeError as exc:
		raise RuntimeError("StudyBuddy returned an invalid JSON response") from exc

	if "error" in result:
		message = result["error"].get("message", "StudyBuddy returned an unknown error")
		raise RuntimeError(message)

	return result.get("data", result)


@mcp.tool()
def generate_quiz(subject: str, class_name: str = "") -> dict:
	"""Generate a StudyBuddy practice quiz for a subject."""
	subject = subject.strip()
	class_name = class_name.strip()
	if not subject:
		raise ValueError("subject is required")

	return _call_generate_dpp(subject, class_name)


if __name__ == "__main__":
	mcp.run(transport="streamable-http")
