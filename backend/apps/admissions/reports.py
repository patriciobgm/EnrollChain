"""A single filtered dataset powers JSON, CSV and PDF early-enrollment reports."""

import csv
from io import BytesIO
from xml.sax.saxutils import escape

from django.db.models import Case, CharField, Count, ExpressionWrapper, F, FloatField, Value, When
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.sorting import ordered

from .enrollment_api import filter_applications, scoped_applications
from .enrollment_services import authorize
from .models import Section, TrackConfiguration
from .services import audit, checklist

REPORTS = {
    "early-enrollment": "Early Enrollment Master List",
    "by-track": "Enrollment by Track",
    "by-program": "Enrollment by Cluster / Strand",
    "by-section": "Enrollment by Section",
    "section-master": "Section Master List",
    "section-utilization": "Section Capacity / Utilization",
    "unassigned": "Unassigned Learners",
    "pending-documents": "Pending Document Verification",
    "pre-enrolled": "Pre-Enrolled Learners",
    "for-lis": "Learners for LIS Registration",
    "lis-confirmed": "LIS Confirmed Learners",
    "status-summary": "Registration Status Summary",
}


def enrollment_rows(queryset):
    for app in queryset:
        docs = [entry for entry in checklist(app) if entry["is_required"]]
        verified = sum(entry["review_status"] == "VERIFIED" for entry in docs)
        assignment = getattr(app, "section_assignment", None)
        lis = getattr(app, "lis_record", None)
        yield {
            "Reference": app.reference,
            "LRN": app.learner.lrn or "",
            "Learner": str(app.learner),
            "Sex": app.learner.sex,
            "Grade": app.grade_level,
            "Classification": app.get_classification_display(),
            "Track": app.track,
            "Program": app.program.name if app.program else "",
            "Section": assignment.section.name if assignment else "",
            "Enrollment status": app.enrollment_status,
            "Documents": f"{verified}/{len(docs)} verified",
            "LIS status": lis.status if lis else "NOT_READY",
        }


