# StudyBuddy-AI

A modern AI-driven study platform combining a React + TypeScript frontend, Firebase-backed learning workflows, and a local Model Context Protocol (MCP) integration. StudyBuddy helps students process study material, solve doubts, practise with generated assessments, manage syllabi and lectures, and use voice coaching.

The repository existed before the hackathon. The hackathon extension adds two related but distinct pieces:

1. A real FastMCP server exposing StudyBuddy tools over Streamable HTTP.
2. An Alexa+-inspired conversational navigation simulation that interprets natural-language learning requests and routes the student to an existing feature.

> **Scope note:** This project demonstrates an Alexa+-inspired agent simulation. It does **not** claim official Alexa+ SDK integration, official Alexa+ runtime access, Alexa Skill certification, or deployment inside Amazon Alexa.

## Table of contents

- [Features](#-features)
- [Repository structure](#-repository-structure)
- [Alexa+-Inspired Agentic Experience Powered by MCP](#alexainspired-agentic-experience-powered-by-mcp)
- [MCP architecture](#mcp-architecture)
- [Verified request flows](#verified-request-flows)
- [Implemented MCP tools](#implemented-mcp-tools)
- [Example: From Student Intent to Automated Learning](#example-from-student-intent-to-automated-learning)
- [Protocol verification](#protocol-verification)
- [Local setup and testing](#local-setup-and-testing)
- [Troubleshooting](#troubleshooting)
- [Implementation status](#implementation-status)
- [Future Improvements: MCP and Alexa+ Roadmap](#future-improvements-mcp-and-alexa-roadmap)
- [Tech stack](#-tech-stack)
- [Contributing](#-contributing)
- [Acknowledgments](#-acknowledgments)

---

## 🌟 Features

- **AI-powered content processing:** Study material is chunked, indexed, embedded, and made available for retrieval.
- **Doubt solving:** Authenticated students can ask questions and receive plain-language, step-by-step explanations through the existing `solve_doubt` Firebase callable function.
- **AI-generated assessments:** The existing `generate_dpp` workflow creates practice questions from syllabus topics and uploaded material, while using prior performance to select a difficulty level and retry missed questions.
- **Lecture and syllabus management:** Upload, parse, and manage syllabi, lectures, and study materials.
- **Voice coaching:** The existing interview/voice-coaching experience uses the Firebase voice-coaching functions and browser-side voice coach component.
- **Conversational navigation simulation:** Buddy accepts natural-language learning goals and returns an action plus the original query for an existing StudyBuddy route.
- **MCP integration layer:** `mcp-server/server.py` exposes `generate_quiz` and `navigate_to_feature` as discoverable MCP tools.
- **Streamable HTTP MCP transport:** The local MCP server runs at `http://127.0.0.1:8000/mcp`.
- **Mobile-first UI:** Tailwind CSS, Radix UI, Framer Motion, and accessible React components are used throughout the frontend.
- **Firebase authentication and persistence:** Existing learning workflows use Firebase Authentication, Firestore, Storage, and callable Cloud Functions.

---

## 🧩 Repository structure

```text
.
├── functions/                 # Existing Python Firebase callable and trigger functions
├── mcp-server/                # FastMCP server, navigation API, and MCP test clients
├── webapp/                    # React + TypeScript + Vite frontend
├── webapp_public/             # Public/static assets
├── firebase.json              # Firebase Functions, Hosting, Firestore, and Storage config
├── firestore.rules            # Firestore security rules
└── firestore.indexes.json     # Firestore indexes
```

### Key existing backend modules (`functions/`)

- `main.py`: Initializes Firebase Admin and exports the functions.
- `solve_doubt.py`: Authenticated doubt-solving workflow with embedding and Firestore vector-search support.
- `generate_dpp.py`: Authenticated daily-practice-paper generation workflow.
- `generate_lecture_mcq.py`: Lecture-based MCQ generation.
- `chunk_study_material.py` and `embed_study_material_chunk.py`: Material processing and embeddings.
- `parse_syllabus.py`: Admin-only syllabus parsing.
- `voice_coaching.py`: Voice-coaching configuration and knowledge-base search functions.
- Additional modules handle uploads, deletion, and related CRUD workflows.

### Key MCP and frontend files

- [`mcp-server/server.py`](mcp-server/server.py): FastMCP server and the two registered tools.
- [`mcp-server/navigation_api.py`](mcp-server/navigation_api.py): FastAPI navigation agent using Gemini structured JSON output.
- [`mcp-server/check_protocol.py`](mcp-server/check_protocol.py): MCP initialization, protocol-version, server-info, and tool-discovery check.
- [`mcp-server/test_alexa_client.py`](mcp-server/test_alexa_client.py): Real MCP client lifecycle test that discovers and invokes `generate_quiz`.
- [`mcp-server/README.md`](mcp-server/README.md): MCP-specific setup notes.
- [`webapp/src/components/ui/BuddyChatbot.tsx`](webapp/src/components/ui/BuddyChatbot.tsx): Global Buddy UI and frontend route handoff.
- [`webapp/src/routes/__root.tsx`](webapp/src/routes/__root.tsx): Mounts Buddy globally beside the route outlet.
- [`webapp/src/routes/doubtsolver.tsx`](webapp/src/routes/doubtsolver.tsx): Consumes `buddyQuery` and automatically submits it to the existing doubt-solving workflow.
- [`webapp/src/routes/practice.tsx`](webapp/src/routes/practice.tsx): Existing practice/DPP UI and Firebase integration.
- [`webapp/src/routes/interview.tsx`](webapp/src/routes/interview.tsx): Existing voice coaching/interview UI.
- [`firebase.json`](firebase.json): Firebase Functions runtime, Hosting rewrite, and deployment configuration.

---

## Alexa+-Inspired Agentic Experience Powered by MCP

### The educational problem

Students often know the goal they want—“explain normalization,” “give me a DBMS quiz,” or “let me revise by talking”—but do not necessarily know which StudyBuddy page to open. Requiring students to identify and manually switch between separate features adds friction, especially when the request is expressed as a complete learning goal rather than a feature name.

Buddy provides a conversational entry point. The student can express intent in ordinary language; the system interprets the request and can direct the student toward the relevant learning experience while preserving the original question.

### Why MCP is useful here

MCP provides a standard boundary between an agent or MCP client and executable application capabilities. In simple terms:

- The **agent/model** interprets language and decides what the student is trying to do.
- The **MCP client** connects to an MCP server, discovers its tools, and sends structured tool calls.
- The **MCP server** exposes safe, named operations and returns structured results.
- The **frontend** remains responsible for rendering UI and performing browser navigation.

This separation is more extensible than embedding every action directly in a chatbot component. New tools can be exposed through the MCP server without forcing every client to understand the internal implementation of the tool. MCP tools are model-controlled capabilities; the MCP server is not a browser controller and does not render the StudyBuddy UI.

The project includes a real FastMCP server and real Python MCP clients using Streamable HTTP. However, repository inspection also shows an important current boundary: the Buddy browser flow currently calls the FastAPI navigation endpoint and then maps the returned action directly to TanStack Router. It does **not** currently call `navigate_to_feature` through an MCP client. The MCP client/server lifecycle is verified separately by `check_protocol.py` and `test_alexa_client.py`. This distinction is documented deliberately so the hackathon submission does not overstate the current integration.

### What “Alexa+-inspired” means in this project

The experience is inspired by the idea of a conversational, intent-driven assistant that helps a user accomplish a goal without requiring menu-by-menu navigation. It demonstrates:

- natural-language learning requests;
- intent classification into StudyBuddy features;
- preservation of the student’s original query;
- a conversational confirmation message; and
- a path toward reusable tools and future voice-first workflows.

It is a **simulation**, not a production Alexa+ integration. This project does **not** claim official Alexa+ SDK integration, official Alexa+ runtime access, Alexa Skill certification, or deployment inside Amazon Alexa.

---

## MCP architecture

### Responsibilities of each component

| Component | Responsibility in this repository |
|---|---|
| React + TypeScript frontend | Presents the StudyBuddy UI, sends Buddy messages, performs client-side navigation, and runs destination learning features. |
| Buddy chatbot | Collects the student’s message and recent chat history, calls the FastAPI agent, displays the reply, and hands off supported actions to TanStack Router. |
| Gemini navigation agent | In `navigation_api.py`, interprets the message and history using a system prompt, then returns JSON containing `reply`, `action`, and `query`. |
| FastAPI navigation endpoint | Exposes `POST /agent/chat` and `GET /health`; validates requests, calls Gemini, handles 503/502 errors, and normalizes allowed actions. |
| MCP client session | In the test clients, opens Streamable HTTP, initializes an MCP session, discovers tools, and calls a named tool with structured arguments. |
| FastMCP server | Registers `generate_quiz` and `navigate_to_feature`, serves them through Streamable HTTP, and returns Python dictionaries as structured tool results. |
| MCP tools | Encapsulate reusable operations: calling the existing Firebase DPP endpoint and resolving a feature to a route/query instruction. |
| TanStack Router | Performs browser-side navigation. It is not controlled directly by Gemini or the MCP server. |
| Firebase backend | Performs the actual learning work: authentication, Firestore persistence, retrieval, doubt solving, DPP generation, lecture MCQs, and voice-coaching support. |

### Conceptual architecture

<img>

### MCP client, model, and server are different things

The Gemini model produces an interpretation. It is not itself an MCP server, it does not render the frontend, and it does not execute TanStack Router navigation. An MCP client is the protocol participant that opens a connection/session and sends `tools/list` or `tools/call` requests. The MCP server owns the registered tools and their execution logic. React consumes application responses and performs browser navigation.

MCP tool execution is a genuine client-server interaction when using the repository’s MCP clients: the client connects to `http://127.0.0.1:8000/mcp`, initializes, discovers tools, and invokes a tool over Streamable HTTP. The current Buddy UI path should not be described as doing that same MCP call, because `BuddyChatbot.tsx` currently calls `VITE_BUDDY_AGENT_URL` and switches routes locally after receiving the FastAPI response.

---

## Verified request flows

### Current Buddy browser navigation flow

The source code verifies this flow:

```text
Student’s natural-language request
  → BuddyChatbot.tsx
  → POST /agent/chat on navigation_api.py
  → Gemini returns JSON: reply, action, query
  → Buddy displays reply
  → TanStack Router navigates to the mapped route
  → destination route receives buddyQuery where implemented
  → destination feature performs its existing work
```

`BuddyChatbot.tsx` currently maps:

| Agent action | Frontend route used by Buddy |
|---|---|
| `practice` | `/practice` |
| `doubt_solver` | `/doubtsolver` |
| `talk_with_buddy` | `/interview` |

The frontend type also mentions `talk_with_buddy`; the navigation API prompt additionally permits `interview`. The current frontend switch handles `practice`, `doubt_solver`, and `talk_with_buddy`, but not `interview`. This is an implementation gap to resolve before describing `interview` as a complete Buddy action.

For `/doubtsolver`, the route validates the `buddyQuery` search parameter, waits for the signed-in user and Firestore history to load, and calls the existing `ask()` function. `ask()` invokes the authenticated `solve_doubt` Firebase callable function and persists the conversation. This confirms query handoff for Doubt Solver.

The `/practice` route does not consume `buddyQuery`. It uses `consumeAgentQuiz()` instead, but the inspected Buddy component does not populate that quiz handoff. Therefore, the Buddy-to-Practice workflow should be considered incomplete unless additional code outside the inspected files is connected.

The `/interview` route currently opens a subject-selection and voice-coaching session. The inspected route does not read `buddyQuery`, so a Buddy query is not confirmed to be automatically executed there. The route is a supported destination in the frontend mapping, but contextual query transfer to its voice coach is not verified.

### MCP client/server flow verified by repository code

The repository’s actual MCP clients implement this lifecycle:

```text
MCP client opens Streamable HTTP connection
  → ClientSession.initialize()
  → tools/list
  → tools/call with a named tool and arguments
  → structured result or MCP error
```

`check_protocol.py` prints the negotiated protocol version, server information, and discovered tool names. `test_alexa_client.py` additionally requires `generate_quiz` to be discoverable and calls it with `subject="DBMS"` and an empty `class_name`. These scripts provide code-level verification of the real MCP lifecycle, but a successful runtime result still depends on the local server, dependencies, Firebase token, backend availability, and valid project data.

---

## Implemented MCP tools

The FastMCP server registers exactly two tools with `@mcp.tool()`.

### `generate_quiz`

**Purpose:** Calls the existing authenticated Firebase `generate_dpp` callable endpoint. The MCP server does not contain the quiz-generation algorithm; `functions/generate_dpp.py` remains responsible for syllabus/material lookup, difficulty calculation, retries, Gemini generation, validation, and Firestore persistence.

**Inputs:**

| Parameter | Type | Required | Meaning |
|---|---|---:|---|
| `subject` | `str` | Yes | Academic subject. It is trimmed and must not be empty. |
| `class_name` | `str` | No | Optional class/grade. It is trimmed and sent as Firebase callable data field `class`. |

**Success output:**

```json
{
  "success": true,
  "subject": "DBMS",
  "class_name": "",
  "data": {
    "questions": [],
    "level": "Intermediate",
    "explanation": "...",
    "chunksUsed": 0
  }
}
```

The exact contents of `data` come from Firebase. The wrapper uses the response’s `result` field when present, otherwise it returns the complete decoded Firebase JSON response.

**Failure output:**

```json
{
  "success": false,
  "error": "..."
}
```

The tool returns failures for an empty subject, a missing `STUDYBUDDY_FIREBASE_ID_TOKEN`, timeout, HTTP error, connection failure, or invalid JSON.

**Internal behavior:**

1. Reads `FIREBASE_GENERATE_DPP_URL`, defaulting to the deployed `asia-south1` function URL in `server.py`.
2. Reads `STUDYBUDDY_FIREBASE_ID_TOKEN`.
3. Sends a POST request with callable-style JSON: `{"data": {"subject": ..., "class": ...}}`.
4. Sends the Firebase ID token as `Authorization: Bearer <token>`.
5. Applies a 90-second HTTP timeout.
6. Returns the Firebase result in a structured dictionary.

**Dependencies:** `requests`, `python-dotenv`, the deployed/local Firebase `generate_dpp` function, a valid signed-in Firebase user token, Firebase data, and the backend’s `GEMINI_API_KEY`.

**Example MCP invocation:**

```python
result = await session.call_tool(
    "generate_quiz",
    arguments={"subject": "DBMS", "class_name": ""},
)
```

**Limitations and verification status:**

- The Firebase ID token expires and must be refreshed for later demos.
- The callable function requires authentication and a non-empty subject.
- A valid token alone is not enough: the Firebase project must contain the required material/syllabus data and the deployed function must be available.
- The repository contains a real client invocation in `test_alexa_client.py`, but no committed runtime output proving a successful end-to-end quiz response. Treat this as **implemented and client-invocation tested in code; end-to-end success requires local verification**.
- `mcp-server/README.md` refers to `STUDYBUDDY_GENERATE_DPP_URL`, but `server.py` actually consumes `FIREBASE_GENERATE_DPP_URL`. Use the name in `server.py`.

### `navigate_to_feature`

**Purpose:** Resolves a supported StudyBuddy feature to a frontend route and preserves the supplied query. The tool returns navigation instructions; the React frontend must perform the actual navigation.

**Inputs:**

| Parameter | Type | Required | Meaning |
|---|---|---:|---|
| `feature` | `str` | Yes | One of the supported feature keys. It is lowercased and trimmed. |
| `query` | `str` | Yes | Student request or contextual query. It is trimmed and returned unchanged otherwise. |

**Supported feature names and route mappings:**

| Feature | Route returned by the MCP tool |
|---|---|
| `practice` | `/practice` |
| `doubt_solver` | `/doubtsolver` |
| `interview` | `/interview` |
| `talk_with_buddy` | `/talk-with-buddy` |

**Success output:**

```json
{
  "success": true,
  "action": "doubt_solver",
  "route": "/doubtsolver",
  "query": "Can you explain normalization in DBMS?"
}
```

**Unsupported-feature output:**

```json
{
  "success": false,
  "error": "Unsupported StudyBuddy feature: ...",
  "supported_features": [
    "practice",
    "doubt_solver",
    "interview",
    "talk_with_buddy"
  ]
}
```

**Example MCP invocation:**

```python
result = await session.call_tool(
    "navigate_to_feature",
    arguments={
        "feature": "doubt_solver",
        "query": "Can you explain normalization in DBMS?",
    },
)
```

**Internal behavior:** The tool only normalizes the strings, looks up the route in a static dictionary, and returns a structured result. It does not call Gemini, render the browser, or execute TanStack Router.

**Limitations and verification status:**

- The tool is implemented and can be discovered/called through an MCP client.
- The current Buddy browser flow uses its own route dictionary in `BuddyChatbot.tsx`; it does not call this MCP tool. This means the tool is **implemented and MCP-callable, but not wired into the current Buddy UI path**.
- The MCP server’s `talk_with_buddy` route (`/talk-with-buddy`) differs from the Buddy component’s current route (`/interview`) and the inspected route file (`interview.tsx`). This mapping inconsistency should be corrected in a future implementation change.
- The tool returns a route instruction, not proof that the destination route can consume the query. Query consumption is destination-specific.

---

## Example: From Student Intent to Automated Learning

Consider the request:

> **Student:** “Can you explain normalization in DBMS?”

### Verified current Doubt Solver experience

1. **Student enters the request in Buddy.** `BuddyChatbot.tsx` sends the text and recent conversation history to the configured `VITE_BUDDY_AGENT_URL`, defaulting locally to `http://127.0.0.1:8001/agent/chat`.
2. **The agent interprets the intent.** `navigation_api.py` sends the conversation to Gemini with a routing prompt. A doubt/explanation request is expected to produce `action: "doubt_solver"` and preserve the original text in `query`.
3. **The current browser path performs the route handoff.** The frontend receives `reply`, `action`, and `query`, waits 900 ms, and navigates to `/doubtsolver?buddyQuery=...` with TanStack Router.
4. **Doubt Solver receives the query.** `doubtsolver.tsx` validates and reads `buddyQuery` from the route search parameters.
5. **The original question is submitted automatically.** After authentication and the existing Firestore chat history are ready, the route reuses its original `ask()` function with the transferred question.
6. **The existing learning workflow answers it.** `ask()` invokes the authenticated `solve_doubt` Firebase callable function, which performs the existing embedding/retrieval and answer-generation workflow, then the UI displays the answer and solution steps.

This is a verified **agent-to-route-to-existing-feature** path. It is not currently an MCP tool call from the browser.

### How the MCP version of the handoff is intended to work

An MCP client can instead call `navigate_to_feature` with the same intent. The server returns the route and query as structured data. A client application would then decide whether and how to pass that result to the frontend. The repository demonstrates the actual MCP lifecycle in the standalone Python clients, but does not yet connect that client session into `BuddyChatbot.tsx`.

### Talk with Buddy / interview behavior

The navigation agent permits `interview` and `talk_with_buddy` concepts, and the frontend maps `talk_with_buddy` to `/interview`. The inspected `/interview` route presents subject selection and starts the existing `VoiceCoachAgent`; it does not currently consume a transferred `buddyQuery`. Therefore, the supported behavior is verified as **navigation to the voice-coaching page**, not automatic execution of the student’s original conversational request inside that page.

---

## Alexa+-inspired simulation: traditional vs conversational workflow

| Traditional StudyBuddy workflow | MCP-powered/conversational direction demonstrated by this project |
|---|---|
| Student identifies the feature from the navigation UI. | Student expresses a learning goal in natural language. |
| Student manually opens Doubt Solver, Practice, or Interview. | The agent classifies the intent and returns a feature action. |
| The student may need to retype the original question on the destination page. | The original query can be preserved and transferred, as verified for Doubt Solver. |
| Each UI integration may need its own hardcoded action contract. | MCP tools provide named, discoverable operations that can be reused by different clients. |
| Adding an integration can couple the chatbot directly to implementation details. | An MCP server creates a boundary between agent decisions and tool execution. |
| The workflow is primarily menu- and route-oriented. | The experience demonstrates a path toward contextual, multi-step, voice-first assistance. |

The current implementation should be read carefully: the MCP server and clients are real, while the Buddy browser navigation is still a FastAPI-to-frontend flow. The value demonstrated today is the separation and the reusable MCP tool surface, not a claim that every browser action already goes through MCP.

---

## Protocol verification

### Transport and endpoint

`mcp-server/server.py` starts FastMCP with:

```python
mcp.run(transport="streamable-http")
```

The local endpoint printed by the server is:

```text
http://127.0.0.1:8000/mcp
```

Streamable HTTP is the MCP HTTP transport used by the repository’s clients. It is a protocol transport, not a normal application JSON endpoint.

### Initialization, discovery, and invocation

`check_protocol.py` uses `streamable_http_client()` and `ClientSession`, then performs:

- `session.initialize()`;
- prints `result.protocolVersion` and `result.serverInfo.name`;
- calls `session.list_tools()` and prints the tool names.

`test_alexa_client.py` performs the same initialization and discovery steps, verifies that `generate_quiz` is present, then calls it with structured arguments and checks `result.isError`.

The repository does not pin a protocol version in source code and does not commit a successful terminal transcript. The check script prints the version negotiated by the installed MCP SDK/server at runtime. Therefore, this README intentionally does **not** claim that `2025-11-25` was successfully negotiated unless the judge runs the check and observes that exact output. Do not infer support for a newer protocol version from the documentation alone.

### Run the protocol check

With the MCP server running:

```powershell
cd mcp-server
.\.venv\Scripts\Activate.ps1
python check_protocol.py
```

Expected categories of output are the negotiated protocol version, server name, and discovered tools. The exact version is runtime evidence.

### Security notes

The local server currently has no application-level authentication on the MCP endpoint. Keep it bound to localhost for demonstrations, never commit tokens, and do not expose this endpoint publicly without adding appropriate HTTPS, authorization, origin/DNS-rebinding protections, least-privilege access, rate limits, and logging. Firebase ID tokens are sensitive and expire; they must remain in local environment configuration.

Read the official MCP guidance before deployment:

- [MCP documentation index](https://modelcontextprotocol.io/llms.txt)
- [Architecture overview](https://modelcontextprotocol.io/docs/2025-11-25/learn/architecture.md)
- [Understanding MCP servers](https://modelcontextprotocol.io/docs/2025-11-25/learn/server-concepts.md)
- [Understanding MCP clients](https://modelcontextprotocol.io/docs/2025-11-25/learn/client-concepts.md)
- [Build an MCP server](https://modelcontextprotocol.io/docs/2025-11-25/develop/build-server.md)
- [Build an MCP client](https://modelcontextprotocol.io/docs/2025-11-25/develop/build-client.md)
- [Streamable HTTP specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports.md)
- [Versioning](https://modelcontextprotocol.io/docs/2025-11-25/learn/versioning.md)
- [Security best practices](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices.md)
- [MCP Inspector](https://modelcontextprotocol.io/docs/2025-11-25/tools/inspector.md)

---

## Local setup and testing

These instructions run the three local services separately on Windows PowerShell.

### Prerequisites

- Python 3.10 or newer.
- Node.js and npm.
- Git.
- A Gemini API key for the navigation agent (`GEMINI_API_KEY`).
- Access to the StudyBuddy Firebase project and a signed-in user’s current Firebase ID token if testing `generate_quiz`.
- Firebase data required by the existing workflows, such as syllabus/material data, where applicable.

### Clone the repository

```powershell
git clone https://github.com/himanshi-0070/StudyBuddy-AI.git
cd StudyBuddy-AI
```

### Configure `mcp-server/.env`

Create `mcp-server/.env` locally. Never commit it.

```text
GEMINI_API_KEY=your-gemini-api-key
STUDYBUDDY_FIREBASE_ID_TOKEN=your-current-firebase-id-token
FIREBASE_GENERATE_DPP_URL=https://asia-south1-appnova-212c4.cloudfunctions.net/generate_dpp
VITE_BUDDY_AGENT_URL=http://127.0.0.1:8001/agent/chat
```

Environment-variable evidence from the inspected code:

| Variable | Consumed by | Required? | Notes |
|---|---|---:|---|
| `GEMINI_API_KEY` | `navigation_api.py` and existing Firebase functions | Required for the navigation API; also required by backend functions | Missing key causes navigation HTTP 500 or backend configuration errors. |
| `STUDYBUDDY_FIREBASE_ID_TOKEN` | `mcp-server/server.py` | Required only for `generate_quiz` | Must be a current token for a signed-in StudyBuddy user. |
| `FIREBASE_GENERATE_DPP_URL` | `mcp-server/server.py` | Optional | Defaults to the deployed `generate_dpp` URL shown in the source. |
| `VITE_BUDDY_AGENT_URL` | `BuddyChatbot.tsx` | Optional | Frontend override; otherwise defaults to `http://127.0.0.1:8001/agent/chat`. Vite variables normally belong in the frontend environment configuration. |
| `STUDYBUDDY_MCP_URL` | Not found in inspected source | Not currently consumed | Setting it has no effect unless application code is added to read it. |
| `GEMINI_NAV_MODELS` | Not found in inspected source | Not currently consumed | The navigation API currently uses the literal model name `gemini-3.8-flash`. |
| `STUDYBUDDY_GENERATE_DPP_URL` | Not consumed by `server.py` | Not currently consumed | The MCP server uses `FIREBASE_GENERATE_DPP_URL`; the nested MCP README uses a different name. |

Do not put real credentials, Firebase ID tokens, or API keys in Git, screenshots, issue comments, or this README.

### Terminal 1 — MCP server

```powershell
cd mcp-server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python server.py
```

The server should print that it is using Streamable HTTP and the endpoint `http://127.0.0.1:8000/mcp`.

### Terminal 2 — navigation agent

```powershell
cd mcp-server
.\.venv\Scripts\Activate.ps1
pip install fastapi uvicorn google-genai
python -m uvicorn navigation_api:app --reload --port 8001
```

The repository’s `mcp-server/requirements.txt` currently contains only `mcp[cli]` and `python-dotenv`; it does not list the FastAPI/Gemini navigation API dependencies. Installing them explicitly as above is therefore necessary for this terminal unless the environment already provides them.

The navigation API exposes:

- `GET http://127.0.0.1:8001/health`
- `POST http://127.0.0.1:8001/agent/chat`

### Terminal 3 — frontend

```powershell
cd webapp
npm install
npm run dev
```

Vite normally serves the frontend at `http://localhost:5173`. If that port is already occupied, Vite may select another port; use the URL printed in the terminal. The FastAPI CORS configuration permits localhost and 127.0.0.1 origins on arbitrary ports.

The repository’s Firebase Hosting configuration serves the built frontend from `webapp/dist` and rewrites all paths to `index.html`; it does not deploy the local MCP server or navigation API.

### Test the navigation API directly

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8001/agent/chat `
  -ContentType "application/json" `
  -Body '{"message":"Can you explain normalization in DBMS?","history":[]}'
```

The response should have the shape:

```json
{
  "reply": "...",
  "action": "doubt_solver",
  "query": "Can you explain normalization in DBMS?"
}
```

The exact reply is generated by Gemini. If the request is accepted but the model selects another allowed action, inspect the navigation API terminal and the returned JSON rather than assuming a route.

### Test MCP protocol and tool discovery

```powershell
cd mcp-server
.\.venv\Scripts\Activate.ps1
python check_protocol.py
```

Look for the negotiated protocol version, server name, and both registered tools.

### Test a real MCP tool call

For `navigate_to_feature`, no Firebase token is needed:

```powershell
python -c "import asyncio; from mcp import ClientSession; from mcp.client.streamable_http import streamable_http_client; async def x():\n    async with streamable_http_client('http://127.0.0.1:8000/mcp') as (r,w,_):\n        async with ClientSession(r,w) as s:\n            await s.initialize(); print(await s.call_tool('navigate_to_feature', arguments={'feature':'doubt_solver','query':'Can you explain normalization in DBMS?'}))\nasyncio.run(x())"
```

For the repository’s complete quiz test:

```powershell
python test_alexa_client.py
```

That script performs initialization, tool discovery, verifies `generate_quiz`, and invokes it. A successful MCP lifecycle does not guarantee successful Firebase quiz generation; inspect the structured result and server logs.

### Verify genuine MCP invocation

- Keep Terminal 1 visible and confirm the MCP server is running at `/mcp`.
- Run `check_protocol.py` or `test_alexa_client.py` and observe initialization/discovery output.
- Confirm that `test_alexa_client.py` reaches `session.call_tool(...)` rather than failing before discovery.
- For quiz generation, verify the Firebase endpoint receives a valid authenticated request and inspect the returned structured content.
- Do not treat a frontend route change alone as evidence of an MCP call. The current Buddy UI calls FastAPI directly and performs its own TanStack Router mapping.

### Verify frontend navigation and query transfer

1. Start all three terminals.
2. Open the Vite URL and sign in if the destination feature requires authentication.
3. Open Buddy and submit `Can you explain normalization in DBMS?`.
4. Confirm Terminal 2 logs the Gemini decision.
5. Confirm Buddy displays the agent reply and navigates to `/doubtsolver`.
6. Confirm Doubt Solver receives the `buddyQuery` and logs the auto-submit message.
7. Confirm the existing `solve_doubt` callable runs and the answer appears.

Firebase Authentication is required for the Doubt Solver’s automatic submission and for `generate_quiz`. A judge without access to the project or a valid signed-in token can still verify protocol initialization and `navigate_to_feature` locally, but cannot claim a successful authenticated quiz workflow.

---

## Troubleshooting

| Symptom | Likely cause | Safe troubleshooting step |
|---|---|---|
| Port 8000 already in use | Another process owns the MCP port. | Stop the process or choose a different MCP port, then update every MCP client URL consistently. Do not leave clients pointed at a stale endpoint. |
| MCP connection refused | `server.py` is not running or the port is wrong. | Start Terminal 1 and confirm `http://127.0.0.1:8000/mcp` in its output. |
| Navigation API runs while MCP is offline | These are separate services in the current repository. | Start the MCP server for MCP tests; starting FastAPI alone is not evidence that MCP is available. |
| Incorrect MCP endpoint | Client URL does not match the server transport endpoint. | Use `http://127.0.0.1:8000/mcp` in `check_protocol.py` and `test_alexa_client.py`, or update all clients together if you intentionally change the port. |
| Gemini model availability error, often HTTP 404 | The literal `gemini-3.8-flash` in `navigation_api.py` may not be available to the key/project. | Check model availability and access for the configured Gemini project, then update configuration/code deliberately; `GEMINI_NAV_MODELS` is not currently consumed. |
| Temporary Gemini overload, HTTP 503 | Gemini is temporarily unavailable. | Retry after a short delay. The navigation API configures three retries for 503 responses and returns HTTP 503 if the service remains unavailable. |
| Missing Gemini API key | `GEMINI_API_KEY` is absent from the environment loaded by the process. | Add it to the local environment used by Terminal 2 and restart the process. Never print or commit the value. |
| Firebase ID token expired | `STUDYBUDDY_FIREBASE_ID_TOKEN` is a temporary signed-in-user token. | Sign in again and obtain a fresh token through an approved local development process, then restart Terminal 1. Do not disable authentication. |
| Firebase callable authentication/request-format error | The token is invalid, the function requires auth, or the callable payload is incorrect. | Confirm the MCP wrapper sends `{"data": {"subject": ..., "class": ...}}`, uses `Authorization: Bearer ...`, and targets the correct `generate_dpp` URL. |
| Firebase returns no quiz data | The backend lacks syllabus/material data or generation failed. | Inspect Firebase function logs and verify the subject has parsed syllabus or uploaded material. |
| CORS error in the browser | Frontend origin is not a localhost/127.0.0.1 origin allowed by `navigation_api.py`, or the API is not reachable. | Use the printed Vite URL, confirm it matches the allowed local patterns, and restart FastAPI after configuration changes. Do not use wildcard production CORS as a permanent fix. |
| Frontend still points to localhost after deployment | `VITE_BUDDY_AGENT_URL` was not configured for the deployed frontend, and the component falls back to localhost. | Configure a deployed HTTPS navigation-agent URL and rebuild the frontend. The current repository does not deploy the navigation API through `firebase.json`. |
| Wrong Python virtual environment | Packages were installed into a different interpreter. | Activate `mcp-server/.venv`, run `python -m pip --version`, and install dependencies with that same `python`. |
| React development server uses another port | Vite selected a free port because 5173 was occupied. | Open the exact URL printed by `npm run dev`; the FastAPI CORS regex allows arbitrary localhost ports. |
| Buddy action does not navigate | Gemini returned `none`, an unsupported action, or an action the frontend switch does not handle. | Inspect the JSON response and compare it with the allowed action set in both `navigation_api.py` and `BuddyChatbot.tsx`. |
| Buddy reaches Interview but does not use the original question | `/interview` currently does not read `buddyQuery`. | Treat this as a known integration gap; use the subject-selection voice flow or implement a dedicated query handoff later. |

---

## Implementation status

| Component | Current Status | Evidence / File | Future Improvement |
|---|---|---|---|
| FastMCP server | Implemented; locally runnable | [`mcp-server/server.py`](mcp-server/server.py) | Deploy securely with HTTPS, authentication, health checks, and observability. |
| Streamable HTTP transport | Implemented in server and clients | `server.py`, `check_protocol.py`, `test_alexa_client.py` | Add automated transport/integration coverage. |
| Protocol verification | Locally verifiable; exact negotiated version requires runtime output | [`mcp-server/check_protocol.py`](mcp-server/check_protocol.py) | Record automated compatibility tests and supported-version policy. |
| `navigate_to_feature` | Implemented and MCP-callable; not wired into Buddy’s current MCP path | [`mcp-server/server.py`](mcp-server/server.py) | Connect an application MCP client and reconcile route mappings. |
| `generate_quiz` | Implemented; MCP client invocation exists; end-to-end Firebase success requires testing | [`mcp-server/server.py`](mcp-server/server.py), [`mcp-server/test_alexa_client.py`](mcp-server/test_alexa_client.py) | Replace temporary token handling and add authenticated integration tests. |
| Gemini navigation agent | Implemented as a FastAPI endpoint | [`mcp-server/navigation_api.py`](mcp-server/navigation_api.py) | Make model configuration explicit and deploy with retries, tracing, and health checks. |
| Doubt Solver query handoff | Verified in source for `/doubtsolver?buddyQuery=...` | [`BuddyChatbot.tsx`](webapp/src/components/ui/BuddyChatbot.tsx), [`doubtsolver.tsx`](webapp/src/routes/doubtsolver.tsx) | Add URL cleanup/confirmation and broader handoff tests. |
| Practice/Buddy integration | Partially implemented; Buddy route mapping and practice’s `consumeAgentQuiz()` are not connected in the inspected flow | `BuddyChatbot.tsx`, [`practice.tsx`](webapp/src/routes/practice.tsx), `webapp/src/lib/agentQuiz` | Define one structured quiz handoff contract. |
| Talk with Buddy / Interview integration | Partially implemented; navigation destination exists, but transferred query execution is not verified | `BuddyChatbot.tsx`, [`interview.tsx`](webapp/src/routes/interview.tsx) | Align `interview`, `talk_with_buddy`, and route names, then consume contextual queries. |
| Existing Firebase learning backend | Implemented before the MCP extension | `functions/`, `firebase.json` | Add MCP tools for more existing capabilities without duplicating business logic. |
| Cloud MCP deployment | Not currently implemented/verified | `firebase.json` deploys Functions and Hosting, not `mcp-server` | Deploy MCP and navigation services separately with secure HTTPS. |
| Official Alexa+ integration | Not integrated | No Alexa+ SDK/runtime integration in the inspected repository | Explore only through supported official developer access and integration paths. |

---

## Future Improvements: MCP and Alexa+ Roadmap

Everything in this section is **PLANNED and NOT CURRENTLY IMPLEMENTED**.

### Phase 1 — MCP reliability and deployment

- Deploy the MCP server to a suitable cloud environment.
- Deploy the navigation agent.
- Configure secure HTTPS endpoints.
- Improve environment-variable and secret management.
- Add health checks, structured logging, and request tracing.
- Improve error handling, retry behavior, and connection recovery.
- Add automated protocol and integration tests.
- Add a single source of truth for MCP and navigation endpoint configuration.

### Phase 2 — Expand MCP tools

- Add dedicated tools for doubt solving, quiz generation, lecture recommendations, interview preparation, and learning progress.
- Replace route-only orchestration with richer backend tool execution where appropriate.
- Introduce consistent input/output schemas and structured tool responses.
- Support reusable tool discovery and execution across multiple MCP clients.
- Reuse existing Firebase business logic rather than duplicating it inside tools.

### Phase 3 — Multi-step agentic workflows

- Enable sequences such as explain a topic → generate practice questions → evaluate performance → recommend revision.
- Add contextual follow-up handling.
- Support personalized study plans.
- Introduce appropriate user confirmation for sensitive or consequential actions.
- Maintain session context safely and minimize unnecessary data retention.
- Add guardrails for ambiguous or unsupported educational requests.

### Phase 4 — Alexa+ and voice-first evolution

- Explore official Alexa+ integration when developer access and supported integration paths are available.
- Investigate connecting MCP tools to an actual supported Alexa+ experience.
- Add voice-driven learning requests.
- Support natural conversational follow-ups.
- Explore multimodal and accessibility-focused learning experiences.

These items are exploratory plans only. The current project is not deployed inside Amazon Alexa and does not claim official Alexa+ access.

### Phase 5 — Production readiness

- Replace temporary authentication approaches with robust token management.
- Apply least-privilege access controls.
- Add rate limiting, monitoring, and abuse prevention.
- Protect student data and minimize sensitive logging.
- Improve scalability and deployment automation.
- Conduct security and performance testing.
- Add auditability for tool calls and user-visible confirmations where appropriate.

---

## 🚀 Existing installation and deployment

The original StudyBuddy application can be run independently of the optional local MCP demonstration.

### Frontend

```sh
cd webapp
npm install
npm run dev
```

The default Vite URL is usually [http://localhost:5173](http://localhost:5173), unless Vite selects another available port.

### Existing Firebase functions

```sh
cd functions
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Use the Firebase CLI and the project’s configuration for deployment/testing as appropriate:

```sh
firebase deploy --only functions,hosting
```

`firebase.json` configures Python 3.12 Functions, Firebase Hosting from `webapp/dist`, Firestore rules/indexes, and a single-page-app rewrite. It does not deploy `mcp-server` or `navigation_api.py`.

---

## ⚙️ Configuration and security

- Keep Gemini credentials in the environment used by the relevant service.
- Keep Firebase ID tokens local and temporary; never commit them.
- Do not expose the local MCP endpoint publicly without authentication and transport security.
- Review Firestore and Storage rules before production use.
- Treat tool inputs, model outputs, route names, and external HTTP responses as untrusted data.
- Do not use disabling authentication or exposing secrets as a permanent troubleshooting workaround.

---

## 📝 Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Radix UI, Framer Motion, TanStack Query, TanStack Router
- **Learning backend:** Python, Firebase Functions, Firebase Authentication, Firestore, Firebase Storage
- **AI services:** Google GenAI/Gemini for navigation, embeddings, doubt solving, assessments, and voice-related workflows
- **MCP:** Python MCP SDK, FastMCP, Streamable HTTP, `ClientSession`
- **Deployment:** Firebase Hosting and Firebase Functions for the existing application; the MCP and navigation services are currently local-only in this repository

---

## 🤖 AI models and usage

The project uses Google GenAI in several existing workflows. Model selection for many Firebase features is read from the Firestore `models` collection with fallbacks defined in the relevant function modules. The navigation API currently uses the literal model name `gemini-3.8-flash` in `navigation_api.py`; no `GEMINI_NAV_MODELS` environment variable is consumed by the inspected code.

---

## 🙋‍♂️ Contributing

Pull requests and issues are welcome. Please open a discussion for major feature requests. When extending the MCP layer, preserve the boundary between model interpretation, MCP tool execution, frontend navigation, and Firebase learning logic.

---

## 📞 Acknowledgments

- [TanStack](https://tanstack.com/) for React libraries and routing
- [Google GenAI](https://ai.google.dev/)
- [Firebase](https://firebase.google.com/)
- [Model Context Protocol](https://modelcontextprotocol.io/)

---

> **StudyBuddy-AI** — Supercharge your study journey with smart, scalable, and beautiful AI-driven tools.
