from rest_framework.routers import DefaultRouter

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
urlpatterns = router.urls
