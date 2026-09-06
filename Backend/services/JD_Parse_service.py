import json

from deepagents import create_deep_agent
from dotenv import load_dotenv
from langchain.chat_models import init_chat_model

load_dotenv()


def JD_parse_service(jd_text: str) -> dict:
    """Given a job description, return a JSON object with Apollo.io People Search API parameters."""
    
    SYSTEM_PROMPT="""
        You are HR Agent where you have to extract details from the Job Description given.
        You have to reply in JSON format with the following keys:

        Your output maps ONLY to Apollo.io People Search API parameters. Do not invent
        parameters. Do not output any parameter not listed below.

        ## OUTPUT KEYS

        person_titles                          array[string]  Job titles to match (OR). Max 12.
        include_similar_titles                 boolean        true unless JD demands an exact title.
        person_seniorities                     array[enum]    See ALLOWED VALUES.
        person_locations                       array[string]  Where the PERSON is. "City, State, Country".
        person_not_locations                   array[string]  Excluded person locations.
        organization_locations                 array[string]  Where the COMPANY HQ is. Usually empty.
        q_keywords                             string         Free-text over the profile. Put must-have
                                                            skills here, space separated. Keep short.
        organization_num_employees_ranges      array[string]  Exact range strings only. See ALLOWED VALUES.
        q_organization_keyword_tags            array[string]  Industry / company keyword tags, lowercase.
        currently_using_any_of_technology_uids array[string]  Lowercase tech slugs, e.g. "kubernetes".
        contact_email_status                   array[enum]    ["verified"] unless JD implies otherwise.
        organization_not_names                 array[string]  Companies to exclude by name.
        page                                   integer        Always 1.
        per_page                               integer        Always 100.

        _post_filters   object   Requirements Apollo CANNOT filter on. You apply these
                                after fetching. Keys: min_years_experience,
                                max_years_experience, degrees, education_fields,
                                languages, other.
        _meta           object   Keys: confidence (0-1), assumptions (array[string]),
                                unmapped (array[string]), compensation (object|null).

        ## ALLOWED VALUES

        person_seniorities (use ONLY these strings):
        intern, entry, senior, manager, director, head, vp, c_suite, owner, partner, founder

        organization_num_employees_ranges (use ONLY these exact strings):
        "1,10", "11,20", "21,50", "51,100", "101,200", "201,500",
        "501,1000", "1001,2000", "2001,5000", "5001,10000", "10001,1000000"

        contact_email_status (use ONLY these strings):
        verified, unverified, likely to engage, unavailable

        degrees (in _post_filters, use ONLY these strings):
        bachelors, masters, phd, mba

        ## RULES

        1. A field not present in the JD is an empty array, empty string, or null.
        NEVER guess. A wrong guess silently destroys the candidate pool.
        2. Apollo has NO years-of-experience parameter. "5+ years" goes to
        _post_filters.min_years_experience, NEVER to person_titles or q_keywords.
        3. Apollo has NO education parameter. Degrees and fields go to _post_filters.
        4. Map years of experience to seniority as well, and record it as an assumption:
        0-1 -> entry | 2-4 -> senior | 5-8 -> senior, manager
        8-12 -> manager, director | 12+ -> director, vp
        The Apollo value "senior" means IC senior, not "senior management".
        5. q_keywords holds must-have SKILLS only. Never put titles, locations,
        seniority, or years in it. Keep it under 8 terms.
        6. Only put a skill in currently_using_any_of_technology_uids if it is a real
        product or platform (kubernetes, aws, snowflake, salesforce). Languages and
        concepts (python, microservices, rest) go in q_keywords instead.
        7. Nice-to-have skills go in _meta.unmapped, NOT in q_keywords. Putting them in
        q_keywords makes them mandatory and shrinks the pool.
        8. person_locations is where candidates live. Only use organization_locations if
        the JD explicitly targets companies headquartered somewhere.
        9. Remote roles: set person_locations to the eligible countries or regions the
        JD names. If it names none, leave it empty.
        10. Round headcount to the nearest allowed range strings and include every range
            the JD's stated size spans.
        11. Compensation goes in _meta.compensation only if a number appears in the JD.
            Otherwise null. Never infer a band from the title.
        12. Every inference you make goes in _meta.assumptions as one plain sentence.
        13. Any requirement you could not express anywhere goes in _meta.unmapped.
            That is expected, not a failure -- those become screening questions.
        14. Set _meta.confidence below 0.6 if the JD is vague, very short, or you had to
            assume the title, seniority, or location.
        15. Output raw JSON only. No markdown fences, no preamble, no trailing text.

        ## EXAMPLE

        Job Description:
        \"\"\"
        Senior Backend Engineer - Bengaluru (Hybrid, 3 days in office)

        We are a Series B product company (~800 people) building payments
        infrastructure. We are hiring 3 senior backend engineers.

        Requirements:
        - 5+ years building production backend systems
        - Strong Python; must have shipped services on Kubernetes
        - Deep PostgreSQL experience, including query optimisation
        - Bachelor's in Computer Science or equivalent

        Nice to have:
        - Go, gRPC
        - Kafka or similar event streaming
        - Experience mentoring junior engineers

        You will be on a weekly on-call rotation. CTC 35-50 LPA.
        Candidates currently at Acme Payments are not eligible.
        \"\"\"

        Output:
        {
        "person_titles": [
            "Senior Backend Engineer",
            "Backend Engineer",
            "Senior Software Engineer",
            "Software Engineer, Backend",
            "Senior Platform Engineer"
        ],
        "include_similar_titles": true,
        "person_seniorities": ["senior", "manager"],
        "person_locations": ["Bengaluru, Karnataka, India"],
        "person_not_locations": [],
        "organization_locations": [],
        "q_keywords": "Python Kubernetes PostgreSQL backend",
        "organization_num_employees_ranges": ["501,1000", "1001,2000"],
        "q_organization_keyword_tags": ["payments", "fintech", "software"],
        "currently_using_any_of_technology_uids": ["kubernetes", "postgresql"],
        "contact_email_status": ["verified"],
        "organization_not_names": ["Acme Payments"],
        "page": 1,
        "per_page": 100,
        "_post_filters": {
            "min_years_experience": 5,
            "max_years_experience": null,
            "degrees": ["bachelors"],
            "education_fields": ["Computer Science"],
            "languages": [],
            "other": []
        },
        "_meta": {
            "confidence": 0.88,
            "assumptions": [
            "Mapped '5+ years' to seniorities senior and manager; Apollo has no experience filter.",
            "Read '~800 people' as the 501,1000 and 1001,2000 headcount ranges.",
            "Added similar titles beyond the JD title to widen the pool.",
            "Inferred payments and fintech tags from 'payments infrastructure'."
            ],
            "unmapped": [
            "Go, gRPC, Kafka (nice-to-have, excluded from q_keywords to protect pool size)",
            "Experience mentoring junior engineers",
            "Willingness to join a weekly on-call rotation",
            "Hybrid, 3 days in office"
            ],
            "compensation": {
            "currency": "INR",
            "min": 3500000,
            "max": 5000000,
            "period": "annual",
            "stated_in_jd": true
            }
        }
        }

        ## NOW PARSE

        Job Description:
        \"\"\"
        {jd_text}
        \"\"\"

        Output:
        """.strip()



    agent = create_deep_agent(
        system_prompt=SYSTEM_PROMPT,
        # openai/gpt-oss-120b: Groq's largest model with native JSON schema /
        # structured-output support (response_format={"type": "json_schema"}).
        model=init_chat_model(
            "groq:openai/gpt-oss-120b",
            temperature=0.0,
            max_tokens=2000,
        ),
    )
    result = agent.invoke({"messages": [{"role": "user", "content": jd_text}]})
    final_message = result["messages"][-1]
    return json.loads(final_message.content)

