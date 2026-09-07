"""stream_parse_jd_service fabricates progress stages while the real parse
runs concurrently in the background. The one behaviour worth locking down:
a parse that finishes early must not be held hostage waiting for the rest
of the fake progress script to play out.
"""

from unittest.mock import AsyncMock, patch

import pytest

from dtos.search_dto import (
    CompanyDTO,
    EducationDTO,
    EmploymentDTO,
    ExperienceDTO,
    LocationDTO,
    MetaDTO,
    ParseJdRequestDTO,
    ParseJdResponseDTO,
    RoleDTO,
    SkillsDTO,
)
from services.search_service import JdParseFailedError, stream_parse_jd_service

_FAKE_RESULT = ParseJdResponseDTO(
    role=RoleDTO(title="Test Role"),
    company=CompanyDTO(),
    location=LocationDTO(),
    employment=EmploymentDTO(),
    experience=ExperienceDTO(),
    skills=SkillsDTO(),
    education=EducationDTO(),
    meta=MetaDTO(confidence=0.9),
)


async def _collect(request: ParseJdRequestDTO) -> list[str]:
    return [event async for event in stream_parse_jd_service(request)]


@pytest.mark.anyio
async def test_ends_with_exactly_one_result_event() -> None:
    with patch("services.search_service.parse_jd_service", new=AsyncMock(return_value=_FAKE_RESULT)):
        events = await _collect(ParseJdRequestDTO(jd_text="anything"))

    assert events[-1].startswith('data: {"type":"result"')
    assert sum(1 for e in events if '"type":"result"' in e) == 1


@pytest.mark.anyio
async def test_an_early_finish_does_not_wait_for_the_full_progress_script() -> None:
    """The real parse can finish before every scripted progress stage has
    fired — the stream must stop waiting and emit the result immediately
    rather than holding it hostage to the fake script's timing.
    """
    with patch("services.search_service.parse_jd_service", new=AsyncMock(return_value=_FAKE_RESULT)):
        events = await _collect(ParseJdRequestDTO(jd_text="anything"))

    progress_count = sum(1 for e in events if '"type":"progress"' in e)
    # _PROGRESS_SCRIPT has 4 stages; an instantly-resolved mock should short
    # -circuit well before all of them fire.
    assert progress_count < 4


@pytest.mark.anyio
async def test_parse_failure_yields_exactly_one_error_event() -> None:
    """The first scripted stage fires unconditionally (it's due at t=0, so
    there's nothing to wait on before checking the task) even for a parse
    that fails instantly — a harmless one-frame flash of "Reading job
    description…" before the error, not a bug. What must hold is that a
    failure produces exactly one error event and nothing after it.
    """
    with patch(
        "services.search_service.parse_jd_service",
        new=AsyncMock(side_effect=JdParseFailedError()),
    ):
        events = await _collect(ParseJdRequestDTO(jd_text="anything"))

    assert events[-1].startswith('data: {"type":"error"')
    assert sum(1 for e in events if '"type":"error"' in e) == 1


@pytest.mark.anyio
async def test_progress_events_are_well_formed_sse() -> None:
    with patch("services.search_service.parse_jd_service", new=AsyncMock(return_value=_FAKE_RESULT)):
        events = await _collect(ParseJdRequestDTO(jd_text="anything"))

    for event in events:
        assert event.startswith("data: ")
        assert event.endswith("\n\n")
