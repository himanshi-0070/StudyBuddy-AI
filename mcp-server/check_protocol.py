import asyncio
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

async def main():
    async with streamable_http_client("http://127.0.0.1:8000/mcp") as (read, write, _):
        async with ClientSession(read, write) as session:
            result = await session.initialize()
            print("Negotiated MCP protocol:", result.protocolVersion)
            print("Server:", result.serverInfo.name)
            tools = await session.list_tools()
            print("Available tools:", [t.name for t in tools.tools])

asyncio.run(main())
