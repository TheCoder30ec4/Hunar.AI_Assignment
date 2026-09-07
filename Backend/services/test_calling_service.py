"""The two pure transforms in the calling pipeline that can silently corrupt
data: mapping an agent's free-text answer onto call_answers' exactly-one-
value_* columns (a DB CHECK constraint enforces exactly one), and inferring
speaker turns from Whisper segments (Whisper does no diarisation).
"""

from services.calling_service import _to_answer_columns
from services.transcription_service import _attribute_speakers


def test_exactly_one_value_column_is_always_set() -> None:
    """ck_call_answers_exactly_one_value rejects a row with zero or two
    values — every branch must produce exactly one."""
    cases = [
        ("interested", "Yes"),
        ("qualified", "no"),
        ("notice_period", "60 days"),
        ("experience_years", "5"),
        ("expected_ctc", "₹42L"),
        ("summary", "Candidate confirmed availability"),
        ("technical_skills", "unknown"),
        ("recommendation", "hire_now"),
    ]
    for key, raw in cases:
        columns = _to_answer_columns(key, raw)
        assert len(columns) == 1, f"{key}={raw!r} produced {columns}"


def test_booleans_parse_both_ways() -> None:
    assert _to_answer_columns("interested", "Yes") == {"value_bool": True}
    assert _to_answer_columns("interested", "no") == {"value_bool": False}


def test_unknown_boolean_falls_back_to_text() -> None:
    """The agent returns "unknown" constantly — that must not become False."""
    assert _to_answer_columns("interested", "unknown") == {"value_text": "unknown"}


def test_notice_period_converts_units_to_days() -> None:
    assert _to_answer_columns("notice_period", "60 days") == {"value_duration_days": 60}
    assert _to_answer_columns("notice_period", "2 months") == {"value_duration_days": 60}
    assert _to_answer_columns("notice_period", "3 weeks") == {"value_duration_days": 21}


def test_empty_answer_never_produces_an_empty_value() -> None:
    assert _to_answer_columns("summary", "") == {"value_text": "unknown"}


def test_agent_script_lines_are_labelled_agent() -> None:
    """Lines drawn from the agent's own prompt must never be attributed to
    the candidate — that inversion is what made an earlier pause-based
    heuristic unusable on a real call."""
    segments = [
        {"start": 0.0, "end": 4.0, "text": "Hi, am I speaking with Varun? This is Neha."},
        {"start": 6.0, "end": 6.5, "text": "Yes."},
        {"start": 8.0, "end": 12.0, "text": "Would you be interested in hearing more?"},
        {"start": 14.0, "end": 15.0, "text": "Yes, I am interested."},
        {"start": 17.0, "end": 21.0, "text": "Thanks for sharing that Varun."},
    ]
    assert [s["speaker"] for s in _attribute_speakers(segments)] == [
        "agent",
        "candidate",
        "agent",
        "candidate",
        "agent",
    ]


def test_candidate_answers_are_not_swallowed_into_the_agent_turn() -> None:
    """A real answer after a real pause is the candidate, even though the
    preceding line was the agent."""
    segments = [
        {"start": 0.0, "end": 3.0, "text": "Could you please tell me your notice period?"},
        {"start": 5.0, "end": 7.0, "text": "I would take at least 30 days."},
    ]
    assert [s["speaker"] for s in _attribute_speakers(segments)] == ["agent", "candidate"]


def test_wrapped_agent_sentence_stays_with_the_agent() -> None:
    """Whisper splits one spoken sentence across segments; a sub-second gap
    after an agent line is a continuation, not a reply."""
    segments = [
        {"start": 0.0, "end": 3.0, "text": "The role I'm calling about is an apprenticeship"},
        {"start": 3.2, "end": 6.0, "text": "It involves Python, JavaScript and databases."},
    ]
    assert [s["speaker"] for s in _attribute_speakers(segments)] == ["agent", "agent"]


def test_first_line_is_always_the_agent() -> None:
    """The agent delivers the introduction, so it always opens."""
    segments = [{"start": 0.0, "end": 2.0, "text": "Something unscripted."}]
    assert _attribute_speakers(segments)[0]["speaker"] == "agent"


def test_short_answers_are_attributed_to_the_candidate() -> None:
    """Bare replies carry no scripted phrasing, so without explicit patterns
    they inherit the agent's label — measured wrong on a real call."""
    segments = [
        {"start": 0.0, "end": 4.0, "text": "Lastly, what would be the best day to reach you?"},
        {"start": 4.0, "end": 5.0, "text": "Maybe next Tuesday."},
        {"start": 5.0, "end": 8.0, "text": "Thank you, Varun. What time on Tuesday works best?"},
        {"start": 8.0, "end": 9.0, "text": "Morning, 8 o'clock."},
    ]
    assert [s["speaker"] for s in _attribute_speakers(segments)] == [
        "agent",
        "candidate",
        "agent",
        "candidate",
    ]


def test_timing_is_not_used_for_attribution() -> None:
    """Whisper emits contiguous segments across speaker changes — measured
    gaps at real turn boundaries were 0-819ms, the same as within a turn. Two
    identical transcripts with wildly different timings must label the same.
    """
    texts = [
        "Would you be interested in hearing more?",
        "Yes, I am interested.",
        "Thanks for sharing that Varun.",
    ]
    tight = [{"start": i * 1.0, "end": i * 1.0 + 1.0, "text": t} for i, t in enumerate(texts)]
    loose = [{"start": i * 30.0, "end": i * 30.0 + 5.0, "text": t} for i, t in enumerate(texts)]
    assert [s["speaker"] for s in _attribute_speakers(tight)] == [
        s["speaker"] for s in _attribute_speakers(loose)
    ] == ["agent", "candidate", "agent"]


def test_phone_normalisation_matches_provider_echo() -> None:
    """The bug this guards: candidates stored as "+91 6305741824" never
    matched Hunar's echoed "+916305741824", so no call_attempt row was
    created and the candidate sat at 'queued' forever with no error.
    """
    from services.hunar_call_service import normalise_phone

    stored = "+91 6305741824"
    echoed = "+916305741824"
    assert normalise_phone(stored) == normalise_phone(echoed) == "+916305741824"


def test_phone_normalisation_strips_common_formatting() -> None:
    from services.hunar_call_service import normalise_phone

    for raw in ["+91-630-574-1824", "+91 (630) 574 1824", " +916305741824 "]:
        assert normalise_phone(raw) == "+916305741824"


def test_phone_normalisation_handles_missing_values() -> None:
    from services.hunar_call_service import normalise_phone

    assert normalise_phone(None) == ""
    assert normalise_phone("") == ""