def report_data(kind, request):
    from rest_framework.exceptions import ValidationError

    if kind not in REPORTS:
        raise ValidationError({"report": "Choose a supported early enrollment report."})
    queryset = filter_applications(
        scoped_applications(request),
        {k: v for k, v in request.query_params.items() if k != "ordering"},
    ).exclude(status="DRAFT")
    paginator = None
    page_number = 1
    count = 0

    def window(records):
        nonlocal paginator, page_number, count
        count = records.count()
        if request.query_params.get("export"):
            return records
        from rest_framework.pagination import PageNumberPagination

        paginator = PageNumberPagination()
        paginator.page_size = 20
        page = paginator.paginate_queryset(records, request)
        page_number = paginator.page.number
        return page

    if kind in {"section-master", "section-utilization"}:
        sections = (
            Section.objects.select_related("track", "program", "school_year")
            .annotate(assigned=Count("assignments"))
            .annotate(
                available=F("capacity") - F("assigned"),
                utilization=ExpressionWrapper(
                    F("assigned") * 100.0 / F("capacity"), output_field=FloatField()
                ),
            )
        )
        sections = sections.annotate(
            section_status=Case(
                When(active=False, then=Value("INACTIVE")),
                When(assigned__gte=F("capacity"), then=Value("FULL")),
                default=Value("AVAILABLE"),
                output_field=CharField(),
            )
        )
        for key in ["school_year", "grade_level", "track", "program", "section"]:
            value = request.query_params.get(key)
            if value:
                if key != "track" and not value.isdigit():
                    raise ValidationError({key: "Use a numeric identifier."})
                sections = sections.filter(**{"pk" if key == "section" else key: value})
        rows = [
            {
                "Section code": section.code,
                "Section": section.name,
                "School year": section.school_year.name,
                "Grade": section.grade_level,
                "Track": section.track.name,
                "Program": section.program.name,
                "Capacity": section.capacity,
                "Assigned": section.assigned,
                "Available": section.capacity - section.assigned,
                "Utilization %": round(section.assigned * 100 / section.capacity, 1),
                "Status": "INACTIVE"
                if not section.active
                else "FULL"
                if section.assigned >= section.capacity
                else "AVAILABLE",
            }
            for section in window(
                ordered(
                    sections,
                    request.query_params,
                    {
                        "Section code": "code",
                        "Section": "name",
                        "School year": "school_year__name",
                        "Grade": "grade_level",
                        "Track": "track__name",
                        "Program": "program__name",
                        "Capacity": "capacity",
                        "Assigned": "assigned",
                        "Available": "available",
                        "Utilization %": "utilization",
                        "Status": "section_status",
                    },
                    "Section code",
                )
            )
        ]
    elif kind in {"by-track", "by-program", "by-section", "status-summary"}:
        column, field = {
            "by-track": ("Track", "track"),
            "by-program": ("Program", "program__name"),
            "by-section": ("Section", "section_assignment__section__name"),
            "status-summary": ("Enrollment status", "enrollment_status"),
        }[kind]
        totals = queryset.order_by().values(field).annotate(total=Count("pk")).order_by(field)
        sort = request.query_params.get("ordering", column)
        if sort.removeprefix("-") not in {column, "Learners"}:
            raise ValidationError({"ordering": "Choose a report column."})
        totals = totals.order_by(
            ("-" if sort.startswith("-") else "")
            + ("total" if sort.removeprefix("-") == "Learners" else field),
            field,
        )
        rows = [
            {column: row[field] or "Unassigned", "Learners": row["total"]} for row in window(totals)
        ]

    else:
        if kind == "unassigned":
            queryset = queryset.filter(
                section_assignment__isnull=True, enrollment_status="PRE_ENROLLED"
            )
        elif kind == "pending-documents":
            queryset = queryset.filter(
                enrollment_status__in=["SUBMITTED", "FOR_DOCUMENT_VERIFICATION", "FOR_RESUBMISSION"]
            )
        elif kind == "pre-enrolled":
            queryset = queryset.filter(
                enrollment_status__in=["PRE_ENROLLED", "SECTION_ASSIGNED", "FOR_LIS_REGISTRATION"]
            )
        elif kind == "for-lis":
            queryset = queryset.filter(lis_record__status__in=["READY_FOR_LIS", "SUBMITTED_TO_LIS"])
        elif kind == "lis-confirmed":
            queryset = queryset.filter(lis_record__status="LIS_CONFIRMED")
        rows = list(
            enrollment_rows(
                window(
                    ordered(
                        queryset,
                        request.query_params,
                        {
                            "Reference": "reference",
                            "LRN": "learner__lrn",
                            "Learner": "learner__last_name",
                            "Sex": "learner__sex",
                            "Grade": "grade_level",
                            "Classification": "classification",
                            "Track": "track",
                            "Program": "program__name",
                            "Section": "section_assignment__section__name",
                            "Enrollment status": "enrollment_status",
                            "LIS status": "lis_record__status",
                        },
                        "Learner",
                    )
                )
            )
        )
    return {
        "title": REPORTS[kind],
        "generated_at": timezone.now().isoformat(),
        "count": count,
        "columns": list(rows[0]) if rows else [],
        "rows": rows,
        "page": page_number,
        "page_size": 20,
    }


def csv_cell(value):
    text = str(value)
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else text


