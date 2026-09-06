"""Request/response contracts for the search endpoints.

ParseJdResponseDTO mirrors JD_parse_service's actual output shape field for
field — the model's SYSTEM_PROMPT in services/JD_Parse_service.py is the
source of truth for what these fields mean; this file is the source of truth
for what shape crosses the HTTP boundary. If the prompt changes what it
extracts, update both together.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator


class LenientListsBase(BaseModel):
    """The model sometimes returns `null` for a list field it considers
    empty, rather than `[]`, even though the prompt asks for empty arrays.
    Normalising here — once, for every array field on every nested object —
    is far more robust than special-casing individual fields as this drifts.
    """

    @model_validator(mode="before")
    @classmethod
    def _null_lists_to_empty(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        return {
            key: ([] if value is None and _field_expects_list(cls, key) else value)
            for key, value in data.items()
        }


def _field_expects_list(model: type[BaseModel], field_name: str) -> bool:
    field = model.model_fields.get(field_name)
    if field is None:
        return False
    return getattr(field.annotation, "__origin__", None) is list


class ParseJdRequestDTO(BaseModel):
    jd_text: str = Field(min_length=1)


class RoleDTO(LenientListsBase):
    title: str | None = None
    alternate_titles: list[str] = Field(default_factory=list)
    department: str | None = None
    team: str | None = None
    reports_to: str | None = None
    openings: int | None = None
    level: str | None = None


class CompanyDTO(LenientListsBase):
    name: str | None = None
    industry: str | None = None
    size_text: str | None = None
    size_min: int | None = None
    size_max: int | None = None
    stage: str | None = None
    description: str | None = None
    website: str | None = None


class LocationDTO(LenientListsBase):
    work_mode: str | None = None
    cities: list[str] = Field(default_factory=list)
    countries: list[str] = Field(default_factory=list)
    office_days: int | None = None
    relocation_offered: bool | None = None
    visa_sponsorship: bool | None = None
    timezone_requirement: str | None = None


class EmploymentDTO(LenientListsBase):
    type: str | None = None
    duration: str | None = None
    start_date: str | None = None
    notice_expectation: str | None = None
    shift: str | None = None
    travel_percent: int | None = None


class ExperienceDTO(LenientListsBase):
    min_years: int | None = None
    max_years: int | None = None
    domain_experience: list[str] = Field(default_factory=list)
    leadership_required: bool | None = None
    leadership_years: int | None = None


class SkillDTO(BaseModel):
    name: str
    category: str | None = None
    years: int | None = None
    evidence: str | None = None


class SkillsDTO(LenientListsBase):
    must_have: list[SkillDTO] = Field(default_factory=list)
    nice_to_have: list[SkillDTO] = Field(default_factory=list)


class EducationDTO(LenientListsBase):
    min_degree: str | None = None
    fields: list[str] = Field(default_factory=list)
    required: bool | None = None
    certifications: list[str] = Field(default_factory=list)


class LanguageRequirementDTO(BaseModel):
    language: str
    level: str | None = None


class CompensationDTO(BaseModel):
    currency: str | None = None
    min: int | None = None
    max: int | None = None
    period: str | None = None
    equity: str | None = None
    bonus: str | None = None
    variable_pay: str | None = None
    stated_in_jd: bool | None = None


class ScreeningSignalDTO(BaseModel):
    topic: str
    why: str
    ask: str


class MetaDTO(LenientListsBase):
    confidence: float | None = None
    assumptions: list[str] = Field(default_factory=list)
    ambiguities: list[str] = Field(default_factory=list)
    jd_quality: str | None = None
    extracted_at: str | None = None


class ParseJdResponseDTO(LenientListsBase):
    role: RoleDTO
    company: CompanyDTO
    location: LocationDTO
    employment: EmploymentDTO
    experience: ExperienceDTO
    skills: SkillsDTO
    responsibilities: list[str] = Field(default_factory=list)
    education: EducationDTO
    languages: list[LanguageRequirementDTO] = Field(default_factory=list)
    compensation: CompensationDTO | None = None
    benefits: list[str] = Field(default_factory=list)
    screening_signals: list[ScreeningSignalDTO] = Field(default_factory=list)
    knockouts: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)
    meta: MetaDTO
