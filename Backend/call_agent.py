import os
import sys
from pathlib import Path

import requests

BASE_URL = "https://api.voice.hunar.ai/external/v1"


def _load_dotenv():
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def _headers():
    api_key = os.environ.get("HUNAR_API_KEY") or os.environ["HUNAR_AI_API_KEY"]
    return {"X-API-Key": api_key, "Content-Type": "application/json"}


# The agent's real configuration lives in core/agent_prompt.py — apply it
# with `uv run python -m core.agent_prompt`. It used to be duplicated here,
# and running `update-agent` silently replaced the hiring-screening prompt
# with a placeholder, so the duplicate is gone deliberately.
from core.agent_prompt import AGENT_SETTINGS  # noqa: E402


def create_agent():
    """One-time setup: creates a basic agent and returns its id."""
    response = requests.post(f"{BASE_URL}/agents/", headers=_headers(), json=AGENT_SETTINGS)
    response.raise_for_status()
    return response.json()


def update_agent():
    """Applies current AGENT_SETTINGS to the existing HUNAR_AGENT_ID."""
    agent_id = os.environ["HUNAR_AGENT_ID"]
    response = requests.put(f"{BASE_URL}/agents/{agent_id}/", headers=_headers(), json=AGENT_SETTINGS)
    response.raise_for_status()
    return response.json()


def call_me():
    agent_id = os.environ["HUNAR_AGENT_ID"]
    mobile_number = "+916305741824"  # E.164, e.g. +1234567890

    response = requests.post(
        f"{BASE_URL}/calls/",
        headers=_headers(),
        json={
            "agent_id": agent_id,
            "callee_name": "Varun",
            "mobile_number": mobile_number,
            # The deployed agent (HUNAR_AGENT_ID) is "AI Hiring Assistant" —
            # its prompt/introduction template these four variables
            # ({candidate_name}, {job_role}, {company}, {location}), and the
            # API 422s the call request if any are missing. Check
            # GET /agents/{id}/ -> custom_variables if this list ever drifts.
            "custom_data": {
                "candidate_name": "Varun",
                "job_role": "Software Engineer",
                "company": "Hunar.AI",
                "location": "Bengaluru",
            },
            "guardrails": {
                "allowed_days": ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
                "earliest_call_time": "08:00",
                "last_call_time": "21:00",
            },
        },
    )
    if not response.ok:
        # requests' raise_for_status() drops the response body, which is
        # where this API's actual validation error lives.
        sys.exit(f"{response.status_code} error: {response.text}")
    return response.json()


if __name__ == "__main__":
    _load_dotenv()
    try:
        command = sys.argv[1] if len(sys.argv) > 1 else "call"
        if command == "create-agent":
            print(create_agent())
        elif command == "update-agent":
            print(update_agent())
        elif command == "call":
            print(call_me())
        else:
            sys.exit(f"unknown command {command!r} — use create-agent, update-agent, or call")
    except KeyError as e:
        sys.exit(f"missing env var: {e}")
