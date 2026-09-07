"""Transcribes a call recording via Groq Whisper.

Hunar returns a recording URL but no transcript (confirmed: no transcript
field in the OpenAPI spec, none on a real completed call, no transcript
endpoint). The recruiter UI needs the actual conversation, so the .wav is
downloaded and run through whisper-large-v3, which returns real timestamped
segments — verified live against a Hunar recording.

Speaker attribution is INFERRED, not provided: Whisper does no diarisation.
See _attribute_speakers for how, and for the limits of that inference.
"""

from __future__ import annotations

import logging
import re

import httpx

from core.calling_config import get_calling_settings

logger = logging.getLogger(__name__)

GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
WHISPER_MODEL = "whisper-large-v3"

# Phrases only the recruiter says. Drawn from the agent's own prompt and
# introduction (core/agent_prompt.py), so these track what it's told to say
# rather than being guesses about conversational English.
_AGENT_PATTERNS = (
    r"\bthis is neha\b",
    r"\bam i speaking with\b",
    r"\bthis call is recorded\b",
    r"\bdo you have (a couple of |two )?minutes\b",
    r"\bthe role i'm calling about\b",
    r"\bthe recruiting team\b",
    r"\bwould you be interested\b",
    r"\bcould you (please )?(tell|share|let me know)\b",
    r"\bcan you (please )?tell\b",
    r"\bthank(s| you) for (sharing|letting me know|the clarification|your time)\b",
    r"\bjust to confirm\b",
    r"\bis there anything else you would need\b",
    r"\bwhat would be the best (day|time)\b",
    r"\bwhat time on\b",
    r"\bi will arrange\b",
    r"\bfollow-up interview\b",
    r"\bhave a (great|wonderful|good) day\b",
    r"\bare you still there\b",
    r"\blastly\b",
    r"\bnext, could you\b",
    r"\bto understand better\b",
    r"\bit sounds like you have\b",
    r"\bthat's (great|good) to (know|hear)\b",
    r"\bunderstood\b",
)
_AGENT_RE = re.compile("|".join(_AGENT_PATTERNS), re.IGNORECASE)

# A question directed at the candidate is almost always the agent — the
# prompt tells it to ask one question at a time, and candidates rarely
# ask questions during a screening call.
_QUESTION_RE = re.compile(r"\?\s*$")

# Short affirmations/answers that only a candidate gives. Checked before the
# agent patterns so "Yes." after an agent question isn't mislabelled.
_CANDIDATE_PATTERNS = (
    r"^(yes|no|yeah|yep|nope|okay|ok|sure|correct|right)[.,!]?$",
    r"^(yes|no|yeah|nope),? ?(i am|i'm|thank you|thanks|no)\b",
    r"\bi am (interested|expecting|currently)\b",
    r"\bi'm (interested|currently|expecting)\b",
    r"\bi would take\b",
    r"\bmy (experience|notice period|expectation)\b",
    r"\bi('ve| have) worked\b",
    r"\bi also worked\b",
    r"\bso these are all my\b",
    # Short factual replies to the agent's scripted questions. Without these,
    # a bare "Maybe next Tuesday." inherits the agent's label.
    r"^(maybe |probably |around |about )?(next |this )?(mon|tues|wednes|thurs|fri|satur|sun)day\b",
    r"^(morning|afternoon|evening|night)[,.]",
    r"^\d{1,2}\s*(am|pm|o'clock)\b",
)
_CANDIDATE_RE = re.compile("|".join(_CANDIDATE_PATTERNS), re.IGNORECASE)


class TranscriptionError(Exception):
    """Download or transcription failed — the call itself is still valid."""


async def transcribe_recording(recording_url: str) -> list[dict]:
    """Returns [{speaker, start_ms, end_ms, text}] ordered by start time.

    Raises TranscriptionError on any failure; callers treat a missing
    transcript as degraded, never as a failed call.
    """
    settings = get_calling_settings()

    try:
        # Recordings run ~1MB/40s, so a generous read timeout matters more
        # than streaming here.
        async with httpx.AsyncClient(timeout=180.0) as client:
            audio = await client.get(recording_url)
            audio.raise_for_status()

            response = await client.post(
                GROQ_TRANSCRIPTION_URL,
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                files={"file": ("recording.wav", audio.content, "audio/wav")},
                data={
                    "model": WHISPER_MODEL,
                    "response_format": "verbose_json",
                    "timestamp_granularities[]": "segment",
                },
            )
            response.raise_for_status()
            body = response.json()
    except httpx.HTTPError as exc:
        logger.exception("transcription failed for %s", recording_url)
        raise TranscriptionError(str(exc)) from exc

    return _attribute_speakers(body.get("segments") or [])


def _classify(text: str) -> str | None:
    """Returns 'agent' when the line is unmistakably the recruiter, else None.

    Content-based rather than timing-based: an earlier pause-gap heuristic
    got roughly half the labels wrong on a real 168s screening call, because
    turn boundaries and within-turn pauses are indistinguishable by duration.
    The agent, by contrast, speaks from a known script.
    """
    stripped = text.strip()
    # Candidate patterns first: a bare "Yes." answering an agent question
    # must not be captured by any agent pattern.
    if _CANDIDATE_RE.search(stripped):
        return "candidate"
    if _AGENT_RE.search(stripped):
        return "agent"
    if _QUESTION_RE.search(stripped):
        return "agent"
    return None


def _is_agent_question(text: str) -> bool:
    """Whisper occasionally merges the tail of a candidate's answer with the
    start of the agent's next question into one segment. When a line both
    looks like a candidate answer AND ends in a scripted question, the
    question wins — the recruiter is who moves the call forward.
    """
    return bool(_QUESTION_RE.search(text.strip()) and _AGENT_RE.search(text))


def _attribute_speakers(segments: list[dict]) -> list[dict]:
    """Labels each segment 'agent' or 'candidate'.

    Content only — timing is deliberately NOT used. Measured on a real
    168-second call, Whisper's gaps at genuine turn changes ranged 0-819ms,
    indistinguishable from gaps inside a single speaker's turn, so any
    pause-threshold rule mislabels heavily in one direction or the other.

    Two passes: tag every line the agent's script or the candidate's answer
    shapes clearly account for, then let each remaining line inherit the
    previous line's speaker (an unscripted continuation of whoever was
    talking). The agent always speaks first — it delivers the introduction —
    which anchors the sequence.

    This is a heuristic, not diarisation: an off-script agent line, or a
    candidate who asks a question, will be mislabelled. Getting this exactly
    right needs a diarising model over the audio.
    """
    cleaned = [
        {
            "start_ms": int(float(segment.get("start", 0.0)) * 1000),
            "end_ms": int(float(segment.get("end", segment.get("start", 0.0))) * 1000),
            "text": (segment.get("text") or "").strip(),
        }
        for segment in segments
        if (segment.get("text") or "").strip()
    ]
    if not cleaned:
        return []

    labels: list[str | None] = [
        "agent" if _is_agent_question(item["text"]) else _classify(item["text"])
        for item in cleaned
    ]
    # The introduction is always the agent, whatever the text looks like.
    labels[0] = "agent"

    for index, label in enumerate(labels):
        if label is None:
            # Unscripted line: whoever was speaking is still speaking. Both
            # the agent's multi-sentence turns and the candidate's rambling
            # answers get split across several segments this way.
            labels[index] = labels[index - 1] if index > 0 else "agent"

    return [{**item, "speaker": labels[index]} for index, item in enumerate(cleaned)]
