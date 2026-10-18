from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .administration import Page20
from .models import Notification, User


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "title", "link", "created_at", "read_at"]
        read_only_fields = fields


class UnreadCountSerializer(serializers.Serializer):
    unread = serializers.IntegerField()


class NotificationUpdateSerializer(serializers.Serializer):
    updated = serializers.IntegerField(required=False)
    deleted = serializers.IntegerField(required=False)


class NotificationViewSet(mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = Page20

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Notification.objects.none()
        return Notification.objects.filter(recipient=self.request.user)

    @extend_schema(responses=UnreadCountSerializer)
    @action(detail=False, methods=["get"])
    def count(self, request):
        return Response({"unread": self.get_queryset().filter(read_at__isnull=True).count()})

    @extend_schema(request=None, responses=NotificationSerializer)
    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        notification = self.get_object()
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at"])
        return Response(self.get_serializer(notification).data)

    @extend_schema(request=None, responses=NotificationUpdateSerializer)
    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        count = self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response({"updated": count})

    @extend_schema(responses=NotificationUpdateSerializer)
    @action(detail=False, methods=["delete"], url_path="clear")
    def clear(self, request):
        count, _ = self.get_queryset().delete()
        return Response({"deleted": count})

    @extend_schema(responses=NotificationUpdateSerializer)
    @action(detail=False, methods=["delete"], url_path="clear-read")
    def clear_read(self, request):
        count, _ = self.get_queryset().filter(read_at__isnull=False).delete()
        return Response({"deleted": count})


def notify_for_record(instance, action, request):
    """Private in-app notices. Never copy document names or interview remarks."""
    from apps.admissions.models import Application, DocumentSubmission

    titles = {
        "DOCUMENT_PROGRESS_UPDATED": "Learner Ready for Guidance Interview",
        "SUBMIT_APPLICATION": "New Application Submitted",
        "UPLOAD_DOCUMENT": "Document Ready for Review",
        "RESUBMIT_DOCUMENT": "Replacement Document Uploaded",
        "DOCUMENT_VERIFIED": "Document Verified",
        "DOCUMENT_REJECTED": "Document Rejected",
        "DOCUMENT_RESUBMISSION_REQUESTED": "Document Correction Requested",
        "LEARNER_QUALIFIED": "Application Qualified",
        "LEARNER_NOT_QUALIFIED": "Application Evaluation Updated",
        "PRE_ENROLLMENT_CONFIRMED": "Pre-enrollment Confirmed",
        "SECTION_AUTO_ASSIGNED": "Section Assigned",
        "SECTION_MANUALLY_ASSIGNED": "Section Assigned",
        "SECTION_TRANSFERRED": "Section Updated",
        "OFFICIAL_ENROLLMENT_CONFIRMED": "Official Enrollment Confirmed",
        "LIS_PREPARE": "Ready for LIS Registration",
        "LIS_SUBMIT": "LIS Submission Recorded",
        "LIS_REJECT": "LIS Processing Requires Attention",
        "GUIDANCE_INTERVIEW_COMPLETED": "Guidance Interview Completed",
        "LEARNER_REJECTED": "Application Decision Updated",
        "SECTION_REMOVED": "Section Assignment Updated",
        "NO_AVAILABLE_SECTION": "Waiting for a Section",
    }
    if action not in titles:
        return
    app = (
        instance
        if isinstance(instance, Application)
        else instance.application
        if isinstance(instance, DocumentSubmission)
        else None
    )
    if app is None:
        return
    recipients = set()
    if action == "DOCUMENT_PROGRESS_UPDATED":
        if app.enrollment_status != "FOR_EVALUATION":
            return
        for user in User.objects.filter(role="GUIDANCE_OFFICER", is_active=True):
            if user.has_perm("admissions.complete_interview"):
                recipients.add(user.pk)
    elif action in {"SUBMIT_APPLICATION", "UPLOAD_DOCUMENT", "RESUBMIT_DOCUMENT"}:
        for user in User.objects.filter(role="REGISTRAR", is_active=True):
            if user.has_perm("admissions.view_application") and user.has_perm(
                "admissions.view_documentsubmission"
            ):
                recipients.add(user.pk)
    elif app.learner.owner_id:
        recipients.add(app.learner.owner_id)
    if action in {"SECTION_AUTO_ASSIGNED", "SECTION_MANUALLY_ASSIGNED", "SECTION_TRANSFERRED"}:
        assignment = getattr(app, "section_assignment", None)
        if assignment and assignment.section.adviser_id:
            recipients.add(assignment.section.adviser_id)
    if action in {"PRE_ENROLLMENT_CONFIRMED", "OFFICIAL_ENROLLMENT_CONFIRMED"}:
        for user in User.objects.filter(role="ADMINISTRATOR", is_active=True):
            if user.has_perm("admissions.view_application"):
                recipients.add(user.pk)
    actor = getattr(request, "user", None)
    recipients.discard(getattr(actor, "pk", None))
    roles = dict(User.objects.filter(pk__in=recipients, is_active=True).values_list("pk", "role"))
    Notification.objects.bulk_create(
        [
            Notification(
                recipient_id=recipient,
                title=titles[action],
                link=(
                    "/enrollments/"
                    if roles[recipient] in {"GUIDANCE_OFFICER", "CLASS_ADVISER"}
                    else "/applications/"
                )
                + str(app.pk),
            )
            for recipient in roles
        ]
    )
