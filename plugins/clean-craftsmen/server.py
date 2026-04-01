#!/usr/bin/env python3
"""
Clean Code Craftsmen MCP Server

Exposes specialist agents as MCP tools. Runs as a stdio-based MCP server
that can be added to any Claude Code project via plugin install.

Tools:
  - ask_expert: Ask a specific discipline expert a question
  - compose_team: Multi-expert collaboration on a task
  - review_code: Expert code review through a discipline lens
  - list_experts: Show available discipline experts
  - create_expert: Create a new specialist on demand
  - validate_agent: Run validation suite against an agent
"""

import json
import sys
import os
import subprocess
from pathlib import Path

# MCP protocol version
MCP_VERSION = "2024-11-05"

# Root directory — plugin root is the same directory as this server
ROOT_DIR = Path(__file__).parent
AGENTS_DIR = ROOT_DIR / "agents"
FRAMEWORK_DIR = ROOT_DIR / "framework"


def list_agents():
    """List all available agents with their metadata."""
    agents = []
    if not AGENTS_DIR.exists():
        return agents
    for agent_dir in sorted(AGENTS_DIR.iterdir()):
        if not agent_dir.is_dir():
            continue
        config_path = agent_dir / "config.json"
        if config_path.exists():
            with open(config_path) as f:
                config = json.load(f)
            agents.append(config)
        else:
            agents.append({
                "name": agent_dir.name,
                "displayName": agent_dir.name.replace("-", " ").title(),
                "description": f"Expert in {agent_dir.name}",
            })
    return agents


def load_agent_context(agent_name, format="full"):
    """Load an agent's full context (prompt + knowledge)."""
    loader = FRAMEWORK_DIR / "loader.sh"
    result = subprocess.run(
        [str(loader), agent_name, "--format", format],
        capture_output=True, text=True,
        cwd=str(ROOT_DIR)
    )
    if result.returncode != 0:
        raise ValueError(f"Failed to load agent '{agent_name}': {result.stderr}")
    return result.stdout


def compose_agents(agents, mode="panel"):
    """Compose multiple agents."""
    composer = FRAMEWORK_DIR / "composer.sh"
    cmd = [str(composer)] + agents + ["--mode", mode]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(ROOT_DIR))
    if result.returncode != 0:
        raise ValueError(f"Composition failed: {result.stderr}")
    return result.stdout


def create_new_agent(name, display_name=None, description=None, tags=None):
    """Create a new agent using the creator script."""
    creator = FRAMEWORK_DIR / "creator.sh"
    cmd = [str(creator), name]
    if display_name:
        cmd += ["--display", display_name]
    if description:
        cmd += ["--desc", description]
    if tags:
        cmd += ["--tags", tags]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(ROOT_DIR))
    if result.returncode != 0:
        raise ValueError(f"Failed to create agent: {result.stderr}")
    return result.stdout


# --- MCP Protocol Implementation ---

def send_response(id, result):
    """Send a JSON-RPC response."""
    response = {
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    }
    msg = json.dumps(response)
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


def send_error(id, code, message):
    """Send a JSON-RPC error."""
    response = {
        "jsonrpc": "2.0",
        "id": id,
        "error": {"code": code, "message": message}
    }
    msg = json.dumps(response)
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


TOOLS = [
    {
        "name": "ask_expert",
        "description": "Ask a specific Clean Code discipline expert a question. The expert will answer based on deep knowledge of their domain, with principles, code examples, and practical guidance.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "discipline": {
                    "type": "string",
                    "description": "The expert discipline (e.g., 'tdd', 'solid', 'clean-code', 'architecture')"
                },
                "question": {
                    "type": "string",
                    "description": "The question to ask the expert"
                }
            },
            "required": ["discipline", "question"]
        }
    },
    {
        "name": "compose_team",
        "description": "Assemble multiple agents to collaborate on a task. Modes: 'panel' (independent opinions), 'pair' (driver/navigator), 'review' (produce then review), 'pingpong' (ping-pong TDD pairing), 'strongpair' (strong-style pairing), 'mob' (3+ agents mob programming), 'debate' (structured design debate).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "disciplines": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of agents to compose (first is primary/driver)"
                },
                "task": {
                    "type": "string",
                    "description": "The task or question for the team"
                },
                "mode": {
                    "type": "string",
                    "enum": ["panel", "pair", "review", "pingpong", "strongpair", "mob", "debate"],
                    "description": "Composition mode (default: panel). Use pingpong/strongpair/mob/debate for craftsman collaboration."
                }
            },
            "required": ["disciplines", "task"]
        }
    },
    {
        "name": "review_code",
        "description": "Have a discipline expert review code through their specialized lens. Returns findings categorized by severity.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "discipline": {
                    "type": "string",
                    "description": "The expert discipline for the review"
                },
                "code": {
                    "type": "string",
                    "description": "The code to review"
                },
                "language": {
                    "type": "string",
                    "description": "The programming language of the code"
                },
                "context": {
                    "type": "string",
                    "description": "Optional context about the code (what it does, what changed)"
                }
            },
            "required": ["discipline", "code"]
        }
    },
    {
        "name": "list_experts",
        "description": "List all available Clean Code Craftsmen discipline experts with their descriptions and capabilities.",
        "inputSchema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "create_expert",
        "description": "Create a new specialist expert on demand. Generates the agent structure with prompt template, knowledge base placeholders, and validation suite.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Short name for the expert (e.g., 'database-optimization')"
                },
                "display_name": {
                    "type": "string",
                    "description": "Human-readable name (e.g., 'Database Optimization Expert')"
                },
                "description": {
                    "type": "string",
                    "description": "Description of the expert's domain"
                },
                "tags": {
                    "type": "string",
                    "description": "Comma-separated tags (e.g., 'database,performance,sql')"
                }
            },
            "required": ["name"]
        }
    },
    {
        "name": "validate_agent",
        "description": "Run the validation suite against an agent to verify its expertise. Returns quiz results, code review accuracy, and kata performance.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "discipline": {
                    "type": "string",
                    "description": "The agent to validate"
                },
                "tier": {
                    "type": "string",
                    "enum": ["1", "2", "3", "all"],
                    "description": "Validation tier: 1=quiz, 2=code-review, 3=kata, all=everything"
                }
            },
            "required": ["discipline"]
        }
    }
]


