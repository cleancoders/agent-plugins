#!/usr/bin/env python3
"""
Test suite for the Clean Code Craftsmen MCP Server.

Tests all 6 MCP tools by sending JSON-RPC requests to the server
and verifying responses.

Usage:
    python3 test_server.py
"""

import json
import subprocess
import sys
import os
from pathlib import Path

ROOT_DIR = Path(__file__).parent
SERVER_PATH = ROOT_DIR / "server.py"

# Test results tracking
passed = 0
failed = 0
errors = []


def send_request(request_obj):
    """Send a JSON-RPC request to the server and return the response."""
    request_json = json.dumps(request_obj) + "\n"
    result = subprocess.run(
        [sys.executable, str(SERVER_PATH)],
        input=request_json,
        capture_output=True,
        text=True,
        timeout=30
    )
    if result.returncode != 0 and result.stderr:
        # Server may write to stderr for logging
        pass
    if not result.stdout.strip():
        return None
    try:
        return json.loads(result.stdout.strip().split("\n")[0])
    except json.JSONDecodeError:
        return None


def assert_eq(name, actual, expected):
    global passed, failed, errors
    if actual == expected:
        passed += 1
        print(f"  PASS: {name}")
    else:
        failed += 1
        errors.append(f"{name}: expected {expected}, got {actual}")
        print(f"  FAIL: {name} (expected {expected}, got {actual})")


def assert_true(name, condition):
    global passed, failed, errors
    if condition:
        passed += 1
        print(f"  PASS: {name}")
    else:
        failed += 1
        errors.append(f"{name}: condition was False")
        print(f"  FAIL: {name}")


def assert_in(name, haystack, needle):
    global passed, failed, errors
    if needle in haystack:
        passed += 1
        print(f"  PASS: {name}")
    else:
        failed += 1
        errors.append(f"{name}: '{needle}' not found in response")
        print(f"  FAIL: {name}")


# --- Test: Initialize ---

def test_initialize():
    print("\n=== Test: Initialize ===")
    response = send_request({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {}
    })
    assert_true("Initialize returns response", response is not None)
    if response:
        assert_eq("Response has id", response.get("id"), 1)
        result = response.get("result", {})
        assert_eq("Protocol version", result.get("protocolVersion"), "2024-11-05")
        assert_true("Has capabilities", "capabilities" in result)
        assert_eq("Server name", result.get("serverInfo", {}).get("name"), "clean-craftsmen")


# --- Test: List Tools ---

def test_list_tools():
    print("\n=== Test: List Tools ===")
    # Send initialize first, then tools/list
    init_req = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}
    })
    list_req = json.dumps({
        "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}
    })
    combined_input = init_req + "\n" + list_req + "\n"

    result = subprocess.run(
        [sys.executable, str(SERVER_PATH)],
        input=combined_input,
        capture_output=True,
        text=True,
        timeout=30
    )
    lines = [l for l in result.stdout.strip().split("\n") if l.strip()]
    assert_true("Returns at least 2 responses", len(lines) >= 2)

    if len(lines) >= 2:
        tools_response = json.loads(lines[1])
        tools = tools_response.get("result", {}).get("tools", [])
        tool_names = [t["name"] for t in tools]

        assert_true("Has 6 tools", len(tools) == 6)
        assert_in("Has ask_expert", tool_names, "ask_expert")
        assert_in("Has compose_team", tool_names, "compose_team")
        assert_in("Has review_code", tool_names, "review_code")
        assert_in("Has list_experts", tool_names, "list_experts")
        assert_in("Has create_expert", tool_names, "create_expert")
        assert_in("Has validate_agent", tool_names, "validate_agent")

        # Check compose_team has new modes
        compose_tool = next(t for t in tools if t["name"] == "compose_team")
        modes = compose_tool["inputSchema"]["properties"]["mode"]["enum"]
        assert_in("compose_team has pingpong mode", modes, "pingpong")
        assert_in("compose_team has strongpair mode", modes, "strongpair")
        assert_in("compose_team has mob mode", modes, "mob")
        assert_in("compose_team has debate mode", modes, "debate")


# --- Test: list_experts ---