def export_report(data, kind, file_format):
    if file_format == "csv":
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response.write("\ufeff")
        writer = csv.writer(response)
        writer.writerow(data["columns"])
        for row in data["rows"]:
            writer.writerow([csv_cell(row[column]) for column in data["columns"]])
    else:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A3, landscape
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle

        buffer = BytesIO()
        styles = getSampleStyleSheet()
        style = styles["BodyText"]
        style.fontSize = 7
        style.leading = 9
        content = [
            Paragraph("Sto. Domingo National Trade School", styles["Heading1"]),
            Paragraph(escape(data["title"]), styles["Heading2"]),
            Paragraph(
                "Early enrollment monitoring. "
                "Official enrollment requires recorded LIS confirmation.",
                style,
            ),
            Paragraph(escape(data["generated_at"]), style),
            Spacer(1, 12),
        ]
        if data["rows"]:
            cells = [[Paragraph(escape(str(value)), style) for value in data["columns"]]]
            cells += [
                [Paragraph(escape(str(row[column])), style) for column in data["columns"]]
                for row in data["rows"]
            ]
            table = LongTable(
                cells,
                repeatRows=1,
                colWidths=[(landscape(A3)[0] - 60) / len(data["columns"])] * len(data["columns"]),
            )
            table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8efff")),
                        ("GRID", (0, 0), (-1, -1), 0.3, colors.lightgrey),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ]
                )
            )
            content.append(table)
        else:
            content.append(Paragraph("No records match these filters.", style))
        SimpleDocTemplate(buffer, pagesize=landscape(A3), leftMargin=30, rightMargin=30).build(
            content
        )
        response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{kind}.{file_format}"'
    response["Cache-Control"] = "private, no-store"
    return response


class ReportSerializer(serializers.Serializer):
    title = serializers.CharField()
    generated_at = serializers.DateTimeField()
    count = serializers.IntegerField()
    columns = serializers.ListField(child=serializers.CharField())
    rows = serializers.ListField(child=serializers.DictField())
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()


class ReportsView(APIView):
    @extend_schema(
        parameters=[
            OpenApiParameter("page", int),
            OpenApiParameter("grade_level", int, enum=[11, 12]),
            OpenApiParameter("classification", str, enum=["NEW", "RETURNING", "TRANSFEREE"]),
            OpenApiParameter("report", str, enum=list(REPORTS)),
            OpenApiParameter("export", str, enum=["csv", "pdf"]),
        ],
        responses=ReportSerializer,
    )
    def get(self, request):
        authorize(request, {"REGISTRAR", "ADMINISTRATOR"}, "view_enrollment_reports")
        kind = request.query_params.get("report", "early-enrollment")
        data = report_data(kind, request)
        file_format = request.query_params.get("export")
        if file_format not in {None, "csv", "pdf"}:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"export": "Choose csv or pdf."})
        audit(
            request.user,
            "EXPORT_ENROLLMENT_REPORT" if file_format else "VIEW_ENROLLMENT_REPORT",
            request,
            {"report": kind, "row_count": data["count"]},
        )
        return export_report(data, kind, file_format) if file_format else Response(data)


class EnrollmentMetricsView(APIView):
    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        queryset = scoped_applications(request).exclude(status="DRAFT")
        queryset = filter_applications(queryset, request.query_params).order_by()
        statuses = dict(
            queryset.values("enrollment_status")
            .annotate(total=Count("pk"))
            .values_list("enrollment_status", "total")
        )
        tracks = dict(
            queryset.values("track").annotate(total=Count("pk")).values_list("track", "total")
        )
        categories = {
            category: sum(
                count
                for code, count in tracks.items()
                if TrackConfiguration.objects.filter(code=code, category=category).exists()
            )
            for category in ["ACADEMIC", "TECHPRO"]
        }
        sections = Section.objects.annotate(assigned=Count("assignments")).order_by("code")
        if request.user.role == "LEARNER":
            sections = sections.filter(assignments__application__learner__owner=request.user)
        elif request.user.role == "CLASS_ADVISER":
            sections = sections.filter(adviser=request.user)
        elif request.user.role == "GUIDANCE_OFFICER":
            sections = sections.none()
        return Response(
            {
                "total": queryset.count(),
                "categories": categories,
                "statuses": statuses,
                "tracks": tracks,
                "unassigned": queryset.filter(
                    enrollment_status="PRE_ENROLLED", section_assignment__isnull=True
                ).count(),
                "lis": dict(
                    queryset.values("lis_record__status")
                    .annotate(total=Count("pk"))
                    .values_list("lis_record__status", "total")
                ),
                "sections": [
                    {
                        "id": section.pk,
                        "name": section.name,
                        "capacity": section.capacity,
                        "assigned": section.assigned,
                    }
                    for section in sections
                ],
            }
        )
