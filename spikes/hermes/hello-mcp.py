#!/usr/bin/env python3
"""T04 spike: minimal stdio MCP server exposing one hello tool, no dependencies."""
import json
import sys

TOOLS = [{
    "name": "hello",
    "description": "Return a greeting. Used only to confirm Hermes lists MCP tools.",
    "inputSchema": {
        "type": "object",
        "properties": {"name": {"type": "string"}},
        "required": [],
    },
}]


def reply(msg_id, result):
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": msg_id, "result": result}) + "\n")
    sys.stdout.flush()


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        request = json.loads(line)
    except json.JSONDecodeError:
        continue
    method = request.get("method")
    msg_id = request.get("id")
    if method == "initialize":
        params = request.get("params") or {}
        reply(msg_id, {
            "protocolVersion": params.get("protocolVersion", "2025-03-26"),
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "skillmark-spike-hello", "version": "0.1.0"},
        })
    elif method in ("notifications/initialized", "notifications/cancelled"):
        continue
    elif method == "tools/list":
        reply(msg_id, {"tools": TOOLS})
    elif method == "tools/call":
        params = request.get("params") or {}
        name = (params.get("arguments") or {}).get("name", "world")
        reply(msg_id, {"content": [{"type": "text", "text": f"hello {name}"}], "isError": False})
    elif msg_id is not None:
        reply(msg_id, {"error": {"code": -32601, "message": "Method not found"}})
