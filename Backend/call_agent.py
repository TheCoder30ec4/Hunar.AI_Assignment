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


# Edit this to change the agent's behavior, then run `create-agent` (first time)
# or `update-agent` (to apply changes to the existing HUNAR_AGENT_ID).
AGENT_SETTINGS = {
    "name": "Personal Caller",
    "language": "TELUGU",
    "voice_persona": "NEHA",
    "persona_name": "NEHA",
    "agent_prompt": "You are a friendly assistant calling to check in.",
    "objective": "Say hello and confirm the call works.",
    "introduction": "Hello! This is a test call from your voice agent.",
    "result_prompt": "Extract nothing in particular.",
    "result_schema": {"call_completed": "boolean"},
}


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
    mobile_number = "+918247350941"  # E.164, e.g. +1234567890

    response = requests.post(
        f"{BASE_URL}/calls/",
        headers=_headers(),
        json={
            "agent_id": agent_id,
            "callee_name": "Varun",
            "mobile_number": mobile_number,
            "guardrails": {
                "allowed_days": ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
                "earliest_call_time": "08:00",
                "last_call_time": "21:00",
            },
        },
    )
    response.raise_for_status()
    return response.json()


if __name__ == "__main__":
    _load_dotenv()
    try:
        command = sys.argv[1] if len(sys.argv) > 1 else "call"
        if command == "create-agent":
            print(create_agent())
        elif command == "update-agent":
            print(update_agent())
        else:
            print(call_me())
    except KeyError as e:
        sys.exit(f"missing env var: {e}")
