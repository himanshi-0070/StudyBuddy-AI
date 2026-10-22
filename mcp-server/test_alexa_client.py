
import asyncio
import json

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

MCP_URL = "http://127.0.0.1:8000/mcp"


async def main():
    print("\n[1] Connecting to StudyBuddy MCP server...")

    async with streamable_http_client(MCP_URL) as (
        read_stream,
        write_stream,
        _,
    ):
        async with ClientSession(
            read_stream,
            write_stream,
        ) as session:

            # Actual MCP initialize request
            await session.initialize()
            print("[OK] MCP initialized")

            # Actual MCP tools/list request
            tools_response = await session.list_tools()

            print("\n[2] Available tools:")
            for tool in tools_response.tools:
                print(f" - {tool.name}: {tool.description}")

            tool_names = {
                tool.name for tool in tools_response.tools
            }

            if "generate_quiz" not in tool_names:
                raise RuntimeError(
                    "generate_quiz was not discovered!"
                )

            # Actual MCP tools/call request
            print("\n[3] Calling generate_quiz...")

            result = await session.call_tool(
                "generate_quiz",
                arguments={
                    "subject": "DBMS",
                    "class_name": "",
                },
            )

            if result.isError:
                raise RuntimeError(
                    f"MCP tool failed: {result.content}"
                )

            print("\n[4] MCP tool response:")

            if result.structuredContent is not None:
                print(json.dumps(
                    result.structuredContent,
                    indent=2,
                    default=str,
                ))
            else:
                for item in result.content:
                    if hasattr(item, "text"):
                        print(item.text)

            print("\nSUCCESS: Real MCP lifecycle completed!")


if __name__ == "__main__":
    asyncio.run(main())