def test_list_experts():
    print("\n=== Test: list_experts ===")
    init_req = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}
    })
    call_req = json.dumps({
        "jsonrpc": "2.0", "id": 2, "method": "tools/call",
        "params": {"name": "list_experts", "arguments": {}}
    })
    combined_input = init_req + "\n" + call_req + "\n"

    result = subprocess.run(
        [sys.executable, str(SERVER_PATH)],
        input=combined_input,
        capture_output=True,
        text=True,
        timeout=30
    )
    lines = [l for l in result.stdout.strip().split("\n") if l.strip()]
    assert_true("Returns responses", len(lines) >= 2)

    if len(lines) >= 2:
        response = json.loads(lines[1])
        content = response.get("result", {}).get("content", [])
        assert_true("Has content", len(content) > 0)

        if content:
            text = content[0].get("text", "")
            # Check for key agents
            assert_in("Lists TDD agent", text, "tdd")
            assert_in("Lists SOLID agent", text, "solid")
            assert_in("Lists craftsman agent", text, "craftsman")
            assert_in("Lists clean-code agent", text, "clean-code")
            assert_in("Lists architecture agent", text, "architecture")
            # Should list at least 25 agents (26 total)
            agent_count = text.count("- **")
            assert_true(f"Lists 25+ agents (found {agent_count})", agent_count >= 25)


# --- Test: ask_expert ---

def test_ask_expert():
    print("\n=== Test: ask_expert ===")
    init_req = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}
    })
    call_req = json.dumps({
        "jsonrpc": "2.0", "id": 2, "method": "tools/call",
        "params": {
            "name": "ask_expert",
            "arguments": {
                "discipline": "tdd",
                "question": "What are the three laws of TDD?"
            }
        }
    })
    combined_input = init_req + "\n" + call_req + "\n"

    result = subprocess.run(
        [sys.executable, str(SERVER_PATH)],
        input=combined_input,
        capture_output=True,
        text=True,
        timeout=30
    )
    lines = [l for l in result.stdout.strip().split("\n") if l.strip()]
    assert_true("Returns responses", len(lines) >= 2)

    if len(lines) >= 2:
        response = json.loads(lines[1])
        content = response.get("result", {}).get("content", [])
        assert_true("Has content", len(content) > 0)

        if content:
            text = content[0].get("text", "")
            assert_in("Routes to TDD expert", text, "Expert Context Loaded: tdd")
            assert_in("Includes question", text, "What are the three laws of TDD?")
            assert_in("Contains TDD knowledge", text, "Red-Green-Refactor")
            assert_in("Contains test doubles knowledge", text, "test double")


def test_ask_expert_invalid():
    print("\n=== Test: ask_expert (invalid discipline) ===")
    init_req = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}
    })
    call_req = json.dumps({
        "jsonrpc": "2.0", "id": 2, "method": "tools/call",
        "params": {
            "name": "ask_expert",
            "arguments": {
                "discipline": "nonexistent-agent",
                "question": "test"
            }
        }
    })
    combined_input = init_req + "\n" + call_req + "\n"

    result = subprocess.run(
        [sys.executable, str(SERVER_PATH)],
        input=combined_input,
        capture_output=True,
        text=True,
        timeout=30
    )
    lines = [l for l in result.stdout.strip().split("\n") if l.strip()]
    assert_true("Returns responses", len(lines) >= 2)

    if len(lines) >= 2:
        response = json.loads(lines[1])
        assert_true("Returns error for invalid agent", "error" in response)


# --- Test: compose_team ---

def test_compose_team():
    print("\n=== Test: compose_team ===")
    init_req = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}
    })
    call_req = json.dumps({
        "jsonrpc": "2.0", "id": 2, "method": "tools/call",
        "params": {
            "name": "compose_team",
            "arguments": {
                "disciplines": ["tdd", "solid", "clean-code"],
                "task": "Review a module for quality",
                "mode": "panel"
            }
        }
    })
    combined_input = init_req + "\n" + call_req + "\n"

    result = subprocess.run(
        [sys.executable, str(SERVER_PATH)],
        input=combined_input,
        capture_output=True,
        text=True,
        timeout=30
    )
    lines = [l for l in result.stdout.strip().split("\n") if l.strip()]
    assert_true("Returns responses", len(lines) >= 2)

    if len(lines) >= 2:
        response = json.loads(lines[1])
        content = response.get("result", {}).get("content", [])
        assert_true("Has content", len(content) > 0)

        if content:
            text = content[0].get("text", "")
            assert_in("Shows panel mode", text, "Team Composed")
            assert_in("Includes task", text, "Review a module for quality")
            assert_in("Includes TDD context", text, "TDD")
            assert_in("Includes SOLID context", text, "SOLID")


