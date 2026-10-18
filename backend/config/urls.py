from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.security import SecurityTokenRefreshSerializer
from apps.accounts.views import AuditedTokenObtainPairView, LogoutView
from apps.audit.api import AuditViewSet
from apps.blockchain_records.api import BlockchainViewSet
from apps.common.views import HealthView

urlpatterns = [
    path("api/v1/health/", HealthView.as_view(), name="health"),
    path("api/v1/auth/token/", AuditedTokenObtainPairView.as_view(), name="token-obtain"),
    path(
        "api/v1/auth/token/refresh/",
        TokenRefreshView.as_view(serializer_class=SecurityTokenRefreshSerializer),
        name="token-refresh",
    ),
    path("api/v1/auth/logout/", LogoutView.as_view(), name="logout"),
    path("api/v1/", include("apps.admissions.urls")),
    path("api/v1/accounts/", include("apps.accounts.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]


audit_router = DefaultRouter()
audit_router.register("audit-events", AuditViewSet, basename="audit-events")
audit_router.register("blockchain-records", BlockchainViewSet, basename="blockchain-records")
urlpatterns += [path("api/v1/", include(audit_router.urls))]