def handle_request(request):
    """Handle a JSON-RPC request."""
    method = request.get("method")
    id = request.get("id")
    params = request.get("params", {})

    if method == "initialize":
        send_response(id, {
            "protocolVersion": MCP_VERSION,
            "capabilities": {
                "tools": {}
            },
            "serverInfo": {
                "name": "clean-craftsmen",
                "version": "1.0.0"
            }
        })

    elif method == "notifications/initialized":
        pass  # No response needed for notifications

    elif method == "tools/list":
        send_response(id, {"tools": TOOLS})

    elif method == "tools/call":
        tool_name = params.get("name")
        arguments = params.get("arguments", {})

        try:
            if tool_name == "list_experts":
                agents = list_agents()
                text = "Available Clean Code Craftsmen Experts:\n\n"
                for a in agents:
                    text += f"- **{a.get('displayName', a['name'])}** (`{a['name']}`)\n"
                    text += f"  {a.get('description', 'No description')}\n"
                    if a.get('tags'):
                        text += f"  Tags: {', '.join(a['tags'])}\n"
                    text += "\n"
                send_response(id, {
                    "content": [{"type": "text", "text": text}]
                })

            elif tool_name == "ask_expert":
                discipline = arguments["discipline"]
                question = arguments["question"]
                context = load_agent_context(discipline)
                text = f"[Expert Context Loaded: {discipline}]\n\n"
                text += f"System Prompt + Knowledge Base ({len(context)} chars):\n"
                text += "---\n"
                text += context
                text += "\n---\n\n"
                text += f"Question: {question}\n\n"
                text += "(Apply the above expertise to answer the question.)"
                send_response(id, {
                    "content": [{"type": "text", "text": text}]
                })

            elif tool_name == "compose_team":
                disciplines = arguments["disciplines"]
                task = arguments["task"]
                mode = arguments.get("mode", "panel")
                context = compose_agents(disciplines, mode)
                text = f"[Team Composed: {', '.join(disciplines)} in {mode} mode]\n\n"
                text += context
                text += f"\n\nTask: {task}\n"
                send_response(id, {
                    "content": [{"type": "text", "text": text}]
                })

            elif tool_name == "review_code":
                discipline = arguments["discipline"]
                code = arguments["code"]
                language = arguments.get("language", "unknown")
                ctx = arguments.get("context", "")
                agent_context = load_agent_context(discipline)
                text = f"[Code Review by {discipline} expert]\n\n"
                text += agent_context
                text += f"\n\n---\nCode to review ({language}):\n```{language}\n{code}\n```\n"
                if ctx:
                    text += f"\nContext: {ctx}\n"
                text += "\nReview this code through your expert lens. "
                text += "List findings by severity (critical > warning > suggestion). "
                text += "For each finding: what's wrong, why it matters, how to fix it."
                send_response(id, {
                    "content": [{"type": "text", "text": text}]
                })

            elif tool_name == "create_expert":
                name = arguments["name"]
                display = arguments.get("display_name")
                desc = arguments.get("description")
                tags = arguments.get("tags")
                output = create_new_agent(name, display, desc, tags)
                send_response(id, {
                    "content": [{"type": "text", "text": output}]
                })

            elif tool_name == "validate_agent":
                discipline = arguments["discipline"]
                tier = arguments.get("tier", "all")
                validate_script = FRAMEWORK_DIR / "validate.py"
                result = subprocess.run(
                    [sys.executable, str(validate_script), discipline,
                     "--tier", tier, "--verbose"],
                    capture_output=True, text=True,
                    cwd=str(ROOT_DIR)
                )
                output = result.stdout
                if result.stderr:
                    output += "\n" + result.stderr
                send_response(id, {
                    "content": [{"type": "text", "text": output}]
                })

            else:
                send_error(id, -32601, f"Unknown tool: {tool_name}")

        except Exception as e:
            send_error(id, -32603, str(e))

    else:
        if id is not None:
            send_error(id, -32601, f"Method not found: {method}")


def main():
    """Main loop: read JSON-RPC requests from stdin, process them."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            handle_request(request)
        except json.JSONDecodeError:
            send_error(None, -32700, "Parse error")


if __name__ == "__main__":
    main()