# --- Test: review_code ---

def test_review_code():
    print("\n=== Test: review_code ===")
    init_req = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}
    })
    call_req = json.dumps({
        "jsonrpc": "2.0", "id": 2, "method": "tools/call",
        "params": {
            "name": "review_code",
            "arguments": {
                "discipline": "clean-code",
                "code": "def f(x):\n    return x + 1",
                "language": "python",
                "context": "A utility function"
            }
        }
    })
    combined_input = init_req + "\n" + call_req + "\n"

    result = subprocess.run(
        [sys.executable, str(SERVER_PATH)],
        input=combined_input,
        capture_output=True,
        text=True,
        timeout=30
    )
    lines = [l for l in result.stdout.strip().split("\n") if l.strip()]
    assert_true("Returns responses", len(lines) >= 2)

    if len(lines) >= 2:
        response = json.loads(lines[1])
        content = response.get("result", {}).get("content", [])
        assert_true("Has content", len(content) > 0)

        if content:
            text = content[0].get("text", "")
            assert_in("Shows review header", text, "Code Review by clean-code expert")
            assert_in("Includes code", text, "def f(x)")
            assert_in("Includes context", text, "A utility function")
            assert_in("Includes review instructions", text, "severity")


# --- Test: validate_agent ---

def test_validate_agent():
    print("\n=== Test: validate_agent ===")
    init_req = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}
    })
    call_req = json.dumps({
        "jsonrpc": "2.0", "id": 2, "method": "tools/call",
        "params": {
            "name": "validate_agent",
            "arguments": {
                "discipline": "tdd",
                "tier": "1"
            }
        }
    })
    combined_input = init_req + "\n" + call_req + "\n"

    result = subprocess.run(
        [sys.executable, str(SERVER_PATH)],
        input=combined_input,
        capture_output=True,
        text=True,
        timeout=30
    )
    lines = [l for l in result.stdout.strip().split("\n") if l.strip()]
    assert_true("Returns responses", len(lines) >= 2)

    if len(lines) >= 2:
        response = json.loads(lines[1])
        content = response.get("result", {}).get("content", [])
        assert_true("Has content", len(content) > 0)

        if content:
            text = content[0].get("text", "")
            assert_in("Shows agent name", text, "tdd")
            assert_in("Shows quiz tier", text, "Quiz")


# --- Test: Unknown tool ---

def test_unknown_tool():
    print("\n=== Test: Unknown tool ===")
    init_req = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}
    })
    call_req = json.dumps({
        "jsonrpc": "2.0", "id": 2, "method": "tools/call",
        "params": {
            "name": "nonexistent_tool",
            "arguments": {}
        }
    })
    combined_input = init_req + "\n" + call_req + "\n"

    result = subprocess.run(
        [sys.executable, str(SERVER_PATH)],
        input=combined_input,
        capture_output=True,
        text=True,
        timeout=30
    )
    lines = [l for l in result.stdout.strip().split("\n") if l.strip()]
    assert_true("Returns responses", len(lines) >= 2)

    if len(lines) >= 2:
        response = json.loads(lines[1])
        assert_true("Returns error", "error" in response)
        assert_in("Error mentions unknown tool", response.get("error", {}).get("message", ""), "Unknown tool")


# --- Run all tests ---

def main():
    print("Clean Code Craftsmen MCP Server Tests")
    print("=" * 50)

    test_initialize()
    test_list_tools()
    test_list_experts()
    test_ask_expert()
    test_ask_expert_invalid()
    test_compose_team()
    test_review_code()
    test_validate_agent()
    test_unknown_tool()

    print(f"\n{'=' * 50}")
    print(f"Results: {passed} passed, {failed} failed")
    if errors:
        print("\nFailures:")
        for e in errors:
            print(f"  - {e}")
    print(f"{'=' * 50}")

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
