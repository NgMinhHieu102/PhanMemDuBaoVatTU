"""Check disease cases distribution."""
from app.database import SessionLocal
from app.models.disease_case import DiseaseCase
from sqlalchemy import func


def main() -> None:
    db = SessionLocal()
    try:
        total = db.query(DiseaseCase).count()
        print(f"Total: {total}")
        rows = (
            db.query(
                DiseaseCase.disease_type,
                func.count(DiseaseCase.id).label("c"),
                func.min(DiseaseCase.recorded_at).label("from"),
                func.max(DiseaseCase.recorded_at).label("to"),
            )
            .group_by(DiseaseCase.disease_type)
            .all()
        )
        for r in rows:
            print(f"  {r.disease_type}: count={r.c}, range={r[2]} → {r[3]}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
