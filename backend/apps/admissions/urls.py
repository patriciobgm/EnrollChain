from django.urls import path
from rest_framework.routers import DefaultRouter

from .enrollment_api import EnrollmentViewSet, SectionViewSet, TrackConfigurationViewSet
from .reports import EnrollmentMetricsView, ReportsView
from .views import (
    AdmissionPeriodViewSet,
    ApplicationViewSet,
    DocumentViewSet,
    LearnerViewSet,
    ProgramViewSet,
    RequirementRuleViewSet,
    RequirementViewSet,
    SchoolYearViewSet,
)

router = DefaultRouter()
router.register("school-years", SchoolYearViewSet)
router.register("admission-periods", AdmissionPeriodViewSet)
router.register("programs", ProgramViewSet)
router.register("learners", LearnerViewSet)
router.register("applications", ApplicationViewSet)
router.register("requirements", RequirementViewSet)
router.register("requirement-rules", RequirementRuleViewSet)
router.register("documents", DocumentViewSet)
router.register("tracks", TrackConfigurationViewSet, basename="tracks")
router.register("sections", SectionViewSet, basename="sections")
router.register("enrollments", EnrollmentViewSet, basename="enrollments")
urlpatterns = router.urls + [
    path("enrollment-reports/", ReportsView.as_view(), name="enrollment-reports"),
    path("enrollment-metrics/", EnrollmentMetricsView.as_view(), name="enrollment-metrics"),
]
