"""The model does not always follow the OUTPUT KEYS spec exactly: a list
field it considers empty sometimes comes back null instead of [], and a
range stated in the JD ("25-40 percent") sometimes lands directly in a
single-int field instead of being split across a min/max pair. Both shapes
produced a real 502 in practice — see services/search_service.py's
docstring for context.
"""

from dtos.search_dto import EmploymentDTO, ExperienceDTO, ParseJdResponseDTO, SkillDTO


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


def test_percent_range_string_in_int_field_takes_leading_number() -> None:
    """Reproduces the exact 502: employment.travel_percent came back as the
    string "25-40%" instead of an int, because the JD stated a range and the
    field has no separate min/max pair to split it across.
    """
    employment = EmploymentDTO.model_validate({"travel_percent": "25-40%"})
    assert employment.travel_percent == 25


def test_years_range_string_without_percent_sign() -> None:
    skill = SkillDTO.model_validate({"name": "Python", "years": "5-10"})
    assert skill.years == 5


def test_plain_int_field_is_untouched() -> None:
    employment = EmploymentDTO.model_validate({"travel_percent": 30})
    assert employment.travel_percent == 30


def test_non_numeric_string_in_int_field_becomes_none_not_a_crash() -> None:
    employment = EmploymentDTO.model_validate({"travel_percent": "extensive"})
    assert employment.travel_percent is None
