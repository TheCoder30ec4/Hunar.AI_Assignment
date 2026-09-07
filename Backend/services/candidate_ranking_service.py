"""Ranks a candidate against a JD by keyword overlap only — no embeddings.
Groq (the only LLM key this app has) has zero embedding models (confirmed
live against its own /v1/models list), so ranking and its explanation are
the same computation: which of the JD's must-have/nice-to-have skill terms
turn up in the candidate's own text. That overlap list IS the explanation
shown on click, not a separately generated summary of a black-box score.
"""

from __future__ import annotations

import re

from dtos.search_dto import ParseJdResponseDTO

_WORD = re.compile(r"[a-z0-9+#.]+")

# Must-have terms count for more of the score than nice-to-have — a
# candidate missing every required skill but matching all the nice-to-haves
# should not outrank one hitting the required list.
MUST_HAVE_WEIGHT = 0.7
NICE_TO_HAVE_WEIGHT = 0.3


def _tokenise(text: str) -> set[str]:
    return set(_WORD.findall(text.lower()))


def rank_candidate(*, candidate_text: str, spec: ParseJdResponseDTO) -> tuple[float, list[str]]:
    """Returns (match_score in [0, 1], matched_keyword_terms)."""
    candidate_tokens = _tokenise(candidate_text)

    must_have = [s.name for s in spec.skills.must_have]
    nice_to_have = [s.name for s in spec.skills.nice_to_have]

    matched_must = [name for name in must_have if _tokenise(name) <= candidate_tokens]
    matched_nice = [name for name in nice_to_have if _tokenise(name) <= candidate_tokens]

    must_score = len(matched_must) / len(must_have) if must_have else 1.0
    nice_score = len(matched_nice) / len(nice_to_have) if nice_to_have else 1.0

    score = must_score * MUST_HAVE_WEIGHT + nice_score * NICE_TO_HAVE_WEIGHT
    return round(score, 4), [*matched_must, *matched_nice]


def _self_check() -> None:
    from dtos.search_dto import CompanyDTO, EducationDTO, EmploymentDTO, ExperienceDTO
    from dtos.search_dto import LocationDTO, MetaDTO, RoleDTO, SkillDTO, SkillsDTO

    spec = ParseJdResponseDTO(
        role=RoleDTO(),
        company=CompanyDTO(),
        location=LocationDTO(),
        employment=EmploymentDTO(),
        experience=ExperienceDTO(),
        skills=SkillsDTO(
            must_have=[SkillDTO(name="Python"), SkillDTO(name="SQL")],
            nice_to_have=[SkillDTO(name="Kubernetes")],
        ),
        education=EducationDTO(),
        meta=MetaDTO(),
    )
    score, matched = rank_candidate(
        candidate_text="Senior Python engineer with strong SQL background.", spec=spec
    )
    assert matched == ["Python", "SQL"], matched
    assert abs(score - 0.7) < 1e-6, score

    empty_spec_score, empty_matched = rank_candidate(candidate_text="anything", spec=spec.model_copy(
        update={"skills": SkillsDTO(must_have=[], nice_to_have=[])}
    ))
    assert empty_matched == []
    assert empty_spec_score == 1.0


if __name__ == "__main__":
    _self_check()
    print("ok")
