import os
import json
import asyncio
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google import genai
from google.genai import types, errors
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

load_dotenv()
app = FastAPI(title="StudyBuddy Navigation Agent")

MCP_URL = os.getenv("STUDYBUDDY_MCP_URL", "http://127.0.0.1:8000/mcp")
GEMINI_MODELS = [m.strip() for m in os.getenv("GEMINI_NAV_MODELS", "gemini-2.5-flash").split(",") if m.strip()]

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
You are Buddy, a learning navigation assistant inside StudyBuddy.
Choose exactly one action based on student intent:
- doubt_solver: ordinary text explanation or academic doubt solving.
- talk_with_buddy: interactive, conversational, back-and-forth or voice-based academic doubt clarification. Example: 'I want to clear my maths doubts interactively'.
- interview: ONLY explicit mock interview, viva, oral examination or assessment.
- practice: quiz, MCQ, DPP, test or practice questions.
- none: greeting, unrelated or incomprehensible message.
Interactive doubt clarification is talk_with_buddy, NOT interview.
A broad topic is sufficient. Do not ask for unnecessary subtopics.
Preserve the student's original academic request in query. Use history for follow-ups.
Do not claim a task was already completed; destination page handles the learning task.
Return ONLY JSON with exactly: reply, action, query.
Allowed actions: practice, doubt_solver, interview, talk_with_buddy, none.
"""

ALLOWED_ACTIONS = {"practice", "doubt_solver", "interview", "talk_with_buddy", "none"}

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "StudyBuddy Navigation Agent",
        "gemini_key_configured": bool(os.getenv("GEMINI_API_KEY")),
        "models_configured": len(GEMINI_MODELS),
    }

def parse_mcp_result(result) -> dict:
    if result.isError:
        raise RuntimeError(f"MCP tool returned an error: {result.content}")
    structured = getattr(result, "structuredContent", None)
    if isinstance(structured, dict):
        if "success" in structured:
            return structured
        if isinstance(structured.get("result"), dict):
            return structured["result"]
    for item in result.content:
        if getattr(item, "type", None) == "text":
            try:
                parsed = json.loads(item.text)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                continue
    raise ValueError("MCP tool returned no valid JSON object")

async def call_mcp_tool(name: str, arguments: dict) -> dict:
    async with streamable_http_client(MCP_URL) as streams:
        read_stream, write_stream, _ = streams
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            result = await session.call_tool(name, arguments=arguments)
            return parse_mcp_result(result)

async def call_navigation_mcp(action: str, query: str) -> dict:
    return await call_mcp_tool("navigate_to_feature", {"feature": action, "query": query})

async def call_talk_with_buddy_mcp(doubt: str) -> dict:
    return await call_mcp_tool("call_talk_with_buddy", {"doubt": doubt})