"""Static, callable people. Both contact providers are blocked on the current
accounts (Apollo: Free plan 403; Enrich.so phone lookup: 500 credits vs a
~97 balance — both confirmed live), so the calling side of the product has
nothing real to dial. These rows exist so campaigns can be built and called
end to end now; the provider code stays intact and takes over the moment a
key with access lands in .env. Marked raw_profile.seed=true so they're
distinguishable from provider-sourced rows. Numbers are deliberately
non-routable test patterns, not real people's phones.
"""

from __future__ import annotations

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.default_tenant import DEFAULT_ORG_ID
from models.candidates import Candidate

SEED_PEOPLE: list[dict] = [
    {"full_name": "Ravi Krishnan", "current_title": "Senior Backend Engineer", "current_company": "Razorpay",
     "location_text": "Bengaluru, India", "phone_e164": "+919000000101", "email": "ravi.krishnan@example.com",
     "about": "Senior backend engineer building payments and ledger systems in Python, Go and Kubernetes. PostgreSQL, Kafka, AWS."},
    {"full_name": "Anita Sharma", "current_title": "Staff Engineer, Platform", "current_company": "Swiggy",
     "location_text": "Bengaluru, India", "phone_e164": "+919000000102", "email": "anita.sharma@example.com",
     "about": "Platform engineering lead. Kubernetes, Terraform, Go, Python, observability, SRE practices, distributed systems."},
    {"full_name": "Devansh Patel", "current_title": "Backend Engineer II", "current_company": "Zerodha",
     "location_text": "Bengaluru, India", "phone_e164": "+919000000103", "email": "devansh.patel@example.com",
     "about": "Backend engineer on trading systems. Python, Django, PostgreSQL, Redis, low-latency APIs, SQL tuning."},
    {"full_name": "Meera Joshi", "current_title": "Senior SDE, Payments", "current_company": "PhonePe",
     "location_text": "Bengaluru, India", "phone_e164": "+919000000104", "email": "meera.joshi@example.com",
     "about": "Payments backend in Java and Python. Microservices, Kafka, SQL, machine learning for fraud detection."},
    {"full_name": "Sneha Rao", "current_title": "Data Scientist", "current_company": "Freshworks",
     "location_text": "Chennai, India", "phone_e164": "+919000000105", "email": "sneha.rao@example.com",
     "about": "Data scientist: Python, SQL, machine learning, scikit-learn, TensorFlow, NLP, experimentation and analytics."},
    {"full_name": "Karthik Menon", "current_title": "ML Engineer", "current_company": "Groww",
     "location_text": "Bengaluru, India", "phone_e164": "+919000000106", "email": "karthik.menon@example.com",
     "about": "Machine learning engineer. Python, PyTorch, TensorFlow, SQL, MLOps, model serving on Kubernetes, AWS SageMaker."},
    {"full_name": "Priya Balan", "current_title": "Senior Data Analyst", "current_company": "Juspay",
     "location_text": "Bengaluru, India", "phone_e164": "+919000000107", "email": "priya.balan@example.com",
     "about": "Data analyst: SQL, Python, Pandas, Power BI, Tableau, dashboards, A/B testing, statistics."},
    {"full_name": "Aditya Nair", "current_title": "Frontend Engineer", "current_company": "Flipkart",
     "location_text": "Bengaluru, India", "phone_e164": "+919000000108", "email": "aditya.nair@example.com",
     "about": "Frontend engineer: React, TypeScript, Next.js, performance, design systems, accessibility."},
]


def _slug(full_name: str) -> str:
    return "seed-" + full_name.lower().replace(" ", "-")


async def ensure_seed_candidates(db: AsyncSession) -> None:
    """Idempotent: re-running updates the seed rows in place, never duplicates."""
    for person in SEED_PEOPLE:
        about = person["about"]
        values = {
            "org_id": DEFAULT_ORG_ID,
            "full_name": person["full_name"],
            "headline": f"{person['current_title']} at {person['current_company']}",
            "current_title": person["current_title"],
            "current_company": person["current_company"],
            "location_text": person["location_text"],
            "phone_e164": person["phone_e164"],
            "email": person["email"],
            "email_verified": True,
            "linkedin_url": None,
            "linkedin_slug": _slug(person["full_name"]),
            "raw_profile": {"seed": True, "about": about},
        }
        stmt = pg_insert(Candidate).values(**values).on_conflict_do_update(
            constraint="uq_candidates_org_linkedin_slug",
            set_={k: v for k, v in values.items() if k not in ("org_id", "linkedin_slug")},
        )
        await db.execute(stmt)
