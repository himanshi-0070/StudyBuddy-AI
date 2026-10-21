# StudyBuddy MCP Server

This server exposes one real StudyBuddy feature through the Model Context Protocol:
`generate_quiz` calls the existing authenticated Firebase `generate_dpp` function.
The quiz logic remains in `functions/generate_dpp.py`; the MCP server is only an integration layer.

## Setup

Use Python 3.10 or newer:

```sh
cd mcp-server
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Set these environment variables before starting the server:

```text
STUDYBUDDY_FIREBASE_ID_TOKEN=your-firebase-id-token
STUDYBUDDY_GENERATE_DPP_URL=https://asia-south1-appnova-212c4.cloudfunctions.net/generate_dpp
```

`STUDYBUDDY_GENERATE_DPP_URL` is optional and defaults to the deployed StudyBuddy function URL.
The Firebase ID token must belong to a signed-in StudyBuddy user. Do not commit it or place it in source control.

## Run

```sh
python server.py
```

The MCP endpoint is available at `http://localhost:8000/mcp`.

To test it with an MCP-compatible client, configure the client to use the server's Streamable HTTP endpoint,
then call `generate_quiz` with a subject such as `Mathematics`.

## Demo flow

1. Sign in to StudyBuddy and obtain a current Firebase ID token for local testing.
2. Start this server with the token in the environment.
3. Use an MCP client to call `generate_quiz`.
4. Show that the returned questions come from StudyBuddy's existing Firebase-backed practice generation flow.

The token expires, so retrieve a fresh one for a later demo. Never add it to the repository or README.
