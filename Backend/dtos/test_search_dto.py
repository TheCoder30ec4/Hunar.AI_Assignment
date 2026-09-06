"""The model sometimes returns null for a list field it considers empty,
even though the prompt asks for []. This is the exact shape that produced a
502 in practice (experience.domain_experience came back null) — see
services/search_service.py's docstring for context.
"""

from dtos.search_dto import ExperienceDTO, ParseJdResponseDTO


def test_null_list_field_normalises_to_empty_list() -> None:
    experience = ExperienceDTO.model_validate({"min_years": 8, "domain_experience": None})
    assert experience.domain_experience == []


def test_explicit_empty_list_still_works() -> None:
    experience = ExperienceDTO.model_validate({"domain_experience": []})
    assert experience.domain_experience == []


def test_populated_list_field_is_untouched() -> None:
    experience = ExperienceDTO.model_validate({"domain_experience": ["fintech"]})
    assert experience.domain_experience == ["fintech"]


def test_full_response_with_several_null_lists() -> None:
    """Reproduces the exact failure: a real-shaped response with multiple
    list fields returned as null across different nested objects.
    """
    payload = {
        "role": {"title": "Staff Data Engineer", "level": "staff"},
        "company": {"industry": "fintech"},
        "location": {"work_mode": "remote_within_country", "cities": None, "countries": ["India"]},
        "employment": {},
        "experience": {"min_years": 8, "domain_experience": None},
        "skills": {"must_have": [{"name": "Spark"}], "nice_to_have": None},
        "responsibilities": None,
        "education": {},
        "languages": None,
        "compensation": None,
        "benefits": None,
        "screening_signals": None,
        "knockouts": None,
        "red_flags": None,
        "meta": {"confidence": 0.6, "assumptions": None, "ambiguities": None},
    }

    parsed = ParseJdResponseDTO.model_validate(payload)

    assert parsed.location.cities == []
    assert parsed.experience.domain_experience == []
    assert parsed.skills.nice_to_have == []
    assert parsed.responsibilities == []
    assert parsed.languages == []
    assert parsed.benefits == []
    assert parsed.screening_signals == []
    assert parsed.knockouts == []
    assert parsed.red_flags == []
    assert parsed.meta.assumptions == []
    assert parsed.skills.must_have[0].name == "Spark"
