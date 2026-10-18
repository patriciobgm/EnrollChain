from django.db import migrations


def forward(apps, schema_editor):
    Track = apps.get_model("admissions", "TrackConfiguration")
    Application = apps.get_model("admissions", "Application")
    Program = apps.get_model("admissions", "Program")
    for code, name, category, capacity in [
        ("ACADEMIC", "Academic", "ACADEMIC", 40),
        ("TECHNICAL_PROFESSIONAL", "Technical Professional", "TECHPRO", 25),
    ]:
        Track.objects.get_or_create(
            code=code,
            defaults={"name": name, "category": category, "default_section_capacity": capacity},
        )
    for program in Program.objects.filter(code=""):
        program.code = f"PROGRAM-{program.pk}"
        program.save(update_fields=["code"])
    Application.objects.filter(status="SUBMITTED", enrollment_status="DRAFT").update(
        enrollment_status="FOR_DOCUMENT_VERIFICATION"
    )


def reverse(apps, schema_editor):
    apps.get_model("admissions", "Application").objects.update(enrollment_status="DRAFT")
    # Preserve school configuration; reversing the schema removes newly introduced tables.


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0003_enrollmentevent_guidanceinterview_lisrecord_section_and_more")
    ]
    operations = [migrations.RunPython(forward, reverse)]
