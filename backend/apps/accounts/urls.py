from django.urls import path
from rest_framework.routers import DefaultRouter

from .administration import (
    AccessPolicyView,
    ApplicantDirectoryViewSet,
    DashboardView,
    ManagedUserViewSet,
    SystemView,
)
from .notifications import NotificationViewSet
from .security_views import SecurityView
from .views import CurrentUserView

urlpatterns = [
    path("access-policy/", AccessPolicyView.as_view(), name="access-policy"),
    path("security/", SecurityView.as_view(), name="account-security"),
    path("me/", CurrentUserView.as_view(), name="current-user"),
]


router = DefaultRouter()
router.register("notifications", NotificationViewSet, basename="notifications")
router.register("directory", ApplicantDirectoryViewSet, basename="applicant-directory")
router.register("users", ManagedUserViewSet, basename="managed-user")
urlpatterns += [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("system/", SystemView.as_view(), name="system-status"),
]
urlpatterns += router.urls
