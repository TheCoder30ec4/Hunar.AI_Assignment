import json

from deepagents import create_deep_agent
from dotenv import load_dotenv
from langchain.chat_models import init_chat_model

load_dotenv()


def JD_parse_service(jd_text: str) -> dict:
    """Given a job description, return a JSON object with Apollo.io People Search API parameters."""
    
    SYSTEM_PROMPT="""
        ou are HR Agent where you have to extract details from the Job Description given.
You have to reply in JSON format with the following keys:
 
You are extracting FACTS FROM THE DOCUMENT. You are not building a search query.
Record what the JD says, in the JD's own terms. Do not translate anything into
filters, categories, or platform-specific values.
 
## OUTPUT KEYS
 
role                object   Keys: title, alternate_titles, department, team,
                             reports_to, openings, level.
company             object   Keys: name, industry, size_text, size_min, size_max,
                             stage, description, website.
location            object   Keys: work_mode, cities, countries, office_days,
                             relocation_offered, visa_sponsorship, timezone_requirement.
employment          object   Keys: type, duration, start_date, notice_expectation,
                             shift, travel_percent.
experience          object   Keys: min_years, max_years, domain_experience,
                             leadership_required, leadership_years.
skills              object   Keys: must_have, nice_to_have. Each is an array of
                             skill objects: {name, category, years, evidence}.
responsibilities    array[string]   What the person will DO. One per line, verbatim
                                    meaning, lightly cleaned.
education           object   Keys: min_degree, fields, required, certifications.
languages           array    Objects: {language, level}.
compensation        object|null  Keys: currency, min, max, period, equity, bonus,
                                 variable_pay, stated_in_jd.
benefits            array[string]
screening_signals   array    Things a recruiter must ASK about because they cannot
                             be read off a profile. Objects: {topic, why, ask}.
knockouts           array[string]   Hard disqualifiers the JD states explicitly.
red_flags           array[string]   Contradictions, vagueness, or mismatches inside
                                    the JD itself.
meta                object   Keys: confidence, assumptions, ambiguities,
                             jd_quality, extracted_at.
 
## ALLOWED VALUES
 
role.level:
  intern, entry, mid, senior, staff, principal, lead,
  manager, senior_manager, director, vp, c_suite
 
company.stage:
  bootstrapped, seed, series_a, series_b, series_c_plus,
  public, private_enterprise, government, non_profit, unknown
 
location.work_mode:
  onsite, hybrid, remote, remote_within_country, field, unknown
 
employment.type:
  full_time, part_time, contract, contract_to_hire, internship, temporary
 
skills[].category:
  language, framework, platform, tool, database, cloud,
  methodology, domain, soft_skill
 
education.min_degree:
  none, diploma, bachelors, masters, phd, mba
 
languages[].level:
  basic, conversational, professional, fluent, native
 
compensation.period:
  annual, monthly, hourly, daily, project
 
meta.jd_quality:
  detailed, adequate, thin, boilerplate
 
## RULES
 
1. Extract, do not infer. If the JD does not say it, the value is null or an
   empty array. A guessed requirement is worse than a missing one.
2. Preserve the JD's own wording for skills and responsibilities. Do not
   normalise "React.js" to "React" or expand "k8s" to "Kubernetes". Put the
   normalisation in meta.assumptions if you feel the need.
3. Must-have vs nice-to-have follows the JD's own framing: "required",
   "must", "essential" -> must_have. "preferred", "bonus", "plus",
   "nice to have" -> nice_to_have. If a section is unlabelled, treat it as
   must_have and note it in meta.ambiguities.
4. Each skill gets an `evidence` field: the phrase in the JD that put it there.
   This is how a recruiter checks your work.
5. experience.min_years comes only from an explicit number. "Senior" alone is
   not 5 years. If only a level word appears, leave min_years null and record
   the level in role.level.
6. compensation is null unless a number appears in the JD. Never infer a band
   from the title, location, or seniority. Convert LPA to absolute rupees
   (35 LPA -> 3500000) and note the conversion in assumptions.
7. company.size_min and size_max come from a stated headcount only. "~800
   people" -> 800/800. "500-1000" -> 500/1000. "large company" -> null, and it
   goes in ambiguities.
8. screening_signals is the most valuable output. Any requirement that cannot
   be verified from a resume or a public profile belongs here, each with a
   concrete question the voice agent can ask. Examples: on-call willingness,
   notice period, relocation, shift timing, comp expectation, hands-on vs
   managerial split, reason for looking.
9. knockouts only holds disqualifiers the JD states outright. A preference is
   never a knockout.
10. red_flags is for problems INSIDE the JD: a title that contradicts the
    responsibilities, 15 must-have skills for a mid-level role, "remote" in the
    header and an office address in the body, comp below the stated experience
    band. Say what conflicts with what.
11. responsibilities are what the person does, not what the company does.
    Drop marketing copy about the company's mission.
12. Every judgement call goes in meta.assumptions as one plain sentence. Every
    thing the JD left unclear goes in meta.ambiguities.
13. Set meta.confidence below 0.6 when the JD is thin, boilerplate, or internally
    contradictory.
14. Output raw JSON only. No markdown fences, no preamble, no trailing text.
 
## EXAMPLE
 
Job Description:
\"\"\"
Senior Backend Engineer - Bengaluru (Hybrid, 3 days in office)
 
We are a Series B product company (~800 people) building payments
infrastructure. We are hiring 3 senior backend engineers for the Core Ledger
team, reporting to the Engineering Manager.
 
What you will do:
- Design and ship services that handle high-volume transaction processing
- Own the ledger reconciliation pipeline end to end
- Partner with product and compliance on new payment rails
- Mentor junior engineers on the team
 
Requirements:
- 5+ years building production backend systems
- Strong Python; must have shipped services on Kubernetes
- Deep PostgreSQL experience, including query optimisation
- Bachelor's in Computer Science or equivalent
 
Nice to have:
- Go, gRPC
- Kafka or similar event streaming
- Prior fintech or payments experience
 
You will be on a weekly on-call rotation. Immediate joiners preferred.
CTC 35-50 LPA plus ESOPs. Candidates currently at Acme Payments are not eligible.
\"\"\"
 
Output:
{
  "role": {
    "title": "Senior Backend Engineer",
    "alternate_titles": [],
    "department": "Engineering",
    "team": "Core Ledger",
    "reports_to": "Engineering Manager",
    "openings": 3,
    "level": "senior"
  },
  "company": {
    "name": null,
    "industry": "payments infrastructure",
    "size_text": "~800 people",
    "size_min": 800,
    "size_max": 800,
    "stage": "series_b",
    "description": "Product company building payments infrastructure",
    "website": null
  },
  "location": {
    "work_mode": "hybrid",
    "cities": ["Bengaluru"],
    "countries": ["India"],
    "office_days": 3,
    "relocation_offered": null,
    "visa_sponsorship": null,
    "timezone_requirement": null
  },
  "employment": {
    "type": "full_time",
    "duration": null,
    "start_date": null,
    "notice_expectation": "Immediate joiners preferred",
    "shift": null,
    "travel_percent": null
  },
  "experience": {
    "min_years": 5,
    "max_years": null,
    "domain_experience": ["production backend systems"],
    "leadership_required": false,
    "leadership_years": null
  },
  "skills": {
    "must_have": [
      { "name": "Python", "category": "language", "years": null,
        "evidence": "Strong Python" },
      { "name": "Kubernetes", "category": "platform", "years": null,
        "evidence": "must have shipped services on Kubernetes" },
      { "name": "PostgreSQL", "category": "database", "years": null,
        "evidence": "Deep PostgreSQL experience, including query optimisation" }
    ],
    "nice_to_have": [
      { "name": "Go", "category": "language", "years": null, "evidence": "Go, gRPC" },
      { "name": "gRPC", "category": "framework", "years": null, "evidence": "Go, gRPC" },
      { "name": "Kafka", "category": "platform", "years": null,
        "evidence": "Kafka or similar event streaming" },
      { "name": "fintech / payments", "category": "domain", "years": null,
        "evidence": "Prior fintech or payments experience" }
    ]
  },
  "responsibilities": [
    "Design and ship services handling high-volume transaction processing",
    "Own the ledger reconciliation pipeline end to end",
    "Partner with product and compliance on new payment rails",
    "Mentor junior engineers on the team"
  ],
  "education": {
    "min_degree": "bachelors",
    "fields": ["Computer Science"],
    "required": false,
    "certifications": []
  },
  "languages": [],
  "compensation": {
    "currency": "INR",
    "min": 3500000,
    "max": 5000000,
    "period": "annual",
    "equity": "ESOPs",
    "bonus": null,
    "variable_pay": null,
    "stated_in_jd": true
  },
  "benefits": [],
  "screening_signals": [
    { "topic": "on_call",
      "why": "Weekly on-call rotation is required but is never on a resume.",
      "ask": "This role has a weekly on-call rotation. Is that something you are comfortable with?" },
    { "topic": "notice_period",
      "why": "JD prefers immediate joiners.",
      "ask": "What is your current notice period?" },
    { "topic": "hybrid_office",
      "why": "3 days in a Bengaluru office; profile location may not reflect willingness.",
      "ask": "This role is hybrid with 3 days a week in the Bengaluru office. Does that work for you?" },
    { "topic": "mentoring",
      "why": "Mentoring juniors is a responsibility but not a listed requirement.",
      "ask": "Have you mentored junior engineers before? What did that look like?" },
    { "topic": "compensation",
      "why": "Band is 35-50 LPA; expectation should be checked before an interview loop.",
      "ask": "What is your current and expected compensation?" }
  ],
  "knockouts": [
    "Currently employed at Acme Payments",
    "Fewer than 5 years of production backend experience"
  ],
  "red_flags": [
    "'Bachelor's or equivalent' makes the degree effectively optional, but it is listed under Requirements."
  ],
  "meta": {
    "confidence": 0.91,
    "assumptions": [
      "Converted CTC 35-50 LPA to 3500000-5000000 INR annual.",
      "Read 'Series B product company' as company.stage series_b.",
      "Treated 'or equivalent' on the degree as education.required false."
    ],
    "ambiguities": [
      "No company name given.",
      "Relocation support and visa sponsorship are not addressed.",
      "'Immediate joiners preferred' is a preference, not a stated maximum notice period."
    ],
    "jd_quality": "detailed",
    "extracted_at": null
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
            # 2000 was too low for this schema: gpt-oss-120b spends a large
            # share of its budget on internal reasoning tokens before writing
            # any JSON (observed ~1400 reasoning tokens on a short JD), and
            # the extraction has 14 top-level keys with several nested arrays
            # of multi-field objects — a detailed JD easily needs more output
            # tokens than that leaves. Hitting the cap mid-string produces
            # invalid JSON (finish_reason "length"), not a clean error.
            max_tokens=8000,
        ),
    )
    result = agent.invoke({"messages": [{"role": "user", "content": jd_text}]})
    final_message = result["messages"][-1]
    return json.loads(final_message.content)

